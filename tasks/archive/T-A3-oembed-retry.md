# T-A3 — oembed.ts のリトライ + 3 秒タイムアウト + Google Slides hard failure 化（ADR-009 PR-B）

ADR-009 §実装計画の **PR-B**。`worker/lib/oembed.ts` を spec（`docs/oembed-spec.md` §2〜§6 / `docs/stock-api-spec.md` §3.5）に揃える。fetch-first 化（INSERT 順序の入れ替え）と `UPSTREAM_*` レスポンスのマッピングは PR-C の責務として **本タスクのスコープ外** に置く。

## 前提

- 依存タスク: PR-A（PR #7 / branch `docs/adr-009-spec-ssot`）が main にマージ済みであること
- 分岐元: `main`（PR-A マージ直後）
- 推奨ブランチ名: `feat/T-A3-oembed-retry`
- バージョン: 仕様変更を伴わない実装追従なので **PATCH バンプ**（`0.0.4.0 → 0.0.4.1`）

## ゴール

`worker/lib/oembed.ts` を以下に揃える:

| 項目 | 現状 | 目標（spec） |
|------|------|------------|
| リトライ | なし（1 試行） | 指数バックオフ 3 回（0ms → 500ms → 1500ms） |
| 1 試行タイムアウト | 10 秒（内部 `setTimeout`） | 3 秒（`AbortSignal.timeout(3000)`） |
| 合計タイムアウト予算 | なし | 12 秒（`AbortSignal.timeout(12000)`） |
| fetcher のシグネチャ | `(canonicalUrl)` | `(canonicalUrl, signal)` を受け取り、`fetch` に `signal` を渡す |
| Google Slides 失敗時 | try/catch + `title=null` で続行（軟性失敗） | `PermanentError` / 一般 `Error` を throw（hard failure、ADR-009 §4-5） |
| エラークラス | `PermanentError` のみ | `PermanentError` + `UpstreamFailureError` + `UpstreamTimeoutError` |

## スコープ外（PR-C 以降に回す）

- `worker/handlers/stock-create.ts` の fetch-first 化（INSERT 順序の入れ替え）
- `UPSTREAM_*` HTTP レスポンスへのマッピング
- `UPSTREAM_INVALID_RESPONSE` を返すためのレスポンス検証ロジックを handler 側に持っていく
- UI 側のエラーメッセージ表示（PR-D）

> **設計判断:** PR-B では oembed.ts の関数群が新しいシグネチャ・新しい挙動・新しい例外型を返せる状態にするところまで。handler はまだ旧 API を呼ぶか、新 API を呼びつつ取得失敗時は従来どおり「stock は残してメタデータだけ欠落」にしておく（PR-C で fetch-first 化）。本 PR がデプロイされても本番挙動は変わらない（regression なし）こと。

## やること

### 1. エラークラス追加（`worker/lib/oembed.ts`）

```typescript
/** リトライ不要な恒久的エラー（既存） */
export class PermanentError extends Error { ... }

/** リトライ上限到達（5xx / ネットワーク失敗）の最終エラー */
export class UpstreamFailureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpstreamFailureError";
  }
}

/** 合計タイムアウト予算超過 */
export class UpstreamTimeoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpstreamTimeoutError";
  }
}
```

> handler 側はこれらの `instanceof` で 502 / 504 にマッピングする（PR-C）。

### 2. fetcher シグネチャに `signal` を追加

3 つすべての fetcher を以下に書き換える:

```typescript
export async function fetchSpeakerDeckMetadata(
  canonicalUrl: string,
  signal: AbortSignal,
): Promise<StockMetadata> { ... }

export async function fetchDocswellMetadata(
  canonicalUrl: string,
  signal: AbortSignal,
): Promise<StockMetadata> { ... }

export async function fetchGoogleSlidesMetadata(
  canonicalUrl: string,
  signal: AbortSignal,
): Promise<StockMetadata> { ... }
```

- 内部の `fetch(url)` 呼び出しに `signal` を渡す
- 既存の `fetchWithTimeout` ヘルパーは廃止または `signal` 受け取り型へ作り替え（10 秒の内部 timeout は削除）
- `Response.headers.get("Content-Length")` のサイズチェック（100KB / 500KB）は維持

