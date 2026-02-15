# 相談: E2E テスト「カスタムユーザーでの認証」の失敗について

## 問題

`e2e/auth-bypass.test.ts` の「testUser フィクスチャで異なるユーザーを指定できること」テスト（112行目）が失敗する。

## エラー内容

```
TypeError: Failed to execute 'fetch' on 'Window': Failed to parse URL from /api/me
```

## 原因

このテストは `browser.newContext()` で新しいコンテキストを作成し、`page.evaluate(async () => { fetch("/api/me") })` を呼び出している。しかし、ページがどこにもナビゲートされていない（`about:blank` の状態）ため、相対URL `/api/me` を解決できずブラウザレベルでエラーになる。

Playwright の `page.route()` による URL インターセプトはブラウザの URL 解決の後に動作するため、`about:blank` でのルートインターセプトでは回避できない。

## 修正案（QA 向け）

以下のいずれかで解決可能:

1. `page.evaluate` の前に `await page.goto("/")` を追加する
2. 相対URL `"/api/me"` を絶対URL `"http://localhost:4321/api/me"` に変更する

## 影響範囲

- 他の11テストは全てパスしている
- このテストのみが `about:blank` での相対URL解決の問題で失敗
