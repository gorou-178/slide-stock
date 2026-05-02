# ADR-009: Spec を SSOT とする原則 + 同期 oEmbed 取得の rollback semantics 採用

## ステータス
Accepted（2026-05-02）

このプロジェクトの正書（canonical）は `docs/*-spec.md`。ADR は断面の意思決定の記録であり、現行仕様を知りたいときは spec を参照する。

## コンテキスト

### きっかけ

2026-05-02、優先タスク監査の中で **spec と実装が大きく乖離している**ことが発覚した:

| 項目 | spec（`docs/oembed-spec.md` v0.0.3.1 / `docs/stock-api-spec.md` v0.0.3.1） | 実装（`worker/handlers/stock-create.ts` / `worker/lib/oembed.ts`、ADR-004 + migration 0003 ベース） |
|------|---|---|
| 取得タイミング | INSERT **前** に oEmbed 取得（fetch-first） | INSERT **後** に oEmbed 取得（optimistic insert） |
| 取得失敗時の API レスポンス | 400 / 502 / 504 + DB ロールバック相当（INSERT しない） | 201 + メタデータ null の stock を残す |
| リトライ | 指数バックオフ 3 回 / 各 3 秒 / 合計 12 秒予算 | リトライなし（1 試行のみ） |
| 1 試行タイムアウト | 3 秒 | 10 秒 |
| `UPSTREAM_*` エラーコード | 5 種類定義 | 一切なし |
| `status` カラム | スキーマに残す（DEFAULT `'ready'`、将来非同期化用） | migration 0003 で物理削除 |

ADR-004（"Proposed"）が「失敗時も stock は残す」「リトライ不要」「status カラム不要」を選んでいたが、その後 spec を rewrites したときに spec 側で別方向（rollback / retry / UPSTREAM_* / status 維持）が記述された。実装は ADR-004 寄り、spec は idealized 版という捻れ。

### 本 ADR で確定する原則

#### 1. spec は SSOT

`docs/*-spec.md` がプロジェクトの canonical な仕様。実装と矛盾した場合は **実装を spec に合わせる**。逆方向（spec を実装の現実に合わせる）は認めない。spec の意味（あるべき姿の宣言）が消えるため。

#### 2. ADR は断面のスナップショット

ADR は「いつ・なぜ・どう決めたか」の歴史記録。古い ADR は背景理解のための副資料として残すが、現在の正解は spec を見る。本 ADR で ADR-004 の一部判断を覆すように、ADR は将来 supersede され得る。

#### 3. spec と実装の乖離を発見したら、impl 側を修正する

監査タスクの正しいフローは「spec を読む → impl と比べる → impl の修正タスクを起票する」。spec を impl に合わせ直すリトロフィットは原則禁止。要件自体が変わったときのみ spec → impl の順で更新する。

## 決定

### 4-1. 上記 3 原則をプロジェクト方針として採用する

`CLAUDE.md` に「spec を SSOT、ADR は断面、impl は spec に追従」を明記する。

### 4-2. 同期 oEmbed 取得の rollback semantics を採用（実装側を spec に揃える）

ADR-004 が選んだ optimistic insert + best-effort を、spec が記述する fetch-first + insert-on-success に切り替える。

具体的には実装を以下に揃える（spec が canonical、実装はこれに追従）:

| 項目 | 値（spec の記述に従う） |
|------|----------------------|
| 取得タイミング | INSERT **前**。重複チェック通過後に oEmbed 取得 |
| 取得失敗時の動作 | INSERT しない（DB ロールバック相当の効果） |
| API レスポンス（成功） | 201 Created + `status='ready'` で完成済み stock |
| API レスポンス（恒久エラー: 404 / 403 / 形式不正） | 400 `UPSTREAM_NOT_FOUND` / `UPSTREAM_FORBIDDEN` / 502 `UPSTREAM_INVALID_RESPONSE` |
| API レスポンス（一時的エラー: リトライ上限到達） | 502 `UPSTREAM_FAILURE` |
| API レスポンス（合計タイムアウト超過） | 504 `UPSTREAM_TIMEOUT` |
| リトライ | 指数バックオフ 3 回（0ms → 500ms → 1500ms）|
| 1 試行タイムアウト | 3 秒（`AbortSignal.timeout(3000)`） |
| 合計タイムアウト予算 | 12 秒（`AbortSignal.timeout(12000)`） |
| `status` カラム | migration 0004 で復活、DEFAULT `'ready'`。MVP では常に `'ready'`。スキーマ上は `pending` / `failed` を許容（将来非同期化用） |

