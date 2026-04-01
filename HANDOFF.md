# Client Handoff Checklist

Steps to migrate the payroll app from Jeff's personal accounts to Studio Andreas's own accounts.

---

## Accounts to Create

The client needs accounts on the following free services before starting:

| Service | URL | Notes |
|---------|-----|-------|
| GitHub | github.com | Can be a personal account or org (e.g. `studio-andreas`) |
| Convex | convex.dev | Free tier is sufficient indefinitely at this scale |
| Vercel | vercel.com | Free tier is sufficient |

---

## Step 1 — Transfer GitHub Repo

1. Go to `github.com/jeffschram/studio-andreas-admin`
2. Settings → Danger Zone → **Transfer repository**
3. Transfer to the client's GitHub username or org

---

## Step 2 — Set Up Convex

1. Client signs up at [convex.dev](https://convex.dev) and creates a new project
2. In the `payroll-app` directory, log in to the new account:
   ```bash
   npx convex login
   ```
3. Link the project to the new Convex deployment:
   ```bash
   npx convex dev --once
   ```
   (Select the new project when prompted)
4. Set all environment variables in the new Convex dashboard (`dashboard.convex.dev` → project → Settings → Environment Variables):

   | Variable | Value |
   |----------|-------|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `payroll-sync@studio-andreas.iam.gserviceaccount.com` |
   | `GOOGLE_PRIVATE_KEY` | *(copy from current Convex dashboard — paste carefully, preserving newlines)* |
   | `ACUITY_USER_ID` | `28516345` |
   | `ACUITY_API_KEY` | `69d52500d95364591802416867a6df80` |
   | `APP_BASE_URL` | *(set after Vercel is deployed — see Step 4)* |

5. Re-run the Instructors setup action to seed the new database:
   ```bash
   npx convex run actions/setupInstructors:run
   ```

> **Note:** Convex submission data (form responses) does not need to be migrated — it's test data and the source of truth is the Google Sheet.

---

## Step 3 — Deploy to Vercel

1. Client signs up at [vercel.com](https://vercel.com)
2. New Project → **Import Git Repository** → select `studio-andreas-admin`
3. Add environment variable before deploying:

   | Variable | Value |
   |----------|-------|
   | `VITE_CONVEX_URL` | *(Cloud URL from new Convex project — ends in `.convex.cloud`)* |

4. Deploy — note the Vercel URL (e.g. `studio-andreas-admin.vercel.app`)

---

## Step 4 — Connect Convex to Vercel URL

Once Vercel is deployed, set the `APP_BASE_URL` in Convex so form links point to the right place:

```bash
npx convex env set APP_BASE_URL https://your-vercel-url.vercel.app
```

Or set it directly in the Convex dashboard under Environment Variables.

---

## Step 5 — Update Local `.env.local`

Update the local `payroll-app/.env.local` to point to the new Convex deployment:

```
VITE_CONVEX_URL=https://your-new-deployment.convex.cloud
CONVEX_DEPLOYMENT=dev:your-new-deployment
```

---

## Step 6 — Verify

Run a dry-run to confirm everything is wired up correctly:

```bash
npx convex run actions/sendForms:run '{"dryRun": true}'
```

Should log the current pay period, active instructors, and form links using the new Vercel URL.

---

## What Does NOT Need to Change

- **Google Cloud / Service Account** — already under Studio Andreas's Google workspace (`studio-andreas.iam.gserviceaccount.com`) ✅
- **Google Sheet** — already shared with the service account ✅
- **Acuity** — API credentials belong to the studio ✅
- **App code** — no account-specific values are hardcoded ✅

---

## Claude Desktop Setup (Windows)

For the client to use Claude Desktop to send payroll forms, the Andreas MCP server needs to be configured on their Windows machine. This is a separate setup step — see the Andreas MCP server documentation.