### 3. Google Slides 軟性失敗の廃止（spec §4.3）

`fetchGoogleSlidesMetadata` を spec §4.3 の `fetchGoogleSlidesTitle` ロジックに置換:

| HTTP / 状況 | 扱い |
|------------|------|
| 200 + 有効な `<title>` | 成功 |
| 200 だが `<title>` タグなし / 抽出後が空文字 | `PermanentError`（"missing or empty title"） |
| 404 | `PermanentError`（"presentation not found"） |
| 401 / 403 | `PermanentError`（"private or access denied"） |
| 5xx | 一般 `Error`（リトライ対象） |
| ネットワーク失敗 / abort | 一般 `Error` または abort を伝搬 |

- 既存の try/catch + `title=null` 経路を**完全に削除**
- `console.warn(google_slides_title_fetch_failed)` ログは削除（hard failure になるため warn ではなく上位の `console.error(oembed_fetch_failed)` で扱う）
- HTTP リクエスト時のヘッダ: `Accept-Language: ja` を付与（spec §4.3 のサンプル準拠）

### 4. `fetchWithRetry` ヘルパー追加

`worker/lib/oembed.ts` に同期内リトライ機構を実装（spec §6.1 のスケルトン準拠）:

```typescript
export async function fetchWithRetry(
  fetcher: (signal: AbortSignal) => Promise<StockMetadata>,
  totalBudgetMs: number = 12_000,
): Promise<StockMetadata> {
  const totalDeadline = AbortSignal.timeout(totalBudgetMs);
  const backoffsMs = [0, 500, 1500];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(backoffsMs[attempt]);
    }
    if (totalDeadline.aborted) {
      throw new UpstreamTimeoutError("total budget exhausted", { cause: lastError });
    }
    try {
      const perAttemptSignal = AbortSignal.any([
        AbortSignal.timeout(3_000),
        totalDeadline,
      ]);
      return await fetcher(perAttemptSignal);
    } catch (err) {
      if (err instanceof PermanentError) throw err;
      // abort 由来かどうかで分岐: 合計予算切れなら UpstreamTimeoutError、それ以外は次の試行へ
      if (totalDeadline.aborted) {
        throw new UpstreamTimeoutError("total budget exhausted", { cause: err });
      }
      lastError = err;
    }
  }
  throw new UpstreamFailureError("max retries exhausted", { cause: lastError });
}
```

`sleep` ヘルパー（`new Promise(r => setTimeout(r, ms))`）も同ファイルに追加。

### 5. provider ディスパッチャは PR-C で追加

spec §5.2 の `fetchProviderMetadata(provider, canonicalUrl, signal)` ディスパッチャは **handler から呼ぶラッパー**なので、PR-C で `stock-create.ts` 側に置く。本 PR では追加しない（fetcher 単体テストは provider 個別関数で書ける）。

### 6. テスト書き換え（`worker/lib/oembed.test.ts`）

#### 既存テストの修正

- すべての fetcher 呼び出しに第 2 引数として `AbortSignal.timeout(3000)` を渡す（または `new AbortController().signal`）
- Google Slides の 3 テスト（403 で stock 残す / network error で stock 残す）を「`PermanentError` または `Error` を throw する」に書き換え

#### 追加テスト（`fetchWithRetry`）

| ID | ケース | 期待値 |
|----|-------|-------|
| R1 | 1 回目で成功 | 1 回しか fetcher が呼ばれない |
| R2 | 1 回目 5xx → 2 回目成功 | fetcher が 2 回呼ばれる、結果は 2 回目のメタデータ |
| R3 | 3 回連続 5xx | `UpstreamFailureError` が throw、`cause` に最後の Error |
| R4 | 1 回目で `PermanentError` | リトライせず即 throw、fetcher は 1 回のみ |
| R5 | 1 回目で abort（タイムアウト相当） → リトライ後成功 | 2 回目で成功（abort 自体は一般 Error 扱い） |
| R6 | 合計予算切れ（fake timer で 12s 経過させる） | `UpstreamTimeoutError` が throw |
| R7 | バックオフ間隔の検証 | 1→2 試行間 500ms、2→3 試行間 1500ms（fake timer で確認） |

`vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` で時間制御。

