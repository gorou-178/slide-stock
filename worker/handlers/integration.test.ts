/**
 * T-573: 統合テスト
 *
 * URL 登録 → oEmbed 同期取得 → メタデータ込み stock が取得できることを検証する。
 *
 * テスト戦略:
 * - handleCreateStock で stock を登録（oEmbed 同期取得で ready 状態）
 * - handleGetStock / handleListStocks で完全なメタデータが返ることを確認
 * - 各プロバイダ（SpeakerDeck, Docswell, Google Slides）で検証
 * - 失敗シナリオ: oEmbed 取得失敗 → stock は作成されるがメタデータ null
 *
 * ハンドラー直接呼出方式: ルーティング層に依存しない。
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  applyMigrationsAndSeed,
  resetSeedData,
  createJsonRequest,
  parseJsonResponse,
} from "../../test/helpers";
import {
  handleCreateStock,
  handleListStocks,
  handleGetStock,
  type StockEnv,
} from "./stocks";
import type { AuthContext } from "../middleware/test-auth-bypass";

// --- oEmbed フェッチのモック ---
vi.mock("../lib/oembed", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/oembed")>();
  return {
    ...original,
    fetchSpeakerDeckMetadata: vi.fn(),
    fetchDocswellMetadata: vi.fn(),
    fetchGoogleSlidesMetadata: vi.fn(),
  };
});

import {
  fetchSpeakerDeckMetadata,
  fetchDocswellMetadata,
  fetchGoogleSlidesMetadata,
} from "../lib/oembed";

const mockSpeakerDeck = vi.mocked(fetchSpeakerDeckMetadata);
const mockDocswell = vi.mocked(fetchDocswellMetadata);
const mockGoogleSlides = vi.mocked(fetchGoogleSlidesMetadata);

// --- ヘルパー ---

const USER1 = "test-user-1";

function auth(userId: string): AuthContext {
  return { userId };
}

function stockEnv(): StockEnv {
  return { DB: env.DB };
}

interface StockResponse {
  id: string;
  original_url: string;
  canonical_url: string;
  provider: string;
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  status: string;
  memo_text: string | null;
  created_at: string;
  updated_at: string;
}

interface StockListResponse {
  items: StockResponse[];
  next_cursor: string | null;
  has_more: boolean;
}

/** stock を作成して結果を返すヘルパー */
async function createStock(url: string): Promise<StockResponse> {
  const request = createJsonRequest("/api/stocks", "POST", { url });
  const res = await handleCreateStock(request, stockEnv(), auth(USER1));
  expect(res.status).toBe(201);
  return parseJsonResponse<StockResponse>(res);
}

