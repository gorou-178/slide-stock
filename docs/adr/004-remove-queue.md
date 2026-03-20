# ADR-004: Queue 廃止 — Cloudflare Queues から ctx.waitUntil() への移行

## ステータス
Proposed

## コンテキスト

### 現状のアーキテクチャ

oEmbed メタデータ取得は Cloudflare Queues による非同期処理で実装されている:

```
POST /api/stocks → stock 作成 (pending) → Queue 送信
                                            ↓
Queue consumer → oEmbed fetch → DB 更新 (ready/failed)
```

関連リソース:
- **Producer**: `worker/handlers/stocks.ts` — `handleCreateStock` → `sendOEmbedMessage()`
- **Consumer**: `worker/handlers/queue-consumer.ts` — `handleQueue()`
- **oEmbed fetch**: `worker/lib/oembed.ts` — プロバイダ別メタデータ取得
- **Queue wrapper**: `worker/lib/queue.ts` — `sendOEmbedMessage()`
- **Worker entry**: `worker/index.ts` — Queue consumer エクスポート（fetch ルーター削除済み）
- **Config**: `wrangler.toml` — `queues.producers` / `queues.consumers` / DLQ

### 課題

| 課題 | 詳細 |
|------|------|
| **過剰な複雑性** | 個人ツールに Queues + DLQ + リトライ + バッチ処理は過剰 |
| **二重 Worker 構成** | SSR 統合（ADR-003）後も Queue consumer のためだけに `worker/index.ts` が残存 |
| **二重デプロイ** | `deploy`（Astro SSR）と `deploy:queue-worker`（Queue consumer）の2つが必要 |
| **ポーリング UX** | クライアントが pending → ready への遷移を 3 秒間隔でポーリング（最大2分） |
| **DLQ 運用負荷** | DLQ メッセージの監視・手動処理が必要だが、個人ツールでは事実上放置される |

### メタデータ取得の実測特性

oEmbed fetch の所要時間はプロバイダ依存だが、いずれも数秒以内:
- SpeakerDeck: oEmbed JSON fetch（1 回）→ 通常 1-2 秒
- Docswell: oEmbed JSON fetch（1 回）→ 通常 1-2 秒
- Google Slides: HTML fetch + title 抽出（1 回、失敗しても embed_url は確定的）→ 通常 1-3 秒

`ctx.waitUntil()` の 30 秒制限内に十分収まる。

## 選択肢

### A. ctx.waitUntil() によるインライン非同期処理（採用）

- `POST /api/stocks` のレスポンス返却後に `ctx.waitUntil()` でメタデータ取得を実行
- Queue / DLQ / consumer を全削除
- 単一 Worker（Astro SSR）のみでデプロイ

**利点**: 構成の大幅簡素化、デプロイ統一、ポーリング UX 改善の余地
**欠点**: 自動リトライ喪失（30 秒制限、retry 機構なし）

### B. 現状維持（Queue 継続）

**利点**: リトライ・DLQ が使える
**欠点**: 上記課題がそのまま残る。個人ツールでは過剰

### C. レスポンス前に同期取得（await）

- `handleCreateStock` 内で oEmbed fetch を `await` し、ready 状態で返す
- ポーリング不要になる

**利点**: 最もシンプル、status フィールド不要
**欠点**: レスポンスが 1-3 秒遅延。UX 低下

## 決定

**選択肢 A** を採用する。

理由:
1. 個人ツールにおいて Queue のリトライ・DLQ は実質不要
2. `ctx.waitUntil()` は Cloudflare Workers の標準 API で十分信頼性がある
3. Worker 構成が SSR 単一に統合され、デプロイ・運用が大幅に簡素化される
4. oEmbed fetch は 30 秒制限に対して十分なマージンがある

## 実装設計

### 1. 処理フロー（After）

```
POST /api/stocks → stock 作成 (pending) → Response 201 返却
                                            ↓ (ctx.waitUntil)
                            oEmbed fetch → DB 更新 (ready/failed)
```

### 2. 関数の責務分離

```
src/pages/api/stocks/index.ts   ← オーケストレーター（ctx.waitUntil 呼び出し）
worker/handlers/stocks.ts       ← stock CRUD（Queue 送信を削除）
worker/lib/oembed-background.ts ← NEW: バックグラウンド処理関数
worker/lib/oembed.ts            ← プロバイダ別メタデータ取得（変更なし）
```

#### `worker/lib/oembed-background.ts`（新規）

Queue consumer の `processMessage` + `markStockFailed` ロジックを抽出:

```typescript
import { fetchSpeakerDeckMetadata, fetchDocswellMetadata,
         fetchGoogleSlidesMetadata, PermanentError } from "./oembed";

export async function fetchAndSaveMetadata(
  stockId: string, canonicalUrl: string,
  provider: string, db: D1Database
): Promise<void> {
  try {
    const metadata = await fetchMetadataByProvider(provider, canonicalUrl);
    await db.prepare(
      `UPDATE stocks SET title=?, author_name=?, embed_url=?,
       thumbnail_url=?, status='ready', updated_at=? WHERE id=?`
    ).bind(metadata.title, metadata.authorName, metadata.embedUrl,
           metadata.thumbnailUrl, new Date().toISOString(), stockId).run();
    console.log(JSON.stringify({ action: "oembed_success", stockId, provider }));
  } catch (error) {
    if (error instanceof PermanentError) {
      console.error(JSON.stringify({
        action: "oembed_permanent_error", stockId, provider, error: error.message
      }));
    } else {
      console.error(JSON.stringify({
        action: "oembed_transient_error", stockId, provider, error: String(error)
      }));
    }
    await db.prepare(
      "UPDATE stocks SET status='failed', updated_at=? WHERE id=?"
    ).bind(new Date().toISOString(), stockId).run();
  }
}
```

