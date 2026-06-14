import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSpeakerDeckMetadata,
  fetchDocswellMetadata,
  fetchGoogleSlidesMetadata,
  fetchWithRetry,
  PermanentError,
  UpstreamFailureError,
  UpstreamTimeoutError,
  type StockMetadata,
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

function newSignal(): AbortSignal {
  return AbortSignal.timeout(5_000);
}

function makeMetadata(overrides: Partial<StockMetadata> = {}): StockMetadata {
  return {
    title: "ok",
    authorName: null,
    thumbnailUrl: null,
    embedUrl: "https://example.com/embed",
    ...overrides,
  };
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

    const result = await fetchSpeakerDeckMetadata(CANONICAL, newSignal());
    expect(result.title).toBe("Atom");
    expect(result.authorName).toBe("John Nunemaker");
    expect(result.embedUrl).toBe(
      "https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3",
    );
    expect(result.thumbnailUrl).toBeNull();
  });

  it("404 → PermanentError", async () => {
    mockFetch(new Response("Not Found", { status: 404 }));
    await expect(
      fetchSpeakerDeckMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("403 → PermanentError", async () => {
    mockFetch(new Response("Forbidden", { status: 403 }));
    await expect(
      fetchSpeakerDeckMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("5xx → 一時的エラー（リトライ対象、PermanentError ではない）", async () => {
    mockFetch(new Response("Server Error", { status: 500 }));
    const promise = fetchSpeakerDeckMetadata(CANONICAL, newSignal());
    await expect(promise).rejects.toThrow();
    await expect(promise).rejects.not.toThrow(PermanentError);
  });

  it("html に iframe src が無い → PermanentError", async () => {
    mockFetch(
      new Response(
        JSON.stringify({ type: "rich", title: "No Embed", html: "<div></div>" }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(
      fetchSpeakerDeckMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("fetch に signal が渡される", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "rich",
          title: "x",
          html: '<iframe src="https://speakerdeck.com/player/abc"></iframe>',
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const signal = newSignal();
    await fetchSpeakerDeckMetadata(CANONICAL, signal);

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(signal);
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

    const result = await fetchDocswellMetadata(CANONICAL, newSignal());
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
    await expect(
      fetchDocswellMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("403 → PermanentError", async () => {
    mockFetch(new Response("Forbidden", { status: 403 }));
    await expect(
      fetchDocswellMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("url フィールドが無い → PermanentError", async () => {
    mockFetch(
      new Response(
        JSON.stringify({ type: "rich", title: "No URL" }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(
      fetchDocswellMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });
});

// ============================================================
// Google Slides — hard failure（ADR-009 §4-5）
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

    const result = await fetchGoogleSlidesMetadata(CANONICAL, newSignal());
    expect(result.embedUrl).toBe(`${CANONICAL}/embed`);
    expect(result.title).toBe("My Presentation");
    expect(result.authorName).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
  });

  it("英語タイトルの Google Slides サフィックスも除去する", async () => {
    mockFetch(
      new Response(
        "<html><head><title>My Deck - Google Slides</title></head></html>",
        { status: 200 },
      ),
    );

    const result = await fetchGoogleSlidesMetadata(CANONICAL, newSignal());
    expect(result.title).toBe("My Deck");
  });

  it("G1: 200 + サフィックス除去後 title が空 → PermanentError", async () => {
    mockFetch(
      new Response(
        "<html><head><title> - Google スライド</title></head></html>",
        { status: 200 },
      ),
    );
    await expect(
      fetchGoogleSlidesMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("G2: 200 + <title> タグなし → PermanentError", async () => {
    mockFetch(
      new Response("<html><head></head><body></body></html>", { status: 200 }),
    );
    await expect(
      fetchGoogleSlidesMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("G3: 404 → PermanentError", async () => {
    mockFetch(new Response("Not Found", { status: 404 }));
    await expect(
      fetchGoogleSlidesMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("G4: 403 → PermanentError", async () => {
    mockFetch(new Response("Forbidden", { status: 403 }));
    await expect(
      fetchGoogleSlidesMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("G4b: 401 → PermanentError", async () => {
    mockFetch(new Response("Unauthorized", { status: 401 }));
    await expect(
      fetchGoogleSlidesMetadata(CANONICAL, newSignal()),
    ).rejects.toThrow(PermanentError);
  });

  it("G5: 500 → 一般 Error（PermanentError ではない、リトライ対象）", async () => {
    mockFetch(new Response("Server Error", { status: 500 }));
    const promise = fetchGoogleSlidesMetadata(CANONICAL, newSignal());
    await expect(promise).rejects.toThrow();
    await expect(promise).rejects.not.toThrow(PermanentError);
  });

  it("G6: Accept-Language: ja ヘッダが付与される", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        "<html><head><title>X - Google スライド</title></head></html>",
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchGoogleSlidesMetadata(CANONICAL, newSignal());

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Accept-Language"]).toBe("ja");
    expect(init.redirect).toBe("follow");
  });
});

// ============================================================
// fetchWithRetry（spec §6 / ADR-009 §4-2）
// ============================================================
describe("fetchWithRetry", () => {
  it("R1: 1 回目で成功 → fetcher は 1 回だけ呼ばれる", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeMetadata({ title: "first" }));
    const result = await fetchWithRetry(fetcher, 5_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.title).toBe("first");
  });

  it("R2: 1 回目失敗 → 2 回目成功（500ms バックオフ後）", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient 5xx"))
      .mockResolvedValue(makeMetadata({ title: "second-try" }));
    const result = await fetchWithRetry(fetcher, 5_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.title).toBe("second-try");
  });

  it("R3: 3 回連続で一時的エラー → UpstreamFailureError、cause に最後の Error", async () => {
    const lastErr = new Error("final 5xx");
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("first 5xx"))
      .mockRejectedValueOnce(new Error("second 5xx"))
      .mockRejectedValue(lastErr);

    let thrown: unknown;
    try {
      await fetchWithRetry(fetcher, 5_000);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UpstreamFailureError);
    expect((thrown as UpstreamFailureError).cause).toBe(lastErr);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("R4: PermanentError は即 throw（リトライしない）", async () => {
    const fetcher = vi.fn().mockRejectedValue(new PermanentError("404"));
    await expect(fetchWithRetry(fetcher, 5_000)).rejects.toThrow(
      PermanentError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("R5: abort 由来の Error（per-attempt timeout）はリトライ対象", async () => {
    const abortErr = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValue(makeMetadata({ title: "after-abort" }));

    const result = await fetchWithRetry(fetcher, 5_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.title).toBe("after-abort");
  });

  it("R6: 合計予算切れ → UpstreamTimeoutError", async () => {
    // fetcher は signal を尊重して abort 時に reject する
    const fetcher = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      await new Promise((_resolve, reject) => {
        if (signal.aborted) {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
      throw new Error("unreachable");
    });

    await expect(fetchWithRetry(fetcher, 50)).rejects.toThrow(
      UpstreamTimeoutError,
    );
  });

  it("R7: 各 attempt で渡される signal は AbortSignal で abortable", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      signals.push(signal);
      throw new Error("retry me");
    });

    await expect(fetchWithRetry(fetcher, 5_000)).rejects.toThrow(
      UpstreamFailureError,
    );
    expect(signals).toHaveLength(3);
    for (const s of signals) {
      expect(s).toBeInstanceOf(AbortSignal);
    }
  });
});
