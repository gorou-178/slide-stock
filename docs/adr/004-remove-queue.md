# ADR-004: Queue 廃止 — Cloudflare Queues から同期 oEmbed 取得への移行

## ステータス
Proposed

## コンテキスト

### 現状のアーキテクチャ

oEmbed メタデータ取得は Cloudflare Queues による非同期処理で実装されている:

```
POST /api/stocks → stock 作成 (pending) → Queue 送信 → 即座に 201 返却
                                            ↓
Queue consumer → oEmbed fetch → DB 更新 (ready/failed)
                                            ↓
フロント: 3秒ごとにポーリング → pending→ready 検知 → カード差し替え
```

関連リソース:
- **Producer**: `worker/handlers/stocks.ts` — `handleCreateStock` → `sendOEmbedMessage()`
- **Consumer**: `worker/handlers/queue-consumer.ts` — `handleQueue()`
- **oEmbed fetch**: `worker/lib/oembed.ts` — プロバイダ別メタデータ取得
- **Queue wrapper**: `worker/lib/queue.ts` — `sendOEmbedMessage()`
- **Worker entry**: `worker/index.ts` — Queue consumer エクスポート
- **Config**: `wrangler.toml` — `queues.producers` / `queues.consumers` / DLQ
- **フロント**: `stocks.astro` — ポーリング (~50行)、pending/failed カード表示分岐

### 課題

| 課題 | 詳細 |
|------|------|
| **過剰な複雑性** | 個人ツールに Queues + DLQ + リトライ + バッチ処理 + ポーリングは過剰 |
| **二重 Worker 構成** | SSR 統合後も Queue consumer のためだけに `worker/index.ts` が残存 |
| **二重デプロイ** | `deploy`（Astro SSR）と `deploy:queue-worker`（Queue consumer）の2つが必要 |
| **ポーリング UX** | クライアントが 3 秒間隔でポーリング（最大2分）。「取得中...」表示が残る |
| **DLQ 運用負荷** | DLQ メッセージの監視・手動処理が必要だが、個人ツールでは事実上放置される |
| **フロント複雑性** | `pending` / `failed` の状態分岐、ポーリングロジック、カード差し替え処理 |

### メタデータ取得の実測特性

oEmbed fetch の所要時間はプロバイダ依存だが、いずれも数秒以内:
- SpeakerDeck: oEmbed JSON fetch → 通常 1-2 秒
- Docswell: oEmbed JSON fetch → 通常 1-2 秒
- Google Slides: HTML fetch + title 抽出 → 通常 1-3 秒

POST リクエスト内で await しても十分許容できる遅延。

## 決定

**同期取得方式を採用する。**

`POST /api/stocks` 内で oEmbed メタデータ取得を await し、
メタデータ込みの完全な stock データをレスポンスとして返す。

```
POST /api/stocks → stock 作成 → oEmbed fetch (await) → DB 更新 → 201 返却（完全データ）
```

Queue / DLQ / consumer / ポーリング / pending 状態を全て廃止。

### 不採用の選択肢

| 選択肢 | 不採用理由 |
|--------|-----------|
| **ctx.waitUntil()** | pending 状態とポーリングが残り、フロント簡素化が限定的 |
| **現状維持（Queue）** | 上記課題がそのまま残る |

## 実装設計

### 1. 処理フロー（After）

```
POST /api/stocks
  ├→ URL 検証・プロバイダ検出・重複チェック（現行通り）
  ├→ stock INSERT (status = 'ready')
  ├→ oEmbed fetch (await)
  │   ├→ 成功: UPDATE stocks SET title, embed_url, ...
  │   └→ 失敗: stock は embed なしで存続（title=null, embed_url=null）
  └→ 201 返却（メタデータ込みの完全データ）
```

### 2. エラーハンドリング

oEmbed 取得失敗時も **stock 自体は作成する**。
メタデータが取れない場合でも、元 URL は保持されるため価値がある。

```typescript
// handleCreateStock 内（簡略）
await insertStock(stockId, ...);  // status = 'ready'

let metadata = { title: null, authorName: null, embedUrl: null, thumbnailUrl: null };
try {
  metadata = await fetchMetadataByProvider(provider, canonicalUrl);
  await updateStockMetadata(stockId, metadata, env.DB);
} catch (error) {
  console.error(JSON.stringify({
    action: "oembed_fetch_failed", stockId, provider, error: String(error)
  }));
  // メタデータなしで続行（stock は存続）
}

return Response.json({ id: stockId, title: metadata.title, ... }, { status: 201 });
```

