-- Migration 0006: push_notification_log table
-- Used by the Expo push notification dedup guard to prevent double-sending
-- on server restart within the same day.

CREATE TABLE IF NOT EXISTS push_notification_log (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  type      TEXT    NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_notification_log_user_type_idx
  ON push_notification_log (user_id, type, sent_at DESC);
