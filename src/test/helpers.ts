/**
 * テスト用 DB ヘルパー関数
 *
 * D1 データベースへのシードデータ投入・クリアを行う。
 */

import { TEST_USERS, TEST_STOCKS, TEST_MEMOS } from "./seed";

/**
 * 全テストデータを D1 データベースに投入する
 */
export async function seedDatabase(db: D1Database): Promise<void> {
  // Users
  const insertUser = db.prepare(
    `INSERT INTO users (id, google_sub, email, name, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const user of TEST_USERS) {
    await insertUser
      .bind(user.id, user.google_sub, user.email, user.name, user.created_at)
      .run();
  }

  // Stocks
  const insertStock = db.prepare(
    `INSERT INTO stocks (id, user_id, original_url, canonical_url, provider, title, author_name, thumbnail_url, embed_url, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const stock of TEST_STOCKS) {
    await insertStock
      .bind(
        stock.id,
        stock.user_id,
        stock.original_url,
        stock.canonical_url,
        stock.provider,
        stock.title,
        stock.author_name,
        stock.thumbnail_url,
        stock.embed_url,
        stock.status,
        stock.created_at,
        stock.updated_at
      )
      .run();
  }

  // Memos
  const insertMemo = db.prepare(
    `INSERT INTO memos (id, stock_id, user_id, memo_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const memo of TEST_MEMOS) {
    await insertMemo
      .bind(
        memo.id,
        memo.stock_id,
        memo.user_id,
        memo.memo_text,
        memo.created_at,
        memo.updated_at
      )
      .run();
  }
}

/**
 * テストデータをクリアする（全テーブルを削除順に空にする）
 */
export async function cleanDatabase(db: D1Database): Promise<void> {
  // 外部キー制約の順序に従い、子テーブルから削除
  await db.exec("DELETE FROM memos");
  await db.exec("DELETE FROM stocks");
  await db.exec("DELETE FROM users");
}
