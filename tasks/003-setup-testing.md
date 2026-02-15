# テスト基盤の構築

TDD で開発を進めるためのテスト環境をセットアップしてください。

## やること

1. Vitest をインストール・設定する
   - vitest.config.ts を作成
   - TypeScript 対応
   - Cloudflare Workers 環境のモック対応
2. テストヘルパーを作成する
   - D1 データベースのモック
   - リクエスト/レスポンスのヘルパー
3. package.json に test スクリプトを追加する
   - `test` — テスト実行
   - `test:watch` — ウォッチモード
   - `test:coverage` — カバレッジ
4. サンプルテストを1つ作成し、テスト環境が正常に動くことを確認する
5. Playwright のインストール・設定（E2E テスト用）
   - playwright.config.ts を作成
   - `test:e2e` スクリプト追加

## 確認

- `npm test` でテストが実行できること
- TypeScript のテストが正しくトランスパイルされること
