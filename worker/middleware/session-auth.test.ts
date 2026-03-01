import { describe, it, expect, vi } from "vitest";
import { sessionAuth } from "./session-auth";

/**
 * T-508: 認証ミドルウェアのユニットテスト
 * 仕様: docs/auth-spec.md セクション 5
 */

const SESSION_SECRET = "a".repeat(64);

// --- ヘルパー ---

/** auth.ts の createSessionCookie と同じロジックで有効なセッション Cookie を生成 */
async function createValidSession(
  uid: string,
  secret: string,
  expOverride?: number,
): Promise<string> {
  const exp = expOverride ?? Math.floor(Date.now() / 1000) + 604800;
  const payload = JSON.stringify({ uid, exp });
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

function createRequest(cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  return new Request("http://localhost/api/stocks", { headers });
}

// ============================================================
// セッション Cookie 検証
// ============================================================
describe("sessionAuth", () => {
  describe("正常系", () => {
    it("有効なセッション Cookie から AuthContext を返す", async () => {
      const session = await createValidSession("user-123", SESSION_SECRET);
      const request = createRequest(`session=${session}`);

      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).not.toBeNull();
      expect(result!.userId).toBe("user-123");
    });
  });

  describe("Cookie 不存在", () => {
    it("session Cookie が無い場合、null を返す", async () => {
      const request = createRequest();
      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).toBeNull();
    });

    it("別名の Cookie のみの場合、null を返す", async () => {
      const request = createRequest("other=value");
      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).toBeNull();
    });
  });

  describe("改ざん検知", () => {
    it("signature を改ざんした場合、null を返す", async () => {
      const session = await createValidSession("user-123", SESSION_SECRET);
      const [payload] = session.split(".");
      const tampered = `${payload}.tampered-signature`;
      const request = createRequest(`session=${tampered}`);

      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).toBeNull();
    });

    it("payload を改ざんした場合、null を返す", async () => {
      const session = await createValidSession("user-123", SESSION_SECRET);
      const [, signature] = session.split(".");
      const fakePayload = btoa(
        JSON.stringify({ uid: "admin", exp: Math.floor(Date.now() / 1000) + 99999 }),
      );
      const tampered = `${fakePayload}.${signature}`;
      const request = createRequest(`session=${tampered}`);

      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).toBeNull();
    });

    it("異なる SESSION_SECRET で署名された Cookie は無効", async () => {
      const session = await createValidSession("user-123", "b".repeat(64));
      const request = createRequest(`session=${session}`);

      const result = await sessionAuth(request, {
        SESSION_SECRET, // "a" で検証
      });

      expect(result).toBeNull();
    });
  });

  describe("有効期限", () => {
    it("exp が過去の場合、null を返す", async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1時間前
      const session = await createValidSession(
        "user-123",
        SESSION_SECRET,
        pastExp,
      );
      const request = createRequest(`session=${session}`);

      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).toBeNull();
    });

    it("exp が未来の場合、有効", async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1時間後
      const session = await createValidSession(
        "user-123",
        SESSION_SECRET,
        futureExp,
      );
      const request = createRequest(`session=${session}`);

      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).not.toBeNull();
      expect(result!.userId).toBe("user-123");
    });
  });

  describe("不正なフォーマット", () => {
    it("ドット区切りでない Cookie 値は null を返す", async () => {
      const request = createRequest("session=invalid-no-dot");
      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).toBeNull();
    });

    it("payload が有効な JSON でない場合、null を返す", async () => {
      const badPayload = btoa("not-json");
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(SESSION_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(badPayload),
      );
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
      const request = createRequest(`session=${badPayload}.${sigB64}`);

      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).toBeNull();
    });

    it("payload に uid が無い場合、null を返す", async () => {
      const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(SESSION_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(payload),
      );
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
      const request = createRequest(`session=${payload}.${sigB64}`);

      const result = await sessionAuth(request, {
        SESSION_SECRET,
      });

      expect(result).toBeNull();
    });
  });
});
