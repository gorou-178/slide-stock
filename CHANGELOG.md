# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to a 4-digit version format: `MAJOR.MINOR.PATCH.MICRO`.

## [0.0.7.1] - 2026-06-14

### Fixed
- 本番（Cloudflare Pages）の Google ログインが `client_id=undefined` を含む URL になり Google から 404 を返される事象を修正。根本原因は `wrangler.toml` に `pages_build_output_dir` が無く、Wrangler が「`Ignoring configuration file for now`」と警告して本ファイルを完全に無視していたこと。結果として `[vars] CALLBACK_URL` と `[[d1_databases]] DB` も本番に反映されていなかった。`wrangler.toml` に `pages_build_output_dir = "./dist"` を追加し、Pages モードの設定ファイルとして正しく解釈されるようにした。`main = "worker/index.ts"` は Pages では参照されない Workers 専用設定なので削除。
- 本ファイルの修正だけでは Secrets は引き継がれないため、`docs/auth-spec.md` §9 本番環境を全面書き換え。`wrangler secret put`（Workers モード）から `wrangler pages secret put --project-name=slide-stock`（Pages モード）への切り替えを明示し、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SESSION_SECRET` の個別登録手順をコマンドつきで記載。Cloudflare Dashboard 経由でも同等であることも明記。

### Added
- `worker/handlers/auth.ts` に `findMissingAuthEnv(env)` ヘルパーと `configError(missing, action)` レスポンスを追加。`handleLogin` / `handleCallback` の冒頭で `CALLBACK_URL` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SESSION_SECRET` が `string` で空文字列でないことを検証し、1 つでも欠けたら **500 `CONFIG_ERROR`** を即返す。`console.error(action="auth_config_error", handler=..., missing=[...], hint=...)` の構造化ログで欠けたキー名と参照先 spec を残す。これで再度 Secrets 未設定で再デプロイされても Google にブロークン URL を投げる前にサーバーログから即気づける防御線になる。
- `worker/handlers/auth.test.ts` に CONFIG_ERROR ガードのテスト **5 件**を追加: `GOOGLE_CLIENT_ID` 未設定で 500 が返り Location ヘッダーが付かないこと / `CALLBACK_URL` 未設定 / 空文字も未設定として扱う / `handleCallback` でも同じガードが効くこと / 複数キーが同時に欠けたとき `missing` 配列にすべて列挙されること。

### Changed
- `wrangler.toml` のコメントを「Pages 用 wrangler 設定」「Secrets は別建てで `wrangler pages secret put` を使う」「`pages_build_output_dir` を忘れると本ファイル全体が無視されて事故になる」という運用上の落とし穴と対処を残す形に書き換え。

### Notes
- PATCH バンプ（0.0.7.0 → 0.0.7.1）。挙動の修正と防御層追加のみで、公開 API の正常系挙動は変えない。
- **本 PR マージだけでは本番は復旧しない**。Track B として下記コマンドの実行が別途必要:
  ```
  wrangler pages secret put GOOGLE_CLIENT_ID --project-name=slide-stock
  wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=slide-stock
  wrangler pages secret put SESSION_SECRET --project-name=slide-stock
  ```

## [0.0.7.0] - 2026-06-14

design-review-2026-04-30 の Nice-to-have タスク 4 件をまとめて完了:
**T-G**（return_to）/ **T-J**（StockCard モバイル折り返し）/ **T-L**（memo 保存フィードバック）/ **T-K**（logout toast）。

### Added — T-G: 401 リダイレクトで return_to を保持

