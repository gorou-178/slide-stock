# AGENTS.md

SpeakerDeck / Docswell / Google Slides の公開スライドをURL入力のみでストックできる個人向けWebサービス。Cloudflare 基盤。

## Tech stack

- **Frontend**: Astro (TypeScript) → Cloudflare Pages (static output)
- **API**: Cloudflare Workers (`worker/index.ts`)
- **DB**: Cloudflare D1 (SQLite)
- **Queue**: Cloudflare Queues (oEmbed メタデータ非同期取得)
- **Auth**: Google OIDC → HMAC-SHA256 署名 Cookie セッション
- **Test**: Vitest (`@cloudflare/vitest-pool-workers`) + Playwright (E2E)

## Setup

```bash
npm install
npm run db:migrate:local   # D1 ローカルDB初期化
npm run db:seed            # テストデータ投入
```

## Dev servers

フロントエンドと Worker は別プロセスで起動する:

```bash
npm run dev          # Astro dev server (port 4321, /api/* → 8787 にプロキシ)
npm run dev:worker   # Wrangler Worker (port 8787)
```

## Testing

```bash
npm test             # Vitest 単体テスト (Cloudflare Workers pool)
npm run test:watch   # Vitest watch モード
npm run test:e2e     # Playwright E2E (Chromium, port 4321 自動起動)
```

- 単体テストは `worker/**/*.test.ts` に配置（テスト対象と同階層）
- E2E テストは `e2e/` に配置
- テスト設定: `vitest.config.ts`（D1 マイグレーション自動適用）、`wrangler.test.toml`
- CI: PR → main で GitHub Actions 実行

## Project structure

```
src/                    # Astro フロントエンド
  components/           #   .astro コンポーネント
  layouts/              #   BaseLayout.astro
  lib/                  #   api-client.ts (typed fetch ラッパー)
  pages/                #   ルーティング (index, login, stocks, stock-detail)
worker/                 # Cloudflare Workers API
  handlers/             #   auth, stocks, memo, queue-consumer (+テスト)
  lib/                  #   oembed, provider, queue (+テスト)
  middleware/            #   session-auth, test-auth-bypass (+テスト)
  index.ts              #   メインルーター
migrations/             # D1 SQL マイグレーション
e2e/                    # Playwright E2E テスト
docs/                   # 仕様書 (auth-spec, provider-spec, oembed-spec 等)
tasks/                  # タスク管理 (TASKS.md = SSOT)
public/                 # 静的ファイル (_headers, _redirects)
```

## Code style

- TypeScript strict mode (フロントエンド: `astro/tsconfigs/strictest`, Worker: `strict: true`)
- ESNext modules (`"type": "module"`)
- フォーマッタ/リンター: 明示的な設定なし（エディタのデフォルトに従う）
- 関数エクスポートは named export を使用

```typescript
// ✅ Good
export function detectProvider(url: string): Provider | null { ... }
export async function handleGetStocks(req: Request, env: Env, userId: string): Promise<Response> { ... }

// ❌ Bad
export default function(...) { ... }
```

## Git workflow

- コミットメッセージ: `type(scope): description`
  - 例: `feat(stocks): add cursor pagination`, `fix(auth): validate redirect URI`, `test(memo): add upsert test`
- `git push` は人間のみ（エージェントはローカル commit のみ）
- PR → main で CI、main push で Cloudflare へ自動デプロイ

## Do's and Don'ts

### Do
- 小さな単位でコミットする（意味のある差分ごと）
- テストを書いてから実装する（テスト対象と同ディレクトリに `.test.ts`）
- 仕様書は `docs/` を参照する
- `tasks/TASKS.md` を作業指示のSSOTとして扱う

### Don't
- `git push` しない
- `.dev.vars` や Secrets を含むファイルをコミットしない
- `wrangler.toml` の `database_id` に本番値をハードコードしない
- `TEST_MODE` を本番環境で有効にしない（CALLBACK_URL が本番ドメインの場合は自動無効化される）

## Security

- セッション Cookie: `HttpOnly`, `Secure` (HTTPS時), `SameSite=Lax`, HMAC-SHA256 署名
- `auth_state` Cookie にも `Secure` フラグを適用
- oEmbed `embed_url`: ドメインバリデーションあり（`docswell.com` のみ許可）
- iframe: `sandbox="allow-scripts allow-same-origin"` + `loading="lazy"`
- レスポンスヘッダー: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP, HSTS
- stocks テーブル: `UNIQUE INDEX (user_id, canonical_url)` で重複防止

## References

- プロダクト仕様: [CLAUDE.md](CLAUDE.md)
- アーキテクチャ: [docs/architecture.md](docs/architecture.md)
- データモデル: [docs/database.md](docs/database.md)
- タスク運用: [docs/task-workflow.md](docs/task-workflow.md)
- 各機能仕様: `docs/` 配下 (`auth-spec.md`, `provider-spec.md`, `oembed-spec.md`, `stock-api-spec.md`, `memo-api-spec.md`, `ui-spec.md`)
