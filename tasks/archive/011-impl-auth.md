# Google OIDC 認証の実装

QA が作成したテスト (010-test-auth) を通すよう、Google OIDC 認証を実装してください。

## やること

1. Google ID Token の JWT 検証を実装する
   - Google の JWKS エンドポイントから公開鍵を取得
   - JWT の署名、有効期限、issuer、audience を検証
   - sub, email, name クレームを抽出
2. `GET /me` エンドポイントを実装する
   - Authorization ヘッダーから Bearer トークンを取得
   - JWT を検証
   - users テーブルに google_sub で検索、なければ INSERT
   - ユーザー情報を JSON で返す
3. 認証ミドルウェアを実装する
   - 認証が必要なエンドポイントに適用
   - リクエストコンテキストにユーザー情報をセット
4. セッション管理を実装する（Cookie または JWT セッション）

## API レスポンス

```json
GET /me → 200
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "ユーザー名"
}
```

## 確認

- QA が作成した認証テストがすべて通ること
- トークンなし/不正トークンで 401 が返ること
