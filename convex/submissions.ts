import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// Get a submission by its URL token (used by the form page)
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const submission = await ctx.db
      .query("submissions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!submission) return null;

    const [instructor, payPeriod, sessions, additionalEntries] =
      await Promise.all([
        ctx.db.get(submission.instructorId),
        ctx.db.get(submission.payPeriodId),
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

    return { submission, instructor, payPeriod, sessions, additionalEntries };
  },
});

// Get all submissions for a pay period (admin view)
export const getByPayPeriod = query({
  args: { payPeriodId: v.id("payPeriods") },
  handler: async (ctx, { payPeriodId }) => {
    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_pay_period", (q) => q.eq("payPeriodId", payPeriodId))
      .collect();

    return Promise.all(
      submissions.map(async (s) => ({
        ...s,
        instructor: await ctx.db.get(s.instructorId),
      }))
    );
  },
});

// Instructor submits their form
export const submit = mutation({
  args: {
    token: v.string(),
    // Array of session IDs and their confirmed status
    sessionConfirmations: v.array(
      v.object({
        sessionId: v.id("sessions"),
        confirmed: v.boolean(),
      })
    ),
    // Additional hours entries
    additionalEntries: v.array(
      v.object({
        date: v.string(),
        type: v.string(),
        hours: v.number(),
        notes: v.optional(v.string()),
      })
    ),
    // Membership counts (first pay period of month only, Nerea + Chelsea)
    membershipCounts: v.optional(
      v.array(v.object({ label: v.string(), count: v.number(), pricePerMember: v.number() }))
    ),
    instructorNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db
      .query("submissions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!submission) throw new Error("Submission not found");
    if (submission.status === "submitted")
      throw new Error("Already submitted");

    // Update each session's confirmed status
    await Promise.all(
      args.sessionConfirmations.map(({ sessionId, confirmed }) =>
        ctx.db.patch(sessionId, { confirmedByInstructor: confirmed })
      )
    );

    // Insert additional hours entries
    await Promise.all(
      args.additionalEntries.map((entry) =>
        ctx.db.insert("additionalEntries", {
          submissionId: submission._id,
          date: entry.date,
          type: entry.type,
          hours: entry.hours,
          notes: entry.notes,
          syncedToSheet: false,
        })
      )
    );

    // Mark submission as submitted
    const validMembershipCounts = (args.membershipCounts ?? []).filter((m) => m.count > 0);
    await ctx.db.patch(submission._id, {
      status: "submitted",
      submittedAt: Date.now(),
      instructorNotes: args.instructorNotes,
      membershipCounts: validMembershipCounts.length > 0 ? validMembershipCounts : undefined,
    });

    // Trigger sheet sync async (non-blocking)
    await ctx.scheduler.runAfter(0, internal.actions.syncToSheet.run, {
      submissionId: submission._id,
    });

    return { success: true };
  },
});

// Create a submission (called when sending forms out)
export const create = mutation({
  args: {
    payPeriodId: v.id("payPeriods"),
    instructorId: v.id("instructors"),
    token: v.string(),
    availableRates: v.optional(v.array(v.object({ label: v.string(), rate: v.number() }))),
    membershipOptions: v.optional(v.array(v.object({ label: v.string(), pricePerMember: v.number() }))),
    sessions: v.array(
      v.object({
        datetime: v.string(),
        info: v.string(),
        category: v.string(),
        quantity: v.number(),
        pricePerBooking: v.number(),
        eventType: v.optional(v.union(v.literal("start"), v.literal("end"), v.literal("session"))),
        sheetRow: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const submissionId = await ctx.db.insert("submissions", {
      payPeriodId: args.payPeriodId,
      instructorId: args.instructorId,
      token: args.token,
      status: "pending",
      availableRates: args.availableRates,
      membershipOptions: args.membershipOptions,
    });

    await Promise.all(
      args.sessions.map((session) =>
        ctx.db.insert("sessions", {
          submissionId,
          datetime: session.datetime,
          info: session.info,
          category: session.category,
          quantity: session.quantity,
          pricePerBooking: session.pricePerBooking,
          eventType: session.eventType,
          sheetRow: session.sheetRow,
          confirmedByInstructor: true, // default to confirmed; instructor unchecks to dispute
          syncedToSheet: false,
        })
      )
    );

    return submissionId;
  },
});

// ─── Internal: used by syncToSheet action ─────────────────────────────────────

export const getForSync = internalQuery({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const submission = await ctx.db.get(submissionId);
    if (!submission) return null;

    const [instructor, payPeriod, sessions, additionalEntries] =
      await Promise.all([
        ctx.db.get(submission.instructorId),
        ctx.db.get(submission.payPeriodId),
        ctx.db
          .query("sessions")
          .withIndex("by_submission", (q) =>
            q.eq("submissionId", submissionId)
          )
          .collect(),
        ctx.db
          .query("additionalEntries")
          .withIndex("by_submission", (q) =>
            q.eq("submissionId", submissionId)
          )
          .collect(),
      ]);

    return { submission, instructor, payPeriod, sessions, additionalEntries };
  },
});

// ─── DEV ONLY: wipe all payroll data for clean test runs ──────────────────────

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [submissions, sessions, additionalEntries, payPeriods, instructors] =
      await Promise.all([
        ctx.db.query("submissions").collect(),
        ctx.db.query("sessions").collect(),
        ctx.db.query("additionalEntries").collect(),
        ctx.db.query("payPeriods").collect(),
        ctx.db.query("instructors").collect(),
      ]);

    await Promise.all([
      ...submissions.map((r) => ctx.db.delete(r._id)),
      ...sessions.map((r) => ctx.db.delete(r._id)),
      ...additionalEntries.map((r) => ctx.db.delete(r._id)),
      ...payPeriods.map((r) => ctx.db.delete(r._id)),
      ...instructors.map((r) => ctx.db.delete(r._id)),
    ]);

    return {
      cleared: {
        submissions: submissions.length,
        sessions: sessions.length,
        additionalEntries: additionalEntries.length,
        payPeriods: payPeriods.length,
        instructors: instructors.length,
      },
    };
  },
});

