import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Mirrors the Pay Periods tab in the spreadsheet
  payPeriods: defineTable({
    number: v.number(),
    startDate: v.string(), // ISO date string e.g. "2026-03-03"
    endDate: v.string(),
    payDate: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("forms_sent"),
      v.literal("closed")
    ),
  }).index("by_number", ["number"]),

  // Mirrors the Calendars data from Acuity
  instructors: defineTable({
    acuityCalendarId: v.number(),
    name: v.string(),
    email: v.string(),
    active: v.boolean(),
  }).index("by_calendar_id", ["acuityCalendarId"]),

  // One submission record per instructor per pay period
  // This is the "form instance" — created when forms are sent out
  submissions: defineTable({
    payPeriodId: v.id("payPeriods"),
    instructorId: v.id("instructors"),
    token: v.string(), // UUID used in the URL: /submit/:token
    status: v.union(v.literal("pending"), v.literal("submitted")),
    submittedAt: v.optional(v.number()), // Unix timestamp
    instructorNotes: v.optional(v.string()),
    // Per-instructor additional hour types + rates, sourced from Instructors sheet at send time
    availableRates: v.optional(v.array(v.object({ label: v.string(), rate: v.number() }))),
    // Membership types shown on the first pay period of each month (Nerea + Chelsea only)
    membershipOptions: v.optional(v.array(v.object({ label: v.string(), pricePerMember: v.number() }))),
    // Filled in when the instructor submits their form
    membershipCounts: v.optional(v.array(v.object({ label: v.string(), count: v.number(), pricePerMember: v.number() }))),
  })
    .index("by_token", ["token"])
    .index("by_pay_period", ["payPeriodId"])
    .index("by_instructor_and_period", ["instructorId", "payPeriodId"]),

  // Pre-populated sessions from Acuity — one per collated class session
  // Instructor checks/unchecks these to confirm they worked them
  sessions: defineTable({
    submissionId: v.id("submissions"),
    datetime: v.string(), // ISO datetime from Acuity
    info: v.string(), // Class name or student name (privates)
    category: v.string(), // Class, Private, Workshop, etc.
    quantity: v.number(), // Student count or 1 for privates
    pricePerBooking: v.number(),
    confirmedByInstructor: v.boolean(), // Instructor checks this
    // For series classes: "start" = first session in series, "end" = last session in series
    // "session" = single occurrence (privates, open studio, etc.)
    eventType: v.optional(v.union(v.literal("start"), v.literal("end"), v.literal("session"))),
    // For syncing back to the spreadsheet
    sheetRow: v.optional(v.number()),
    syncedToSheet: v.boolean(),
  }).index("by_submission", ["submissionId"]),

  // Additional hours manually entered by instructor (Tech Hours etc.)
  additionalEntries: defineTable({
    submissionId: v.id("submissions"),
    date: v.string(), // ISO date string e.g. "2026-03-15"
    type: v.string(), // "Tech Hours", "Open Studio", etc.
    hours: v.number(),
    notes: v.optional(v.string()),
    syncedToSheet: v.boolean(),
  }).index("by_submission", ["submissionId"]),
});