- `worker/handlers/auth.ts` に `isSafeReturnTo(value)` ヘルパーを追加（`/` で始まり `//` で始まらない、改行を含まない相対パスのみ許容）。`handleLogin` で `?return_to=<相対パス>` を受け取って検証し、有効な値だけ `__Host-auth_return_to` Cookie に `encodeURIComponent` で保存（HttpOnly / Secure / SameSite=Lax / Max-Age 300 秒 / Path=/、`__Host-auth_state` と同じ属性）。`handleCallback` で同 Cookie を読み、`decodeURIComponent` 後に再検証して有効ならそのパスへ、無効なら従来どおり `/` へリダイレクト。`__Host-auth_return_to` Cookie は採用したかどうかにかかわらず Max-Age=0 で必ず削除。
- `src/lib/api-client.ts` に `redirectToLogin()` を新規追加。現在の `pathname + search` を `return_to` クエリとして `/login?return_to=<encoded>` に遷移する。`/` と `/login*` 自体からは `return_to` を付けない（無限ループ／無意味な戻り先の回避）。
- `src/pages/login.astro` で `?return_to` を読み、(a) 既に認証済みなら `/stocks` の代わりに `return_to` に遷移、(b) 「Google でログイン」リンクの href を `/api/auth/login?return_to=<encoded>` に書き換える。クライアント側でも同じ検証ルール（同一オリジンの相対パスのみ）を適用してサーバー側の二重防御とする。
- `src/pages/stocks.astro` / `src/pages/stock-detail.astro` の 401 リダイレクト合計 7 箇所を `window.location.href = '/login'` から `redirectToLogin()` 呼び出しに置き換え。Navbar のログアウト成功時は意図的に `return_to` を付けない（再ログイン後はフレッシュな `/stocks` に着地させる方が自然）。
- `worker/handlers/auth.test.ts` に return_to 関連の **10 件のテスト** を追加。`handleLogin` 側（return_to 採用 / Cookie 属性 / 未指定 / `//evil.com` / 絶対 URL / 先頭スラッシュなしの 6 件）と `handleCallback` 側（有効値で採用 / `//evil.com` / 絶対 URL / 空文字 / Cookie 常時削除の 5 件）を網羅。オープンリダイレクト対策を回帰防止できる体制に。
- `docs/auth-spec.md` §3.1 / §3.2 を return_to 仕様で更新。`docs/ui-spec.md` §5.2（login）に return_to クエリパラメータの説明、§6.2 に `redirectToLogin()` の説明と二重検証ルールを追記。

### Added — T-J: StockCard モバイル折り返し仕様

- `public/styles/global.css` の `.stock-card-header` を `display: flex; align-items: flex-start; gap: var(--space-md)` に整理し、`justify-content: space-between` を撤去。`.stock-card-title` に `flex: 1; min-width: 0; overflow-wrap: anywhere` を付与して長い日本語タイトルでも折り返しを許可。`.stock-card-header .badge` に `flex-shrink: 0` を付与してバッジを縮ませない／改行させない。
- `docs/ui-spec.md` §5.3.3 に「レイアウト（モバイル折り返し対応、T-J）」セクションを追加。flex の構成と `min-width: 0` が必要な理由（flexbox 既定 `min-width: auto` の解除）まで仕様として固定。

### Added — T-L: memo 保存成功フィードバック強化

- `src/pages/stock-detail.astro` の memo 保存成功ハンドラに視覚的フィードバックを追加。textarea に `.memo-saved` クラスを 600ms 付与（緑ボーダー + リング）。ステータステキストを `保存しました` から `✓ 保存しました HH:MM`（クライアント時計の HH:MM ゼロ埋め）に変更し、3 秒後フェードアウトの既存挙動は維持。
- `public/styles/global.css` に `.memo-textarea.memo-saved { border-color: var(--color-success); box-shadow: 0 0 0 2px rgba(24, 128, 56, 0.25); }` を追加。`prefers-reduced-motion: reduce` 環境では transition を抑制。
- `docs/ui-spec.md` §5.4.2 の保存処理フローを更新。「保存成功フィードバック（T-L、視覚的強化）」表で textarea ボーダー点灯・タイムスタンプ・`aria-live` の継続・モーション抑制を仕様化。

### Added — T-K: logout 失敗を toast 通知に置き換え

