-- Migration: 0002_unique_stock_per_user
-- Description: Add UNIQUE constraint on (user_id, canonical_url) to prevent race-condition duplicates

CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_user_canonical ON stocks(user_id, canonical_url);
