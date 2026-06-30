#!/usr/bin/env bash
# Deploy Lexora AI to apztdg.com (lexora.apztdg.com via Caddy TLS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f $ROOT/deploy/docker-compose.yml -p lexora"
CADDYFILE="/etc/caddy/Caddyfile"
CADDY_SNIPPET="$ROOT/deploy/caddy/lexora.caddy"
MARKER="# Lexora AI — lexora.apztdg.com"

log() { echo "[deploy] $*"; }

# ── Prerequisites ─────────────────────────────────────────────────────────────
[[ -f "$ROOT/.env" ]] || {
  log "No .env — running provision first..."
  bash "$ROOT/scripts/provision.sh"
}

# Verify port 8100 is free or already ours
if ss -tlnp 2>/dev/null | grep -q ':8100 '; then
  if ! docker ps --format '{{.Names}}' | grep -qx 'lexora-web'; then
    echo "Port 8100 is in use by another process — choose a different port."
    ss -tlnp | grep 8100
    exit 1
  fi
  log "Port 8100 already bound to lexora-web."
fi

# ── Build & start (does not touch other containers) ───────────────────────────
log "Building lexora-web..."
$COMPOSE build

log "Starting lexora-web on 127.0.0.1:8100..."
$COMPOSE up -d --force-recreate --remove-orphans

# ── Health check ──────────────────────────────────────────────────────────────
log "Waiting for health..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8100/api/health >/dev/null 2>&1; then
    log "Health check passed (localhost:8100)."
    break
  fi
  if [[ $i -eq 30 ]]; then
    log "Health check timed out."
    $COMPOSE logs --tail=50
    exit 1
  fi
  sleep 3
done

# ── Caddy TLS ─────────────────────────────────────────────────────────────────
if [[ -f "$CADDYFILE" ]]; then
  if grep -q 'lexora.apztdg.com' "$CADDYFILE"; then
    log "Caddy block for lexora.apztdg.com already present."
  else
    log "Adding Caddy block for lexora.apztdg.com..."
    sudo tee -a "$CADDYFILE" > /dev/null <<EOF

$MARKER
$(grep -v '^#' "$CADDY_SNIPPET" | grep -v '^$')
EOF
  fi
  log "Validating and reloading Caddy..."
  sudo caddy validate --config "$CADDYFILE"
  sudo systemctl reload caddy
else
  log "Warning: $CADDYFILE not found — add deploy/caddy/lexora.caddy manually."
fi

# ── Verify HTTPS ──────────────────────────────────────────────────────────────
sleep 2
if curl -sfI https://lexora.apztdg.com/api/health >/dev/null 2>&1; then
  log "HTTPS live: https://lexora.apztdg.com"
else
  log "HTTPS not yet reachable (DNS/TLS may still be provisioning)."
  log "Local: http://127.0.0.1:8100"
fi

log "Done. Other apps (ApzAnalyse :8090, etc.) were not modified."
