import type { AuthContext } from "./test-auth-bypass";

/**
 * 本番用認証ミドルウェア — HMAC-SHA256 署名 Cookie 検証
 * auth-spec.md セクション 5.5
 *
 * MVP ではペイロードの uid を信頼し、D1 クエリは省略する（セクション 5.5 注記）。
 */
export async function sessionAuth(
  request: Request,
  env: { SESSION_SECRET: string },
): Promise<AuthContext | null> {
  // 1. Cookie "session" を取得
  const cookieHeader = request.headers.get("Cookie") || "";
  let sessionValue: string | undefined;
  for (const pair of cookieHeader.split(";")) {
    const [name, ...rest] = pair.split("=");
    if (name.trim() === "__Host-session") {
      sessionValue = rest.join("=").trim();
      break;
    }
  }

  if (!sessionValue) return null;

  // 2. {payload}.{signature} に分離
  const dotIndex = sessionValue.indexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = sessionValue.substring(0, dotIndex);
  const signatureB64 = sessionValue.substring(dotIndex + 1);

  // 3. HMAC-SHA256 署名を検証
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signatureBytes = Uint8Array.from(atob(signatureB64), (c) =>
      c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(payloadB64),
    );

    if (!valid) return null;
  } catch {
    return null;
  }

  // 4. payload をデコード
  let payload: { uid?: string; exp?: number };
  try {
    payload = JSON.parse(atob(payloadB64));
  } catch {
    return null;
  }

  if (!payload.uid || !payload.exp) return null;

  // 5. 有効期限チェック
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  // 6. AuthContext を返す（MVP: uid を信頼、D1 クエリ省略）
  return {
    userId: payload.uid,
    email: "",
    name: "",
  };
}
