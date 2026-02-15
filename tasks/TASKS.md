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
- [ ] @pm T-100 — CI/CD方針とDoDを plan.md に明文化

### QA
- [ ] @qa T-110 — 現状テスト棚卸しとCI実行コマンド定義

### DEV
- [ ] @dev T-120 — PR(main)でCI実行するGitHub Actions workflow追加

---

## 2. In Progress（CLAIM済み）

### PM
<!-- 例: - [>] @pm T-101 — ... -->

### QA
<!-- 例: - [>] @qa T-111 — ... -->

### DEV
<!-- 例: - [>] @dev T-121 — ... -->

---

## 3. Next（準備済み）

### Refactor（Component/TDD）
- [ ] @pm T-200 — コンポーネント境界と移行順を定義
- [ ] @qa T-210 — リファクタ安全網テスト追加
- [ ] @dev T-220 — 共通UI抽出（TDD段階移行）

### Security
- [ ] @pm T-300 — API/Session棚卸しと改善方針
- [ ] @dev T-310 — セッション管理セキュア化
- [ ] @dev T-311 — API callベストプラクティス化

### Production
- [ ] @pm T-400 — 本番運用設計（環境分離・Secrets・deploy）
- [ ] @dev T-410 — Production build設定整備
- [ ] @dev T-420 — production merge後deploy workflow追加
- [ ] @qa T-421 — 本番デプロイ確認（slide-stock.gorou.dev）

---

## 4. Blocked
- [ ] @pm B-001 — デプロイ先最終確定
- [ ] @pm B-002 — Secrets一覧確定

---

## 5. Backlog
- [ ] @pm T-900 — 監視方針（Sentry等）
- [ ] @qa T-901 — E2E強化

---

## 6. Failed / Cancelled
<!--
- [!] @dev F-001 — ...
- [-] @pm C-001 — ...
-->

---

## 7. Done（今スプリント）
<!--
- [x] @dev T-___ — ...
- [x] @qa  T-___ — ...
- [x] @pm  T-___ — ...
-->

---

## 8. Archive Rule
- スプリント終了時に Done / Failed を `tasks/archive/` へ移動
- TASKS.md は常に Now が見やすいサイズを維持
