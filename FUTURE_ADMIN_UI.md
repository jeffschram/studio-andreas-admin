# Future: Browser-Based Admin (No Claude Desktop Required)

## Current Architecture

The admin workflow currently requires **Claude Desktop** (or Claude Code CLI) running locally on a machine with the Andreas MCP server configured. Claude does two things that can't happen without it:

1. **Triggers `sendForms`** — runs the Convex action that fetches Acuity appointments, creates submissions, and generates form links
2. **Sends emails** — uses the `mcp__andreas__send_email` MCP tool to deliver links to instructors

Everything else is already autonomous: instructors submit via the Vercel app, Convex syncs confirmed/disputed sessions back to Google Sheets automatically.

---

## Proposed Architecture: Fully Browser-Based

Replace Claude's role with a **password-protected admin page** on the existing Vercel app.

### What changes

| Component                  | Now                             | Proposed                                 |
| -------------------------- | ------------------------------- | ---------------------------------------- |
| Trigger pay period emails  | Claude runs `sendForms` via CLI | Admin clicks button in browser           |
| Email delivery             | Claude's `send_email` MCP tool  | Resend API (called directly from Convex) |
| Instructor form submission | Vercel app ✓                    | Vercel app ✓ (no change)                 |
| Sheet sync                 | Convex automatic ✓              | Convex automatic ✓ (no change)           |

### Work required

1.  [x]  **Add Resend for email sending** (~30 min)
   - Sign up at [resend.com](https://resend.com) — free tier is 3,000 emails/month
   - Verify Studio Andreas sending domain (e.g. `studioandreas.com`)
   - Add `RESEND_API_KEY` to Convex environment variables
   - Update `sendForms.ts` to replace `console.log` with a `fetch` call to Resend API

1. [x] **Expose `sendForms` as a Convex HTTP action** (~1 hr)
   - Add a `convex/http.ts` route (e.g. `POST /api/send-forms`)
   - Protect with a secret token (checked in Convex, stored as env var)
   - Returns JSON with submission results

1. [x] **Build admin page in Vercel app** (~2 hrs)
   - Route: `/admin` — simple password protection (env var `ADMIN_PASSWORD`)
   - Shows current pay period with date range
   - "Send forms to all instructors" button → calls the HTTP action
   - Displays results: who was emailed, how many sessions each

1. [ ] **Optional: submission review panel** (~2 hrs)
   - Shows all submissions for the current pay period
   - Flags disputed sessions for admin attention
   - Currently visible in Convex dashboard; could surface here

### Who benefits

- **Client hands-off** — no Claude Desktop install, no MCP configuration on Windows
- **Future admins** — no technical setup required, just a URL and password
- **Reliability** — no dependency on Claude being available or a local machine being on

### When to do this

Good time to revisit this once:
- The current Claude Desktop workflow has been tested through at least one full real pay period
- The client confirms they want a more self-contained solution
- Or: onboarding a new admin who isn't comfortable with Claude Desktop

---

## Quick Estimate

| Task | Time |
|------|------|
| Resend integration | ~30 min |
| HTTP action endpoint | ~1 hr |
| Admin page (send button + results) | ~2 hrs |
| **Total** | **~3.5 hrs** |
