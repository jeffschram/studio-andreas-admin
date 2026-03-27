"use node";

import { action } from "../_generated/server";
import * as crypto from "crypto";

const SPREADSHEET_ID = "1KVEdNyJkHuZFGNG0sPzdu1b4nkAwqLqE14Yxp2bZvE8";

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

async function batchUpdate(token: string, requests: unknown[]) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
  const json = await res.json();
  if (!res.ok) console.error("batchUpdate error:", JSON.stringify(json));
  return json;
}

async function writeRange(token: string, range: string, values: string[][]) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
  const json = await res.json();
  if (!res.ok) console.error("writeRange error:", JSON.stringify(json));
  return json;
}

export const run = action({
  args: {},
  handler: async (_ctx) => {
    const token = await getGoogleAccessToken();

    // Check if Instructors tab already exists
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const meta = await metaRes.json() as {
      sheets: { properties: { title: string; sheetId: number } }[];
    };
    const exists = meta.sheets.some((s) => s.properties.title === "Instructors");

    if (!exists) {
      await batchUpdate(token, [
        { addSheet: { properties: { title: "Instructors", index: 1 } } },
      ]);
      console.log("Created Instructors tab");
    }

    // Write instructor data
    const rows = [
      ["Name", "Email", "Discipline", "Acuity Calendar ID", "Include in Payroll", "Tech Hours Rate ($/hr)", "Notes"],
      ["Cheslea Danburg",  "chelsea@blujoywrks.com",       "Textiles",      "12542356", "Yes", "25", ""],
      ["Herb Thomas",      "herbrowmas@gmail.com",          "Woodworking",   "13451000", "Yes", "25", ""],
      ["Justin Wiest",     "justinwiest@yahoo.com",         "Drawing",       "13527733", "Yes", "25", ""],
      ["Maria Spiess",     "mariakspiess@gmail.com",        "Ceramics",      "12574138", "Yes", "25", ""],
      ["Mark Andreas",     "mark.andreas@gmail.com",        "Woodworking",   "8018454",  "No",  "",   "Owner — excluded from payroll"],
      ["Nerea Nicholson",  "nereanicholsons@gmail.com",     "Ceramics",      "12468385", "Yes", "25", ""],
      ["Olivia Lapine",    "oliviajane5683@gmail.com",      "",              "13567121", "Yes", "25", "1099 contractor"],
      ["Owen Hughes",      "hughes_owen@icloud.com",        "Ceramics",      "13538496", "Yes", "25", ""],
    ];

    await writeRange(token, "Instructors!A1:G9", rows);
    console.log("Wrote instructor data");

    return { success: true };
  },
});