- `src/layouts/BaseLayout.astro` の末尾に単一の `<div id="toast" role="status" aria-live="polite" hidden></div>` を追加。グローバル 1 箇所にだけ存在する toast 受け皿。
- `src/components/Navbar.astro` にインラインの `showToast(message, kind, durationMs)` ヘルパーを追加（スタックなし、連続表示時は前回タイマーを clear して上書き、デフォルト 4 秒）。ログアウト失敗時とネットワーク失敗時の `alert()` 呼び出しを `showToast(message, 'error')` に置換。
- `public/styles/global.css` に `.toast` / `.toast-error` / `.toast-success` を追加。右下固定、`var(--shadow-md)`、`border-left: 4px solid` の色違いで種別を表現。`max-width: 599px` では左右パディングを画面端まで広げる。
- `docs/ui-spec.md` §4.2 のログアウト失敗時の挙動を「コンソールにエラー記録、ユーザーにはアラート表示」から「toast 通知でメッセージ表示」に更新。toast の HTML 配置（BaseLayout 末尾）・kind（error / success）・スタックなし・モバイルレイアウトの設計判断を仕様として明文化。

### Notes
- MINOR バンプ（0.0.6.0 → 0.0.7.0）。return_to は新規機能、UX 改善 3 件、4 件分の仕様追記を含むため。
- 残タスク: `tasks/design-review-2026-04-30.md` のブロッカー T-C / T-D（LP スクリーンショット）と、Nice-to-have T-F / T-H / T-I（inline confirm / 空状態強化 / サンプル URL ボタン）。

## [0.0.6.0] - 2026-06-14

### Added
- T-E 完了: `src/pages/privacy.astro` を新規追加。`ui-spec.md` §4.1 の footer から参照されるプライバシーポリシーページ。Google OIDC で取得する情報（`sub` / `email` / `name`）、`__Host-session` / `__Host-auth_state` Cookie の利用範囲、Cloudflare D1 への保管、第三者提供なし（プロバイダ oEmbed へのスライド URL 送信は明記）、データ保持期間、削除依頼の連絡先（GitHub Issues）、HTTPS / CSRF state / prepared statement 等のセキュリティ対策を 10 セクションで明示。最終更新日 2026-06-14。
- T-E 完了: `src/pages/terms.astro` を新規追加。`ui-spec.md` §4.1 の footer から参照される利用規約ページ。個人開発・無償・無保証であること、Google アカウント前提のアカウント登録、サービス内容（URL ストック / メモ / 削除）、禁止事項（権利侵害 / 非公開スライドの無断登録 / 過度な負荷 / 脆弱性悪用 / なりすまし / 公序良俗違反）、知的財産の帰属（スライドは原著作者、本サービスのコードは GitHub のライセンスに従う）、免責、サービス終了の事前告知、準拠法（日本法 / 東京地方裁判所第一審）の 10 セクション。最終更新日 2026-06-14。
- `astro.config.mjs` の `vite.define` で `__APP_VERSION__` 定数を build-time に注入する仕組みを追加。`VERSION` ファイルの内容を `readFileSync` で読み込み、`BaseLayout` の footer で `v{appVersion}` として表示する（ui-spec.md §4.1）。`src/env.d.ts` に `declare const __APP_VERSION__: string` を追記。
- `public/styles/global.css` に `.legal-page` / `.legal-header` / `.legal-meta` / `.legal-back` のスタイルを追加。max-width 720px、各セクション間に余白、`<code>` を `--color-surface` のチップ風にスタイル。`.site-footer .footer-nav` / `.footer-meta` / `.footer-version` のクラス別スタイルも追加し、nav は flex で中央寄せ、version は mono フォントで表示。

