-- Migration 0014: protect existing subscribers from new quota limits
-- Adds grandfathered_unlimited column to subscriptions.
-- All currently ACTIVE subscriptions are set to true so they keep unlimited
-- service for the remainder of their current billing period.
-- New subscriptions default to false and are subject to package quotas normally.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS grandfathered_unlimited boolean NOT NULL DEFAULT false;

-- Grant amnesty only to subscriptions that are active RIGHT NOW (at migration time).
-- Subscriptions created after this migration will get false by default.
UPDATE subscriptions
SET grandfathered_unlimited = true
WHERE status = 'active';
