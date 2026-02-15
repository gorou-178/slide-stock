import { env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";
import { seedDatabase, cleanDatabase } from "../../src/test/helpers";

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

/**
 * マイグレーション適用後にシードデータを投入する。
 * テストの beforeAll で applyMigrations() の代わりに呼び出す。
 */
export async function applyMigrationsAndSeed(): Promise<void> {
  await applyMigrations();
  await seedDatabase(env.DB);
}

/**
 * シードデータをクリアして再投入する。
 * テストの beforeEach でデータをリセットしたい場合に使う。
 */
export async function resetSeedData(): Promise<void> {
  await cleanDatabase(env.DB);
  await seedDatabase(env.DB);
}
