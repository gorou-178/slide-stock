import { env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

/**
 * D1 マイグレーションを適用する。
 * テストの beforeAll で呼び出す。
 */
export async function applyMigrations(): Promise<void> {
  const migrations = env.TEST_MIGRATIONS as D1Migration[];
  for (const migration of migrations) {
    const statements = migration.queries
      .map((q) => q.trim())
      .filter((q) => q.length > 0)
      .map((q) => env.DB.prepare(q));
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }
  }
}
