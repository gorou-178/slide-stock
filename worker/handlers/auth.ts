import { uuidv7 } from "uuidv7";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../types";

export interface AuthEnv extends Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  CALLBACK_URL: string;
}

export interface IdTokenClaims {
  sub: string;
  email: string;
  name: string;
}

/** テスト時に差し替え可能な依存 */
export interface AuthDeps {
  verifyIdToken?: (
    idToken: string,
    clientId: string,
  ) => Promise<IdTokenClaims>;
}

// --- ヘルパー ---

/**
 * 必須環境変数 / Secrets が揃っているかを検証する。
 *
 * Cloudflare Pages の wrangler.toml 設定不備や Secrets 未登録に気づかず、Google に
 * `client_id=undefined` を含む URL を返してしまう事故（CHANGELOG 0.0.7.1）の再発防止。
 *
 * 検証対象は handleLogin と handleCallback の最大公約数（CALLBACK_URL,
 * GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET）。1 つでも欠けたら
 * 500 CONFIG_ERROR を返し、欠けているキー名をサーバーログに残す。
 */
function findMissingAuthEnv(env: AuthEnv): string[] {
  const required: ReadonlyArray<keyof AuthEnv> = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "SESSION_SECRET",
    "CALLBACK_URL",
  ];
  return required.filter((k) => {
    const v = env[k];
    return typeof v !== "string" || v.length === 0;
  }) as string[];
}

function configError(missing: string[], action: string): Response {
  console.error(
    JSON.stringify({
      action: "auth_config_error",
      handler: action,
      missing,
      hint:
        "Cloudflare Pages の Secrets / wrangler.toml [vars] が未設定の可能性。docs/auth-spec.md §9 を参照。",
    }),
  );
  return Response.json(
    {
      error:
        "サーバーの設定に問題があります。管理者にお問い合わせください。",
      code: "CONFIG_ERROR",
    },
    { status: 500 },
  );
}

function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get("Cookie") || "";
  for (const pair of header.split(";")) {
    const [name, ...rest] = pair.split("=");
    if (name) cookies.set(name.trim(), rest.join("=").trim());
  }
  return cookies;
}

async function createSessionCookie(
  userId: string,
  secret: string,
  maxAge: number,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const payload = JSON.stringify({ uid: userId, exp });
  const payloadB64 = btoa(payload);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return `${payloadB64}.${sigB64}`;
}

/** Google ID Token を jose で検証する（デフォルト実装） */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<IdTokenClaims> {
  const JWKS = createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs"),
  );
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  return {
    sub: payload.sub!,
    email: payload["email"] as string,
    name: payload["name"] as string,
  };
}

// --- ハンドラ ---

/**
 * return_to が「同一オリジン内の相対パス」かを検証する。
 * オープンリダイレクト対策として `/` で始まり `//` で始まらないものだけ許容する。
 */
export function isSafeReturnTo(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  // Cookie ヘッダ注入対策。実用上 \r\n が含まれる正当なパスは存在しない
  if (/[\r\n]/.test(value)) return false;
  return true;
}

/**
 * GET /api/auth/login
 * auth-spec.md セクション 3.1
 *
 * ?return_to=<相対パス> を受け取り、検証後に __Host-auth_return_to Cookie に
 * 保存する。callback でこの Cookie を読み、認証完了後のリダイレクト先として使う。
 */
export async function handleLogin(
  request: Request,
  env: AuthEnv,
): Promise<Response> {
  const missing = findMissingAuthEnv(env);
  if (missing.length > 0) {
    return configError(missing, "handleLogin");
  }

  const state = generateState();

  const url = new URL(request.url);
  const rawReturnTo = url.searchParams.get("return_to");
  const returnTo = isSafeReturnTo(rawReturnTo) ? rawReturnTo : null;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", env.CALLBACK_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent");

  const headers = new Headers();
  headers.set("Location", authUrl.toString());
  headers.append(
    "Set-Cookie",
    `__Host-auth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=300; Path=/`,
  );
  if (returnTo) {
    headers.append(
      "Set-Cookie",
      `__Host-auth_return_to=${encodeURIComponent(returnTo)}; HttpOnly; Secure; SameSite=Lax; Max-Age=300; Path=/`,
    );
  }

  return new Response(null, { status: 302, headers });
}

/**
 * GET /api/auth/callback
 * auth-spec.md セクション 3.2
 */
export async function handleCallback(
  request: Request,
  env: AuthEnv,
  deps: AuthDeps = {},
): Promise<Response> {
  const missing = findMissingAuthEnv(env);
  if (missing.length > 0) {
    return configError(missing, "handleCallback");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookies = parseCookies(request);
  const authState = cookies.get("__Host-auth_state");
  if (!authState || authState !== state) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // return_to Cookie（任意）。検証して safe な値だけ最終リダイレクト先に採用する
  let redirectTo = "/";
  const rawReturnTo = cookies.get("__Host-auth_return_to");
  if (rawReturnTo) {
    try {
      const decoded = decodeURIComponent(rawReturnTo);
      if (isSafeReturnTo(decoded)) {
        redirectTo = decoded;
      }
    } catch {
      // decodeURIComponent 失敗時はデフォルトの "/" にフォールバック
    }
  }

  if (!code) {
    return Response.json({ error: "Bad Request" }, { status: 400 });
  }

  let tokenRes: Response;
  try {
    tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.CALLBACK_URL,
        grant_type: "authorization_code",
      }).toString(),
    });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }

  if (!tokenRes.ok) {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }

  const tokenData = (await tokenRes.json()) as { id_token: string };

  const verify = deps.verifyIdToken ?? verifyGoogleIdToken;
  let claims: IdTokenClaims;
  try {
    claims = await verify(tokenData.id_token, env.GOOGLE_CLIENT_ID);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId: string;
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE google_sub = ?",
  )
    .bind(claims.sub)
    .first<{ id: string }>();

  if (existing) {
    userId = existing.id;
    await env.DB.prepare("UPDATE users SET email = ?, name = ? WHERE id = ?")
      .bind(claims.email, claims.name, userId)
      .run();
  } else {
    userId = uuidv7();
    await env.DB.prepare(
      "INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(userId, claims.sub, claims.email, claims.name, new Date().toISOString())
      .run();
  }

  console.log(JSON.stringify({ action: "auth_callback_success", userId }));

  const parsed = Number(env.SESSION_MAX_AGE);
  const maxAge = Number.isFinite(parsed) && parsed > 0 ? parsed : 604800;
  const sessionValue = await createSessionCookie(userId, env.SESSION_SECRET, maxAge);

  const headers = new Headers();
  headers.set("Location", redirectTo);
  headers.append(
    "Set-Cookie",
    `__Host-session=${sessionValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
  );
  headers.append(
    "Set-Cookie",
    "__Host-auth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );
  // return_to Cookie は常に削除（採用したかどうかにかかわらず）
  headers.append(
    "Set-Cookie",
    "__Host-auth_return_to=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );

  return new Response(null, { status: 302, headers });
}

/**
 * POST /api/auth/logout
 * セッション Cookie を削除する
 */
export async function handleLogout(
  _request: Request,
  _env: AuthEnv,
): Promise<Response> {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `__Host-session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
      },
    },
  );
}
