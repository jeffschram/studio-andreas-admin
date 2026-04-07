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

// ─── Formatting helpers ───────────────────────────────────────────────────────

async function getPayrollSheetId(token: string): Promise<number> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as { sheets: Array<{ properties: { sheetId: number; title: string } }> };
  const sheet = data.sheets.find((s) => s.properties.title === PAYROLL_TAB);
  return sheet?.properties.sheetId ?? 0;
}

// Parse a hex color string like "#EDF3ED" or "EDF3ED" to RGB fractions
function hexToRgb(hex: string): { red: number; green: number; blue: number } | null {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return {
    red: ((n >> 16) & 0xff) / 255,
    green: ((n >> 8) & 0xff) / 255,
    blue: (n & 0xff) / 255,
  };
}

// Palette of soft pastel backgrounds — one per instructor, consistent across pay periods
const INSTRUCTOR_COLORS = [
  { red: 0.929, green: 0.953, blue: 0.929 }, // sage green   #EDF3ED
  { red: 0.929, green: 0.941, blue: 0.961 }, // periwinkle   #EDF0F5
  { red: 0.961, green: 0.937, blue: 0.961 }, // lavender     #F5EFF5
  { red: 0.969, green: 0.945, blue: 0.929 }, // peach        #F7F1ED
  { red: 0.961, green: 0.961, blue: 0.929 }, // butter       #F5F5ED
  { red: 0.929, green: 0.961, blue: 0.957 }, // mint         #EDF5F4
  { red: 0.961, green: 0.929, blue: 0.937 }, // blush rose   #F5EDF0
  { red: 0.945, green: 0.929, blue: 0.961 }, // lilac        #F1EDF5
];

function instructorColorIndex(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % INSTRUCTOR_COLORS.length;
  return hash;
}

async function formatBlock(token: string, sheetId: number, startRow: number, endRow: number, instructorName: string, sheetColor?: string) {
  // Sheets API uses 0-based row indices; our startRow/endRow are 1-based
  const s = startRow - 1; // inclusive start (0-based)
  const e = endRow;       // exclusive end (0-based)

  const parsedColor = sheetColor ? hexToRgb(sheetColor) : null;
  const bg = parsedColor ?? INSTRUCTOR_COLORS[instructorColorIndex(instructorName)];

  const requests = [
    // Light background across all columns A–L
    {
      repeatCell: {
        range: { sheetId, startRowIndex: s, endRowIndex: e, startColumnIndex: 0, endColumnIndex: 12 },
        cell: { userEnteredFormat: { backgroundColor: bg } },
        fields: "userEnteredFormat.backgroundColor",
      },
    },
    // Bold + slightly larger instructor name (column B, first row only)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: s, endRowIndex: s + 1, startColumnIndex: 1, endColumnIndex: 2 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11 } } },
        fields: "userEnteredFormat.textFormat",
      },
    },
    // Bold pay period number (column A, first row)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: s, endRowIndex: s + 1, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    },
    // Bold the total in column K (first row)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: s, endRowIndex: s + 1, startColumnIndex: 10, endColumnIndex: 11 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    },
    // Thin grey bottom border to separate instructor blocks
    {
      updateBorders: {
        range: { sheetId, startRowIndex: e - 1, endRowIndex: e, startColumnIndex: 0, endColumnIndex: 12 },
        bottom: { style: "SOLID", width: 1, color: { red: 0.75, green: 0.75, blue: 0.75 } },
      },
    },
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );
  const json = await res.json();
  if (!res.ok) console.error("formatBlock error:", JSON.stringify(json));
}

// ─── Pay-period separator ─────────────────────────────────────────────────────

