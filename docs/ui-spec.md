# フロントエンド UI 仕様

## 1. 概要

本ドキュメントはスライドストックサービスの MVP フロントエンド UI を定義する。
Astro（TypeScript）で構築し、Cloudflare Pages にデプロイする。

### 前提ドキュメント

- [CLAUDE.md](../CLAUDE.md) — MVP 要件（セクション 7: 画面構成）
- [docs/architecture.md](architecture.md) — システム全体構成
- [docs/auth-spec.md](auth-spec.md) — 認証・セッション管理
- [docs/stock-api-spec.md](stock-api-spec.md) — Stock API 仕様
- [docs/memo-api-spec.md](memo-api-spec.md) — Memo API 仕様
- [docs/oembed-spec.md](oembed-spec.md) — oEmbed / Queue 処理仕様

### 設計原則

1. **JS 最小構成**: Astro のアイランドアーキテクチャを活かし、インタラクティブ部分のみクライアント JS を使用
2. **素の CSS**: CSS フレームワークは導入せず、素の CSS でスタイリング（依存ゼロ・軽量）
3. **プログレッシブエンハンスメント**: JS なしでも基本構造が壊れないセマンティック HTML
4. **モバイルファースト**: レスポンシブ対応はモバイルを基準に拡張

---

## 2. ページ構成（URL ルーティング）

| パス | ページ | 認証 | 説明 |
|------|--------|------|------|
| `/` | ランディングページ | 不要 | 静的 LP（認証チェックなし）。詳細は [landing-spec.md](landing-spec.md) を参照 |
| `/login` | ログインページ | 不要 | Google Login ボタン |
| `/stocks` | 一覧画面 | 必須 | URL 入力フォーム + ストック一覧 |
| `/stocks/[id]` | 詳細画面 | 必須 | embed 表示 + メモ編集 |

### 認証リダイレクト

- **未認証ユーザーが `/stocks` または `/stocks/[id]` にアクセス**: `/login` にリダイレクト
- **認証済みユーザーが `/login` にアクセス**: `/stocks` にリダイレクト
- **`/`（ランディング）は認証チェックを行わない**: 認証済みユーザーも未認証ユーザーも同じ静的 LP を見る。LP 上の `/stocks` CTA はクリック後に `/stocks` 側で認証チェックされる（未認証なら `/login` にリダイレクト）

認証状態の判定はクライアントサイド JS で行う:
1. `GET /api/me` を呼び出し
2. 200 → 認証済み（ユーザー情報を取得）
3. 401 → 未認証

> **注意:** セッション Cookie は `Path=/api`（HttpOnly）のため、JS から直接 Cookie を読めない。
> 認証判定は必ず `/api/me` エンドポイント経由で行う。

---

## 3. コンポーネント階層

```
src/
├── layouts/
│   └── BaseLayout.astro          # 共通レイアウト
├── components/
│   ├── Navbar.astro              # ナビゲーションバー
│   ├── URLInputForm.astro        # URL 入力フォーム
│   ├── StockCard.astro           # ストックカード（一覧用）
│   ├── StockList.astro           # ストック一覧コンテナ
│   ├── EmbedViewer.astro         # oEmbed iframe 表示
│   ├── MemoEditor.astro          # メモ編集テキストエリア
│   ├── EmptyState.astro          # 空状態表示
│   ├── LoadingSpinner.astro      # ローディング表示
│   └── ErrorMessage.astro        # エラーメッセージ表示
├── pages/
│   ├── index.astro               # トップページ
│   ├── login.astro               # ログインページ
│   ├── stocks.astro              # 一覧画面
│   └── stocks/
│       └── [id].astro            # 詳細画面
└── lib/
    └── api-client.ts             # API 呼び出しヘルパー
```

---

## 4. 共通レイアウト: BaseLayout

### 4.1 BaseLayout.astro

全ページで共有するレイアウト。

**Props:**

| prop | 型 | 必須 | 説明 |
|------|------|------|------|
| `title` | `string` | Yes | `<title>` に設定するページタイトル |
| `showNavbar` | `boolean` | No（デフォルト: `true`） | ナビバーの表示/非表示 |

**構成:**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} - Slide Stock</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/styles/global.css" />
</head>
<body>
  {showNavbar && <Navbar />}
  <main>
    <slot />  <!-- ページ固有のコンテンツ -->
  </main>
  <footer class="site-footer">
    <nav class="footer-nav" aria-label="フッターナビゲーション">
      <a href="/privacy">プライバシーポリシー</a>
      <a href="/terms">利用規約</a>
      <a href="https://github.com/gorou-178/slide-stock" target="_blank" rel="noopener noreferrer">GitHub</a>
    </nav>
    <p class="footer-meta">
      &copy; <span class="current-year">2026</span> Slide Stock
      <span class="footer-version" aria-label="バージョン">v{BUILD_VERSION}</span>
    </p>
  </footer>
</body>
</html>
```

### 4.2 Navbar.astro

**表示要素:**

| 要素 | 説明 |
|------|------|
| サービス名 | 「Slide Stock」テキスト。`/stocks` へのリンク |
| ユーザー名 | ログインユーザーの `name` を表示（`/api/me` で取得） |
| ログアウトボタン | `POST /api/auth/logout` を呼び出し → `/login` にリダイレクト |

**HTML 構造:**

```html
<nav class="navbar" role="navigation" aria-label="メインナビゲーション">
  <a href="/stocks" class="navbar-brand">Slide Stock</a>
  <div class="navbar-right">
    <span id="user-name" class="navbar-user"></span>
    <button id="logout-btn" type="button" class="btn-logout">ログアウト</button>
  </div>
