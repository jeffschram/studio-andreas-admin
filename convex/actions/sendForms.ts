"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import * as crypto from "crypto";

const SPREADSHEET_ID = "1KVEdNyJkHuZFGNG0sPzdu1b4nkAwqLqE14Yxp2bZvE8";
const ACUITY_BASE = "https://acuityscheduling.com/api/v1";
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, "");

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

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

const args = {
  payPeriodNumber: v.optional(v.number()),
  dryRun: v.optional(v.boolean()),
  testEmail: v.optional(v.string()),
};

type SendFormsArgs = {
  payPeriodNumber?: number;
  dryRun?: boolean;
  testEmail?: string;
};

// Shared handler used by both public and internal actions
async function sendFormsHandler(ctx: any, args: SendFormsArgs) {
    const dryRun = args.dryRun ?? true;
    const { testEmail } = args;

    const gToken = await getGoogleAccessToken();

    // 1. Read pay period dates from Pay Periods sheet tab
    const periodRows = await readRange(gToken, "Pay Periods!A2:D27");

    let periodRow: string[];
    let resolvedPeriodNumber: number;

    if (args.payPeriodNumber != null) {
      // Explicit period requested
      const found = periodRows.find((r) => parseInt(r[0]) === args.payPeriodNumber);
      if (!found) throw new Error(`Pay Period ${args.payPeriodNumber} not found in sheet`);
      periodRow = found;
      resolvedPeriodNumber = args.payPeriodNumber;
    } else {
      // Auto-detect: find the period containing today, or the most recently started
      const today = new Date().toISOString().slice(0, 10);
      const started = periodRows
        .filter((r) => r[0] && r[1] && r[2] && toIsoDate(r[1]) <= today)
        .sort((a, b) => toIsoDate(b[1]).localeCompare(toIsoDate(a[1])));
      if (started.length === 0) throw new Error("No active pay periods found");
      periodRow = started[0];
      resolvedPeriodNumber = parseInt(periodRow[0]);
      console.log(`Auto-detected pay period: ${resolvedPeriodNumber}`);
    }

    const [, rawStart, rawEnd] = periodRow;
    const startDate = toIsoDate(rawStart);
    const endDate = toIsoDate(rawEnd);
    console.log(`Pay Period ${resolvedPeriodNumber}: ${startDate} → ${endDate}`);

    // 2. Read instructor list + rate headers from Instructors tab
    const [rateHeaderRow, ...instructorRows] = await readRange(gToken, "Instructors!A1:M20");
    // Rate type labels start at column F (index 5)
    const rateHeaders = (rateHeaderRow ?? []).slice(5);

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

    // 3. Fetch appointment types (to identify series and get class sizes / full-course prices)
    const apptTypesRaw = await acuityFetch("/appointment-types");
    const apptTypeMap = new Map<number, { name: string; acuityType: string; classSize: number; price: number }>();
    if (Array.isArray(apptTypesRaw)) {
      for (const t of apptTypesRaw as Array<{ id: number; name: string; type: string; classSize: number | null; price: string }>) {
        apptTypeMap.set(t.id, {
          name: t.name,
          acuityType: t.type, // "service" | "class" | "series"
          classSize: t.classSize ?? 1,
          price: parseFloat(t.price) || 0,
        });
      }
    }
    console.log(`Loaded ${apptTypeMap.size} appointment types`);

    // 4. Fetch appointments from Acuity
    const acuityResponse = await acuityFetch(
      `/appointments?minDate=${startDate}&maxDate=${endDate}&max=500`
    );
    if (!Array.isArray(acuityResponse)) {
      throw new Error(`Acuity API error: ${JSON.stringify(acuityResponse)}`);
    }
    const appointments = acuityResponse as Array<{
      calendarID: number;
      appointmentTypeID: number;
      datetime: string;
      type: string;
      price: string;
      firstName: string;
      lastName: string;
    }>;
    console.log(`Fetched ${appointments.length} appointments from Acuity`);

    // 5. Group by instructor → collate into sessions
    const byCalendar = new Map<number, typeof appointments>();
    for (const appt of appointments) {
      if (!inPeriod(appt.datetime, startDate, endDate)) continue;
      if (!calendarMap.has(appt.calendarID)) continue; // skip excluded instructors
      const list = byCalendar.get(appt.calendarID) ?? [];
      list.push(appt);
      byCalendar.set(appt.calendarID, list);
    }

    const results: { instructor: string; email: string; link: string }[] = [];

    type SessionData = {
      datetime: string;
      info: string;
      category: string;
      qty: number;
      price: number;
      eventType: "start" | "end" | "session";
    };

    for (const [calId, appts] of byCalendar) {
      const instructorRow = calendarMap.get(calId)!;
      const [name, email] = instructorRow;

      // Separate series (multi-session classes) from non-series appointments
      const seriesByType = new Map<number, typeof appts>();
      const nonSeriesAppts: typeof appts = [];

      for (const a of appts) {
        const typeInfo = apptTypeMap.get(a.appointmentTypeID);
        if (typeInfo?.acuityType === "series") {
          const list = seriesByType.get(a.appointmentTypeID) ?? [];
          list.push(a);
          seriesByType.set(a.appointmentTypeID, list);
        } else {
          nonSeriesAppts.push(a);
        }
      }

      // Non-series: privates (per occurrence) + everything else (grouped by type+timeslot)
      const allSessions: SessionData[] = [];
      const groupMap = new Map<string, typeof appts>();

      for (const a of nonSeriesAppts) {
        const cat = getCategory(a.type);
        if (cat === "Private") {
          allSessions.push({
            datetime: a.datetime,
            info: `${a.firstName} ${a.lastName}`.trim(),
            category: "Private",
            qty: 1,
            price: parseFloat(a.price) || 0,
            eventType: "session",
          });
        } else {
          const key = `${a.appointmentTypeID}|${a.datetime.slice(0, 16)}`;
          const group = groupMap.get(key) ?? [];
          group.push(a);
          groupMap.set(key, group);
        }
      }

      for (const group of groupMap.values()) {
        allSessions.push({
          datetime: group[0].datetime,
          info: shorten(group[0].type),
          category: getCategory(group[0].type),
          qty: group.length,
          price: parseFloat(group[0].price) || 0,
          eventType: "session",
        });
      }

      // Series: determine which types start or end in this pay period
      if (seriesByType.size > 0) {
        const seriesChecks = await Promise.all(
          Array.from(seriesByType.entries()).map(async ([typeId, typeAppts]) => {
            const sorted = [...typeAppts].sort((a, b) => a.datetime.localeCompare(b.datetime));
            const firstDate = sorted[0].datetime.slice(0, 10);
            const lastDate = sorted[sorted.length - 1].datetime.slice(0, 10);
            const typeInfo = apptTypeMap.get(typeId);

            // Parallel: check for any sessions before this period (→ isStart) and after (→ isEnd)
            const [beforeRaw, afterRaw] = await Promise.all([
              acuityFetch(`/appointments?appointmentTypeID=${typeId}&calendarID=${calId}&maxDate=${addDays(firstDate, -1)}&max=1`),
              acuityFetch(`/appointments?appointmentTypeID=${typeId}&calendarID=${calId}&minDate=${addDays(lastDate, 1)}&max=1`),
            ]);

            const isStart = Array.isArray(beforeRaw) && beforeRaw.length === 0;
            const isEnd = Array.isArray(afterRaw) && afterRaw.length === 0;

            return { typeId, typeInfo, sorted, isStart, isEnd };
          })
        );

        for (const { typeInfo, sorted, isStart, isEnd } of seriesChecks) {
          if (!isStart && !isEnd) {
            console.log(`  Series type ${typeInfo?.name ?? "?"} — middle of series, skipping`);
            continue;
          }

          const typeName = typeInfo?.name ?? sorted[0].type;
          // classSize from appointment type; fall back to enrollment count this period
          const classSize = (typeInfo?.classSize ?? 0) > 0 ? typeInfo!.classSize : sorted.length;
          // Price from appointment type (full-course price per booking)
          const price = (typeInfo?.price ?? 0) > 0 ? typeInfo!.price : parseFloat(sorted[0].price) || 0;
          const category = getCategory(typeName);

          if (isStart) {
            allSessions.push({
              datetime: sorted[0].datetime,
              info: `${shorten(typeName)} (Start)`,
              category,
              qty: classSize,
              price,
              eventType: "start",
            });
            console.log(`  → Series START: ${typeName}`);
          }
          if (isEnd) {
            allSessions.push({
              datetime: sorted[sorted.length - 1].datetime,
              info: `${shorten(typeName)} (End)`,
              category,
              qty: classSize,
              price,
              eventType: "end",
            });
            console.log(`  → Series END: ${typeName}`);
          }
        }
      }

      const sessions = allSessions.sort((a, b) => a.datetime.localeCompare(b.datetime));

      // 6. Create Convex submission record
      const token = crypto.randomUUID();

      // Find or create payPeriod + instructor records in Convex
      await ctx.runMutation(api.submissions.create, {
        payPeriodId: await ctx.runMutation(api.payPeriods.upsert, {
          number: resolvedPeriodNumber,
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
        // Build per-instructor available rates from sheet columns F+ (index 5+)
        availableRates: rateHeaders
          .map((label, i) => ({ label, rate: parseFloat(instructorRow[5 + i] ?? "") || 0 }))
          .filter((r) => r.rate > 0),
        sessions: sessions.map((s) => ({
          datetime: s.datetime,
          info: s.info,
          category: s.category,
          quantity: s.qty,
          pricePerBooking: s.price,
          eventType: s.eventType,
        })),
      });

      const link = `${APP_BASE_URL}/submit/${token}`;
      results.push({ instructor: name, email, link });

      console.log(`Created submission for ${name}: ${link} (${sessions.length} sessions)`);

      // 7. Send email (or log in dry run)
      if (dryRun) {
        console.log(`[DRY RUN] Would email ${name} at ${email}: ${link}`);
      } else {
        const to = testEmail ?? email;
        const firstName = name.split(" ")[0];
        const subject = `Studio Andreas - Please confirm your hours (Pay Period ${resolvedPeriodNumber})`;
        const body = `Hi ${firstName},\n\nPlease confirm your hours for this pay period:\n${link}\n\nThanks!`;

        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) throw new Error("RESEND_API_KEY is not set in Convex environment variables");

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Studio Andreas <payroll@studioandreas.com>",
            to,
            subject,
            text: body,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Resend error for ${name}: ${err}`);
        }

        console.log(`Email sent to ${to} for ${name}`);
      }
    }

    return {
      dryRun,
      payPeriod: resolvedPeriodNumber,
      dateRange: `${startDate} → ${endDate}`,
      submissions: results,
    };
}

// Public — callable via CLI: npx convex run actions/sendForms:run '...'
export const run = action({ args, handler: sendFormsHandler });

// Internal — callable from http.ts HTTP action
export const runInternal = internalAction({ args, handler: sendFormsHandler });

// ─── Pay period info (lightweight, no submissions created) ───────────────────

async function payPeriodInfoHandler() {
  const gToken = await getGoogleAccessToken();

  // Read all pay period dates
  const periodRows = await readRange(gToken, "Pay Periods!A2:D27");
  const today = new Date().toISOString().slice(0, 10);

  // Build list of all started pay periods (most recent first)
  const allPeriods = periodRows
    .filter((r) => r[0] && r[1] && r[2] && toIsoDate(r[1]) <= today)
    .sort((a, b) => toIsoDate(b[1]).localeCompare(toIsoDate(a[1])))
    .map((r) => ({
      periodNumber: parseInt(r[0]),
      startDate: toIsoDate(r[1]),
      endDate: toIsoDate(r[2]),
      payDate: r[3] ? toIsoDate(r[3]) : undefined,
    }));

  if (allPeriods.length === 0) throw new Error("No active pay periods found");

  const currentPeriodNumber = allPeriods[0].periodNumber;

  // Read active instructors
  const instructorRows = await readRange(gToken, "Instructors!A2:G20");
  const instructors = instructorRows
    .filter((r) => r[0] && r[4]?.toLowerCase() === "yes")
    .map((r) => ({ name: r[0], email: r[1] }));

  return { allPeriods, currentPeriodNumber, instructors };
}

export const getPayPeriodInfoInternal = internalAction({
  args: {},
  handler: payPeriodInfoHandler,
});

// ─── Period preview (appointments per instructor, no series detection) ────────

export const previewPeriodInternal = internalAction({
  args: { payPeriodNumber: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    const gToken = await getGoogleAccessToken();

    // Resolve period dates
    const periodRows = await readRange(gToken, "Pay Periods!A2:D27");
    let periodRow: string[];
    let resolvedPeriodNumber: number;

    if (args.payPeriodNumber != null) {
      const found = periodRows.find((r) => parseInt(r[0]) === args.payPeriodNumber);
      if (!found) throw new Error(`Pay Period ${args.payPeriodNumber} not found`);
      periodRow = found;
      resolvedPeriodNumber = args.payPeriodNumber;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const started = periodRows
        .filter((r) => r[0] && r[1] && r[2] && toIsoDate(r[1]) <= today)
        .sort((a, b) => toIsoDate(b[1]).localeCompare(toIsoDate(a[1])));
      if (started.length === 0) throw new Error("No active pay periods found");
      periodRow = started[0];
      resolvedPeriodNumber = parseInt(periodRow[0]);
    }

    const startDate = toIsoDate(periodRow[1]);
    const endDate = toIsoDate(periodRow[2]);

    // Load active instructors
    const [, ...instructorRows] = await readRange(gToken, "Instructors!A1:M20");
    const activeInstructors = instructorRows.filter((r) => r[0] && r[4]?.toLowerCase() === "yes");
    const calendarMap = new Map<number, string[]>();
    for (const row of activeInstructors) {
      const calId = parseInt(row[3]);
      if (calId) calendarMap.set(calId, row);
    }

    // Fetch appointments from Acuity
    const acuityResponse = await acuityFetch(
      `/appointments?minDate=${startDate}&maxDate=${endDate}&max=500`
    );
    if (!Array.isArray(acuityResponse)) {
      throw new Error(`Acuity API error: ${JSON.stringify(acuityResponse)}`);
    }

    type AcuityAppt = {
      calendarID: number;
      appointmentTypeID: number;
      datetime: string;
      type: string;
      price: string;
      firstName: string;
      lastName: string;
    };
    const appointments = acuityResponse as AcuityAppt[];

    // Group by instructor calendar
    const byCalendar = new Map<number, AcuityAppt[]>();
    for (const appt of appointments) {
      if (!inPeriod(appt.datetime, startDate, endDate)) continue;
      if (!calendarMap.has(appt.calendarID)) continue;
      const list = byCalendar.get(appt.calendarID) ?? [];
      list.push(appt);
      byCalendar.set(appt.calendarID, list);
    }

    // Fetch appointment types to identify series
    const apptTypesRaw = await acuityFetch("/appointment-types");
    const apptTypeMap = new Map<number, { name: string; acuityType: string; classSize: number; price: number }>();
    if (Array.isArray(apptTypesRaw)) {
      for (const t of apptTypesRaw as Array<{ id: number; name: string; type: string; classSize: number | null; price: string }>) {
        apptTypeMap.set(t.id, {
          name: t.name,
          acuityType: t.type,
          classSize: t.classSize ?? 1,
          price: parseFloat(t.price) || 0,
        });
      }
    }

    // Build per-instructor appointment summaries (same series logic as sendForms)
    const instructors = await Promise.all(activeInstructors.map(async (row) => {
      const calId = parseInt(row[3]);
      const appts = byCalendar.get(calId) ?? [];

      type PreviewAppt = { info: string; category: string; datetime: string; quantity: number };
      const grouped: PreviewAppt[] = [];

      // Separate series from non-series
      const seriesByType = new Map<number, AcuityAppt[]>();
      const nonSeriesAppts: AcuityAppt[] = [];
      for (const a of appts) {
        const typeInfo = apptTypeMap.get(a.appointmentTypeID);
        if (typeInfo?.acuityType === "series") {
          const list = seriesByType.get(a.appointmentTypeID) ?? [];
          list.push(a);
          seriesByType.set(a.appointmentTypeID, list);
        } else {
          nonSeriesAppts.push(a);
        }
      }

      // Non-series: privates individually, others grouped by type+timeslot
      const groupMap = new Map<string, AcuityAppt[]>();
      for (const a of nonSeriesAppts) {
        const cat = getCategory(a.type);
        if (cat === "Private") {
          grouped.push({
            info: `${a.firstName} ${a.lastName}`.trim(),
            category: "Private",
            datetime: a.datetime,
            quantity: 1,
          });
        } else {
          const key = `${a.appointmentTypeID}|${a.datetime.slice(0, 16)}`;
          const group = groupMap.get(key) ?? [];
          group.push(a);
          groupMap.set(key, group);
        }
      }
      for (const group of groupMap.values()) {
        grouped.push({
          info: shorten(group[0].type),
          category: getCategory(group[0].type),
          datetime: group[0].datetime,
          quantity: group.length,
        });
      }

      // Series: detect start/end — same parallel Acuity calls as sendForms
      if (seriesByType.size > 0) {
        const seriesChecks = await Promise.all(
          Array.from(seriesByType.entries()).map(async ([typeId, typeAppts]) => {
            const sorted = [...typeAppts].sort((a, b) => a.datetime.localeCompare(b.datetime));
            const firstDate = sorted[0].datetime.slice(0, 10);
            const lastDate = sorted[sorted.length - 1].datetime.slice(0, 10);
            const typeInfo = apptTypeMap.get(typeId);

            const [beforeRaw, afterRaw] = await Promise.all([
              acuityFetch(`/appointments?appointmentTypeID=${typeId}&calendarID=${calId}&maxDate=${addDays(firstDate, -1)}&max=1`),
              acuityFetch(`/appointments?appointmentTypeID=${typeId}&calendarID=${calId}&minDate=${addDays(lastDate, 1)}&max=1`),
            ]);

            const isStart = Array.isArray(beforeRaw) && beforeRaw.length === 0;
            const isEnd = Array.isArray(afterRaw) && afterRaw.length === 0;
            return { typeInfo, sorted, isStart, isEnd };
          })
        );

        for (const { typeInfo, sorted, isStart, isEnd } of seriesChecks) {
          if (!isStart && !isEnd) continue; // middle of series — skip
          const typeName = typeInfo?.name ?? sorted[0].type;
          const classSize = (typeInfo?.classSize ?? 0) > 0 ? typeInfo!.classSize : sorted.length;
          const category = getCategory(typeName);

          if (isStart) {
            grouped.push({ info: `${shorten(typeName)} (Start)`, category, datetime: sorted[0].datetime, quantity: classSize });
          }
          if (isEnd) {
            grouped.push({ info: `${shorten(typeName)} (End)`, category, datetime: sorted[sorted.length - 1].datetime, quantity: classSize });
          }
        }
      }

      grouped.sort((a, b) => a.datetime.localeCompare(b.datetime));
      return { name: row[0], email: row[1], calendarId: calId, appointments: grouped };
    }));

    return { payPeriod: resolvedPeriodNumber, startDate, endDate, instructors };
  },
});
