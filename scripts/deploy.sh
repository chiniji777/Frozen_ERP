#!/usr/bin/env bash
# Frozen ERP — VPS Deploy Script
# Usage: ./scripts/deploy.sh
# Runs on VPS (45.76.187.89) with Bun runtime

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/frozen-erp}"
SERVICE_NAME="${SERVICE_NAME:-frozen-erp}"
REPO_URL="https://github.com/chiniji777/Frozen_ERP.git"
BRANCH="${BRANCH:-main}"
BACKUP_DIR="${APP_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

log() { echo "[deploy] $(date '+%H:%M:%S') $*"; }

# --- Pre-flight checks ---
command -v bun >/dev/null 2>&1 || { log "ERROR: bun not found"; exit 1; }
command -v git >/dev/null 2>&1 || { log "ERROR: git not found"; exit 1; }

log "Starting deploy — branch: $BRANCH"

# --- Backup database ---
if [ -f "$APP_DIR/data/erp.db" ]; then
  mkdir -p "$BACKUP_DIR"
  cp "$APP_DIR/data/erp.db" "$BACKUP_DIR/erp_${TIMESTAMP}.db"
  log "DB backed up → backups/erp_${TIMESTAMP}.db"
  # Keep last 10 backups
  ls -t "$BACKUP_DIR"/erp_*.db 2>/dev/null | tail -n +11 | xargs -r rm --
fi

# --- Pull latest code ---
cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
log "Code updated to $(git rev-parse --short HEAD)"

# --- Install dependencies ---
bun install
cd frontend && bun install && cd ..
log "Dependencies installed"

# --- Build frontend ---
cd frontend && bun run build && cd ..
log "Frontend built"

# --- Restart service ---
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  sudo systemctl restart "$SERVICE_NAME"
  log "Service restarted via systemd"
elif command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$SERVICE_NAME" 2>/dev/null || pm2 start bun --name "$SERVICE_NAME" -- run src/server.ts
  log "Service restarted via pm2"
else
  log "WARNING: No process manager found. Start manually: bun run src/server.ts"
  exit 1
fi

# --- Health check ---
sleep 2
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/api/health 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  log "Health check PASSED ✓"
else
  log "ERROR: Health check FAILED (HTTP $HTTP_STATUS)"
  log "Rolling back..."
  git reset --hard HEAD~1
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    sudo systemctl restart "$SERVICE_NAME"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME"
  fi
  log "Rolled back to previous version"
  exit 1
fi

log "Deploy complete ✓ — $(git log --oneline -1)"
