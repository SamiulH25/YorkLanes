# Remote lab setup

Run YorkLanes on a university remote machine (SSH lab, VM, etc.) and use it from your laptop.

## Recommended: SSH port forwarding

Keep `localhost` URLs in env files — no CORS or OAuth changes needed.

### On the remote lab

```bash
git clone https://github.com/SamiulH25/YorkLanes.git
cd YorkLanes

# Node 22+ required (check: node -v)
npm install
npm run scraper:setup          # Python scraper venv (optional)
npm run setup                  # verify env files

# Env files (get SUPABASE_DB_URL from maintainer)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit apps/api/.env — at minimum set SUPABASE_DB_URL

# Checklist parser (optional, for degree plan import)
cd services/checklist-parser && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ../..

npm run start:dev
```

Leave that terminal open. You should see:

- `YorkLanes API listening on http://localhost:3001`
- `astro … Local http://localhost:4321/`

### On your laptop (new terminal)

Forward web + API ports through SSH:

```bash
ssh -L 4321:localhost:4321 -L 3001:localhost:3001 YOUR_USER@YOUR_LAB_HOST
```

Then open on **your laptop**:

- http://localhost:4321/dashboard
- http://localhost:4321/health

Traffic goes: laptop browser → SSH tunnel → lab's localhost.

---

## Alternative: bind to all interfaces

Use when the lab gives you a hostname/IP and you browse directly (no SSH tunnel).

```bash
npm run start:dev:remote
```

Set env to match how you reach the machine:

**`apps/web/.env.local`**

```env
PUBLIC_API_URL=http://YOUR_LAB_HOST:4321
```

**`apps/api/.env`**

```env
WEB_ORIGIN=http://YOUR_LAB_HOST:4321
API_BIND=0.0.0.0
```

Open `http://YOUR_LAB_HOST:4321` in your browser. Ensure the lab firewall allows ports **4321** and **3001**.

Google sign-in will **not** work unless you add `http://YOUR_LAB_HOST:4321/api/auth/google/callback` to Google Cloud Console and update `GOOGLE_CALLBACK_URL`. For most lab work, use features that do not require OAuth, or stick with SSH forwarding.

---

## Checklist

| Step | Command / check |
|------|-----------------|
| Node 22+ | `node -v` |
| Clone + install | `npm install` |
| API env | `apps/api/.env` with `SUPABASE_DB_URL` |
| Web env | `apps/web/.env.local` with `PUBLIC_API_URL` |
| Python scraper | `npm run scraper:setup` |
| Python parser | `services/checklist-parser/.venv` + `pip install -r requirements.txt` |
| Verify setup | `npm run setup` |
| Start servers | `npm run start:dev` (or `start:dev:remote`) |
| Health | `curl http://localhost:4321/health` on the lab |

---

## Common issues

| Problem | Fix |
|---------|-----|
| `Cannot find native binding` / wrong esbuild platform | `rm -rf node_modules package-lock.json && npm install` **on the lab** (do not copy `node_modules` from Windows) |
| `No module named 'dotenv'` | `npm run scraper:setup` |
| API starts but `/health` fails | Check `SUPABASE_DB_URL`; lab must reach Supabase (outbound HTTPS) |
| Blank page / API errors in browser | With SSH tunnel: use `PUBLIC_API_URL=http://localhost:4321` |
| CORS errors | `WEB_ORIGIN` must match the URL in your browser |
| Port already in use | `lsof -i :4321` or change `API_PORT` / Astro port |

---

## Run in background (optional)

On the lab, using `tmux` or `screen`:

```bash
tmux new -s yorklanes
npm run start:dev
# Detach: Ctrl+B then D
# Reattach: tmux attach -t yorklanes
```

Keep your SSH session alive or use `tmux` so the dev servers keep running after you disconnect.
