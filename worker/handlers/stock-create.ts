/**
 * POST /api/stocks ハンドラー
 * stock-api-spec.md §3 / oembed-spec.md §5 / ADR-009 §4-2
 */

import { uuidv7 } from "uuidv7";
import type { AuthContext } from "../middleware/test-auth-bypass";
import {
  detectProvider,
  ProviderError,
  type ProviderErrorCode,
} from "../lib/provider";
import {
  fetchSpeakerDeckMetadata,
  fetchDocswellMetadata,
  fetchGoogleSlidesMetadata,
  fetchWithRetry,
  PermanentError,
  UpstreamNotFoundError,
  UpstreamForbiddenError,
  UpstreamInvalidResponseError,
  UpstreamFailureError,
  UpstreamTimeoutError,
  type StockMetadata,
} from "../lib/oembed";
import { jsonError } from "../lib/http-response";
import { type StockEnv } from "./stocks";

/** ProviderErrorCode → HTTP エラーレスポンス（stock-api-spec.md §3.3） */
const PROVIDER_ERROR_MAP: Record<
  ProviderErrorCode,
  { status: number; code: string }
> = {
  INVALID_URL: { status: 400, code: "INVALID_URL" },
  UNSUPPORTED_SCHEME: { status: 400, code: "INVALID_URL" },
  UNSUPPORTED_PROVIDER: { status: 400, code: "UNSUPPORTED_PROVIDER" },
  INVALID_FORMAT: { status: 400, code: "INVALID_FORMAT" },
  UNSUPPORTED_URL_TYPE: { status: 400, code: "UNSUPPORTED_URL_TYPE" },
};

export async function handleCreateStock(
  request: Request,
  env: StockEnv,
  auth: AuthContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      "リクエストボディが不正です",
      "INVALID_REQUEST",
      400,
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("url" in body)
  ) {
    return jsonError("url は必須です", "INVALID_REQUEST", 400);
  }

  const url = (body as { url: unknown }).url;
  if (typeof url !== "string" || url.trim() === "") {
    return jsonError(
      "入力された文字列は有効な URL ではありません",
      "INVALID_URL",
      400,
    );
  }

  let provider: string;
  let canonicalUrl: string;
  try {
    const result = detectProvider(url);
    provider = result.provider;
    canonicalUrl = result.canonicalUrl;
  } catch (error) {
    if (error instanceof ProviderError) {
      const mapping = PROVIDER_ERROR_MAP[error.code];
      return jsonError(error.message, mapping.code, mapping.status);
    }
    throw error;
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM stocks WHERE user_id = ? AND canonical_url = ? LIMIT 1",
  )
    .bind(auth.userId, canonicalUrl)
    .first<{ id: string }>();

  if (existing) {
    return jsonError(
      "このスライドは既にストック済みです",
      "DUPLICATE_STOCK",
      409,
    );
  }

  // --- 同期 oEmbed 取得（INSERT 前 / fetch-first / ADR-009 §4-2） ---
  let metadata: StockMetadata;
  try {
    metadata = await fetchWithRetry((signal) =>
      fetchMetadataByProvider(provider, canonicalUrl, signal),
    );
  } catch (err) {
    return mapUpstreamError(err, provider, canonicalUrl);
  }

  // --- INSERT（メタデータ充足済み、1 回で書き込む / spec §3.6） ---
  const stockId = uuidv7();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `INSERT INTO stocks (
         id, user_id, original_url, canonical_url, provider,
         title, author_name, thumbnail_url, embed_url,
         created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        stockId,
        auth.userId,
        url,
        canonicalUrl,
        provider,
        metadata.title,
        metadata.authorName,
        metadata.thumbnailUrl,
        metadata.embedUrl,
        now,
        now,
      )
      .run();
  } catch (e: unknown) {
    // UNIQUE 制約違反（並列レース）→ 409 DUPLICATE_STOCK（spec §3.4 / §3.6 / ADR-009 §4-4）
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
      return jsonError(
        "このスライドは既にストック済みです",
        "DUPLICATE_STOCK",
        409,
      );
    }
    // その他の D1 エラー → 500 INTERNAL_ERROR（spec §3.6 / ADR-009 §4-4）
    console.error(
      JSON.stringify({
        action: "stock_insert_failed",
        canonicalUrl,
        userId: auth.userId,
        error: String(e),
      }),
    );
    return jsonError("内部エラーが発生しました", "INTERNAL_ERROR", 500);
  }

  console.log(
    JSON.stringify({
      action: "stock_created",
      stockId,
      provider,
      userId: auth.userId,
    }),
  );

  return Response.json(
    {
      id: stockId,
      original_url: url,
      canonical_url: canonicalUrl,
      provider,
      title: metadata.title,
      author_name: metadata.authorName,
      thumbnail_url: metadata.thumbnailUrl,
      embed_url: metadata.embedUrl,
      memo_text: null,
      created_at: now,
      updated_at: now,
    },
    { status: 201 },
  );
}

/** プロバイダに応じたメタデータ取得関数を呼び出す（spec §5.2） */
async function fetchMetadataByProvider(
  provider: string,
  canonicalUrl: string,
  signal: AbortSignal,
): Promise<StockMetadata> {
  switch (provider) {
    case "speakerdeck":
      return fetchSpeakerDeckMetadata(canonicalUrl, signal);
    case "docswell":
      return fetchDocswellMetadata(canonicalUrl, signal);
    case "google_slides":
      return fetchGoogleSlidesMetadata(canonicalUrl, signal);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * oEmbed 取得エラーを HTTP レスポンスにマッピング（spec §3.5 / §3.8 / ADR-009 §4-2）
 */
function mapUpstreamError(
  err: unknown,
  provider: string,
  canonicalUrl: string,
): Response {
  console.error(
    JSON.stringify({
      action: "oembed_fetch_failed",
      provider,
      canonicalUrl,
      errorName: err instanceof Error ? err.name : "unknown",
      error: String(err),
    }),
  );

  if (err instanceof UpstreamNotFoundError) {
    return jsonError(
      "スライドが見つかりません。URL を確認してください",
      "UPSTREAM_NOT_FOUND",
      400,
    );
  }
  if (err instanceof UpstreamForbiddenError) {
    return jsonError(
      "スライドが公開されていません。URL を確認してください",
      "UPSTREAM_FORBIDDEN",
      400,
    );
  }
  if (err instanceof UpstreamInvalidResponseError) {
    return jsonError(
      "プロバイダから想定外のレスポンスが返されました",
      "UPSTREAM_INVALID_RESPONSE",
      502,
    );
  }
  if (err instanceof UpstreamTimeoutError) {
    return jsonError(
      "プロバイダから応答がありません。時間をおいて再度お試しください",
      "UPSTREAM_TIMEOUT",
      504,
    );
  }
  if (err instanceof UpstreamFailureError) {
    return jsonError(
      "プロバイダから応答がありません。時間をおいて再度お試しください",
      "UPSTREAM_FAILURE",
      502,
    );
  }
  if (err instanceof PermanentError) {
    // 想定外サブクラスもまとめて UPSTREAM_INVALID_RESPONSE 扱い（保険）
    return jsonError(
      "プロバイダから想定外のレスポンスが返されました",
      "UPSTREAM_INVALID_RESPONSE",
      502,
    );
  }
  // 想定外の Error
  return jsonError("内部エラーが発生しました", "INTERNAL_ERROR", 500);
}
