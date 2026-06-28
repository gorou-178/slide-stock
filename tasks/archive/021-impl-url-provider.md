# URL 判定・プロバイダ振り分けの実装

QA が作成したテスト (020-test-url-provider) を通すよう、URL 判定ロジックを実装してください。

## やること

1. URL バリデーション関数を実装する
   - 有効な URL であることを検証
   - HTTPS プロトコルであることを検証（http は https に変換）
2. プロバイダ判定関数を実装する
   - ホスト名に基づいてプロバイダを判定
   - `speakerdeck.com` → `speakerdeck`
   - `docswell.com` → `docswell`
   - `docs.google.com/presentation` → `google_slides`
   - 未対応ホストはエラーを返す
3. URL 正規化関数を実装する
   - クエリパラメータの除去
   - トレイリングスラッシュの統一
   - 正規化された canonical_url を返す
4. 重複チェック関数を実装する
   - user_id + canonical_url の組み合わせで既存ストックを検索

## 配置先

- `worker/lib/url-provider.ts` — URL 判定・正規化ロジック

## 確認

- QA が作成したテストがすべて通ること
