# D1 マイグレーション SQL の作成と適用手順の整備

docs/database.md のスキーマ定義に基づき、D1 マイグレーションファイルを作成してください。

## やること

1. マイグレーションディレクトリを作成する
   - `migrations/0001_initial.sql` を作成
2. 以下のテーブルを CREATE TABLE する SQL を書く
   - `users` — id, google_sub (UNIQUE), email, name, created_at
   - `stocks` — id, user_id (FK), original_url, canonical_url, provider, title, author_name, thumbnail_url, embed_url, status (DEFAULT 'pending'), created_at, updated_at
   - `memos` — id, stock_id (FK), user_id (FK), memo_text, created_at, updated_at
3. インデックスを作成する
   - `users.google_sub` — UNIQUE INDEX
   - `stocks.user_id` — INDEX
   - `stocks(user_id, created_at)` — 複合 INDEX
   - `memos.stock_id` — UNIQUE INDEX
4. wrangler.toml に D1 マイグレーション設定を追加する
5. ローカルでマイグレーションを実行し、テーブルが作成されることを確認する

## SQL 設計方針

- TEXT 型の UUID を主キーに使用する
- 日時は ISO 8601 文字列 (TEXT 型)
- 外部キー制約を明示する (`REFERENCES` + `ON DELETE CASCADE` は使わず `RESTRICT` を使用)
- ベンダー依存構文を避ける（PostgreSQL 移行を考慮）

## 確認

- `npx wrangler d1 migrations apply <DB_NAME> --local` が成功すること
- 各テーブルが正しく作成されていること
- インデックスが作成されていること