### 不採用の選択肢

| 選択肢 | 不採用理由 |
|--------|----------|
| **A) spec を実装に合わせる（v0.0.3.2 で一度提案）** | spec が SSOT という原則と矛盾。spec の存在価値が消える |
| **B) ハイブリッド（リトライだけ追加、stock 残す方針は維持）** | spec の `UPSTREAM_*` エラー / DB ロールバック / `status` カラムと依然不整合 |
| **C) 現状維持（spec ↔ impl 乖離を放置）** | 新規参加者がどちらを信じるか分からなくなる、テスト追加・新機能実装の判断軸が崩れる |

## 帰結

### 良い面

- spec が現行仕様を表すという原則が運用される
- `UPSTREAM_*` エラーコードが API として返るようになり、UI 側でメッセージ分岐が可能になる
- メタデータ取得失敗時に「壊れた stock」が DB / UI に残らず、ユーザー体験がシンプルになる
- 一時的なネットワーク不調で取れない場合でも 3 回リトライするため、成功率が上がる

### 悪い面 / 受け入れるトレードオフ

- 実装変更が必要（migration 0004、`worker/lib/oembed.ts`、`worker/handlers/stock-create.ts`、`worker/handlers/stocks.ts`、UI の数ファイル、テスト）
- 元 URL のみ価値があるケース（プロバイダ仕様変更で長期間取れない等）でも stock が作れなくなる。代替: ユーザーは同じ URL を再送信して 409 を確認、もしくはプロバイダ側の問題が解消したあと再 POST する
- 旧 ADR-004 が「個人ツールに retry / DLQ は過剰」と書いていたが、retry の指数バックオフ実装自体は本 ADR で採用する。ただし DLQ / Queue は引き続き廃止のまま（同期内 retry のみ）

## 実装計画

実装変更は以下の PR に分割して進める（本 ADR は PR-A）:

| # | スコープ | 依存 | 主な対象 |
|---|---------|------|---------|
| **PR-A（本 PR）** | ADR 整備 | — | `docs/adr/004-*` Superseded、`docs/adr/009-*` 新規、`CLAUDE.md` に SSOT 原則 |
| PR-B | `status` カラム復活 | A | `migrations/0004_restore_status.sql` |
| PR-C | oembed.ts のリトライ + 3 秒タイムアウト | B | `worker/lib/oembed.ts`、`worker/lib/oembed.test.ts` |
| PR-D | stock-create.ts の fetch-first + UPSTREAM_* | B, C | `worker/handlers/stock-create.ts`、`worker/handlers/stocks.test.ts` |
| PR-E | GET ハンドラ + UI のエラー表示更新 | D | `worker/handlers/stocks.ts`、`src/pages/stocks.astro`、`src/pages/stock-detail.astro`、`src/lib/api-client.ts` |

各 PR で `npm test` を緑にしてからマージ。テストは spec の §8.1 P1〜P19（stock-api-spec.md）を網羅する。

## 参照

- spec（canonical）: [`docs/oembed-spec.md`](../oembed-spec.md) §5–§7、[`docs/stock-api-spec.md`](../stock-api-spec.md) §3、[`docs/architecture.md`](../architecture.md)、[`docs/database.md`](../database.md)、[`docs/ui-spec.md`](../ui-spec.md) §5.3.1 / §7.3 / §7.4
- 旧決定: [ADR-004](004-remove-queue.md)（Superseded）
- 関連 migration: `migrations/0001_init.sql`、`migrations/0003_drop_status.sql`（履歴として保持）、`migrations/0004_restore_status.sql`（PR-B で追加予定）
