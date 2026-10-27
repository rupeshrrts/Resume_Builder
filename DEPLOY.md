# Deploying Resume Builder with Supabase

## Quick path: Vercel (website) + Render (API) + Supabase (database)

| Folder | What it is | Where it runs |
|---|---|---|
| `frontend/` | Website (Next.js) | **Vercel** |
| `backend/` | API (Express, long-running) | **Render** (or Railway/Fly): not Vercel, it isn't serverless |
| `database/` | `schema.sql`: the whole database in one file | **Supabase** PostgreSQL |

1. **Supabase:** create the project and copy the *Session pooler* connection string (section 1 below). Supabase's root certificate ships in `backend/certs`, so no certificate setting is needed. Tables are created automatically when the API first starts, or paste `database/schema.sql` into the SQL Editor.
2. **API on Render:** **New → Web Service** → this repository → *Docker*, Dockerfile `backend/Dockerfile`, Docker context `.` (the repository root). Set `NODE_ENV=production`, `DATABASE_URL`, `PROXY_SECRET` (any long random string), and `FRONTEND_ORIGIN` = your Vercel URL (e.g. `https://resume-builder.vercel.app`). Health check path: `/api/health`.
3. **Website on Vercel:** **Add New → Project** → this repository → **Root Directory: `frontend`** (Vercel picks up `frontend/vercel.json`, which installs the whole workspace from the repository root). Environment variables: `BACKEND_URL` = the Render API URL (e.g. `https://resume-builder-api.onrender.com`) and the same `PROXY_SECRET`. Deploy.
4. Once Vercel gives you the final URL (or your own domain), make sure the API's `FRONTEND_ORIGIN` matches it exactly, then open the site, create an account (name, mobile, email, password) and build a resume.

The sections below explain each step in detail, plus the all-on-Render option (`render.yaml`).

---

The app runs as three parts:

```
Visitor ──HTTPS──> Website (Next.js)  ──/api proxy──> API (Express)  ──TLS──> Supabase PostgreSQL
                   frontend/                          backend/
```

The browser only ever talks to the website. The website forwards `/api/*` to the API, so sign-in cookies stay first-party and no CORS setup is needed. The API is the only thing that touches the database.

Any Node 22 host works. This guide uses **Render** for both services (a ready-made [`render.yaml`](render.yaml) is included) and lists the alternatives at the end.

---

## 1. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com). Pick the **region closest to your users** (for India: *Mumbai, ap-south-1*), and save the database password somewhere safe.
2. **Connection string:** click **Connect** at the top of the project, then copy the **Session pooler** string. It looks like this:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Replace `[YOUR-PASSWORD]`. Use the *session* pooler (port 5432): it works from IPv4 hosts and suits a long-running server. The *direct* connection is IPv6-only unless you buy the IPv4 add-on.
3. **SSL certificate:** nothing to do. Supabase's root certificate (the same one as **Project Settings → Database → SSL Configuration → Download certificate**) is included in `backend/certs/supabase-ca.crt`, and the API uses it automatically to verify it's really talking to Supabase.
4. **Create the tables.** Choose one option:
   - **Automatic (recommended):** do nothing. The API runs `database/schema.sql` when it starts.
   - **Manual:** open **SQL Editor**, paste [`database/schema.sql`](database/schema.sql), and click **Run**. Then set `MIGRATE_ON_START=false` on the API if you want to keep schema changes manual.
5. *(Recommended)* **Project Settings → Database → SSL Configuration → Enforce SSL**: on.

**Supabase's Data API:** Supabase also exposes tables over HTTP with its public `anon` key. This app doesn't use that API, so step `005_lock_down_data_api.sql` in `schema.sql` turns on row level security for every table and revokes the `anon`/`authenticated` roles' access. To confirm, run the two check queries at the bottom of `schema.sql`: both should return no rows. You can also turn the Data API off entirely in the project's API settings.

## 2. Render (website and API)

