# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to a 4-digit version format: `MAJOR.MINOR.PATCH.MICRO`.

## [0.0.3.0] - 2026-05-02

### Changed
- T-A 完了: `docs/oembed-spec.md` を sync モデル前提に書き換え。旧 §5（Cloudflare Queues メッセージスキーマ）／§6（Consumer 処理フロー）／§7（Queue リトライ + DLQ）／§8（失敗時 UPDATE と再取得フロー）を、§5（同期取得処理フロー）／§6（同期内・指数バックオフ 3 回 / 各 3 秒 / 合計 12 秒予算）／§7（DB ロールバック相当・ユーザー応答）に全面置換。タイムアウト記述（旧 §9 → §8）を 3 秒 / 12 秒予算に整合。Cloudflare Queues / DLQ / `OEMBED_QUEUE.send` / `wrangler.toml` キュー設定への参照を全削除。
- T-A 完了: `docs/stock-api-spec.md` を sync モデル前提に書き換え。§3.2 処理フローを「INSERT 前に同期 oEmbed 取得」へ、§3.5 / §3.6 を `status='ready'` での 1 回 INSERT へ、§3.7 のレスポンス例を完成済みストック（title / author_name / embed_url 充足）へ更新。§2.3 エラーコード一覧に `UPSTREAM_NOT_FOUND` / `UPSTREAM_FORBIDDEN`（恒久エラー）/ `UPSTREAM_FAILURE` / `UPSTREAM_INVALID_RESPONSE` / `UPSTREAM_TIMEOUT` を追加。§3.8 に 502 / 504 / `UPSTREAM_NOT_FOUND` のレスポンス例を追加。§7 の `StockResponse` フィールドコメントと `StockStatus` 型コメントで「MVP は常に `ready`、`pending` / `failed` は将来非同期化用にスキーマで許容」を明記。§8.1 テストケース P1〜P3 を sync 期待値（status=`"ready"`、メタデータ充足）に修正、P4b（Google Slides の HTML 取得失敗を軟性失敗として扱う）と P14〜P19（プロバイダ 404 / 403 / 5xx 連続失敗 / タイムアウト / レスポンス形式不正 / 失敗時に stock が作られない確認）を追加。
- T-A 完了: `docs/database.md` の stocks テーブル定義を「MVP は常に `ready`、`pending` / `failed` は将来非同期化用にスキーマで許容」へ刷新（DEFAULT も `'pending'` から `'ready'` に変更）。ステータス遷移図を MVP（同期モデル: 「存在しない → ready」のみ）と将来の非同期モデル（参考、未実装）の 2 セクションに分けた。ER 図の status コメントも同期モデル基準に更新。

### Removed
- `docs/oembed-spec.md` 冒頭の TODO バナー、`docs/stock-api-spec.md` 冒頭の TODO バナーを削除（本 PR で sync モデルへの書き換えが完了したため）。

## [0.0.2.0] - 2026-05-02

### Added
- `public/fonts/` 配下に Geist Variable（~68 KB、weight 100–900）と Geist Mono Variable（~70 KB）を self-host。`font-display: swap` 付き。欧文・数字・記号・コードを担当。
- IBM Plex Sans JP を Regular + Bold（各 ~37 KB）で self-host。`unicode-range` で ASCII + kana + CJK 記号にサブセット化し、漢字は OS の日本語フォント（Hiragino → Yu Gothic → Noto Sans JP）にフォールバック。タイポグラフィの総 payload は ~210 KB で、`ui-spec.md` §8.2.1 の 300 KB バジェット内に収まる。
- `BaseLayout.astro` に Geist Variable と IBM Plex Sans JP Regular の `<link rel="preload">` を追加。Above-the-fold のタイポグラフィを critical path に乗せ、初描画後の FOUT を回避。
- `global.css` に `--font-family-display` / `--font-family-body` / `--font-family-mono` の CSS カスタムプロパティを追加。今後のコンポーネントが fallback chain を再記述せずに display / body / mono を選択できる。

