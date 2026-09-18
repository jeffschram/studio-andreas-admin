import { useState, useEffect, Fragment } from "react";
import AdminNav from "@/components/AdminNav";
import AdminLogin from "@/components/AdminLogin";
import {
  C,
  API_BASE,
  loadAdminSecret,
  saveAdminSecret,
  clearAdminSecret,
  instructorColor,
  formatShortDate,
} from "@/lib/admin";

type HistoryRow = {
  info: string;
  category: string;
  quantity: number;
  confirmed: boolean;
};

type HistoryBlock = {
  payPeriodNumber: number;
  startDate: string;
  endDate: string;
  payDate: string;
  instructorName: string;
  submittedAt?: number;
  instructorNotes?: string;
  synced: boolean;
  rows: HistoryRow[];
};

type Period = {
  number: number;
  startDate: string;
  endDate: string;
  payDate: string;
};

type HistoryData = {
  periods: Period[];
  blocks: HistoryBlock[];
};

// No explicit widths — the browser sizes each column from its content.
const COLUMNS = [
  { label: "Pay Period", align: "right" as const },
  { label: "Instructor", align: "left" as const },
  { label: "Info", align: "left" as const },
  { label: "Category", align: "left" as const },
  { label: "Quantity/hours", align: "right" as const },
  { label: "Confirmed", align: "left" as const },
];

const CELL_BORDER = "1px solid rgba(0,0,0,0.12)";

