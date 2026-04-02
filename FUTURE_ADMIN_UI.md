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

- [x] Additional Hours are different and only applicable to some instructors
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

[x] Instructors paid at the beginning of a class and end of a class.
Instructors are still paid the same rate for a class, the amount paid is defined in the spreadsheet with the function:

=IF(TRIM(LOWER(D55))="private",(H55*0.97)*0.75,IF(TRIM(LOWER(D55))="class",(H55*0.87)/2,IF(TRIM(LOWER(D55))="workshop",(H55*0.87)/2,IF(TRIM(LOWER(D55))="membership",(H55*0.97)*0.1,""))))

where the 'H' value here is the Gross Total, the Price per Booking times the quantity of people ('E'). So for a class they get 0.87 times the Gross Total.

However one thing is kinda tricky. The Admins want to pay the instructors half when the class starts and half when it ends. (That's why we have the divided by two in the calculation)

This means for a pay period we need to determine if a class has started, and/or if a class has ended. They only get paid twice for a class, during a pay period when the class started and during a pay period when a class ended.
The email sent to the instructor should only verify that a class has started/ended. 

This is an update because currently we are paying during each pay period and it is a much larger amount than it should be.



**About how classes work in Acuity:**

1. When a "class" runs for multiple sessions (e.g. a 6-week ceramics course), are all sessions created upfront in Acuity as recurring appointments? Or added week by week?
2. Is there anything in Acuity that defines when a class "ends" — like a fixed number of sessions or an end date on the appointment type?

They will be added ahead of time. acuity has an appointmentType and i believe we added get_appointment_types to our system to pull that data in. For instance there is a (i think a category) of Mid-Spring Semester Woodworking Classes, then a class, appointmentType, called '[Woodworking Youth Monday Evening](https://secure.acuityscheduling.com/appointments.php?action=editAppointmentType&id=90730751) (8 hours @ $300.00)'  then we might have 2 ways of defining when the class ends.
A) the description states "Mondays 5 - 7 PM | March 30th-April 20th"
B) There are individual classes within that with dates



**About the pay logic:**  
3. A class runs for, say, 6 weeks spanning 3 pay periods. The instructor gets paid in the pay period the first session falls in, and again in the pay period the last session falls in — but nothing in the middle pay periods. Is that right?  - correct, nothing in the middle pay period. They are only paid if the start or end falls within a pay period.
4. What if a class both starts AND ends in the same pay period (very short class)? Does the instructor get both payments in that period, or just one?  Both
5. For **Private** sessions — those look like they're paid per-session as they happen (no start/end split). Is that correct? Correct

**About the form:**  
6. What should the instructor actually see and confirm? Right now they see every individual session. With this change, would they instead see something like "Ceramics 101 — started Mar 30" and "Ceramics 101 — ends Apr 12"? - yes they'd see " Intro to Wheel Throwing Wednesday Mornings: Started Mar 30"

