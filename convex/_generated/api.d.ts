/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_sendForms from "../actions/sendForms.js";
import type * as actions_setupInstructors from "../actions/setupInstructors.js";
import type * as actions_syncToSheet from "../actions/syncToSheet.js";
import type * as http from "../http.js";
import type * as instructors from "../instructors.js";
import type * as payPeriods from "../payPeriods.js";
import type * as seed from "../seed.js";
import type * as submissions from "../submissions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/sendForms": typeof actions_sendForms;
  "actions/setupInstructors": typeof actions_setupInstructors;
  "actions/syncToSheet": typeof actions_syncToSheet;
  http: typeof http;
  instructors: typeof instructors;
  payPeriods: typeof payPeriods;
  seed: typeof seed;
  submissions: typeof submissions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
