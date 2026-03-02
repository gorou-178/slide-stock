/**
 * T-536: Stock API ユニットテスト
 *
 * 仕様: docs/stock-api-spec.md セクション 8
 *
 * テスト対象:
 * - POST /api/stocks: URL登録（正常系・異常系・重複・プロバイダエラー）
 * - GET /api/stocks: 一覧取得（ページネーション・メモ結合・ユーザー間分離）
 * - GET /api/stocks/:id: 詳細取得（所有権チェック）
 * - DELETE /api/stocks/:id: 削除（関連メモ連動・所有権チェック）
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  applyMigrationsAndSeed,
  resetSeedData,
  workerFetch,
  parseJsonResponse,
  TEST_USERS,
  TEST_STOCKS,
  TEST_MEMOS,
} from "../../test/helpers";
import { sendOEmbedMessage } from "../lib/queue";

// --- Queue スタブ ---
// vi.mock() はモジュールレベルで差し替えるため、
// SELF.fetch() 経由の Worker 内部でも同じモックが使われる
vi.mock("../lib/queue", () => ({
  sendOEmbedMessage: vi.fn().mockResolvedValue(undefined),
}));

// --- テスト用ヘルパー ---

/** 認証ヘッダー付きリクエスト */
function authHeaders(userId: string): Record<string, string> {
  return { "X-Test-User-Id": userId };
}

const USER1 = TEST_USERS[0].id; // test-user-1
const USER2 = TEST_USERS[1].id; // test-user-2

