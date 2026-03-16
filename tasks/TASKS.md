# TASKS.md (SSOT) — Long-Running Autonomous Board

> SSOT: このファイルが唯一の作業指示源
> Runner対象: `- [ ] @role T-xxx — ...` のみ
> 状態: `[ ]` todo / `[>]` claimed / `[x]` done / `[!]` failed / `[-]` cancelled

---

## 0. Working Agreements（自走責務定義）

### Git Responsibility Model

#### DEV
- 小さな単位で `git commit` する（意味のある差分ごと）
- コミットはローカルのみ
- `git push` は絶対に行わない
- タスク完了時は TASKS.md を `[x]` に変更する

コミット例:
- `refactor(ui): extract SlideCard`
- `test(component): add SlideCard rendering test`
- `security(session): set HttpOnly flag`

#### PM
- TASKS.md が `[x]` になったタスクをレビューする
- 内容が妥当と判断したら `git push` する
- 必要に応じて差し戻す（`[ ]` に戻す or `[!]` にする）

### Runner Rule
- runner は commit も push も行わない
- Git操作は人間（DEV/PM）のみ

### Branch & CI
- PR → main で CI 実行
- production merge/push で deploy
- Domain: slide-stock.gorou.dev

### WIP Rule
- 各ロールの `[>]` は最大2
- 24h進まないCLAIMは `[ ]` に戻す or `[!]`

---

## 1. Now（今動いているタスク）

### PM
<!-- 例: - [>] @pm T-500 — ... -->

### QA
<!-- 例: - [>] @qa T-512 — ... -->

### DEV
<!-- 例: - [>] @dev T-535 — ... -->

---

## 2. In Progress（CLAIM済み）

### PM
<!-- 例: - [>] @pm T-501 — ... -->

### QA
<!-- 例: - [>] @qa T-511 — ... -->

### DEV
<!-- 例: - [>] @dev T-521 — ... -->

---

## 3. Next（準備済み）

<!-- 未着手タスクは Backlog を参照 -->

---

## 4. Blocked
<!-- 現在ブロック中のタスクなし -->

---

## 5. Backlog


=== Phase 3: APIエンドポイント（残タスク） ===
  - [x] @qa T-505 — 認証フローE2Eテスト（ログイン→コールバック→セッション発行→API認証→ログアウトの全フロー検証）[dep: T-502, T-504]


