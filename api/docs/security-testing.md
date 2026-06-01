# Security Regression Test Suite

## Purpose

The security regression test suite in `test/security/` is a deterministic, database-free test harness that guards against the most dangerous classes of authorization bugs in multi-tenant SaaS systems. Every test runs in < 2 seconds and requires zero infrastructure.

## Attack Vectors Covered

| File | Attack Class | What it prevents |
|------|-------------|-----------------|
| `auth-security.test.js` | Missing authentication | Unauthenticated access to protected endpoints |
| `rbac-security.test.js` | Middleware bypass | Accidental removal of RBAC guards from routes |
| `org-isolation.test.js` | Cross-tenant access | Org A user reading/modifying Org B data |
| `resource-ownership.test.js` | IDOR (Insecure Direct Object Reference) | User B accessing User A's resources by ID |
| `role-escalation.test.js` | Vertical privilege escalation | Viewer/member escalating to admin/owner operations |
| `permission-bypass.test.js` | Horizontal privilege escalation | Users without required permission accessing gated endpoints |

## Shared Test Utilities

All security tests import from `test/helpers/security-mocks.js`, which provides:

- **Identifiers**: `USER_A`, `USER_B`, `ORG_A`, `ORG_B` — deterministic two-tenant fixtures
- **Membership factories**: `membership(role, userId, orgId)`, `MEMBERSHIPS` pre-built set
- **Pool mocks**: `returnPool(rows)`, `sequencePool(...responses)` — no real database needed
- **Request/Response mocks**: `mockReq(overrides)`, `mockRes()` — Express-compatible
- **Route helpers**: `findHandlerExact()`, `getMiddlewareCount()`, `listRoutes()`
- **Dependency builder**: `baseDeps(pool)` — creates `{ pool, requireAuth, logger, config }`

## How to Add a New Security Test

1. **Identify the attack class** — is it auth, org isolation, IDOR, escalation, or permission bypass?
2. **Choose the right test file** — add to the existing file that matches the attack class.
3. **Write the test** using shared mocks:

```javascript
it("new-endpoint: unauthorized role blocked", async () => {
  const pool = returnPool([/* mock data */]);
  const router = createMyRouter(baseDeps(pool));
  const handler = findHandlerExact(router, "get", "/my-endpoint/:id");
  const req = mockReq({ orgId: ORG_A, params: { id: "resource-id" } });
  const res = mockRes();
  await handler(req, res, noop);
  assert.equal(res._status, 403);
});
```

4. **Run the suite** to verify: `npm test`

## Why Tenant Isolation is Critical

TempConnect is a multi-tenant B2B platform where competing organizations (staffing agencies, enterprises) share the same infrastructure. A tenant isolation failure means:

- **Data breach**: Company A sees Company B's invoices, requisitions, compliance documents, or vendor pool
- **Unauthorized actions**: A user in one org can void invoices, approve requisitions, or terminate contracts in another org
- **Regulatory violation**: GDPR, SOC 2, and ISO 27001 all require strict data separation between tenants

The `org-isolation.test.js` and `resource-ownership.test.js` files specifically guard against these scenarios by testing every endpoint that handles org-scoped or user-scoped resources.

## Test Design Principles

- **Deterministic**: No randomness, no timestamps, no external state
- **Independent**: Each test creates its own mocks — no shared mutable state
- **No database**: All tests use mock pools that return pre-defined rows
- **Fast**: Each suite completes in < 2 seconds
- **70%+ negative tests**: The majority of tests verify that unauthorized access is **blocked** (403/401), not that authorized access works (200)

## Running the Tests

```bash
# Run all tests including security suite
npm test

# Run only security tests
node --test --test-force-exit test/security/auth-security.test.js test/security/rbac-security.test.js test/security/org-isolation.test.js test/security/resource-ownership.test.js test/security/role-escalation.test.js test/security/permission-bypass.test.js
```

## CI Integration

All security test files are included in the `npm test` script. A failing security test will fail the CI build — this is intentional. Security regressions must block deployment.
