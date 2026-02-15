/**
 * テスト用認証バイパスミドルウェア
 *
 * 環境変数 TEST_MODE=true の場合のみ有効。
 * Google OIDC ログインを迂回し、テストユーザーとして認証された状態をシミュレートする。
 *
 * セキュリティ:
 * - TEST_MODE は厳密に文字列 "true" のみ許可（大文字・数値は不可）
 * - 本番環境では TEST_MODE を設定しないこと
 * - wrangler.toml には TEST_MODE を含めない（.dev.vars のみ）
 */

/** 認証コンテキスト */
export interface AuthContext {
  userId: string;
  email: string;
  name: string;
}

/** デフォルトのテストユーザー */
export const DEFAULT_TEST_USER = {
  id: "test-user-001",
  email: "test@example.com",
  name: "Test User",
} as const;

/**
 * テスト用トークンを生成する
 * フォーマット: "test-token-{userId}"
 */
export function createTestToken(userId: string): string {
  return `test-token-${userId}`;
}

/**
 * test_session Cookie からユーザーIDを抽出する
 */
function parseTestSessionCookie(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === "test_session" && value?.startsWith("test-token-")) {
      return value.slice("test-token-".length);
    }
  }
  return null;
}

/**
 * 認証バイパスミドルウェア
 *
 * @returns 認証コンテキスト、またはバイパスが無効の場合は null
 */
export async function testAuthBypass(
  request: Request,
  env: Record<string, unknown>
): Promise<AuthContext | null> {
  // 環境変数チェック: 厳密に "true" のみ許可
  if (env.TEST_MODE !== "true") {
    return null;
  }

  // 1. X-Test-User-Id ヘッダーを優先
  const headerUserId = request.headers.get("X-Test-User-Id");
  if (headerUserId) {
    const email =
      request.headers.get("X-Test-User-Email") ?? `${headerUserId}@test.local`;
    const name = request.headers.get("X-Test-User-Name") ?? headerUserId;
    return { userId: headerUserId, email, name };
  }

  // 2. test_session Cookie からユーザーIDを取得
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookieUserId = parseTestSessionCookie(cookieHeader);
    if (cookieUserId) {
      return {
        userId: cookieUserId,
        email: `${cookieUserId}@test.local`,
        name: cookieUserId,
      };
    }
  }

  // 3. ヘッダーも Cookie もない場合、デフォルトテストユーザーを返す
  return {
    userId: DEFAULT_TEST_USER.id,
    email: DEFAULT_TEST_USER.email,
    name: DEFAULT_TEST_USER.name,
  };
}
