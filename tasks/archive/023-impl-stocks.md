# スライドストック CRUD の実装

QA が作成したテスト (022-test-stocks) を通すよう、ストック API を実装してください。

## やること

1. `POST /stocks` を実装する
   - リクエストボディから URL を取得
   - URL 判定・正規化 (021-impl-url-provider のロジックを使用)
   - 重複チェック
   - stocks テーブルに INSERT (status=pending)
   - Queues にメタデータ取得メッセージを enqueue
   - 201 Created でレスポンス
2. `GET /stocks` を実装する
   - 認証ユーザーの stocks を取得
   - created_at DESC でソート
   - メモ情報も JOIN して返す
3. `GET /stocks/:id` を実装する
   - user_id で所有権チェック
   - stock 情報を返す
4. `DELETE /stocks/:id` を実装する
   - user_id で所有権チェック
   - 関連メモも削除
   - stock を削除
   - 204 No Content

## API レスポンス例

```json
POST /stocks → 201
{
  "id": "uuid",
  "original_url": "https://speakerdeck.com/...",
  "canonical_url": "https://speakerdeck.com/...",
  "provider": "speakerdeck",
  "status": "pending",
  "created_at": "2025-01-01T00:00:00Z"
}

GET /stocks → 200
{
  "stocks": [
    {
      "id": "uuid",
      "title": "スライドタイトル",
      "provider": "speakerdeck",
      "thumbnail_url": "https://...",
      "status": "ready",
      "memo_text": "メモの内容",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

## 確認

- QA が作成したストック CRUD テストがすべて通ること
