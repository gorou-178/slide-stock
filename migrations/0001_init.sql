-- Migration: 0001_init
-- Description: Create initial tables for slide-stock

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stocks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    original_url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    provider TEXT NOT NULL,
    title TEXT,
    author_name TEXT,
    thumbnail_url TEXT,
    embed_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memos (
    id TEXT PRIMARY KEY,
    stock_id TEXT NOT NULL REFERENCES stocks(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    memo_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stocks_user_id ON stocks(user_id);
CREATE INDEX IF NOT EXISTS idx_stocks_user_id_created_at ON stocks(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memos_stock_id ON memos(stock_id);
