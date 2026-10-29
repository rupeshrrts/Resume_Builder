# Resume Builder

**Live at [reesume.in](https://reesume.in)** · Developed by [Rupesh Kumar](https://www.linkedin.com/in/rupesh-kumar-508b1820a/)

I built this because most resume builders either look fancy and fail ATS checks, or hide the real PDF behind a "preview". This one keeps it simple: you fill in your details step by step, see your ATS score, and download exactly the PDF you were looking at.

It never makes things up. The scores come from fixed rules, and the AI only rewrites what you already wrote.

## What it does

- Step-by-step builder: goal, contact, summary, skills, experience, projects, education, certifications, achievements, design
- 9 clean, single-column templates that ATS software can read
- The preview is the real PDF, not an approximation
- Download as PDF, Word, plain text, Markdown or JSON
- ATS score, resume score and job match score, each explaining why
- "Improve score" shows the weak points and how to fix them
- Save a job description and make a tailored copy for it
- Track applications, write cover letters and prepare for interviews
- Optional AI to rewrite weak bullet points and draft a summary
- Forgot password works with a recovery code given at sign-up, no email service needed
- My own admin dashboard: users, visits, where visitors come from, downloads and earnings
- Resume guides (ATS format, freshers, software engineers) to help people find the site on Google
- **Coming soon:** upload an existing PDF or Word resume and get an AI analysis. It's switched off for now; set `UPLOAD_AND_AI_ANALYSIS` to `true` in [`frontend/src/lib/features.ts`](frontend/src/lib/features.ts) to bring it back.

## How it runs

```
git push → GitHub Actions → copies the code to the Azure server → rebuilds → site updated
Visitor → reesume.in (HTTPS by Caddy) → website (Next.js) → API (Express) → Supabase PostgreSQL
```

- **Server:** one Azure free-tier Ubuntu server in Central India, running the website, the API and Caddy with Docker Compose (`deploy/`).
- **Database:** Supabase PostgreSQL in Mumbai.
- **Domain:** `reesume.in` at GoDaddy, with an A record pointing at the server. Caddy gets and renews the HTTPS certificate by itself.
- **Updates:** every push to `main` deploys automatically ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)), in about 5–10 minutes.

The full setup, from creating the server to the GitHub secrets, is in **[deploy/README.md](deploy/README.md)**. Every setting is listed in [DEPLOY.md](DEPLOY.md).

### Settings (GitHub secrets)

Repository → **Settings → Secrets and variables → Actions**:

| Secret | What it holds |
|---|---|
| `SERVER_IP` | The Azure server's IP address |
| `SSH_PRIVATE_KEY` | The server's private key (make a new one with `deploy/azure-new-key.sh`) |
| `APP_ENV` | One setting per line: `DOMAIN`, `DATABASE_URL`, `ADMIN_SETUP_CODE`, `GEMINI_API_KEY` (template: [`deploy/app.env.example`](deploy/app.env.example)) |

To change a setting: update `APP_ENV` (paste **all** the lines again, since GitHub replaces the whole secret), then **Actions → Deploy to server → Run workflow**.

## Admin dashboard

Only my account can open the admin dashboard.

### How I log in as admin

1. Open **`https://reesume.in/admin/login`** (or click **Admin login** under the normal sign-in form).
2. Enter `rupeshsinghsuntech@gmail.com` and my password.
3. Click **Sign in to admin**. The dashboard opens. No code is needed.

The admin email is set with `ADMIN_EMAILS` (default: mine). Emails are unique, so once my account exists nobody else can register it. I must not delete that account. On a brand-new database, I sign up with the admin email right after deploying.

### My admin code

`ADMIN_SETUP_CODE` in the `APP_ENV` secret is what I use to reset the admin password if I ever forget it: my own secret, letters only, at least 12. I keep a copy somewhere safe (phone notes). For my laptop, the same line goes in `backend/.env`.

### I forgot the admin password: how to get back in

1. Open **`https://reesume.in/admin/login`** and click **Forgot password?**. The page **Site owner: reset password** opens.
2. Fill in:
   - **Email:** `rupeshsinghsuntech@gmail.com`
   - **Setup code:** my `ADMIN_SETUP_CODE`
   - **New password:** at least 10 characters, with letters and a number or symbol
3. Click **Set new password**. I'm signed in as admin with the new password.
4. Save the recovery code it shows (see below).