</nav>
```

**ログアウト処理（クライアント JS）:**

```
1. POST /api/auth/logout を fetch
2. 成功 → window.location.href = "/login"
3. 失敗 → コンソールにエラー記録、ユーザーにはアラート表示
```

---

## 5. ページ別仕様

### 5.1 トップページ（`/` — index.astro）

**目的:** サービスの紹介と CTA を提供する静的ランディングページ。

詳細は [landing-spec.md](landing-spec.md) を参照。本仕様書では `/login` 以降のアプリケーション UI のみ定義する。

> **設計判断:** 旧仕様では `/` で認証チェックして振り分ける設計だったが、シンプルさ・CDN キャッシュ可能性・パフォーマンスを優先し、`/` は認証チェックなしの静的 LP に統一した。

### 5.2 ログインページ（`/login` — login.astro）

**目的:** Google OIDC ログインへの誘導。

**レイアウト:** BaseLayout（`showNavbar: false`）

**動作:**
1. クライアント JS で `GET /api/me` を呼び出し
2. 200（認証済み）→ `/stocks` にリダイレクト
3. 401 → ログインボタンを表示（初期状態はローディング → 判定後にボタン表示）

**表示:**

```html
<div class="login-container">
  <h1>Slide Stock</h1>
  <p>Google アカウントでログインしてください</p>
  <a href="/api/auth/login" class="btn-google-login">
    Google でログイン
  </a>
</div>
```

**Google ログインボタン:**
- `<a>` タグで `/api/auth/login` にリンク（サーバーサイドリダイレクト方式）
- ボタンスタイル: 白背景 + 細枠線 + Google カラー
- ホバー時に軽い影を追加

**スタイル:**
- 画面中央に垂直・水平中央配置

### 5.3 一覧画面（`/stocks` — stocks.astro）

**目的:** ストックの登録・一覧表示。

**レイアウト:** BaseLayout（`showNavbar: true`）

**認証チェック:**
1. `GET /api/me` を呼び出し
2. 401 → `/login` にリダイレクト
3. 200 → ユーザー名を Navbar に反映し、ストック一覧を取得

**ページ構成:**

```
┌─────────────────────────────────┐
│ [Navbar]                         │
├─────────────────────────────────┤
│                                  │
│  ┌───────────────────────────┐   │
│  │ URL入力フォーム            │   │
│  │ [________________] [追加]  │   │
│  └───────────────────────────┘   │
│                                  │
│  ストック一覧                     │
│  ┌───────────────────────────┐   │
│  │ StockCard                  │   │
│  │ タイトル / プロバイダ       │   │
│  │ メモ抜粋                   │   │
│  │ [詳細を見る] [元URLを開く]  │   │
│  └───────────────────────────┘   │
│  ┌───────────────────────────┐   │
│  │ StockCard ...              │   │
│  └───────────────────────────┘   │
│                                  │
│  [もっと読み込む]                 │
│                                  │
├─────────────────────────────────┤
│ [Footer]                         │
└─────────────────────────────────┘
```

#### 5.3.1 URLInputForm コンポーネント

**HTML 構造:**

```html
<form id="url-input-form" class="url-input-form" role="form" aria-label="スライドURL登録">
  <div class="input-group">
    <label for="slide-url" class="sr-only">スライドURL</label>
    <input
      id="slide-url"
      type="url"
      name="url"
      placeholder="スライドのURLを入力（SpeakerDeck / Docswell / Google Slides）"
      required
      autocomplete="url"
      class="input-url"
    />
    <button type="submit" class="btn-primary" id="submit-btn">
      追加
    </button>
  </div>
  <div id="url-error" class="error-message" role="alert" aria-live="polite" hidden></div>
</form>
```

**送信処理（クライアント JS）:**

```
1. フォーム submit イベントを preventDefault
2. 送信ボタンを disabled にし「追加中...」に変更
3. POST /api/stocks { url: inputValue }
   ※ 同期モデル: サーバーは oEmbed 取得まで完了させてから 201 を返す
4. 3 秒経過後にフォーム下に「スライド情報を取得しています...」と進捗テキスト表示（aria-live="polite"）
5. 成功（201）→ 完成済みのストックカード（title, author_name, embed_url 等が揃った状態）を一覧の先頭に追加、フォームをリセット
6. エラー（400 INVALID_URL / UNSUPPORTED_PROVIDER）→ #url-error にエラーメッセージ（API の error フィールド）を表示
7. エラー（409 DUPLICATE）→ 「このスライドは既にストック済みです」を表示
8. エラー（502 / 504 UPSTREAM_FAILURE）→ 「プロバイダから応答がありません。時間をおいて再度お試しください。」を表示。入力値はフォームに保持
9. エラー（401）→ /login にリダイレクト
10. クライアント側タイムアウト 15 秒（サーバー側 12 秒 + バッファ）で「タイムアウトしました。もう一度お試しください。」を表示
11. 送信ボタンを元に戻す
```

> **設計判断（同期モデル）:** ストック登録は POST /api/stocks のリクエスト内で oEmbed 取得まで完了する同期モデルとする。
> oEmbed 取得が失敗（指数バックオフ 3 回リトライ後も失敗）した場合は DB ロールバックでストックは作成せず、エラーレスポンスを返す。
> これにより `pending` / `failed` 状態がそもそも存在しなくなり、ポーリング・再試行 UI も不要になる。
> 詳細は oembed-spec.md / stock-api-spec.md を参照（**両仕様も同期モデルに更新が必要 — TODO**）。

**バリデーションエラーの表示:**
- `#url-error` 要素にテキストを設定し `hidden` 属性を除去
- テキスト色: 赤系（`var(--color-error)`）
- フォーム再送信時にエラーを非表示に戻す（誤って入力 1 文字目で消すと、ユーザーがエラー内容を読む前に消えてしまうため `submit` イベント発火時にリセット）