#### 追加テスト（Google Slides hard failure 化）

| ID | ケース | 期待値 |
|----|-------|-------|
| G1 | 200 + `<title>None</title>`（空に近い、サフィックス除去後が空） | `PermanentError` |
| G2 | 200 だが `<title>` タグなし | `PermanentError` |
| G3 | 404 | `PermanentError` |
| G4 | 403 | `PermanentError` |
| G5 | 500 | 一般 `Error`（`PermanentError` でない） |
| G6 | `Accept-Language: ja` ヘッダが送信されている | `vi.fn()` の引数で検証 |

### 7. 後方互換性

- `worker/handlers/stock-create.ts` は本 PR では触らない（PR-C で書き換え）
- ただし fetcher のシグネチャが変わったため、handler 側で**呼び出しコンパイルエラーが出ない**よう、最低限の追従が必要:
  - handler 内の各 fetcher 呼び出しに `AbortSignal.timeout(12_000)` 等を渡すワンライナー追加で済ませる（fetch-first 化や `UPSTREAM_*` マッピングは PR-C）
  - もしくは `worker/handlers/stock-create.ts` 内の既存 try/catch（メタデータ取得失敗時に warn ログを残して null のまま続行）は **そのまま維持** する。本 PR では「retry できる関数群が用意された」状態にするだけで、handler の挙動は変えない

> **判断:** handler 側に最小の signal 追加だけ入れて、`fetchWithRetry` 経由には PR-C で切り替える。本 PR 単体ではユーザー挙動が変わらないこと（`npm run test` の全テスト緑 + 既存の `stocks.test.ts` がそのまま通る）を CI で担保。

## 受け入れ基準

- [ ] `npm test` 全 pass（既存 stocks.test.ts も含めて）
- [ ] `npm run typecheck`（または `tsc --noEmit`）通る
- [ ] `worker/lib/oembed.ts` で 3 つの fetcher が `signal: AbortSignal` を受け取り、`fetch` に渡している
- [ ] `fetchWithRetry` がエクスポートされ、上記 R1〜R7 のテストが緑
- [ ] Google Slides の軟性失敗ロジックが完全に削除され、G1〜G6 のテストが緑
- [ ] `UpstreamFailureError` / `UpstreamTimeoutError` がエクスポートされている
- [ ] `worker/handlers/stock-create.ts` の本番挙動は変わらない（既存テスト緑）
- [ ] `VERSION` を `0.0.4.1` にバンプ、`CHANGELOG.md` に追記
- [ ] PR 本文は日本語（タイトルは英語の Conventional Commits 形式）

## 検証手順

1. ローカルで `npm test` を回す（fake timer 系のテストが flaky にならないこと）
2. `npm run typecheck`
3. `npm run dev` で開発サーバーを立て、SpeakerDeck / Docswell / Google Slides の URL を 1 つずつ実際に登録 → 既存挙動（成功時は title つきで stock が作成される）を破壊していないことを確認
   - 取得失敗系の挙動は PR-B では変わらないため、本番 URL での失敗ケース検証は PR-C で行う
4. PR 作成後、CI（Cloudflare Pages preview deploy）でも実機確認

## PR テンプレート（参考）

タイトル（英語）:
```
v0.0.4.1 feat(oembed): add exponential backoff retry + 3s timeout + drop Google Slides soft-failure (PR-B)
```

本文（日本語）:
- 概要: ADR-009 PR-B として oembed.ts を spec 準拠に揃える。リトライ・タイムアウト・hard failure 化のみで handler 側は触らない。
- 関連: ADR-009 §4-2 / §4-5、PR #7（PR-A）
- 後続: PR-C（stock-create.ts の fetch-first + `UPSTREAM_*` マッピング）

## 参考

- 仕様: [docs/oembed-spec.md](../docs/oembed-spec.md) §2〜§6、[docs/stock-api-spec.md](../docs/stock-api-spec.md) §3.5
- ADR: [docs/adr/009-spec-ssot-and-sync-rollback.md](../docs/adr/009-spec-ssot-and-sync-rollback.md) §4-2 / §4-5
- 既存実装: [worker/lib/oembed.ts](../worker/lib/oembed.ts)、[worker/lib/oembed.test.ts](../worker/lib/oembed.test.ts)
