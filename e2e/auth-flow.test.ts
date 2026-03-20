import { test, expect, DEFAULT_TEST_USER } from "./fixtures";

/**
 * T-505: 認証フロー E2E テスト
 *
 * 仕様: docs/auth-spec.md
 *
 * テスト対象:
 * - 未認証 → ログインページリダイレクト
 * - ログインページの表示
 * - ログインボタン → Google 認証 URL へのリダイレクト
 * - ログアウト → ログインページへリダイレクト
 * - 認証済みユーザーが / にアクセス → /stocks にリダイレクト
 */

test.describe("認証フロー E2E テスト", () => {
  test.describe("未認証ユーザーのリダイレクト", () => {
    test("/stocks にアクセスすると /login にリダイレクトされる", async ({
      page,
    }) => {
      // /api/me が 401 を返すようにモック
      await page.route("**/api/me", (route) => {
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "認証が必要です", code: "UNAUTHORIZED" }),
        });
      });

      await page.goto("/stocks");
      await expect(page).toHaveURL(/\/login/);
    });

    test("/stocks/[id] にアクセスすると /login にリダイレクトされる", async ({
      page,
    }) => {
      await page.route("**/api/me", (route) => {
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "認証が必要です", code: "UNAUTHORIZED" }),
        });
      });

      await page.goto("/stocks/some-id");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("ログインページ", () => {
    test("ログインページが正しく表示される", async ({ page }) => {
      // /api/me が 401 を返す（未認証状態）
      await page.route("**/api/me", (route) => {
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "認証が必要です" }),
        });
      });

      await page.goto("/login");

      // ローディングが解除されてログインボタンが表示される
      await expect(page.locator("#login-container")).toBeVisible();
      await expect(page.locator("h1")).toContainText("Slide Stock");
      await expect(
        page.locator('a[href="/api/auth/login"]')
      ).toBeVisible();
    });

    test("Google ログインボタンが /api/auth/login にリンクしている", async ({
      page,
    }) => {
      await page.route("**/api/me", (route) => {
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "認証が必要です" }),
        });
      });

      await page.goto("/login");
      await expect(page.locator("#login-container")).toBeVisible();

      const loginLink = page.locator('a[href="/api/auth/login"]');
      await expect(loginLink).toHaveAttribute("href", "/api/auth/login");
    });

    test("認証済みユーザーは /login から /stocks にリダイレクトされる", async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.route("**/api/me", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(DEFAULT_TEST_USER),
        });
      });

      await authenticatedPage.goto("/login");
      await expect(authenticatedPage).toHaveURL(/\/stocks/);
    });
  });

  test.describe("ログアウトフロー", () => {
    test("ログアウトボタンを押すとログインページにリダイレクトされる", async ({
      authenticatedPage,
    }) => {
      let loggedOut = false;

      // /api/me: ログアウト前は認証済み、後は 401
      await authenticatedPage.route("**/api/me", (route) => {
        if (loggedOut) {
          route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ error: "認証が必要です", code: "UNAUTHORIZED" }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DEFAULT_TEST_USER),
          });
        }
      });

      // /api/stocks に空一覧を返す
      await authenticatedPage.route("**/api/stocks", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], next_cursor: null, has_more: false }),
        });
      });

      // /api/auth/logout: ログアウト状態に切り替え
      await authenticatedPage.route("**/api/auth/logout", (route) => {
        loggedOut = true;
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      });

      // ストック一覧ページにアクセス
      await authenticatedPage.goto("/stocks");
      await expect(
        authenticatedPage.getByText(DEFAULT_TEST_USER.name)
      ).toBeVisible();

      // ログアウトボタンをクリック
      const logoutButton = authenticatedPage.locator("#logout-btn");
      await expect(logoutButton).toBeVisible();

      // ログアウト後は /login にリダイレクトされる
      await Promise.all([
        authenticatedPage.waitForURL(/\/login/),
        logoutButton.click(),
      ]);

      await expect(authenticatedPage).toHaveURL(/\/login/);
    });
  });

  test.describe("トップページ（ランディングページ）", () => {
    test("/ にアクセスするとランディングページが表示される（認証チェックなし）", async ({
      page,
    }) => {
      await page.goto("/");

      // ランディングページの各セクションが表示される
      await expect(page.locator("h1")).toContainText("Slide Stock");
      await expect(page.locator(".hero-description")).toBeVisible();
      await expect(page.locator('a[href="/login"]')).toBeVisible();
      await expect(page.locator('a[href="/stocks"]')).toBeVisible();
    });

    test("ランディングページにプロバイダ情報が表示される", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(page.getByText("SpeakerDeck", { exact: true })).toBeVisible();
      await expect(page.getByText("Docswell", { exact: true })).toBeVisible();
      await expect(page.getByText("Google Slides", { exact: true })).toBeVisible();
    });

    test("ランディングページに使い方セクションが表示される", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(page.getByText("使い方")).toBeVisible();
      await expect(page.getByText("URL を入力")).toBeVisible();
    });
  });
});