**クライアント側プロバイダ検出（パスト即時フィードバック）:**

URL 入力時または貼り付け時、クライアント側で正規表現でプロバイダを検出し、ユーザーに即時フィードバックを返す。同期 oEmbed 取得の 1-10 秒の待機体験を「サービスが認識した」確信に変える設計。

```html
<form id="url-input-form" ...>
  <div class="input-group">
    <input id="slide-url" ... />
    <button type="submit" ...>追加</button>
  </div>
  <div id="url-detect" class="url-detect" hidden>
    <span class="url-detect-check" aria-hidden="true">✓</span>
    <span id="url-detect-text"></span>
  </div>
  <div id="url-error" class="error-message" role="alert" aria-live="polite" hidden></div>
</form>
```

**動作:**

| イベント | 処理 |
|---------|------|
| `input` / `paste` | URL を読み、クライアント側 `detectProvider(url)` を実行（provider-spec.md §2 の検出ロジックを移植） |
| 検出成功 | `#url-detect` に `「✓ SpeakerDeck のスライドを認識しました」` を表示。color = `var(--color-success)` |
| 検出失敗・空入力 | `#url-detect` を `hidden` |
| 検出時のラベル | `speakerdeck` → `SpeakerDeck`、`docswell` → `Docswell`、`google_slides` → `Google Slides` |

> **設計判断（コード重複）:** プロバイダ検出ロジックがクライアント・サーバー両方に存在することになるが、即時フィードバックの体験価値が重複コスト（〜30 行）を上回る。共通ロジックは `src/lib/detect-provider.ts` に切り出し、API ハンドラとフロントの両方が import する設計を推奨。

#### 5.3.2 StockList コンポーネント

一覧のコンテナ。

**HTML 構造:**

```html
<section id="stock-list" class="stock-list" aria-label="ストック一覧">
  <!-- 初期表示: ローディング -->
  <div id="stock-loading" class="loading-container">
    <div class="loading-spinner" role="status" aria-label="読み込み中">
      <span class="sr-only">読み込み中...</span>
    </div>
  </div>

  <!-- ストックカードがここに動的挿入される -->

  <!-- 空状態（ストック0件時） -->
  <div id="stock-empty" class="empty-state" hidden>
    <p>まだスライドがストックされていません。</p>
    <p>上のフォームからスライドのURLを追加してみましょう。</p>
  </div>
</section>

<!-- ページネーション -->
<div id="load-more-container" hidden>
  <button id="load-more-btn" type="button" class="btn-secondary">
    もっと読み込む
  </button>
</div>
```

**データ取得処理（クライアント JS）:**

```
1. GET /api/stocks を fetch
2. items が空 → #stock-empty を表示
3. items がある → StockCard を生成して挿入
4. has_more === true → #load-more-container を表示
5. 「もっと読み込む」ボタン押下 → GET /api/stocks?cursor={next_cursor} で追加読み込み
```

#### 5.3.3 StockCard コンポーネント

1 つのストックを表示するカード。

**HTML 構造:**

```html
<article class="stock-card" data-stock-id="{id}">
  <div class="stock-card-header">
    <h2 class="stock-card-title">
      <a href="/stocks/{id}">{title || "タイトル取得中..."}</a>
    </h2>
    <span class="stock-card-provider badge badge-{provider}">{providerLabel}</span>
  </div>

  <div class="stock-card-meta">
    {author_name && <span class="stock-card-author">{author_name}</span>}
  </div>

  {memo_text &&
    <p class="stock-card-memo">{truncate(memo_text, 100)}</p>
  }

  <div class="stock-card-actions">
    <a href="/stocks/{id}" class="btn-text">詳細を見る</a>
    <a href="{original_url}" target="_blank" rel="noopener noreferrer" class="btn-text">
      元のスライドを開く <span aria-hidden="true">↗</span>
    </a>
  </div>
</article>
```

**表示内容:**

ストックは登録時点で oEmbed 取得が完了しているため、すべてのカードは `title` / `author_name` / `embed_url` が揃った状態で表示される。`pending` / `failed` 状態は同期モデル化により存在しない（oembed-spec.md 改訂後）。

> **設計判断（status カラムの扱い）:** stocks テーブルの `status` カラムは MVP では常に `ready` として作成される。将来非同期化する余地を残してスキーマには残すが、UI ロジックでは status 分岐を持たない。

**プロバイダラベル:**

