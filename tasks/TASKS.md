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

## 3. Next（準備済み） — Phase 4: フロントエンド

<!-- Phase 3 完了。Phase 4 タスクは Backlog から移動予定 -->

---

## 4. Blocked
<!-- 現在ブロック中のタスクなし -->

---

## 5. Backlog（Phase 3〜5: Phase 2 完了後に Next へ移動）


=== Phase 3: APIエンドポイント ===
  - [x] @qa T-508 — 認証ミドルウェアのユニットテスト作成（11テスト）
  - [x] @dev T-502 — 本番用認証ミドルウェア実装（HMAC-SHA256署名Cookie検証→AuthContext注入）
  - [ ] @qa T-505 — 認証フローE2Eテスト（ログイン→コールバック→セッション発行→API認証→ログアウトの全フロー検証）[dep: T-502, T-504]
  - [x] @dev T-523 — Queueコンシューマー実装（メッセージ受信→oEmbed取得→D1のstock更新: status=ready or failed）
  - [x] @qa T-524 — oEmbed/Queueのユニットテスト（HTTPレスポンスmock、失敗・リトライシナリオ、8テスト）
  - [x] @dev T-531 — POST /stocks 実装（URL検証→プロバイダ検出→重複チェック→stock挿入(pending)→Queue送信→201返却）
  - [x] @dev T-532 — GET /stocks 実装（認証ユーザーのストック一覧取得、created_at降順、メモ結合、ページネーション）
  - [x] @dev T-533 — GET /stocks/:id 実装（単一ストック取得、メモ付き、所有権チェック）
  - [x] @dev T-534 — DELETE /stocks/:id 実装（ストック＋関連メモ削除、所有権チェック、204返却）
  - [x] @qa T-536 — Stock APIユニットテスト（CRUD全パス、401/404/409/400、ページネーション、ユーザー間分離、31テスト）
  - [x] @dev T-541 — PUT /stocks/:id/memo 実装（メモupsert、stock所有権チェック）
  - [x] @dev T-542 — GET /stocks/:id/memo 実装（メモ取得、404対応）
  - [x] @qa T-543 — Memo APIユニットテスト（作成・更新・取得、存在しないstock、所有権分離、19テスト）


=== Phase 4: フロントエンド ===
  - [x] @dev T-504 — フロントエンドGoogle Sign-In統合（T-556に統合: <a href="/api/auth/login">方式）
  - [x] @dev T-551 — ベースレイアウト実装（BaseLayout.astro + Navbar.astro + global.css + LoadingSpinner + EmptyState）
  - [x] @dev T-552 — ストック一覧画面構築（URL入力フォーム＋ストックカード一覧＋ローディング/空状態ハンドリング）
  - [x] @dev T-553 — URL送信フロー実装（フォームsubmit→POST /stocks→pending表示→一覧更新 + api-client.ts）
  - [x] @dev T-554 — ストック詳細画面構築（embed表示＋メモ編集テキストエリア＋保存/削除ボタン＋元URLリンク）
  - [x] @dev T-555 — oEmbed埋め込みコンポーネント実装（embed_urlからiframe生成、16:9 aspect-ratio、lazy loading、sandbox）
  - [x] @dev T-556 — ログインページ更新（認証チェック→/stocks or ログインボタン表示）
  - [x] @dev T-557 — トップページ更新（認証済み→/stocksリダイレクト、未認証→ランディング表示）
  - [-] @qa T-558 — フロントエンドE2Eテスト（今回は除外）


