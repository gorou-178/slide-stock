/**
 * Stock CRUD ハンドラー
 * stock-api-spec.md セクション 4〜6
 */

import type { AuthContext } from "../middleware/test-auth-bypass";

export interface StockEnv {
  DB: D1Database;
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
  created_at: string;
  updated_at: string;
  memo_text: string | null;
}

export function jsonError(
  error: string,
  code: string,
  status: number,
): Response {
  return Response.json({ error, code }, { status });
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

  let limit = 20;
  const limitParam = url.searchParams.get("limit");
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isNaN(parsed)) {
      limit = Math.max(1, Math.min(100, Math.floor(parsed)));
    }
  }

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
        s.created_at, s.updated_at,
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
        s.created_at, s.updated_at,
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
      s.created_at, s.updated_at,
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

  await env.DB.prepare(
    "DELETE FROM memos WHERE stock_id = ? AND user_id = ?",
  )
    .bind(stockId, auth.userId)
    .run();

  await env.DB.prepare(
    "DELETE FROM stocks WHERE id = ? AND user_id = ?",
  )
    .bind(stockId, auth.userId)
    .run();

  console.log(JSON.stringify({ action: "stock_deleted", stockId, userId: auth.userId }));

  return new Response(null, { status: 204 });
}
