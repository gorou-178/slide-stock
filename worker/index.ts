import { testAuthBypass, type AuthContext } from './middleware/test-auth-bypass';

export interface Env {
  DB: D1Database;
  TEST_MODE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok' });
    }

    // 認証バイパス（テスト環境のみ有効）
    const authContext: AuthContext | null = await testAuthBypass(request, env);

    if (url.pathname === '/api/me') {
      if (!authContext) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return Response.json({
        id: authContext.userId,
        email: authContext.email,
        name: authContext.name,
      });
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
