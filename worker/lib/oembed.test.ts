import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSpeakerDeckMetadata,
  fetchDocswellMetadata,
  fetchGoogleSlidesMetadata,
  PermanentError,
} from "./oembed";

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(response: Response) {
  globalThis.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
}

function mockFetchError(error: Error) {
  globalThis.fetch = vi.fn().mockRejectedValue(error) as unknown as typeof fetch;
}

// ============================================================
// SpeakerDeck
// ============================================================
describe("fetchSpeakerDeckMetadata", () => {
  const CANONICAL = "https://speakerdeck.com/jnunemaker/atom";

  it("oEmbed レスポンスからメタデータを抽出する", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          type: "rich",
          title: "Atom",
          author_name: "John Nunemaker",
          html: '<iframe src="https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3" width="710" height="399"></iframe>',
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchSpeakerDeckMetadata(CANONICAL);
    expect(result.title).toBe("Atom");
    expect(result.authorName).toBe("John Nunemaker");
    expect(result.embedUrl).toBe(
      "https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3",
    );
    expect(result.thumbnailUrl).toBeNull();
  });

  it("404 → PermanentError", async () => {
    mockFetch(new Response("Not Found", { status: 404 }));
    await expect(fetchSpeakerDeckMetadata(CANONICAL)).rejects.toThrow(
      PermanentError,
    );
  });

  it("5xx → 一時的エラー（リトライ対象）", async () => {
    mockFetch(new Response("Server Error", { status: 500 }));
    await expect(fetchSpeakerDeckMetadata(CANONICAL)).rejects.toThrow();
    await expect(fetchSpeakerDeckMetadata(CANONICAL)).rejects.not.toThrow(
      PermanentError,
    );
  });

  it("html に iframe src が無い → PermanentError", async () => {
    mockFetch(
      new Response(
        JSON.stringify({ type: "rich", title: "No Embed", html: "<div></div>" }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(fetchSpeakerDeckMetadata(CANONICAL)).rejects.toThrow(
      PermanentError,
    );
  });
});

// ============================================================
// Docswell
// ============================================================
describe("fetchDocswellMetadata", () => {
  const CANONICAL = "https://www.docswell.com/s/takai/59VDWM";

  it("oEmbed レスポンスからメタデータを抽出する", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          type: "rich",
          title: "Windows Server 2025 新機能おさらい",
          author_name: "Kazuki Takai",
          url: "https://www.docswell.com/slide/59VDWM/embed",
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchDocswellMetadata(CANONICAL);
    expect(result.title).toBe("Windows Server 2025 新機能おさらい");
    expect(result.authorName).toBe("Kazuki Takai");
    expect(result.embedUrl).toBe(
      "https://www.docswell.com/slide/59VDWM/embed",
    );
    expect(result.thumbnailUrl).toBeNull();
  });

  it("404 → PermanentError", async () => {
    mockFetch(
      new Response(
        JSON.stringify({ status: 404, errors: "Slide not found or private" }),
        { status: 404 },
      ),
    );
    await expect(fetchDocswellMetadata(CANONICAL)).rejects.toThrow(
      PermanentError,
    );
  });

  it("url フィールドが無い → PermanentError", async () => {
    mockFetch(
      new Response(
        JSON.stringify({ type: "rich", title: "No URL" }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(fetchDocswellMetadata(CANONICAL)).rejects.toThrow(
      PermanentError,
    );
  });
});

// ============================================================
// Google Slides
// ============================================================
describe("fetchGoogleSlidesMetadata", () => {
  const CANONICAL =
    "https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc";

  it("embed URL を構築し、タイトルを HTML から取得する", async () => {
    mockFetch(
      new Response(
        "<html><head><title>My Presentation - Google スライド</title></head></html>",
        { status: 200 },
      ),
    );

    const result = await fetchGoogleSlidesMetadata(CANONICAL);
    expect(result.embedUrl).toBe(`${CANONICAL}/embed`);
    expect(result.title).toBe("My Presentation");
    expect(result.authorName).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
  });

  it("タイトル取得失敗でも embed URL は返す（常に ready）", async () => {
    mockFetch(new Response("Forbidden", { status: 403 }));

    const result = await fetchGoogleSlidesMetadata(CANONICAL);
    expect(result.embedUrl).toBe(`${CANONICAL}/embed`);
    expect(result.title).toBeNull();
  });

  it("fetch 例外でも embed URL は返す", async () => {
    mockFetchError(new Error("Network error"));

    const result = await fetchGoogleSlidesMetadata(CANONICAL);
    expect(result.embedUrl).toBe(`${CANONICAL}/embed`);
    expect(result.title).toBeNull();
  });

  it("英語タイトルの Google Slides サフィックスも除去する", async () => {
    mockFetch(
      new Response(
        "<html><head><title>My Deck - Google Slides</title></head></html>",
        { status: 200 },
      ),
    );

    const result = await fetchGoogleSlidesMetadata(CANONICAL);
    expect(result.title).toBe("My Deck");
  });
});
