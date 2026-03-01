import { testAuthBypass, type AuthContext } from './middleware/test-auth-bypass';
import { sessionAuth } from './middleware/session-auth';
import { handleLogin, handleCallback, handleLogout } from './handlers/auth';
import {
  handleCreateStock,
  handleListStocks,
  handleGetStock,
  handleDeleteStock,
} from './handlers/stocks';
import { handlePutMemo, handleGetMemo } from './handlers/memo';
import { handleQueue } from './handlers/queue-consumer';

export interface Env {
  DB: D1Database;
  TEST_MODE?: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CALLBACK_URL: string;
  OEMBED_QUEUE: Queue;
}

function unauthorized(): Response {
  return Response.json(
    { error: '認証が必要です', code: 'UNAUTHORIZED' },
    { status: 401 },
  );
}

/** 認証解決: TEST_MODE → testAuthBypass、本番 → sessionAuth */
async function resolveAuth(
  request: Request,
  env: Env,
): Promise<AuthContext | null> {
  // テスト環境ではバイパスを優先
  const testAuth = await testAuthBypass(request, env);
  if (testAuth) return testAuth;

  // 本番用セッション Cookie 検証
  return sessionAuth(request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // --- 非認証エンドポイント ---
    if (pathname === '/api/health') {
      return Response.json({ status: 'ok' });
    }

    // 認証フロー（セッション不要）
    if (pathname === '/api/auth/login' && method === 'GET') {
      return handleLogin(request, env);
    }
    if (pathname === '/api/auth/callback' && method === 'GET') {
      return handleCallback(request, env);
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      return handleLogout(request, env);
    }

    // --- 認証必須エンドポイント ---
    const authContext = await resolveAuth(request, env);

    if (pathname === '/api/me') {
      if (!authContext) return unauthorized();
      // D1 から実際のユーザー情報を取得（session-auth は uid のみ保持）
      const user = await env.DB.prepare(
        'SELECT id, email, name FROM users WHERE id = ?',
      )
        .bind(authContext.userId)
        .first<{ id: string; email: string; name: string }>();
      if (!user) return unauthorized();
      return Response.json(user);
    }

    // Stock API
    if (pathname === '/api/stocks' && method === 'POST') {
      if (!authContext) return unauthorized();
      return handleCreateStock(request, env, authContext);
    }

    if (pathname === '/api/stocks' && method === 'GET') {
      if (!authContext) return unauthorized();
      return handleListStocks(request, env, authContext);
    }

    // /api/stocks/:id 系のルーティング
    const stockIdMatch = pathname.match(/^\/api\/stocks\/([^/]+)$/);
    const memoMatch = pathname.match(/^\/api\/stocks\/([^/]+)\/memo$/);

    if (memoMatch) {
      if (!authContext) return unauthorized();
      const stockId = memoMatch[1];
      if (method === 'PUT') {
        return handlePutMemo(stockId, request, env, authContext);
      }
      if (method === 'GET') {
        return handleGetMemo(stockId, env, authContext);
      }
    }

    if (stockIdMatch) {
      if (!authContext) return unauthorized();
      const stockId = stockIdMatch[1];
      if (method === 'GET') {
        return handleGetStock(stockId, env, authContext);
      }
      if (method === 'DELETE') {
        return handleDeleteStock(stockId, env, authContext);
      }
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleQueue(batch as MessageBatch<any>, env);
  },
} satisfies ExportedHandler<Env>;
