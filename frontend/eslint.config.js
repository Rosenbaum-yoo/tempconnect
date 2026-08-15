/**
 * ESLint 9 flat config — TempConnect Frontend (public/js/*.js)
 *
 * Context: Traditional multi-page HTML/JS frontend with IIFE modules,
 * browser globals, and no build step. Mixed ES5 (var) and modern JS.
 *
 * Rules are pragmatic: catch real bugs without creating noise.
 */
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",            // No ESM — these are classic <script> includes
      globals: {
        ...globals.browser,            // document, window, fetch, console, etc.

        // ── App-level globals (shared across pages via <script> includes) ──
        TC:           "readonly",      // api.js — global namespace (TC.api, TC.toast, etc.)
        PlanFeatures: "readonly",      // planFeatures.js — IIFE module
        NAV_ITEMS:    "readonly",      // navConfig.js — navigation data
        TC_BRAND:     "readonly",      // branding.js — brand labels
        TCi18n:       "readonly",      // i18n.js — translation system
        TCDate:       "readonly",      // dateUtility.js — DACH date helpers
      }
    },
    rules: {
      // ── Real bug detection ──────────────────────────────────────
      "no-undef":              "error",    // Catch typos and missing globals
      "no-redeclare":          "error",    // Prevent accidental var overwrites
      "no-dupe-keys":          "error",    // Object literal duplicate keys
      "no-duplicate-case":     "error",    // Switch duplicate case
      "no-unreachable":        "error",    // Dead code after return/throw
      "no-constant-condition": "warn",     // if(true) etc.
      "no-debugger":           "error",    // No debugger in production
      "no-empty":              "warn",     // Empty blocks (often intentional catch)
      "use-isnan":             "error",    // NaN comparisons
      "valid-typeof":          "error",    // typeof === "strig" typos

      // ── Code quality ────────────────────────────────────────────
      "eqeqeq":               ["warn", "smart"],  // Prefer === but allow == null
      "no-eval":               "error",            // Security: no eval()
      "no-implied-eval":       "error",            // Security: no setTimeout("code")
      "no-new-wrappers":       "error",            // No new String/Number/Boolean
      "no-with":               "error",            // No with statement
      "no-throw-literal":      "warn",             // throw "string" → throw new Error
      "no-self-assign":        "error",            // x = x
      "no-self-compare":       "error",            // x === x

      // ── Pragmatic — lenient on things that match codebase style ─
      "no-unused-vars":        ["warn", {
        "vars": "all",
        "args": "none",                            // Don't flag unused function args
        "caughtErrors": "none",                    // Don't flag unused catch params
        "varsIgnorePattern": "^_"                  // Allow _ignored variables
      }],
      "no-var":                "off",              // Codebase uses var intentionally (ES5 compat)
      "prefer-const":          "off",              // Same — mixed ES5/modern
      "no-prototype-builtins": "off",              // .hasOwnProperty is fine here
      "no-inner-declarations": "off",              // Functions inside IIFEs
    }
  },

  // ── Global definition files ──────────────────────────────────
  // These files *create* the shared globals (PlanFeatures, NAV_ITEMS, TC_BRAND)
  // that other files consume. Suppress redeclare/unused for them.
  {
    files: [
      "public/js/api.js",
      "public/js/toast.js",
      "public/js/planFeatures.js",
      "public/js/navConfig.js",
      "public/js/branding.js",
    ],
    rules: {
      "no-redeclare":   "off",
      "no-unused-vars":  "off",
    }
  },

  // ── Page scripts with HTML onclick exports ─────────────────────
  // All page scripts define functions called from HTML onclick/onchange handlers.
  // ESLint can't see those HTML references, so suppress unused-vars for the whole dir.
  {
    files: ["public/js/pages/*.js"],
    rules: {
      "no-unused-vars": "off",
    }
  }
];
