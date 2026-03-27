"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import * as crypto from "crypto";

const SPREADSHEET_ID = "1KVEdNyJkHuZFGNG0sPzdu1b4nkAwqLqE14Yxp2bZvE8";
const ACUITY_BASE = "https://acuityscheduling.com/api/v1";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:5173";

// ─── Acuity ───────────────────────────────────────────────────────────────────

async function acuityFetch(path: string): Promise<unknown> {
  const userId = process.env.ACUITY_USER_ID!;
  const apiKey = process.env.ACUITY_API_KEY!;
  const token = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  const res = await fetch(`${ACUITY_BASE}${path}`, {
    headers: { Authorization: `Basic ${token}`, "Content-Type": "application/json" },
  });
  return res.json();
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

async function getGoogleAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  const jwt = `${unsigned}.${sign.sign(privateKey, "base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function readRange(token: string, range: string): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as { values?: string[][] };
  return data.values ?? [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategory(typeName: string): string {
  const t = typeName.toLowerCase();
  if (t.includes("open studio")) return "Open Studio";
  if (t.includes("birthday")) return "Birthday Party";
  if (t.includes("membership")) return "Membership";
  if (t.includes("tech hour")) return "Tech Hours";
  if (t.includes("private")) return "Private";
  if (t.includes("workshop")) return "Workshop";
  return "Class";
}

function shorten(name: string, max = 40): string {
  return name.length <= max ? name : name.slice(0, max).replace(/\s\S*$/, "");
}

// Convert "03-Mar-26" → "2026-03-03"
function toIsoDate(sheetDate: string): string {
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const m = sheetDate.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (!m) return sheetDate; // already ISO or unknown — pass through
  const [, day, mon, yr] = m;
  return `20${yr}-${months[mon] ?? "01"}-${day.padStart(2, "0")}`;
}

function inPeriod(dt: string, start: string, end: string): boolean {
  const d = dt.slice(0, 10);
  return d >= start && d < end;
}

// ─── Main action ──────────────────────────────────────────────────────────────

export const run = action({
  args: {
    payPeriodNumber: v.number(),
    // dryRun: true → log links only, don't send emails
    // dryRun: false → send emails (to testEmail if provided, else real instructors)
    dryRun: v.optional(v.boolean()),
    // testEmail: if set, all emails go here regardless of dryRun
    testEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const { testEmail } = args;

    const gToken = await getGoogleAccessToken();

    // 1. Read pay period dates from Pay Periods sheet tab
    const periodRows = await readRange(gToken, "Pay Periods!A2:D27");
    const periodRow = periodRows.find((r) => parseInt(r[0]) === args.payPeriodNumber);
    if (!periodRow) throw new Error(`Pay Period ${args.payPeriodNumber} not found in sheet`);
    const [, rawStart, rawEnd] = periodRow;
    const startDate = toIsoDate(rawStart);
    const endDate = toIsoDate(rawEnd);
    console.log(`Pay Period ${args.payPeriodNumber}: ${startDate} → ${endDate}`);

    // 2. Read instructor list from Instructors tab
    const instructorRows = await readRange(gToken, "Instructors!A2:G20");
    const activeInstructors = instructorRows.filter(
      (r) => r[0] && r[4]?.toLowerCase() === "yes"
    );
    console.log(`Active instructors: ${activeInstructors.map((r) => r[0]).join(", ")}`);

    // Map calendarId → instructor row
    const calendarMap = new Map<number, string[]>();
    for (const row of activeInstructors) {
      const calId = parseInt(row[3]);
      if (calId) calendarMap.set(calId, row);
    }

    // 3. Fetch appointments from Acuity
    const appointments = await acuityFetch(
      `/appointments?minDate=${startDate}&maxDate=${endDate}&max=500`
    ) as Array<{
      calendarID: number;
      appointmentTypeID: number;
      datetime: string;
      type: string;
      price: string;
      firstName: string;
      lastName: string;
    }>;
    console.log(`Fetched ${appointments.length} appointments from Acuity`);

    // 4. Group by instructor → collate into sessions
    const byCalendar = new Map<number, typeof appointments>();
    for (const appt of appointments) {
      if (!inPeriod(appt.datetime, startDate, endDate)) continue;
      if (!calendarMap.has(appt.calendarID)) continue; // skip excluded instructors
      const list = byCalendar.get(appt.calendarID) ?? [];
      list.push(appt);
      byCalendar.set(appt.calendarID, list);
    }

    const results: { instructor: string; email: string; link: string }[] = [];

    for (const [calId, appts] of byCalendar) {
      const instructorRow = calendarMap.get(calId)!;
      const [name, email] = instructorRow;

      // Collate into sessions
      const privateRows: { datetime: string; info: string; category: string; qty: number; price: number }[] = [];
      const groupMap = new Map<string, typeof appts>();

      for (const a of appts) {
        const cat = getCategory(a.type);
        if (cat === "Private") {
          privateRows.push({
            datetime: a.datetime,
            info: `${a.firstName} ${a.lastName}`.trim(),
            category: "Private",
            qty: 1,
            price: parseFloat(a.price) || 0,
          });
        } else {
          const key = `${a.appointmentTypeID}|${a.datetime.slice(0, 16)}`;
          const group = groupMap.get(key) ?? [];
          group.push(a);
          groupMap.set(key, group);
        }
      }

      const sessions = [
        ...Array.from(groupMap.values()).map((group) => ({
          datetime: group[0].datetime,
          info: shorten(group[0].type),
          category: getCategory(group[0].type),
          qty: group.length,
          price: parseFloat(group[0].price) || 0,
        })),
        ...privateRows,
      ].sort((a, b) => a.datetime.localeCompare(b.datetime));

      // 5. Create Convex submission record
      const token = crypto.randomUUID();

      // Find or create payPeriod + instructor records in Convex
      const submissionId = await ctx.runMutation(api.submissions.create, {
        payPeriodId: await ctx.runMutation(api.payPeriods.upsert, {
          number: args.payPeriodNumber,
          startDate,
          endDate,
          payDate: periodRow[3] ?? "",
        }),
        instructorId: await ctx.runMutation(api.instructors.upsert, {
          name,
          email,
          acuityCalendarId: calId,
        }),
        token,
        sessions: sessions.map((s) => ({
          datetime: s.datetime,
          info: s.info,
          category: s.category,
          quantity: s.qty,
          pricePerBooking: s.price,
        })),
      });

      const link = `${APP_BASE_URL}/submit/${token}`;
      results.push({ instructor: name, email, link });

      console.log(`Created submission for ${name}: ${link} (${sessions.length} sessions)`);

      // 6. Send email (or log in dry run)
      if (!dryRun) {
        const to = testEmail ?? email;
        // Email is sent via the andreas MCP in real usage.
        // For now, log the details so you can send manually via MCP.
        console.log(`TO: ${to}`);
        console.log(`SUBJECT: Studio Andreas - Please confirm your hours (Pay Period ${args.payPeriodNumber})`);
        console.log(`BODY: Hi ${name.split(" ")[0]},\n\nPlease confirm your hours for this pay period:\n${link}\n\nThanks!`);
      }
    }

    return {
      dryRun,
      payPeriod: args.payPeriodNumber,
      dateRange: `${startDate} → ${endDate}`,
      submissions: results,
    };
  },
});
