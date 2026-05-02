# Design Review TODOs — 2026-04-30

`/plan-design-review` の結果として浮上した作業項目。`docs/ui-spec.md` および `docs/landing-spec.md` の改訂と並行して以下を実施する。

レビュー対象: docs/ui-spec.md（集中4パス）+ docs/landing-spec.md（全7パス）
スコア推移: ui-spec 7/10 → 9/10、landing-spec 4/10 → 8/10、Overall 5/10 → 8/10

## ブロッカー（実装着手前に必須）

### [T-A] sync モデルへの oembed-spec.md / stock-api-spec.md 書き換え ✅ 完了 (v0.0.3.0)

**Why:** Issue #2 の解決として `POST /api/stocks` を同期モデルに統一する設計判断（ui-spec.md §5.3.1, §7.3）を確定したため、oembed-spec.md と stock-api-spec.md を以下のとおり書き換えた:

- oembed-spec.md: 旧 §5（Queue メッセージスキーマ）/ §6（Consumer 処理フロー）/ §7（リトライポリシー）/ §8（失敗時処理） を §5（同期取得処理フロー）/ §6（同期内・指数バックオフリトライ）/ §7（DB ロールバック）に置換。タイムアウト §9 を §8 に詰めて 3 秒/12 秒予算に整合。Cloudflare Queues / DLQ への参照を全削除。
- stock-api-spec.md: §3.2 処理フロー・§3.5 stock 挿入・§3.6 / §3.7（status=pending → ready）・§3.8（502/504 例追加）を sync モデル版に書き換え。§2.3 エラーコードに `UPSTREAM_NOT_FOUND` / `UPSTREAM_FORBIDDEN` / `UPSTREAM_FAILURE` / `UPSTREAM_INVALID_RESPONSE` / `UPSTREAM_TIMEOUT` を追加。§7 StockResponse の field コメントと StockStatus 型のコメントで「MVP は常に ready」を明記。§8.1 テストケース P1〜P3 を sync 期待値に修正、P14〜P19 のプロバイダ失敗系を追加。
- database.md: stocks.status の説明を「MVP は常に `ready`、`pending` / `failed` は将来非同期化用にスキーマで許容」に更新。ステータス遷移図を MVP（同期モデル）と将来の非同期モデルに分けた。

**実装メモ:** architecture.md §4（シーケンス図）にも旧キューモデルの記述があり、本 PR スコープ外として残置。次タスクで対応する想定。

**Effort:** 〜2h（仕様書のみ、実装は別タスク）

### [T-B] Geist + IBM Plex Sans JP フォント self-host ✅ 完了 (v0.0.2.0)

**Why:** ui-spec.md §8.2 / §8.2.1 で確定した Geist (Vercel 製、SIL OFL) + IBM Plex Sans JP (IBM 製、SIL OFL) を `public/fonts/` に self-host する必要がある。Variable フォント (.woff2) と subset 設定（unicode-range）も含む。

**Effort:** 〜1h（フォントダウンロード + sub-set + preload 設定）

**実装メモ:** IBM Plex Sans JP には Variable 版が存在せず、フル CJK サブセットは 1.7 MB / weight に達するため、Regular + Bold の 2 weight で kana + CJK 記号 + ASCII のみ subset し、漢字は OS フォント（Hiragino → Yu Gothic → Noto Sans JP）にフォールバック。総計 ~210 KB（spec 上の 300 KB バジェット内）。詳細は ui-spec.md §8.2.1 を更新済み。

### [T-C] LP ヒーロースクリーンショット作成

**Why:** landing-spec.md §3.1 で確定した「実物の `/stocks` 画面のスクリーンショット」を hero に配置するため。

- desktop: 1440×900 / @2x: 2880×1800
- mobile: 390×844 / @2x: 780×1688
- フォーマット: WebP + PNG（fallback）
- デモ用アカウントで取得（個人情報なし、3 プロバイダから 1 件ずつ、1〜2 件はメモ入り）

**Effort:** 〜1h（実装後）

### [T-D] LP 使い方ステップスクリーンショット 3 枚

**Why:** landing-spec.md §3.3 の各ステップ用。

1. URL 入力フォームに URL がペーストされ「✓ SpeakerDeck のスライドを認識しました」が表示された状態
2. /stocks 一覧画面で登録直後のカード
3. /stocks/{id} 詳細画面で embed + メモエディタが並んだ状態

各 640×400 / @2x: 1280×800、WebP

**Effort:** 〜1h（実装後）

### [T-E] /privacy と /terms ページの作成

**Why:** landing-spec.md フッター（Issue #7 で確定）からリンクされる。Google OIDC + セッション Cookie を使う以上、トラスト上必要。

**Content:** 個人開発なのでテンプレートをベースに調整。Cookie 利用範囲、データ保持方針、Google ログインで取得する情報を明示。

