/**
 * POST /api/stocks ハンドラー
 * stock-api-spec.md セクション 3
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
  type StockMetadata,
} from "../lib/oembed";
import { jsonError, type StockEnv } from "./stocks";

/** ProviderErrorCode → HTTP エラーレスポンス（stock-api-spec.md セクション 3.3） */
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

  const stockId = uuidv7();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `INSERT INTO stocks (id, user_id, original_url, canonical_url, provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(stockId, auth.userId, url, canonicalUrl, provider, now, now)
      .run();
  } catch (e: unknown) {
    // UNIQUE 制約違反（race condition で重複した場合）
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
      return jsonError(
        "このスライドは既にストック済みです",
        "DUPLICATE_STOCK",
        409,
      );
    }
    throw e;
  }

  console.log(JSON.stringify({ action: "stock_created", stockId, provider, userId: auth.userId }));

  let metadata: StockMetadata = {
    title: null, authorName: null, thumbnailUrl: null, embedUrl: null,
  };

  try {
    metadata = await fetchMetadataByProvider(provider, canonicalUrl);
    await env.DB.prepare(
      `UPDATE stocks SET title = ?, author_name = ?, embed_url = ?, thumbnail_url = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(metadata.title, metadata.authorName, metadata.embedUrl,
            metadata.thumbnailUrl, new Date().toISOString(), stockId)
      .run();
    console.log(JSON.stringify({ action: "oembed_success", stockId, provider }));
  } catch (error) {
    console.error(JSON.stringify({
      action: "oembed_fetch_failed", stockId, provider, error: String(error),
    }));
    // メタデータなしで続行（stock 自体は作成済み）
  }

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

/** プロバイダに応じたメタデータ取得関数を呼び出す */
async function fetchMetadataByProvider(
  provider: string,
  canonicalUrl: string,
): Promise<StockMetadata> {
  switch (provider) {
    case "speakerdeck":
      return fetchSpeakerDeckMetadata(canonicalUrl);
    case "docswell":
      return fetchDocswellMetadata(canonicalUrl);
    case "google_slides":
      return fetchGoogleSlidesMetadata(canonicalUrl);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
