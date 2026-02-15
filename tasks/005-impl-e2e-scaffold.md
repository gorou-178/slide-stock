# E2E テスト実行環境の実装

QA が作成した E2E テスト基盤が動作するよう、実行環境を整備してください。

## やること

1. Playwright が dev サーバーを自動起動して E2E テストを実行できるようにする
   - playwright.config.ts の webServer 設定
   - dev サーバーの起動コマンドと待機設定
2. Astro の最小ページ（src/pages/index.astro）を作成し、ヘルスチェックテストが通るようにする
3. E2E テスト用の npm スクリプトを整備する
4. .gitignore に Playwright の出力（test-results/, playwright-report/）を追加する

## 確認

- `npm run test:e2e` でヘルスチェックテストが通ること