### Changed
- `src/layouts/BaseLayout.astro` の footer を `ui-spec.md` §4.1 の仕様に整合させた。旧 `<p>&copy; 2025 Slide Stock</p>` を、`<nav class="footer-nav">` に `/privacy` / `/terms` / GitHub の 3 リンク、`<p class="footer-meta">` に動的な著作権年（`new Date().getFullYear()`）と `v{__APP_VERSION__}` を含む構造に置き換え。これで spec の footer 構造と実装が完全に一致する。
- `docs/ui-spec.md` §5.3.1 の「両仕様も同期モデルに更新が必要 — TODO」のスタール表記を削除し、「両仕様とも sync モデル + rollback semantics に整合済み、ADR-009 §4-2」へ書き換え。ADR-009 シリーズ完了に伴う注記の整合。

### Notes
- MINOR バンプ（0.0.5.1 → 0.0.6.0）。新規公開ページ 2 つの追加と footer の挙動変更があるため。
- ローンチ前の法的ブロッカー T-E は完了。残りのブロッカーは T-C / T-D（LP スクリーンショット、LP リライトと合わせて取る予定）。

## [0.0.5.1] - 2026-06-14

### Added
- ADR-009 PR-D 完了: `src/lib/api-client.ts` に `formatCreateStockError(err: ApiError): string` を新規追加。`POST /api/stocks` のエラー code を `ui-spec.md` §7.4 のユーザー表示メッセージ表にマッピングする SSOT 関数。`UPSTREAM_NOT_FOUND` / `UPSTREAM_FORBIDDEN` を「スライドが見つかりません。URL が正しいか、スライドが公開されているか確認してください。」、`UPSTREAM_FAILURE` / `UPSTREAM_INVALID_RESPONSE` / `UPSTREAM_TIMEOUT` を「プロバイダから応答がありません。時間をおいて再度お試しください。」、`INTERNAL_ERROR` を「エラーが発生しました。しばらくしてからやり直してください。」、`CLIENT_TIMEOUT` を「タイムアウトしました。もう一度お試しください。」、`NETWORK_ERROR` を「サーバーに接続できません。ネットワーク接続を確認してください。」、URL バリデーション系（`INVALID_URL` / `UNSUPPORTED_PROVIDER` / `INVALID_FORMAT` / `UNSUPPORTED_URL_TYPE` / `INVALID_REQUEST`）は API の `error` フィールドをそのまま返す。
- `src/lib/api-client.ts` の `createStock` にクライアント側 15 秒タイムアウト（ui-spec.md §7.3）を追加。`AbortSignal.timeout(15_000)` を `fetch` に渡し、タイムアウト時は `ApiError(0, 'CLIENT_TIMEOUT', ...)`、その他の `fetch` 例外（ネットワーク失敗）は `ApiError(0, 'NETWORK_ERROR', ...)` を throw する。サーバー側合計予算 12 秒の上に 3 秒のバッファを設け、サーバーレスポンスに余裕を持たせる定義通り。
- `src/lib/api-client.test.ts` を新規追加。`formatCreateStockError` の全分岐をテスト 9 件で網羅し、spec §7.4 が SSOT として実装に反映されているか担保する。spec の表が更新されたら本テストも追従させる運用とする。

### Changed
- `src/pages/stocks.astro` の URL 送信エラーハンドリングを `formatCreateStockError` に差し替え。旧実装は `409` を「このスライドは既にストック済みです」にハードコード、それ以外は API の `error` メッセージをそのまま表示するだけだったが、新仕様の UPSTREAM_* 各 code に対するメッセージ表（ui-spec.md §7.4）に整合させた。`err instanceof ApiError` でガードし、`401` のみ別経路でログインリダイレクトする。`urlInput.value` をクリアしない（入力値保持）挙動も明示コメント化。