| provider | ラベル | バッジ色（CSS 変数） | 実際の値 |
|----------|--------|----------------------|---------|
| `speakerdeck` | SpeakerDeck | `--color-provider-speakerdeck` | `#009287`（公式ティール）/ 白文字 |
| `docswell` | Docswell | `--color-provider-docswell` | `#3091FE`（公式ブルー）/ 白文字 |
| `google_slides` | Google Slides | `--color-provider-google_slides` | `#FFBA00`（公式イエロー）/ 黒文字（コントラスト確保） |

> **設計判断:** バッジ色は各社の実際のブランドカラーに合わせる。Material Design パレット（旧仕様の `#4CAF50` 等）は SpeakerDeck の実際の色と一致せず、ユーザーのパターン認識（緑のロゴ → SpeakerDeck）を弱めていた。バッジが「そのスライドの提供元」を即視覚化することで一覧画面のスキャン性が向上する。

**メモ抜粋:**
- `memo_text` の先頭 100 文字を表示
- 100 文字を超える場合は末尾に「…」を付与
- メモが未設定（`null`）の場合は表示しない

### 5.4 詳細画面（`/stocks/[id]` — stocks/[id].astro）

**目的:** ストックの詳細表示・embed 閲覧・メモ編集。

**レイアウト:** BaseLayout（`showNavbar: true`）

**認証チェック:** 一覧画面と同一。

**データ取得:**
- `GET /api/stocks/{id}` でストック詳細を取得
- 404 → エラー画面（「ストックが見つかりません」+ 一覧に戻るリンク）

**ページ構成:**

```
┌─────────────────────────────────┐
│ [Navbar]                         │
├─────────────────────────────────┤
│                                  │
│  ← 一覧に戻る                    │
│                                  │
│  タイトル                         │
│  著者名 / プロバイダ              │
│                                  │
│  ┌───────────────────────────┐   │
│  │                           │   │
│  │     Embed Viewer          │   │
│  │     (iframe)              │   │
│  │                           │   │
│  └───────────────────────────┘   │
│                                  │
│  [元のスライドを開く ↗]           │
│                                  │
│  メモ                             │
│  ┌───────────────────────────┐   │
│  │                           │   │
│  │     MemoEditor            │   │
│  │     (textarea)            │   │
│  │                           │   │
│  └───────────────────────────┘   │
│  [保存] [保存済み ✓]             │
│                                  │
│  ┌───────────────────────────┐   │
│  │ [このストックを削除]       │   │
│  └───────────────────────────┘   │
│                                  │
├─────────────────────────────────┤
│ [Footer]                         │
└─────────────────────────────────┘
```

#### 5.4.1 EmbedViewer コンポーネント

**Props:**

| prop | 型 | 必須 | 説明 |
|------|------|------|------|
| `embedUrl` | `string \| null` | Yes | embed 用 URL |
| `provider` | `string` | Yes | プロバイダ識別子 |
| `title` | `string \| null` | No | iframe の title 属性用 |

**HTML 構造:**

```html
<div class="embed-viewer" data-provider="{provider}">
  {embedUrl ? (
    <iframe
      src="{embedUrl}"
      title="{title || 'スライド'}"
      class="embed-iframe"
      loading="lazy"
      allowfullscreen
      sandbox="allow-scripts allow-same-origin allow-popups"
    ></iframe>
  ) : (
    <div class="embed-placeholder">
      <p>スライドの読み込みができません</p>
    </div>
  )}
</div>
```

**プロバイダ別 iframe サイズ:**

全プロバイダ共通で `aspect-ratio: 16 / 9` を使用する。

```css
.embed-iframe {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
}
```

> **設計判断:** 各プロバイダの oEmbed レスポンスに含まれる width/height 比率は微妙に異なるが
>（SpeakerDeck: 710/399 ≈ 1.78, Docswell: 620/349 ≈ 1.78）、いずれも 16:9 に近い。
> 実装の簡潔さを優先し、全プロバイダ共通で `16 / 9` を使用する。

**sandbox 属性:**
- `allow-scripts`: embed 内の JS 実行を許可（スライド操作に必要）
- `allow-same-origin`: 同一オリジンの Cookie / ストレージアクセスを許可
- `allow-popups`: embed 内のリンクが新しいウィンドウを開けるようにする

**iframe ロード中の表示:**

iframe 自体のロード（src 取得 → 描画）は 1〜3 秒かかる。ユーザーには空白の白枠ではなくグレースケルトンを見せる。

```css
.embed-viewer {
  background: var(--color-surface);  /* グレー背景でロード中だと判別可能に */
}
.embed-viewer .loading-spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

iframe の `load` イベントで `.loading-spinner` を非表示にする。

> **同期モデル化に伴う変更:** 旧仕様では `pending` / `failed` プレースホルダーを定義していたが、同期モデル化により stocks の取得は登録時点で完了するため、これらの状態は UI に存在しない。`embed_url === null` のケースは Google Slides で稀に起こり得る（公開 HTML から取得できないケース）が、その場合のみ「スライドの読み込みができません」プレースホルダーを表示する。

#### 5.4.2 MemoEditor コンポーネント

**HTML 構造:**

```html
<section class="memo-editor" aria-label="メモ">
  <h2 class="memo-editor-heading">メモ</h2>
  <textarea
    id="memo-text"
    class="memo-textarea"
    placeholder="このスライドに関するメモを入力..."
    maxlength="10000"
    rows="6"
    aria-describedby="memo-char-count"
  >{existing_memo_text}</textarea>
  <div class="memo-editor-footer">
    <span id="memo-char-count" class="char-count" aria-live="polite">
      {charCount} / 10,000
    </span>
    <div class="memo-editor-actions">
      <span id="memo-status" class="memo-status" aria-live="polite"></span>
      <button id="memo-save-btn" type="button" class="btn-primary">保存</button>
    </div>
  </div>
