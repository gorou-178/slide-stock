import { test, expect } from "./fixtures";

test.describe("トップページ ヘルスチェック", () => {
  test("トップページにアクセスできる", async ({ page }) => {
    const response = await page.goto("/");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
  });

  test("ページタイトルが正しい", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Slide Stock/i);
  });

  test("lang 属性が ja に設定されている", async ({ page }) => {
    await page.goto("/");
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("ja");
  });

  test("viewport メタタグが設定されている", async ({ page }) => {
    await page.goto("/");
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute("content", /width=device-width/);
  });

  test("見出しが表示されている", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
  });
});