// ============================================================
// 統合テスト: 全フロー検証
// ============================================================
describe("統合テスト: URL 登録 → メタデータ取得 → 一覧表示", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
    vi.clearAllMocks();
  });

  // --- SpeakerDeck ---

  describe("SpeakerDeck フルフロー", () => {
    it("URL 登録 → メタデータ込みで ready 状態の stock が返る", async () => {
      mockSpeakerDeck.mockResolvedValueOnce({
        title: "Integration Test Slide",
        authorName: "integration-user",
        thumbnailUrl: null,
        embedUrl: "https://speakerdeck.com/player/int123",
      });

      const created = await createStock(
        "https://speakerdeck.com/integration/test-slide",
      );

      expect(created.status).toBe("ready");
      expect(created.provider).toBe("speakerdeck");
      expect(created.title).toBe("Integration Test Slide");
      expect(created.author_name).toBe("integration-user");
      expect(created.embed_url).toBe("https://speakerdeck.com/player/int123");

      // GET /api/stocks/:id でも同じデータが取得できる
      const detailRes = await handleGetStock(
        created.id,
        stockEnv(),
        auth(USER1),
      );
      const detail = await parseJsonResponse<StockResponse>(detailRes);
      expect(detail.status).toBe("ready");
      expect(detail.title).toBe("Integration Test Slide");
      expect(detail.embed_url).toBe("https://speakerdeck.com/player/int123");

      // 一覧にも含まれる
      const listRequest = createJsonRequest("/api/stocks");
      const listRes = await handleListStocks(
        listRequest,
        stockEnv(),
        auth(USER1),
      );
      const list = await parseJsonResponse<StockListResponse>(listRes);
      const found = list.items.find((item) => item.id === created.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe("Integration Test Slide");
    });
  });

  // --- Docswell ---

  describe("Docswell フルフロー", () => {
    it("URL 登録 → メタデータ込みで ready 状態", async () => {
      mockDocswell.mockResolvedValueOnce({
        title: "Docswell Integration Slide",
        authorName: "dw-author",
        thumbnailUrl: null,
        embedUrl: "https://www.docswell.com/slide/INT001/embed",
      });

      const created = await createStock(
        "https://www.docswell.com/s/integration/INT001",
      );

      expect(created.status).toBe("ready");
      expect(created.provider).toBe("docswell");
      expect(created.title).toBe("Docswell Integration Slide");
      expect(created.embed_url).toBe(
        "https://www.docswell.com/slide/INT001/embed",
      );
    });
  });

  // --- Google Slides ---

  describe("Google Slides フルフロー", () => {
    it("URL 登録 → メタデータ込みで ready 状態", async () => {
      mockGoogleSlides.mockResolvedValueOnce({
        title: "Google Integration Presentation",
        authorName: null,
        thumbnailUrl: null,
        embedUrl:
          "https://docs.google.com/presentation/d/1ABCDEFGHIJKLMNOPQRSTUVWXYZintegration/embed",
      });

      const created = await createStock(
        "https://docs.google.com/presentation/d/1ABCDEFGHIJKLMNOPQRSTUVWXYZintegration/edit",
      );

      expect(created.status).toBe("ready");
      expect(created.provider).toBe("google_slides");
      expect(created.title).toBe("Google Integration Presentation");
      expect(created.embed_url).toBe(
        "https://docs.google.com/presentation/d/1ABCDEFGHIJKLMNOPQRSTUVWXYZintegration/embed",
      );
    });
  });

  // --- 失敗シナリオ ---

  describe("失敗シナリオ: oEmbed 取得失敗", () => {
    it("oEmbed 取得失敗 → stock は作成されるがメタデータ null", async () => {
      mockSpeakerDeck.mockRejectedValueOnce(new Error("Network timeout"));

      const created = await createStock(
        "https://speakerdeck.com/integration/deleted-slide",
      );

      expect(created.status).toBe("ready");
      expect(created.title).toBeNull();
      expect(created.embed_url).toBeNull();

      // GET でも同じ状態
      const detailRes = await handleGetStock(
        created.id,
        stockEnv(),
        auth(USER1),
      );
      const detail = await parseJsonResponse<StockResponse>(detailRes);
      expect(detail.title).toBeNull();
      expect(detail.embed_url).toBeNull();
    });
  });

  // --- 複数ストック連続登録 ---

  describe("複数ストック連続登録フロー", () => {
    it("3 プロバイダのストックを連続登録 → 全て ready + メタデータ付き", async () => {
      mockSpeakerDeck.mockResolvedValueOnce({
        title: "Multi Slide 1",
        authorName: "author1",
        thumbnailUrl: null,
        embedUrl: "https://speakerdeck.com/player/m1",
      });
      mockDocswell.mockResolvedValueOnce({
        title: "Multi Slide 2",
        authorName: "author2",
        thumbnailUrl: null,
        embedUrl: "https://www.docswell.com/slide/MULT02/embed",
      });
      mockGoogleSlides.mockResolvedValueOnce({
        title: "Multi Slide 3",
        authorName: null,
        thumbnailUrl: null,
        embedUrl:
          "https://docs.google.com/presentation/d/1multi3ABCDEFGHIJKLMNOPQRSTUVWXYZtest/embed",
      });

      const urls = [
        "https://speakerdeck.com/integration/multi-1",
        "https://www.docswell.com/s/integration/MULT02",
        "https://docs.google.com/presentation/d/1multi3ABCDEFGHIJKLMNOPQRSTUVWXYZtest/edit",
      ];

      const stockIds: string[] = [];
      for (const url of urls) {
        const created = await createStock(url);
        stockIds.push(created.id);
        expect(created.status).toBe("ready");
      }

      // 一覧取得で全て含まれることを確認
      const listRequest = createJsonRequest("/api/stocks");
      const listRes = await handleListStocks(
        listRequest,
        stockEnv(),
        auth(USER1),
      );
      const list = await parseJsonResponse<StockListResponse>(listRes);

      for (const stockId of stockIds) {
        const found = list.items.find((item) => item.id === stockId);
        expect(found).toBeDefined();
        expect(found!.status).toBe("ready");
        expect(found!.title).toBeTruthy();
      }
    });
  });
});