</section>
```

**保存処理（クライアント JS）:**

```
1. 保存ボタン押下
2. textarea の値を取得
3. trim 後に空文字列 → エラー「メモの内容を入力してください」
4. PUT /api/stocks/{id}/memo { memo_text: value }
5. 成功（200）→ #memo-status に「保存しました」を表示（3 秒後にフェードアウト）
6. エラー（400 MEMO_TOO_LONG）→ 「メモは10,000文字以内で入力してください」表示
7. エラー（401）→ /login にリダイレクト
8. エラー（404）→ 「ストックが見つかりません」表示
```

**文字数カウント:**
- `input` イベントで現在の文字数をリアルタイム更新
- 9,500 文字超で警告色（黄色 = `var(--color-warning)`、`#memo-char-count.warn` クラス）
- 10,000 文字超で `maxlength` により入力制限（エラー色 = `var(--color-error)`、`#memo-char-count.error` クラス、`font-weight: 600`）

**未保存検知（unsaved-changes 保護）:**

データ喪失防止のため、以下を実装する。

| 項目 | 動作 |
|------|------|
| ダーティ判定 | 現在の textarea 値が「最後に保存された値（`lastSavedValue`）」と異なれば dirty |
| ダーティ表示 | 保存ボタン横に `<span class="memo-dirty">未保存</span>` を表示。`var(--color-warning)` のテキスト |
| 保存後リセット | 保存成功（200）時に `lastSavedValue` を更新 → ダーティ表示を非表示 |
| beforeunload 警告 | dirty 時のみ `window.addEventListener("beforeunload", e => { if (isDirty) e.preventDefault(); })` を有効化。タブ閉じ・ナビゲーション時にブラウザネイティブダイアログ |
| 同一ページ内ナビ警告 | クライアント JS でリンク click 時に dirty なら `window.confirm("未保存の変更があります。離れますか？")` |

> **設計判断:** MVP では自動保存は導入しない。理由: API 負荷・実装コスト・現状の保存ステートマシンの単純さを優先。ユーザーに「保存ボタン未押下のクラッシュ・シャットダウンでデータが消える」リスクは残るが、ダーティ表示と beforeunload で「うっかり忘れ」は防げる。実運用後にサポートチケット傾向を見て自動保存を検討する。

#### 5.4.3 削除機能

**HTML 構造:**

```html
<section class="danger-zone" aria-label="危険な操作">
  <button id="delete-btn" type="button" class="btn-danger">
    このストックを削除
  </button>
</section>
```

**削除処理（クライアント JS）:**

```
1. 削除ボタン押下
2. window.confirm("このストックを削除しますか？この操作は取り消せません。")
3. キャンセル → 何もしない
4. OK → DELETE /api/stocks/{id}
5. 成功（204 or 404）→ window.location.href = "/stocks"
6. エラー → アラートで表示
```

---

## 6. API 呼び出しヘルパー: api-client.ts

API 呼び出しの共通処理をまとめるユーティリティモジュール。

### 6.1 関数一覧

```typescript
// 認証チェック
async function fetchMe(): Promise<{ id: string; email: string; name: string } | null>

// ストック CRUD
async function createStock(url: string): Promise<StockItem>
async function fetchStocks(cursor?: string, limit?: number): Promise<StockListResponse>
async function fetchStock(id: string): Promise<StockItem>
async function deleteStock(id: string): Promise<void>

// メモ
async function saveMemo(stockId: string, memoText: string): Promise<MemoResponse>

// ログアウト
async function logout(): Promise<void>
```

### 6.2 共通エラーハンドリング

```typescript
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
```

- 401 レスポンス時は自動的に `/login` にリダイレクトしない（呼び出し側の判断に委ねる）
- ネットワークエラー時は `ApiError` ではなく元の `TypeError` をそのまま throw する

### 6.3 型定義

```typescript
interface StockItem {
  id: string;
  original_url: string;
  canonical_url: string;
  provider: "speakerdeck" | "docswell" | "google_slides";
  title: string | null;          // 同期モデルでは登録成功時に必ず取得済み（Google Slides の HTML スクレイピング失敗時のみ null）
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;       // Google Slides の例外を除き必ず存在
  memo_text: string | null;
  created_at: string;
  updated_at: string;
  // 注: status カラムは DB に存在するが、同期モデル化により常に "ready"。型定義からは除外し UI で参照しない
}

interface StockListResponse {
  items: StockItem[];
  next_cursor: string | null;
  has_more: boolean;
}

interface MemoResponse {
  id: string;
  stock_id: string;
  memo_text: string;
  created_at: string;
  updated_at: string;
}
```

---

## 7. 状態管理

フレームワークレベルの状態管理は導入しない。各ページのクライアント JS で `fetch` + DOM 操作を直接行う。

### 7.1 ローディング状態

