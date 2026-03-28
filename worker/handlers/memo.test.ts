/**
 * T-543: Memo API ユニットテスト
 *
 * 仕様: docs/memo-api-spec.md セクション 8
 *
 * テスト対象:
 * - PUT /api/stocks/:id/memo: メモ作成・更新（upsert）、バリデーション
 * - GET /api/stocks/:id/memo: メモ取得、stock 不存在 / メモ未作成の区別
 * - Stock API との連携: メモ反映、stock 削除時のメモ連動削除
 *
 * ハンドラー直接呼出方式: workerFetch() (SELF.fetch) を使わず、
 * ハンドラー関数を直接呼び出す。ルーティング層に依存しない。
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  applyMigrationsAndSeed,
  resetSeedData,
  createJsonRequest,
  createRawRequest,
  parseJsonResponse,
  TEST_USERS,
  TEST_STOCKS,
  TEST_MEMOS,
} from "../../test/helpers";
import { handlePutMemo, handleGetMemo, type MemoEnv } from "./memo";
import {
  handleGetStock,
  handleListStocks,
  handleDeleteStock,
  type StockEnv,
} from "./stocks";
import type { AuthContext } from "../middleware/test-auth-bypass";

// --- テスト用ヘルパー ---

const USER1 = TEST_USERS[0].id; // test-user-1
const USER2 = TEST_USERS[1].id; // test-user-2

// メモ付き stock
const STOCK_WITH_MEMO = TEST_STOCKS[0].id; // stock-speakerdeck-001
// メモなし stock
const STOCK_WITHOUT_MEMO = TEST_STOCKS[2].id; // stock-google-slides-001

function auth(userId: string): AuthContext {
  return { userId };
}

function memoEnv(): MemoEnv {
  return { DB: env.DB };
}

function stockEnv(): StockEnv {
  return { DB: env.DB };
}

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
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
        "PUT",
        { memo_text: "良いスライド" },
      );
      const res = await handlePutMemo(
        STOCK_WITHOUT_MEMO,
        request,
        memoEnv(),
        auth(USER1),
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
      const existing = await parseJsonResponse<Record<string, unknown>>(
        await handleGetMemo(STOCK_WITH_MEMO, memoEnv(), auth(USER1)),
      );

      // 更新
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        { memo_text: "更新したメモ" },
      );
      const res = await handlePutMemo(
        STOCK_WITH_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe("更新したメモ");
      // created_at は変わらない
      expect(body.created_at).toBe(existing.created_at);
      // id も変わらない
      expect(body.id).toBe(existing.id);
    });

    it("M3: 最大文字数ぴったり（200文字）", async () => {
      const longText = "あ".repeat(200);
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
        "PUT",
        { memo_text: longText },
      );
      const res = await handlePutMemo(
        STOCK_WITHOUT_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe(longText);
    });

    it("M_trim: 前後空白がトリムされてDBに保存される", async () => {
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
        "PUT",
        { memo_text: "  メモ内容  " },
      );
      const res = await handlePutMemo(
        STOCK_WITHOUT_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe("メモ内容");
    });

    it("M_crlf: CRLF/CRがLFに正規化されてDBに保存される", async () => {
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
        "PUT",
        { memo_text: "1行目\r\n2行目\r3行目" },
      );
      const res = await handlePutMemo(
        STOCK_WITHOUT_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe("1行目\n2行目\n3行目");
    });

    it("M4: マルチバイト文字を含むメモ", async () => {
      const text = "日本語のメモ🎉";
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
        "PUT",
        { memo_text: text },
      );
      const res = await handlePutMemo(
        STOCK_WITHOUT_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(200);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.memo_text).toBe(text);
    });
  });

  // --- 異常系 ---

  describe("異常系", () => {
    it("M5: memo_text 未指定 → 400 INVALID_REQUEST", async () => {
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        {},
      );
      const res = await handlePutMemo(
        STOCK_WITH_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M6: memo_text が空文字列 → 400 INVALID_REQUEST", async () => {
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        { memo_text: "" },
      );
      const res = await handlePutMemo(
        STOCK_WITH_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M7: memo_text が空白のみ → 400 INVALID_REQUEST", async () => {
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        { memo_text: "   " },
      );
      const res = await handlePutMemo(
        STOCK_WITH_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M8: memo_text が 201 文字 → 400 MEMO_TOO_LONG", async () => {
      const longText = "あ".repeat(201);
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        { memo_text: longText },
      );
      const res = await handlePutMemo(
        STOCK_WITH_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("MEMO_TOO_LONG");
    });

    it("M9: memo_text が string でない → 400 INVALID_REQUEST", async () => {
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        { memo_text: 123 },
      );
      const res = await handlePutMemo(
        STOCK_WITH_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M10: JSON パースエラー → 400 INVALID_REQUEST", async () => {
      const request = createRawRequest(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        "invalid-json{{{",
      );
      const res = await handlePutMemo(
        STOCK_WITH_MEMO,
        request,
        memoEnv(),
        auth(USER1),
      );

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("M11: stock が存在しない → 404 NOT_FOUND", async () => {
      const request = createJsonRequest(
        "/api/stocks/nonexistent-stock-id/memo",
        "PUT",
        { memo_text: "テスト" },
      );
      const res = await handlePutMemo(
        "nonexistent-stock-id",
        request,
        memoEnv(),
        auth(USER1),
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
      const request = createJsonRequest(
        `/api/stocks/${STOCK_WITH_MEMO}/memo`,
        "PUT",
        { memo_text: "テスト" },
      );
      const res = await handlePutMemo(
        STOCK_WITH_MEMO,
        request,
        memoEnv(),
        auth(USER2),
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
    const res = await handleGetMemo(STOCK_WITH_MEMO, memoEnv(), auth(USER1));

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
    const res = await handleGetMemo(
      STOCK_WITHOUT_MEMO,
      memoEnv(),
      auth(USER1),
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
    const res = await handleGetMemo(
      "nonexistent-stock-id",
      memoEnv(),
      auth(USER1),
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
    const res = await handleGetMemo(STOCK_WITH_MEMO, memoEnv(), auth(USER2));

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
    const putRequest = createJsonRequest(
      `/api/stocks/${STOCK_WITHOUT_MEMO}/memo`,
      "PUT",
      { memo_text: memoText },
    );
    await handlePutMemo(STOCK_WITHOUT_MEMO, putRequest, memoEnv(), auth(USER1));

    // stock 詳細取得
    const res = await handleGetStock(
      STOCK_WITHOUT_MEMO,
      stockEnv(),
      auth(USER1),
    );

    const body = await parseJsonResponse<Record<string, unknown>>(res);
    expect(body.memo_text).toBe(memoText);
  });

  it("I2: PUT でメモ更新後、GET /api/stocks の一覧の memo_text に反映される", async () => {
    const updatedMemo = "一覧連携テスト";

    // メモ更新
    const putRequest = createJsonRequest(
      `/api/stocks/${STOCK_WITH_MEMO}/memo`,
      "PUT",
      { memo_text: updatedMemo },
    );
    await handlePutMemo(STOCK_WITH_MEMO, putRequest, memoEnv(), auth(USER1));

    // 一覧取得
    const listRequest = createJsonRequest("/api/stocks");
    const res = await handleListStocks(listRequest, stockEnv(), auth(USER1));
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
    }>(res);

    const target = body.items.find((i) => i.id === STOCK_WITH_MEMO);
    expect(target).toBeDefined();
    expect(target!.memo_text).toBe(updatedMemo);
  });

  it("I3: DELETE /api/stocks/:id で stock 削除後、memo GET が 404 を返す", async () => {
    // stock 削除
    await handleDeleteStock(STOCK_WITH_MEMO, stockEnv(), auth(USER1));

    // メモ取得 → stock 不存在の 404
    const res = await handleGetMemo(STOCK_WITH_MEMO, memoEnv(), auth(USER1));

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{
      code: string;
      error: string;
    }>(res);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.error).toContain("ストック");
  });
});
