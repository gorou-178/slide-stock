/**
 * ローカル D1 データベースにテスト用シードデータを投入するスクリプト
 *
 * 使用方法: npm run db:seed
 *
 * wrangler d1 execute を使って SQL を実行する。
 * E2E テストの事前セットアップとして使用する。
 */

import {
  TEST_USERS,
  TEST_STOCKS,
  TEST_MEMOS,
} from "../src/test/seed";

function escapeSQL(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function generateSQL(): string {
  const statements: string[] = [];

  // Clean existing test data (child tables first)
  statements.push("DELETE FROM memos;");
  statements.push("DELETE FROM stocks;");
  statements.push("DELETE FROM users;");

  // Insert users
  for (const user of TEST_USERS) {
    statements.push(
      `INSERT INTO users (id, google_sub, email, name, created_at) VALUES (${escapeSQL(user.id)}, ${escapeSQL(user.google_sub)}, ${escapeSQL(user.email)}, ${escapeSQL(user.name)}, ${escapeSQL(user.created_at)});`
    );
  }

  // Insert stocks
  for (const stock of TEST_STOCKS) {
    statements.push(
      `INSERT INTO stocks (id, user_id, original_url, canonical_url, provider, title, author_name, thumbnail_url, embed_url, status, created_at, updated_at) VALUES (${escapeSQL(stock.id)}, ${escapeSQL(stock.user_id)}, ${escapeSQL(stock.original_url)}, ${escapeSQL(stock.canonical_url)}, ${escapeSQL(stock.provider)}, ${escapeSQL(stock.title)}, ${escapeSQL(stock.author_name)}, ${escapeSQL(stock.thumbnail_url)}, ${escapeSQL(stock.embed_url)}, ${escapeSQL(stock.status)}, ${escapeSQL(stock.created_at)}, ${escapeSQL(stock.updated_at)});`
    );
  }

  // Insert memos
  for (const memo of TEST_MEMOS) {
    statements.push(
      `INSERT INTO memos (id, stock_id, user_id, memo_text, created_at, updated_at) VALUES (${escapeSQL(memo.id)}, ${escapeSQL(memo.stock_id)}, ${escapeSQL(memo.user_id)}, ${escapeSQL(memo.memo_text)}, ${escapeSQL(memo.created_at)}, ${escapeSQL(memo.updated_at)});`
    );
  }

  return statements.join("\n");
}

// メイン処理: SQL を標準出力に書き出す
// npm run db:seed で wrangler d1 execute にパイプする
console.log(generateSQL());
