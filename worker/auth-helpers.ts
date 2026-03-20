/**
 * 認証ヘルパー関数
 *
 * worker/index.ts から抽出。Astro API Routes からも再利用可能。
 */

import { testAuthBypass, type AuthContext } from './middleware/test-auth-bypass';
import { sessionAuth } from './middleware/session-auth';

export type { AuthContext };

export interface AuthEnv {
  TEST_MODE?: string;
  SESSION_SECRET: string;
  CALLBACK_URL: string;
}

/** 認証解決: TEST_MODE → testAuthBypass、本番 → sessionAuth */
export async function resolveAuth(
  request: Request,
  env: AuthEnv,
): Promise<AuthContext | null> {
  // テスト環境ではバイパスを優先
  const testAuth = await testAuthBypass(request, env);
  if (testAuth) return testAuth;

  // 本番用セッション Cookie 検証
  return sessionAuth(request, env);
}

export function unauthorized(): Response {
  return Response.json(
    { error: '認証が必要です', code: 'UNAUTHORIZED' },
    { status: 401 },
  );
}
