import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// CORS preflight for /api/send-forms
http.route({
  path: "/api/send-forms",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// POST /api/send-forms
// Body: { "payPeriodNumber"?: number, "dryRun"?: boolean, "testEmail"?: string }
// Header: Authorization: Bearer <ADMIN_SECRET>
http.route({
  path: "/api/send-forms",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Auth check
    const adminSecret = process.env.ADMIN_SECRET;
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse body
    let body: { payPeriodNumber?: number; dryRun?: boolean; testEmail?: string } = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine — all args are optional
    }

    // Run sendForms action
    const result = await ctx.runAction(internal.actions.sendForms.runInternal, {
      payPeriodNumber: body.payPeriodNumber,
      dryRun: body.dryRun ?? false,
      testEmail: body.testEmail,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// CORS preflight for /api/pay-period-info
http.route({
  path: "/api/pay-period-info",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// GET /api/pay-period-info — lightweight, no submissions created
http.route({
  path: "/api/pay-period-info",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const adminSecret = process.env.ADMIN_SECRET;
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await ctx.runAction(internal.actions.sendForms.getPayPeriodInfoInternal, {});

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// CORS preflight for /api/clear-all-data
http.route({
  path: "/api/clear-all-data",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// POST /api/clear-all-data — DEV ONLY: wipe all Convex payroll data
http.route({
  path: "/api/clear-all-data",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const adminSecret = process.env.ADMIN_SECRET;
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const result = await ctx.runMutation(internal.submissions.clearAll, {});

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

export default http;
