/**
 * Pages Functions: /api/* catch-all proxy → Worker (workers.dev)
 *
 * gorou.dev が Cloudflare ゾーンでないため Worker routes が使えない。
 * Pages Functions でリクエストを Worker に転送して同一ドメインで API を提供する。
 */

interface Env {
  WORKER_ORIGIN: string;
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!ALLOWED_METHODS.has(context.request.method)) {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const workerOrigin = context.env.WORKER_ORIGIN;
  const url = new URL(context.request.url);
  const targetUrl = `${workerOrigin}${url.pathname}${url.search}`;

  // redirect: 'manual' — OAuth の 302 をブラウザに返すため fetch で追従しない
  return fetch(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
    redirect: 'manual',
  });
};
