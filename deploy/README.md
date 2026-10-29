# Free hosting on Azure, with auto-deploy from GitHub

After this one-time setup, every `git push` updates the live site by itself (in about 3–6 minutes).

```
git push → GitHub Actions → copies the code to your Azure server → rebuilds → site updated
Visitor → yourdomain.in (HTTPS by Caddy) → website → API → Supabase database
```

You need: the GoDaddy domain, a free [Supabase](https://supabase.com) account, and an [Azure free account](https://azure.microsoft.com/free/). Nothing is installed on your own computer: the server is created from Azure Cloud Shell in the browser.

---

## 1. Database (Supabase, 5 minutes)

1. Create a project, region **Mumbai (ap-south-1)**. Save the database password.
2. Click **Connect** → copy the **Session pooler** string (port 5432) and put your password in it.

The tables are created automatically on the first deploy.

## 2. Server (Azure, 10 minutes)

1. Open [shell.azure.com](https://shell.azure.com) → **Bash** → *No storage account required*.
2. Paste the one line from [`azure-create-server.sh`](azure-create-server.sh) and press Enter. It creates a free-tier Ubuntu server in Central India, opens ports 80/443, then prints:
   - `SERVER IP`: copy it into Notepad.
   - `PRIVATE KEY`: copy **all** of it, including the `-----BEGIN` and `-----END` lines, into Notepad. Keep it private.
3. If it says the size is sold out (`SkuNotAvailable`), paste [`azure-create-server-fallback.sh`](azure-create-server-fallback.sh) instead. It tries other sizes and South India.

The deploy script installs Docker, opens the server's own firewall and adds swap memory by itself; you never need to log in to the server.

**Other scripts (paste into Cloud Shell when needed):**

- [`azure-github-secrets.sh`](azure-github-secrets.sh): prints everything GitHub needs in one go: `SERVER_IP`, a free web address to use as `DOMAIN`, and a fresh `SSH_PRIVATE_KEY`.

- [`azure-new-key.sh`](azure-new-key.sh): makes a fresh private key for GitHub, if the old one is lost or was shared. Put the new key in the `SSH_PRIVATE_KEY` secret (step 4).
- [`azure-free-address.sh`](azure-free-address.sh): gives the server a free web address like `reesume-app.centralindia.cloudapp.azure.com`. Use it as `DOMAIN` while your GoDaddy domain isn't set up yet.

> The Azure free account lasts 12 months. After that the server is charged unless you move it or upgrade.

## 3. Domain (GoDaddy, 2 minutes)

GoDaddy → **My Products** → your domain → **DNS** → **Manage DNS**:

| Action | Type | Name | Value |
|---|---|---|---|
| Delete | A | @ | Parked |
| Add | A | @ | your server IP |
| Edit (or add) | CNAME | www | @ |

Delete any `AAAA` record for `@`. DNS usually updates in 10–30 minutes.

## 4. GitHub secrets (5 minutes)

In your repository: **Settings → Secrets and variables → Actions → New repository secret**. Add three:

| Name | Value |
|---|---|
| `SERVER_IP` | the server IP from step 2 |
| `SSH_PRIVATE_KEY` | the private key from step 2, pasted **whole**, including the `-----BEGIN` and `-----END` lines |
| `APP_ENV` | copy [`app.env.example`](app.env.example), fill in your values (domain, `DATABASE_URL`, `ADMIN_SETUP_CODE`, an AI key), and paste the whole block |

## 5. First deploy

Push the code to GitHub (including the `.github/` and `deploy/` folders), on the `main` branch. Then open the **Actions** tab: *Deploy to server* runs on every push, or click **Run workflow** to start it by hand.

The first run takes about 10–15 minutes on the small free server (it installs Docker and builds everything). When it shows a green tick, open `https://yourdomain.in`. Check `https://yourdomain.in/api/health`: it should show `"database":"postgres"`.

## Updating the site

Just push to `main`. The site is down for only a few seconds while the new version starts. To change a setting (for example a new AI key), edit the `APP_ENV` secret, then **Actions → Deploy to server → Run workflow**.

## If something goes wrong

- **Red cross in Actions:** open the run; the last step prints the app's recent logs.
- **Site doesn't open / no HTTPS:** check the GoDaddy A record points to the server IP. Caddy gets the certificate as soon as the domain points at the server.
- **Using the free Azure address as `DOMAIN`:** a certificate error for `www.…cloudapp.azure.com` in the logs is harmless; that name doesn't exist, and the main address still works.
- **`Permission denied (publickey)`:** `SSH_PRIVATE_KEY` must be the private key, pasted whole. If in doubt, run `azure-new-key.sh` and paste the new key.
- **Build very slow or stopped:** the free server has 1 GB of memory; the deploy adds 4 GB of swap, so the first build is slow but finishes. Just run the workflow again if it timed out.
- **Logs on the server** (optional, via SSH): `cd ~/resume-builder/deploy && sudo docker compose logs -f api`
