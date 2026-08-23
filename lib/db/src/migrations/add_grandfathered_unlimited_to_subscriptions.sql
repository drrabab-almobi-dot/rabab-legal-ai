-- Migration: protect existing subscribers from new quota limits
-- Adds grandfathered_unlimited column to subscriptions table.
-- Existing ACTIVE subscriptions created before this migration runs are set to true,
-- meaning they retain unlimited (9999) service limits for their current billing period.
-- New subscriptions default to false and are subject to package quotas normally.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS grandfathered_unlimited boolean NOT NULL DEFAULT false;

-- Grant amnesty to all currently active subscriptions
UPDATE subscriptions
SET grandfathered_unlimited = true
WHERE status = 'active';