| コンテキスト | 表示 | 実装 |
|-------------|------|------|
| 一覧の初期読み込み | CSS アニメーションのスピナー | `#stock-loading` の表示/非表示を切り替え |
| URL 送信中 | 送信ボタンが「追加中...」に変わり `disabled` | ボタンの `textContent` と `disabled` 属性を操作 |
| メモ保存中 | 保存ボタンが「保存中...」に変わり `disabled` | 同上 |
| 「もっと読み込む」 | ボタンが「読み込み中...」に変わり `disabled` | 同上 |
| 詳細画面の初期読み込み | スピナー表示 | ローディングコンテナの表示/非表示 |

### 7.2 空状態

| コンテキスト | 表示内容 |
|-------------|---------|
| ストック 0 件 | 見出し「まだスライドがありません」+ 対応プロバイダリンク（SpeakerDeck / Docswell / Google Slides）+ フォームへのアクション誘導 |
| メモ未設定 | textarea が空のまま、placeholder が表示される |

### 7.3 同期登録時のサーバー応答待ち

> **設計判断（同期モデル化）:** 旧仕様の「pending ストックのポーリング」は同期モデル化により不要となったため削除。POST /api/stocks のレスポンスを待つ間のクライアント挙動は §5.3.1 の送信処理 4-10 を参照。

POST /api/stocks のレスポンス待ち中の体験は以下を保証する：

| 経過時間 | 表示 |
|---------|------|
| 0〜3 秒 | 送信ボタンが「追加中...」+ disabled |
| 3 秒〜 | フォーム下に進捗テキスト「スライド情報を取得しています...」を `aria-live="polite"` で追加表示 |
| 8 秒〜 | 進捗テキストを「もう少々お待ちください...」に切替 |
| 15 秒（クライアント側タイムアウト） | エラー表示「タイムアウトしました。もう一度お試しください。」入力値はフォームに保持 |

サーバー側タイムアウトは oembed-spec.md §9 の合計 12 秒（プロバイダ呼び出し 10 秒 + バッファ）を想定。クライアント側 15 秒はサーバー応答に余裕を持たせるための上限。

### 7.4 エラー状態

| コンテキスト | 表示内容 | 表示位置 |
|-------------|---------|---------|
| URL バリデーションエラー（400） | API の `error` フィールドの値をそのまま表示 | フォーム下の `#url-error` |
| 重複登録（409） | 「このスライドは既にストック済みです」 | フォーム下の `#url-error` |
| プロバイダ取得失敗（502 / 504） | 「プロバイダから応答がありません。時間をおいて再度お試しください。」入力値はフォームに保持 | フォーム下の `#url-error` |
| クライアント側タイムアウト（15 秒） | 「タイムアウトしました。もう一度お試しください。」入力値はフォームに保持 | フォーム下の `#url-error` |
| ネットワークエラー | 「サーバーに接続できません。ネットワーク接続を確認してください。」入力値はフォームに保持 | フォーム下の `#url-error` |
| 認証エラー（401） | ログインページにリダイレクト（メッセージ表示なし） | — |
| 詳細画面 404 | 「ストックが見つかりません」+ 一覧に戻るリンク | ページ本文 |
| メモ保存エラー | API の `error` フィールドの値を `#memo-status` に赤字表示 | メモエディタ下部 |
| 予期しないエラー（5xx 等） | 「エラーが発生しました。しばらくしてからやり直してください。」 | 該当操作の近く |

---

## 8. CSS / スタイリング方針

### 8.1 ファイル構成

```
public/
└── styles/
    └── global.css     # 全スタイルを1ファイルに収める
```

> **設計判断:** MVP では CSS ファイルを 1 つにまとめる。コンポーネント数が少なく（10 未満）、
> 分割のオーバーヘッドが利点を上回る。将来コンポーネント数が増えた場合にファイル分割を検討する。

### 8.2 CSS カスタムプロパティ（デザイントークン）

```css
:root {
  /* カラー（ブランド: Teal + Orange アクセント — Google ブランド色から脱却） */
  --color-primary: #0D9488;        /* ティール（プライマリ）*/
  --color-primary-hover: #0F766E;  /* hover 時の暗いティール */
  --color-primary-subtle: #CCFBF1; /* 淡いティール（背景・選択時など）*/
  --color-accent: #F97316;         /* オレンジ（CTA 強調・成功通知）*/
  --color-accent-hover: #EA580C;
  --color-text: #0F172A;           /* slate-900: 本文テキスト */
  --color-text-secondary: #475569; /* slate-600: 補助テキスト */
  --color-background: #ffffff;     /* 背景 */
  --color-surface: #F8FAFC;        /* slate-50: カード/プレースホルダ背景 */
  --color-border: #E2E8F0;         /* slate-200: ボーダー */
  --color-error: #DC2626;          /* red-600: エラー（teal とのコントラスト確保）*/
  --color-success: #16A34A;        /* green-600: 成功（trust signal）*/
  --color-warning: #F59E0B;        /* amber-500: 警告 */

  /* プロバイダバッジ（各社実際のブランド色） */
  --color-provider-speakerdeck: #009287;       /* SpeakerDeck 公式ティール */
  --color-provider-speakerdeck-text: #ffffff;
  --color-provider-docswell: #3091FE;          /* Docswell 公式ブルー */
  --color-provider-docswell-text: #ffffff;
  --color-provider-google_slides: #FFBA00;     /* Google Slides 公式イエロー */
  --color-provider-google_slides-text: #1F2937; /* 黄色背景は黒文字でコントラスト確保 */

  /* タイポグラフィ */
  --font-family-display: "Geist", "IBM Plex Sans JP", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-family-body: "Geist", "IBM Plex Sans JP", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-family-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --font-family: var(--font-family-body);  /* 後方互換エイリアス。新規記述では display/body/mono を使う */
  --font-size-base: 16px;
  --font-size-sm: 14px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
  --line-height-base: 1.6;
  --letter-spacing-tight: -0.02em;  /* 見出し用、Geist の最適表示 */
  --letter-spacing-normal: 0;

  /* スペーシング */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;   /* セクション間ギャップ用（landing 等）*/
  --space-4xl: 96px;   /* hero 縦パディング、大セクション間用 */

  /* レイアウト */
  --max-width: 960px;
  --border-radius: 8px;
  --border-radius-sm: 4px;

  /* シャドウ */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.12);
}
```