### Notes
- spec ↔ 実装の整合シリーズ（ADR-009）はこれで PR-A〜PR-D が完了。`docs/oembed-spec.md` / `docs/stock-api-spec.md` / `docs/ui-spec.md` と worker・client のすべてのレイヤーが揃った。GET ハンドラ（`worker/handlers/stocks.ts`）には `status` 参照や UPSTREAM_* 関連の挙動はないため変更不要だった。詳細画面（`src/pages/stock-detail.astro`）の `embed_url === null` フォールバックは ui-spec.md §5.3.1 の「データ不整合（仕様外）」記述に従う defensive コードとして既存挙動を維持。
- バージョンは PATCH バンプ（0.0.5.0 → 0.0.5.1）。PR-C で API の公開挙動は確定済みで、本 PR は UI 側の追従なので互換性影響なし。

## [0.0.5.0] - 2026-06-14

### Changed
- ADR-009 PR-C 完了: `worker/handlers/stock-create.ts` を fetch-first + rollback semantics に切り替え。重複チェック通過 → `fetchWithRetry` で同期 oEmbed 取得 → 成功時のみメタデータ充足済みで **1 回だけ INSERT** という新フローへ刷新（spec `stock-api-spec.md` §3.5 / §3.6、`oembed-spec.md` §5、ADR-009 §4-2）。旧 optimistic insert（INSERT 後にメタデータ UPDATE、失敗時は `title=null` で stock を残す）の経路を完全に削除。
- oEmbed 取得エラーを HTTP レスポンスにマッピング（spec §3.5 / §3.8、ADR-009 §4-2）: `UpstreamNotFoundError` → 400 `UPSTREAM_NOT_FOUND`、`UpstreamForbiddenError` → 400 `UPSTREAM_FORBIDDEN`、`UpstreamInvalidResponseError` → 502 `UPSTREAM_INVALID_RESPONSE`、`UpstreamFailureError` → 502 `UPSTREAM_FAILURE`、`UpstreamTimeoutError` → 504 `UPSTREAM_TIMEOUT`。それ以外の想定外 `Error` は 500 `INTERNAL_ERROR`。`console.error` の `oembed_fetch_failed` ログには `errorName` を含め、プロバイダ仕様変更の検知を容易にした。
- D1 INSERT エラーの扱いを spec §3.6 / ADR-009 §4-4 に揃えた: UNIQUE 制約違反（並列レース）→ 409 `DUPLICATE_STOCK`、その他の D1 例外 → 500 `INTERNAL_ERROR`（`console.error` で `stock_insert_failed` ログ）。いずれも INSERT 中断のみで、半端なデータは残らない。
- `worker/lib/oembed.ts` に `PermanentError` のサブクラス `UpstreamNotFoundError` / `UpstreamForbiddenError` / `UpstreamInvalidResponseError` を追加し、handler が `instanceof` で `UPSTREAM_*` を判別できるようにした。各 fetcher の throw サイト（404 / 401・403 / レスポンス形式不正）を該当サブクラスに置き換え。`instanceof PermanentError` での「リトライしない」判定は従来どおり通る（サブクラス継承のため）。

### Removed
- `worker/handlers/stocks.test.ts` から旧 P5「oEmbed 取得失敗でも stock は作成される（メタデータ null）」を削除。fetch-first + rollback semantics 下では成立しないテストケースのため。

