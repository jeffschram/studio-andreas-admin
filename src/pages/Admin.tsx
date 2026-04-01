import { useState } from "react";

// Studio Andreas brand palette
const C = {
  green:  "#344734",
  orange: "#F1A638",
  cream:  "#F0DEC6",
  black:  "#000000",
  white:  "#FFFFFF",
  offwhite: "#FAFAFA",
};

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string;

type Submission = {
  instructor: string;
  email: string;
  link: string;
};

type SendResult = {
  dryRun: boolean;
  payPeriod: number;
  dateRange: string;
  submissions: Submission[];
};

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [adminSecret, setAdminSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [mode, setMode] = useState<"dryRun" | "testEmail" | "live">("dryRun");
  const [testEmail, setTestEmail] = useState("");

  // Simple password gate — the actual security is the ADMIN_SECRET bearer token
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSecret(password);
    setAuthenticated(true);
  };

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const body: Record<string, unknown> = {};

    if (mode === "dryRun") {
      body.dryRun = true;
    } else if (mode === "testEmail") {
      body.dryRun = false;
      body.testEmail = testEmail;
    } else {
      body.dryRun = false;
    }

    try {
      const res = await fetch(`${CONVEX_SITE_URL}/api/send-forms`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        setError("Unauthorized — check admin password");
        setAuthenticated(false);
        return;
      }

      if (!res.ok) {
        const text = await res.text();
        setError(`Error: ${text}`);
        return;
      }

      const data: SendResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div style={{ background: C.cream, minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <form onSubmit={handleLogin} style={{ background: C.white, padding: 40, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", maxWidth: 380, width: "100%" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: C.green, textTransform: "uppercase", marginBottom: 8 }}>
            Studio Andreas
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 24px", color: C.black }}>
            Admin Login
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid #ddd`, fontSize: 15, marginBottom: 16, boxSizing: "border-box" }}
          />
          <button
            type="submit"
            style={{ width: "100%", padding: "10px 0", borderRadius: 8, background: C.green, color: C.white, fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            Log In
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ background: C.cream, minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: C.black }}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: C.green, textTransform: "uppercase", marginBottom: 8 }}>
            Studio Andreas · Admin
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.black, margin: 0 }}>
            Send Payroll Forms
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
            Automatically detects the most recently completed pay period and emails each instructor a link to confirm their hours.
          </p>
        </div>

        {/* Mode selector */}
        <div style={{ background: C.white, borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px" }}>
            Send Mode
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="radio" name="mode" checked={mode === "dryRun"} onChange={() => setMode("dryRun")} />
              <div>
                <strong style={{ fontSize: 14 }}>Dry Run</strong>
                <p style={{ margin: 0, fontSize: 13, color: "#777" }}>Preview which instructors will be emailed — no emails sent</p>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="radio" name="mode" checked={mode === "testEmail"} onChange={() => setMode("testEmail")} />
              <div>
                <strong style={{ fontSize: 14 }}>Test Email</strong>
                <p style={{ margin: 0, fontSize: 13, color: "#777" }}>Send all emails to a single test address</p>
              </div>
            </label>

            {mode === "testEmail" && (
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                style={{ marginLeft: 28, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, maxWidth: 300 }}
              />
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="radio" name="mode" checked={mode === "live"} onChange={() => setMode("live")} />
              <div>
                <strong style={{ fontSize: 14, color: "#b91c1c" }}>Send to Instructors</strong>
                <p style={{ margin: 0, fontSize: 13, color: "#777" }}>Send real emails to each instructor's email address</p>
              </div>
            </label>
          </div>
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={loading || (mode === "testEmail" && !testEmail)}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 10,
            background: loading ? "#999" : mode === "live" ? "#b91c1c" : C.green,
            color: C.white,
            fontSize: 16,
            fontWeight: 700,
            border: "none",
            cursor: loading ? "wait" : "pointer",
            marginBottom: 24,
            transition: "background 0.2s",
          }}
        >
          {loading ? "Processing..." : mode === "dryRun" ? "Preview Pay Period" : mode === "testEmail" ? "Send Test Emails" : "Send to All Instructors"}
        </button>

        {/* Confirmation for live sends */}
        {mode === "live" && !loading && !result && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, marginBottom: 24, fontSize: 13, color: "#991b1b" }}>
            <strong>Warning:</strong> This will send real emails to all active instructors. Use "Dry Run" first to preview.
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, marginBottom: 24, fontSize: 14, color: "#991b1b" }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ background: C.white, borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                {result.dryRun ? "Preview" : "Sent"}
              </h2>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 20,
                background: result.dryRun ? C.cream : "#dcfce7",
                color: result.dryRun ? C.green : "#166534",
              }}>
                Pay Period {result.payPeriod}
              </span>
            </div>

            <p style={{ fontSize: 13, color: "#888", margin: "0 0 16px" }}>
              {result.dateRange} · {result.submissions.length} instructor{result.submissions.length !== 1 ? "s" : ""}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {result.submissions.map((sub, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.offwhite, borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{sub.instructor}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{sub.email}</div>
                  </div>
                  <a
                    href={sub.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: C.green, fontWeight: 600, textDecoration: "none" }}
                  >
                    View form →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
