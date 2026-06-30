# Security & Access Control — Lexora AI

**Classification:** Law firm sensitive — attorney-client privilege, POPIA alignment  
**Default posture:** Private deployment, deny-by-default

---

## 1. Security Principles

1. **Isolation** — no cross-firm data access
2. **Least privilege** — matter-scoped permissions
3. **Audit everything** — sensitive actions are immutable logged
4. **Human gates** — AI cannot send email or mark citations verified without human action
5. **Encryption** — at rest where possible; TLS in transit always
6. **Private by default** — no public document URLs without auth

---

## 2. Authentication (Better Auth)

### 2.1 Phase 2+ Features

| Feature | Phase |
|---------|-------|
| Email + password | Phase 2 |
| Session management | Phase 2 |
| Organisation (firm) model | Phase 2 |
| 2FA (TOTP) | Phase 2–3 |
| Passkeys (WebAuthn) | Phase 3 |
| SSO (SAML/OIDC) | Phase 10+ |

Reference: [Better Auth documentation](https://www.better-auth.com/docs)

### 2.2 Session Policy

- HttpOnly secure cookies
- Session rotation on privilege change
- Configurable idle timeout (default 8 hours)
- Force logout all sessions (admin action)
- Login history table (IP, user agent, timestamp)

---

## 3. Role-Based Access Control

### 3.1 Firm Roles

| Role | Description |
|------|-------------|
| Firm Owner | Full firm control, billing, deletion |
| Firm Admin | Users, settings, no firm deletion |
| Partner | All matters, approvals, billing review |
| Attorney | Assigned matters, full matter work |
| Candidate Attorney | Supervised access, limited approvals |
| Paralegal | Documents, discovery, tasks |
| Secretary | Calendar, correspondence, filing |
| Billing Admin | Time, rates, invoices |
| Compliance Officer | Audit logs, read-only broad access |
| External Counsel | Specific matter(s) only |
| Client Viewer | Read-only client portal (optional) |
| System Admin | Deployment ops (not firm data) |

### 3.2 Permission Matrix (Summary)

| Action | Partner | Attorney | Paralegal | Secretary | Billing | Client |
|--------|---------|----------|-----------|-----------|---------|--------|
| View matter | ✓ | Assigned | Assigned | Assigned | Billing | Own |
| Upload document | ✓ | ✓ | ✓ | ✓ | — | — |
| Delete document | ✓ | ✓* | — | — | — | — |
| AI chat on matter | ✓ | ✓ | ✓ | — | — | — |
| Approve citation | ✓ | ✓ | — | — | — | — |
| Send email | ✓ | ✓** | — | ✓** | — | — |
| Approve time entry | ✓ | — | — | — | ✓ | — |
| View audit logs | ✓ | — | — | — | — | — |
| Admin settings | Admin+ | — | — | — | — | — |

\* With matter lead permission  
\*\* Requires workflow approval before send

---

## 4. Matter-Level Permissions

Beyond roles, matters support:

- **Assigned lawyers** — explicit list with role on matter
- **Matter lead** — approval authority
- **Restricted matters** — explicit allow-list only
- **Chinese walls** — conflict check flags (Phase 8+)

Permissions checked on every API request:

```
user → firm membership → role → matter assignment → document ACL
```

---

## 5. Document-Level Permissions

Optional per-document ACL:

- Inherit from matter (default)
- Restrict to subset of matter team
- External share link (expiring, password, audit) — Phase 8+

---

## 6. AI Security

| Rule | Enforcement |
|------|-------------|
| Matter scope | Agent retrieves only matter-linked + firm corpus per policy |
| No invented citations | Citation engine labels all claims |
| Unverified ≠ verified | UI cannot display verified without human approval |
| Prompt injection defence | System prompts + chunk sanitisation |
| Audit AI sessions | Every query/response logged with user + matter |
| Model isolation | Private Ollama default; no data to external models without firm opt-in |

---

## 7. Email Security

- OAuth tokens encrypted at rest (AES-256-GCM)
- Send requires workflow approval record
- Draft AI emails marked `DRAFT_AI` until approved
- Attachment scan hook (ClamAV optional, Phase 6+)
- Full audit: read, draft, approve, send, delete

---

## 8. Audit Logging

### 8.1 Logged Events

- Login / logout / failed login
- Matter create / archive / permission change
- Document upload / view / download / delete
- AI query and response (reference IDs, not full model weights)
- Citation approve / reject
- Email import / draft / approve / send
- Workflow status change
- Time entry create / edit / approve
- Admin setting change
- User invite / role change

### 8.2 Audit Record Schema

```typescript
{
  id: uuid
  organisation_id: uuid
  user_id: uuid | null
  action: string          // e.g. 'document.view'
  entity_type: string     // e.g. 'document'
  entity_id: uuid
  matter_id: uuid | null
  metadata: jsonb         // non-sensitive context
  ip_address: string
  user_agent: string
  created_at: timestamptz // immutable, no updates
}
```

Audit logs are **append-only**. No DELETE for compliance roles except System Admin export-and-archive workflows.

---

## 9. Data Protection (POPIA Considerations)

| Requirement | Implementation |
|-------------|----------------|
| Lawful processing | Firm agreement + client mandates stored per matter |
| Purpose limitation | AI trained only on firm corpus; no cross-firm learning |
| Security safeguards | RBAC, encryption, private deployment |
| Data subject access | Export matter data (Phase 8) |
| Retention | Configurable per document class |
| Breach notification | Admin alert hooks (Phase 9) |

Consult legal counsel for firm-specific POPIA compliance statements.

---

## 10. Network Security

### Private Deployment

- Caddy TLS termination (Let's Encrypt or firm cert)
- Internal services not exposed publicly
- MinIO, Postgres, Redis on private network only
- Optional IP allowlist for firm office egress

### Shared Dev Server

- Bind app to `127.0.0.1` only
- Caddy as sole public ingress
- Qdrant currently on `0.0.0.0:6333` — firewall or rebind for production

---

## 11. Secrets Management

| Secret | Storage |
|--------|---------|
| `BETTER_AUTH_SECRET` | Env / vault |
| Database passwords | Env / vault |
| MinIO keys | Env / vault |
| Email OAuth refresh tokens | Encrypted DB column |
| Backup encryption keys | Vault / HSM (enterprise) |

Never commit secrets. `.env` in `.gitignore`.

---

## 12. Security Testing Checklist (Pre-Production)

- [ ] Auth bypass attempts on all API routes
- [ ] Matter IDOR tests (user A cannot access user B's matter)
- [ ] Document direct URL access without session
- [ ] AI prompt injection with malicious document content
- [ ] Email send without approval workflow
- [ ] Audit log tampering attempts
- [ ] Rate limiting on login and AI endpoints
- [ ] CORS restricted to app origin
