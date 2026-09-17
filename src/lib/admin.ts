// Shared bits for the admin-only pages (/admin, /history).

// Studio Andreas brand palette
export const C = {
  green: "#344734",
  orange: "#F1A638",
  cream: "#F0DEC6",
  black: "#000000",
  white: "#FFFFFF",
  offwhite: "#FAFAFA",
};

// Dev: use relative path so Vite proxies the request (avoids CORS).
// Production: use the full Convex site URL directly.
export const API_BASE = import.meta.env.DEV
  ? ""
  : ((import.meta.env.VITE_CONVEX_SITE_URL as string) ?? "");

// The admin password doubles as the ADMIN_SECRET bearer token. Holding it in
// sessionStorage keeps the login alive across /admin ↔ /history navigation;
// it clears when the tab closes.
const SECRET_KEY = "sa-admin-secret";

export function loadAdminSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveAdminSecret(secret: string) {
  try {
    sessionStorage.setItem(SECRET_KEY, secret);
  } catch {
    // Private browsing / storage disabled — the page still works, the login
    // just won't survive navigation.
  }
}

export function clearAdminSecret() {
  try {
    sessionStorage.removeItem(SECRET_KEY);
  } catch {
    // ignore
  }
}

// Same palette and hash the sheet sync uses for instructor block backgrounds,
// so a block is the same color here as in the spreadsheet. Kept in step with
// INSTRUCTOR_COLORS / instructorColorIndex in convex/actions/syncToSheet.ts.
const INSTRUCTOR_COLORS = [
  "#EDF3ED", // sage green
  "#EDF0F5", // periwinkle
  "#F5EFF5", // lavender
  "#F7F1ED", // peach
  "#F5F5ED", // butter
  "#EDF5F4", // mint
  "#F5EDF0", // blush rose
  "#F1EDF5", // lilac
];

export function instructorColor(name: string): string {
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) % INSTRUCTOR_COLORS.length;
  }
  return INSTRUCTOR_COLORS[hash];
}

export function formatShortDate(iso: string, includeYear = false): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}
