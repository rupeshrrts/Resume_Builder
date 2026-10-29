# Deploying Resume Builder

The live site runs on **one Azure free-tier server in Central India** that updates itself on every `git push`, with **Supabase** as the database and the **GoDaddy** domain `reesume.in`. The step-by-step setup is in **[deploy/README.md](deploy/README.md)**; this page explains how the parts fit together and lists every setting.

```
Visitor ──HTTPS──> Caddy ──> Website (Next.js) ──/api proxy──> API (Express) ──TLS──> Supabase PostgreSQL
                   deploy/   frontend/                         backend/
```

The browser only ever talks to the website. The website forwards `/api/*` to the API, so sign-in cookies stay first-party and no CORS setup is needed. The API is the only thing that touches the database. On the server, only Caddy is reachable from the internet; the website and the API talk over Docker's private network.

| Part | Where it's defined |
|---|---|
| The three containers (Caddy, website, API) | [`deploy/docker-compose.yml`](deploy/docker-compose.yml) |
| HTTPS and the `www` → main domain redirect | [`deploy/Caddyfile`](deploy/Caddyfile) |
| Install Docker, firewall, swap, build and restart | [`deploy/remote-deploy.sh`](deploy/remote-deploy.sh) |
| Copy the code to the server on every push | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) |
| Create the Azure server, free address, new key | `deploy/azure-*.sh` (pasted into Azure Cloud Shell) |

## 1. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com). Pick the **region closest to your users** (for India: *Mumbai, ap-south-1*), and save the database password somewhere safe. Use only letters and numbers in it, so it needs no escaping in the connection string.
2. **Connection string:** click **Connect** at the top of the project, then copy the **Session pooler** string. It looks like this:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Replace `[YOUR-PASSWORD]`. Use the *session* pooler (port 5432): it works from IPv4 hosts and suits a long-running server. The *direct* connection is IPv6-only unless you buy the IPv4 add-on.
3. **SSL certificate:** nothing to do. Supabase's root certificate is included in `backend/certs/supabase-ca.crt`, and the API uses it automatically to verify it's really talking to Supabase.
4. **Create the tables.** Choose one option:
   - **Automatic (recommended):** do nothing. The API runs `database/schema.sql` when it starts.
   - **Manual:** open **SQL Editor**, paste [`database/schema.sql`](database/schema.sql), and click **Run**. Then set `MIGRATE_ON_START=false` in `APP_ENV` if you want to keep schema changes manual.
5. *(Recommended)* **Project Settings → Database → SSL Configuration → Enforce SSL**: on.

**Supabase's Data API:** Supabase also exposes tables over HTTP with its public `anon` key. This app doesn't use that API, so step `005_lock_down_data_api.sql` in `schema.sql` turns on row level security for every table and revokes the `anon`/`authenticated` roles' access. To confirm, run the two check queries at the bottom of `schema.sql`: both should return no rows. You can also turn the Data API off entirely in the project's API settings.

## 2. Checks after deploying

- `https://reesume.in/api/health` returns `{"ok":true,"database":"postgres"}`. If it says `pglite`, `DATABASE_URL` isn't set.
- Register, sign out, and sign in again. If sign-in doesn't stick, the site is probably not on HTTPS (cookies are `Secure` in production) or `DOMAIN` doesn't match the site's address.
- Export a PDF.
- In Supabase **SQL Editor**, run the two check queries at the bottom of `database/schema.sql`.

## 3. Settings

On the live server, everything comes from the **`APP_ENV`** GitHub secret (one `NAME=value` per line, template in [`deploy/app.env.example`](deploy/app.env.example)). Each deploy writes it to `deploy/.env` on the server. `docker-compose.yml` fills in the rest by itself:

- `NODE_ENV=production`, and `FRONTEND_ORIGIN=https://DOMAIN,https://www.DOMAIN` for the API
- `BACKEND_URL`, `SITE_URL=https://DOMAIN` and `PROXY_SECRET` for the website (`PROXY_SECRET` is made once on the server and kept)

**In `APP_ENV`**

