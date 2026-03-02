/**
 * Stock CRUD ハンドラー
 * stock-api-spec.md セクション 3〜6
 */

import type { AuthContext } from "../middleware/test-auth-bypass";
import {
  detectProvider,
  ProviderError,
  type ProviderErrorCode,
} from "../lib/provider";
import { sendOEmbedMessage } from "../lib/queue";

export interface StockEnv {
  DB: D1Database;
  OEMBED_QUEUE: Queue;
}

interface StockRow {
  id: string;
  original_url: string;
  canonical_url: string;
  provider: string;
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  memo_text: string | null;
}

function jsonError(
  error: string,
  code: string,
  status: number,
): Response {
  return Response.json({ error, code }, { status });
}

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

/**
 * POST /api/stocks
 * stock-api-spec.md セクション 3
 */
export async function handleCreateStock(
  request: Request,
  env: StockEnv,
  auth: AuthContext,
): Promise<Response> {
  // 1. JSON パース
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

  // 2. url フィールド検証
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

  // 3. プロバイダ検出・URL 正規化
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

  // 4. 重複チェック
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

  // 5. stock 挿入
  const stockId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `INSERT INTO stocks (id, user_id, original_url, canonical_url, provider, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
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

  // 6. Queue メッセージ送信
  await sendOEmbedMessage(env.OEMBED_QUEUE, {
    schemaVersion: 1,
    stockId,
    originalUrl: url,
    canonicalUrl,
    provider,
  });

  // 7. レスポンス
  return Response.json(
    {
      id: stockId,
      original_url: url,
      canonical_url: canonicalUrl,
      provider,
      title: null,
      author_name: null,
      thumbnail_url: null,
      embed_url: null,
      status: "pending",
      memo_text: null,
      created_at: now,
      updated_at: now,
    },
    { status: 201 },
  );
}

/**
 * GET /api/stocks
 * stock-api-spec.md セクション 4
 */
export async function handleListStocks(
  request: Request,
  env: StockEnv,
  auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);

  // limit パラメータ
  let limit = 20;
  const limitParam = url.searchParams.get("limit");
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isNaN(parsed)) {
      limit = Math.max(1, Math.min(100, Math.floor(parsed)));
    }
  }

  // cursor パラメータ
  const cursor = url.searchParams.get("cursor");

  let result: D1Result<StockRow>;

  if (cursor) {
    // カーソル形式: {created_at}_{id}
    const sepIdx = cursor.indexOf("_");
    if (sepIdx === -1) {
      return Response.json(
        { items: [], next_cursor: null, has_more: false },
        { status: 200 },
      );
    }
    const cursorCreatedAt = cursor.substring(0, sepIdx);
    const cursorId = cursor.substring(sepIdx + 1);

    result = await env.DB.prepare(
      `SELECT
        s.id, s.original_url, s.canonical_url, s.provider,
        s.title, s.author_name, s.thumbnail_url, s.embed_url,
        s.status, s.created_at, s.updated_at,
        m.memo_text
      FROM stocks s
      LEFT JOIN memos m ON m.stock_id = s.id AND m.user_id = s.user_id
      WHERE s.user_id = ?
        AND (s.created_at < ? OR (s.created_at = ? AND s.id < ?))
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ?`,
    )
      .bind(auth.userId, cursorCreatedAt, cursorCreatedAt, cursorId, limit)
      .all<StockRow>();
  } else {
    result = await env.DB.prepare(
      `SELECT
        s.id, s.original_url, s.canonical_url, s.provider,
        s.title, s.author_name, s.thumbnail_url, s.embed_url,
        s.status, s.created_at, s.updated_at,
        m.memo_text
      FROM stocks s
      LEFT JOIN memos m ON m.stock_id = s.id AND m.user_id = s.user_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ?`,
    )
      .bind(auth.userId, limit)
      .all<StockRow>();
  }

  const items = result.results;
  const hasMore = items.length === limit;
  const nextCursor = hasMore
    ? `${items[items.length - 1].created_at}_${items[items.length - 1].id}`
    : null;

  return Response.json({
    items,
    next_cursor: nextCursor,
    has_more: hasMore,
  });
}

/**
 * GET /api/stocks/:id
 * stock-api-spec.md セクション 5
 */
export async function handleGetStock(
  stockId: string,
  env: StockEnv,
  auth: AuthContext,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT
      s.id, s.original_url, s.canonical_url, s.provider,
      s.title, s.author_name, s.thumbnail_url, s.embed_url,
      s.status, s.created_at, s.updated_at,
      m.memo_text
    FROM stocks s
    LEFT JOIN memos m ON m.stock_id = s.id AND m.user_id = s.user_id
    WHERE s.id = ? AND s.user_id = ?`,
  )
    .bind(stockId, auth.userId)
    .first<StockRow>();

  if (!row) {
    return jsonError(
      "指定されたストックが見つかりません",
      "NOT_FOUND",
      404,
    );
  }

  return Response.json(row);
}

/**
 * DELETE /api/stocks/:id
 * stock-api-spec.md セクション 6
 */
export async function handleDeleteStock(
  stockId: string,
  env: StockEnv,
  auth: AuthContext,
): Promise<Response> {
  // 1. 所有権チェック
  const existing = await env.DB.prepare(
    "SELECT id FROM stocks WHERE id = ? AND user_id = ?",
  )
    .bind(stockId, auth.userId)
    .first<{ id: string }>();

  if (!existing) {
    return jsonError(
      "指定されたストックが見つかりません",
      "NOT_FOUND",
      404,
    );
  }

  // 2. 関連メモを削除
  await env.DB.prepare(
    "DELETE FROM memos WHERE stock_id = ? AND user_id = ?",
  )
    .bind(stockId, auth.userId)
    .run();

  // 3. stock を削除
  await env.DB.prepare(
    "DELETE FROM stocks WHERE id = ? AND user_id = ?",
  )
    .bind(stockId, auth.userId)
    .run();

  console.log(JSON.stringify({ action: "stock_deleted", stockId, userId: auth.userId }));

  // 4. 204 No Content
  return new Response(null, { status: 204 });
}
