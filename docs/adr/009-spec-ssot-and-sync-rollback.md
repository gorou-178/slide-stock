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

ADR-004（"Proposed"）が「失敗時も stock は残す」「リトライ不要」を選んでいたが、その後 spec を rewrite したときに spec 側で別方向（rollback / retry / UPSTREAM_*）が記述された。実装は ADR-004 寄り、spec は idealized 版という捻れ。

加えて `status` カラムについても捻れがあった。当初 spec は「将来非同期化用にスキーマに残す」、実装は migration 0003 で物理削除済み。本 ADR ではレビューの結果、**現時点で意味のないカラムは持たない**（YAGNI）方針を採り、spec / 実装ともに `status` カラム不在で揃える（次節 4-2 / 4-3）。

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

ADR-004 が選んだ optimistic insert + best-effort を、spec が記述する fetch-first + insert-on-success に切り替える。**目標: 異常系で半端なデータが DB に残らない。**

具体的には実装を以下に揃える（spec が canonical、実装はこれに追従）:

| 項目 | 値（spec の記述に従う） |
|------|----------------------|
| 取得タイミング | INSERT **前**。重複チェック通過後に oEmbed 取得 |
| 取得失敗時の動作 | INSERT しない（明示的 ROLLBACK 不要、INSERT が発行されないため自然と何も書かれない） |
| API レスポンス（成功） | 201 Created + 完成済み stock（`title` / `author_name` / `embed_url` 充足） |
| API レスポンス（恒久エラー: 404 / 403 / 形式不正） | 400 `UPSTREAM_NOT_FOUND` / `UPSTREAM_FORBIDDEN` / 502 `UPSTREAM_INVALID_RESPONSE` |
| API レスポンス（一時的エラー: リトライ上限到達） | 502 `UPSTREAM_FAILURE` |
| API レスポンス（合計タイムアウト超過） | 504 `UPSTREAM_TIMEOUT` |
| API レスポンス（並列レースで UNIQUE 制約違反） | 409 `DUPLICATE_STOCK`（後勝ちの INSERT を catch、§4-4） |
| API レスポンス（D1 INSERT 自体の失敗） | 500 `INTERNAL_ERROR`（§4-4） |
| リトライ | 指数バックオフ 3 回（0ms → 500ms → 1500ms）|
| 1 試行タイムアウト | 3 秒（`AbortSignal.timeout(3000)`） |
| 合計タイムアウト予算 | 12 秒（`AbortSignal.timeout(12000)`） |

### 4-3. `status` カラムは廃止のまま（YAGNI）

**現時点で意味のないカラムは持たない。** MVP では「失敗時 INSERT しない」を採用したため `status` の値が `'ready'` 以外になる経路がない。`embed_url` の有無で「メタデータ取得済みか」は判定可能（とはいえ rollback semantics 下では `embed_url` は常に充足する）。将来 Cloudflare Queues 等で非同期化したくなったら、その時点で migration を 1 本追加する（コストは小さい）。

具体的に:
- `migration 0004 (status 復活)` を **作らない**
- spec から `StockStatus` 型・`status` フィールド・`s.status` SELECT 参照を **削除**
- API レスポンス JSON に `status` を含めない
- DB スキーマは migration 0003 後の状態（status カラムなし）を canonical とする

これは前回コミットの ADR-009 案からの修正（後述の改訂履歴）。

### 4-4. 異常系で spec が漏らしていた挙動を明文化

spec を再レビューした結果、以下の 2 ケースが §3.4 / §3.5 / §3.6 で扱い未定義だった。本 ADR で挙動を確定し、spec 側に追記する。

#### 並列リクエストの UNIQUE 制約競合

同一ユーザー × 同一 `canonical_url` で 2 つのリクエストが並列に走り、両方が重複チェック (§3.4) を通過、両方が oEmbed 取得に成功して INSERT 段階で `(user_id, canonical_url)` の UNIQUE 制約 (`uniq_stocks_user_canonical_url`、migration 0002) に衝突するケース。

