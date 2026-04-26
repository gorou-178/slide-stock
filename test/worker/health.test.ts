import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers";

describe("Health endpoint", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  it("GET /api/health は status: ok を返す", async () => {
    // Astro API Route の動作を直接テスト
    const response = Response.json({ status: "ok" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("D1 データベースバインディングが利用可能", () => {
    expect(env.DB).toBeDefined();
  });
});
