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
 * GET /api/auth/login
 * auth-spec.md セクション 3.1
 */
export async function handleLogin(
  _request: Request,
  env: AuthEnv,
): Promise<Response> {
  const state = generateState();

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
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // 1. state 検証
  const cookies = parseCookies(request);
  const authState = cookies.get("__Host-auth_state");
  if (!authState || authState !== state) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. code 検証
  if (!code) {
    return Response.json({ error: "Bad Request" }, { status: 400 });
  }

  // 3. Token 交換
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

  // 4. ID Token 検証
  const verify = deps.verifyIdToken ?? verifyGoogleIdToken;
  let claims: IdTokenClaims;
  try {
    claims = await verify(tokenData.id_token, env.GOOGLE_CLIENT_ID);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 5. ユーザー upsert（auth-spec.md セクション 6）
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

  // 6. セッション Cookie 発行
  const parsed = Number(env.SESSION_MAX_AGE ?? "604800");
  const maxAge = Number.isFinite(parsed) && parsed > 0 ? parsed : 604800;
  const sessionValue = await createSessionCookie(userId, env.SESSION_SECRET, maxAge);

  const headers = new Headers();
  headers.set("Location", "/");
  headers.append(
    "Set-Cookie",
    `__Host-session=${sessionValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
  );
  headers.append(
    "Set-Cookie",
    "__Host-auth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
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