#### API Route の変更（`src/pages/api/stocks/index.ts`）

```typescript
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const ctx = locals.runtime.ctx;
  const authContext = await resolveAuth(request, env);
  if (!authContext) return unauthorized();

  const response = await handleCreateStock(request, env, authContext);

  if (response.status === 201) {
    const body = await response.clone().json();
    ctx.waitUntil(
      fetchAndSaveMetadata(body.id, body.canonical_url, body.provider, env.DB)
    );
  }

  return response;
};
```

### 3. エラーハンドリング方針

| エラー種別 | 現状（Queue） | 移行後（waitUntil） |
|-----------|-------------|-------------------|
| PermanentError（404/403 等） | ack + status=failed | status=failed（同じ） |
| 一時エラー（500/timeout） | retry（最大3回） | status=failed + ログ |
| 30 秒超過 | N/A（Queue は制限なし） | キャンセル + status=pending のまま |

**一時エラーのリトライ喪失について**: 個人ツールでは「削除→再登録」で十分リカバリ可能。将来的に UI に「再取得」ボタンを追加する選択肢もあるが、現時点では不要。

### 4. 削除対象

| ファイル | 理由 |
|---------|------|
| `worker/handlers/queue-consumer.ts` | Queue consumer 本体 |
| `worker/handlers/queue-consumer.test.ts` | 対応テスト |
| `worker/lib/queue.ts` | Queue send ラッパー |
| `worker/index.ts` | Queue consumer エクスポート（唯一の用途） |
| `wrangler.toml` の `queues.*` セクション | Queue / DLQ 設定 |

### 5. 変更対象

| ファイル | 変更内容 |
|---------|---------|
| `worker/handlers/stocks.ts` | `sendOEmbedMessage` 呼び出しを削除、`StockEnv` から `OEMBED_QUEUE` 除去 |
| `worker/lib/oembed-background.ts` | 新規: バックグラウンドメタデータ取得関数 |
| `src/pages/api/stocks/index.ts` | `ctx.waitUntil()` でバックグラウンド処理を起動 |
| `worker/types.ts` | `OEMBED_QUEUE: Queue` を削除 |
| `src/env.d.ts` | `OEMBED_QUEUE: Queue` を削除 |
| `package.json` | `deploy:queue-worker` スクリプト削除 |
| `wrangler.toml` | `name` を `slide-stock` に変更、Queue 設定削除、コメント更新 |

### 6. テスト変更

| テスト | 変更内容 |
|-------|---------|
| `worker/handlers/queue-consumer.test.ts` | **削除** |
| `worker/handlers/stocks.test.ts` | Queue 送信検証を削除。stock 作成の DB 検証のみに |
| `worker/handlers/integration.test.ts` | `handleQueue` → `fetchAndSaveMetadata` に差し替え |
| `worker/lib/oembed-background.test.ts` | 新規: `fetchAndSaveMetadata` のユニットテスト |

#### 統合テストの変更例

```typescript
// Before
const stock = await handleCreateStock(request, stockEnv(), auth("user1"));
await handleQueue(mockBatch([queueMessage]), { DB: env.DB });
const result = await handleGetStock(stockId, stockEnv(), auth("user1"));

// After
const stock = await handleCreateStock(request, stockEnv(), auth("user1"));
await fetchAndSaveMetadata(stockId, canonicalUrl, provider, env.DB);
const result = await handleGetStock(stockId, stockEnv(), auth("user1"));
```

### 7. フロントエンド影響

ポーリングロジック（`stocks.astro` の `pollPendingStocks`）は**変更不要**。
`ctx.waitUntil()` によるバックグラウンド処理は通常 1-3 秒で完了するため、
ポーリング初回（3 秒後）で ready 状態を検出できる見込み。

### 8. 移行フェーズ

| Phase | 内容 | テストゲート |
|-------|------|------------|
| **Phase 1** | `oembed-background.ts` 新規作成 + テスト | 既存テスト GREEN + 新規テスト |
| **Phase 2** | `handleCreateStock` から Queue 送信を削除、`StockEnv` 変更 | stocks.test.ts GREEN |
| **Phase 3** | API Route に `ctx.waitUntil()` 追加 | ビルド成功 |
| **Phase 4** | integration.test.ts を `fetchAndSaveMetadata` に移行 | 統合テスト GREEN |
| **Phase 5** | Queue consumer / worker/index.ts / queue.ts 削除 | 全テスト GREEN |
| **Phase 6** | wrangler.toml / types / env.d.ts / package.json 整理 | ビルド + 全テスト GREEN |
| **Phase 7** | E2E テスト実行 | 全 E2E GREEN |

### 9. ロールバック計画

- 全変更は単一ブランチで実施し、マージ前にフル検証
- Queue 関連コードは Git 履歴に残るため、必要時に復元可能
- Cloudflare Dashboard の Queue リソース削除は本番デプロイ確認後に実施