**Lost the setup code too?** Open [shell.azure.com](https://shell.azure.com) (Bash) and paste this. It prints the code from the server's log:

```bash
az vm run-command invoke -g resume-builder -n $(az vm list -g resume-builder --query "[0].name" -o tsv) --command-id RunShellScript --scripts "cd /home/azureuser/resume-builder/deploy && docker compose logs api | grep admin_setup_code | tail -1" --query "value[0].message" -o tsv
```

**Or use my recovery code** (if I made one): while signed in, **Account → Recovery code → Create code** makes one. When I forget the password: **`/admin/login` → Forgot password? → Use it instead**, then email + recovery code + new password.

**Why this is safe:** only the admin email can use these resets; the setup code exists only in my GitHub secret and the server log, which only I can open; and attempts are limited (5 resets and 8 wrong passwords per 15 minutes).

### What the dashboard shows

It shows registered users, visits and unique visitors per day, top pages, where visitors come from, devices, downloads, AI use and earnings, for the last 7 days, 30 days or all time, with donut charts for devices, traffic sources, download formats and how many new users built a resume. Visits are counted without cookies or stored IP addresses, and only on the live site (local testing doesn't count). From the users table I can make a one-time password reset link for anyone who lost their recovery code and send it on WhatsApp.

## Built with

- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL (Supabase online, PGlite on my laptop)
- **PDF and Word:** react-pdf and docx
- **Hosting:** Azure (Ubuntu), Docker Compose, Caddy, GitHub Actions
- **Tests:** Vitest

## Folders

```
frontend/   the website (Next.js)
backend/    the API (Express)
shared/     code both sides use: templates, scoring, data types
database/   schema.sql, the whole database in one file
deploy/     server setup: Docker Compose, Caddy, deploy script, Azure Cloud Shell scripts
.github/    the auto-deploy workflow
brand/      logo files (PNG sizes, SVG, favicon)
```

## Run it on your machine

You need Node.js 22.13 or newer. No database to install; it uses a built-in one locally.

```bash
npm install
```

```bash
copy backend\.env.example backend\.env
```

```bash
copy frontend\.env.example frontend\.env.local
```

```bash
npm run dev
```

Then open http://localhost:3000 and create an account. (On Mac or Linux use `cp` instead of `copy`.)

If the project sits inside OneDrive or Dropbox, set `PGLITE_DIR` in `backend/.env` to a folder outside it, otherwise syncing can damage the local database. Leave `DATABASE_URL` out of `backend/.env` for local testing, so test accounts never land in the live database.

## AI (optional)

Everything works without AI. To turn it on locally, paste a key into `backend/.env` and restart (on the live site it goes in the `APP_ENV` secret):

```
GEMINI_API_KEY=your-key-here
```

I use Google Gemini because it has a free plan: go to aistudio.google.com, sign in with Google and click **Get API key**. The app also accepts `GROQ_API_KEY` (free plan), `NVIDIA_API_KEY` (free for development), `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` (both paid). If you add more than one, it falls back to the next when one is busy.

## Keeping secrets out of GitHub

The repository is public. Never upload:

- `backend/.env` and `frontend/.env.local` (database password, API keys)
- any private key file (`*.key`, `id_rsa`, `id_ed25519`)

`.gitignore` blocks them for `git push`, but **not** for uploads on the GitHub website or inside a zip. Make the zip without them, or move them out of the folder first. If a key or password was ever shared, make a new one (Gemini: aistudio.google.com/apikey; Supabase: Project Settings → Database → Reset database password; server key: `deploy/azure-new-key.sh`) and update `APP_ENV`.

## Getting found on Google

The site has a sitemap (`/sitemap.xml`), a `robots.txt` that keeps private pages out of search, page titles and descriptions, a link preview image for WhatsApp and LinkedIn, and structured data for the homepage and FAQ. The address comes from `DOMAIN` in `APP_ENV`.

1. Open [Google Search Console](https://search.google.com/search-console), add the domain `reesume.in` and verify it (GoDaddy one-click, or a TXT record in GoDaddy DNS).
2. Under **Sitemaps**, submit `sitemap.xml`. Under **URL inspection**, request indexing for `https://reesume.in/`.
3. Share the link on LinkedIn, college groups and forums. Links from other sites help ranking more than anything else.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the website and API |
| `npm test` | Run the tests |
| `npm run typecheck` | Check types |
| `npm run build` | Production build of the website |

## About the scores

The ATS score starts at 100 and drops for things like missing contact details, unusual headings, unclear dates or tables in an uploaded file. The resume score also looks at skills, results in your bullet points, readability and formatting. Job match compares your resume with a job description, and a skill you actually used in a project or job counts more than one only listed under Skills.

They're there to help you improve. No tool can tell you a real company's ATS score.

## Privacy

Passwords are hashed, every user only sees their own data, and uploaded files are never stored. You can download or delete all your data from the Account page. When you use an AI feature, the text you asked about is sent to the AI service whose key is set.

## Known limits

- The PDF supports English and the ₹ sign, but not Hindi or other scripts yet (the Word file does).
- Upload and AI analysis of an existing resume is switched off until it works reliably (see "Coming soon" above).
- The free server has 1 GB of memory, so a deploy takes about 5–10 minutes (longer the first time).
- The Azure free account lasts 12 months (until about October 2027). After that the server is charged unless it's moved or upgraded.