### Added
- `worker/handlers/stocks.test.ts` にプロバイダエラー UPSTREAM_* マッピングのテスト 10 件を追加（spec §8.1 P14〜P18 / P22〜P26）: SpeakerDeck 404 → `UPSTREAM_NOT_FOUND` / Docswell 403 → `UPSTREAM_FORBIDDEN` / SpeakerDeck リトライ上限到達 → `UPSTREAM_FAILURE` / Docswell 合計予算切れ → `UPSTREAM_TIMEOUT` / SpeakerDeck 形式不正 → `UPSTREAM_INVALID_RESPONSE`、および Google Slides の `<title>` 欠落 / 5xx / タイムアウト / 401・403 / 404 の 5 ケース。各テストで「該当 `canonical_url` の stock が DB に残らない」ことを `findStock` ヘルパーで検証。
- `worker/handlers/stocks.test.ts` に D1 INSERT 失敗のテスト 2 件を追加（spec §8.1 P20 / P21）: 並列レースの UNIQUE 制約違反 → 409 `DUPLICATE_STOCK`、D1 一般エラー → 500 `INTERNAL_ERROR`。fake `StockEnv` を構築し、SELECT は通すが INSERT で指定したエラーを投げる形でシミュレートする。
- `worker/handlers/stocks.test.ts` / `worker/handlers/integration.test.ts` のモック層で `fetchWithRetry` を「fetcher を 1 回だけ呼ぶ」passthrough 実装に差し替えた。ハンドラ単体テストでは UPSTREAM_* マッピングに集中し、リトライ／バックオフの挙動は `worker/lib/oembed.test.ts` で担保する分担。
- `worker/handlers/integration.test.ts` の失敗シナリオを fetch-first 前提に書き換え。旧「oEmbed 取得失敗 → stock は作成されるがメタデータ null」を「oEmbed 取得失敗 → stock は作成されない、502 `UPSTREAM_FAILURE` が返る」へ変更し、DB に該当 `canonical_url` の stock が残らないことを検証。

### Notes
- ハンドラの公開挙動（HTTP ステータス / `code`）が変わるため MINOR バンプ（0.0.4.1 → 0.0.5.0）。UI（PR-D）側のエラーメッセージ表示更新は別 PR で対応する（ui-spec.md §7.4）。

## [0.0.4.1] - 2026-06-14

### Added
- `worker/lib/oembed.ts` に同期内リトライ機構 `fetchWithRetry(fetcher, totalBudgetMs?)` を追加（ADR-009 §4-2 / oembed-spec.md §6）。指数バックオフ 3 回（0ms → 500ms → 1500ms）、1 試行 3 秒タイムアウト、合計予算 12 秒。`PermanentError` は即 throw（リトライしない）、それ以外の `Error` は一時的エラーとしてリトライ。全試行失敗で `UpstreamFailureError`、合計予算超過で `UpstreamTimeoutError` を throw。両エラークラスも新規エクスポート。後段の handler（PR-C）が `instanceof` で 502 / 504 にマッピングする想定。
- `worker/lib/oembed.test.ts` に `fetchWithRetry` の挙動を網羅するテストを追加（R1〜R7）: 1 回目成功で 1 回しか呼ばれない / 1 回目失敗→2 回目成功 / 3 連続失敗→`UpstreamFailureError`（cause に最後の Error）/ `PermanentError` は即 throw / abort 系 Error はリトライ対象 / 合計予算切れ→`UpstreamTimeoutError` / 各 attempt に `AbortSignal` が渡されること。Google Slides の hard failure 化を網羅する G1〜G6 ケースも追加（サフィックス除去後 title 空 → `PermanentError` / `<title>` タグなし → `PermanentError` / 404 / 403 / 401 → `PermanentError` / 500 → 一時的 Error / `Accept-Language: ja` ヘッダが付与される）。`fetch` に `signal` が渡されるアサートも追加。

