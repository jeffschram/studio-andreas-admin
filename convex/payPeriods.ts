import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const upsert = mutation({
  args: {
    number: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    payDate: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payPeriods")
      .withIndex("by_number", (q) => q.eq("number", args.number))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        startDate: args.startDate,
        endDate: args.endDate,
        payDate: args.payDate,
      });
      return existing._id;
    }

    return ctx.db.insert("payPeriods", {
      number: args.number,
      startDate: args.startDate,
      endDate: args.endDate,
      payDate: args.payDate,
      status: "forms_sent",
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("payPeriods").collect();
  },
});
