/**
 * oEmbed フェッチサービス
 * oembed-spec.md セクション 2-4
 */

const MAX_OEMBED_RESPONSE_SIZE = 100 * 1024; // 100 KB
const MAX_HTML_RESPONSE_SIZE = 500 * 1024; // 500 KB
const FETCH_TIMEOUT = 10_000; // 10秒

export interface StockMetadata {
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  embedUrl: string | null;
}

/** リトライ不要な恒久的エラー */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

// --- 共通ヘルパー ---

async function fetchWithTimeout(
  url: string,
  maxSize: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    // レスポンスサイズチェック
    const contentLength = res.headers.get("Content-Length");
    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new PermanentError(
        `Response too large: ${contentLength} bytes (max ${maxSize})`,
      );
    }

    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof PermanentError) throw e;
    throw e; // AbortError 等は一時的エラーとしてリトライ対象
  }
}

// --- SpeakerDeck ---

/**
 * SpeakerDeck oEmbed メタデータ取得
 * oembed-spec.md セクション 2
 */
export async function fetchSpeakerDeckMetadata(
  canonicalUrl: string,
): Promise<StockMetadata> {
  const oembedUrl = `https://speakerdeck.com/oembed.json?url=${encodeURIComponent(canonicalUrl)}`;
  const res = await fetchWithTimeout(oembedUrl, MAX_OEMBED_RESPONSE_SIZE);

  if (res.status === 404 || res.status === 403) {
    throw new PermanentError(
      `SpeakerDeck oEmbed returned ${res.status}: slide not found or private`,
    );
  }
  if (!res.ok) {
    throw new Error(`SpeakerDeck oEmbed returned ${res.status}`);
  }

  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
    html?: string;
  };

  // embed_url を html の iframe src から抽出
  let embedUrl: string | null = null;
  if (data.html) {
    const match = data.html.match(
      /src="(https:\/\/speakerdeck\.com\/player\/[a-f0-9]+)"/,
    );
    embedUrl = match ? match[1] : null;
  }

  if (!embedUrl) {
    throw new PermanentError("Failed to extract embed URL from oEmbed html");
  }

  return {
    title: data.title ?? null,
    authorName: data.author_name ?? null,
    thumbnailUrl: null,
    embedUrl,
  };
}

// --- Docswell ---

/**
 * Docswell oEmbed メタデータ取得
 * oembed-spec.md セクション 3
 */
export async function fetchDocswellMetadata(
  canonicalUrl: string,
): Promise<StockMetadata> {
  const oembedUrl = `https://www.docswell.com/service/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
  const res = await fetchWithTimeout(oembedUrl, MAX_OEMBED_RESPONSE_SIZE);

  if (res.status === 404 || res.status === 403) {
    throw new PermanentError(
      `Docswell oEmbed returned ${res.status}: slide not found or private`,
    );
  }
  if (!res.ok) {
    throw new Error(`Docswell oEmbed returned ${res.status}`);
  }

  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
    url?: string;
  };

  const rawEmbedUrl = data.url ?? null;
  if (!rawEmbedUrl) {
    throw new PermanentError("Docswell oEmbed response missing url field");
  }

  // embed URL のドメインバリデーション
  let embedUrl: string | null = rawEmbedUrl;
  try {
    const parsed = new URL(rawEmbedUrl);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith("docswell.com")
    ) {
      embedUrl = null;
    }
  } catch {
    embedUrl = null;
  }

  if (!embedUrl) {
    throw new PermanentError(
      `Docswell oEmbed returned untrusted embed URL: ${rawEmbedUrl}`,
    );
  }

  return {
    title: data.title ?? null,
    authorName: data.author_name ?? null,
    thumbnailUrl: null,
    embedUrl,
  };
}

// --- Google Slides ---

/**
 * Google Slides メタデータ構築
 * oembed-spec.md セクション 4
 */
export async function fetchGoogleSlidesMetadata(
  canonicalUrl: string,
): Promise<StockMetadata> {
  // embed URL は機械的に構築（常に成功）
  const embedUrl = `${canonicalUrl}/embed`;

  // タイトル取得を試行（失敗しても status=ready）
  let title: string | null = null;
  try {
    const res = await fetchWithTimeout(canonicalUrl, MAX_HTML_RESPONSE_SIZE);
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/<title>(.+?)<\/title>/);
      if (match) {
        title =
          match[1].replace(/ - Google (スライド|Slides)$/, "").trim() || null;
      }
    }
  } catch {
    // タイトル取得失敗は無視（embed URL があれば ready）
  }

  return {
    title,
    authorName: null,
    thumbnailUrl: null,
    embedUrl,
  };
}