### Changed
- `worker/lib/oembed.ts` の 3 つの fetcher（`fetchSpeakerDeckMetadata` / `fetchDocswellMetadata` / `fetchGoogleSlidesMetadata`）のシグネチャに `signal: AbortSignal` を追加し、内部の `fetch` に直接渡す形に統一。従来の内部 `AbortController` + 10 秒タイマー方式の `fetchWithTimeout` ヘルパーを `fetchWithSizeLimit(url, maxSize, signal, init?)` に置き換え、タイムアウトは呼び出し側の signal に一本化（oembed-spec.md §5.2 / §8）。
- `fetchGoogleSlidesMetadata` を ADR-009 §4-5 の hard failure 方針に揃えた。従来の try/catch で「タイトル取得失敗時も `title=null` で続行」とする軟性失敗ロジックを完全に削除し、spec §4.3 の `fetchGoogleSlidesTitle` 仕様に置換（401/403/404/`<title>` 欠落/抽出後空文字 → `PermanentError`、5xx・ネットワーク失敗 → 一般 `Error` でリトライ対象）。`Accept-Language: ja` と `redirect: "follow"` を付与。`console.warn` ログ（`google_slides_title_fetch_failed`）は廃止し、上位 handler の `console.error(oembed_fetch_failed)` に統一。
- `worker/handlers/stock-create.ts` の `fetchMetadataByProvider` シグネチャに `signal: AbortSignal` を追加し、呼び出し側で `AbortSignal.timeout(12_000)` を渡すよう最小修正。fetch-first 化（INSERT 順序の入れ替え）と `UPSTREAM_*` HTTP レスポンスへのマッピングは後続 PR-C のスコープ。本 PR では handler の挙動は変えず、メタデータ取得失敗時は従来どおり catch して null メタデータで stock を残す（既存テスト P5 が引き続き緑）。
- `worker/handlers/stocks.test.ts` の P1（SpeakerDeck 登録）で `fetchSpeakerDeckMetadata` の呼び出し検証を `toHaveBeenCalledWith(url, expect.any(AbortSignal))` に更新。新シグネチャに追従。
- `worker/security-verification.test.ts` の T-601（embed URL ドメインバリデーション）テストで `realFetchDocswellMetadata` 呼び出しに `AbortSignal.timeout(5_000)` を追加。新シグネチャに追従。

### Other
- `tasks/T-A3-oembed-retry.md` を追加。本 PR の作業内容と PR-C 以降との分担を整理した実装プラン。

### Added
- `docs/adr/009-spec-ssot-and-sync-rollback.md` を新規作成。プロジェクトのプロセス原則として「`docs/*-spec.md` を SSOT、ADR は断面スナップショット、spec と実装が矛盾したら実装を spec に合わせる」を確定。あわせて同期 oEmbed 取得のセマンティクスを「fetch-first + insert-on-success / 失敗時は INSERT しない（DB ロールバック相当） / `UPSTREAM_*` 5 種を 400/502/504 で返却 / 指数バックオフ 3 回 / 各 3 秒 / 合計 12 秒予算」に統一。`status` カラムは現時点で意味のない情報であるため YAGNI 原則で **廃止のまま維持**（migration 0004 は作らない、§4-3）。spec で扱いが未定義だった「並列リクエストでの UNIQUE 制約競合」「D1 INSERT 自体の失敗」の挙動も §4-4 で明文化（前者 → 409 `DUPLICATE_STOCK`、後者 → 500 `INTERNAL_ERROR`、いずれも半端なデータは残らない）。後続 PR-B〜PR-D の実装計画もここに整理。
- `CLAUDE.md` に「Spec / ADR / 実装の関係」セクションを追加。spec が SSOT、ADR は断面、impl は spec に追従する原則と、監査時の正しいフロー（spec → impl 比較 → impl の修正タスク起票）を明文化。

