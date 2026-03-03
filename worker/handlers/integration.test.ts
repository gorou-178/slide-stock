/**
 * T-573: 統合テスト
 *
 * URL 登録 → Queue 処理 → メタデータ取得 → 一覧表示の全フローを検証する。
 *
 * テスト戦略:
 * - POST /api/stocks で stock を登録（pending 状態）
 * - handleQueue を直接呼び出して Queue 処理をシミュレート
 * - GET /api/stocks で ready 状態の stock が取得できることを確認
 * - 各プロバイダ（SpeakerDeck, Docswell, Google Slides）で検証
 * - 失敗シナリオ: oEmbed 取得失敗 → stock が failed 状態
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  applyMigrationsAndSeed,
  resetSeedData,
  workerFetch,
  parseJsonResponse,
} from "../../test/helpers";
import { handleQueue, type OEmbedQueueMessage } from "./queue-consumer";
import { PermanentError } from "../lib/oembed";

// --- Queue 送信のモック（POST /api/stocks 内で呼ばれる） ---
vi.mock("../lib/queue", () => ({
  sendOEmbedMessage: vi.fn().mockResolvedValue(undefined),
}));

// --- oEmbed フェッチのモック（handleQueue 内で呼ばれる） ---
vi.mock("../lib/oembed", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/oembed")>();
  return {
    ...original,
    fetchSpeakerDeckMetadata: vi.fn(),
    fetchDocswellMetadata: vi.fn(),
    fetchGoogleSlidesMetadata: vi.fn(),
  };
});

import { sendOEmbedMessage } from "../lib/queue";
import {
  fetchSpeakerDeckMetadata,
  fetchDocswellMetadata,
  fetchGoogleSlidesMetadata,
} from "../lib/oembed";

const mockSpeakerDeck = vi.mocked(fetchSpeakerDeckMetadata);
const mockDocswell = vi.mocked(fetchDocswellMetadata);
const mockGoogleSlides = vi.mocked(fetchGoogleSlidesMetadata);

// --- ヘルパー ---

function authHeaders(userId: string): Record<string, string> {
  return { "X-Test-User-Id": userId };
}

const USER1 = "test-user-1";

function createMockMessage(body: OEmbedQueueMessage) {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn(),
    id: "mock-msg-id",
    timestamp: new Date(),
    attempts: 1,
  };
}

function createMockBatch(
  messages: Array<ReturnType<typeof createMockMessage>>,
) {
  return {
    messages,
    queue: "oembed-fetch",
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<OEmbedQueueMessage>;
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

// ============================================================
// 統合テスト: 全フロー検証
// ============================================================
describe("統合テスト: URL 登録 → Queue 処理 → 一覧表示", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
    vi.clearAllMocks();
  });

  // --- SpeakerDeck ---

  describe("SpeakerDeck フルフロー", () => {
    it("URL 登録 → Queue 処理 → ready 状態で一覧取得", async () => {
      const url = "https://speakerdeck.com/integration/test-slide";

      // Step 1: URL を POST して stock を登録
      const createRes = await workerFetch("/api/stocks", "POST", {
        body: { url },
        headers: authHeaders(USER1),
      });
      expect(createRes.status).toBe(201);

      const created = await parseJsonResponse<StockResponse>(createRes);
      expect(created.status).toBe("pending");
      expect(created.provider).toBe("speakerdeck");
      expect(created.title).toBeNull();
      expect(created.embed_url).toBeNull();

      const stockId = created.id;

      // Queue メッセージが送信されたことを確認
      expect(sendOEmbedMessage).toHaveBeenCalledOnce();

      // Step 2: Queue コンシューマーを実行（oEmbed メタデータ取得）
      mockSpeakerDeck.mockResolvedValueOnce({
        title: "Integration Test Slide",
        authorName: "integration-user",
        thumbnailUrl: null,
        embedUrl: "https://speakerdeck.com/player/int123",
      });

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: url,
        canonicalUrl: created.canonical_url,
        provider: "speakerdeck",
      });
      await handleQueue(createMockBatch([msg]), env);
      expect(msg.ack).toHaveBeenCalled();

      // Step 3: GET /api/stocks/:id で ready 状態を確認
      const detailRes = await workerFetch(`/api/stocks/${stockId}`, "GET", {
        headers: authHeaders(USER1),
      });
      expect(detailRes.status).toBe(200);

      const detail = await parseJsonResponse<StockResponse>(detailRes);
      expect(detail.status).toBe("ready");
      expect(detail.title).toBe("Integration Test Slide");
      expect(detail.author_name).toBe("integration-user");
      expect(detail.embed_url).toBe("https://speakerdeck.com/player/int123");

      // Step 4: GET /api/stocks の一覧に含まれることを確認
      const listRes = await workerFetch("/api/stocks", "GET", {
        headers: authHeaders(USER1),
      });
      expect(listRes.status).toBe(200);

      const list = await parseJsonResponse<StockListResponse>(listRes);
      const found = list.items.find((item) => item.id === stockId);
      expect(found).toBeDefined();
      expect(found!.status).toBe("ready");
      expect(found!.title).toBe("Integration Test Slide");
    });
  });

  // --- Docswell ---

  describe("Docswell フルフロー", () => {
    it("URL 登録 → Queue 処理 → ready 状態で一覧取得", async () => {
      const url = "https://www.docswell.com/s/integration/INT001";

      // Step 1: 登録
      const createRes = await workerFetch("/api/stocks", "POST", {
        body: { url },
        headers: authHeaders(USER1),
      });
      expect(createRes.status).toBe(201);

      const created = await parseJsonResponse<StockResponse>(createRes);
      expect(created.status).toBe("pending");
      expect(created.provider).toBe("docswell");

      const stockId = created.id;

      // Step 2: Queue 処理
      mockDocswell.mockResolvedValueOnce({
        title: "Docswell Integration Slide",
        authorName: "dw-author",
        thumbnailUrl: null,
        embedUrl: "https://www.docswell.com/slide/INT001/embed",
      });

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: url,
        canonicalUrl: created.canonical_url,
        provider: "docswell",
      });
      await handleQueue(createMockBatch([msg]), env);
      expect(msg.ack).toHaveBeenCalled();

      // Step 3: 詳細取得で確認
      const detailRes = await workerFetch(`/api/stocks/${stockId}`, "GET", {
        headers: authHeaders(USER1),
      });
      const detail = await parseJsonResponse<StockResponse>(detailRes);
      expect(detail.status).toBe("ready");
      expect(detail.title).toBe("Docswell Integration Slide");
      expect(detail.embed_url).toBe(
        "https://www.docswell.com/slide/INT001/embed",
      );
    });
  });

  // --- Google Slides ---

  describe("Google Slides フルフロー", () => {
    it("URL 登録 → Queue 処理 → ready 状態で一覧取得", async () => {
      const url = "https://docs.google.com/presentation/d/1ABCDEFGHIJKLMNOPQRSTUVWXYZintegration/edit";

      // Step 1: 登録
      const createRes = await workerFetch("/api/stocks", "POST", {
        body: { url },
        headers: authHeaders(USER1),
      });
      expect(createRes.status).toBe(201);

      const created = await parseJsonResponse<StockResponse>(createRes);
      expect(created.status).toBe("pending");
      expect(created.provider).toBe("google_slides");
      expect(created.canonical_url).toBe(
        "https://docs.google.com/presentation/d/1ABCDEFGHIJKLMNOPQRSTUVWXYZintegration",
      );

      const stockId = created.id;

      // Step 2: Queue 処理
      mockGoogleSlides.mockResolvedValueOnce({
        title: "Google Integration Presentation",
        authorName: null,
        thumbnailUrl: null,
        embedUrl: "https://docs.google.com/presentation/d/1ABCDEFGHIJKLMNOPQRSTUVWXYZintegration/embed",
      });

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: url,
        canonicalUrl: created.canonical_url,
        provider: "google_slides",
      });
      await handleQueue(createMockBatch([msg]), env);
      expect(msg.ack).toHaveBeenCalled();

      // Step 3: 確認
      const detailRes = await workerFetch(`/api/stocks/${stockId}`, "GET", {
        headers: authHeaders(USER1),
      });
      const detail = await parseJsonResponse<StockResponse>(detailRes);
      expect(detail.status).toBe("ready");
      expect(detail.title).toBe("Google Integration Presentation");
      expect(detail.embed_url).toBe(
        "https://docs.google.com/presentation/d/1ABCDEFGHIJKLMNOPQRSTUVWXYZintegration/embed",
      );
    });
  });

  // --- 失敗シナリオ ---

  describe("失敗シナリオ: oEmbed 取得失敗", () => {
    it("oEmbed 取得失敗 → stock が failed 状態になる", async () => {
      const url = "https://speakerdeck.com/integration/deleted-slide";

      // Step 1: 登録
      const createRes = await workerFetch("/api/stocks", "POST", {
        body: { url },
        headers: authHeaders(USER1),
      });
      expect(createRes.status).toBe(201);

      const created = await parseJsonResponse<StockResponse>(createRes);
      const stockId = created.id;

      // Step 2: Queue 処理（恒久的エラー）
      mockSpeakerDeck.mockRejectedValueOnce(
        new PermanentError("SpeakerDeck oEmbed returned 404: slide not found"),
      );

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: url,
        canonicalUrl: created.canonical_url,
        provider: "speakerdeck",
      });
      await handleQueue(createMockBatch([msg]), env);
      expect(msg.ack).toHaveBeenCalled(); // PermanentError は ack

      // Step 3: stock が failed 状態であることを確認
      const detailRes = await workerFetch(`/api/stocks/${stockId}`, "GET", {
        headers: authHeaders(USER1),
      });
      const detail = await parseJsonResponse<StockResponse>(detailRes);
      expect(detail.status).toBe("failed");
      expect(detail.title).toBeNull();
      expect(detail.embed_url).toBeNull();
    });

    it("一時的エラー → stock は pending のまま（retry）", async () => {
      const url = "https://speakerdeck.com/integration/retry-slide";

      // Step 1: 登録
      const createRes = await workerFetch("/api/stocks", "POST", {
        body: { url },
        headers: authHeaders(USER1),
      });
      expect(createRes.status).toBe(201);

      const created = await parseJsonResponse<StockResponse>(createRes);
      const stockId = created.id;

      // Step 2: Queue 処理（一時的エラー）
      mockSpeakerDeck.mockRejectedValueOnce(new Error("Network timeout"));

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: url,
        canonicalUrl: created.canonical_url,
        provider: "speakerdeck",
      });
      await handleQueue(createMockBatch([msg]), env);
      expect(msg.retry).toHaveBeenCalled(); // 一時的エラーは retry

      // Step 3: stock は pending のまま
      const detailRes = await workerFetch(`/api/stocks/${stockId}`, "GET", {
        headers: authHeaders(USER1),
      });
      const detail = await parseJsonResponse<StockResponse>(detailRes);
      expect(detail.status).toBe("pending");
    });
  });

  // --- 複数ストック連続登録 ---

  describe("複数ストック連続登録フロー", () => {
    it("3 プロバイダのストックを連続登録 → 全て ready → 一覧に 3 件含まれる", async () => {
      const urls = [
        "https://speakerdeck.com/integration/multi-1",
        "https://www.docswell.com/s/integration/MULT02",
        "https://docs.google.com/presentation/d/1multi3ABCDEFGHIJKLMNOPQRSTUVWXYZtest/edit",
      ];

      const stockIds: string[] = [];

      // Step 1: 3 件登録
      for (const url of urls) {
        const res = await workerFetch("/api/stocks", "POST", {
          body: { url },
          headers: authHeaders(USER1),
        });
        expect(res.status).toBe(201);
        const body = await parseJsonResponse<StockResponse>(res);
        stockIds.push(body.id);
      }

      // Step 2: Queue 処理
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
        embedUrl: "https://docs.google.com/presentation/d/1multi3ABCDEFGHIJKLMNOPQRSTUVWXYZtest/embed",
      });

      const messages = [
        createMockMessage({
          schemaVersion: 1,
          stockId: stockIds[0],
          originalUrl: urls[0],
          canonicalUrl: urls[0],
          provider: "speakerdeck",
        }),
        createMockMessage({
          schemaVersion: 1,
          stockId: stockIds[1],
          originalUrl: urls[1],
          canonicalUrl: urls[1],
          provider: "docswell",
        }),
        createMockMessage({
          schemaVersion: 1,
          stockId: stockIds[2],
          originalUrl: urls[2],
          canonicalUrl: "https://docs.google.com/presentation/d/1multi3ABCDEFGHIJKLMNOPQRSTUVWXYZtest",
          provider: "google_slides",
        }),
      ];

      await handleQueue(createMockBatch(messages), env);

      for (const msg of messages) {
        expect(msg.ack).toHaveBeenCalled();
      }

      // Step 3: 一覧取得で 3 件が ready であることを確認
      // （シードデータの 3 件 + 新規 3 件 = 合計 6 件）
      const listRes = await workerFetch("/api/stocks", "GET", {
        headers: authHeaders(USER1),
      });
      const list = await parseJsonResponse<StockListResponse>(listRes);

      for (const stockId of stockIds) {
        const found = list.items.find((item) => item.id === stockId);
        expect(found).toBeDefined();
        expect(found!.status).toBe("ready");
      }
    });
  });
});
