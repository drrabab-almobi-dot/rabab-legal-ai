-- Migration: tavily_cache table
-- Persistent cross-session cache for Tavily legal web search results.
-- Replaces the previous in-memory Map so cache survives server restarts
-- and is shared across parallel worker processes.

CREATE TABLE IF NOT EXISTS tavily_cache (
  cache_key  TEXT PRIMARY KEY,
  results    JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tavily_cache_expires_at ON tavily_cache (expires_at);
