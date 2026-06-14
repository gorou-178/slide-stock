/**
 * oEmbed フェッチサービス
 * oembed-spec.md §2-§7
 */

const MAX_OEMBED_RESPONSE_SIZE = 100 * 1024; // 100 KB
const MAX_HTML_RESPONSE_SIZE = 500 * 1024; // 500 KB

const PER_ATTEMPT_TIMEOUT_MS = 3_000;
const TOTAL_BUDGET_MS = 12_000;
const BACKOFFS_MS = [0, 500, 1500];

export interface StockMetadata {
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  embedUrl: string | null;
}

/**
 * リトライ不要な恒久的エラーの基底クラス。
 * 具体的なケース（404 / 401・403 / レスポンス形式不正）は下のサブクラスで区別する。
 * handler は instanceof でサブクラスを判別し UPSTREAM_NOT_FOUND / UPSTREAM_FORBIDDEN /
 * UPSTREAM_INVALID_RESPONSE にマッピングする（stock-api-spec.md §2.3）。
 */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

/** プロバイダ側にスライドが存在しない（HTTP 404 → 400 UPSTREAM_NOT_FOUND） */
export class UpstreamNotFoundError extends PermanentError {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamNotFoundError";
  }
}

/** プロバイダ側からアクセス拒否（HTTP 401 / 403 → 400 UPSTREAM_FORBIDDEN） */
export class UpstreamForbiddenError extends PermanentError {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamForbiddenError";
  }
}

/** レスポンス形式が想定外（200 だが必須フィールド欠落 等 → 502 UPSTREAM_INVALID_RESPONSE） */
export class UpstreamInvalidResponseError extends PermanentError {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamInvalidResponseError";
  }
}

/** リトライ上限到達（5xx / ネットワーク失敗等の一時的エラーが続いた） */
export class UpstreamFailureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpstreamFailureError";
  }
}

/** 合計タイムアウト予算を超過 */
export class UpstreamTimeoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpstreamTimeoutError";
  }
}

// --- 共通ヘルパー ---

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithSizeLimit(
  url: string,
  maxSize: number,
  signal: AbortSignal,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, { ...init, signal });

  const contentLength = res.headers.get("Content-Length");
  if (contentLength && parseInt(contentLength) > maxSize) {
    throw new UpstreamInvalidResponseError(
      `Response too large: ${contentLength} bytes (max ${maxSize})`,
    );
  }

  return res;
}

// --- SpeakerDeck ---

/**
 * SpeakerDeck oEmbed メタデータ取得
 * oembed-spec.md §2
 */