// ─── Internal: submission statuses for a pay period (admin status view) ───────

export const getStatusesForPeriod = internalQuery({
  args: { payPeriodNumber: v.number() },
  handler: async (ctx, { payPeriodNumber }) => {
    const payPeriod = await ctx.db
      .query("payPeriods")
      .withIndex("by_number", (q) => q.eq("number", payPeriodNumber))
      .unique();
    if (!payPeriod) return [];

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_pay_period", (q) => q.eq("payPeriodId", payPeriod._id))
      .collect();

    return Promise.all(
      submissions.map(async (sub) => {
        const instructor = await ctx.db.get(sub.instructorId);
        const sessions = await ctx.db
          .query("sessions")
          .withIndex("by_submission", (q) => q.eq("submissionId", sub._id))
          .collect();
        const additionalEntries = await ctx.db
          .query("additionalEntries")
          .withIndex("by_submission", (q) => q.eq("submissionId", sub._id))
          .collect();
        const totalRows = sessions.length + additionalEntries.length;
        const syncedRows = sessions.filter((s) => s.syncedToSheet).length + additionalEntries.filter((e) => e.syncedToSheet).length;
        const synced = sub.status === "submitted" && totalRows > 0 && syncedRows === totalRows;
        return {
          instructorName: instructor?.name ?? "Unknown",
          status: sub.status as "pending" | "submitted",
          submittedAt: sub.submittedAt,
          synced,
          token: sub.token,
        };
      })
    );
  },
});

export const markSynced = internalMutation({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .collect();

    const additionalEntries = await ctx.db
      .query("additionalEntries")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .collect();

    await Promise.all([
      ...sessions.map((s) => ctx.db.patch(s._id, { syncedToSheet: true })),
      ...additionalEntries.map((e) =>
        ctx.db.patch(e._id, { syncedToSheet: true })
      ),
    ]);
  },
});
