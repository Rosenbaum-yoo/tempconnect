/**
 * validate.js — Zod-based request validation middleware
 *
 * Usage:
 *   import { validate, z } from '../middleware/validate.js';
 *
 *   router.post('/endpoint', validate({
 *     body: z.object({ name: z.string().min(1) }),
 *     query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }),
 *     params: z.object({ id: z.string().uuid() })
 *   }), handler);
 *
 * On validation failure → 400 JSON with structured errors.
 * On success → parsed/coerced values are written back to req.body/query/params.
 *
 * Common schemas are exported for reuse across routes.
 */

// zod is a declared dependency in package.json — static import is safe and
// avoids unnecessary startup overhead from dynamic resolution.
import { z } from "zod";

/**
 * Creates a Zod validation middleware.
 * @param {{ body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }} schemas
 */
export function validate(schemas) {
  return function validationMiddleware(req, res, next) {
    const errors = [];

    for (const [target, schema] of Object.entries(schemas)) {
      if (!schema) continue;
      const source = target === "body" ? req.body : target === "query" ? req.query : req.params;
      const result = schema.safeParse(source);
      if (!result.success) {
        const issues = result.error.issues.map(issue => ({
          field: issue.path.join(".") || target,
          message: issue.message,
          code: issue.code
        }));
        errors.push(...issues);
      } else {
        // Write coerced/defaulted values back
        if (target === "body") req.body = result.data;
        else if (target === "query") req.query = result.data;
        else if (target === "params") req.params = result.data;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          fields: errors
        }
      });
    }
    return next();
  };
}

// ─── Re-export z so callers don't need a separate zod import ─────────────────
export { z };

// ─── Common Reusable Schemas ──────────────────────────────────────────────────
export const Schemas = {
    // Pagination
    pagination: z.object({
      limit: z.coerce.number().int().min(1).max(500).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      page: z.coerce.number().int().min(1).optional()
    }),

    // UUID param
    uuidParam: z.object({
      id: z.string().uuid({ message: "ID must be a valid UUID" })
    }),

    // Auth — registration
    register: z.object({
      email: z.string().email().max(254),
      password: z.string().min(8).max(128),
      name: z.string().min(1).max(100).optional(),
      role: z.enum(["EMPLOYER", "SUPPLIER", "WORKER"]).optional()
    }),

    // Auth — login
    login: z.object({
      email: z.string().email(),
      password: z.string().min(1)
    }),

    // Organization create/update
    organizationCreate: z.object({
      name: z.string().min(2).max(200),
      slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes").optional(),
      plan: z.enum(["DEMO", "FREE", "BASIS", "PLUS", "PRO", "ENTERPRISE"]).optional(),
      website: z.string().url().optional().or(z.literal("")).optional(),
      contact_email: z.string().email().optional()
    }),

    // Requisition create
    requisitionCreate: z.object({
      title: z.string().min(3).max(300),
      description: z.string().max(5000).optional(),
      location: z.string().max(200).optional(),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
      workers_needed: z.coerce.number().int().min(1).max(10000).optional(),
      qualification: z.string().max(200).optional(),
      urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
      budget_per_hour: z.coerce.number().min(0).max(9999).optional()
    }),

    // Capacity post create
    capacityPostCreate: z.object({
      title: z.string().min(3).max(300),
      description: z.string().max(5000).optional(),
      available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      available_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      workers_count: z.coerce.number().int().min(1).max(10000).optional(),
      qualification: z.string().max(200).optional(),
      location: z.string().max(200).optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional()
    }),

    // Timesheet submit
    timesheetSubmit: z.object({
      deal_id: z.string().uuid(),
      week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      hours: z.coerce.number().min(0).max(168),
      notes: z.string().max(1000).optional()
    }),

    // Invoice create (internal / admin)
    invoiceCreate: z.object({
      user_id: z.coerce.number().int().positive().optional(),
      org_id: z.coerce.number().int().positive().optional(),
      amount: z.coerce.number().min(0),
      currency: z.string().length(3).default("EUR"),
      description: z.string().max(500).optional(),
      due_days: z.coerce.number().int().min(0).max(365).default(30)
    }),

    // Payment checkout
    paymentCheckout: z.object({
      plan: z.enum(["BASIS", "PLUS", "PRO"]),
      payment_method: z.enum(["demo", "stripe", "paypal"]).default("demo")
    }),

    // Password change
    passwordChange: z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(8).max(128)
    }),

    // Invite member
    inviteMember: z.object({
      email: z.string().email(),
      role: z.enum(["ADMIN", "MEMBER", "VIEWER", "FINANCE"]).default("MEMBER")
    }),

    // Deal create
    dealCreate: z.object({
      requisition_id: z.string().uuid(),
      capacity_post_id: z.string().uuid().optional(),
      supplier_id: z.coerce.number().int().positive().optional(),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      workers_count: z.coerce.number().int().min(1).max(10000),
      hourly_rate: z.coerce.number().min(0).max(9999).optional(),
      notes: z.string().max(2000).optional()
    })
};

/**
 * Convenience factory: validates only req.body.
 * @param {ZodSchema} schema
 */
export function validateBody(schema) {
  return validate({ body: schema });
}

/**
 * Convenience factory: validates only req.query.
 * @param {ZodSchema} schema
 */
export function validateQuery(schema) {
  return validate({ query: schema });
}

/**
 * Convenience factory: validates only req.params.
 * @param {ZodSchema} schema
 */
export function validateParams(schema) {
  return validate({ params: schema });
}
