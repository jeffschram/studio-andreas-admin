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

### Additional Features

- [x] Show pay period in the Show Payroll Page
	- [x] under 'Automatically detects the most recently completed pay period and emails each instructor a link to confirm their hours.' show the pay period number and the dates in nice human-readable date format

- [x] Ideally the admin would have a page for each pay period. It would default to the current pay period. If they haven't sent emails yet they'd be prompted to do so. If they have sent the emails they can see the status of each instructor

### Functionality to Verify

- [x] The pay periods are defined in the drive > STUDIO ANDREAS > STUDIO_ANDREAS_PAYROLL sheet https://docs.google.com/spreadsheets/d/1KVEdNyJkHuZFGNG0sPzdu1b4nkAwqLqE14Yxp2bZvE8/edit?gid=1280079424#gid=1280079424 in the 'Pay Periods' tab. The payroll dates relevant to this app are the Start Date and End Date. "Payroll Deadline" and "Pay Day" are for the human admins to use for reference. - The google drive sheet should be considered the source of truth and if it is ever edited the app should update accordingly. maybe this means we periodically check for sync.

### Updates to Pay Structure

- [ ] Additional Hours are different and only applicable to some instructors
	That means that each instructor will have different hourly-label options that correspond to an hourly rate. It is no longer just 'Tech Hours', 'Meetings', etc for each instructor - it's unique to each.
	What hourly-label applies to the instructor and the hourly rate is defined in the google sheet in 'Instructors' and the sheet should be treated as the source of truth. (similar to the pay periods)

	For example, the google sheet currently defines:
	
	- Cheslea Danburg
		- Additional Classtime: 25
		- Event: 100
	- Herb Thomas
		- Basic Hourly: 20
		- Youth Class: 35
	- Justin Wiest
	- Maria Spiess
	- Mark Andreas
	- Nerea Nicholson
		- Tech Hours: 25
		- Open Studio: 14
		- Event: 100
	- Olivia Lapine
	- Owen Hughes
		- Tech Hours: 20
		- Teaching Assist: 25