### Changed
- `global.css` の `--font-family` を、これまでの `-apple-system` システムスタックから `Geist` → `IBM Plex Sans JP` → OS 日本語フォントの順に変更。`ui-spec.md` §8.2 で確定したタイポグラフィスペックに準拠。
- `tasks/design-review-2026-04-30.md` の T-B（フォント self-host）を ✅ 完了 としてマークし、IBM Plex Sans JP を Variable ではなく Regular + Bold のサブセットで配信した理由（Variable 版が存在せず、フル CJK サブセットはバジェットの 10 倍に達するため）を実装メモとして追記。
- `docs/ui-spec.md` §8.2.1 を実装内容に合わせて更新。実際に配信したサブセット戦略と per-file サイズをスペックに反映。
- `CLAUDE.md` の言語ポリシーを刷新。「散文（PR/Issue 本文・CHANGELOG エントリ・レビューコメント）は日本語、識別子・規約文字列（コード・コミット・PR タイトル・CHANGELOG 見出し）は英語」と切り分けを明文化。これに合わせて既存 v0.0.1.0 エントリと本 v0.0.2.0 エントリを日本語化。

## [0.0.1.0] - 2026-05-02

### Added
- `tasks/design-review-2026-04-30.md` を追加。`/plan-design-review` セッションで洗い出した 12 件のフォローアップタスク（T-A 〜 T-L）を記録。ブロッカー（sync oEmbed モデルへのスペック書き換え、Geist + IBM Plex Sans JP のフォント self-host、hero / 使い方スクリーンショット作成、`/privacy` `/terms` ページ）と nice-to-have（inline confirm、return_to ハンドリング、空状態コピー、モバイルカードの折り返し、トースト通知、メモ保存フィードバック）の両方を含む。
- `AGENTS.md` に `gstack` セクションを追加。プロジェクトで利用するスキル（`/plan-ceo-review`、`/plan-eng-review`、`/review`、`/ship`、`/qa`、`/careful`、`/freeze`）を列挙し、ブラウザ操作はすべて `/browse` 経由とする方針を明記。
- `CLAUDE.md` にスキルルーティングルールを追加。今後の Claude Code セッションがリクエスト種別ごとに正しいスキルを自動起動する（バグ → `/investigate`、出荷 → `/ship` など）。
- `CLAUDE.md` に言語ポリシーを追加。ユーザー向けの応答は日本語、コード・コミットメッセージ・CHANGELOG・PR テキストは英語のまま、というプロジェクト方針を明文化。
- 初期 `VERSION` と `CHANGELOG.md`（4 桁バージョン形式）を追加し、gstack ship ワークフローと整合させる。

### Changed
- `docs/ui-spec.md` を大幅に加筆（+225 行）: タイポグラフィスペックを Geist + IBM Plex Sans JP に刷新、カラーパレットを Teal + Orange + 各社ブランド色に刷新、§5.3.1 / §5.3.3 / §5.4.1 / §6.3 / §7.3 / §7.4 に sync oEmbed モデルを正式化、ペースト時のクライアントサイドプロバイダ判定を追加、メモエディタの未保存変更ガードを文書化、`/` ルートを認証なしの静的ランディングページとして固定。
- `docs/landing-spec.md` を大幅に加筆（+311 行）: §3.1 の 2 カラムヒーロー（実物の `/stocks` スクリーンショット）、§3.3 の 1 カラムジグザグ使い方ストーリー、§7 の `/privacy` `/terms` + GitHub + バージョン入りフッターを正式化。
- `docs/oembed-spec.md` と `docs/stock-api-spec.md` の冒頭に sync モデルが canonical である旨のバナーを追加（MVP では Cloudflare Queues を使わない、`pending` / `failed` ステータスを持たない、リクエスト内で指数バックオフリトライ、失敗時は DB ロールバックして 502/504 を返す）。本文は依然として旧キューモデルを記述しており、フル書き換えを `TODO` として `tasks/design-review-2026-04-30.md` の T-A タスクで追跡。

### Removed
- ローカルの retro スナップショットと gstack の状態ファイルをリポジトリに含めないよう、`.context/` と `.gstack/` を `.gitignore` に追加。
