# テスト用シードデータの作成

ユニットテスト・E2E テストで使用するシードデータとヘルパーを作成してください。

## やること

1. テスト用シードデータを定義する（TypeScript）
   - テストユーザー（2〜3名分）
     - デフォルトテストユーザー: `test-user-1`
     - 追加ユーザー: `test-user-2`, `test-user-3`
   - テスト用ストックデータ（各プロバイダ1件ずつ）
     - SpeakerDeck のスライド
     - Docswell のスライド
     - Google Slides のスライド
   - テスト用メモデータ
2. D1 にシードデータを投入するヘルパー関数を作成する
   - `seedDatabase(db: D1Database)` — 全テストデータを投入
   - `cleanDatabase(db: D1Database)` — テストデータをクリア
3. Vitest 用のセットアップファイルでシードを自動適用する
4. E2E テスト用にシードデータを投入する npm スクリプトを追加する
   - `db:seed` — ローカル D1 にシードデータ投入

## データ配置

- src/test/seed.ts — シードデータ定義
- src/test/helpers.ts — DB ヘルパー関数

## 確認

- テストからシードデータにアクセスできること
- シードデータが docs/database.md のスキーマに準拠していること