**Effort:** 〜1h（テンプレート + 編集）

---

## Nice-to-have（ブランド信頼向上、ローンチ前か直後に実施）

### [T-F] window.confirm を inline confirm パターンに置換（削除 UX）

**Why:** ui-spec.md §5.4.3 で `window.confirm("このストックを削除しますか？")` を使用。ネイティブダイアログはブランド体験を損ねる。inline confirm パターン（削除ボタン押下 → 「本当に削除しますか？ [削除する] [キャンセル]」が同じ場所に展開）に置換。

**Effort:** 〜30min（仕様 + 実装）

### [T-G] 401 リダイレクトで return_to を保持

**Why:** セッション切れで /login に飛ばされた後、ログインを完了しても元の /stocks/{id} に戻れない。`/login?return_to=/stocks/abc123` の形式で返り先を保持し、ログイン成功時にリダイレクト。

**Effort:** 〜30min（auth-spec.md + ui-spec.md §5.2 / §6.1 共通エラーハンドリング）

### [T-H] URL 入力フォームの空状態時の視覚優先度強化

**Why:** /stocks ページでストックがゼロのとき、フォームは「ヒーロー扱い」にして「これを使うんだ」とすぐ分かるようにする。`autofocus` + 大きめパディング + ラベル強調。ストックが 1 件以上あれば従来通りのコンパクト表示にトランジション。

**Effort:** 〜30min（CSS のみ）

### [T-I] 空状態コピーの温さ向上 + サンプル URL ボタン

**Why:** ui-spec.md §5.3.2 / §7.2 の空状態が「まだスライドがありません」のシステムメッセージ調。新規ユーザーは「成功とは何か」を知らない。「ようこそ！最初のスライドをストックしてみましょう」+ 各プロバイダのサンプル URL ボタン 3 つを配置（クリックで autofill + submit）。

**Effort:** 〜45min（コピー + ボタン実装）

### [T-J] StockCard タイトル/バッジのモバイル折り返し仕様

**Why:** 長い日本語タイトル + プロバイダバッジが 1 行に収まらない場合の挙動が未定義。`.stock-card-header { display: flex; align-items: flex-start; gap: 12px; }` + `.stock-card-title { flex: 1; min-width: 0; }` + `.stock-card-provider { flex-shrink: 0; }` を ui-spec.md §5.3.3 に追記。

**Effort:** 〜15min（仕様追記のみ）

### [T-K] logout 失敗時 alert() を toast に置換

**Why:** ui-spec.md §4.2 の logout 失敗で `window.alert` を呼ぶ仕様。toast 通知に置換し、サーバー Cookie が残っていてもクライアント側のメモリ上 auth state は強制クリアして /login に飛ばす。

**Effort:** 〜30min（toast コンポーネント新設 + ui-spec 更新）

### [T-L] memo 保存成功フィードバック追加

**Why:** ui-spec.md §5.4.2 の保存成功は「保存しました」テキスト + 3 秒フェードアウトのみ。視覚的フィードバックを強化（textarea ボーダーを 600ms 緑に、`✓` アイコンと「保存しました 14:23」のタイムスタンプ）。

**Effort:** 〜20min（CSS + JS の既存ロジック拡張）

---

## 設計レビューで確定した変更（実装側で参照する設計判断）

以下は設計レビューで `docs/ui-spec.md` および `docs/landing-spec.md` に直接書き込まれた内容。実装時は最新の仕様書を参照すること。

| Issue | 内容 | 反映先 |
|------|------|--------|
| #1 | memo unsaved-changes 保護（ダーティ表示 + beforeunload） | ui-spec.md §5.4.2 |
| #2 | sync oEmbed モデルに統一（pending/failed 廃止） | ui-spec.md §5.3.1, §5.3.3, §5.4.1, §6.3, §7.3, §7.4 + 上記 [T-A] |
| #3 | `/` ルートは静的 LP に統一、認証チェックなし | ui-spec.md §2, §5.1 + landing-spec.md §1 |
| #4 | クライアント側プロバイダ検出 + ペースト即時フィードバック | ui-spec.md §5.3.1 |
| #5 | タイポグラフィを Geist + IBM Plex Sans JP に変更 | ui-spec.md §8.2, §8.2.1, §8.2.2 + 上記 [T-B] |
| #6 | カラーパレットを Teal + Orange + 各社ブランド色に変更 | ui-spec.md §8.2, §5.3.3 |
| #7 | フッターを `/privacy` `/terms` GitHub + version で構成 | ui-spec.md §4.1 + 上記 [T-E] |
| #8 | LP Hero に実物スクリーンショットを配置（2 カラム） | landing-spec.md §3.1 + 上記 [T-C] |
| #9 | LP 使い方を 1 カラム ジグザグストーリーに再設計 | landing-spec.md §3.3 + 上記 [T-D] |
