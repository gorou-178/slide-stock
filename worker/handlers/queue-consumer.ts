/**
 * Queue コンシューマー — oEmbed メタデータ取得
 * oembed-spec.md セクション 6
 */

import {
  fetchSpeakerDeckMetadata,
  fetchDocswellMetadata,
  fetchGoogleSlidesMetadata,
  PermanentError,
  type StockMetadata,
} from "../lib/oembed";

export interface OEmbedQueueMessage {
  schemaVersion: 1;
  stockId: string;
  originalUrl: string;
  canonicalUrl: string;
  provider: "speakerdeck" | "docswell" | "google_slides";
}

interface ConsumerEnv {
  DB: D1Database;
}

async function processMessage(
  msg: OEmbedQueueMessage,
  env: ConsumerEnv,
): Promise<void> {
  let metadata: StockMetadata;

  switch (msg.provider) {
    case "speakerdeck":
      metadata = await fetchSpeakerDeckMetadata(msg.canonicalUrl);
      break;
    case "docswell":
      metadata = await fetchDocswellMetadata(msg.canonicalUrl);
      break;
    case "google_slides":
      metadata = await fetchGoogleSlidesMetadata(msg.canonicalUrl);
      break;
  }

  await env.DB.prepare(
    `UPDATE stocks
     SET title = ?, author_name = ?, embed_url = ?, thumbnail_url = ?,
         status = 'ready', updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      metadata.title,
      metadata.authorName,
      metadata.embedUrl,
      metadata.thumbnailUrl,
      new Date().toISOString(),
      msg.stockId,
    )
    .run();
}

async function markStockFailed(
  db: D1Database,
  stockId: string,
): Promise<void> {
  await db
    .prepare("UPDATE stocks SET status = 'failed', updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), stockId)
    .run();
}

export async function handleQueue(
  batch: MessageBatch<OEmbedQueueMessage>,
  env: ConsumerEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const msg = message.body;

    // スキーマバージョンチェック
    if (msg.schemaVersion !== 1) {
      console.warn(`Unknown schema version: ${msg.schemaVersion}`);
      message.ack();
      continue;
    }

    try {
      await processMessage(msg, env);
      message.ack();
    } catch (error) {
      if (error instanceof PermanentError) {
        console.error(
          `Permanent error for stock ${msg.stockId}: ${error.message}`,
        );
        await markStockFailed(env.DB, msg.stockId);
        message.ack();
      } else {
        console.error(
          `Transient error for stock ${msg.stockId}: ${error}`,
        );
        message.retry();
      }
    }
  }
}
