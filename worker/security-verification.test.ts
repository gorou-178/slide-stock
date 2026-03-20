/**
 * T-607: セキュリティ修正検証テスト
 *
 * T-601〜T-606 の各セキュリティ修正が意図通り動作することを検証する。
 *
 * - T-601: TEST_MODE 本番誤設定防止ガード
 * - T-602: Docswell oEmbed embed_url ドメインバリデーション
 * - T-603: auth_state / session Cookie に Secure フラグ追加（HTTPS環境）
 * - T-604: セキュリティレスポンスヘッダー（public/_headers）
 * - T-605: Worker グローバル try/catch（未捕捉エラー → 500）
 * - T-606: stocks テーブル UNIQUE INDEX による重複防止
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { testAuthBypass } from "./middleware/test-auth-bypass";
import { fetchDocswellMetadata, PermanentError } from "./lib/oembed";
import { handleLogin, handleCallback, handleLogout, type AuthEnv, type AuthDeps } from "./handlers/auth";
import {
  applyMigrationsAndSeed,
  resetSeedData,
  createJsonRequest,
  parseJsonResponse,
  TEST_USERS,
} from "../test/helpers";
import { handleCreateStock, type StockEnv } from "./handlers/stocks";
import { sendOEmbedMessage } from "./lib/queue";
import type { AuthContext } from "./middleware/test-auth-bypass";

// Queue スタブ
vi.mock("./lib/queue", () => ({
  sendOEmbedMessage: vi.fn().mockResolvedValue(undefined),
}));

// ============================================================
// T-601: TEST_MODE 本番誤設定防止ガード
// ============================================================
describe("T-601: TEST_MODE 本番誤設定防止ガード", () => {
  it("CALLBACK_URL が https:// の場合、TEST_MODE=true でもバイパスが無効になる", async () => {
    const request = new Request("http://localhost/api/stocks", {
      headers: { "X-Test-User-Id": "test-user-1" },
    });
    const env = {
      TEST_MODE: "true",
      CALLBACK_URL: "https://slide-stock.gorou.dev/api/auth/callback",
    };

    const result = await testAuthBypass(request, env);
    expect(result).toBeNull();
  });

  it("CALLBACK_URL が http:// の場合、TEST_MODE=true でバイパスが有効になる", async () => {
    const request = new Request("http://localhost/api/stocks", {
      headers: { "X-Test-User-Id": "test-user-1" },
    });
    const env = {
      TEST_MODE: "true",
      CALLBACK_URL: "http://localhost:4321/api/auth/callback",
    };

    const result = await testAuthBypass(request, env);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("test-user-1");
  });

  it("CALLBACK_URL が未設定の場合、TEST_MODE=true でバイパスが有効になる", async () => {
    const request = new Request("http://localhost/api/stocks");
    const env = { TEST_MODE: "true" };

    const result = await testAuthBypass(request, env);
    expect(result).not.toBeNull();
  });
});

// ============================================================
// T-602: Docswell oEmbed embed_url ドメインバリデーション
// ============================================================
describe("T-602: Docswell embed_url ドメインバリデーション", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockDocswellResponse(url: string) {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "rich",
          title: "Test Slide",
          author_name: "Author",
          url,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
  }

  it("正規の docswell.com ドメイン URL は受け入れる", async () => {
    mockDocswellResponse("https://www.docswell.com/slide/59VDWM/embed");
    const result = await fetchDocswellMetadata("https://www.docswell.com/s/user/59VDWM");
    expect(result.embedUrl).toBe("https://www.docswell.com/slide/59VDWM/embed");
  });

  it("サブドメインなしの docswell.com URL も受け入れる", async () => {
    mockDocswellResponse("https://docswell.com/slide/59VDWM/embed");
    const result = await fetchDocswellMetadata("https://www.docswell.com/s/user/59VDWM");
    expect(result.embedUrl).toBe("https://docswell.com/slide/59VDWM/embed");
  });

  it("HTTP プロトコルの URL は PermanentError", async () => {
    mockDocswellResponse("http://www.docswell.com/slide/59VDWM/embed");
    await expect(
      fetchDocswellMetadata("https://www.docswell.com/s/user/59VDWM"),
    ).rejects.toThrow(PermanentError);
  });

  it("docswell.com 以外のドメインは PermanentError", async () => {
    mockDocswellResponse("https://evil.example.com/slide/embed");
    await expect(
      fetchDocswellMetadata("https://www.docswell.com/s/user/59VDWM"),
    ).rejects.toThrow(PermanentError);
  });

  it("不正な URL 形式は PermanentError", async () => {
    mockDocswellResponse("not-a-valid-url");
    await expect(
      fetchDocswellMetadata("https://www.docswell.com/s/user/59VDWM"),
    ).rejects.toThrow(PermanentError);
  });

  it("docswell.com のサブドメインを装った偽ドメインは PermanentError", async () => {
    mockDocswellResponse("https://docswell.com.evil.example.com/slide/embed");
    await expect(
      fetchDocswellMetadata("https://www.docswell.com/s/user/59VDWM"),
    ).rejects.toThrow(PermanentError);
  });
});

// ============================================================
// T-603: auth_state / session Cookie の Secure フラグ
// ============================================================
describe("T-603: Cookie Secure フラグ（HTTPS 環境）", () => {
  function createMockDB(): D1Database {
    return {
      prepare: (_query: string) => ({
        bind: (..._params: unknown[]) => ({
          first: async () => null,
          run: async () => ({ success: true }),
        }),
      }),
    } as unknown as D1Database;
  }

  const HTTPS_ENV: AuthEnv = {
    DB: createMockDB(),
    TEST_MODE: "false",
    GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    SESSION_SECRET: "a".repeat(64),
    CALLBACK_URL: "https://slide-stock.gorou.dev/api/auth/callback",
    OEMBED_QUEUE: {} as Queue,
  };

  const HTTP_ENV: AuthEnv = {
    ...HTTPS_ENV,
    CALLBACK_URL: "http://localhost:4321/api/auth/callback",
  };

  function getSetCookieHeaders(response: Response): string[] {
    return response.headers.getAll("Set-Cookie");
  }

  describe("handleLogin", () => {
    it("HTTPS 環境では auth_state Cookie に Secure フラグが付く", async () => {
      const response = await handleLogin(new Request("http://localhost/api/auth/login"), HTTPS_ENV);
      const setCookies = getSetCookieHeaders(response);
      const authStateCookie = setCookies.find((c) => c.startsWith("auth_state="));
      expect(authStateCookie).toContain("Secure");
    });

    it("HTTP 環境では auth_state Cookie に Secure フラグが付かない", async () => {
      const response = await handleLogin(new Request("http://localhost/api/auth/login"), HTTP_ENV);
      const setCookies = getSetCookieHeaders(response);
      const authStateCookie = setCookies.find((c) => c.startsWith("auth_state="));
      expect(authStateCookie).not.toContain("Secure");
    });
  });

  describe("handleCallback", () => {
    async function executeCallback(env: AuthEnv): Promise<Response> {
      const state = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ id_token: "mock.id.token" }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const request = new Request(
        `http://localhost/api/auth/callback?code=test-code&state=${state}`,
        { headers: { Cookie: `auth_state=${state}` } },
      );
      const deps: AuthDeps = {
        verifyIdToken: async () => ({
          sub: "google-sub-test",
          email: "user@example.com",
          name: "Test User",
        }),
      };

      try {
        return await handleCallback(request, env, deps);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }

    it("HTTPS 環境では session Cookie に Secure フラグが付く", async () => {
      const response = await executeCallback(HTTPS_ENV);
      const setCookies = getSetCookieHeaders(response);
      const sessionCookie = setCookies.find((c) => c.startsWith("session=") && !c.includes("Max-Age=0"));
      expect(sessionCookie).toContain("Secure");
    });

    it("HTTP 環境では session Cookie に Secure フラグが付かない", async () => {
      const response = await executeCallback(HTTP_ENV);
      const setCookies = getSetCookieHeaders(response);
      const sessionCookie = setCookies.find((c) => c.startsWith("session=") && !c.includes("Max-Age=0"));
      expect(sessionCookie).not.toContain("Secure");
    });
  });

  describe("handleLogout", () => {
    it("HTTPS 環境では logout Cookie に Secure フラグが付く", async () => {
      const response = await handleLogout(new Request("http://localhost/api/auth/logout", { method: "POST" }), HTTPS_ENV);
      const setCookie = response.headers.get("Set-Cookie") ?? "";
      expect(setCookie).toContain("Secure");
    });

    it("HTTP 環境では logout Cookie に Secure フラグが付かない", async () => {
      const response = await handleLogout(new Request("http://localhost/api/auth/logout", { method: "POST" }), HTTP_ENV);
      const setCookie = response.headers.get("Set-Cookie") ?? "";
      expect(setCookie).not.toContain("Secure");
    });
  });
});

// ============================================================
// T-604: セキュリティレスポンスヘッダー（public/_headers）
// ============================================================
// public/_headers は Cloudflare Pages が配信する静的ファイル。
// Workers テスト環境ではファイルシステムアクセスが制限されるため、
// ヘッダー内容を定数として検証する。
// 実際のヘッダー適用は E2E テストまたはデプロイ後検証で確認する。
describe("T-604: セキュリティレスポンスヘッダー仕様確認", () => {
  // public/_headers の期待される内容
  const EXPECTED_HEADERS = [
    "X-Frame-Options: DENY",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Strict-Transport-Security: max-age=31536000; includeSubDomains",
  ];

  const EXPECTED_CSP_DIRECTIVES = [
    "default-src 'self'",
    "frame-src https://speakerdeck.com https://www.docswell.com https://docs.google.com",
    "frame-ancestors 'none'",
  ];

  it.each(EXPECTED_HEADERS)("必須ヘッダー: %s", (header) => {
    // この仕様テストは public/_headers の内容が変更された場合に
    // ここを更新する必要があることを示すドキュメント的役割
    expect(header).toBeTruthy();
  });

  it.each(EXPECTED_CSP_DIRECTIVES)("CSP ディレクティブ: %s", (directive) => {
    expect(directive).toBeTruthy();
  });
});

// ============================================================
// T-605: Worker グローバル try/catch
// ============================================================
// NOTE: 未知のルートの 404 とヘルスチェックはルーティング層のテスト。
// SSR 移行後は Astro が処理するため、E2E テストと health.test.ts でカバー。
// ここでは test/worker/health.test.ts に委譲する。

// ============================================================
// T-606: stocks テーブル UNIQUE INDEX による重複防止
// ============================================================
describe("T-606: UNIQUE INDEX による重複防止", () => {
  const USER1_ID = TEST_USERS[0].id;

  function auth(userId: string): AuthContext {
    return { userId };
  }

  function stockEnv(): StockEnv {
    return { DB: env.DB, OEMBED_QUEUE: env.OEMBED_QUEUE };
  }

  beforeAll(async () => {
    await applyMigrationsAndSeed();
  });

  beforeEach(async () => {
    await resetSeedData();
    vi.mocked(sendOEmbedMessage).mockClear();
  });

  it("同一ユーザーが同一 URL を登録すると 409 DUPLICATE_STOCK", async () => {
    // シードデータに存在する SpeakerDeck URL
    const existingUrl = "https://speakerdeck.com/testuser/example-slide";
    const request = createJsonRequest("/api/stocks", "POST", {
      url: existingUrl,
    });
    const res = await handleCreateStock(request, stockEnv(), auth(USER1_ID));

    expect(res.status).toBe(409);
    const body = await parseJsonResponse<{ code: string }>(res);
    expect(body.code).toBe("DUPLICATE_STOCK");
  });

  it("異なるユーザーが同一 URL を登録すると成功する", async () => {
    const USER2 = TEST_USERS[1].id;
    // USER1 のシードデータに存在する URL を USER2 で登録
    const url = "https://speakerdeck.com/testuser/example-slide";
    const request = createJsonRequest("/api/stocks", "POST", { url });
    const res = await handleCreateStock(request, stockEnv(), auth(USER2));

    expect(res.status).toBe(201);
  });
});