// Reads column A in the rows above startRow (up to 40 rows back) to find the
// most recent pay-period number. If it differs from the current payPeriodNum,
// we're the first instructor of a new pay period and need a bold black top border.
async function addPayPeriodSeparatorIfNeeded(
  token: string,
  sheetId: number,
  startRow: number,
  payPeriodNum: number
) {
  if (startRow <= 2) return; // Nothing above the header row

  const lookback = Math.max(2, startRow - 40);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`${PAYROLL_TAB}!A${lookback}:A${startRow - 1}`)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as { values?: string[][] };
  const rows = data.values ?? [];

  // Walk backwards to find the last non-empty cell in column A
  let lastPeriodNum: string | null = null;
  for (const row of rows) {
    if (row[0]?.trim()) lastPeriodNum = row[0].trim();
  }

  // Only draw the separator when the pay period above is different from ours
  if (lastPeriodNum !== null && lastPeriodNum !== String(payPeriodNum)) {
    const s = startRow - 1; // 0-based row index
    const borderRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              updateBorders: {
                range: { sheetId, startRowIndex: s, endRowIndex: s + 1, startColumnIndex: 0, endColumnIndex: 12 },
                top: { style: "SOLID_MEDIUM", width: 2, color: { red: 0, green: 0, blue: 0 } },
              },
            },
          ],
        }),
      }
    );
    const json = await borderRes.json();
    if (!borderRes.ok) console.error("addPayPeriodSeparator error:", JSON.stringify(json));
    else console.log(`Pay-period separator drawn before row ${startRow} (PP ${lastPeriodNum} → PP ${payPeriodNum})`);
  }
}

// ─── Read instructor config from sheet ───────────────────────────────────────

interface InstructorConfig {
  name: string;
  includeInPayroll: boolean;
  sheetColor?: string; // hex color e.g. "#EDF3ED"
}

async function getInstructorConfigs(token: string): Promise<Map<string, InstructorConfig>> {
  // Read through column N (index 13) to include the optional sheet color
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent("Instructors!A2:N20")}`,
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
      sheetColor: row[13]?.trim() || undefined, // column N
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
  // Known categories with specific splits; everything else (Open Studio, Tech Hours,
  // Party, Event Hours, Birthday Party, Additional Classtime Hours, Basic Hourly, etc.)
  // pays the instructor the full gross amount (H).
  return (
    `=IF(TRIM(LOWER(${D}))="private",(${H}*0.97)*0.75,` +
    `IF(TRIM(LOWER(${D}))="class",(${H}*0.87)/2,` +
    `IF(TRIM(LOWER(${D}))="workshop",(${H}*0.87)/2,` +
    `IF(TRIM(LOWER(${D}))="membership",(${H}*0.97)*0.1,${H}))))`
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

    // Fetch the Payroll tab's sheetId (needed for formatting requests)
    const sheetId = await getPayrollSheetId(gToken);

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
    const endRow = startRow + totalRows - 1;
    // K column: SUM of all instructor earnings for this block, on the first row only
    const kTotal = `=SUM(I${startRow}:I${endRow})`;

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
        isFirst ? kTotal : "",                             // K: Total to be paid (first row only)
        "",                                                // L: (unused)
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
        isFirst ? kTotal : "",                             // K: Total to be paid (first row only)
        "",                                                // L: (unused)
      ]);
      rowIdx++;
    }

    // Step 3: Overwrite the placeholder rows with the real data (with formulas)
    await writeRows(gToken, `${PAYROLL_TAB}!A${startRow}:L${endRow}`, rows);

    // Step 4: Apply formatting — background, bold name, bold total, bottom border
    await formatBlock(gToken, sheetId, startRow, endRow, instructorName, instructorConfig?.sheetColor);

    // Step 5: Draw a bold black top border if this is the first instructor of a new pay period
    await addPayPeriodSeparatorIfNeeded(gToken, sheetId, startRow, payPeriodNum);

    console.log(
      `Wrote ${rows.length} rows for ${instructorName} (Pay Period ${payPeriodNum}) ` +
      `at Payroll rows ${startRow}–${endRow} ` +
      `(${sessions.length} sessions, ${additionalEntries.length} additional entries)`
    );

    // Mark everything as synced in Convex
    await ctx.runMutation(internal.submissions.markSynced, { submissionId });
  },
});
