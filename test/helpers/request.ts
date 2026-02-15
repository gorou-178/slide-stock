import { SELF } from "cloudflare:test";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Worker に対してリクエストを送信し、レスポンスを返すヘルパー。
 * SELF (service binding) を使って Worker を直接呼び出す。
 */
export async function workerFetch(
  path: string,
  method: HttpMethod = "GET",
  options: RequestOptions = {},
): Promise<Response> {
  const { body, headers = {} } = options;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  return SELF.fetch(`http://localhost${path}`, init);
}

/**
 * レスポンスの JSON をパースして返す。
 */
export async function parseJsonResponse<T = unknown>(
  response: Response,
): Promise<T> {
  return response.json() as Promise<T>;
}
