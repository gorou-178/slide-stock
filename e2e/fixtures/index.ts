import { test as base, type Page } from "@playwright/test";

/**
 * テスト用認証ユーザーの型定義
 */
export interface TestUser {
  id: string;
  email: string;
  name: string;
}

/**
 * デフォルトのテストユーザー
 */
export const DEFAULT_TEST_USER: TestUser = {
  id: "test-user-001",
  email: "test@example.com",
  name: "Test User",
};

/**
 * 認証バイパスを使ってページにログイン済みユーザーとしてアクセスするヘルパー
 *
 * Worker API に対して X-Test-User-Id ヘッダーを付与し、
 * フロントエンドには test_session Cookie をセットする。
 */
async function setupAuthenticatedPage(
  page: Page,
  user: TestUser
): Promise<void> {
  // ブラウザレベルで全リクエストに認証ヘッダーを付与する
  // page.route よりも先に適用されるため、テスト側の route.fulfill() でもヘッダーが見える
  await page.setExtraHTTPHeaders({
    "X-Test-User-Id": user.id,
    "X-Test-User-Email": user.email,
  });

  // フロントエンド用にテスト用セッション Cookie をセット
  await page.context().addCookies([
    {
      name: "test_session",
      value: `test-token-${user.id}`,
      domain: "localhost",
      path: "/",
    },
  ]);
}

/**
 * カスタムフィクスチャの拡張。
 *
 * - authenticatedPage: 認証済みユーザーでセットアップされた Page
 * - testUser: テストで使用するユーザー情報
 */
export const test = base.extend<{
  authenticatedPage: Page;
  testUser: TestUser;
}>({
  testUser: [DEFAULT_TEST_USER, { option: true }],

  authenticatedPage: async ({ page, testUser }, use) => {
    await setupAuthenticatedPage(page, testUser);
    await use(page);
  },
});

export { expect } from "@playwright/test";