### 3. status フィールドの扱い

| 変更点 | 詳細 |
|--------|------|
| `pending` 状態 | **廃止**。stock は作成時点で常に `ready` |
| `failed` 状態 | **廃止**。oEmbed 失敗時は `ready` だがメタデータが null |
| DB スキーマ | `status` カラムは残す（`DEFAULT 'ready'` に変更）。マイグレーション不要（新規 INSERT で対応） |
| API レスポンス | `status` フィールドは常に `'ready'` を返す |

### 4. バックエンド変更

#### 削除対象

| ファイル | 理由 |
|---------|------|
| `worker/handlers/queue-consumer.ts` | Queue consumer 本体 |
| `worker/handlers/queue-consumer.test.ts` | 対応テスト |
| `worker/lib/queue.ts` | Queue send ラッパー |
| `worker/index.ts` | Queue consumer エクスポート（唯一の用途） |
| `wrangler.toml` の `queues.*` セクション | Queue / DLQ 設定 |

#### 変更対象

| ファイル | 変更内容 |
|---------|---------|
| `worker/handlers/stocks.ts` | `handleCreateStock` 内で oEmbed fetch を await。`sendOEmbedMessage` 削除。`StockEnv` から `OEMBED_QUEUE` 除去。INSERT 時の status を `'ready'` に変更 |
| `worker/types.ts` | `OEMBED_QUEUE: Queue` を削除 |
| `src/env.d.ts` | `OEMBED_QUEUE: Queue` を削除 |
| `src/pages/api/stocks/index.ts` | `OEMBED_QUEUE` 不要に伴う簡素化 |
| `package.json` | `deploy:queue-worker` スクリプト削除 |
| `wrangler.toml` | Queue 設定全削除、`name` を `slide-stock` に変更 |

### 5. フロントエンド変更

#### `src/lib/api-client.ts`
- `StockItem.status` フィールド: `'ready'` 固定（型は残すが `pending`/`failed` を除去可）

#### `src/pages/stocks.astro` — 大幅簡素化
削除:
- ポーリング関連（~50行）: `pendingStockIds`, `pollTimer`, `pollCount`, `pollPendingStocks()`, `startPolling()`, `stopPolling()`, `updateStockCard()`, `POLL_INTERVAL_MS`, `MAX_POLL_COUNT`
- `createStockCard` 内の `pending` / `failed` 分岐: 常にリンク付きタイトルを表示
- URL 送信後の `pendingStockIds.add()` / `startPolling()` 呼び出し

結果: タイトルは常に `stock.title || 'タイトルなし'` のリンクを表示

#### `src/pages/stocks/[id].astro` + `src/pages/stock-detail.astro`
削除:
- `stock.status === 'pending'` / `stock.status === 'failed'` の条件分岐
- `stock-card-pending` / `stock-card-failed` クラス付与

結果: タイトルは常に `stock.title || 'タイトルなし'`

#### `public/styles/global.css`
削除:
- `.stock-card-pending` スタイル（3行）
- `.stock-card-failed` スタイル（2行）

### 6. テスト変更

| テスト | 変更内容 |
|-------|---------|
| `worker/handlers/queue-consumer.test.ts` | **削除** |
| `worker/handlers/stocks.test.ts` | `handleCreateStock` テストを更新: Queue 送信検証 → メタデータ取得 + DB 更新の検証に変更。oEmbed の vi.mock で成功/失敗をテスト |
| `worker/handlers/integration.test.ts` | Queue 処理を削除。`handleCreateStock` が直接メタデータ込みで返すことを検証 |
| `worker/security-verification.test.ts` | `StockEnv` 変更に追従（`OEMBED_QUEUE` 除去） |

### 7. 移行フェーズ

| Phase | 内容 | テストゲート |
|-------|------|------------|
| **Phase 1** | `handleCreateStock` 内で oEmbed fetch を同期実行に変更。Queue 送信を削除。stocks.test.ts / integration.test.ts 更新 | ユニットテスト GREEN |
| **Phase 2** | Queue consumer / worker/index.ts / queue.ts 削除。security-verification.test.ts 更新 | 全テスト GREEN |
| **Phase 3** | wrangler.toml / types / env.d.ts / package.json 整理 | ビルド成功 + テスト GREEN |
| **Phase 4** | フロントエンド簡素化: ポーリング削除、pending/failed 分岐削除、CSS 整理 | ビルド成功 |
| **Phase 5** | E2E テスト実行・修正 | 全 E2E GREEN |