| Variable | Required | Purpose |
|---|---|---|
| `DOMAIN` | yes | The site's address without `https://` or `www.`, e.g. `reesume.in` |
| `DATABASE_URL` | yes | Supabase Session pooler connection string (the API refuses to start without it in production) |
| `ADMIN_SETUP_CODE` | recommended | My own secret (letters only, 12+) for resetting a forgotten admin password |
| `GEMINI_API_KEY` | no | Enables AI with Google Gemini's free plan. `GEMINI_MODEL` defaults to `gemini-3.8-flash`. |
| `GROQ_API_KEY` | no | Enables AI with Groq's free plan. `GROQ_MODEL` defaults to `openai/gpt-oss-120b`. |
| `NVIDIA_API_KEY` | no | Enables AI with NVIDIA's free development endpoints. `NVIDIA_MODEL` defaults to `deepseek-ai/deepseek-v4.1-flash`. |
| `OPENAI_API_KEY` | no | Enables AI with OpenAI (paid). `OPENAI_MODEL` defaults to `gpt-6-luna`. |
| `ANTHROPIC_API_KEY` | no | Enables AI with Claude (paid). `ANTHROPIC_MODEL`, `AI_EFFORT`, `AI_FALLBACKS` tune it. |
| `AI_PROVIDER` | no | With several keys they're tried in the order Claude, OpenAI, Gemini, Groq, NVIDIA (the next one is used when one is busy or out of credit). Set a name here to try that one first. |
| `ADMIN_EMAILS` | no | Accounts that can open `/admin` (default `rupeshsinghsuntech@gmail.com`) |
| `GOOGLE_SITE_VERIFICATION` | no | Google Search Console "HTML tag" code |
| `RESEND_API_KEY` / `BREVO_API_KEY` | no | Optional email service for verification and reset emails. Without one, password resets use recovery codes and admin-made links. `MAIL_FROM` and `APP_URL` set the sender and link address. |
| `DATABASE_SSL_CA` | no | CA certificate (PEM text, base64 PEM or file path) for databases other than Supabase, whose certificate is built in |
| `DATABASE_SSL` | no | `no-verify` = encrypt without verifying (avoid); `off` = no TLS (local only) |
| `PG_POOL_MAX` | no | Database connections (default 5; keep within your Supabase pooler limit) |
| `MIGRATE_ON_START` | no | `false` to run `database/schema.sql` yourself |
| `MAX_UPLOAD_BYTES` | no | Upload limit (default 5 MB) |
| `ANALYTICS` | no | Visit counting is on in production; `off` disables it |
| `ANALYTICS_SALT` | no | Secret for anonymous daily visitor counting (defaults to `PROXY_SECRET`) |

GitHub replaces the whole secret when you update it, so always paste every line again, then **Actions → Deploy to server → Run workflow**.

**For local development** the same API settings go in `backend/.env` (template: `backend/.env.example`), and the website reads `BACKEND_URL` from `frontend/.env.local`.

## 4. Running elsewhere

Both parts are plain Node 22 apps with Dockerfiles, so they run on any Docker host. From the repository root:

```bash
docker build -f backend/Dockerfile -t resume-api .
```

```bash
docker build -f frontend/Dockerfile -t resume-web .
```

Without Docker: `npm ci`, then `npm run start -w backend` for the API, and `npm run build -w frontend` followed by `npm run start -w frontend` for the website. The API needs a long-running Node host, not serverless functions.

## 5. Changing the database later

All SQL is in one file, [`database/schema.sql`](database/schema.sql). It can be run from **Supabase → SQL Editor** or `psql`, and it's split into numbered blocks. The API records each block it has run and skips it next time.

To change the database later, add a new numbered block at the end of the file, just above the `end` marker, then push. The API runs only the new block. Never edit a block that has already run on a live database.

No scheduled clean-up is needed: the app removes expired sessions and old version history by itself.

**Backups:** paid Supabase plans include daily backups. On the free plan, take your own with `pg_dump`:

```bash
pg_dump "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" --no-owner --format=custom -f resume-builder.dump
```

## 6. Limits to know

- Rate limits are kept in memory in the API. Run one API instance, or move them to a shared store (e.g. Redis) before scaling out.
- Uploaded files are processed in memory and never stored, so no file storage (such as Supabase Storage) is needed.
- Sessions last 30 days. Signing out deletes the session from the database.
