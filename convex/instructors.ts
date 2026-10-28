import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const upsert = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    acuityCalendarId: v.number(),
  },
  handler: async (ctx, args) => {
    // Instructors without an Acuity calendar (ID 0 / blank) all share the same
    // calendar ID, so match them by email instead.
    const email = args.email.trim().toLowerCase();
    const existing = args.acuityCalendarId
      ? await ctx.db
          .query("instructors")
          .withIndex("by_calendar_id", (q) =>
            q.eq("acuityCalendarId", args.acuityCalendarId)
          )
          .unique()
      : (await ctx.db.query("instructors").collect()).find(
          (i) => !i.acuityCalendarId && i.email.trim().toLowerCase() === email
        );

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
      });
      return existing._id;
    }

    return ctx.db.insert("instructors", {
      acuityCalendarId: args.acuityCalendarId,
      name: args.name,
      email: args.email,
      active: true,
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("instructors").collect();
  },
});