### Changed
- `docs/adr/004-remove-queue.md` のステータスを「Proposed」から「Superseded by ADR-009」に変更。Queue 廃止 + 同期化という大方針は維持されるが、本 ADR-004 が採用した optimistic insert + best-effort 取得セマンティクスは ADR-009 で逆転される旨を明記。`status` カラム削除（migration 0003）は ADR-009 でも維持されるため Supersede 対象外。本 ADR は歴史記録として残す。
- `docs/oembed-spec.md` / `docs/stock-api-spec.md` / `docs/database.md` / `docs/ui-spec.md` から `status` フィールド・`StockStatus` 型・`s.status` SELECT 参照・`status='ready'` 等を全削除し、ADR-009 §4-3 の「YAGNI で廃止」方針と整合させた。`StockResponse` 型と `StockListItem` 型から `status` フィールドを除去、API レスポンス JSON 例からも削除。`stocks.status` カラムは migration 0003 後の状態（カラム不在）を canonical として固定。
- `docs/stock-api-spec.md` §3.4 / §3.5 / §3.6 / §3.8 / §8.1 を ADR-009 §4-4 に整合。並列レースで UNIQUE 制約違反が発生した場合の挙動（409 `DUPLICATE_STOCK`）と、INSERT 中の一般 D1 エラー（500 `INTERNAL_ERROR`）を spec として明文化。テストケースに P20（並列レース）・P21（D1 INSERT 失敗）を追加し、いずれも DB に当該 canonical_url の stock が残らないことを期待値に含める。
- `docs/database.md` のステータス遷移図を削除し、`status` カラム廃止を canonical として記述。stock のライフサイクルは「存在しない → 存在する（メタデータ充足）」のみと整理。インデックス方針表に `(user_id, canonical_url)` UNIQUE（migration 0002）を追加し、並列レース時の最終防衛線である旨を明記。
- `docs/ui-spec.md` §7.4 のエラー状態表を spec の `UPSTREAM_*` 5 種に細分化（`UPSTREAM_NOT_FOUND` / `UPSTREAM_FORBIDDEN` を「スライドが見つかりません」、`UPSTREAM_FAILURE` / `UPSTREAM_INVALID_RESPONSE` / `UPSTREAM_TIMEOUT` を「プロバイダから応答がありません」、`INTERNAL_ERROR` を「エラーが発生しました」にマッピング）。並列レースの 409 もユーザーから見ると事前重複と同じ表示になる旨を併記。
- `docs/architecture.md` を sync モデルに整合（v0.0.3.0 / T-A のフォローアップ）。システム全体構成図から Cloudflare Queues / Queue Consumer を削除し、`API → oEmbed Provider` の同期取得エッジに置換。スライド登録のシーケンス図を「pending INSERT → enqueue → 非同期 UPDATE」から「重複チェック → 同期 oEmbed 取得（指数バックオフ 3 回 / 各 3 秒 / 合計 12 秒予算）→ 成功時のみ INSERT」に書き換え、リトライ／恒久エラー／成功の各分岐を明示。技術構成セクションの「非同期処理」を「oEmbed メタデータ取得（同期）」に改題し、リトライ予算と失敗時の DB ロールバック方針を記述。コスト最適化方針の Cloudflare Queues 行を「MVP では使用しない（同期モデル）」へ更新。
- ADR-009 §4-5 で Google Slides の「軟性失敗（soft failure）」概念を撤回。title は検索性・一覧性の中核情報のため、HTML タイトル取得失敗時も他プロバイダ（SpeakerDeck / Docswell）と同等の hard failure として扱う方針に統一。`oembed-spec.md` §4 を全面書き換え（§4.3 タイトル取得を try/catch + null 返しから throw / `PermanentError` / 一般 `Error` に変更、§4.5 「常に成功」を撤回、エラーケース表を §6.3 と整合）。§5.1 の mermaid フローで Google Slides も「成功 / 恒久エラー / リトライ上限到達」の 3 分岐を明示。§6.3 と §8 のタイムアウト表を 3 秒 / 合計 12 秒予算に統一。`stock-api-spec.md` §8.1 P3 の正常系を「有効な `<title>` を含む」に厳格化、軟性失敗 P4b を削除。テスト P22〜P26 を追加（HTML title 欠落 → 502 `UPSTREAM_INVALID_RESPONSE` / 5xx 連続失敗 → 502 `UPSTREAM_FAILURE` / タイムアウト → 504 `UPSTREAM_TIMEOUT` / 401・403 → 400 `UPSTREAM_FORBIDDEN` / 404 → 400 `UPSTREAM_NOT_FOUND`、いずれも stock は作成しない）。`ui-spec.md` §5.3.3 / §5.4.1 / §7 StockResponse 型コメント / `database.md` のライフサイクル記述からも軟性失敗の言及を削除。

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
