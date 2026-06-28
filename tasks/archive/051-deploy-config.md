# Cloudflare デプロイ設定の整備

MVP を Cloudflare にデプロイするための設定を整備してください。

## やること

1. wrangler.toml の本番設定を整備する
   - Workers の名前・ルーティング設定
   - D1 データベースバインディング（本番用）
   - Queues バインディング
   - 環境変数の設定（秘匿情報は `wrangler secret` で管理）
2. Cloudflare Pages の設定を整備する
   - ビルドコマンドの設定
   - 出力ディレクトリの設定
   - 環境変数の設定
3. デプロイ手順書を作成する (`docs/deploy.md`)
   - 初回セットアップ手順
     - D1 データベース作成
     - Queues 作成
     - 環境変数・シークレット設定
   - デプロイコマンド
   - マイグレーション適用手順
4. 本番用環境変数一覧を整理する
   - Google OAuth のクライアント ID・シークレット
   - JWT 署名キー
   - その他必要な設定

## セキュリティ要件

- `.env` ファイルは `.gitignore` に含まれていること
- 秘匿情報は `wrangler secret put` で管理すること
- `TEST_MODE` は本番環境に絶対にセットしないこと

## 確認

- `wrangler deploy` で Workers がデプロイできること（人間が実行）
- `npx astro build` で Pages がビルドできること
- 本番 D1 にマイグレーションが適用できること
