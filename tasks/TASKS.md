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

## 3. Next（準備済み） — Phase 1: 仕様策定 & 基盤整備

### PM — 各領域の仕様策定（依存なし・並列実行可）
- [ ] @pm T-500 — Google OIDC認証仕様策定（コールバックURL、セッション形式・有効期限、ログアウトフロー）
- [ ] @pm T-510 — プロバイダ検出仕様策定（各プロバイダのURLパターン、正規化ルール、バリデーションエラー定義）
- [ ] @pm T-520 — oEmbed/Queue処理仕様策定（各プロバイダのoEmbedエンドポイント、Queueメッセージスキーマ、リトライ・失敗ポリシー）
- [ ] @pm T-530 — Stock API仕様策定（リクエスト/レスポンススキーマ、ページネーション方式、重複URL対応、エラーレスポンス形式）
- [ ] @pm T-540 — Memo API仕様策定（リクエスト/レスポンス、upsert動作、最大文字数、空メモ対応）
- [ ] @pm T-550 — フロントエンドUI仕様策定（コンポーネント階層、画面レイアウト、エラー/ローディング/空状態の定義）

### DEV — 基盤整備（依存なし・並列実行可）
- [ ] @dev T-535 — worker/index.ts ルーティングリファクタ（現在のif/elseからハンドラマップへ。パスパラメータ対応）
- [ ] @dev T-570 — APIエラーハンドリング統一 & CORS設定（Pages↔Workers間のクロスオリジン対応 or 同一オリジン化）
- [ ] @dev T-506 — 環境変数・Secrets設定（GOOGLE_CLIENT_ID, SESSION_SECRET を wrangler.toml / .dev.vars に追加）[dep: T-500]

---

## 4. Blocked
<!-- 現在ブロック中のタスクなし -->

---

## 5. Backlog（Phase 2〜5: Phase 1 完了後にコメント解除して Next へ移動）

<!-- === Phase 2: コアバックエンド ===
  - [ ] @dev T-511 — プロバイダ検出モジュール実装（worker/lib/provider.ts: detectProvider(url) → { provider, canonicalUrl } or error）[dep: T-510]
  - [ ] @qa T-512 — プロバイダ検出ユニットテスト（各プロバイダの正常URL、不正URL、エッジケース）[dep: T-511]
  - [ ] @dev T-501 — Google OIDCログインエンドポイント実装（POST /api/auth/callback: IDトークン検証→ユーザーupsert→セッションCookie発行）[dep: T-500]
  - [ ] @dev T-521 — oEmbedフェッチサービス実装（worker/lib/oembed.ts: SpeakerDeck/DocswellのoEmbed取得、Google Slidesのembed URL構築）[dep: T-520]
  - [ ] @dev T-522 — Cloudflare Queues設定（wrangler.tomlにproducer/consumer binding追加）[dep: T-520]
-->

