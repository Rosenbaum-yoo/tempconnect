# TempConnect Enterprise Architecture

## Overview
TempConnect is a multi-tenant B2B Vendor Management System (VMS) connecting buyer organizations with staffing suppliers. Built on Node.js/Express + PostgreSQL, served via Docker with Nginx reverse proxy.

## System Layers

### 1. API Layer (`api/`)
- **Framework**: Express.js (ES modules)
- **Auth**: JWT + CSRF token validation
- **Routing**: 24+ routers mounted on `/api` prefix
- **Middleware**: CORS, rate limiting, cookie-parser, helmet

### 2. Service Layer (`api/services/`)
- **organizationService** — multi-tenant org CRUD, locations, departments, memberships
- **rbacService** — role-based access control with 12 roles, 30+ permissions, hierarchy inheritance
- **approvalService** — generic approval workflow engine
- **supplierManagementService** — buyer-side supplier lifecycle (invite, approve, suspend, metrics)
- **contractService** — framework agreements with status lifecycle
- **assignmentService** — post-deal fulfillment tracking
- **settingsService** — per-org configuration
- **notificationMatrix** — event-driven notification dispatch (15 event types)
- **dealWorkflow** — deal negotiation state machine
- **requisitionService** — 9-state requisition lifecycle
- **auditLog** — immutable audit trail with org_id scoping
- **platformMetricsService** — admin-facing platform KPIs
- **matchingEngine** — geo-aware candidate/req matching

### 3. Queue Layer (`api/queue/`)
- **BullMQ** on Redis for async processing
- Queues: `email`, `matching`
- Workers with graceful shutdown in `server.js`

### 4. Data Layer (`sql/migrations/`)
- 20 sequential migrations (001–020)
- Core tables: organizations, org_memberships, org_locations, departments, requisitions, requisition_candidates, deal_requests, vendor_pool, compliance_documents, contracts, assignments, org_settings, approval_requests, audit_log, notifications

### 5. Frontend (`nginx/html/`)
- Static HTML + vanilla JS
- Served by Nginx, proxying `/api` to Express

## Multi-Tenancy Model
Every data entity belongs to an `organization`. Queries are scoped by `org_id` from the authenticated user's membership. The `org_memberships` table links users to organizations with a `role_key`.

## Plan Gating
Features are gated by plan tier: FREE → BASIS → PLUS → NOTDIENST → PRO → ENTERPRISE. The `planFeatures` config maps feature keys to allowed plans. Middleware checks the org's plan before granting access.

## Deployment
- Docker Compose: `api` (Node), `db` (Postgres), `nginx`, `redis`
- Environment via `.env` (DB credentials, JWT secret, Sentry DSN, Redis URL)
- Health endpoint: `GET /api/health` (includes DB, queue, version, uptime)