// ============================================================
// POST /api/stocks
// ============================================================
describe("POST /api/stocks", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
    vi.mocked(sendOEmbedMessage).mockClear();
  });

  // --- 正常系 ---

  describe("正常系", () => {
    it("P1: SpeakerDeck URL を登録できる（201）+ Queue 送信", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: { url: "https://speakerdeck.com/newuser/new-slide" },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.provider).toBe("speakerdeck");
      expect(body.canonical_url).toBe(
        "https://speakerdeck.com/newuser/new-slide",
      );
      expect(body.status).toBe("pending");
      expect(body.title).toBeNull();
      expect(body.memo_text).toBeNull();
      expect(body.id).toBeDefined();
      expect(body.created_at).toBeDefined();

      // Queue にメッセージが送信されたことを検証
      expect(sendOEmbedMessage).toHaveBeenCalledOnce();
      expect(sendOEmbedMessage).toHaveBeenCalledWith(
        expect.anything(), // queue binding
        expect.objectContaining({
          schemaVersion: 1,
          stockId: body.id,
          canonicalUrl: "https://speakerdeck.com/newuser/new-slide",
          provider: "speakerdeck",
        }),
      );
    });

    it("P2: Docswell URL を登録できる（201）", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: {
          url: "https://www.docswell.com/s/newuser/ABC123-new-slide",
        },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.provider).toBe("docswell");
      expect(body.status).toBe("pending");
    });

    it("P3: Google Slides URL を登録できる（201）", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: {
          url: "https://docs.google.com/presentation/d/1abcdefghijklmnopqrstuvwx/edit",
        },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.provider).toBe("google_slides");
      expect(body.canonical_url).toBe(
        "https://docs.google.com/presentation/d/1abcdefghijklmnopqrstuvwx",
      );
      expect(body.status).toBe("pending");
    });

    it("P4: URL が正規化される", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: {
          url: "https://docs.google.com/presentation/d/1zyxwvutsrqponmlkjihgfedcba/edit#slide=id.p",
        },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.canonical_url).toBe(
        "https://docs.google.com/presentation/d/1zyxwvutsrqponmlkjihgfedcba",
      );
    });
  });

  // --- 異常系 ---

  describe("異常系", () => {
    it("P5: url 未指定 → 400 INVALID_REQUEST（Queue 送信なし）", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: {},
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
      expect(sendOEmbedMessage).not.toHaveBeenCalled();
    });

    it("P6: url が空文字 → 400 INVALID_URL", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: { url: "" },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_URL");
    });

    it("P7: 不正な URL 形式 → 400 INVALID_URL", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: { url: "not-a-url" },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_URL");
    });

    it("P8: 未対応プロバイダ → 400 UNSUPPORTED_PROVIDER", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: { url: "https://slideshare.net/user/slide" },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UNSUPPORTED_PROVIDER");
    });

    it("P9: 不正なパス形式 → 400 INVALID_FORMAT", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: { url: "https://speakerdeck.com/useronly" },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_FORMAT");
    });

    it("P10: embed URL（対象外）→ 400 UNSUPPORTED_URL_TYPE", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: { url: "https://speakerdeck.com/player/abc123def" },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UNSUPPORTED_URL_TYPE");
    });

    it("P11: 重複 URL 登録 → 409 DUPLICATE_STOCK", async () => {
      // シードデータに既存の SpeakerDeck stock がある
      const existingUrl = TEST_STOCKS[0].canonical_url;
      const res = await workerFetch("/api/stocks", "POST", {
        body: { url: existingUrl },
        headers: authHeaders(USER1),
      });

      expect(res.status).toBe(409);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("DUPLICATE_STOCK");
    });

    it("P12: JSON パースエラー → 400 INVALID_REQUEST", async () => {
      const res = await workerFetch("/api/stocks", "POST", {
        body: "not-json" as unknown,
        headers: authHeaders(USER1),
      });

      // workerFetch が JSON.stringify するので実際には valid JSON になる
      // 代わりに body なしの raw リクエストをテスト
      const rawRes = await (
        await import("cloudflare:test")
      ).SELF.fetch("http://localhost/api/stocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User-Id": USER1,
        },
        body: "invalid-json{{{",
      });

      expect(rawRes.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(rawRes);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    // P13: 未認証テストは session-auth.test.ts でカバー済み
    // TEST_MODE=true 環境ではデフォルトテストユーザーが自動注入されるため、
    // ここでは認証ミドルウェア自体のテストは行わない
  });

  // --- 重複チェック: ユーザー間の分離 ---

  it("別ユーザーは同じ URL を登録できる", async () => {
    const existingUrl = TEST_STOCKS[0].canonical_url;

    // user-2 で登録（user-1 の既存 stock と同じ URL）
    const res = await workerFetch("/api/stocks", "POST", {
      body: { url: existingUrl },
      headers: authHeaders(USER2),
    });

    expect(res.status).toBe(201);
  });
});

