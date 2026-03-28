/**
 * Memo API ハンドラー
 * memo-api-spec.md セクション 3〜4
 */

import type { AuthContext } from "../middleware/test-auth-bypass";

export interface MemoEnv {
  DB: D1Database;
}

const MEMO_MAX_LENGTH = 200;

type MemoRecord = {
  id: string;
  stock_id: string;
  memo_text: string;
  created_at: string;
  updated_at: string;
};

function jsonError(
  error: string,
  code: string,
  status: number,
): Response {
  return Response.json({ error, code }, { status });
}

/**
 * PUT /api/stocks/:id/memo
 * memo-api-spec.md セクション 3
 */
export async function handlePutMemo(
  stockId: string,
  request: Request,
  env: MemoEnv,
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
    !("memo_text" in body)
  ) {
    return jsonError("memo_text は必須です", "INVALID_REQUEST", 400);
  }

  const memoText = (body as { memo_text: unknown }).memo_text;
  if (typeof memoText !== "string") {
    return jsonError("memo_text は必須です", "INVALID_REQUEST", 400);
  }

  const trimmed = memoText.trim();
  const normalized = trimmed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (normalized === "") {
    return jsonError("メモの内容が空です", "INVALID_REQUEST", 400);
  }

  if ([...normalized].length > MEMO_MAX_LENGTH) {
    return jsonError(
      `メモは${MEMO_MAX_LENGTH}文字以内で入力してください`,
      "MEMO_TOO_LONG",
      400,
    );
  }

  const stock = await env.DB.prepare(
    "SELECT id FROM stocks WHERE id = ? AND user_id = ?",
  )
    .bind(stockId, auth.userId)
    .first<{ id: string }>();

  if (!stock) {
    return jsonError(
      "指定されたストックが見つかりません",
      "NOT_FOUND",
      404,
    );
  }

  const memoId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO memos (id, stock_id, user_id, memo_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (stock_id) DO UPDATE SET
       memo_text = excluded.memo_text,
       updated_at = excluded.updated_at`,
  )
    .bind(memoId, stockId, auth.userId, normalized, now, now)
    .run();

  const memo = await env.DB.prepare(
    "SELECT id, stock_id, memo_text, created_at, updated_at FROM memos WHERE stock_id = ? AND user_id = ?",
  )
    .bind(stockId, auth.userId)
    .first<MemoRecord>();

  return Response.json(memo);
}

/**
 * GET /api/stocks/:id/memo
 * memo-api-spec.md セクション 4
 */
export async function handleGetMemo(
  stockId: string,
  env: MemoEnv,
  auth: AuthContext,
): Promise<Response> {
  // N+1を避けるため所有権チェックとメモ取得を単一 JOIN で処理する
  const memo = await env.DB.prepare(
    `SELECT m.id, m.stock_id, m.memo_text, m.created_at, m.updated_at
     FROM memos m
     INNER JOIN stocks s ON s.id = m.stock_id
     WHERE m.stock_id = ? AND s.user_id = ?`,
  )
    .bind(stockId, auth.userId)
    .first<MemoRecord>();

  if (memo) {
    return Response.json(memo);
  }

  // メモ未作成 vs stock 不存在の判定
  const stock = await env.DB.prepare(
    "SELECT id FROM stocks WHERE id = ? AND user_id = ?",
  )
    .bind(stockId, auth.userId)
    .first<{ id: string }>();

  if (stock) {
    return jsonError("メモが見つかりません", "NOT_FOUND", 404);
  }

  return jsonError(
    "指定されたストックが見つかりません",
    "NOT_FOUND",
    404,
  );
}
