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

// CORS preflight for /api/period-preview
http.route({
  path: "/api/period-preview",
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

// GET /api/period-preview?payPeriodNumber=3
// Returns appointments per instructor for admin preview (no series detection)
http.route({
  path: "/api/period-preview",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const adminSecret = process.env.ADMIN_SECRET;
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const url = new URL(request.url);
    const num = url.searchParams.get("payPeriodNumber");
    const result = await ctx.runAction(internal.actions.sendForms.previewPeriodInternal, {
      payPeriodNumber: num ? parseInt(num) : undefined,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }),
});

// CORS preflight for /api/submission-status
http.route({
  path: "/api/submission-status",
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

// GET /api/submission-status?payPeriodNumber=3
http.route({
  path: "/api/submission-status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const adminSecret = process.env.ADMIN_SECRET;
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const url = new URL(request.url);
    const num = url.searchParams.get("payPeriodNumber");
    if (!num) {
      return new Response(JSON.stringify({ error: "payPeriodNumber required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const result = await ctx.runQuery(internal.submissions.getStatusesForPeriod, {
      payPeriodNumber: parseInt(num),
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }),
});

// CORS preflight for /api/payroll-history
http.route({
  path: "/api/payroll-history",
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

// GET /api/payroll-history?payPeriodNumber=6
// Omit payPeriodNumber to get every pay period.
// Header: Authorization: Bearer <ADMIN_SECRET>
http.route({
  path: "/api/payroll-history",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const adminSecret = process.env.ADMIN_SECRET;
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const url = new URL(request.url);
    const num = url.searchParams.get("payPeriodNumber");
    if (num !== null && !/^\d+$/.test(num)) {
      return new Response(JSON.stringify({ error: "payPeriodNumber must be a number" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const result = await ctx.runQuery(internal.payrollHistory.getHistory, {
      payPeriodNumber: num !== null ? parseInt(num) : undefined,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }),
});

// CORS preflight for /api/retry-sync-pay-period
http.route({
  path: "/api/retry-sync-pay-period",
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

// POST /api/retry-sync-pay-period
// Body: { "payPeriodNumber": number, "dryRun"?: boolean }
// Header: Authorization: Bearer <ADMIN_SECRET>
http.route({
  path: "/api/retry-sync-pay-period",
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

    let body: { payPeriodNumber?: number; dryRun?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON body required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (typeof body.payPeriodNumber !== "number") {
      return new Response(JSON.stringify({ error: "payPeriodNumber required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const result = await ctx.runAction(internal.actions.syncToSheet.retryPayPeriod, {
      payPeriodNumber: body.payPeriodNumber,
      dryRun: body.dryRun ?? false,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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
