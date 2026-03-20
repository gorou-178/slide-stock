/**
 * Worker エントリポイント — Queue consumer のみ。
 * HTTP ルーティングは Astro SSR API Routes が担当する。
 * T-710/T-711 で Queue 廃止後に本ファイルも削除予定。
 */
import type { Env } from './types';
import { handleQueue } from './handlers/queue-consumer';

export type { Env };

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleQueue(batch as MessageBatch<any>, env);
  },
} satisfies ExportedHandler<Env>;
