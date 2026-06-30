# Deployment Guide — Lexora AI

**Model:** Private deployment per law firm (default)  
**Edge proxy:** Caddy  
**Packaging:** Docker Compose

---

## 1. Deployment Philosophy

Each law firm receives an **isolated deployment** containing:

| Component | Isolation |
|-----------|-----------|
| PostgreSQL | Dedicated database |
| Document storage | Dedicated MinIO bucket or S3 bucket |
| Vector store | Dedicated Qdrant collections |
| Search | Dedicated OpenSearch indices |
| Email connectors | Firm OAuth credentials |
| Audit logs | Firm-local, append-only |
| AI config | Firm model preferences |
| Backups | Firm-specific schedule and destination |
| Domain | `lexora.clientfirm.co.za` or subdomain |

The codebase supports a **future hosted multi-tenant** edition without architectural rewrite.

---

## 2. Standard Private Stack

```yaml
# deploy/docker-compose.yml (conceptual)
services:
  lexora-web:
    build: ./apps/web
    ports: ["127.0.0.1:8100:3000"]
    depends_on: [postgres, redis, minio]
    networks: [lexora_internal, infra_shared, ai-models_default]

  lexora-worker:
    build: ./apps/worker
    depends_on: [postgres, redis, minio, qdrant, opensearch]
    networks: [lexora_internal, infra_shared, ai-models_default]

  opensearch:
    image: opensearchproject/opensearch:2
    # Dedicated to this deployment

  # postgres, redis, minio: embedded OR external
```

### 2.1 Deployment Sizes

| Tier | Firms | RAM | Notes |
|------|-------|-----|-------|
| Small | 1–5 users | 16 GB | 7B–14B models |
| Medium | 5–25 users | 32–64 GB | 14B–32B models |
| Large | 25+ users | 64–128 GB | Dedicated inference |

---

## 3. Caddy Configuration

Caddy sits in front of all public services.

### 3.1 Single-Firm Snippet

```caddyfile
lexora.clientfirm.co.za {
    encode gzip

    reverse_proxy 127.0.0.1:8100 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Optional: rate limit, IP allowlist for firm office
}
```

### 3.2 Routes

| Path | Backend | Exposed |
|------|---------|---------|
| `/` | lexora-web | Public (auth required) |
| `/api/*` | lexora-web | Public (auth required) |
| MinIO console | Separate subdomain | Admin only |
| Worker dashboard | Internal | Never public |

Reference: [Caddy reverse proxy docs](https://caddyserver.com/docs/quick-starts/reverse-proxy)

---

## 4. Environment Variables

```bash
# deploy/.env.example

# App
NODE_ENV=production
APP_URL=https://lexora.clientfirm.co.za
FIRM_NAME="Smith & Partners Inc."
FIRM_JURISDICTION=ZA

# Database
DATABASE_URL=postgresql://lexora_app:***@postgres:5432/lexora

# Redis
REDIS_URL=redis://:***@redis:6379/3

# MinIO / S3
S3_ENDPOINT=http://minio:9000
S3_BUCKET=lexora-docs
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION_PREFIX=lexora_

# OpenSearch
OPENSEARCH_URL=http://opensearch:9200
OPENSEARCH_INDEX_PREFIX=lexora_

# AI
OLLAMA_BASE_URL=http://ollama:11434/v1
OLLAMA_TEXT_MODEL=qwen2.5:32b
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_TIMEOUT_MS=300000
AI_MAX_CONCURRENCY=1

# Auth (Better Auth)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://lexora.clientfirm.co.za

# Email (Phase 6)
# GMAIL_CLIENT_ID=
# M365_CLIENT_ID=
```

---

## 5. Provisioning Script

```bash
#!/usr/bin/env bash
# scripts/provision-firm.sh <firm_slug>

FIRM=$1

# Postgres
/home/ubuntu/infra/scripts/create-app-db.sh "lexora_${FIRM}"

# MinIO bucket (via mc CLI)
mc mb "local/lexora-${FIRM}-docs"

# Qdrant collections
QDRANT_URL=http://localhost:6333 \
  COLLECTION_PREFIX="lexora_${FIRM}_" \
  ./scripts/setup-qdrant-collections.sh

# OpenSearch indices
./scripts/setup-opensearch-indices.sh "${FIRM}"

# Copy env template
cp deploy/.env.example "deploy/.env.${FIRM}"
```

---

## 6. APZ Shared Server (Development)

When deploying on the shared `apztdg.com` host alongside ApzAnalyse:

**Live:** https://lexora.apztdg.com (Caddy TLS → `127.0.0.1:8100`)

Deploy: `bash scripts/provision.sh && bash scripts/deploy.sh`

### 6.1 Resource Allocation

| Resource | Value | Status |
|----------|-------|--------|
| Postgres DB | `lexora` | Provisioned |
| Redis DB | `3` | Allocated (0–2 taken by other apps) |
| MinIO bucket | `lexora` | Created |
| Qdrant collections | `lexora_*` | Created (does not touch `knowledge_*`) |
| Host port | `8100` | Bound to `lexora-web` |
| Subdomain | `lexora.apztdg.com` | Active in Caddy |
| Ollama | Shared | `AI_MAX_CONCURRENCY=1` |
| Monitoring | Shared infra | Prometheus `:9090`, Grafana `:3001` |

### 6.2 Networks

```yaml
networks:
  infra_shared:
    external: true
  ai-models_default:
    external: true
  lexora_internal:
    driver: bridge
```

### 6.3 Do Not Disrupt

- `apzanalyse-*` containers (port 8090)
- `infra-*` shared services
- `ollama`, `qdrant` containers
- Existing Postgres DBs: `apzanalyse`, `apzcode`, `demo`
- Caddy routes for live apps
- **Always use `-p lexora`** (or `name: lexora` in compose) — never `docker compose` from `deploy/` without a project name (collides with ApzAnalyse)

### 6.4 OpenSearch on Shared Host

OpenSearch is not currently in shared infra. Options:

1. Add `opensearch` service to Lexora's compose only (recommended)
2. Extend shared infra later if multiple apps need it

---

## 7. Backup Strategy

| Asset | Method | Frequency |
|-------|--------|-----------|
| PostgreSQL | `pg_dump` encrypted | Daily |
| MinIO | Bucket replication / sync | Daily |
| Qdrant | Snapshot API | Weekly |
| OpenSearch | Snapshot repository | Weekly |
| Audit logs | Included in Postgres dump | Daily |
| Config / env | Secrets manager / encrypted vault | On change |

Restore runbook required per deployment (Phase 9).

---

## 8. Health Checks

```
GET /api/health

{
  "status": "ok",
  "checks": {
    "postgres": "ok",
    "redis": "ok",
    "minio": "ok",
    "qdrant": "ok",
    "opensearch": "ok",
    "ollama": "ok"
  },
  "version": "0.1.0"
}
```

Admin console displays deployment health dashboard.

---

## 9. Upgrade Path

1. Pull new container images
2. Run Drizzle migrations
3. Rolling restart web → worker
4. Reindex if schema changes require (background job)
5. Verify `/api/health`

Zero-downtime not required for private deployments in early phases; schedule maintenance window.

---

## 10. Future Hosted SaaS

When offering multi-tenant hosted Lexora:

- Shared Postgres with RLS
- Shared Qdrant/OpenSearch with org prefixes
- Subdomain tenancy: `{firm}.lexora.ai`
- Separate encryption keys per org (envelope encryption)
- Billing meter per org

Private deployment compose remains available for firms requiring on-prem / dedicated VM.
