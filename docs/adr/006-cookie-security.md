# ADR-006: Cookie セキュリティ強化 — `__Host-` prefix 付与・Path 最小化・Max-Age 環境変数化

## ステータス
Proposed

## コンテキスト

### 現状の Cookie 設定（`worker/handlers/auth.ts`）

| Cookie | Path | Max-Age | Secure | Prefix |
|--------|------|---------|--------|--------|
| `auth_state` | `/api` | 300（固定） | CALLBACK_URL が https のみ | なし（本 ADR で `__Host-` 付与を決定） |
| `session` | `/api` | 604800（固定） | CALLBACK_URL が https のみ | なし |

読み取り箇所:
- `worker/middleware/session-auth.ts:18` — `name.trim() === "session"` でハードコード

### 問題点

| 問題 | 詳細 |
|------|------|
| **`__Host-` prefix なし** | サブドメイン経由で Cookie が上書き・窃取されるリスクが残る |
| **`session` の Path が `/api`** | `__Host-` 適用時は `Path=/` が RFC 6265bis 上の必須要件。現行のままでは `__Host-` を付与できない |
| **`auth_state` の Path が `/api`** | コールバック（`/api/auth/callback`）以外にも送信される。最小スコープに絞れていない |
| **Max-Age ハードコード** | セッション寿命を運用で調整できない |
| **Secure が CALLBACK_URL 依存** | `__Host-` prefix は Secure 必須のため、条件分岐で Secure を省略する現行方式と矛盾する |

## 決定

以下の変更を採用する。

### 1. セッション Cookie に `__Host-` prefix を付与

Cookie 名を `session` → `__Host-session` に変更する。

`__Host-` prefix（RFC 6265bis）を付与することで、以下が保証される:
- `Secure` 属性の必須化
- `Domain` 属性の禁止（スコープをホスト名に限定）
- `Path=/` の強制（ブラウザが強制適用）

### 1-bis. auth_state Cookie に `__Host-` prefix を付与

Cookie 名を `auth_state` → `__Host-auth_state` に変更する。

`__Host-` prefix（RFC 6265bis）を付与することで、以下が保証される:
- `Secure` 属性の必須化
- `Domain` 属性の禁止（スコープをホスト名に限定）
- `Path=/` の強制（ブラウザが強制適用）

`auth_state` は OAuth CSRF 防止用の短命トークン（Max-Age=300）であり、`session` と同様にサブドメイン経由の上書き・窃取リスクを排除するため `__Host-` prefix を付与する。

**Path 最小化との整合について:**
当初 `auth_state` の `Path=/api/auth`（コールバックパスへの最小スコープ）も検討できるが、`__Host-` prefix の RFC 6265bis 要件により `Path=/` に強制される。`auth_state` は Max-Age=300 の短命トークンであり、広いパスへの送信リスクは限定的である。ホスト名バインディングによるセキュリティ向上がこのトレードオフを正当化する。

### 2. Path 属性の最小化

| Cookie | Before | After | 理由 |
|--------|--------|-------|------|
| `__Host-session` | `/api` | `/` | `__Host-` prefix の強制要件 |
| `__Host-auth_state`（発行） | `/api` | `/`（`__Host-` prefix 強制） | `__Host-` prefix は RFC 6265bis により `Path=/` を強制する |
| `__Host-auth_state`（削除） | `/api` | `/`（`__Host-` prefix 強制） | 削除時の Path は発行時と一致させる必要がある（不一致だと削除されない） |

### 3. Secure 属性を常時付与

`isSecure` / `securePart` による条件分岐を廃止し、全 Cookie に常時 `Secure` を付与する。

`__Host-` prefix の要件として Secure は必須。ローカル開発（http）では `__Host-session` がブラウザに保存されないが、これは `__Host-` prefix の仕様であり、後方互換不要の方針と合致する。

### 4. `SESSION_MAX_AGE` 環境変数の導入

セッション Cookie の `Max-Age` を環境変数 `SESSION_MAX_AGE` から取得可能にする。

| 項目 | 内容 |
|------|------|
| 変数名 | `SESSION_MAX_AGE` |
| 型 | `string`（秒数） |
| 省略時デフォルト | `604800`（7日） |
| 取得方法 | `Number(env.SESSION_MAX_AGE ?? "604800")` — `parseInt` は `"7d"` → `7` を返しガードをすり抜けるため使用禁止。`Number("7d")` → `NaN` となるため `Number.isFinite(parsed) && parsed > 0` でガードし、失敗時は `604800` にフォールバックする |
| 管理方法 | `vars`（非秘匿設定値のため secrets ではなく vars）|

`auth_state` の Max-Age（300秒）は短命 CSRF token であり、運用調整の需要がないため環境変数化の対象外とする。

### 不採用の選択肢

| 選択肢 | 不採用理由 |
|--------|-----------|
| Secure を CALLBACK_URL 条件分岐で維持 | `__Host-` prefix は Secure 必須のため条件分岐が成立しない |
| `auth_state` の Max-Age も環境変数化 | 300秒の CSRF token の寿命を可変にする運用上の需要がない |

