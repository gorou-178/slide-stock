/**
 * /stocks/:id → stock-detail ページの配信
 *
 * Pages Functions 導入により _redirects の 200 rewrite が正常に動作しないため、
 * ASSETS バインディングで直接 stock-detail/index.html を返す。
 */
export const onRequest: PagesFunction = async (context) => {
  const assetUrl = new URL('/stock-detail/index.html', context.request.url);
  return context.env.ASSETS.fetch(assetUrl);
};
