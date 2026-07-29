# Self-hosted auto-deploy (push to main)

When someone pushes to `main` on GitHub, this machine:

1. Receives a signed webhook from GitHub
2. Runs `scripts/deploy.sh` (git pull + `docker compose up -d --build`)
3. Verifies the app health check

## One-time setup

### 1. Commit the Docker/nginx deploy files

Push the deploy setup to `main` first — otherwise the deploy script will reset this machine to whatever is currently on GitHub.

### 2. Create the webhook secret file

```bash
cp docker/deploy-webhook.env.example docker/deploy-webhook.env
# Edit docker/deploy-webhook.env and set GITHUB_WEBHOOK_SECRET to a long random string
```

### 3. Install and start the webhook service

```bash
chmod +x scripts/deploy.sh
sudo cp docker/systemd/yorklanes-deploy-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now yorklanes-deploy-webhook
```

### 4. Nginx hook endpoint

The nginx site proxies `POST /hooks/github-deploy` to the local webhook listener. Reload nginx after updating the site file:

```bash
sudo cp docker/nginx/yorklanes.samiulh25.com.conf /etc/nginx/sites-available/yorklanes.samiulh25.com
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Add the GitHub webhook

In [GitHub → YorkLanes → Settings → Webhooks → Add webhook](https://github.com/SamiulH25/YorkLanes/settings/hooks):

| Field | Value |
|-------|-------|
| Payload URL | `https://yorklanes.samiulh25.com/hooks/github-deploy` |
| Content type | `application/json` |
| Secret | same as `GITHUB_WEBHOOK_SECRET` in `docker/deploy-webhook.env` |
| Events | Just the **push** event |

GitHub will send a ping — you should see `Received ping` in the service logs.

## Verify

```bash
# Webhook service health
curl http://127.0.0.1:9876/health

# Service logs
journalctl -u yorklanes-deploy-webhook -f

# Manual deploy (same as webhook runs)
./scripts/deploy.sh
```

## Notes

- Only pushes to `main` on `SamiulH25/YorkLanes` trigger a deploy.
- `apps/api/.env` is **not** in git — keep it on the server; deploy does not overwrite it.
- Concurrent pushes are ignored while a deploy is already running.
