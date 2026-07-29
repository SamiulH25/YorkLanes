# Nginx reverse proxy for YorkLanes

Proxies `yorklanes.samiulh25.com` to the Docker web container on `127.0.0.1:4321`.

## Stack on this machine

```
Browser → nginx (443) → Docker web (127.0.0.1:4321) → Docker api (internal)
```

Start the app:

```bash
docker compose up -d --build
```

## Install / update nginx site

```bash
sudo cp docker/nginx/yorklanes.samiulh25.com.conf /etc/nginx/sites-available/yorklanes.samiulh25.com
sudo ln -sf /etc/nginx/sites-available/yorklanes.samiulh25.com /etc/nginx/sites-enabled/yorklanes.samiulh25.com
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS (Let's Encrypt)

First-time only (already done on this server):

```bash
sudo certbot --nginx -d yorklanes.samiulh25.com
```

Certbot updates the nginx site file with SSL settings and HTTP→HTTPS redirect.

## Verify

```bash
curl https://yorklanes.samiulh25.com/health
curl https://yorklanes.samiulh25.com/api/auth/status
```
