# oEmbed メタデータ取得 (Queue Consumer) のテスト作成

Queue Consumer による oEmbed メタデータ取得のテストを作成してください。

## やること

1. oEmbed クライアントのテストを作成する
   - SpeakerDeck の oEmbed API からメタデータを取得できること
     - title, author_name, thumbnail_url, embed_url が取得できること
   - Docswell の oEmbed API からメタデータを取得できること
   - Google Slides からメタデータを取得できること（oEmbed 非対応のため HTML パース）
   - oEmbed API がエラーを返した場合の処理
   - ネットワークエラー時の処理
2. Queue Consumer のテストを作成する
   - メッセージを受信して stock のメタデータを更新できること
   - メタデータ取得成功時に status を `ready` に更新すること
   - メタデータ取得失敗時に status を `failed` に更新すること
   - 不正なメッセージ形式をスキップすること
3. embed_url の構築テストを作成する
   - SpeakerDeck: oEmbed レスポンスから embed_url を抽出
   - Docswell: oEmbed レスポンスから embed_url を抽出
   - Google Slides: URL から embed 用 URL を構築
     - `/pub` → `/embed` 変換

## 注意

- 外部 API 呼び出しはモックする
- テストはこの段階では失敗してよい（Dev が後で実装する）
