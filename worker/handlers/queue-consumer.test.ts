/**
 * T-524: Queue Consumer ユニットテスト
 *
 * 仕様: docs/oembed-spec.md セクション 6, 7
 *
 * テスト対象:
 * - handleQueue: メッセージ処理、ack/retry 判定、status 更新
 * - 成功時: stock を ready に更新
 * - PermanentError: ack + stock を failed に更新
 * - 一時的エラー: retry
 * - 不明な schemaVersion: ack + 警告ログ
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrationsAndSeed, resetSeedData } from "../../test/helpers";
import { handleQueue, type OEmbedQueueMessage } from "./queue-consumer";
import { PermanentError } from "../lib/oembed";

// --- テスト用ヘルパー ---

/** stock を pending 状態で DB に挿入する */
async function insertPendingStock(
  stockId: string,
  userId: string = "test-user-1",
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO stocks (id, user_id, original_url, canonical_url, provider, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'speakerdeck', 'pending', ?, ?)`,
  )
    .bind(
      stockId,
      userId,
      "https://speakerdeck.com/user/slide",
      "https://speakerdeck.com/user/slide",
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run();
}

/** stock の status を取得する */
async function getStockStatus(
  stockId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT status FROM stocks WHERE id = ?",
  )
    .bind(stockId)
    .first<{ status: string }>();
  return row?.status ?? null;
}

/** stock の全カラムを取得する */
async function getStock(
  stockId: string,
): Promise<Record<string, unknown> | null> {
  return env.DB.prepare("SELECT * FROM stocks WHERE id = ?")
    .bind(stockId)
    .first();
}

/** mock Message オブジェクトを作成 */
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

/** mock MessageBatch を作成 */
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

// oEmbed モジュールをモック
vi.mock("../lib/oembed", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/oembed")>();
  return {
    ...original,
    fetchSpeakerDeckMetadata: vi.fn(),
    fetchDocswellMetadata: vi.fn(),
    fetchGoogleSlidesMetadata: vi.fn(),
  };
});

// モック化された関数を取得
import {
  fetchSpeakerDeckMetadata,
  fetchDocswellMetadata,
  fetchGoogleSlidesMetadata,
} from "../lib/oembed";

const mockSpeakerDeck = vi.mocked(fetchSpeakerDeckMetadata);
const mockDocswell = vi.mocked(fetchDocswellMetadata);
const mockGoogleSlides = vi.mocked(fetchGoogleSlidesMetadata);

// ============================================================
// handleQueue
// ============================================================
describe("handleQueue", () => {
  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
    vi.clearAllMocks();
  });

  // --- 成功時: stock を ready に更新 ---

  describe("成功処理", () => {
    it("SpeakerDeck: メタデータ取得成功 → stock が ready に更新される", async () => {
      const stockId = "queue-test-stock-sd";
      await insertPendingStock(stockId);

      mockSpeakerDeck.mockResolvedValueOnce({
        title: "Test Slide",
        authorName: "Author",
        thumbnailUrl: null,
        embedUrl: "https://speakerdeck.com/player/abc123",
      });

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: "https://speakerdeck.com/user/slide",
        canonicalUrl: "https://speakerdeck.com/user/slide",
        provider: "speakerdeck",
      });

      await handleQueue(createMockBatch([msg]), env);

      expect(msg.ack).toHaveBeenCalled();
      expect(msg.retry).not.toHaveBeenCalled();

      const stock = await getStock(stockId);
      expect(stock!.status).toBe("ready");
      expect(stock!.title).toBe("Test Slide");
      expect(stock!.author_name).toBe("Author");
      expect(stock!.embed_url).toBe(
        "https://speakerdeck.com/player/abc123",
      );
    });

    it("Docswell: メタデータ取得成功 → stock が ready に更新される", async () => {
      const stockId = "queue-test-stock-dw";
      await insertPendingStock(stockId);

      mockDocswell.mockResolvedValueOnce({
        title: "Docswell Slide",
        authorName: "DW Author",
        thumbnailUrl: null,
        embedUrl: "https://www.docswell.com/slide/ABC123/embed",
      });

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: "https://www.docswell.com/s/user/ABC123",
        canonicalUrl: "https://www.docswell.com/s/user/ABC123",
        provider: "docswell",
      });

      await handleQueue(createMockBatch([msg]), env);

      expect(msg.ack).toHaveBeenCalled();
      const stock = await getStock(stockId);
      expect(stock!.status).toBe("ready");
      expect(stock!.title).toBe("Docswell Slide");
      expect(stock!.embed_url).toBe(
        "https://www.docswell.com/slide/ABC123/embed",
      );
    });

    it("Google Slides: メタデータ取得成功 → stock が ready に更新される", async () => {
      const stockId = "queue-test-stock-gs";
      await insertPendingStock(stockId);

      mockGoogleSlides.mockResolvedValueOnce({
        title: "Google Presentation",
        authorName: null,
        thumbnailUrl: null,
        embedUrl:
          "https://docs.google.com/presentation/d/1abc123/embed",
      });

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl:
          "https://docs.google.com/presentation/d/1abc123/edit",
        canonicalUrl:
          "https://docs.google.com/presentation/d/1abc123",
        provider: "google_slides",
      });

      await handleQueue(createMockBatch([msg]), env);

      expect(msg.ack).toHaveBeenCalled();
      const stock = await getStock(stockId);
      expect(stock!.status).toBe("ready");
      expect(stock!.title).toBe("Google Presentation");
    });
  });

  // --- PermanentError: ack + stock を failed に更新 ---

  describe("恒久的エラー（PermanentError）", () => {
    it("PermanentError → ack + stock が failed に更新される", async () => {
      const stockId = "queue-test-permanent-err";
      await insertPendingStock(stockId);

      mockSpeakerDeck.mockRejectedValueOnce(
        new PermanentError("Slide not found (404)"),
      );

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: "https://speakerdeck.com/user/deleted",
        canonicalUrl: "https://speakerdeck.com/user/deleted",
        provider: "speakerdeck",
      });

      await handleQueue(createMockBatch([msg]), env);

      expect(msg.ack).toHaveBeenCalled();
      expect(msg.retry).not.toHaveBeenCalled();

      const status = await getStockStatus(stockId);
      expect(status).toBe("failed");
    });
  });

  // --- 一時的エラー: retry ---

  describe("一時的エラー（リトライ）", () => {
    it("一時的エラー → retry が呼ばれる（stock は pending のまま）", async () => {
      const stockId = "queue-test-transient-err";
      await insertPendingStock(stockId);

      mockSpeakerDeck.mockRejectedValueOnce(
        new Error("Server Error 500"),
      );

      const msg = createMockMessage({
        schemaVersion: 1,
        stockId,
        originalUrl: "https://speakerdeck.com/user/slide",
        canonicalUrl: "https://speakerdeck.com/user/slide",
        provider: "speakerdeck",
      });

      await handleQueue(createMockBatch([msg]), env);

      expect(msg.retry).toHaveBeenCalled();
      expect(msg.ack).not.toHaveBeenCalled();

      const status = await getStockStatus(stockId);
      expect(status).toBe("pending");
    });
  });

  // --- 不明な schemaVersion ---

  describe("スキーマバージョンチェック", () => {
    it("不明な schemaVersion → ack（無視）", async () => {
      const msg = createMockMessage({
        schemaVersion: 99 as unknown as 1,
        stockId: "any-stock-id",
        originalUrl: "https://example.com",
        canonicalUrl: "https://example.com",
        provider: "speakerdeck",
      });

      await handleQueue(createMockBatch([msg]), env);

      expect(msg.ack).toHaveBeenCalled();
      expect(msg.retry).not.toHaveBeenCalled();
    });
  });

  // --- 複数メッセージのバッチ処理 ---

  describe("バッチ処理", () => {
    it("複数メッセージを順番に処理する", async () => {
      const stockId1 = "queue-batch-stock-1";
      const stockId2 = "queue-batch-stock-2";
      await insertPendingStock(stockId1);
      await insertPendingStock(stockId2);

      mockSpeakerDeck
        .mockResolvedValueOnce({
          title: "Slide 1",
          authorName: "Author 1",
          thumbnailUrl: null,
          embedUrl: "https://speakerdeck.com/player/111",
        })
        .mockResolvedValueOnce({
          title: "Slide 2",
          authorName: "Author 2",
          thumbnailUrl: null,
          embedUrl: "https://speakerdeck.com/player/222",
        });

      const msg1 = createMockMessage({
        schemaVersion: 1,
        stockId: stockId1,
        originalUrl: "https://speakerdeck.com/user/slide1",
        canonicalUrl: "https://speakerdeck.com/user/slide1",
        provider: "speakerdeck",
      });
      const msg2 = createMockMessage({
        schemaVersion: 1,
        stockId: stockId2,
        originalUrl: "https://speakerdeck.com/user/slide2",
        canonicalUrl: "https://speakerdeck.com/user/slide2",
        provider: "speakerdeck",
      });

      await handleQueue(createMockBatch([msg1, msg2]), env);

      expect(msg1.ack).toHaveBeenCalled();
      expect(msg2.ack).toHaveBeenCalled();

      const status1 = await getStockStatus(stockId1);
      const status2 = await getStockStatus(stockId2);
      expect(status1).toBe("ready");
      expect(status2).toBe("ready");
    });

    it("1件目が失敗しても2件目は処理される", async () => {
      const stockId1 = "queue-batch-fail-1";
      const stockId2 = "queue-batch-ok-2";
      await insertPendingStock(stockId1);
      await insertPendingStock(stockId2);

      mockSpeakerDeck
        .mockRejectedValueOnce(new PermanentError("Not found"))
        .mockResolvedValueOnce({
          title: "Slide OK",
          authorName: "Author",
          thumbnailUrl: null,
          embedUrl: "https://speakerdeck.com/player/ok",
        });

      const msg1 = createMockMessage({
        schemaVersion: 1,
        stockId: stockId1,
        originalUrl: "https://speakerdeck.com/user/deleted",
        canonicalUrl: "https://speakerdeck.com/user/deleted",
        provider: "speakerdeck",
      });
      const msg2 = createMockMessage({
        schemaVersion: 1,
        stockId: stockId2,
        originalUrl: "https://speakerdeck.com/user/ok",
        canonicalUrl: "https://speakerdeck.com/user/ok",
        provider: "speakerdeck",
      });

      await handleQueue(createMockBatch([msg1, msg2]), env);

      expect(msg1.ack).toHaveBeenCalled(); // PermanentError → ack
      expect(msg2.ack).toHaveBeenCalled(); // 成功 → ack

      const status1 = await getStockStatus(stockId1);
      const status2 = await getStockStatus(stockId2);
      expect(status1).toBe("failed");
      expect(status2).toBe("ready");
    });
  });
});
