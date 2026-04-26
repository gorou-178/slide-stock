/**
 * Worker エントリポイント（最小構成）。
 * wrangler.test.toml の main 参照用。実際の HTTP ルーティングは Astro SSR が担当。
 */
import type { Env } from './types';

export type { Env };

export default {
  async fetch(): Promise<Response> {
    return new Response("Not used — Astro SSR handles routing", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
