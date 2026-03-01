/**
 * T-543: Memo API ユニットテスト
 *
 * 仕様: docs/memo-api-spec.md セクション 8
 *
 * テスト対象:
 * - PUT /api/stocks/:id/memo: メモ作成・更新（upsert）、バリデーション
 * - GET /api/stocks/:id/memo: メモ取得、stock 不存在 / メモ未作成の区別
 * - Stock API との連携: メモ反映、stock 削除時のメモ連動削除
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrationsAndSeed,
  resetSeedData,
  workerFetch,
  parseJsonResponse,
  TEST_USERS,
  TEST_STOCKS,
  TEST_MEMOS,
} from "../../test/helpers";
import { SELF } from "cloudflare:test";

// --- テスト用ヘルパー ---

function authHeaders(userId: string): Record<string, string> {
  return { "X-Test-User-Id": userId };
}

const USER1 = TEST_USERS[0].id; // test-user-1
const USER2 = TEST_USERS[1].id; // test-user-2

// メモ付き stock
const STOCK_WITH_MEMO = TEST_STOCKS[0].id; // stock-speakerdeck-001
// メモなし stock
const STOCK_WITHOUT_MEMO = TEST_STOCKS[2].id; // stock-google-slides-001

// ============================================================
// PUT /api/stocks/:id/memo
// ============================================================
describe("PUT /api/stocks/:id/memo", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
  });

  // --- 正常系 ---

  describe("正常系", () => {
    it("M1: 新規メモ作成（200）", async () => {
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: "良いスライド" },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe("良いスライド");
      expect(body.stock_id).toBe(STOCK_WITHOUT_MEMO);
      expect(body.id).toBeDefined();
      expect(body.created_at).toBeDefined();
      expect(body.updated_at).toBeDefined();
    });

    it("M2: メモ更新（既存メモあり、updated_at が更新される）", async () => {
      // 既存メモを取得して created_at を記録
      const getRes = await workerFetch(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "GET",
        { headers: authHeaders(USER1) },
      );
      const existing = await parseJsonResponse<Record<string, unknown>>(
        getRes,
      );

      // 更新
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: "更新したメモ" },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe("更新したメモ");
      // created_at は変わらない
      expect(body.created_at).toBe(existing.created_at);
      // id も変わらない
      expect(body.id).toBe(existing.id);
    });

    it("M3: 最大文字数ぴったり（10,000文字）", async () => {
      const longText = "あ".repeat(10000);
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: longText },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe(longText);
    });

    it("M4: マルチバイト文字を含むメモ", async () => {
      const text = "日本語のメモ🎉";
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: text },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe(text);
    });
  });

  // --- 異常系 ---

  describe("異常系", () => {
    it("M5: memo_text 未指定 → 400 INVALID_REQUEST", async () => {
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        {
          body: {},
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M6: memo_text が空文字列 → 400 INVALID_REQUEST", async () => {
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: "" },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M7: memo_text が空白のみ → 400 INVALID_REQUEST", async () => {
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: "   " },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M8: memo_text が 10,001 文字 → 400 MEMO_TOO_LONG", async () => {
      const longText = "あ".repeat(10001);
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: longText },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("MEMO_TOO_LONG");
    });

    it("M9: memo_text が string でない → 400 INVALID_REQUEST", async () => {
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: 123 },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M10: JSON パースエラー → 400 INVALID_REQUEST", async () => {
      const res = await SELF.fetch(
        `http://localhost/api/stocks/${STOCK_WITH_MEMO}/memo`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Test-User-Id": USER1,
          },
          body: "invalid-json{{{",
        },
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M11: stock が存在しない → 404 NOT_FOUND", async () => {
      const res = await workerFetch(
        "/api/stocks/nonexistent-stock-id/memo",
        "PUT",
        {
          body: { memo_text: "テスト" },
          headers: authHeaders(USER1),
        },
      );

      expect(res.status).toBe(404);
      const body = await parseJsonResponse<{
        code: string;
        error: string;
      }>(res);
      expect(body.code).toBe("NOT_FOUND");
      expect(body.error).toContain("ストック");
    });

    it("M12: 他ユーザーの stock → 404 NOT_FOUND", async () => {
      const res = await workerFetch(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        {
          body: { memo_text: "テスト" },
          headers: authHeaders(USER2), // user-2 でアクセス
        },
      );

      expect(res.status).toBe(404);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("NOT_FOUND");
    });
  });
});

// ============================================================
// GET /api/stocks/:id/memo
// ============================================================
describe("GET /api/stocks/:id/memo", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
  });

  // --- 正常系 ---

  it("G1: メモが存在する stock → 200 memo オブジェクト", async () => {
    const res = await workerFetch(
      `/api/stocks/${STOCK_WITH_MEMO}/memo`,
      "GET",
      { headers: authHeaders(USER1) },
    );

    expect(res.status).toBe(200);
    const body = await parseJsonResponse<Record<string, unknown>>(res);
    expect(body.stock_id).toBe(STOCK_WITH_MEMO);
    expect(body.memo_text).toBe(TEST_MEMOS[0].memo_text);
    expect(body.id).toBeDefined();
    expect(body.created_at).toBeDefined();
    expect(body.updated_at).toBeDefined();
  });

  // --- 異常系 ---

  it("G2: メモが未作成の stock → 404 NOT_FOUND（メモが見つかりません）", async () => {
    const res = await workerFetch(
      `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
      "GET",
      { headers: authHeaders(USER1) },
    );

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{
      code: string;
      error: string;
    }>(res);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.error).toBe("メモが見つかりません");
  });

  it("G3: stock が存在しない → 404 NOT_FOUND（ストックが見つかりません）", async () => {
    const res = await workerFetch(
      "/api/stocks/nonexistent-stock-id/memo",
      "GET",
      { headers: authHeaders(USER1) },
    );

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{
      code: string;
      error: string;
    }>(res);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.error).toContain("ストック");
  });

  it("G4: 他ユーザーの stock → 404 NOT_FOUND（ストックが見つかりません）", async () => {
    const res = await workerFetch(
      `/api/stocks/${STOCK_WITH_MEMO}/memo`,
      "GET",
      { headers: authHeaders(USER2) },
    );

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{
      code: string;
      error: string;
    }>(res);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.error).toContain("ストック");
  });
});

// ============================================================
// Stock API との連携
// ============================================================
describe("Memo - Stock API 連携", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
  });

  it("I1: PUT でメモ作成後、GET /api/stocks/:id の memo_text に反映される", async () => {
    const memoText = "連携テストメモ";

    // メモ作成
    await workerFetch(`/api/stocks/${STOCK_WITHOUT_MEMO}/memo`, "PUT", {
      body: { memo_text: memoText },
      headers: authHeaders(USER1),
    });

    // stock 詳細取得
    const res = await workerFetch(
      `/api/stocks/${STOCK_WITHOUT_MEMO}`,
      "GET",
      { headers: authHeaders(USER1) },
    );

    const body = await parseJsonResponse<Record<string, unknown>>(res);
    expect(body.memo_text).toBe(memoText);
  });

  it("I2: PUT でメモ更新後、GET /api/stocks の一覧の memo_text に反映される", async () => {
    const updatedMemo = "一覧連携テスト";

    // メモ更新
    await workerFetch(`/api/stocks/${STOCK_WITH_MEMO}/memo`, "PUT", {
      body: { memo_text: updatedMemo },
      headers: authHeaders(USER1),
    });

    // 一覧取得
    const res = await workerFetch("/api/stocks", "GET", {
      headers: authHeaders(USER1),
    });
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
    }>(res);

    const target = body.items.find((i) => i.id === STOCK_WITH_MEMO);
    expect(target).toBeDefined();
    expect(target!.memo_text).toBe(updatedMemo);
  });

  it("I3: DELETE /api/stocks/:id で stock 削除後、memo GET が 404 を返す", async () => {
    // stock 削除
    await workerFetch(`/api/stocks/${STOCK_WITH_MEMO}`, "DELETE", {
      headers: authHeaders(USER1),
    });

    // メモ取得 → stock 不存在の 404
    const res = await workerFetch(
      `/api/stocks/${STOCK_WITH_MEMO}/memo`,
      "GET",
      { headers: authHeaders(USER1) },
    );

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{
      code: string;
      error: string;
    }>(res);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.error).toContain("ストック");
  });
});
