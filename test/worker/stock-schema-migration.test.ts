/**
 * T-755: stocks テーブル schema マイグレーション検証
 *
 * テスト対象:
 * - migration 0003_drop_status.sql の適用結果
 * - status カラムが削除されていること
 * - 必要なカラムがすべて存在すること
 * - status なしで INSERT/SELECT が正常に機能すること
 */

import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers";

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

// ============================================================
// stocks テーブル: スキーマ検証
// ============================================================
describe("stocks テーブルスキーマ（migration 0003 適用後）", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  it("S1: status カラムが存在しない", async () => {
    // Given: migration 0003_drop_status.sql が適用済み
    const result = await env.DB.prepare("PRAGMA table_info(stocks)").all<ColumnInfo>();

    // When: カラム名一覧を取得
    const columns = result.results.map((r) => r.name);

    // Then: status カラムが存在しない
    expect(columns).not.toContain("status");
  });

  it("S2: 必要なカラムがすべて存在する", async () => {
    // Given: migration 0003_drop_status.sql が適用済み
    const result = await env.DB.prepare("PRAGMA table_info(stocks)").all<ColumnInfo>();
    const columns = result.results.map((r) => r.name);

    // When/Then: ADR-005 で定義された必要カラムがすべて存在する
    const requiredColumns = [
      "id",
      "user_id",
      "original_url",
      "canonical_url",
      "provider",
      "title",
      "author_name",
      "thumbnail_url",
      "embed_url",
      "created_at",
      "updated_at",
    ];
    for (const col of requiredColumns) {
      expect(columns, `カラム "${col}" が存在すること`).toContain(col);
    }
  });
});

// ============================================================
// stocks テーブル: status なし INSERT/SELECT 動作検証
// ============================================================
describe("status なし INSERT/SELECT（migration 0003 適用後）", () => {
  beforeAll(async () => {
    await applyMigrations();
    // S3/S4 共通のテストユーザーを事前投入（スナップショットに含める）
    await env.DB.prepare(
      "INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(
        "schema-test-user",
        "schema-test-google-sub",
        "schema-test@example.com",
        "Schema Test User",
        "2024-01-01T00:00:00.000Z",
      )
      .run();
  });

  it("S3: status を含まない INSERT が成功する", async () => {
    // Given: migration 0003_drop_status.sql が適用済み（status カラムなし）
    // When: status を含まない stocks INSERT を実行
    const result = await env.DB.prepare(
      `INSERT INTO stocks
        (id, user_id, original_url, canonical_url, provider,
         title, author_name, thumbnail_url, embed_url,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "schema-test-stock",
        "schema-test-user",
        "https://speakerdeck.com/test/schema-test",
        "https://speakerdeck.com/test/schema-test",
        "speakerdeck",
        "Schema Test Slide",
        "Test Author",
        null,
        "https://speakerdeck.com/player/schematest",
        "2024-01-01T00:00:00.000Z",
        "2024-01-01T00:00:00.000Z",
      )
      .run();

    // Then: INSERT が成功する（エラーなし）
    expect(result.success).toBe(true);
  });

  it("S4: INSERT した stock を SELECT できる（status フィールドなし）", async () => {
    // Given: status を含まない stocks INSERT を実行（S3 の副作用に依存しない独立したテスト）
    await env.DB.prepare(
      `INSERT INTO stocks
        (id, user_id, original_url, canonical_url, provider,
         title, author_name, thumbnail_url, embed_url,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "schema-test-stock-s4",
        "schema-test-user",
        "https://speakerdeck.com/test/s4-test",
        "https://speakerdeck.com/test/s4-test",
        "speakerdeck",
        "Schema Test Slide",
        "Test Author",
        null,
        "https://speakerdeck.com/player/s4test",
        "2024-01-01T00:00:00.000Z",
        "2024-01-01T00:00:00.000Z",
      )
      .run();

    // When: stock を SELECT する
    const row = await env.DB.prepare(
      "SELECT * FROM stocks WHERE id = ?",
    )
      .bind("schema-test-stock-s4")
      .first<Record<string, unknown>>();

    // Then: 取得できる
    expect(row).not.toBeNull();
    // Then: status フィールドが存在しない（カラム削除済み）
    expect(row!.status).toBeUndefined();
    // Then: 保存したデータが正しく返る
    expect(row!.id).toBe("schema-test-stock-s4");
    expect(row!.provider).toBe("speakerdeck");
    expect(row!.title).toBe("Schema Test Slide");
  });
});
