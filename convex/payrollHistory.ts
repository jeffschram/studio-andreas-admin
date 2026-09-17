import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// A read-only history of what instructors submitted, grouped the way the
// Payroll tab groups it: one block per instructor per pay period.
//
// Deliberately carries no rates, totals or earnings — the spreadsheet stays
// the only place payroll money is calculated.

export type HistoryRow = {
  info: string;
  category: string;
  quantity: number;
  confirmed: boolean;
};

function buildRows(
  sessions: Doc<"sessions">[],
  additionalEntries: Doc<"additionalEntries">[],
  submission: Doc<"submissions">
): HistoryRow[] {
  const rows: HistoryRow[] = [];

  // Same order the sheet sync writes them in: sessions, then additional
  // entries, then memberships.
  for (const session of sessions) {
    rows.push({
      info: session.info,
      category: session.category,
      quantity: session.quantity,
      confirmed: session.confirmedByInstructor,
    });
  }

  for (const entry of additionalEntries) {
    rows.push({
      info: entry.notes ? `${entry.type} - ${entry.notes}` : entry.type,
      category: entry.type,
      quantity: entry.hours,
      confirmed: true,
    });
  }

  for (const membership of (submission.membershipCounts ?? []).filter(
    (m) => m.count > 0
  )) {
    rows.push({
      info: membership.label,
      category: "Membership",
      quantity: membership.count,
      confirmed: true,
    });
  }

  return rows;
}

export const getHistory = internalQuery({
  args: { payPeriodNumber: v.optional(v.number()) },
  handler: async (ctx, { payPeriodNumber }) => {
    const allPeriods = await ctx.db.query("payPeriods").collect();
    const periods =
      payPeriodNumber === undefined
        ? allPeriods
        : allPeriods.filter((p) => p.number === payPeriodNumber);

    // Newest pay period first, so the most recent submissions are at the top.
    periods.sort((a, b) => b.number - a.number);

    const blocks = [];

    for (const period of periods) {
      const submissions = await ctx.db
        .query("submissions")
        .withIndex("by_pay_period", (q) => q.eq("payPeriodId", period._id))
        .collect();

      const submitted = submissions.filter((s) => s.status === "submitted");

      // Within a period, order by submission time.
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
        // An empty submission writes nothing to the sheet, so it gets no block
        // here either.
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
          // The free-text "Notes for admin" field on the submission form.
          instructorNotes: submission.instructorNotes,
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
