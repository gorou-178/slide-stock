/**
 * T-536: Stock API ユニットテスト
 *
 * テスト対象:
 * - POST /api/stocks: URL登録（正常系・異常系・重複・プロバイダエラー）+ oEmbed 同期取得
 * - GET /api/stocks: 一覧取得（ページネーション・メモ結合・ユーザー間分離）
 * - GET /api/stocks/:id: 詳細取得（所有権チェック）
 * - DELETE /api/stocks/:id: 削除（関連メモ連動・所有権チェック）
 *
 * ハンドラー直接呼出方式: ルーティング層に依存しない。
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
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
import { handleCreateStock } from "./stock-create";
import {
  handleListStocks,
  handleGetStock,
  handleDeleteStock,
  type StockEnv,
} from "./stocks";
import { handleGetMemo } from "./memo";
import type { AuthContext } from "../middleware/test-auth-bypass";

// --- oEmbed モック ---
// fetchWithRetry はリトライ／バックオフを bypass して fetcher を 1 回だけ呼ぶ
// 形にする。retry ロジックの単体テストは worker/lib/oembed.test.ts 側で担保し、
// ハンドラ単体テストではマッピングだけを検証する。
vi.mock("../lib/oembed", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/oembed")>();
  return {
    ...original,
    fetchSpeakerDeckMetadata: vi.fn().mockResolvedValue({
      title: "Mock SpeakerDeck Slide",
      authorName: "mock-author",
      thumbnailUrl: null,
      embedUrl: "https://speakerdeck.com/player/mock123",
    }),
    fetchDocswellMetadata: vi.fn().mockResolvedValue({
      title: "Mock Docswell Slide",
      authorName: "mock-dw-author",
      thumbnailUrl: null,
      embedUrl: "https://www.docswell.com/slide/MOCK01/embed",
    }),
    fetchGoogleSlidesMetadata: vi.fn().mockResolvedValue({
      title: "Mock Google Slides",
      authorName: null,
      thumbnailUrl: null,
      embedUrl: "https://docs.google.com/presentation/d/mock123/embed",
    }),
    fetchWithRetry: vi
      .fn()
      .mockImplementation(
        async (
          fetcher: (signal: AbortSignal) => Promise<unknown>,
        ): Promise<unknown> => {
          return await fetcher(AbortSignal.timeout(5_000));
        },
      ),
  };
});

import {
  fetchSpeakerDeckMetadata,
  fetchDocswellMetadata,
  fetchGoogleSlidesMetadata,
  UpstreamNotFoundError,
  UpstreamForbiddenError,
  UpstreamInvalidResponseError,
  UpstreamFailureError,
  UpstreamTimeoutError,
} from "../lib/oembed";

// --- テスト用ヘルパー ---

const USER1 = TEST_USERS[0].id; // test-user-1
const USER2 = TEST_USERS[1].id; // test-user-2

function auth(userId: string): AuthContext {
  return { userId };
}

function stockEnv(): StockEnv {
  return { DB: env.DB };
}

// ============================================================
// POST /api/stocks
// ============================================================
describe("POST /api/stocks", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
    vi.clearAllMocks();
  });

  // --- 正常系 ---

  describe("正常系", () => {
    it("P1: SpeakerDeck URL を登録できる（201）+ メタデータ取得", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://speakerdeck.com/newuser/new-slide",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.provider).toBe("speakerdeck");
      expect(body.canonical_url).toBe(
        "https://speakerdeck.com/newuser/new-slide",
      );
      expect(body.status).toBeUndefined();
      expect(body.title).toBe("Mock SpeakerDeck Slide");
      expect(body.embed_url).toBe("https://speakerdeck.com/player/mock123");
      expect(body.memo_text).toBeNull();
      expect(body.id).toBeDefined();
      expect(body.created_at).toBeDefined();

      // oEmbed fetch が呼ばれたことを検証
      expect(fetchSpeakerDeckMetadata).toHaveBeenCalledOnce();
      expect(fetchSpeakerDeckMetadata).toHaveBeenCalledWith(
        "https://speakerdeck.com/newuser/new-slide",
        expect.any(AbortSignal),
      );
    });

    it("P2: Docswell URL を登録できる（201）", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://www.docswell.com/s/newuser/ABC123-new-slide",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.provider).toBe("docswell");
      expect(body.status).toBeUndefined();
      expect(body.title).toBe("Mock Docswell Slide");
    });

    it("P3: Google Slides URL を登録できる（201）", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://docs.google.com/presentation/d/1abcdefghijklmnopqrstuvwx/edit",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.provider).toBe("google_slides");
      expect(body.canonical_url).toBe(
        "https://docs.google.com/presentation/d/1abcdefghijklmnopqrstuvwx",
      );
      expect(body.status).toBeUndefined();
      expect(body.title).toBe("Mock Google Slides");
    });

    it("P4: URL が正規化される", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://docs.google.com/presentation/d/1zyxwvutsrqponmlkjihgfedcba/edit#slide=id.p",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(body.canonical_url).toBe(
        "https://docs.google.com/presentation/d/1zyxwvutsrqponmlkjihgfedcba",
      );
    });

    it("P_uuid: 作成されたストックのIDがUUID v7フォーマットである", async () => {
      // UUID v7: xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx
      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://speakerdeck.com/newuser/uuid-v7-check",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(201);
      const body = await parseJsonResponse<Record<string, unknown>>(res);
      expect(typeof body.id).toBe("string");
      expect(uuidV7Pattern.test(body.id as string)).toBe(true);
    });

  });

  // --- 異常系 ---

  describe("異常系", () => {
    it("P6: url 未指定 → 400 INVALID_REQUEST", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {});
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
      expect(fetchSpeakerDeckMetadata).not.toHaveBeenCalled();
    });

    it("P7: url が空文字 → 400 INVALID_URL", async () => {
      const request = createJsonRequest("/api/stocks", "POST", { url: "" });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_URL");
    });

    it("P8: 不正な URL 形式 → 400 INVALID_URL", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "not-a-url",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_URL");
    });

    it("P9: 未対応プロバイダ → 400 UNSUPPORTED_PROVIDER", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://slideshare.net/user/slide",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UNSUPPORTED_PROVIDER");
    });

    it("P10: 不正なパス形式 → 400 INVALID_FORMAT", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://speakerdeck.com/useronly",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_FORMAT");
    });

    it("P11: embed URL（対象外）→ 400 UNSUPPORTED_URL_TYPE", async () => {
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://speakerdeck.com/player/abc123def",
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UNSUPPORTED_URL_TYPE");
    });

    it("P12: 重複 URL 登録 → 409 DUPLICATE_STOCK", async () => {
      // シードデータに既存の SpeakerDeck stock がある
      const existingUrl = TEST_STOCKS[0].canonical_url;
      const request = createJsonRequest("/api/stocks", "POST", {
        url: existingUrl,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(409);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("DUPLICATE_STOCK");
    });

    it("P13: JSON パースエラー → 400 INVALID_REQUEST", async () => {
      const request = createRawRequest(
        "/api/stocks",
        "POST",
        "invalid-json{{{",
      );
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INVALID_REQUEST");
    });
  });

  // --- プロバイダエラー: UPSTREAM_* マッピング（spec §3.5 / §8.1 P14-P26 / ADR-009 §4-2） ---

  describe("プロバイダエラー（UPSTREAM_*）", () => {
    async function findStock(userId: string, canonicalUrl: string) {
      return await env.DB.prepare(
        "SELECT id FROM stocks WHERE user_id = ? AND canonical_url = ? LIMIT 1",
      )
        .bind(userId, canonicalUrl)
        .first<{ id: string }>();
    }

    it("P14: SpeakerDeck 404 → 400 UPSTREAM_NOT_FOUND、stock は作成されない", async () => {
      vi.mocked(fetchSpeakerDeckMetadata).mockRejectedValueOnce(
        new UpstreamNotFoundError("SpeakerDeck 404"),
      );
      const canonicalUrl = "https://speakerdeck.com/newuser/missing-slide";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: canonicalUrl,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_NOT_FOUND");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P15: Docswell 403 → 400 UPSTREAM_FORBIDDEN、stock は作成されない", async () => {
      vi.mocked(fetchDocswellMetadata).mockRejectedValueOnce(
        new UpstreamForbiddenError("Docswell 403"),
      );
      const canonicalUrl = "https://www.docswell.com/s/newuser/PRIV01-private";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: canonicalUrl,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_FORBIDDEN");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P16: SpeakerDeck リトライ上限到達 → 502 UPSTREAM_FAILURE、stock は作成されない", async () => {
      vi.mocked(fetchSpeakerDeckMetadata).mockRejectedValueOnce(
        new UpstreamFailureError("max retries exhausted"),
      );
      const canonicalUrl = "https://speakerdeck.com/newuser/upstream-fail";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: canonicalUrl,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(502);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_FAILURE");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P17: Docswell 合計予算切れ → 504 UPSTREAM_TIMEOUT、stock は作成されない", async () => {
      vi.mocked(fetchDocswellMetadata).mockRejectedValueOnce(
        new UpstreamTimeoutError("total budget exhausted"),
      );
      const canonicalUrl = "https://www.docswell.com/s/newuser/SLOW01-timeout";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: canonicalUrl,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(504);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_TIMEOUT");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P18: SpeakerDeck レスポンス形式不正 → 502 UPSTREAM_INVALID_RESPONSE、stock は作成されない", async () => {
      vi.mocked(fetchSpeakerDeckMetadata).mockRejectedValueOnce(
        new UpstreamInvalidResponseError("missing iframe src"),
      );
      const canonicalUrl = "https://speakerdeck.com/newuser/malformed-slide";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: canonicalUrl,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(502);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_INVALID_RESPONSE");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P22: Google Slides <title> 欠落 → 502 UPSTREAM_INVALID_RESPONSE、stock は作成されない", async () => {
      vi.mocked(fetchGoogleSlidesMetadata).mockRejectedValueOnce(
        new UpstreamInvalidResponseError("missing <title>"),
      );
      const canonicalUrl =
        "https://docs.google.com/presentation/d/1notitle00000000000000000";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: `${canonicalUrl}/edit`,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(502);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_INVALID_RESPONSE");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P23: Google Slides 5xx 連続失敗 → 502 UPSTREAM_FAILURE、stock は作成されない", async () => {
      vi.mocked(fetchGoogleSlidesMetadata).mockRejectedValueOnce(
        new UpstreamFailureError("Google Slides 503 x3"),
      );
      const canonicalUrl =
        "https://docs.google.com/presentation/d/1gs5xxfail0000000000000000";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: `${canonicalUrl}/edit`,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(502);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_FAILURE");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P24: Google Slides タイムアウト → 504 UPSTREAM_TIMEOUT、stock は作成されない", async () => {
      vi.mocked(fetchGoogleSlidesMetadata).mockRejectedValueOnce(
        new UpstreamTimeoutError("Google Slides total budget exhausted"),
      );
      const canonicalUrl =
        "https://docs.google.com/presentation/d/1gstimeout00000000000000000";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: `${canonicalUrl}/edit`,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(504);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_TIMEOUT");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P25: Google Slides 401/403 → 400 UPSTREAM_FORBIDDEN、stock は作成されない", async () => {
      vi.mocked(fetchGoogleSlidesMetadata).mockRejectedValueOnce(
        new UpstreamForbiddenError("Google Slides 403 private"),
      );
      const canonicalUrl =
        "https://docs.google.com/presentation/d/1gsprivate00000000000000000";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: `${canonicalUrl}/edit`,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_FORBIDDEN");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });

    it("P26: Google Slides 404 → 400 UPSTREAM_NOT_FOUND、stock は作成されない", async () => {
      vi.mocked(fetchGoogleSlidesMetadata).mockRejectedValueOnce(
        new UpstreamNotFoundError("Google Slides 404"),
      );
      const canonicalUrl =
        "https://docs.google.com/presentation/d/1gsmissing00000000000000000";
      const request = createJsonRequest("/api/stocks", "POST", {
        url: `${canonicalUrl}/edit`,
      });
      const res = await handleCreateStock(request, stockEnv(), auth(USER1));

      expect(res.status).toBe(400);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("UPSTREAM_NOT_FOUND");
      expect(await findStock(USER1, canonicalUrl)).toBeNull();
    });
  });

  // --- D1 INSERT 失敗（spec §3.6 / §8.1 P20 / P21 / ADR-009 §4-4） ---

  describe("D1 INSERT 失敗", () => {
    function fakeEnv(insertError: Error): StockEnv {
      return {
        DB: {
          prepare: (sql: string) => ({
            bind: (..._args: unknown[]) => ({
              first: async () => null, // SELECT (重複チェック) は通す
              run: async () => {
                if (sql.includes("INSERT")) {
                  throw insertError;
                }
                return { success: true } as unknown;
              },
            }),
          }),
        },
      } as unknown as StockEnv;
    }

    it("P20: 並列レースの UNIQUE 制約違反 → 409 DUPLICATE_STOCK", async () => {
      const env = fakeEnv(
        new Error(
          "D1_ERROR: UNIQUE constraint failed: stocks.user_id, stocks.canonical_url",
        ),
      );
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://speakerdeck.com/newuser/race-condition",
      });
      const res = await handleCreateStock(request, env, auth(USER1));

      expect(res.status).toBe(409);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("DUPLICATE_STOCK");
    });

    it("P21: D1 INSERT 一般エラー → 500 INTERNAL_ERROR", async () => {
      const env = fakeEnv(new Error("D1_ERROR: connection lost"));
      const request = createJsonRequest("/api/stocks", "POST", {
        url: "https://speakerdeck.com/newuser/d1-down",
      });
      const res = await handleCreateStock(request, env, auth(USER1));

      expect(res.status).toBe(500);
      const body = await parseJsonResponse<{ code: string }>(res);
      expect(body.code).toBe("INTERNAL_ERROR");
    });
  });

  // --- 重複チェック: ユーザー間の分離 ---

  it("別ユーザーは同じ URL を登録できる", async () => {
    const existingUrl = TEST_STOCKS[0].canonical_url;

    // user-2 で登録（user-1 の既存 stock と同じ URL）
    const request = createJsonRequest("/api/stocks", "POST", {
      url: existingUrl,
    });
    const res = await handleCreateStock(request, stockEnv(), auth(USER2));

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
    const request = createJsonRequest("/api/stocks");
    const res = await handleListStocks(request, stockEnv(), auth(USER1));

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
    const request = createJsonRequest("/api/stocks?limit=2");
    const res = await handleListStocks(request, stockEnv(), auth(USER1));

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
    const req1 = createJsonRequest("/api/stocks?limit=2");
    const res1 = await handleListStocks(req1, stockEnv(), auth(USER1));
    const page1 = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
      next_cursor: string;
      has_more: boolean;
    }>(res1);

    expect(page1.items.length).toBe(2);
    expect(page1.has_more).toBe(true);

    // 2ページ目
    const req2 = createJsonRequest(
      `/api/stocks?limit=2&cursor=${page1.next_cursor}`,
    );
    const res2 = await handleListStocks(req2, stockEnv(), auth(USER1));
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
    const request = createJsonRequest("/api/stocks");
    const res = await handleListStocks(request, stockEnv(), auth(USER2));

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
    const request = createJsonRequest("/api/stocks");
    const res = await handleListStocks(request, stockEnv(), auth(USER1));
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
    const request = createJsonRequest("/api/stocks");
    const res = await handleListStocks(request, stockEnv(), auth(USER1));
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
    const request = createJsonRequest("/api/stocks?limit=100");
    const res = await handleListStocks(request, stockEnv(), auth(USER1));
    const body = await parseJsonResponse<{
      has_more: boolean;
      next_cursor: string | null;
    }>(res);

    expect(body.has_more).toBe(false);
    expect(body.next_cursor).toBeNull();
  });

  // --- ユーザー間分離 ---

  it("L8: ユーザー A のストックがユーザー B の一覧に含まれない", async () => {
    const request = createJsonRequest("/api/stocks");
    const res = await handleListStocks(request, stockEnv(), auth(USER2));
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
    const res = await handleGetStock(stockId, stockEnv(), auth(USER1));

    expect(res.status).toBe(200);
    const body = await parseJsonResponse<Record<string, unknown>>(res);
    expect(body.id).toBe(stockId);
    expect(body.provider).toBe("speakerdeck");
    expect(body.memo_text).toBe(TEST_MEMOS[0].memo_text);
  });

  it("D2: メモなしストック取得（memo_text=null）", async () => {
    const stockId = TEST_STOCKS[2].id; // stock-google-slides-001（メモなし）
    const res = await handleGetStock(stockId, stockEnv(), auth(USER1));

    expect(res.status).toBe(200);
    const body = await parseJsonResponse<Record<string, unknown>>(res);
    expect(body.id).toBe(stockId);
    expect(body.memo_text).toBeNull();
  });

  // --- 異常系 ---

  it("D3: 存在しない ID → 404 NOT_FOUND", async () => {
    const res = await handleGetStock(
      "nonexistent-stock-id",
      stockEnv(),
      auth(USER1),
    );

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{ code: string }>(res);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("D4: 他ユーザーのストック → 404 NOT_FOUND", async () => {
    const stockId = TEST_STOCKS[0].id; // user-1 の stock
    const res = await handleGetStock(stockId, stockEnv(), auth(USER2));

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
    const res = await handleDeleteStock(stockId, stockEnv(), auth(USER1));

    expect(res.status).toBe(204);
  });

  it("X2: メモ付きストック削除 → 204（関連メモも削除）", async () => {
    const stockId = TEST_STOCKS[0].id; // stock-speakerdeck-001（メモあり）
    const res = await handleDeleteStock(stockId, stockEnv(), auth(USER1));

    expect(res.status).toBe(204);

    // メモも削除されていることを確認
    const memoRes = await handleGetMemo(stockId, stockEnv(), auth(USER1));
    expect(memoRes.status).toBe(404);
  });

  it("X3: 削除後の GET → 404", async () => {
    const stockId = TEST_STOCKS[0].id;

    // 削除
    await handleDeleteStock(stockId, stockEnv(), auth(USER1));

    // 取得 → 404
    const res = await handleGetStock(stockId, stockEnv(), auth(USER1));
    expect(res.status).toBe(404);
  });

  it("X4: 削除後の一覧に含まれない", async () => {
    const stockId = TEST_STOCKS[0].id;

    // 削除
    await handleDeleteStock(stockId, stockEnv(), auth(USER1));

    // 一覧取得
    const request = createJsonRequest("/api/stocks");
    const res = await handleListStocks(request, stockEnv(), auth(USER1));
    const body = await parseJsonResponse<{
      items: Array<Record<string, unknown>>;
    }>(res);

    const ids = body.items.map((i) => i.id);
    expect(ids).not.toContain(stockId);
    expect(body.items.length).toBe(2); // 3 - 1 = 2
  });

  // --- 異常系 ---

  it("X5: 存在しない ID → 404 NOT_FOUND", async () => {
    const res = await handleDeleteStock(
      "nonexistent-stock-id",
      stockEnv(),
      auth(USER1),
    );

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{ code: string }>(res);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("X6: 他ユーザーのストック → 404 NOT_FOUND", async () => {
    const stockId = TEST_STOCKS[0].id; // user-1 の stock
    const res = await handleDeleteStock(stockId, stockEnv(), auth(USER2));

    expect(res.status).toBe(404);
    const body = await parseJsonResponse<{ code: string }>(res);
    expect(body.code).toBe("NOT_FOUND");
  });
});
