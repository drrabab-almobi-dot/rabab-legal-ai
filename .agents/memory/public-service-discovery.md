---
name: Public Service Discovery
description: Visitors may browse all legal service pages; authentication gates only metered actions.
---

## Rule

Keep service discovery public: visitors can view the consultation, contract, and legal-research interfaces and descriptions without an account. Require authentication only when an action starts a metered operation, then apply trial quotas and paid-plan limits normally.

**Why:** The user explicitly chose a conversion flow where people can understand the offering before creating an account; preemptive route-level redirects hide the product and make payment appear to be the first barrier.

**How to apply:** Keep dashboards, payments, invoices, saved consultations, organization management, and admin areas protected. For service pages, preserve the intended route in `returnTo` when an unauthenticated visitor starts an action.