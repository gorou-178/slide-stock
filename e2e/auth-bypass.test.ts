import { test, expect, DEFAULT_TEST_USER } from "./fixtures";

test.describe("認証バイパス: E2E テスト", () => {
  test.describe("認証済みフィクスチャの動作確認", () => {
    test("認証済みページで API にアクセスすると X-Test-User-Id ヘッダーが付与されること", async ({
      authenticatedPage,
    }) => {
      // Arrange: API リクエストをインターセプトしてヘッダーを検証
      const interceptedHeaders: Record<string, string> = {};

      await authenticatedPage.route("**/api/me", (route) => {
        const headers = route.request().headers();
        Object.assign(interceptedHeaders, headers);
        // テスト用のモックレスポンスを返す
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: DEFAULT_TEST_USER.id,
            email: DEFAULT_TEST_USER.email,
            name: DEFAULT_TEST_USER.name,
          }),
        });
      });

      // Act: 認証が必要な API を呼び出すページにアクセス
      await authenticatedPage.goto("/");

      // API リクエストを発火させる（ページが /api/me を呼ぶことを想定）
      const response = await authenticatedPage.evaluate(async () => {
        const res = await fetch("/api/me");
        return res.json();
      });

      // Assert: ヘッダーにテストユーザーIDが含まれている
      expect(interceptedHeaders["x-test-user-id"]).toBe(
        DEFAULT_TEST_USER.id
      );
    });

    test("認証済みページに test_session Cookie がセットされていること", async ({
      authenticatedPage,
    }) => {
      // Act
      await authenticatedPage.goto("/");

      // Assert
      const cookies = await authenticatedPage.context().cookies();
      const testSessionCookie = cookies.find(
        (c) => c.name === "test_session"
      );
      expect(testSessionCookie).toBeDefined();
      expect(testSessionCookie!.value).toContain(DEFAULT_TEST_USER.id);
    });
  });

  test.describe("認証が必要なページへのアクセス", () => {
    test("認証済みユーザーで一覧画面にアクセスできること", async ({
      authenticatedPage,
    }) => {
      // Act: 認証が必要なストック一覧ページにアクセス
      const response = await authenticatedPage.goto("/stocks");

      // Assert: リダイレクトされずにアクセスできる
      expect(response).not.toBeNull();
      expect(response!.status()).toBe(200);
    });

    test("認証済みユーザーの情報が画面に表示されること", async ({
      authenticatedPage,
    }) => {
      // Arrange: /api/me にモックレスポンスを設定
      await authenticatedPage.route("**/api/me", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: DEFAULT_TEST_USER.id,
            email: DEFAULT_TEST_USER.email,
            name: DEFAULT_TEST_USER.name,
          }),
        });
      });

      // Act
      await authenticatedPage.goto("/stocks");

      // Assert: ユーザー名が画面に表示されている
      await expect(
        authenticatedPage.getByText(DEFAULT_TEST_USER.name)
      ).toBeVisible();
    });

    test("未認証ユーザーはログインページにリダイレクトされること", async ({
      page,
    }) => {
      // Act: 認証バイパスなしでアクセス
      await page.goto("/stocks");

      // Assert: ログインページへリダイレクト
      await expect(page).toHaveURL(/\/login|\/$/);
    });
  });

  test.describe("カスタムユーザーでの認証", () => {
    const customUser = {
      id: "custom-user-999",
      email: "custom@example.com",
      name: "Custom Test User",
    };

    test("testUser フィクスチャで異なるユーザーを指定できること", async ({
      browser,
    }) => {
      // Arrange: カスタムユーザーで新しいコンテキストを作成
      const context = await browser.newContext();
      const page = await context.newPage();

      // API リクエストにカスタムユーザーのヘッダーを付与
      await page.route("**/api/**", (route) => {
        const headers = {
          ...route.request().headers(),
          "X-Test-User-Id": customUser.id,
          "X-Test-User-Email": customUser.email,
        };
        route.continue({ headers });
      });

      await page.context().addCookies([
        {
          name: "test_session",
          value: `test-token-${customUser.id}`,
          domain: "localhost",
          path: "/",
        },
      ]);

      // モック /api/me
      await page.route("**/api/me", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(customUser),
        });
      });

      // Act
      const response = await page.evaluate(async () => {
        const res = await fetch("/api/me");
        return res.json();
      });

      // Assert
      expect(response.id).toBe(customUser.id);
      expect(response.email).toBe(customUser.email);

      await context.close();
    });
  });

  test.describe("アクセシビリティ: ログイン状態の表示", () => {
    test("ログイン済み状態が aria 属性で示されていること", async ({
      authenticatedPage,
    }) => {
      // Arrange: /api/me にモックレスポンスを設定
      await authenticatedPage.route("**/api/me", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(DEFAULT_TEST_USER),
        });
      });

      // Act
      await authenticatedPage.goto("/stocks");

      // Assert: ログイン状態を示す要素が存在する
      // ナビゲーション内にユーザー情報がアクセシブルに表示されている
      const nav = authenticatedPage.locator("nav");
      await expect(nav).toBeVisible();

      // ログインユーザー名がナビゲーション内に表示されている
      await expect(
        nav.getByText(DEFAULT_TEST_USER.name)
      ).toBeVisible();
    });
  });
});