export default function History() {
  const [adminSecret, setAdminSecret] = useState(() => loadAdminSecret());
  const [authError, setAuthError] = useState<string | null>(null);

  const [data, setData] = useState<HistoryData | null>(null);
  // Starts true because an authenticated mount always fetches straight away.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null means "all pay periods"
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  useEffect(() => {
    if (!adminSecret) return;
    // Switching periods quickly can leave an older request in flight; ignore
    // whichever one we no longer care about rather than letting it land last.
    let cancelled = false;
    const query =
      selectedPeriod === null ? "" : `?payPeriodNumber=${selectedPeriod}`;

    fetch(`${API_BASE}/api/payroll-history${query}`, {
      headers: { Authorization: `Bearer ${adminSecret}` },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          clearAdminSecret();
          setAdminSecret("");
          setAuthError("Unauthorized — check admin password");
          return;
        }
        if (!res.ok) {
          const detail = (await res.text()).trim();
          // Convex answers an unrouted path with a bare "No matching routes
          // found", which says nothing useful to whoever is looking at it.
          throw new Error(
            res.status === 404
              ? "The payroll history endpoint isn't on this Convex deployment yet. Run `npx convex dev` to push it."
              : `Request failed (${res.status})${detail ? `: ${detail}` : ""}`
          );
        }
        const json = (await res.json()) as HistoryData;
        if (cancelled) return;
        setData(json);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load payroll history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [adminSecret, selectedPeriod]);

  const handleLogin = (password: string) => {
    saveAdminSecret(password);
    setAuthError(null);
    setLoading(true);
    setAdminSecret(password);
  };

  const handleLogOut = () => {
    clearAdminSecret();
    setAdminSecret("");
    setData(null);
  };

  const handlePeriodChange = (period: number | null) => {
    setLoading(true);
    setSelectedPeriod(period);
  };

  if (!adminSecret) {
    return <AdminLogin title="Payroll History" error={authError} onSubmit={handleLogin} />;
  }

  const blocks = data?.blocks ?? [];
  const rowCount = blocks.reduce((sum, b) => sum + b.rows.length, 0);

  return (
    <div
      style={{
        background: C.cream,
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: C.black,
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
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
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.black, margin: 0 }}>
            History
          </h1>
        </div>

        <AdminNav current="history" onLogOut={handleLogOut} />

        {/* Period selector + summary */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <select
            value={selectedPeriod ?? "all"}
            onChange={(e) =>
              handlePeriodChange(
                e.target.value === "all" ? null : parseInt(e.target.value)
              )
            }
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              background: C.white,
              fontSize: 14,
              fontWeight: 600,
              minWidth: 280,
            }}
          >
            <option value="all">All pay periods</option>
            {(data?.periods ?? []).map((p) => (
              <option key={p.number} value={p.number}>
                Pay Period {p.number} — {formatShortDate(p.startDate)}–
                {formatShortDate(p.endDate, true)}
              </option>
            ))}
          </select>

          {data && !loading && (
            <p style={{ fontSize: 13, color: "#6b6b6b", margin: 0 }}>
              {blocks.length} {blocks.length === 1 ? "submission" : "submissions"} ·{" "}
              {rowCount} {rowCount === 1 ? "entry" : "entries"}
            </p>
          )}
        </div>

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
            Loading payroll history...
          </div>
        )}

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

        {data && !loading && blocks.length === 0 && (
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
            No submitted payroll data
            {selectedPeriod !== null ? ` for pay period ${selectedPeriod}` : ""} yet.
          </div>
        )}

        {/* The table */}
        {data && !loading && blocks.length > 0 && (
          <div
            style={{
              background: C.white,
              borderRadius: 12,
              overflowX: "auto",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <table
              style={{
                borderCollapse: "collapse",
                fontSize: 13,
                width: "100%",
              }}
            >
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.label}
                      style={{
                        textAlign: col.align,
                        padding: "8px 8px",
                        fontWeight: 700,
                        fontSize: 12,
                        background: C.white,
                        // The sheet's double rule under the header row.
                        borderBottom: "3px double rgba(0,0,0,0.55)",
                        borderRight: CELL_BORDER,
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                        lineHeight: 1.25,
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blocks.map((block, blockIdx) => {
                  const background = instructorColor(block.instructorName);
                  const prev = blocks[blockIdx - 1];
                  // The sheet draws a bold black rule where the pay period changes.
                  const startsNewPeriod =
                    !prev || prev.payPeriodNumber !== block.payPeriodNumber;
                  const blockBorder = "1px solid rgba(0,0,0,0.35)";
                  const topBorder = startsNewPeriod ? "2px solid #000" : undefined;

                  return (
                    <Fragment key={`${block.payPeriodNumber}-${block.instructorName}`}>
                      {block.rows.map((row, rowIdx) => {
                        const isFirst = rowIdx === 0;
                        const isLast = rowIdx === block.rows.length - 1;
                        const cellStyle: React.CSSProperties = {
                          padding: "5px 8px",
                          verticalAlign: "top",
                          borderRight: CELL_BORDER,
                          borderTop: isFirst ? topBorder : undefined,
                          borderBottom: isLast ? blockBorder : undefined,
                        };
                        // Pay period and instructor are merged down the block,
                        // the way they read as one label in the sheet. Merging
                        // also keeps the admin note from stretching the first
                        // row out of line with the rest.
                        const mergedStyle: React.CSSProperties = {
                          ...cellStyle,
                          borderTop: topBorder,
                          borderBottom: blockBorder,
                        };

                        return (
                          <tr key={rowIdx} style={{ background }}>
                            {isFirst && (
                              <>
                                {/* A: Pay Period */}
                                <td
                                  rowSpan={block.rows.length}
                                  style={{
                                    ...mergedStyle,
                                    textAlign: "right",
                                    fontWeight: 700,
                                  }}
                                >
                                  {block.payPeriodNumber}
                                </td>
                                {/* B: Instructor, with their note for the admin */}
                                <td
                                  rowSpan={block.rows.length}
                                  style={{
                                    ...mergedStyle,
                                    fontWeight: 700,
                                    fontSize: 13.5,
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    {block.instructorName}
                                    {!block.synced && (
                                      <span
                                        title="Not yet synced to the spreadsheet"
                                        style={{
                                          fontSize: 9,
                                          fontWeight: 700,
                                          letterSpacing: "0.06em",
                                          color: "#92400e",
                                          background: "#fef3c7",
                                          border: "1px solid #fde68a",
                                          borderRadius: 4,
                                          padding: "1px 4px",
                                        }}
                                      >
                                        UNSYNCED
                                      </span>
                                    )}
                                  </span>
                                  {block.instructorNotes && (
                                    <span
                                      style={{
                                        display: "block",
                                        marginTop: 5,
                                        fontSize: 11.5,
                                        fontWeight: 400,
                                        fontStyle: "italic",
                                        lineHeight: 1.4,
                                        color: "#4a4a4a",
                                      }}
                                    >
                                      “{block.instructorNotes}”
                                    </span>
                                  )}
                                </td>
                              </>
                            )}
                            {/* C: Info */}
                            <td style={{ ...cellStyle, fontWeight: 600 }}>
                              {row.info}
                            </td>
                            {/* D: Category */}
                            <td style={{ ...cellStyle, fontWeight: 600 }}>{row.category}</td>
                            {/* E: Quantity / hours */}
                            <td style={{ ...cellStyle, textAlign: "right" }}>
                              {row.quantity}
                            </td>
                            {/* F: Confirmed */}
                            <td
                              style={{
                                ...cellStyle,
                                borderRight: undefined,
                                fontWeight: row.confirmed ? 400 : 700,
                                color: row.confirmed ? undefined : "#991b1b",
                              }}
                            >
                              {row.confirmed ? "TRUE" : "DISPUTED"}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