### 8.2.1 フォント self-host 設定

Geist (Vercel 製、SIL OFL ライセンス、Variable) と IBM Plex Sans JP (IBM 製、SIL OFL ライセンス) を `public/fonts/` に self-host する。

```html
<!-- BaseLayout.astro の <head> 内 -->
<link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/IBMPlexSansJP-Regular.woff2" as="font" type="font/woff2" crossorigin>
```

```css
/* global.css 先頭 */
@font-face {
  font-family: "Geist";
  src: url("/fonts/Geist-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}
@font-face {
  font-family: "Geist Mono";
  src: url("/fonts/GeistMono-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}
@font-face {
  font-family: "IBM Plex Sans JP";
  src: url("/fonts/IBMPlexSansJP-Regular.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
  font-style: normal;
  unicode-range: U+0020-007F, U+3000-30FF, U+FF00-FFEF;  /* kana + CJK punct + ASCII */
}
@font-face {
  font-family: "IBM Plex Sans JP";
  src: url("/fonts/IBMPlexSansJP-Bold.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
  font-style: normal;
  unicode-range: U+0020-007F, U+3000-30FF, U+FF00-FFEF;
}
```

> **設計判断:** Geist は欧文・数字・記号、IBM Plex Sans JP は kana と CJK 記号を担当する分業構成。
>
> **漢字は OS の日本語フォントにフォールバック**（Hiragino Kaku Gothic ProN → Yu Gothic → Noto Sans JP の順）。IBM Plex Sans JP は variable 版が存在せず、フル CJK サブセット（U+4E00-9FFF を含む）は 1.7 MB / weight に達するため、kana のみ self-host し、漢字は OS フォントに任せることでバジェット ~300KB を維持する。kana の活字フレーバーが UI の印象を支配するため、視覚的な分業として機能する。
>
> `font-display: swap` で初描画は system-ui で表示、フォント到着後にスワップ（FOUT 容認、blocking しない）。

**ファイルサイズ目安（subset 後）:**

| ファイル | サイズ |
|---------|--------|
| Geist-Variable.woff2 | ~68 KB |
| GeistMono-Variable.woff2 | ~70 KB |
| IBMPlexSansJP-Regular.woff2（kana+ASCII subset） | ~36 KB |
| IBMPlexSansJP-Bold.woff2（kana+ASCII subset） | ~37 KB |
| 合計 | ~210 KB |

Cloudflare Pages の CDN 配信 + 1年の immutable cache で実質的なリピート訪問コストはゼロ。

### 8.2.2 タイポグラフィ用途別マッピング

| 用途 | font-family | weight | size | letter-spacing |
|------|------------|--------|------|----------------|
| h1（ページタイトル） | display | 700 | 32px | tight |
| h2（セクションタイトル） | display | 600 | 24px | tight |
| h3（カードタイトル等） | display | 600 | 18px | normal |
| 本文 | body | 400 | 16px | normal |
| 補助テキスト | body | 400 | 14px | normal |
| ボタン | body | 500 | 14px | normal |
| コード／URL 表示 | mono | 400 | 14px | normal |

### 8.3 グローバルリセット

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  color: var(--color-text);
  background-color: var(--color-background);
}
```

### 8.4 ボタンスタイル

| クラス | 用途 | スタイル |
|--------|------|---------|
| `.btn-primary` | メイン操作（追加、保存） | 背景: `--color-primary`、文字: 白、角丸 |
| `.btn-secondary` | 副次操作（もっと読み込む） | 背景: 透明、ボーダー: `--color-primary`、文字: `--color-primary` |
| `.btn-danger` | 削除操作 | 背景: 透明、ボーダー: `--color-error`、文字: `--color-error`。ホバーで背景がエラー色に |
| `.btn-text` | テキストリンク風ボタン | 背景なし、文字: `--color-primary`、下線なし、ホバーで下線 |
| `.btn-google-login` | Google ログイン | 白背景 + 細枠線、ホバーで軽い影 |
| `.btn-logout` | ログアウト | テキストリンク風、文字: `--color-text-secondary` |

**ボタンサイズ:**

| クラス | 用途 | 高さ | パディング | font-size |
|--------|------|------|-----------|-----------|
| （default） | 通常 | 40px | `0 20px` | 14px |
| `.btn-sm` | コンパクト | 32px | `0 12px` | 13px |
| `.btn-lg` | LP / 重要CTA | 48px | `0 28px` | 16px |

全ボタン共通: `border-radius: 8px`, `font-weight: 500`, `font-family: var(--font-family-body)`

### 8.5 カードスタイル

```css
.stock-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: var(--space-lg);
  transition: box-shadow 0.2s;
}

