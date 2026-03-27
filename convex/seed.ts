import { mutation } from "./_generated/server";

// Run once to create test data: npx convex run seed:run
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    // Clean up any existing seed data
    const existing = await ctx.db.query("payPeriods").collect();
    for (const r of existing) await ctx.db.delete(r._id);
    const existingI = await ctx.db.query("instructors").collect();
    for (const r of existingI) await ctx.db.delete(r._id);

    // Create a pay period
    const payPeriodId = await ctx.db.insert("payPeriods", {
      number: 2,
      startDate: "2026-03-03",
      endDate: "2026-03-17",
      payDate: "2026-03-24",
      status: "forms_sent",
    });

    // Create a test instructor
    const instructorId = await ctx.db.insert("instructors", {
      acuityCalendarId: 12468385,
      name: "Nerea Nicholson",
      email: "nereanicholsons@gmail.com",
      active: true,
    });

    // Create a submission with token
    const token = "test-token-nerea-pp2";
    const submissionId = await ctx.db.insert("submissions", {
      payPeriodId,
      instructorId,
      token,
      status: "pending",
    });

    // Add sessions (matches what's in the Appointments sheet for Nerea, Period 2)
    const sessions = [
      {
        datetime: "2026-03-05T18:00:00",
        info: "4-Week Ceramics Class Wednesday Evening",
        category: "Class",
        quantity: 6,
        pricePerBooking: 300,
        sheetRow: 39,
      },
      {
        datetime: "2026-03-06T10:00:00",
        info: "Ceramic Trial Membership",
        category: "Membership",
        quantity: 1,
        pricePerBooking: 200,
        sheetRow: 40,
      },
      {
        datetime: "2026-03-05T19:00:00",
        info: "Intro to Wheel Throwing Wednesday",
        category: "Class",
        quantity: 4,
        pricePerBooking: 525,
        sheetRow: 41,
      },
      {
        datetime: "2026-03-07T15:00:00",
        info: "Youth Ceramics Class Wednesday Afternoon",
        category: "Class",
        quantity: 2,
        pricePerBooking: 360,
        sheetRow: 42,
      },
      {
        datetime: "2026-03-12T18:00:00",
        info: "4-Week Ceramics Class Wednesday Evening",
        category: "Class",
        quantity: 9,
        pricePerBooking: 300,
        sheetRow: 43,
      },
      {
        datetime: "2026-03-14T10:00:00",
        info: "Intro to Ceramics Saturday Morning",
        category: "Class",
        quantity: 4,
        pricePerBooking: 525,
        sheetRow: 44,
      },
      {
        datetime: "2026-03-08T11:00:00",
        info: "2.5hr Ceramics Open Studio",
        category: "Open Studio",
        quantity: 1,
        pricePerBooking: 35,
        sheetRow: 45,
      },
      {
        datetime: "2026-03-13T18:00:00",
        info: "Girl Dinner Plate Workshop",
        category: "Workshop",
        quantity: 15,
        pricePerBooking: 45,
        sheetRow: 46,
      },
      {
        datetime: "2026-03-09T09:00:00",
        info: "Intermediate Wheel Throwing Monday",
        category: "Class",
        quantity: 5,
        pricePerBooking: 525,
        sheetRow: 47,
      },
      {
        datetime: "2026-03-10T14:00:00",
        info: "Debbie Heidecorn",
        category: "Private",
        quantity: 1,
        pricePerBooking: 100,
        sheetRow: 48,
      },
      {
        datetime: "2026-03-15T10:00:00",
        info: "Reina Di Nino",
        category: "Private",
        quantity: 1,
        pricePerBooking: 500,
        sheetRow: 49,
      },
    ];

    for (const s of sessions) {
      await ctx.db.insert("sessions", {
        submissionId,
        ...s,
        confirmedByInstructor: true,
        syncedToSheet: false,
      });
    }

    return {
      token,
      url: `http://localhost:5173/submit/${token}`,
    };
  },
});