1. Push this repository to GitHub (or GitLab). `.env` files are git-ignored and must not be committed.
2. On [render.com](https://render.com), go to **New → Blueprint**, pick the repository, and Render reads `render.yaml`. It creates:
   - `resume-builder-api`: the API (Docker, health check `/api/health`)
   - `resume-builder-web`: the website (Docker)

   `PROXY_SECRET` is generated and shared between the two automatically, and the website finds the API through `BACKEND_URL`.
3. Fill in the API's values when asked:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Session pooler string from step 1.2 |
   | `FRONTEND_ORIGIN` | the website's public URL, e.g. `https://resume-builder-web.onrender.com` (later, your own domain) |
   | `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY` or `ANTHROPIC_API_KEY` | optional, set at least one; without any, AI features show as unavailable. Gemini and Groq have free plans; OpenAI and Claude need credit. See the README's AI section. |

4. Pick the **same region** as Supabase (or the nearest one; Singapore for Mumbai).
5. Deploy. On the first start the API logs `migration_applied` for each migration, then `api_listening`.
6. Open the website URL, register, and create a resume.

**Custom domain:** add it to the website service under **Settings → Custom Domains**, then update the API's `FRONTEND_ORIGIN` to `https://your-domain` (a comma-separated list works during the switch).

**Free instances** sleep when idle, and the first request afterwards takes about a minute. Use a paid instance for real users.

## 3. Checks after deploying

- `https://<api-url>/api/health` returns `{"ok":true,"database":"postgres"}`. If it says `pglite`, `DATABASE_URL` isn't set.
- Register, sign out, and sign in again. If sign-in doesn't stick, the site is probably not on HTTPS (cookies are `Secure` in production) or `FRONTEND_ORIGIN` doesn't match the site's URL.
- Export a PDF and import it back.
- In Supabase **SQL Editor**, run the two check queries at the bottom of `database/schema.sql`.

## 4. Environment variables

**API** (`backend`)

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `production`: Secure cookies, and startup checks for the settings below |
| `DATABASE_URL` | yes | PostgreSQL connection string (the API refuses to start without it in production) |
| `DATABASE_SSL_CA` | no | CA certificate (PEM text, base64 PEM or file path) for providers other than Supabase, whose certificate is built in. |
| `DATABASE_SSL` | no | `no-verify` = encrypt without verifying (avoid); `off` = no TLS (local only) |
| `FRONTEND_ORIGIN` | yes | Public `https://` URL(s) of the website, comma-separated |
| `PROXY_SECRET` | recommended | Same value as on the website; lets the API trust the visitor IP the proxy passes on (rate limits) |
| `PORT` / `API_PORT` | no | Listening port (platforms set `PORT`) |
| `PG_POOL_MAX` | no | Connections per API instance (default 5; keep within your Supabase pooler limit) |
| `MIGRATE_ON_START` | no | `false` to run `database/schema.sql` yourself |
| `ANTHROPIC_API_KEY` | no | Enables AI features with Claude. `ANTHROPIC_MODEL`, `AI_EFFORT`, `AI_FALLBACKS` tune them. |
| `OPENAI_API_KEY` | no | Enables AI with OpenAI (paid). `OPENAI_MODEL` defaults to `gpt-6-luna`. |
| `GEMINI_API_KEY` | no | Enables AI with Google Gemini's free plan. `GEMINI_MODEL` defaults to `gemini-3.8-flash`. |
| `GROQ_API_KEY` | no | Enables AI with Groq's free plan. `GROQ_MODEL` defaults to `openai/gpt-oss-120b`. |
| `NVIDIA_API_KEY` | no | Enables AI with NVIDIA's free development endpoints. `NVIDIA_MODEL` defaults to `deepseek-ai/deepseek-v4.1-flash`. |
| `AI_PROVIDER` | no | With several keys they're tried in the order Claude, OpenAI, Gemini, Groq, NVIDIA (the next one is used when one is busy or out of credit). Set a name here to try that one first. |
| `MAX_UPLOAD_BYTES` | no | Upload limit (default 5 MB) |
| `ADMIN_EMAILS` | no | Accounts that can open `/admin` (default `rupeshsinghsuntech@gmail.com`). Each is activated once with the `admin_setup_code` printed in the API log. |
| `ADMIN_SETUP_CODE` | no | A fixed setup code instead of a new random one on each start |
| `ANALYTICS` | no | Visit counting is on in production; `off` disables it, `on` also counts outside production |
| `ANALYTICS_SALT` | no | Secret for anonymous daily visitor counting (defaults to `PROXY_SECRET`) |
| `RESEND_API_KEY` / `BREVO_API_KEY` | no | Optional email service for verification and reset emails. Without one, password resets use recovery codes and admin-made links. `MAIL_FROM` and `APP_URL` set the sender and link address. |

**Website** (`frontend`)

| Variable | Required | Purpose |
|---|---|---|
| `BACKEND_URL` | yes | Where the website reaches the API, e.g. `https://api.example.com` or a private `host:port`. Read at runtime. |
| `PROXY_SECRET` | recommended | Same value as the API's |
| `SITE_URL` | no | Public address for the sitemap, robots.txt and link previews (default `https://freeatsresume.in`) |
| `GOOGLE_SITE_VERIFICATION` | no | Google Search Console "HTML tag" code |

**After the first deploy:** open Render → the API → **Logs**, find `admin_setup_code`, then sign in with the admin email on the site and enter the code under **Account → Admin access**.

## 5. Other hosts

Both services are plain Node 22 apps with Dockerfiles, so they also run on Railway, Fly.io, Google Cloud Run, Azure Container Apps, or a VPS:

```bash
docker build -f backend/Dockerfile -t resume-api .
```

```bash
docker build -f frontend/Dockerfile -t resume-web .
```

Without Docker, from the repository root:

- **API:** `npm ci`, then `npm run start -w backend`
- **Website:** `npm ci`, `npm run build -w frontend`, then `npm run start -w frontend`

**Website on Vercel:** import the repository and set **Root Directory** to `frontend` (`frontend/vercel.json` installs the npm workspaces from the repository root). Set `BACKEND_URL` to the API's public URL and set `PROXY_SECRET` on both services. AI requests can take up to about a minute, and the `/api` proxy allows 120 seconds; check that your Vercel plan's function duration limit allows that. The API itself needs a long-running Node host (Render, Railway, Fly…), not serverless functions.

## 6. Running the database later

All SQL is in one file, [`database/schema.sql`](database/schema.sql). It can be run from **Supabase → SQL Editor** or `psql`, and it's split into numbered blocks. The API records each block it has run and skips it next time.

To change the database later, add a new numbered block at the end of the file, just above the `end` marker, then redeploy. The API runs only the new block. Never edit a block that has already run on a live database.

No scheduled clean-up is needed: the app removes expired sessions and old version history by itself.

**Backups:** paid Supabase plans include daily backups. On the free plan, take your own:

```bash
pg_dump "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" --no-owner --format=custom -f resume-builder.dump
```

## 7. Limits to know

- Rate limits are kept in memory per API instance. Run one API instance, or move them to a shared store (e.g. Redis) before scaling out.
- Uploaded files are processed in memory and never stored, so no file storage (such as Supabase Storage) is needed.
- Sessions last 30 days. Signing out deletes the session from the database.