export async function fetchSpeakerDeckMetadata(
  canonicalUrl: string,
  signal: AbortSignal,
): Promise<StockMetadata> {
  const oembedUrl = `https://speakerdeck.com/oembed.json?url=${encodeURIComponent(canonicalUrl)}`;
  const res = await fetchWithSizeLimit(oembedUrl, MAX_OEMBED_RESPONSE_SIZE, signal);

  if (res.status === 404) {
    throw new UpstreamNotFoundError(
      `SpeakerDeck oEmbed returned 404: slide not found or private`,
    );
  }
  if (res.status === 403) {
    throw new UpstreamForbiddenError(
      `SpeakerDeck oEmbed returned 403: access denied`,
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

  let embedUrl: string | null = null;
  if (data.html) {
    const match = data.html.match(
      /src="(https:\/\/speakerdeck\.com\/player\/[a-f0-9]+)"/,
    );
    embedUrl = match ? match[1] : null;
  }

  if (!embedUrl) {
    throw new UpstreamInvalidResponseError(
      "Failed to extract embed URL from oEmbed html",
    );
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
 * oembed-spec.md §3
 */
export async function fetchDocswellMetadata(
  canonicalUrl: string,
  signal: AbortSignal,
): Promise<StockMetadata> {
  const oembedUrl = `https://www.docswell.com/service/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
  const res = await fetchWithSizeLimit(oembedUrl, MAX_OEMBED_RESPONSE_SIZE, signal);

  if (res.status === 404) {
    throw new UpstreamNotFoundError(
      `Docswell oEmbed returned 404: slide not found or private`,
    );
  }
  if (res.status === 403) {
    throw new UpstreamForbiddenError(
      `Docswell oEmbed returned 403: access denied`,
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
    throw new UpstreamInvalidResponseError(
      "Docswell oEmbed response missing url field",
    );
  }

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
    throw new UpstreamInvalidResponseError(
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
 * Google Slides メタデータ取得（hard failure / ADR-009 §4-5）
 * oembed-spec.md §4
 *
 * title 取得が成功した場合のみ stock 作成対象とする。失敗時は呼び出し元の
 * リトライ／エラー処理に委ねるため、PermanentError か一般 Error を throw する。
 * embed URL は canonical URL から機械的に構築する（外部リクエスト不要）。
 */
export async function fetchGoogleSlidesMetadata(
  canonicalUrl: string,
  signal: AbortSignal,
): Promise<StockMetadata> {
  const embedUrl = `${canonicalUrl}/embed`;

  const res = await fetchWithSizeLimit(canonicalUrl, MAX_HTML_RESPONSE_SIZE, signal, {
    headers: { "Accept-Language": "ja" },
    redirect: "follow",
  });

  if (res.status === 401 || res.status === 403) {
    throw new UpstreamForbiddenError(
      `Google Slides returned ${res.status}: slide private or access denied`,
    );
  }
  if (res.status === 404) {
    throw new UpstreamNotFoundError(
      "Google Slides returned 404: presentation not found",
    );
  }
  if (!res.ok) {
    throw new Error(`Google Slides returned ${res.status}`);
  }

  const html = await res.text();
  const match = html.match(/<title>(.+?)<\/title>/);
  if (!match) {
    throw new UpstreamInvalidResponseError(
      "Google Slides response missing <title> tag",
    );
  }

  const title = match[1]
    .replace(/ - Google (スライド|Slides)$/, "")
    .trim();

  if (!title) {
    throw new UpstreamInvalidResponseError(
      "Google Slides title is empty after suffix strip",
    );
  }

  return {
    title,
    authorName: null,
    thumbnailUrl: null,
    embedUrl,
  };
}

// --- 同期内リトライ（指数バックオフ） ---

/**
 * 同期内リトライ実行
 * oembed-spec.md §6
 *
 * 試行 3 回（バックオフ 0ms → 500ms → 1500ms）、1 試行 3 秒タイムアウト、
 * 合計予算 12 秒。PermanentError は即 throw（リトライしない）、他の Error は
 * リトライ対象。全試行失敗で UpstreamFailureError、予算超過で UpstreamTimeoutError。
 */
export async function fetchWithRetry(
  fetcher: (signal: AbortSignal) => Promise<StockMetadata>,
  totalBudgetMs: number = TOTAL_BUDGET_MS,
): Promise<StockMetadata> {
  const totalDeadline = AbortSignal.timeout(totalBudgetMs);

  let lastError: unknown;
  for (let attempt = 0; attempt < BACKOFFS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(BACKOFFS_MS[attempt]);
    }
    if (totalDeadline.aborted) {
      throw new UpstreamTimeoutError("total budget exhausted", {
        cause: lastError,
      });
    }
    try {
      const perAttemptSignal = AbortSignal.any([
        AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
        totalDeadline,
      ]);
      return await fetcher(perAttemptSignal);
    } catch (err) {
      if (err instanceof PermanentError) throw err;
      if (totalDeadline.aborted) {
        throw new UpstreamTimeoutError("total budget exhausted", { cause: err });
      }
      lastError = err;
    }
  }
  throw new UpstreamFailureError("max retries exhausted", { cause: lastError });
}
