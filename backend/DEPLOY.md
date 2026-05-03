# EmbedSim VPS Deploy Runbook

End-to-end, copy/paste commands to provision a fresh Ubuntu 22.04 VPS, deploy
the backend, and wire up the GitHub Actions auto-deploy workflow
(`.github/workflows/deploy.yml`).

> Frontend is built and hosted by Lovable. This runbook covers the
> **backend** (Express API + Bull worker + Redis + arduino-cli) only.

---

## 0. Prereqs

- Ubuntu 22.04+ VPS with root SSH access
- A domain (or subdomain) pointing to the VPS public IP — e.g. `api.example.com`
- GitHub repo connected to this Lovable project

---

## 1. First-time VPS provisioning

SSH in as root:

```bash
ssh root@YOUR_VPS_IP
```

Run the provided setup script (installs Node 20, arduino-cli + cores + libs,
Redis, nginx, pm2, ufw, and the nginx site config):

```bash
apt-get update && apt-get install -y git
git clone https://github.com/YOUR_ORG/YOUR_REPO.git /opt/embedsim-src
cp -r /opt/embedsim-src/backend/* /opt/embedsim/ 2>/dev/null || mkdir -p /opt/embedsim && cp -r /opt/embedsim-src/backend/* /opt/embedsim/
cd /opt/embedsim
bash scripts/setup-vps.sh
```

Create the production env file:

```bash
cat > /opt/embedsim/.env <<'EOF'
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://YOUR_FRONTEND_DOMAIN
REDIS_URL=redis://localhost:6379
ARDUINO_CLI_PATH=/usr/local/bin/arduino-cli
COMPILE_TIMEOUT_MS=90000
MAX_CONCURRENT_JOBS=4
TEMP_DIR=/tmp/embedsim
CACHE_ENABLED=true
CACHE_TTL_SECONDS=3600
COMPILE_RATE_LIMIT_MAX=10
EOF
```

Issue an SSL cert and reload nginx:

```bash
certbot --nginx -d api.example.com
systemctl reload nginx
```

Verify the API responds:

```bash
curl https://api.example.com/api/health
```

---

## 2. Create a deploy user + SSH key for GitHub Actions

On the VPS:

```bash
# Dedicated deploy user with sudo-less ownership of the app dir
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
chown -R deploy:deploy /opt/embedsim /var/log/embedsim
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh

# Generate a keypair specifically for CI
ssh-keygen -t ed25519 -f /home/deploy/.ssh/gha_deploy -N "" -C "github-actions"
cat /home/deploy/.ssh/gha_deploy.pub >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# Print the PRIVATE key — copy this into GitHub secrets in step 3
cat /home/deploy/.ssh/gha_deploy
```

Allow the `deploy` user to manage pm2 without sudo:

```bash
su - deploy -c "pm2 startup systemd -u deploy --hp /home/deploy"  # follow the printed sudo command
su - deploy -c "pm2 save"
```

---

## 3. Add GitHub Actions secrets

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.

| Name              | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| `VPS_HOST`        | `api.example.com` (or raw IP)                          |
| `VPS_USER`        | `deploy`                                               |
| `VPS_SSH_KEY`     | Full contents of `/home/deploy/.ssh/gha_deploy` (private key, including BEGIN/END lines) |
| `VPS_SSH_PORT`    | `22` (omit if default)                                 |
| `VPS_APP_DIR`     | `/opt/embedsim`                                        |
| `VPS_HEALTH_URL`  | `api.example.com` (used by post-deploy health probe)   |

---

## 4. Trigger the deploy

Push to `main`, or run the workflow manually:

**GitHub UI:** Actions → "Deploy to VPS" → Run workflow.

The workflow will:
1. rsync `backend/` to `/opt/embedsim` (excluding `node_modules`, `.env`)
2. `npm ci --omit=dev`
3. `pm2 startOrReload ecosystem.config.js --env production`
4. Curl `/api/health` until it returns 200 (fails the build if not)

---

## 5. Manual deploy (if you ever need to skip CI)

From your laptop:

```bash
rsync -az --delete --exclude node_modules --exclude .env \
  backend/ deploy@api.example.com:/opt/embedsim/

ssh deploy@api.example.com '
  set -e
  cd /opt/embedsim
  npm ci --omit=dev
  pm2 startOrReload ecosystem.config.js --env production
  pm2 save
  pm2 status
'
```

---

## 6. Operations cheatsheet

```bash
# Logs
pm2 logs embedsim-api
pm2 logs embedsim-worker
tail -f /var/log/embedsim/*.log

# Restart
pm2 restart embedsim-api embedsim-worker

# Redis sanity
redis-cli ping            # PONG
redis-cli llen bull:compile:wait

# arduino-cli sanity
sudo -u deploy arduino-cli version
sudo -u deploy arduino-cli lib list | head

# Disk / temp cleanup
du -sh /tmp/embedsim
find /tmp/embedsim -type d -mmin +60 -exec rm -rf {} +
```

---

## 7. Frontend build (only if you self-host the UI)

Lovable hosts the frontend by default. If you also want to serve it from the
VPS, add this once on the VPS:

```bash
cd /opt/embedsim-src
npm ci
npm run build
mkdir -p /var/www/embedsim
rsync -a dist/ /var/www/embedsim/
```

Then add an nginx `root /var/www/embedsim;` block for your frontend domain.

---

## Troubleshooting

- **GH Actions: `Permission denied (publickey)`** — `VPS_SSH_KEY` secret is missing the BEGIN/END lines, or `authorized_keys` perms aren't `600`.
- **`pm2: command not found` over SSH** — pm2 was installed for root, not `deploy`. Re-run `npm install -g pm2` as `deploy`, or call it via absolute path `/usr/bin/pm2`.
- **Health check fails after deploy** — `pm2 logs embedsim-api`; usually a missing env var in `/opt/embedsim/.env` or Redis not running (`systemctl status redis-server`).
- **arduino-cli library install drift** — handled by `services/compiler.js` (auto-invalidates the cache); if it persists, run `arduino-cli lib update-index && arduino-cli core update-index` on the VPS.