// ============================================================
// GET /api/stocks
// ============================================================
describe("GET /api/stocks", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
  });

  // --- 正常系 ---

  it("L1: デフォルト一覧取得（created_at DESC）", async () => {
    const res = await workerFetch("/api/stocks", "GET", {
      headers: authHeaders(USER1),
    });

    expect(res.status).toBe(200);
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
      next_cursor: string | null;
      has_more: boolean;
    }>(res);

    // user-1 は 3 件の stock を持っている
    expect(body.items.length).toBe(3);
    expect(body.has_more).toBe(false);
    expect(body.next_cursor).toBeNull();

    // created_at DESC 順であることを確認
    const dates = body.items.map((i) => i.created_at as string);
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] >= dates[i + 1]).toBe(true);
    }
  });

  it("L2: limit 指定", async () => {
    const res = await workerFetch("/api/stocks?limit=2", "GET", {
      headers: authHeaders(USER1),
    });

    expect(res.status).toBe(200);
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
      next_cursor: string | null;
      has_more: boolean;
    }>(res);

    expect(body.items.length).toBe(2);
    expect(body.has_more).toBe(true);
    expect(body.next_cursor).toBeTruthy();
  });

  it("L3: カーソルページネーション", async () => {
    // 1ページ目
    const res1 = await workerFetch("/api/stocks?limit=2", "GET", {
      headers: authHeaders(USER1),
    });
    const page1 = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
      next_cursor: string;
      has_more: boolean;
    }>(res1);

    expect(page1.items.length).toBe(2);
    expect(page1.has_more).toBe(true);

    // 2ページ目
    const res2 = await workerFetch(
      `/api/stocks?limit=2&cursor=${page1.next_cursor}`,
      "GET",
      { headers: authHeaders(USER1) },
    );
    const page2 = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
      next_cursor: string | null;
      has_more: boolean;
    }>(res2);

    expect(page2.items.length).toBe(1);
    expect(page2.has_more).toBe(false);
    expect(page2.next_cursor).toBeNull();

    // ページ間で重複がないことを確認
    const page1Ids = page1.items.map((i) => i.id);
    const page2Ids = page2.items.map((i) => i.id);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });

  it("L4: ストック 0 件", async () => {
    // user-2 はストック 0 件
    const res = await workerFetch("/api/stocks", "GET", {
      headers: authHeaders(USER2),
    });

    expect(res.status).toBe(200);
    const body = await parseJsonResponse<{
      items: unknown[];
      next_cursor: string | null;
      has_more: boolean;
    }>(res);

    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
    expect(body.has_more).toBe(false);
  });

  it("L5: メモ付きストックは memo_text が結合されている", async () => {
    const res = await workerFetch("/api/stocks", "GET", {
      headers: authHeaders(USER1),
    });
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
    }>(res);

    // stock-speakerdeck-001 にはメモがある
    const withMemo = body.items.find(
      (i) => i.id === "stock-speakerdeck-001",
    );
    expect(withMemo).toBeDefined();
    expect(withMemo!.memo_text).toBe(TEST_MEMOS[0].memo_text);
  });

  it("L6: メモなしストックは memo_text が null", async () => {
    const res = await workerFetch("/api/stocks", "GET", {
      headers: authHeaders(USER1),
    });
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
    }>(res);

    // stock-google-slides-001 にはメモがない
    const noMemo = body.items.find(
      (i) => i.id === "stock-google-slides-001",
    );
    expect(noMemo).toBeDefined();
    expect(noMemo!.memo_text).toBeNull();
  });

  it("L7: has_more=false（最終ページ）", async () => {
    const res = await workerFetch("/api/stocks?limit=100", "GET", {
      headers: authHeaders(USER1),
    });
    const body = await parseJsonResponse<{
      has_more: boolean;
      next_cursor: string | null;
    }>(res);

    expect(body.has_more).toBe(false);
    expect(body.next_cursor).toBeNull();
  });

  // --- ユーザー間分離 ---

  it("L8: ユーザー A のストックがユーザー B の一覧に含まれない", async () => {
    const res = await workerFetch("/api/stocks", "GET", {
      headers: authHeaders(USER2),
    });
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
    }>(res);

    // user-2 は stock を持っていない
    expect(body.items.length).toBe(0);

    // user-1 の stock ID が含まれていないことを確認
    const ids = body.items.map((i) => i.id);
    for (const stock of TEST_STOCKS) {
      expect(ids).not.toContain(stock.id);
    }
  });
});

