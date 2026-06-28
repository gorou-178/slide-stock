import { test, expect, DEFAULT_TEST_USER } from "./fixtures";

const MOCK_STOCK = {
  id: "stock-001",
  original_url: "https://speakerdeck.com/testuser/my-slide",
  canonical_url: "https://speakerdeck.com/testuser/my-slide",
  provider: "speakerdeck",
  title: "テスト用スライド",
  author_name: "Test Author",
  thumbnail_url: "https://example.com/thumb.jpg",
  embed_url: "https://speakerdeck.com/player/abc123",
  memo_text: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
};

const MOCK_STOCK_WITH_MEMO = {
  ...MOCK_STOCK,
  memo_text: "これはテストメモです",
};

function setupMeRoute(page: import("@playwright/test").Page) {
  return page.route("**/api/me", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DEFAULT_TEST_USER),
    });
  });
}

test.describe("スライド登録フロー", () => {
  test("URL を入力してスライドを登録すると一覧に表示される", async ({
    authenticatedPage,
  }) => {
    await setupMeRoute(authenticatedPage);

    await authenticatedPage.route("**/api/stocks", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(MOCK_STOCK),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [],
            next_cursor: null,
            has_more: false,
          }),
        });
      }
    });

    await authenticatedPage.goto("/stocks");

    const urlInput = authenticatedPage.locator("#slide-url");
    const submitBtn = authenticatedPage.locator("#submit-btn");

    await urlInput.fill("https://speakerdeck.com/testuser/my-slide");
    await submitBtn.click();

    await expect(
      authenticatedPage.locator(".stock-card").first()
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText("テスト用スライド")
    ).toBeVisible();
  });

  test("不正な URL を入力するとエラーが表示される", async ({
    authenticatedPage,
  }) => {
    await setupMeRoute(authenticatedPage);

    await authenticatedPage.route("**/api/stocks", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "対応していないURLです",
            code: "UNSUPPORTED_PROVIDER",
          }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [],
            next_cursor: null,
            has_more: false,
          }),
        });
      }
    });

    await authenticatedPage.goto("/stocks");

    const urlInput = authenticatedPage.locator("#slide-url");
    const submitBtn = authenticatedPage.locator("#submit-btn");

    await urlInput.fill("https://example.com/not-a-slide");
    await submitBtn.click();

    const urlError = authenticatedPage.locator("#url-error");
    await expect(urlError).toBeVisible();
    await expect(urlError).not.toBeEmpty();
  });
});

test.describe("一覧表示", () => {
  test("ストック一覧にタイトル・プロバイダ・著者が表示される", async ({
    authenticatedPage,
  }) => {
    await setupMeRoute(authenticatedPage);

    await authenticatedPage.route("**/api/stocks", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [MOCK_STOCK],
          next_cursor: null,
          has_more: false,
        }),
      });
    });

    await authenticatedPage.goto("/stocks");

    const card = authenticatedPage.locator(".stock-card").first();
    await expect(card).toBeVisible();

    await expect(card.getByText("テスト用スライド")).toBeVisible();
    await expect(card.getByText("SpeakerDeck")).toBeVisible();
    await expect(card.getByText("Test Author")).toBeVisible();
  });

  test("詳細へのリンクと元スライドへのリンクが機能する", async ({
    authenticatedPage,
  }) => {
    await setupMeRoute(authenticatedPage);

    await authenticatedPage.route("**/api/stocks", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [MOCK_STOCK],
          next_cursor: null,
          has_more: false,
        }),
      });
    });

    await authenticatedPage.goto("/stocks");

    const card = authenticatedPage.locator(".stock-card").first();

    const detailLink = card.getByText("詳細を見る");
    await expect(detailLink).toHaveAttribute(
      "href",
      `/stocks/${MOCK_STOCK.id}`
    );

    const extLink = card.getByText("元のスライドを開く");
    await expect(extLink).toHaveAttribute("href", MOCK_STOCK.original_url);
    await expect(extLink).toHaveAttribute("target", "_blank");
  });

  test("ストックが無い場合は空状態が表示される", async ({
    authenticatedPage,
  }) => {
    await setupMeRoute(authenticatedPage);

    await authenticatedPage.route("**/api/stocks", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          next_cursor: null,
          has_more: false,
        }),
      });
    });

    await authenticatedPage.goto("/stocks");

    const emptyState = authenticatedPage.locator("#stock-empty");
    await expect(emptyState).toBeVisible();
  });
});

test.describe("メモ機能", () => {
  test("メモを入力して保存できる", async ({ authenticatedPage }) => {
    await setupMeRoute(authenticatedPage);

    await authenticatedPage.route(`**/api/stocks/${MOCK_STOCK.id}`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_STOCK),
        });
      } else {
        route.continue();
      }
    });

    await authenticatedPage.route(
      `**/api/stocks/${MOCK_STOCK.id}/memo`,
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "memo-001",
            stock_id: MOCK_STOCK.id,
            memo_text: "新しいメモ",
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-01T00:00:00.000Z",
          }),
        });
      }
    );

    await authenticatedPage.goto(`/stocks/${MOCK_STOCK.id}`);

    await expect(
      authenticatedPage.locator("#detail-content")
    ).toBeVisible();

    const memoTextarea = authenticatedPage.locator("#memo-text");
    const saveBtn = authenticatedPage.locator("#memo-save-btn");

    await memoTextarea.fill("新しいメモ");
    await saveBtn.click();

    await expect(authenticatedPage.getByText("保存しました")).toBeVisible();
  });

  test("既存メモがテキストエリアに表示される", async ({
    authenticatedPage,
  }) => {
    await setupMeRoute(authenticatedPage);

    await authenticatedPage.route(`**/api/stocks/${MOCK_STOCK.id}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_STOCK_WITH_MEMO),
      });
    });

    await authenticatedPage.goto(`/stocks/${MOCK_STOCK.id}`);

    await expect(
      authenticatedPage.locator("#detail-content")
    ).toBeVisible();

    const memoTextarea = authenticatedPage.locator("#memo-text");
    await expect(memoTextarea).toHaveValue("これはテストメモです");
  });
});

test.describe("スライド削除", () => {
  test("削除ボタンを押すと確認後に削除され一覧に戻る", async ({
    authenticatedPage,
  }) => {
    await setupMeRoute(authenticatedPage);

    await authenticatedPage.route(`**/api/stocks/${MOCK_STOCK.id}`, (route) => {
      if (route.request().method() === "DELETE") {
        route.fulfill({ status: 204 });
      } else {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_STOCK),
        });
      }
    });

    authenticatedPage.on("dialog", (dialog) => dialog.accept());

    await authenticatedPage.goto(`/stocks/${MOCK_STOCK.id}`);

    await expect(
      authenticatedPage.locator("#detail-content")
    ).toBeVisible();

    const deleteBtn = authenticatedPage.locator("#delete-btn");
    await deleteBtn.click();

    await expect(authenticatedPage).toHaveURL(/\/stocks$/);
  });
});
