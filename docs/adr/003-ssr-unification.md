# ADR-003: SSR統合 — Astro Cloudflare アダプターによる単一Workers構成への移行

## ステータス
Proposed

## コンテキスト

現在のアーキテクチャは以下の三重構成になっている:

1. **Astro static** → Cloudflare Pages（フロントエンド HTML/CSS/JS を配信）
2. **Cloudflare Workers**（API: `worker/index.ts`、手動ルーティング）
3. **Pages Functions**（`functions/api/[[path]].ts` で Workers へプロキシ + `functions/stocks/[id].ts` で詳細ページ配信）

### 現状の課題

| 課題 | 詳細 |
|------|------|
| **三重構成の複雑さ** | Pages + Worker + Pages Functions の3リソースが連携。障害時の切り分けが困難 |
| **二重デプロイ** | `deploy:pages` と `deploy:worker` を別々に実行。デプロイ順序の依存関係あり |
| **プロキシのオーバーヘッド** | `/api/*` リクエストが Pages Functions → Workers と2段階のホップを経由 |
| **WORKER_ORIGIN 環境変数** | Workers の URL を Pages Functions に手動設定。URL 変更時に連動が必要 |
| **dev 環境の乖離** | 開発時は Vite proxy + rewrite middleware、本番は Pages Functions。挙動差異のリスク |
| **動的ルーティングのワークアラウンド** | `/stocks/:id` に Pages Function + ASSETS バインディングの回避策が必要 |

## 選択肢

### A. Astro SSR + @astrojs/cloudflare アダプター（単一Workers構成）
- Astro の `output: 'server'` モードで SSR 化
- `@astrojs/cloudflare` アダプターで単一の Cloudflare Workers にビルド
- API エンドポイントは `src/pages/api/` に Astro API Routes として配置
- 既存の `worker/handlers/`, `worker/middleware/`, `worker/lib/` はそのまま再利用
- Pages Functions・プロキシ・`_redirects` をすべて削除

### B. 現状維持（Static + Workers + Pages Functions）
- 動作実績があり安定
- 三重構成の複雑さは残る

### C. Hono + Workers 統合（Astro SSR なし）
- Workers 側に Hono フレームワークを導入
- フロントエンドは引き続き Astro static + Pages
- API 側のみ改善（プロキシ問題は解決しない）

## 決定
**選択肢 A** を採用。

## 理由

1. **構成の大幅簡素化**: 3リソース → 1リソース。デプロイ・監視・デバッグすべてが単一ターゲット
2. **プロキシ廃止**: API リクエストが直接ハンドラーに到達。レイテンシ低減、障害ポイント削減
3. **既存コード再利用**: handler/middleware/lib のコードは変更なし。Astro API Routes は薄いラッパーのみ
4. **dev 環境と本番の一致**: `astro dev` が Cloudflare Workers ランタイムをエミュレート。Vite proxy が不要に
5. **動的ルーティングの自然な実装**: `/stocks/[id]` が Astro のファイルベースルーティングで直接サポート
6. **Cloudflare Git 連携**: 単一ビルドコマンドで CI/CD が完結

## 設計詳細

### 1. エンドポイント移行マッピング

現在の `worker/index.ts` の手動ルーティングを Astro API Routes に移行する。

| 現在のパス | メソッド | 移行先ファイル | ハンドラー |
|-----------|--------|--------------|----------|
| `/api/health` | GET | `src/pages/api/health.ts` | インライン（`{ status: 'ok' }`） |
| `/api/auth/login` | GET | `src/pages/api/auth/login.ts` | `handleLogin()` |
| `/api/auth/callback` | GET | `src/pages/api/auth/callback.ts` | `handleCallback()` |
| `/api/auth/logout` | POST | `src/pages/api/auth/logout.ts` | `handleLogout()` |
| `/api/me` | GET | `src/pages/api/me.ts` | インライン（DB クエリ） |
| `/api/stocks` | GET, POST | `src/pages/api/stocks/index.ts` | `handleListStocks()`, `handleCreateStock()` |
| `/api/stocks/[id]` | GET, DELETE | `src/pages/api/stocks/[id]/index.ts` | `handleGetStock()`, `handleDeleteStock()` |
| `/api/stocks/[id]/memo` | GET, PUT | `src/pages/api/stocks/[id]/memo.ts` | `handleGetMemo()`, `handlePutMemo()` |

**合計: 11 エンドポイント → 8 ファイル**

### 2. Astro API Route の実装パターン

各 API Route は既存ハンドラーを呼び出す薄いラッパーとする:

```typescript
// src/pages/api/stocks/index.ts
import type { APIRoute } from 'astro';
import type { Env } from '../../../worker/index';
import { resolveAuth } from '../../../worker/auth-helpers';
import { handleCreateStock, handleListStocks } from '../../../worker/handlers/stocks';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Env;
  const auth = await resolveAuth(request, env);
  if (!auth) return unauthorized();
  return handleListStocks(request, env, auth);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Env;
  const auth = await resolveAuth(request, env);
  if (!auth) return unauthorized();
  return handleCreateStock(request, env, auth);
};
```

