/**
 * Queue 送信ラッパー
 * テスト時に vi.mock() でスタブ化するための薄いレイヤー
 */
export async function sendOEmbedMessage(
  queue: Queue,
  message: {
    schemaVersion: number;
    stockId: string;
    originalUrl: string;
    canonicalUrl: string;
    provider: string;
  },
): Promise<void> {
  await queue.send(message);
}