=== Phase 5: 統合 & リリース ===
  - [x] @dev T-503 — ログアウトエンドポイント実装（POST /api/auth/logout + /api/me D1クエリ修正）
  - [ ] @pm T-571 — 本番デプロイチェックリスト策定（Google Cloud OIDC設定、Secrets投入、D1本番DB、Queue作成、DNS/ルーティング）[dep: T-500, T-522]
  - [ ] @dev T-572 — 本番構成設定（/api/*ルーティング、wrangler.tomlに本番D1 ID・Queue名設定）[dep: T-571]
  - [ ] @qa T-573 — 統合テスト（URL登録→Queue処理→メタデータ取得→一覧表示の全フロー検証）[dep: T-531, T-523, T-532]
  - [ ] @qa T-575 — MVP受入テスト（CLAUDE.md セクション8の成功基準5項目を本番環境で検証）[dep: 全タスク]


---

## 6. Failed / Cancelled
<!--
  - [!] @dev F-001 — ...
  - [-] @pm C-001 — ...
-->

---

## 7. Done

### Phase 4: フロントエンド
- [x] @dev T-503 — ログアウトエンドポイント実装 + /api/me D1クエリ修正
- [x] @dev T-551 — ベースレイアウト実装（BaseLayout + Navbar + global.css + LoadingSpinner + EmptyState）
- [x] @dev T-504+T-556 — ログインページ（Google Sign-In統合、認証チェック）
- [x] @dev T-557 — トップページ更新（認証振り分け + ランディング表示）
- [x] @dev T-555 — EmbedViewer コンポーネント（iframe + sandbox + lazy loading）
- [x] @dev T-552 — ストック一覧画面（URLInputForm + StockList + カード動的生成）
- [x] @dev T-553 — URL送信フロー + api-client.ts（typed fetch ラッパー）
- [x] @dev T-554 — ストック詳細画面（embed + MemoEditor + 削除機能）

### Phase 3: APIエンドポイント
- [x] @qa T-508 — 認証ミドルウェアのユニットテスト作成（11テスト）
- [x] @dev T-502 — 本番用認証ミドルウェア実装（HMAC-SHA256署名Cookie検証→AuthContext注入）
- [x] @dev T-523 — Queueコンシューマー実装（メッセージ受信→oEmbed取得→D1のstock更新）
- [x] @dev T-531 — POST /stocks 実装（URL検証→プロバイダ検出→重複チェック→stock挿入→Queue送信→201返却）
- [x] @dev T-532 — GET /stocks 実装（一覧取得、created_at降順、メモ結合、カーソルページネーション）
- [x] @dev T-533 — GET /stocks/:id 実装（詳細取得、メモ付き、所有権チェック）
- [x] @dev T-534 — DELETE /stocks/:id 実装（ストック＋関連メモ削除、所有権チェック、204返却）
- [x] @dev T-541 — PUT /stocks/:id/memo 実装（メモupsert、stock所有権チェック）
- [x] @dev T-542 — GET /stocks/:id/memo 実装（メモ取得、stock不存在/メモ未作成の区別）
- [x] @qa T-524 — oEmbed/Queueユニットテスト作成（8テスト）
- [x] @qa T-536 — Stock APIユニットテスト作成（31テスト）
- [x] @qa T-543 — Memo APIユニットテスト作成（19テスト）

### Phase 2: コアバックエンド
- [x] @qa T-507 — OIDCログインエンドポイントのユニットテスト作成（21テスト）
- [x] @qa T-512 — プロバイダ検出ユニットテスト作成（35テスト）
- [x] @dev T-501 — Google OIDCログインエンドポイント実装（handleLogin / handleCallback）
- [x] @dev T-511 — プロバイダ検出モジュール実装（detectProvider）
- [x] @dev T-521 — oEmbedフェッチサービス実装（SpeakerDeck/Docswell/Google Slides）
- [x] @dev T-522 — Cloudflare Queues設定（wrangler.toml producer/consumer追加）

### Phase 1: 仕様策定 & 基盤整備
- [x] @pm T-500 — Google OIDC認証仕様策定 → docs/auth-spec.md
- [x] @pm T-510 — プロバイダ検出仕様策定 → docs/provider-spec.md
- [x] @pm T-520 — oEmbed/Queue処理仕様策定 → docs/oembed-spec.md
- [x] @pm T-530 — Stock API仕様策定 → docs/stock-api-spec.md
- [x] @pm T-540 — Memo API仕様策定 → docs/memo-api-spec.md
- [x] @pm T-550 — フロントエンドUI仕様策定 → docs/ui-spec.md
- [x] @dev T-535 — worker/index.ts ルーティングリファクタ
- [x] @dev T-570 — APIエラーハンドリング統一 & CORS設定
- [x] @dev T-506 — 環境変数・Secrets設定

### 前スプリント: インフラ・基盤整備
- [x] @pm T-100 — CI/CD方針とDoDを plan.md に明文化
- [x] @qa T-110 — 現状テスト棚卸しとCI実行コマンド定義
- [x] @dev T-120 — PR(main)でCI実行するGitHub Actions workflow追加
- [x] @pm T-200 — コンポーネント境界と移行順を定義
- [x] @qa T-210 — リファクタ安全網テスト追加
- [x] @dev T-220 — 共通UI抽出（TDD段階移行）
- [x] @pm T-300 — API/Session棚卸しと改善方針
- [x] @dev T-310 — セッション管理セキュア化
- [x] @dev T-311 — API callベストプラクティス化
- [x] @pm T-400 — 本番運用設計（環境分離・Secrets・deploy）
- [x] @dev T-410 — Production build設定整備
- [x] @dev T-420 — production merge後deploy workflow追加
- [x] @qa T-421 — 本番デプロイ確認（slide-stock.gorou.dev）
- [x] @pm B-001 — デプロイ先最終確定
- [x] @pm B-002 — Secrets一覧確定
- [x] @pm T-900 — 監視方針（Sentry等）
- [x] @qa T-901 — E2E強化

---

## 8. Archive Rule
- スプリント終了時に Done / Failed を `tasks/archive/` へ移動
- TASKS.md は常に Now が見やすいサイズを維持
