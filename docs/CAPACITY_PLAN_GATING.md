# Capacity Exchange — Plan Gating & Monetization

## Feature Keys

| Feature Key | Plans | Description |
|---|---|---|
| `capacity_exchange_basic` | BASIS, PLUS, NOTDIENST, PRO, ENTERPRISE | Create/manage/browse entries |
| `capacity_exchange_matching` | PLUS, NOTDIENST, PRO, ENTERPRISE | View matching requisitions, alerts |
| `capacity_exchange_priority` | PRO, ENTERPRISE | Priority placement, advanced insights |
| `capacity_exchange_multi` | ENTERPRISE | Multi-location, departments |

## Active Entry Limits

| Plan | Max Active Entries |
|---|---|
| FREE | 0 (browse feed only) |
| BASIS | 5 |
| PLUS | 20 |
| NOTDIENST | 20 |
| PRO | 50 |
| ENTERPRISE | 999 (unlimited) |

Limits are enforced in `capacityExchangeService.createCapacityEntry()` and `transitionStatus()`.

## Access Levels by Plan

### FREE
- Browse the public capacity feed (read-only via existing marketplace routes)
- Cannot create capacity entries
- Cannot use capacity exchange API

### BASIS
- Create up to 5 active entries
- Browse capacity feed with basic filters
- Receive interactions (interest, questions)
- Standard visibility in feed

### PLUS / NOTDIENST
- Up to 20 active entries
- Matching engine: see which open requisitions match your capacity
- Notification alerts for new matches
- Enhanced visibility in feed

### PRO
- Up to 50 active entries
- Priority placement in feed (`priority_level = 'elevated'`)
- Advanced dashboard insights (interaction analytics)
- All PLUS features

### ENTERPRISE
- Unlimited entries
- Multi-location management (`org_id`, `department_id`)
- Department-scoped entries
- Advanced analytics and reporting
- Vendor-pool-only visibility option
- All PRO features

## Monetization Hooks

The capacity exchange creates natural upgrade triggers:

1. **Entry limit hit** → "Upgrade to PLUS for 20 active entries"
2. **Match visibility** → "Upgrade to PLUS to see matching requisitions"
3. **Priority placement** → "Upgrade to PRO for priority feed placement"
4. **Multi-location** → "Upgrade to ENTERPRISE for department management"

These should be surfaced in the frontend when plan limits are reached.

## Implementation

Plan gating is enforced at two levels:

1. **Route middleware**: `requireFeature("capacity_exchange_basic")` blocks access for FREE users
2. **Service layer**: `getActiveLimit(plan)` enforces entry count limits

The feed endpoint (`/api/capacity-exchange/feed`) requires only `requireAuth` (no plan gate) to allow all logged-in users to browse, supporting the "see value before upgrading" strategy.