.stock-card:hover {
  box-shadow: var(--shadow-md);
}
```

---

## 9. レスポンシブ対応

### 9.1 ブレイクポイント

| 名前 | 幅 | 対象 |
|------|-----|------|
| Mobile | `< 640px` | スマートフォン |
| Tablet | `640px 〜 959px` | タブレット |
| Desktop | `≥ 960px` | デスクトップ |

### 9.2 レイアウト変化

| 要素 | Mobile | Tablet | Desktop |
|------|--------|--------|---------|
| コンテンツ幅 | `100% - padding` | `100% - padding` | `max-width: 960px` + 中央揃え |
| Navbar | サービス名 + ユーザー名/ログアウト（横並び） | 同左 | 同左 |
| URL入力フォーム | input と button を縦積み | input と button を横並び | 同左 |
| StockCard | 1 カラム | 1 カラム | 1 カラム |
| EmbedViewer | `width: 100%` + `aspect-ratio: 16/9` | 同左 | 同左 |
| MemoEditor textarea | `width: 100%`, `rows: 4` | `width: 100%`, `rows: 6` | 同左 |

> **設計判断:** ストックカードは全画面幅で 1 カラム固定とする。理由:
> - カード内にタイトル・著者名・メモ抜粋・アクションが含まれ、横幅が必要
> - 一覧画面での embed 表示は MVP では行わない（詳細画面のみ）
> - 2 カラムグリッドにするとカードが窮屈になり、可読性が下がる

### 9.3 メディアクエリ

```css
/* モバイルファースト: デフォルトスタイルが Mobile 用 */

/* Tablet 以上 */
@media (min-width: 640px) {
  .url-input-form .input-group {
    flex-direction: row;  /* input と button を横並び */
  }
}

/* Desktop 以上 */
@media (min-width: 960px) {
  main {
    max-width: var(--max-width);
    margin-inline: auto;
  }
}
```

---

## 10. アクセシビリティ要件

### 10.1 セマンティック HTML

| 要件 | 実装 |
|------|------|
| ナビゲーション | `<nav>` + `role="navigation"` + `aria-label` |
| メインコンテンツ | `<main>` 要素を使用 |
| セクション | `<section>` + `aria-label` で目的を明示 |
| ストックカード | `<article>` 要素を使用 |
| フォーム | `<form>` + `role="form"` + `aria-label` |
| 見出し階層 | `<h1>` → `<h2>` の正しい階層を維持 |

### 10.2 フォームアクセシビリティ

| 要件 | 実装 |
|------|------|
| ラベル | すべての `<input>` / `<textarea>` に `<label>` を関連付け（`for`/`id`） |
| スクリーンリーダー専用ラベル | 視覚的に非表示のラベルには `.sr-only` クラスを使用 |
| エラーメッセージ | `role="alert"` + `aria-live="polite"` で動的通知 |
| 必須フィールド | `required` 属性を使用 |
| 入力型 | `type="url"` でモバイルキーボード最適化 |

### 10.3 キーボード操作

| 要件 | 実装 |
|------|------|
| フォーカス順序 | 自然な Tab 順序を維持（`tabindex` の変更は最小限） |
| フォーカスインジケータ | ブラウザデフォルトの `outline` を維持。カスタムする場合は `outline: 2px solid var(--color-primary)` |
| Enter キーでの送信 | `<form>` 内の `<button type="submit">` でネイティブ動作を活用 |
| Escape キー | モーダルやドロップダウンを閉じる（MVP では該当 UI なし） |

### 10.4 ARIA

| 要件 | 実装 |
|------|------|
| ローディング状態 | `role="status"` + `aria-label="読み込み中"` |
| 動的コンテンツ更新 | `aria-live="polite"` で変更を通知 |
| 外部リンク | `target="_blank"` には `rel="noopener noreferrer"` を付与 |
| iframe | `title` 属性でコンテンツを説明 |
| アイコン | 装飾的アイコンには `aria-hidden="true"` |

### 10.5 スクリーンリーダー専用クラス

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

## 11. 実装タスクとの対応

| タスク | 本仕様の該当セクション |
|--------|----------------------|
| T-551 ベースレイアウト実装 | セクション 4（BaseLayout, Navbar）、セクション 8（CSS）、セクション 10（a11y） |
| T-552 ストック一覧画面構築 | セクション 5.3（一覧画面）、セクション 7（状態管理）、セクション 9（レスポンシブ） |
| T-553 URL 送信フロー実装 | セクション 5.3.1（URLInputForm）、セクション 6（api-client.ts） |
| T-554 ストック詳細画面構築 | セクション 5.4（詳細画面）、セクション 5.4.1〜5.4.3 |
| T-555 oEmbed 埋め込みコンポーネント実装 | セクション 5.4.1（EmbedViewer） |
| T-556 ログインページ更新 | セクション 5.2（ログインページ） |
| T-557 トップページ更新 | セクション 5.1（トップページ） |
| T-558 フロントエンド E2E テスト | 全セクション |
