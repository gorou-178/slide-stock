type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * レスポンスの JSON をパースして返す。
 */
export async function parseJsonResponse<T = unknown>(
  response: Response,
): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * テスト用の JSON リクエストを作成する。
 * ハンドラー直接呼び出しテストで使用。
 */
export function createJsonRequest(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown,
): Request {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  return new Request(`http://localhost${path}`, init);
}

/**
 * テスト用の raw リクエストを作成する（JSON パースエラーテスト等）。
 */
export function createRawRequest(
  path: string,
  method: HttpMethod,
  rawBody: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: rawBody,
  });
}
