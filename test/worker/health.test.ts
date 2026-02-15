import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, workerFetch, parseJsonResponse } from "../helpers";

describe("Health endpoint", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  it("GET /api/health は status: ok を返す", async () => {
    const response = await workerFetch("/api/health");

    expect(response.status).toBe(200);
    const body = await parseJsonResponse<{ status: string }>(response);
    expect(body.status).toBe("ok");
  });

  it("存在しないパスは 404 を返す", async () => {
    const response = await workerFetch("/api/nonexistent");

    expect(response.status).toBe(404);
    const body = await parseJsonResponse<{ error: string }>(response);
    expect(body.error).toBe("Not Found");
  });

  it("D1 データベースバインディングが利用可能", () => {
    expect(env.DB).toBeDefined();
  });
});
