# Resume Builder

I built this because most resume builders either look fancy and fail ATS checks, or hide the real PDF behind a "preview". This one keeps it simple: you fill in your details step by step, see your ATS score, and download exactly the PDF you were looking at.

It never makes things up. The scores come from fixed rules, and the AI only rewrites what you already wrote.

## What it does

- Step-by-step builder: goal, contact, summary, skills, experience, projects, education, certifications, achievements, design
- Upload an old PDF or Word resume and keep editing it here
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

## Admin dashboard

Only my account can open the admin dashboard.

### How I log in as admin

1. Open **`https://<my-site>/admin/login`** (or click **Admin login** under the normal sign-in form).
2. Enter `rupeshsinghsuntech@gmail.com` and my password.
3. Click **Sign in to admin**. The dashboard opens. No code is needed.

The admin email is set with `ADMIN_EMAILS` (default: mine). Emails are unique, so once my account exists nobody else can register it. I must not delete that account. On a brand-new database, I sign up with the admin email right after deploying.

### Do this once, right after deploying: set my own admin code

This code is what I use to reset the admin password if I ever forget it. If I set it myself, I always know it and never have to search logs.

1. Go to **dashboard.render.com** and sign in.
2. Click the **API service** (the backend, e.g. `resume-builder-api`).
3. Click **Environment** in the left menu.
4. Click **Add Environment Variable**:
   - **Key:** `ADMIN_SETUP_CODE`
   - **Value:** my own secret, letters only, at least 12 (for example `MYSECRETADMINCODE`, but choose a different one)
5. Click **Save Changes**. Render restarts the API by itself.
6. Write the code down somewhere safe (phone notes).

For my laptop, I add the same line to `backend/.env`:

```
ADMIN_SETUP_CODE=MYSECRETADMINCODE
```

### I forgot the admin password: how to get back in

1. Open **`https://<my-site>/admin/login`** and click **Forgot password?**. The page **Site owner: reset password** opens.
2. Fill in:
   - **Email:** `rupeshsinghsuntech@gmail.com`
   - **Setup code from the server log:** my `ADMIN_SETUP_CODE` from the step above
   - **New password:** at least 10 characters, with letters and a number or symbol
3. Click **Set new password**. I'm signed in as admin with the new password.
4. Save the recovery code it shows (see below).

**I didn't set `ADMIN_SETUP_CODE`? Find the code in Render's logs instead:**

1. **dashboard.render.com → the API service → Logs**.
2. Type `admin_setup_code` in the log search box.
3. In the line `"event":"admin_setup_code","code":"ABCD-EFGH-JKLM"`, the code is **ABCD-EFGH-JKLM**. Use the newest line; a new code is made every time the API restarts.
4. No line found? Click **Manual Deploy → Restart service**, wait about a minute, and search again.

(On my laptop, the same line is in the terminal window running `npm run dev`.)

**Or use my recovery code** (if I made one): while signed in, **Account → Recovery code → Create code** makes one. When I forget the password: **`/admin/login` → Forgot password? → Use it instead**, then email + recovery code + new password.

**Why this is safe:** only the admin email can use these resets; the setup code exists only in my Render settings or logs, which only I can open; and attempts are limited (5 resets and 8 wrong passwords per 15 minutes).

### What the dashboard shows

It shows registered users, visits and unique visitors per day, top pages, where visitors come from, devices, downloads, AI use and earnings, for the last 7 days, 30 days or all time, with donut charts for devices, traffic sources, download formats and how many new users built a resume. Visits are counted without cookies or stored IP addresses, and only on the live site (local testing doesn't count). From the users table I can make a one-time password reset link for anyone who lost their recovery code and send it on WhatsApp.

## Built with

- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL (Supabase online, PGlite on my laptop)
- **PDF and Word:** react-pdf and docx
- **Tests:** Vitest

## Folders

```
frontend/   the website (goes on Vercel)
backend/    the API (goes on Render)
database/   schema.sql, the whole database in one file
shared/     code both sides use: templates, scoring, data types
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

If the project sits inside OneDrive or Dropbox, set `PGLITE_DIR` in `backend/.env` to a folder outside it, otherwise syncing can damage the local database.

## AI (optional)

Everything works without AI. To turn it on, paste a key into `backend/.env` and restart:

```
GEMINI_API_KEY=your-key-here
```

I use Google Gemini because it has a free plan: go to aistudio.google.com, sign in with Google and click **Get API key**. The app also accepts `GROQ_API_KEY` (free plan), `NVIDIA_API_KEY` (free for development), `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` (both paid). If you add more than one, it falls back to the next when one is busy.

Never commit your keys. `.env` files are already in `.gitignore`.

## Deploy

I host it on three free services:

1. **Supabase** for the database. Create a project and copy the *Session pooler* connection string (Connect → Method: Session pooler). Supabase's certificate is already in `backend/certs`, so nothing else is needed. The tables are created automatically when the API starts, or you can paste `database/schema.sql` into the SQL Editor.
2. **Render** for the API. New Web Service from this repo, using `backend/Dockerfile`. Add `NODE_ENV=production`, `DATABASE_URL`, `PROXY_SECRET` (any long random text), `FRONTEND_ORIGIN` (the Vercel URL) and your AI key.
3. **Vercel** for the website. Import the repo, set **Root Directory** to `frontend`, and add `BACKEND_URL` (the Render URL) and the same `PROXY_SECRET`.
4. **Admin:** on Render, add `ADMIN_SETUP_CODE` with my own secret code (see [Admin dashboard](#admin-dashboard)), then sign in at `/admin/login`.

More detail is in [DEPLOY.md](DEPLOY.md).

## Getting found on Google

The site has a sitemap (`/sitemap.xml`), a `robots.txt` that keeps private pages out of search, page titles and descriptions, a link preview image for WhatsApp and LinkedIn, and structured data for the homepage and FAQ. The address defaults to `https://freeatsresume.in`; set `SITE_URL` on Vercel if it's different.

After going live:

1. Open [Google Search Console](https://search.google.com/search-console), add the domain and verify it (DNS record, or set `GOOGLE_SITE_VERIFICATION` on Vercel to the code from the "HTML tag" option).
2. Under **Sitemaps**, submit `sitemap.xml`.
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
- Very unusual resume layouts may need a few fixes after upload.
- On Render's free plan the API sleeps when idle, so the first visit can take about a minute.
