/**
 * HTTP レスポンスユーティリティ
 */

export function jsonError(
  error: string,
  code: string,
  status: number,
): Response {
  return Response.json({ error, code }, { status });
}