- **挙動**: 後勝ちで INSERT 失敗した側を catch し、409 `DUPLICATE_STOCK` を返す。すでに前者の INSERT が成功して stock が存在する状態と同じレスポンスになるため、ユーザーから見て区別不要。
- **半端なデータが残らない**: 失敗側は INSERT が中断するだけで部分的な書き込みは存在しない。前者の stock は完成済みのため問題なし。

#### D1 INSERT 自体の失敗

INSERT 中に D1 から非 UNIQUE エラー（接続切断・容量上限・SQL 構文違反等）が返るケース。極めて稀だが定義しておく。

- **挙動**: 500 `INTERNAL_ERROR` を返し、`console.error` でログを残す。stock は INSERT が中断するため何も残らない。
- ユーザーは同じ URL で再 POST すれば再度 oEmbed 取得 → INSERT 試行になる。

### 4-5. Google Slides も他プロバイダと同等の hard failure に統一（軟性失敗の廃止）

旧 spec / ADR-004 系の記述では Google Slides の HTML タイトル取得失敗を「軟性失敗（soft failure）」として扱い、「`embed_url` は canonical URL から機械的に構築できるため、`title=null` でも 201 で stock を作成する」としていた。

**本 ADR では撤回する。** title は **検索性・一覧性・カードの可読性すべてにおいて中核となる情報**であり、これが欠けた stock は「中途半端なデータ」である。元 URL のリンクだけが残っても、ユーザーが何のスライドかを思い出せないと再発見できない。

#### 新方針

Google Slides も SpeakerDeck / Docswell と同じく、メタデータ取得の rollback semantics に従う:

| 旧 spec（軟性失敗あり） | 新 spec（本 ADR）|
|------------------------|-----------------|
| HTML 取得失敗 → catch + warn ログ + `title=null` で 201 | HTML 取得失敗 → 一般 `Error` を throw → §4-2 のリトライ対象 |
| HTML title なし（JS レンダ前提でタグが空） | 同上（HTML 取得自体が成功でも title 抽出不能なら `PermanentError` を throw → 502 `UPSTREAM_INVALID_RESPONSE`） |
| 401 / 403（非公開） | `PermanentError` → 400 `UPSTREAM_FORBIDDEN`（他プロバイダの 403 と同じ扱い） |
| 5xx / タイムアウト / ネットワーク失敗 | 一般 `Error` → 指数バックオフ 3 回 → リトライ上限到達で 502 `UPSTREAM_FAILURE` / 504 `UPSTREAM_TIMEOUT` |

#### embed_url の扱い

`embed_url` は依然として canonical URL から機械的に構築可能だが、これだけ取れても title がなければ stock として価値を持たないため、INSERT は行わない。embed URL 構築は title 取得成功後に同じ INSERT 文で書き込む（仕様上は変わらず、実行順序のみ「title 取得 → 成功時に embed URL 構築 → INSERT」）。

#### 受け入れるトレードオフ

- 公開だが JavaScript レンダリング後にしか `<title>` が出ないプレゼンテーションは MVP では取り込めない（502 `UPSTREAM_INVALID_RESPONSE` が返る）。代替: ブラウザレンダリング機能の導入は MVP のコスト方針（architecture.md）に反するため見送る。ユーザーは Google スライド側で公開設定 + タイトル明記を確認する運用とする
- 一時的に Google ドメインに到達できない期間は Google Slides の登録ができなくなる。既存の `UPSTREAM_FAILURE` で表示する

### 不採用の選択肢

| 選択肢 | 不採用理由 |
|--------|----------|
| **A) spec を実装に合わせる（v0.0.3.2 で一度提案）** | spec が SSOT という原則と矛盾。spec の存在価値が消える |
| **B) ハイブリッド（リトライだけ追加、stock 残す方針は維持）** | spec の `UPSTREAM_*` エラー / rollback semantics と依然不整合 |
| **C) 現状維持（spec ↔ impl 乖離を放置）** | 新規参加者がどちらを信じるか分からなくなる、テスト追加・新機能実装の判断軸が崩れる |
| **D) `status` カラムを将来非同期化用に残す** | YAGNI 違反。MVP では常に `'ready'` で実質意味がない。本当に必要になった時点で migration を足せばよい |