<!-- === Phase 3: APIエンドポイント ===
  - [ ] @dev T-502 — 本番用認証ミドルウェア実装（セッションCookie検証、AuthContext注入。TEST_MODE時は既存bypass維持）[dep: T-501]
  - [ ] @qa T-505 — 認証フローのユニットテスト・E2Eテスト（JWT検証mock、ログイン→リダイレクト）[dep: T-502, T-504]
  - [ ] @dev T-523 — Queueコンシューマー実装（メッセージ受信→oEmbed取得→D1のstock更新: status=ready or failed）[dep: T-521, T-522]
  - [ ] @qa T-524 — oEmbed/Queueのユニットテスト（HTTPレスポンスmock、失敗・リトライシナリオ）[dep: T-521, T-523]
  - [ ] @dev T-531 — POST /stocks 実装（URL検証→プロバイダ検出→重複チェック→stock挿入(pending)→Queue送信→201返却）[dep: T-502, T-511, T-522, T-530]
  - [ ] @dev T-532 — GET /stocks 実装（認証ユーザーのストック一覧取得、created_at降順、メモ結合、ページネーション）[dep: T-502, T-530]
  - [ ] @dev T-533 — GET /stocks/:id 実装（単一ストック取得、メモ付き、所有権チェック）[dep: T-502, T-530]
  - [ ] @dev T-534 — DELETE /stocks/:id 実装（ストック＋関連メモ削除、所有権チェック、204返却）[dep: T-502, T-530]
  - [ ] @qa T-536 — Stock APIユニットテスト（CRUD全パス、401/404/409/400、ページネーション、ユーザー間分離）[dep: T-531〜T-534]
  - [ ] @dev T-541 — PUT /stocks/:id/memo 実装（メモupsert、stock所有権チェック）[dep: T-502, T-540]
  - [ ] @dev T-542 — GET /stocks/:id/memo 実装（メモ取得、404対応）[dep: T-502, T-540]
  - [ ] @qa T-543 — Memo APIユニットテスト（作成・更新・取得、存在しないstock、所有権分離）[dep: T-541, T-542]
-->

<!-- === Phase 4: フロントエンド ===
  - [ ] @dev T-504 — フロントエンドGoogle Sign-In統合（Google Identity Services SDK導入、login.astroにログインフロー実装）[dep: T-501]
  - [ ] @dev T-551 — ベースレイアウト実装（src/layouts/BaseLayout.astro: 共通head、ナビバー、ログアウトボタン、基本CSS）[dep: T-550]
  - [ ] @dev T-552 — ストック一覧画面構築（URL入力フォーム＋ストックカード一覧＋ローディング/空状態ハンドリング）[dep: T-532, T-551]
  - [ ] @dev T-553 — URL送信フロー実装（フォームsubmit→POST /stocks→pending表示→一覧更新）[dep: T-531, T-552]
  - [ ] @dev T-554 — ストック詳細画面構築（embed表示＋メモ編集テキストエリア＋保存/削除ボタン＋元URLリンク）[dep: T-533, T-541, T-534, T-551]
  - [ ] @dev T-555 — oEmbed埋め込みコンポーネント実装（embed_urlからiframe生成、プロバイダ別サイズ対応、lazy loading）[dep: T-550]
  - [ ] @dev T-556 — ログインページ更新（Google Sign-In統合、認証後/stocksへリダイレクト、レイアウト統一）[dep: T-504, T-551]
  - [ ] @dev T-557 — トップページ更新（認証済み→/stocksリダイレクト、未認証→ログイン案内）[dep: T-551, T-502]
  - [ ] @qa T-558 — フロントエンドE2Eテスト（ログインリダイレクト、一覧表示、URL登録、詳細表示、メモ編集、削除）[dep: T-552〜T-554]
-->

<!-- === Phase 5: 統合 & リリース ===
  - [ ] @dev T-503 — ログアウトエンドポイント実装（POST /api/auth/logout）[dep: T-502]
  - [ ] @pm T-571 — 本番デプロイチェックリスト策定（Google Cloud OIDC設定、Secrets投入、D1本番DB、Queue作成、DNS/ルーティング）[dep: T-500, T-522]
  - [ ] @dev T-572 — 本番構成設定（/api/*ルーティング、wrangler.tomlに本番D1 ID・Queue名設定）[dep: T-571]
  - [ ] @qa T-573 — 統合テスト（URL登録→Queue処理→メタデータ取得→一覧表示の全フロー検証）[dep: T-531, T-523, T-532]
  - [ ] @qa T-575 — MVP受入テスト（CLAUDE.md セクション8の成功基準5項目を本番環境で検証）[dep: 全タスク]
-->

---

## 6. Failed / Cancelled
<!--
  - [!] @dev F-001 — ...
  - [-] @pm C-001 — ...
-->

---

## 7. Done（前スプリント: インフラ・基盤整備）
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
