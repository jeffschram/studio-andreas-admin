import { useState, useEffect } from "react";

// Studio Andreas brand palette
const C = {
  green: "#344734",
  orange: "#F1A638",
  cream: "#F0DEC6",
  black: "#000000",
  white: "#FFFFFF",
  offwhite: "#FAFAFA",
};

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string;

type Instructor = { name: string; email: string };

type Period = {
  periodNumber: number;
  startDate: string;
  endDate: string;
  payDate?: string;
};

type PayPeriodData = {
  allPeriods: Period[];
  currentPeriodNumber: number;
  instructors: Instructor[];
};

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

function formatDate(iso: string, includeYear = false): string {
  const d = new Date(iso + "T12:00:00");
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const rest = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    ...(includeYear && { year: "numeric" }),
  });
  return `${day} ${rest}`;
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [adminSecret, setAdminSecret] = useState("");

  // Pay period data
  const [data, setData] = useState<PayPeriodData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [useTestEmail, setUseTestEmail] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  // Fetch pay period data on login
  useEffect(() => {
    if (!authenticated) return;
    setLoading(true);
    setError(null);
    fetch(`${CONVEX_SITE_URL}/api/pay-period-info`, {
      headers: { Authorization: `Bearer ${adminSecret}` },
    })
      .then(async (res) => {
        if (res.status === 401) {
          setAuthenticated(false);
          setError("Unauthorized — check admin password");
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const d: PayPeriodData = await res.json();
        setData(d);
        setSelectedPeriod(d.currentPeriodNumber);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [authenticated, adminSecret]);

  const activePeriod = data?.allPeriods.find(
    (p) => p.periodNumber === selectedPeriod,
  );
  const isCurrent = selectedPeriod === data?.currentPeriodNumber;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSecret(password);
    setAuthenticated(true);
  };

  const handlePeriodChange = (num: number) => {
    setSelectedPeriod(num);
    setSendResult(null);
    setSendError(null);
  };

  const handleSend = async () => {
    if (!activePeriod || !data) return;

    if (!useTestEmail) {
      const ok = window.confirm(
        `This will send real emails to ${data.instructors.length} instructors for Pay Period ${activePeriod.periodNumber}. Continue?`,
      );
      if (!ok) return;
    }

    setSending(true);
    setSendError(null);
    setSendResult(null);

    const body: Record<string, unknown> = {
      dryRun: false,
      payPeriodNumber: activePeriod.periodNumber,
    };
    if (useTestEmail && testEmail) {
      body.testEmail = testEmail;
    }

    try {
      const res = await fetch(`${CONVEX_SITE_URL}/api/send-forms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const result: SendResult = await res.json();
      setSendResult(result);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSending(false);
    }
  };

  // ── Login screen ──
  if (!authenticated) {
    return (
      <div
        style={{
          background: C.cream,
          minHeight: "100vh",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{
            background: C.white,
            padding: 40,
            borderRadius: 12,
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            maxWidth: 380,
            width: "100%",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: C.green,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Studio Andreas
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 24px",
              color: C.black,
            }}
          >
            Admin Login
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 15,
              marginBottom: 16,
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 8,
              background: C.green,
              color: C.white,
              fontSize: 15,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Log In
          </button>
        </form>
      </div>
    );
  }

  // ── Main admin page ──
  return (
    <div
      style={{
        background: C.cream,
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: C.black,
      }}
    >
      <div
        style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px 80px" }}
      >
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: C.green,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Studio Andreas · Admin
          </p>
          <h1
            style={{ fontSize: 28, fontWeight: 800, color: C.black, margin: 0 }}
          >
            Payroll
          </h1>
        </div>

        {/* Loading state */}
        {loading && (
          <div
            style={{
              background: C.white,
              borderRadius: 12,
              padding: 32,
              textAlign: "center",
              color: "#888",
              fontSize: 14,
            }}
          >
            Loading pay period info...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: 16,
              fontSize: 14,
              color: "#991b1b",
            }}
          >
            {error}
          </div>
        )}

        {/* Pay period selector + content */}
        {data && activePeriod && (
          <>
            {/* Period selector */}
            <div style={{ marginBottom: 24 }}>
              <select
                value={selectedPeriod ?? ""}
                onChange={(e) => handlePeriodChange(parseInt(e.target.value))}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: `1px solid #ccc`,
                  background: C.white,
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.black,
                  cursor: "pointer",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23666' d='M1.4 0L6 4.6 10.6 0 12 1.4 6 7.4 0 1.4z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 16px center",
                  paddingRight: 44,
                }}
              >
                {data.allPeriods.map((p) => (
                  <option key={p.periodNumber} value={p.periodNumber}>
                    Pay Period {p.periodNumber}
                    {": "}
                    {formatDate(p.startDate)} – {formatDate(p.endDate, true)}
                    {p.periodNumber === data.currentPeriodNumber
                      ? "  (current)"
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            {!sendResult && (
              <>
                {/* Period card */}
                <div
                  style={{
                    background: C.white,
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 24,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 16,
                    }}
                  >
                    <h2
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        margin: 0,
                        color: C.black,
                      }}
                    >
                      Pay Period {activePeriod.periodNumber}
                    </h2>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: 20,
                        background: isCurrent ? C.cream : "#f3f4f6",
                        color: isCurrent ? C.green : "#666",
                      }}
                    >
                      {isCurrent ? "Current" : "Past"}
                    </span>
                  </div>

                  <div
                    style={{ fontSize: 15, color: "#555", marginBottom: 20 }}
                  >
                    {formatDate(activePeriod.startDate)} —{" "}
                    {formatDate(activePeriod.endDate, true)}
                    {activePeriod.payDate && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 13,
                          color: "#999",
                          marginTop: 4,
                        }}
                      >
                        Pay date: {formatDate(activePeriod.payDate, true)}
                      </span>
                    )}
                  </div>

                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.green,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      margin: "0 0 12px",
                    }}
                  >
                    {data.instructors.length} Instructor
                    {data.instructors.length !== 1 ? "s" : ""}
                  </h3>

                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {data.instructors.map((inst, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 14px",
                          background: C.offwhite,
                          borderRadius: 8,
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          {inst.name}
                        </span>
                        <span style={{ fontSize: 12, color: "#888" }}>
                          {inst.email}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Send options */}
                <div
                  style={{
                    background: C.white,
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 24,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      marginBottom: useTestEmail ? 12 : 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={useTestEmail}
                      onChange={(e) => setUseTestEmail(e.target.checked)}
                    />
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        Send to test email instead
                      </span>
                      <p style={{ margin: 0, fontSize: 13, color: "#777" }}>
                        All emails go to a single address for testing
                      </p>
                    </div>
                  </label>
                  {useTestEmail && (
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="test@example.com"
                      style={{
                        marginLeft: 28,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        fontSize: 14,
                        maxWidth: 300,
                      }}
                    />
                  )}
                </div>

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={sending || (useTestEmail && !testEmail)}
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    borderRadius: 10,
                    background: sending
                      ? "#999"
                      : useTestEmail
                        ? C.green
                        : C.orange,
                    color: useTestEmail ? C.white : C.black,
                    fontSize: 16,
                    fontWeight: 700,
                    border: "none",
                    cursor: sending ? "wait" : "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  {sending
                    ? "Sending..."
                    : useTestEmail
                      ? "Send Test Emails"
                      : `Send Forms to ${data.instructors.length} Instructors`}
                </button>

                {sendError && (
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 10,
                      padding: 16,
                      marginTop: 16,
                      fontSize: 14,
                      color: "#991b1b",
                    }}
                  >
                    {sendError}
                  </div>
                )}
              </>
            )}

            {/* Results after sending */}
            {sendResult && (
              <div
                style={{
                  background: C.white,
                  borderRadius: 12,
                  padding: 24,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      margin: 0,
                      color: C.black,
                    }}
                  >
                    Emails Sent
                  </h2>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "4px 12px",
                      borderRadius: 20,
                      background: "#dcfce7",
                      color: "#166534",
                    }}
                  >
                    Pay Period {sendResult.payPeriod}
                  </span>
                </div>

                <p style={{ fontSize: 14, color: "#555", margin: "0 0 20px" }}>
                  {formatDate(sendResult.dateRange.split(" → ")[0])} —{" "}
                  {formatDate(sendResult.dateRange.split(" → ")[1], true)}
                  <br />
                  <span style={{ fontSize: 13, color: "#888" }}>
                    {sendResult.submissions.length} instructor
                    {sendResult.submissions.length !== 1 ? "s" : ""} emailed
                  </span>
                </p>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {sendResult.submissions.map((sub, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        background: C.offwhite,
                        borderRadius: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {sub.instructor}
                        </div>
                        <div style={{ fontSize: 12, color: "#888" }}>
                          {sub.email}
                        </div>
                      </div>
                      <a
                        href={sub.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 12,
                          color: C.green,
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        View form →
                      </a>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setSendResult(null)}
                  style={{
                    marginTop: 20,
                    padding: "10px 20px",
                    borderRadius: 8,
                    background: "transparent",
                    color: C.green,
                    fontSize: 14,
                    fontWeight: 600,
                    border: `1px solid ${C.green}`,
                    cursor: "pointer",
                  }}
                >
                  ← Back
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
