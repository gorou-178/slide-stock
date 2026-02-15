## EPIC: CI / Refactor / Security / Production

- [ ] @pm T-100 — 作業方針の決定（ブランチ運用・DoD・命名・commit粒度）
  - Output: plan.md に「PR単位 / タスク完了時 commit&push / main PRでCI / production mergeでdeploy」を明文化
  - Done: plan.md 更新、TDD方針・コンポーネント方針・セキュリティ方針を定義
  - After: git commit && git push

- [ ] @qa T-110 — 現状テスト/コマンドの棚卸し（CIで回す最小セットを定義）
  - Output: plan.md or research.md に `npm test` / `npm run lint` / `npm run typecheck` / `npm run build` 等の現行確認結果を記載
  - Done: 「CIで実行するコマンド」「必要な環境変数」「落ちやすい箇所」を整理
  - After: git commit && git push

- [ ] @dev T-120 — GitHub Actions: PR(main)でテスト実行ワークフロー追加
  - Scope: pull_request → main のタイミングで、既存テスト（+ lint/typecheck/build）を実行
  - Output: `.github/workflows/ci.yml`（名称は任意）追加/更新
  - Done: PR作成でworkflowが起動し、成功/失敗が分かる
  - After: git commit && git push

- [ ] @qa T-121 — CIワークフロー検証（PRでの実行確認 + 失敗時のログ確認手順）
  - Done: 1) PR作成で動く 2) 失敗時の原因が追える 3) README or CLAUDE.md に簡単な確認手順追記（必要なら）
  - After: git commit && git push


## EPIC: Astro コンポーネント指向化（TDDリファクタ）

- [ ] @pm T-200 — Astro リファクタ方針の切り出し（コンポーネント境界・命名・移行順）
  - Output: plan.md に「どこをコンポーネント化するか」「段階的移行」「Doneの定義」を書く
  - Done: TDD進行（先にテスト→小さく移行）を具体TODO化
  - After: git commit && git push

- [ ] @qa T-210 — コンポーネント化のためのテスト基盤/最小テスト追加（現状を壊さない）
  - Goal: リファクタの安全網（UI/レンダリング/重要ロジック）を作る
  - Done: 重要ページ/重要コンポーネントの最低限テストが通る
  - After: git commit && git push

- [ ] @dev T-220 — コンポーネント指向にTDDで段階的リファクタ（第1段：共通UI抽出）
  - Scope例: Layout / Header / Nav / Card / Button 等の共通化（実態に合わせる）
  - Done: 既存挙動を維持しつつ、コンポーネントに分割、テストgreen
  - After: git commit && git push

- [ ] @dev T-221 — コンポーネント指向にTDDで段階的リファクタ（第2段：ページ/機能単位の整理）
  - Done: ページの責務が薄くなり、再利用可能な単位に整理、テストgreen
  - After: git commit && git push

- [ ] @qa T-222 — リファクタ回帰確認（主要導線の簡易E2E/手順書）
  - Done: 主要フローの手動確認チェックリスト or 簡易E2E が揃う
  - After: git commit && git push


## EPIC: Astro API call / セッション管理のセキュア化（ベストプラクティスでリファクタ）

- [ ] @pm T-300 — 現状のAPI呼び出し/セッション管理の棚卸し + 改善方針策定
  - Output: research.md/plan.md に「現状」「課題（CSRF/XSS/セッション固定/トークン保管/クッキー属性等）」「目標状態」を記載
  - Done: 実装TODO化（段階移行）
  - After: git commit && git push

- [ ] @dev T-310 — セッション管理のリファクタ（よりセキュアな実装へ）
  - Scope例: Cookie属性（HttpOnly/Secure/SameSite）、セッション期限、ローテーション、サーバーサイド保管 等（実態に合わせる）
  - Done: セキュリティ要件を満たし、既存挙動維持、テストgreen
  - After: git commit && git push

- [ ] @dev T-311 — Astro API call のベストプラクティス化（サーバー/クライアント境界の見直し）
  - Goal: 秘匿情報をクライアントに出さない、エラーハンドリング統一、型/バリデーション整理
  - Done: 既存API連携が動作、テストgreen
  - After: git commit && git push

- [ ] @qa T-320 — セキュリティ観点のテスト/チェック追加（最低限）
  - Done: Cookie属性検証、未ログイン時挙動、CSRF対策が必要な箇所の確認、回帰テストgreen
  - After: git commit && git push


## EPIC: Production 設定・ビルド・デプロイ整備（slide-stock.gorou.dev）

- [ ] @pm T-400 — 本番運用設計（環境分離・Secrets・ブランチ戦略・デプロイ手順）
  - Requirements:
    - domain: slide-stock.gorou.dev
    - 環境特有設定は分離（dev/stg/prod）
    - production ブランチへの merge 後に GitHub Actions で deploy
  - Output: plan.md に「環境変数一覧」「production deployのフロー」「ロールバック方針」
  - After: git commit && git push

- [ ] @dev T-410 — Production build設定の整備（環境分離、prod向け設定）
  - Scope: `.env.example` 整備、環境ごとの設定読み分け、prod build コマンド確定
  - Done: ローカルでprod相当ビルドが再現できる、CIでもbuild可能
  - After: git commit && git push

- [ ] @dev T-420 — GitHub Actions: productionブランチ merge 後にデプロイするworkflow追加
  - Trigger: push to production（または merge group / workflow_run等、運用方針に合わせる）
  - Done: production ブランチ更新で自動デプロイが走る（Secrets利用、環境分離）
  - After: git commit && git push

- [ ] @qa T-421 — production deploy の動作確認（DNS/ドメイン/ヘルスチェック/回帰）
  - Target: https://slide-stock.gorou.dev
  - Done: デプロイ後の疎通確認手順・チェック項目が残る（README or CLAUDE.md）
  - After: git commit && git push

