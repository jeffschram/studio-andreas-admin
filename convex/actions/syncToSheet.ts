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

async function getSheetsMeta(token: string) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return (await res.json()) as {
    sheets: { properties: { title: string; sheetId: number } }[];
  };
}

async function putCell(token: string, range: string, value: string) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [[value]] }),
    }
  );
  const json = await res.json();
  if (!res.ok) console.error(`putCell error for ${range}:`, JSON.stringify(json));
  return json;
}

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

async function insertRowsAfter(
  token: string,
  sheetId: number,
  afterRow1Indexed: number,
  count: number
) {
  // Sheets API is 0-indexed; inserting at startIndex = afterRow pushes everything down
  const startIndex = afterRow1Indexed;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex,
                endIndex: startIndex + count,
              },
              inheritFromBefore: true,
            },
          },
        ],
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) console.error("insertRows error:", JSON.stringify(json));
  return json;
}

async function deleteTab(token: string, sheetId: number) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ deleteSheet: { sheetId } }],
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) console.error("deleteTab error:", JSON.stringify(json));
}

// ─── Read instructor config from sheet ───────────────────────────────────────

interface InstructorConfig {
  name: string;
  includeInPayroll: boolean;
  techHoursRate: number; // $/hr
}

async function getInstructorConfigs(token: string): Promise<Map<string, InstructorConfig>> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent("Instructors!A2:G20")}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as { values?: string[][] };
  const map = new Map<string, InstructorConfig>();
  for (const row of data.values ?? []) {
    const [name, , , , includeInPayroll, techHoursRate] = row;
    if (!name) continue;
    map.set(name, {
      name,
      includeInPayroll: includeInPayroll?.toLowerCase() === "yes",
      techHoursRate: parseFloat(techHoursRate ?? "0") || 0,
    });
  }
  return map;
}

// ─── Main sync action ─────────────────────────────────────────────────────────

export const run = internalAction({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const data = await ctx.runQuery(internal.submissions.getForSync, {
      submissionId,
    });
    if (!data) throw new Error("Submission not found");

    const { sessions, additionalEntries, instructor, payPeriod } = data;
    const token = await getGoogleAccessToken();

    // Read instructor config from Instructors sheet tab
    const instructorConfigs = await getInstructorConfigs(token);
    const instructorConfig = instructor ? instructorConfigs.get(instructor.name) : undefined;

    if (instructorConfig && !instructorConfig.includeInPayroll) {
      console.log(`Skipping ${instructor?.name} — excluded from payroll`);
      return;
    }

    // Get sheet metadata (tab IDs)
    const meta = await getSheetsMeta(token);
    const payrollSheet = meta.sheets.find(
      (s) => s.properties.title === PAYROLL_TAB
    );
    if (!payrollSheet) throw new Error(`Tab "${PAYROLL_TAB}" not found in sheet`);
    const payrollSheetId = payrollSheet.properties.sheetId;

    // Clean up the old "Additional Hours" tab if it exists
    const oldTab = meta.sheets.find(
      (s) => s.properties.title === "Additional Hours"
    );
    if (oldTab) {
      await deleteTab(token, oldTab.properties.sheetId);
      console.log("Deleted old Additional Hours tab");
    }

    // 1. Update Confirmed column (F) for each session with a known sheet row
    for (const session of sessions) {
      if (!session.sheetRow) continue;
      const value = session.confirmedByInstructor ? "TRUE" : "DISPUTED";
      await putCell(token, `${PAYROLL_TAB}!F${session.sheetRow}`, value);
    }

    // 2. Insert additional entries into the instructor's block
    if (additionalEntries.length > 0) {
      const sessionRows = sessions
        .map((s) => s.sheetRow)
        .filter((r): r is number => r !== undefined);

      const lastRow = sessionRows.length > 0 ? Math.max(...sessionRows) : null;

      if (lastRow === null) {
        console.warn("No sheetRows found for sessions — cannot place additional entries");
      } else {
        // Insert blank rows after the instructor's last row
        await insertRowsAfter(token, payrollSheetId, lastRow, additionalEntries.length);

        // Write each additional entry into the newly inserted rows
        const techHoursRate = instructorConfig?.techHoursRate ?? 0;
        const rows = additionalEntries.map((entry, i) => {
          const n = lastRow + 1 + i;
          // Calculate earnings based on type and rate from Instructors sheet
          let earnings = "";
          if (entry.type === "Tech Hours" && techHoursRate > 0) {
            earnings = (entry.hours * techHoursRate).toFixed(2);
          }
          return [
            "",                          // A: Pay Period (blank, same block)
            "",                          // B: Instructor (blank, same block)
            entry.notes ?? "",           // C: Info / description
            entry.type,                  // D: Category (Tech Hours etc.)
            entry.hours.toString(),      // E: Quantity / hours
            "TRUE",                      // F: Confirmed
            techHoursRate > 0 ? `$${techHoursRate.toFixed(2)}` : "", // G: Rate
            earnings ? `=E${n}*G${n}` : "",  // H: Gross Total
            earnings,                    // I: Instructor Earnings (rate × hours)
            "",                          // J: Commissions
            "",                          // K: To Be Paid (already in first row of block)
            entry.date,                  // L: Date for reference
          ];
        });

        const startRow = lastRow + 1;
        const endRow = lastRow + additionalEntries.length;
        await writeRows(
          token,
          `${PAYROLL_TAB}!A${startRow}:L${endRow}`,
          rows
        );

        console.log(
          `Inserted ${additionalEntries.length} additional entries after row ${lastRow}`
        );
      }
    }

    // 3. Mark everything as synced in Convex
    await ctx.runMutation(internal.submissions.markSynced, { submissionId });

    console.log(
      `Synced submission ${submissionId}: ` +
        `${sessions.length} sessions, ${additionalEntries.length} additional entries`
    );
  },
});
