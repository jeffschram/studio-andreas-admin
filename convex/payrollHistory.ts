import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Mirrors the Payroll tab in the spreadsheet, built straight from the database.
//
// The sheet stores formulas; this module stores the values those formulas
// evaluate to, so the History page can show the same numbers without a round
// trip to Google. Anything changed in actions/syncToSheet.ts needs changing
// here too — the two are deliberately parallel.

// The spreadsheet's column I formula, evaluated in TypeScript. See
// earningsFormula() in actions/syncToSheet.ts for the sheet-side original:
//   Private:    (gross * 0.97) * 0.75
//   Class:      (gross * 0.87) / 2
//   Workshop:   (gross * 0.87) / 2
//   Membership: (gross * 0.97) * 0.1
//   everything else pays the full gross
function instructorEarnings(category: string, gross: number): number {
  switch (category.trim().toLowerCase()) {
    case "private":
      return gross * 0.97 * 0.75;
    case "class":
      return (gross * 0.87) / 2;
    case "workshop":
      return (gross * 0.87) / 2;
    case "membership":
      return gross * 0.97 * 0.1;
    default:
      return gross;
  }
}

export type HistoryRow = {
  info: string;
  category: string;
  quantity: number;
  confirmed: boolean;
  pricePerBooking: number | null;
  grossTotal: number | null;
  instructorEarnings: number | null;
  // Column J is never written by the app — it's filled in by hand in the sheet.
  commissions: null;
  // Sort key only; not rendered as a column.
  sortDate: string;
};

function buildRows(
  sessions: Doc<"sessions">[],
  additionalEntries: Doc<"additionalEntries">[],
  submission: Doc<"submissions">
): HistoryRow[] {
  const rows: HistoryRow[] = [];

  // Same order the sync writes them in: sessions, then additional entries,
  // then memberships.
  for (const session of sessions) {
    const priced = session.pricePerBooking > 0;
    const gross = priced ? session.quantity * session.pricePerBooking : null;
    rows.push({
      info: session.info,
      category: session.category,
      quantity: session.quantity,
      confirmed: session.confirmedByInstructor,
      pricePerBooking: priced ? session.pricePerBooking : null,
      grossTotal: gross,
      instructorEarnings:
        gross === null ? null : instructorEarnings(session.category, gross),
      commissions: null,
      sortDate: session.datetime,
    });
  }

  const rateMap = new Map(
    (submission.availableRates ?? []).map((r) => [r.label, r.rate])
  );

  for (const entry of additionalEntries) {
    const rate = rateMap.get(entry.type) ?? 0;
    // The sync writes a literal hours × rate here rather than the column I
    // formula, so this stays a flat multiplication even for a type whose name
    // happens to collide with a category like "Private".
    const earnings = rate > 0 ? entry.hours * rate : null;
    rows.push({
      info: entry.notes ? `${entry.type} - ${entry.notes}` : entry.type,
      category: entry.type,
      quantity: entry.hours,
      confirmed: true,
      pricePerBooking: rate > 0 ? rate : null,
      grossTotal: rate > 0 ? entry.hours * rate : null,
      instructorEarnings: earnings,
      commissions: null,
      sortDate: entry.date,
    });
  }

  for (const membership of (submission.membershipCounts ?? []).filter(
    (m) => m.count > 0
  )) {
    const gross = membership.count * membership.pricePerMember;
    rows.push({
      info: membership.label,
      category: "Membership",
      quantity: membership.count,
      confirmed: true,
      pricePerBooking: membership.pricePerMember,
      grossTotal: gross,
      instructorEarnings: instructorEarnings("Membership", gross),
      commissions: null,
      sortDate: "",
    });
  }

  return rows;
}

// One instructor's block of rows within a pay period — the unit the sheet
// shades a single background color and draws a bottom border under.
export const getHistory = internalQuery({
  args: { payPeriodNumber: v.optional(v.number()) },
  handler: async (ctx, { payPeriodNumber }) => {
    const allPeriods = await ctx.db.query("payPeriods").collect();
    const periods =
      payPeriodNumber === undefined
        ? allPeriods
        : allPeriods.filter((p) => p.number === payPeriodNumber);

    // Newest pay period first, so the most recent payroll is at the top.
    periods.sort((a, b) => b.number - a.number);

    const blocks = [];

    for (const period of periods) {
      const submissions = await ctx.db
        .query("submissions")
        .withIndex("by_pay_period", (q) => q.eq("payPeriodId", period._id))
        .collect();

      const submitted = submissions.filter((s) => s.status === "submitted");

      // Within a period, order by submission time — the order the sync wrote
      // the blocks into the sheet.
      submitted.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));

      for (const submission of submitted) {
        const [instructor, sessions, additionalEntries] = await Promise.all([
          ctx.db.get(submission.instructorId),
          ctx.db
            .query("sessions")
            .withIndex("by_submission", (q) =>
              q.eq("submissionId", submission._id)
            )
            .collect(),
          ctx.db
            .query("additionalEntries")
            .withIndex("by_submission", (q) =>
              q.eq("submissionId", submission._id)
            )
            .collect(),
        ]);

        const rows = buildRows(sessions, additionalEntries, submission);
        // A submission with nothing in it writes no rows to the sheet, so it
        // gets no block here either.
        if (rows.length === 0) continue;

        const syncableRows = sessions.length + additionalEntries.length;
        const syncedRows =
          sessions.filter((s) => s.syncedToSheet).length +
          additionalEntries.filter((e) => e.syncedToSheet).length;

        blocks.push({
          payPeriodNumber: period.number,
          startDate: period.startDate,
          endDate: period.endDate,
          payDate: period.payDate,
          instructorName: instructor?.name ?? "Unknown",
          submittedAt: submission.submittedAt,
          instructorNotes: submission.instructorNotes,
          // Column K: =SUM(I<start>:I<end>) over the block.
          toBePaid: rows.reduce(
            (sum, row) => sum + (row.instructorEarnings ?? 0),
            0
          ),
          synced: syncableRows > 0 && syncedRows === syncableRows,
          rows,
        });
      }
    }

    return {
      periods: allPeriods
        .map((p) => ({
          number: p.number,
          startDate: p.startDate,
          endDate: p.endDate,
          payDate: p.payDate,
        }))
        .sort((a, b) => b.number - a.number),
      blocks,
    };
  },
});