## 帰結

### 良い面

- spec が現行仕様を表すという原則が運用される
- `UPSTREAM_*` エラーコードが API として返るようになり、UI 側でメッセージ分岐が可能になる
- メタデータ取得失敗時に「壊れた stock」が DB / UI に残らず、ユーザー体験がシンプルになる
- 一時的なネットワーク不調で取れない場合でも 3 回リトライするため、成功率が上がる

### 悪い面 / 受け入れるトレードオフ

- 実装変更が必要（`worker/lib/oembed.ts`、`worker/handlers/stock-create.ts`、`worker/handlers/stocks.ts`、UI の数ファイル、テスト）
- 元 URL のみ価値があるケース（プロバイダ仕様変更で長期間取れない等）でも stock が作れなくなる。代替: ユーザーは同じ URL を再送信して 409 を確認、もしくはプロバイダ側の問題が解消したあと再 POST する
- 旧 ADR-004 が「個人ツールに retry / DLQ は過剰」と書いていたが、retry の指数バックオフ実装自体は本 ADR で採用する。ただし DLQ / Queue は引き続き廃止のまま（同期内 retry のみ）

## 実装計画

実装変更は以下の PR に分割して進める（本 ADR は PR-A）:

| # | スコープ | 依存 | 主な対象 |
|---|---------|------|---------|
| **PR-A（本 PR）** | ADR 整備 + spec の status 廃止 / 異常系明文化 | — | `docs/adr/004-*` Superseded、`docs/adr/009-*` 新規、`docs/oembed-spec.md` / `docs/stock-api-spec.md` / `docs/database.md` / `docs/ui-spec.md` から `status` 関連を削除、§3.4 / §3.5 / §3.6 に並列レース・D1 失敗の挙動追記、`CLAUDE.md` に SSOT 原則 |
| PR-B | oembed.ts のリトライ + 3 秒タイムアウト | A | `worker/lib/oembed.ts`、`worker/lib/oembed.test.ts` |
| PR-C | stock-create.ts の fetch-first + UPSTREAM_* | A, B | `worker/handlers/stock-create.ts`、`worker/handlers/stocks.test.ts` |
| PR-D | GET ハンドラ + UI のエラー表示更新 | C | `worker/handlers/stocks.ts`、`src/pages/stocks.astro`、`src/pages/stock-detail.astro`、`src/lib/api-client.ts` |

各 PR で `npm test` を緑にしてからマージ。テストは spec の §8.1（stock-api-spec.md）を網羅する。

> **改訂履歴:**
> - 初版（コミット `0329d8a`）: ADR 整備のみ。「migration 0004 で `status` カラムを復活させる PR-B」を含む実装計画。
> - 第 2 版（コミット `8455810`）: レビューを経て YAGNI を理由に migration 0004 を廃止（§4-3）。並列レース / D1 INSERT 失敗の扱いも未定義だったため §4-4 で追記。後続 PR の番号を繰り上げ（旧 PR-C → PR-B など）。
> - 第 3 版（本コミット）: Google Slides の HTML タイトル取得を「軟性失敗」扱いから他プロバイダと同等の hard failure に統一（§4-5）。title は中核情報のため取得失敗時は stock を作らずエラーレスポンスを返す。

## 参照

- spec（canonical）: [`docs/oembed-spec.md`](../oembed-spec.md) §5–§7、[`docs/stock-api-spec.md`](../stock-api-spec.md) §3、[`docs/architecture.md`](../architecture.md)、[`docs/database.md`](../database.md)、[`docs/ui-spec.md`](../ui-spec.md) §5.3.1 / §7.3 / §7.4
- 旧決定: [ADR-004](004-remove-queue.md)（Superseded）
- 関連 migration: `migrations/0001_init.sql`、`migrations/0002_unique_stock_per_user.sql`（並列レース対策の根拠）、`migrations/0003_drop_status.sql`（status 廃止、本 ADR で確定維持）