### 3. astro.config.mjs の変更

```javascript
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,  // dev 環境で D1/Queue バインディングを利用可能に
    },
  }),
});
```

- `output: 'server'` で SSR モードに変更
- Vite proxy 設定を削除（API Routes が同一プロセスで処理）
- stock-detail-rewrite プラグインを削除（`/stocks/[id]` が Astro ルーティングで解決）

### 4. wrangler.toml の簡素化

```toml
name = "slide-stock"
compatibility_date = "2025-02-14"

# Astro SSR ビルド出力を使用
# main は astro build が生成する _worker.js を指す（Cloudflare Pages 統合で自動解決）

[vars]
CALLBACK_URL = "https://slide-stock.gorou.dev/api/auth/callback"

[[d1_databases]]
binding = "DB"
database_name = "slide-stock-db"
database_id = "44ece48f-84d2-4a02-8df4-470f3b2b6e23"

# Queue 設定は T-710/T-711 で廃止予定（本 ADR では維持）
[[queues.producers]]
queue = "oembed-fetch"
binding = "OEMBED_QUEUE"

[[queues.consumers]]
queue = "oembed-fetch"
max_batch_size = 2
max_batch_timeout = 3
max_retries = 3
dead_letter_queue = "oembed-fetch-dlq"
```

変更点:
- `name`: `slide-stock-api` → `slide-stock`（API 専用ではなくなるため）
- `main`: 削除（Cloudflare Pages のビルド出力を使用）
- ルーティングコメント: 削除（プロキシ不要）

### 5. 削除対象ファイル

| ファイル | 理由 |
|---------|------|
| `worker/index.ts` | ルーティングが Astro API Routes に移行 |
| `functions/api/[[path]].ts` | プロキシ不要 |
| `functions/stocks/[id].ts` | Astro の動的ルーティングに置き換え |
| `public/_redirects` | Astro ルーティングで不要 |

### 6. 再利用するコード（変更なし）

| ディレクトリ | 内容 |
|-------------|------|
| `worker/handlers/auth.ts` | OAuth ハンドラー |
| `worker/handlers/stocks.ts` | Stock CRUD ハンドラー |
| `worker/handlers/memo.ts` | Memo ハンドラー |
| `worker/handlers/queue-consumer.ts` | Queue コンシューマー |
| `worker/middleware/session-auth.ts` | セッション認証 |
| `worker/middleware/test-auth-bypass.ts` | テストモードバイパス |
| `worker/lib/provider.ts` | プロバイダー検出 |
| `worker/lib/oembed.ts` | oEmbed クライアント |
| `worker/lib/queue.ts` | Queue メッセージフォーマット |

注: `worker/` ディレクトリの名前は変更しない（テストの import パス維持のため）。

### 7. package.json スクリプト統合

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "wrangler pages dev dist/",
    "deploy": "astro build && wrangler pages deploy dist/",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

変更点:
- `dev:worker`: 削除（`astro dev` が Workers ランタイムをエミュレート）
- `deploy:pages` + `deploy:worker`: `deploy` に統合
- `preview`: `wrangler pages dev` でローカルプレビュー（D1/Queue バインディング付き）
- WORKER_ORIGIN 環境変数: 廃止

### 8. Queue コンシューマーの扱い

Astro SSR 構成では `queue()` ハンドラーのエクスポートが直接サポートされない可能性がある。

**対応方針（2段階）:**
1. **本 ADR（T-701）**: Queue コンシューマーは既存の Worker として維持（wrangler.toml の consumers 設定で同一 Worker が処理）。`@astrojs/cloudflare` が `queue()` エクスポートをサポートしている場合はそのまま統合、未サポートの場合は別途 `_worker.ts` で対応
2. **T-710/T-711**: Queue を廃止し `ctx.waitUntil()` に移行。Queue コンシューマーの問題自体が解消される

→ T-700 の時点では Queue の完全統合は必須ではなく、T-710/T-711 で根本解決する前提。

### 9. ランディングページ（prerender）

`/`（ランディングページ）は API 呼び出しがなく完全静的（ADR-002）。
Astro の `prerender = true` を使用してビルド時に静的 HTML を生成する:

```astro
---
// src/pages/index.astro
export const prerender = true;
---
```

SSR モードでも静的に配信され、パフォーマンスに影響なし。

### 10. 検証戦略（振る舞い保証）

DDD のインフラ層差し替えと同様に、**ドメイン層（handlers/lib/middleware）は変更せず、インフラ層（ルーティング）のみ差し替える**。各フェーズでテストがグリーンの状態を維持する。

#### テスト分類と移行影響

