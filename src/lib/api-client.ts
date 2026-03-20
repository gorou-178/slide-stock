/** API 呼び出しヘルパー — ui-spec.md セクション 6 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface StockItem {
  id: string;
  original_url: string;
  canonical_url: string;
  provider: 'speakerdeck' | 'docswell' | 'google_slides';
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  status: 'ready';
  memo_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockListResponse {
  items: StockItem[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface MemoResponse {
  id: string;
  stock_id: string;
  memo_text: string;
  created_at: string;
  updated_at: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = 'エラーが発生しました';
    try {
      const body = await res.json() as { error?: string; code?: string };
      if (body.error) message = body.error;
      if (body.code) code = body.code;
    } catch {
      // JSON parse 失敗は無視
    }
    throw new ApiError(res.status, code, message);
  }
  return res.json() as Promise<T>;
}

/** 認証チェック: 200 → ユーザー情報、401 → null */
export async function fetchMe(): Promise<{ id: string; email: string; name: string } | null> {
  const res = await fetch('/api/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'ユーザー情報の取得に失敗しました');
  return res.json() as Promise<{ id: string; email: string; name: string }>;
}

/** ストック作成 */
export async function createStock(url: string): Promise<StockItem> {
  const res = await fetch('/api/stocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return handleResponse<StockItem>(res);
}

/** ストック一覧取得 */
export async function fetchStocks(cursor?: string, limit?: number): Promise<StockListResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const res = await fetch(`/api/stocks${qs ? `?${qs}` : ''}`);
  return handleResponse<StockListResponse>(res);
}

/** ストック詳細取得 */
export async function fetchStock(id: string): Promise<StockItem> {
  const res = await fetch(`/api/stocks/${id}`);
  return handleResponse<StockItem>(res);
}

/** ストック削除 */
export async function deleteStock(id: string): Promise<void> {
  const res = await fetch(`/api/stocks/${id}`, { method: 'DELETE' });
  if (res.status === 204 || res.status === 404) return;
  return handleResponse<void>(res);
}

/** メモ保存 */
export async function saveMemo(stockId: string, memoText: string): Promise<MemoResponse> {
  const res = await fetch(`/api/stocks/${stockId}/memo`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memo_text: memoText }),
  });
  return handleResponse<MemoResponse>(res);
}

/** ログアウト */
export async function logout(): Promise<void> {
  const res = await fetch('/api/auth/logout', { method: 'POST' });
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'ログアウトに失敗しました');
}