=== Phase 5: 統合 & リリース ===
  - [-] @pm T-571 — ~~本番デプロイチェックリスト策定~~ → T-610 に統合
  - [x] @dev T-572 — 本番構成設定（/api/*ルーティング、wrangler.tomlに本番D1 ID・Queue名設定）[dep: T-610]
  - [x] @qa T-573 — 統合テスト（URL登録→Queue処理→メタデータ取得→一覧表示の全フロー検証）[dep: T-531, T-523, T-532]
  - [x] @qa T-575 — MVP受入テスト（CLAUDE.md セクション8の成功基準5項目を本番環境で検証）[dep: 全タスク]


=== Phase 6A: セキュリティ強化（残タスク） ===
  - [x] @qa T-607 — セキュリティ修正検証テスト（T-601〜T-606 の各修正が意図通り動作することを確認、26テスト）[dep: T-601, T-602, T-603, T-604, T-605, T-606]


=== Phase 6B: 本番公開手順 ===
  - [x] @pm T-610 — 本番デプロイ手順書作成（ops/ ディレクトリに配置、ops/ を .gitignore に追加。内容: Cloudflareリソース作成、D1本番DB・Queue作成、マイグレーション、Secrets投入、Google OAuth設定、DNS/ルーティング、デプロイコマンド）[T-571 統合]


=== Phase 6C: 可観測性（残タスク） ===
  - [x] @pm T-621 — 可観測性運用ガイド作成（ops/ に配置、.gitignore 対象。内容: Cloudflare ダッシュボード活用方法、wrangler tail 手順、DLQ監視、Workers Analytics/D1 Metrics/Queue Metrics の確認ポイント）


=== Phase 6D: ランディングページ ===
  - [x] @pm T-630 — ランディングページ仕様策定（docs/landing-spec.md: サービス概要、対応プロバイダ紹介、利用イメージ、CTAボタン配置。認証不要の静的ページ。/stocks 一覧画面とは完全分離）
  - [x] @dev T-631 — トップページをサービスランディングページに刷新（T-630 仕様に基づき index.astro を再実装。認証チェック・リダイレクトを除去し、静的な公開ページとする。ログインは /login に誘導）[dep: T-630]


=== Phase 6E: 本番デプロイ不具合修正 ===
  - [x] @dev T-810 — Worker ルーティング修正: Pages Functions プロキシ方式に変更（①wrangler.toml から routes を削除 ②functions/api/[[path]].ts を作成しリクエストを workers.dev に転送 ③Worker・Pages を再デプロイ。背景: gorou.dev が Cloudflare ゾーンでないため Worker routes が使えない。_redirects 200 proxy は外部 URL 非対応のため Pages Functions で実装）
  - [x] @dev T-811 — ログインページのローディングスピナーが常時表示される不具合修正（global.css で .login-container の display:flex が hidden 属性を上書きしている。.login-container[hidden] { display: none; } を追加）
  - [>] @qa T-812 — 本番デプロイ後の動作検証（T-810, T-811 修正後に実施。①Worker デプロイ成功 ②/api/health が {"status":"ok"} を返す ③ログインボタン押下で Google OAuth 画面に遷移 ④ログインページでローディングが消えてボタンが表示される）[dep: T-810, T-811]


=== Phase 7: アーキテクチャ改善 ===

--- 優先度1〜2: 実施判断対象 ---

  - [ ] @pm T-700 — [設計] SSR統合: Pages+Workers二重構成をAstro Cloudflareアダプター単一Workers構成に移行する設計策定（docs/adr/003-ssr-unification.md 作成。現状: Astro static build→Pages + 別途Workers API。改善: Astro SSR on Workers で統一し、デプロイ単位を1つに。ルーティング二重管理・CORS設定・wrangler.toml routes設定を解消。影響範囲: astro.config.mjs, wrangler.toml, worker/index.ts, src/pages/）
  - [ ] @dev T-701 — [実装] SSR統合の実施（T-700 設計に基づき、Astro Cloudflare アダプター導入、Pages+Workers→単一Workersに統合、API Routes をAstro内に移行、wrangler.toml 簡素化）[dep: T-700]
  - [ ] @qa T-702 — [検証] SSR統合後のリグレッションテスト（全既存テスト通過確認、E2Eテスト更新、本番同等環境での動作検証）[dep: T-701]

  - [ ] @pm T-710 — [設計] Queue廃止: Cloudflare Queues→ctx.waitUntil()への移行設計策定（docs/adr/004-remove-queue.md 作成。現状: oEmbedメタデータ取得をQueue経由で非同期処理。改善: 個人ツールでは即時取得で十分、ctx.waitUntil()でレスポンス後にfetch実行。Queue/DLQ/コンシューマー/wrangler.toml Queue設定を削除し構成を大幅簡素化）
  - [ ] @dev T-711 — [実装] Queue廃止の実施（T-710 設計に基づき、POST /api/stocks 内で ctx.waitUntil() による即時oEmbed取得に変更、queue-consumer.ts 削除、wrangler.toml から Queue 設定除去）[dep: T-710]
  - [ ] @qa T-712 — [検証] Queue廃止後のリグレッションテスト（oEmbedメタデータ取得の動作確認、エラー時のフォールバック確認、既存テスト更新・通過）[dep: T-711]

--- 優先度3以降: 検討段階 ---

  - [ ] @pm T-720 — [検討] 認証委譲: カスタムGoogle OIDC実装→Cloudflare Accessへの移行検討（現状: auth.ts 242行 + session-auth.ts 77行 + test-auth-bypass.ts 100行 = 約420行の自前認証コード。Cloudflare Access導入で認証コード全削除可能。トレードオフ: Access有料プラン要否、柔軟性低下）
  - [ ] @pm T-730 — [検討] ルーターフレームワーク導入: 手書きif-elseルーター→Hono/Astro API Routes検討（現状: worker/index.ts で手動パスマッチング。Hono導入でミドルウェアチェーン・型安全ルーティング・OpenAPI生成が可能。T-701でSSR統合する場合はAstro API Routesが自然な選択肢）
  - [ ] @pm T-740 — [検討] ドキュメント統合: 10仕様書→2〜3ドキュメントへの集約検討（現状: docs/ に9仕様書+2 ADR。個人ツールとしては過剰。AGENTS.md に技術仕様を集約し、docs/ は ADR のみにする案を検討）


---

## 6. Failed / Cancelled
<!--
  - [!] @dev F-001 — ...
  - [-] @pm C-001 — ...
-->

---

## 7. Done

> Phase 1〜4、インフラ基盤、Phase 6A/6C の完了タスクは [archive/TASKS_2025-02.md](archive/TASKS_2025-02.md) に移動済み

---

## 8. Archive Rule
- スプリント終了時に Done / Failed を `tasks/archive/` へ移動
- TASKS.md は常に Now が見やすいサイズを維持
