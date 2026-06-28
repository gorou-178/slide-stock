# URL 判定・プロバイダ振り分けのテスト作成

スライド URL からプロバイダを判定するロジックのテストを作成してください。

## やること

1. URL → プロバイダ判定のテストを作成する
   - SpeakerDeck URL を正しく判定できること
     - `https://speakerdeck.com/user/slide-name`
     - `https://www.speakerdeck.com/user/slide-name`
   - Docswell URL を正しく判定できること
     - `https://www.docswell.com/s/user/slide-id`
   - Google Slides URL を正しく判定できること
     - `https://docs.google.com/presentation/d/SLIDE_ID/...`
   - 未対応 URL でエラーを返すこと
     - `https://example.com/slides`
     - `https://slideshare.net/...`
   - 不正な URL でエラーを返すこと
     - 空文字、null、非 URL 文字列
2. URL 正規化のテストを作成する
   - クエリパラメータの除去
   - トレイリングスラッシュの統一
   - http → https への変換
3. 重複チェックのテストを作成する
   - 同一ユーザーが同じ canonical_url を登録済みの場合にエラーを返すこと

## 注意

- テストはこの段階では失敗してよい（Dev が後で実装する）
