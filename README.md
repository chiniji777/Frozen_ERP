# Nut Office ERP System

## Stack

- **Backend**: Hono + Bun + Drizzle ORM + SQLite (libsql)
- **Frontend**: React + Vite + TailwindCSS
- **Runtime**: Bun (required — uses Bun-specific APIs)

## Deployment — VPS Only

Production runs on VPS with Bun runtime. **Vercel is not supported** (Bun APIs, local SQLite, and bundle size are incompatible with serverless).

- **Production URL**: https://frozen.mhorkub.com
- **VPS**: Vultr (45.76.187.89)
- **Process Manager**: systemd (`frozen-erp.service`)

### Deploy

```bash
# On VPS — pull latest + build + restart
./scripts/deploy.sh

# Or specify branch
BRANCH=task/feature-x ./scripts/deploy.sh
```

### First-time Setup

```bash
# 1. Clone repo
git clone https://github.com/chiniji777/Frozen_ERP.git /opt/frozen-erp

# 2. Install dependencies
cd /opt/frozen-erp && bun install && cd frontend && bun install && cd ..

# 3. Build frontend
cd frontend && bun run build && cd ..

# 4. Install systemd service
sudo cp scripts/frozen-erp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable frozen-erp
sudo systemctl start frozen-erp
```

### Rollback

Deploy script auto-rolls back on failed health check. Manual rollback:

```bash
cd /opt/frozen-erp
git log --oneline -5          # find target commit
git reset --hard <commit>
sudo systemctl restart frozen-erp
```

### Database Backups

Deploy script auto-backs up `data/erp.db` before each deploy (keeps last 10). Manual backup:

```bash
cp /opt/frozen-erp/data/erp.db /opt/frozen-erp/backups/erp_manual_$(date +%Y%m%d).db
```

## Development

```bash
# Backend (port 4001)
bun run dev

# Frontend (port 5173)
cd frontend && bun run dev
```
