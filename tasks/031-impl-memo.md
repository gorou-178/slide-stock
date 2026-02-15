# メモ機能の実装

QA が作成したテスト (030-test-memo) を通すよう、メモ API を実装してください。

## やること

1. `PUT /stocks/:id/memo` を実装する
   - stock_id の所有権チェック (user_id)
   - memos テーブルに UPSERT (stock_id で既存チェック)
     - 存在しない場合: INSERT
     - 存在する場合: UPDATE (memo_text, updated_at)
   - 200 OK でレスポンス
2. `GET /stocks/:id/memo` を実装する
   - stock_id の所有権チェック (user_id)
   - memos テーブルから取得
   - メモがない場合は `{ memo_text: null }` を返す

## API レスポンス例

```json
PUT /stocks/:id/memo
Request:  { "memo_text": "このスライドは..." }
Response: 200 { "memo_text": "このスライドは...", "updated_at": "..." }

GET /stocks/:id/memo
Response: 200 { "memo_text": "このスライドは...", "updated_at": "..." }
Response: 200 { "memo_text": null }
```

## 確認

- QA が作成したメモテストがすべて通ること