// ============================================================
// GET /api/stocks/:id
// ============================================================
describe("GET /api/stocks/:id", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
  });

  // --- 正常系 ---

  it("D1: 自分のストック取得（メモ付き）", async () => {
    const stockId = TEST_STOCKS[0].id; // stock-speakerdeck-001
    const res = await workerFetch(`/api/stocks/${stockId}`, "GET", {
      headers: authHeaders(USER1),
    });

    expect(res.status).toBe(200);
    const body = await parseJsonResponse<Record<string, unknown>>(res);
    expect(body.id).toBe(stockId);
    expect(body.provider).toBe("speakerdeck");
    expect(body.memo_text).toBe(TEST_MEMOS[0].memo_text);
  });

  it("D2: メモなしストック取得（memo_text=null）", async () => {
    const stockId = TEST_STOCKS[2].id; // stock-google-slides-001（メモなし）
    const res = await workerFetch(`/api/stocks/${stockId}`, "GET", {
      headers: authHeaders(USER1),
    });

    expect(res.status).toBe(200);
    const body = await parseJsonResponse<Record<string, unknown>>(res);
    expect(body.id).toBe(stockId);
    expect(body.memo_text).toBeNull();
  });

  // --- 異常系 ---

  it("D3: 存在しない ID → 404 NOT_FOUND", async () => {
    const res = await workerFetch(
      "/api/stocks/nonexistent-stock-id",
      "GET",
      { headers: authHeaders(USER1) },
    );

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{ code: string }>(res);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("D4: 他ユーザーのストック → 404 NOT_FOUND", async () => {
    const stockId = TEST_STOCKS[0].id; // user-1 の stock
    const res = await workerFetch(`/api/stocks/${stockId}`, "GET", {
      headers: authHeaders(USER2), // user-2 でアクセス
    });

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{ code: string }>(res);
    expect(body.code).toBe("NOT_FOUND");
  });
});

// ============================================================
// DELETE /api/stocks/:id
// ============================================================
describe("DELETE /api/stocks/:id", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
  });

  // --- 正常系 ---

  it("X1: 自分のストック削除 → 204", async () => {
    const stockId = TEST_STOCKS[2].id; // stock-google-slides-001（メモなし）
    const res = await workerFetch(`/api/stocks/${stockId}`, "DELETE", {
      headers: authHeaders(USER1),
    });

    expect(res.status).toBe(204);
  });

  it("X2: メモ付きストック削除 → 204（関連メモも削除）", async () => {
    const stockId = TEST_STOCKS[0].id; // stock-speakerdeck-001（メモあり）
    const res = await workerFetch(`/api/stocks/${stockId}`, "DELETE", {
      headers: authHeaders(USER1),
    });

    expect(res.status).toBe(204);

    // メモも削除されていることを確認
    const memoRes = await workerFetch(
      `/api/stocks/${stockId}/memo`,
      "GET",
      { headers: authHeaders(USER1) },
    );
    expect(memoRes.status).toBe(404);
  });

  it("X3: 削除後の GET → 404", async () => {
    const stockId = TEST_STOCKS[0].id;

    // 削除
    await workerFetch(`/api/stocks/${stockId}`, "DELETE", {
      headers: authHeaders(USER1),
    });

    // 取得 → 404
    const res = await workerFetch(`/api/stocks/${stockId}`, "GET", {
      headers: authHeaders(USER1),
    });
    expect(res.status).toBe(404);
  });

  it("X4: 削除後の一覧に含まれない", async () => {
    const stockId = TEST_STOCKS[0].id;

    // 削除
    await workerFetch(`/api/stocks/${stockId}`, "DELETE", {
      headers: authHeaders(USER1),
    });

    // 一覧取得
    const res = await workerFetch("/api/stocks", "GET", {
      headers: authHeaders(USER1),
    });
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
    }>(res);

    const ids = body.items.map((i) => i.id);
    expect(ids).not.toContain(stockId);
    expect(body.items.length).toBe(2); // 3 - 1 = 2
  });

  // --- 異常系 ---

  it("X5: 存在しない ID → 404 NOT_FOUND", async () => {
    const res = await workerFetch(
      "/api/stocks/nonexistent-stock-id",
      "DELETE",
      { headers: authHeaders(USER1) },
    );

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{ code: string }>(res);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("X6: 他ユーザーのストック → 404 NOT_FOUND", async () => {
    const stockId = TEST_STOCKS[0].id; // user-1 の stock
    const res = await workerFetch(`/api/stocks/${stockId}`, "DELETE", {
      headers: authHeaders(USER2), // user-2 でアクセス
    });

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{ code: string }>(res);
    expect(body.code).toBe("NOT_FOUND");
  });
});
