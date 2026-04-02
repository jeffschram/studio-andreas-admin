"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import * as crypto from "crypto";

const SPREADSHEET_ID = "1KVEdNyJkHuZFGNG0sPzdu1b4nkAwqLqE14Yxp2bZvE8";
const PAYROLL_TAB = "Payroll";

// ─── Google Auth ─────────────────────────────────────────────────────────────

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

// ─── Sheets API helpers ───────────────────────────────────────────────────────

async function writeRows(token: string, range: string, rows: string[][]) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    }
  );
  const json = await res.json();
  if (!res.ok) console.error(`writeRows error for ${range}:`, JSON.stringify(json));
  return json;
}

async function appendRows(token: string, rows: string[][]): Promise<number> {
  // Append rows after last data row in Payroll tab. Returns the 1-indexed start row of appended data.
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(PAYROLL_TAB)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    }
  );
  const json = await res.json() as { updates?: { updatedRange?: string } };
  if (!res.ok) {
    console.error("appendRows error:", JSON.stringify(json));
    return -1;
  }
  // Parse the start row from updatedRange like "Payroll!A42:L50"
  const updatedRange = json.updates?.updatedRange ?? "";
  const match = updatedRange.match(/!A(\d+)/);
  return match ? parseInt(match[1]) : -1;
}

// ─── Read instructor config from sheet ───────────────────────────────────────

interface InstructorConfig {
  name: string;
  includeInPayroll: boolean;
}

async function getInstructorConfigs(token: string): Promise<Map<string, InstructorConfig>> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent("Instructors!A2:E20")}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as { values?: string[][] };
  const map = new Map<string, InstructorConfig>();
  for (const row of data.values ?? []) {
    const [name, , , , includeInPayroll] = row;
    if (!name) continue;
    map.set(name, {
      name,
      includeInPayroll: includeInPayroll?.toLowerCase() === "yes",
    });
  }
  return map;
}

// ─── Payment formula ──────────────────────────────────────────────────────────

// The spreadsheet formula for instructor earnings based on category:
//   Private:    (H * 0.97) * 0.75   — per occurrence
//   Class:      (H * 0.87) / 2      — at series start OR end (half each time)
//   Workshop:   (H * 0.87) / 2      — same as class
//   Membership: (H * 0.97) * 0.1
//   Other:      blank
function earningsFormula(rowNum: number): string {
  const D = `D${rowNum}`;
  const H = `H${rowNum}`;
  return (
    `=IF(TRIM(LOWER(${D}))="private",(${H}*0.97)*0.75,` +
    `IF(TRIM(LOWER(${D}))="class",(${H}*0.87)/2,` +
    `IF(TRIM(LOWER(${D}))="workshop",(${H}*0.87)/2,` +
    `IF(TRIM(LOWER(${D}))="membership",(${H}*0.97)*0.1,""))))`
  );
}

// ─── Main sync action ─────────────────────────────────────────────────────────

export const run = internalAction({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const data = await ctx.runQuery(internal.submissions.getForSync, {
      submissionId,
    });
    if (!data) throw new Error("Submission not found");

    const { sessions, additionalEntries, instructor, payPeriod, submission } = data;
    const gToken = await getGoogleAccessToken();

    // Read instructor config from Instructors sheet tab
    const instructorConfigs = await getInstructorConfigs(gToken);
    const instructorConfig = instructor ? instructorConfigs.get(instructor.name) : undefined;

    if (instructorConfig && !instructorConfig.includeInPayroll) {
      console.log(`Skipping ${instructor?.name} — excluded from payroll`);
      return;
    }

    const instructorName = instructor?.name ?? "Unknown";
    const payPeriodNum = payPeriod?.number ?? 0;
    const rateMap = new Map(
      (submission.availableRates ?? []).map((r) => [r.label, r.rate])
    );

    // Build placeholder rows — we'll append first, then rewrite with correct row numbers
    // (Two-step: append placeholders → get start row → rewrite with formulas)
    const totalRows = sessions.length + additionalEntries.length;
    if (totalRows === 0) {
      console.log(`No rows to write for ${instructorName}`);
      await ctx.runMutation(internal.submissions.markSynced, { submissionId });
      return;
    }

    // Step 1: Append placeholder rows to learn which rows we get
    const placeholders = Array.from({ length: totalRows }, (_, i) => [
      i === 0 ? String(payPeriodNum) : "",
      i === 0 ? instructorName : "",
      "...", // will be overwritten
    ]);
    const startRow = await appendRows(gToken, placeholders);
    if (startRow < 0) {
      throw new Error("Failed to append placeholder rows to Payroll tab");
    }

    // Step 2: Build proper rows now that we know row numbers
    const rows: string[][] = [];
    let rowIdx = startRow;

    for (const session of sessions) {
      const isFirst = rows.length === 0;
      const grossFormula = session.pricePerBooking > 0 ? `=E${rowIdx}*G${rowIdx}` : "";
      rows.push([
        isFirst ? String(payPeriodNum) : "",              // A: Pay Period
        isFirst ? instructorName : "",                     // B: Instructor
        session.info,                                      // C: Class name / description
        session.category,                                  // D: Category
        String(session.quantity),                          // E: Student count (or 1 for privates)
        session.confirmedByInstructor ? "TRUE" : "DISPUTED", // F: Confirmed
        session.pricePerBooking > 0 ? `$${session.pricePerBooking.toFixed(2)}` : "", // G: Price per booking
        grossFormula,                                      // H: Gross Total (=E*G)
        session.pricePerBooking > 0 ? earningsFormula(rowIdx) : "", // I: Instructor Earnings
        "",                                                // J: Commissions
        session.pricePerBooking > 0 ? `=I${rowIdx}` : "", // K: To Be Paid
        session.datetime.slice(0, 10),                     // L: Date
      ]);
      rowIdx++;
    }

    for (const entry of additionalEntries) {
      const isFirst = rows.length === 0;
      const rate = rateMap.get(entry.type) ?? 0;
      const earnings = rate > 0 ? (entry.hours * rate).toFixed(2) : "";
      rows.push([
        isFirst ? String(payPeriodNum) : "",              // A: Pay Period
        isFirst ? instructorName : "",                     // B: Instructor
        entry.notes ? `${entry.type} - ${entry.notes}` : entry.type, // C: Description
        entry.type,                                        // D: Category
        String(entry.hours),                               // E: Hours
        "TRUE",                                            // F: Confirmed
        rate > 0 ? `$${rate.toFixed(2)}` : "",             // G: Hourly rate
        rate > 0 ? `=E${rowIdx}*G${rowIdx}` : "",          // H: Total
        earnings,                                          // I: Instructor Earnings (flat: hours × rate)
        "",                                                // J: Commissions
        earnings ? `=I${rowIdx}` : "",                     // K: To Be Paid
        entry.date,                                        // L: Date
      ]);
      rowIdx++;
    }

    // Step 3: Overwrite the placeholder rows with the real data (with formulas)
    const endRow = startRow + rows.length - 1;
    await writeRows(gToken, `${PAYROLL_TAB}!A${startRow}:L${endRow}`, rows);

    console.log(
      `Wrote ${rows.length} rows for ${instructorName} (Pay Period ${payPeriodNum}) ` +
      `at Payroll rows ${startRow}–${endRow} ` +
      `(${sessions.length} sessions, ${additionalEntries.length} additional entries)`
    );

    // Mark everything as synced in Convex
    await ctx.runMutation(internal.submissions.markSynced, { submissionId });
  },
});
