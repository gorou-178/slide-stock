# oEmbed メタデータ取得 (Queue Consumer) の実装

QA が作成したテスト (024-test-oembed) を通すよう、Queue Consumer を実装してください。

## やること

1. oEmbed クライアントを実装する
   - SpeakerDeck oEmbed API 呼び出し
     - `https://speakerdeck.com/oembed.json?url=<URL>`
   - Docswell oEmbed API 呼び出し
     - `https://www.docswell.com/service/oembed?url=<URL>&format=json`
   - Google Slides メタデータ取得
     - 公開スライドの title を HTML から取得
     - embed_url を URL パターンから構築
2. Queue Consumer を実装する
   - wrangler.toml に Queue バインディング設定を追加
   - メッセージからstockId, url, provider を取得
   - プロバイダに応じた oEmbed クライアントを呼び出す
   - 取得結果で stocks テーブルを UPDATE
   - 成功時: status → `ready`, title, author_name, thumbnail_url, embed_url を更新
   - 失敗時: status → `failed`
3. エラーハンドリング
   - リトライ設定（Queues の retry 機能活用）
   - タイムアウト処理

## 配置先

- `worker/lib/oembed-client.ts` — oEmbed API クライアント
- `worker/consumer.ts` — Queue Consumer エントリポイント

## 確認

- QA が作成した oEmbed テストがすべて通ること
- Queue メッセージ受信 → DB 更新フローが動作すること