## 実装設計

### Cookie 文字列（変更後）

```
# handleLogin — __Host-auth_state 発行
__Host-auth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=300; Path=/

# handleCallback — __Host-session 発行
__Host-session=${sessionValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}

# handleCallback — __Host-auth_state クリア
__Host-auth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0

# handleLogout — __Host-session クリア
__Host-session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0
```

### 変更対象ファイル

| ファイル | 変更内容 |
|--------|---------|
| `worker/handlers/auth.ts` | ① Cookie 名 `session` → `__Host-session`、② Cookie 名 `auth_state` → `__Host-auth_state`（発行・クリア・参照すべて）、③ `auth_state` の Path を `/`（`__Host-` 強制）に変更、④ `auth_state` クリア時の Path も `/` に変更、⑤ `cookies.get("auth_state")` → `cookies.get("__Host-auth_state")`、⑥ `isSecure` / `securePart` 条件分岐を廃止（常時 Secure）、⑦ `Max-Age` を `SESSION_MAX_AGE` 環境変数から取得、⑧ `createSessionCookie` が `maxAge: number` を引数で受け取り、JWT の `exp` に `Math.floor(Date.now()/1000) + maxAge` を使用するよう変更 |
| `worker/middleware/session-auth.ts` | Cookie 名 `"session"` → `"__Host-session"` に変更（行 18） |
| `worker/types.ts` | `SESSION_MAX_AGE?: string` を `Env` に追加（`AuthEnv extends Env` のため `AuthEnv` への直接追加は不要） |
| `src/env.d.ts` | `SESSION_MAX_AGE?: string` を `Env` に追加 |
| `wrangler.toml` | `SESSION_MAX_AGE` を vars セクションのコメントに記載 |
| `worker/handlers/auth.test.ts` | Cookie 名参照（`auth_state` → `__Host-auth_state`）・属性期待値（Path=/ 等）を新仕様に更新 |
| `worker/middleware/session-auth.test.ts` | Cookie 名参照を `__Host-session` に更新 |

### 注意事項

- **`AuthEnv` への追加は不要**: `worker/handlers/auth.ts:4` で `AuthEnv extends Env` が宣言されている。`SESSION_MAX_AGE` は `worker/types.ts` の `Env` にのみ追加すれば `AuthEnv` は継承により自動取得する。`AuthEnv` に直接追加すると DRY 違反になる
- **Cookie 削除時の Path 一致**: `__Host-auth_state` のクリア処理も `Path=/` に変更する。Path が不一致だと削除されない
- **`Max-Age` と JWT `exp` の同期**: `SESSION_MAX_AGE` は Cookie の `Max-Age` と `createSessionCookie` の JWT `exp` の両方に適用する。`Max-Age` のみを変更すると「Cookie は有効だが JWT が失効」というバグが発生する。`createSessionCookie(userId, secret, maxAge)` のシグネチャで `maxAge` を受け取り、`exp = Math.floor(Date.now()/1000) + maxAge` とすることで両者を必ず同期させる
- **ローカル開発への影響**: Secure 常時付与により、http ローカル環境ではブラウザが `__Host-session`・`__Host-auth_state` を保存しない。対応方針は「ローカル開発環境 HTTPS 化」セクションを参照

## ローカル開発環境 HTTPS 化

### 背景

`__Host-` prefix は Secure 属性必須のため、http ローカル環境では
`__Host-session`・`__Host-auth_state` ともにブラウザに保存されない。

### 採用方針: mkcert によるローカル HTTPS 化

#### セットアップ手順

1. mkcert インストール・CA 登録
   ```
   brew install mkcert
   mkcert -install
   ```
2. ローカル証明書生成（プロジェクトルートで実行）
   ```
   mkcert localhost 127.0.0.1 ::1
   # → localhost+2.pem / localhost+2-key.pem が生成される
   ```
3. wrangler dev を HTTPS で起動
   ```
   wrangler dev --local-protocol=https \
     --https-cert-path=./localhost+2.pem \
     --https-key-path=./localhost+2-key.pem
   ```

#### wrangler.toml への記録

```toml
# ローカル開発: HTTPS 化が必要（__Host- Cookie の Secure 要件）
# wrangler dev --local-protocol=https --https-cert-path=./localhost+2.pem --https-key-path=./localhost+2-key.pem
```

#### 開発フローへの影響

- ブラウザアクセスは `https://localhost` を使用
- ローカル開発時の `CALLBACK_URL` は `https://localhost/api/auth/callback` に設定
- `package.json` に `dev:worker` スクリプトを新規追加（`wrangler dev --local-protocol=https --https-cert-path=./localhost+2.pem --https-key-path=./localhost+2-key.pem`）。既存の `dev` スクリプトは `astro dev` であり wrangler フラグを受け付けないため、別スクリプトとして分離する
- 生成された `.pem` ファイルは `.gitignore` に追加する（機密ではないが生成物はリポジトリに不要）
