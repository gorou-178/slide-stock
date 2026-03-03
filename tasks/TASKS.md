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