| 分類 | テスト | 件数 | 移行影響 |
|------|--------|------|----------|
| **変更不要** | `provider.test.ts` | 43 | 純粋関数。フレームワーク非依存 |
| **変更不要** | `oembed.test.ts` | 16 | fetch API のみ使用 |
| **変更不要** | `queue-consumer.test.ts` | 13 | `handleQueue()` 直接呼出 |
| **変更不要** | `integration.test.ts` | 9 | ハンドラー間データフロー検証 |
| **変更不要** | E2E 3ファイル | 26 | Astro dev server 前提で記述済み |
| **要リファクタ** | ハンドラーテスト 3ファイル | ~60 | `workerFetch()` → ハンドラー直接呼出に変更 |

#### 課題: `workerFetch()` の依存

現在のハンドラーテスト（`auth.test.ts`, `stocks.test.ts`, `memo.test.ts`）は `workerFetch()` ヘルパー（`test/helpers/request.ts`）を使用している。これは `@cloudflare/vitest-pool-workers` の `SELF.fetch()` で `worker/index.ts` のルーティングを経由するため、`worker/index.ts` 削除後に動作しなくなる。

**対策**: `workerFetch()` を廃止し、ハンドラー関数を直接呼び出すテストに書き換える。テストケース（入力・期待出力）はすべて維持する。

#### フェーズ別の検証ポイント

| フェーズ | 作業 | 検証 |
|---------|------|------|
| **Phase 1** | `workerFetch()` → ハンドラー直接呼出に書き換え | 全ユニットテスト GREEN |
| **Phase 2** | `@astrojs/cloudflare` 導入、`astro.config.mjs` 変更 | ビルド成功 |
| **Phase 3** | `src/pages/api/` に API Routes 作成 | ビルド成功 + `astro dev` 起動確認 |
| **Phase 4** | `worker/index.ts`, `functions/`, `public/_redirects` 削除 | 全ユニットテスト GREEN |
| **Phase 5** | `package.json` スクリプト統合、`wrangler.toml` 簡素化 | ビルド成功 |
| **Phase 6** | E2E テスト実行 | 全 E2E テスト GREEN |

### 11. 移行チェックリスト（T-701 の作業項目）

**Phase 1: テスト基盤の安全化（ルーティング依存を除去）**
1. [ ] `resolveAuth()` と `unauthorized()` を `worker/index.ts` から共有モジュールに抽出
2. [ ] ハンドラーテストを `workerFetch()` → ハンドラー直接呼出に書き換え
3. [ ] 全ユニットテスト GREEN を確認 → commit

**Phase 2: Astro SSR 基盤構築**
4. [ ] `@astrojs/cloudflare` をインストール
5. [ ] `astro.config.mjs` を SSR モードに変更（dev proxy・rewrite middleware 削除）
6. [ ] ビルド成功を確認 → commit

**Phase 3: API Routes 作成**
7. [ ] `src/pages/api/` に Astro API Routes を作成（既存ハンドラーの薄いラッパー）
8. [ ] ランディングページ・404・エラーページに `prerender = true` を設定
9. [ ] ビルド成功 + 全ユニットテスト GREEN → commit

**Phase 4: 旧インフラ層の削除**
10. [ ] `worker/index.ts` を削除
11. [ ] `functions/` ディレクトリを削除
12. [ ] `public/_redirects` を削除
13. [ ] 全ユニットテスト GREEN → commit

**Phase 5: 構成の統合**
14. [ ] `wrangler.toml` を簡素化
15. [ ] `package.json` スクリプトを統合
16. [ ] ビルド成功 → commit

**Phase 6: E2E 検証**
17. [ ] E2E テスト実行、全 GREEN を確認
18. [ ] WORKER_ORIGIN 環境変数を Cloudflare ダッシュボードから削除（デプロイ後）

## リスクと緩和策

| リスク | 影響 | 緩和策 |
|-------|------|--------|
| `@astrojs/cloudflare` が Queue handler をサポートしない | Queue 処理が動作しない | T-710/T-711 で Queue 自体を廃止予定。一時的に別 Worker として維持も可 |
| SSR 化による初回レスポンス遅延 | ランディングページのパフォーマンス低下 | `prerender = true` で静的ページはビルド時生成 |
| 既存テストの import パス変更 | テストが壊れる | `worker/` ディレクトリは維持、API Route のラッパーのみ新規追加 |
| Cloudflare Git 連携の設定変更 | 自動デプロイが壊れる | ビルドコマンドを `astro build` に変更、出力ディレクトリを `dist/` に設定 |

## 影響

- **フロントエンド**: `src/pages/` の各 `.astro` ファイルに `prerender` 設定を追加
- **API**: `src/pages/api/` に 8 ファイルを新規作成（既存ハンドラーのラッパー）
- **インフラ**: デプロイコマンド統合、WORKER_ORIGIN 廃止
- **開発体験**: ターミナル1つで `astro dev` のみで開発可能に
- **テスト**: 既存ユニットテストは変更なし。E2E テストのベース URL 設定のみ確認
