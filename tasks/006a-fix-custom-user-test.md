# 006a-fix-custom-user-test — E2E テスト「カスタムユーザーでの認証」の修正

## ロール

@qa

## 概要

`e2e/auth-bypass.test.ts` 112行目のテスト「testUser フィクスチャで異なるユーザーを指定できること」が `about:blank` での相対URL解決エラーで失敗している。修正する。

## 問題の根本原因

`browser.newContext()` で新しいコンテキストを作成後、`page.goto()` を呼ばずに `page.evaluate(() => fetch("/api/me"))` を実行している。`about:blank` では相対URLを解決できないため `TypeError` が発生する。

## 修正内容

`e2e/auth-bypass.test.ts` 147行目付近、`page.evaluate` の前に `await page.goto("/");` を追加する。

### Before

```typescript
// Act
const response = await page.evaluate(async () => {
  const res = await fetch("/api/me");
  return res.json();
});
```

### After

```typescript
// Act: ページをナビゲートしてから API を呼ぶ（about:blank では相対URLを解決できない）
await page.goto("/");
const response = await page.evaluate(async () => {
  const res = await fetch("/api/me");
  return res.json();
});
```

## 完了条件

- [ ] `npx playwright test e2e/auth-bypass.test.ts` で全12テストがパスすること
- [ ] 他のE2Eテストに影響がないこと

## 参照

- [help-e2e-custom-user-test.md](./help-e2e-custom-user-test.md) — 相談内容
