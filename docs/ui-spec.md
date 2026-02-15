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
| `/` | トップページ | 不要 | 認証済み → `/stocks` リダイレクト、未認証 → ログイン案内 |
| `/login` | ログインページ | 不要 | Google Login ボタン |
| `/stocks` | 一覧画面 | 必須 | URL 入力フォーム + ストック一覧 |
| `/stocks/[id]` | 詳細画面 | 必須 | embed 表示 + メモ編集 |

### 認証リダイレクト

- **未認証ユーザーが `/stocks` または `/stocks/[id]` にアクセス**: `/login` にリダイレクト
- **認証済みユーザーが `/` にアクセス**: `/stocks` にリダイレクト
- **認証済みユーザーが `/login` にアクセス**: `/stocks` にリダイレクト

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
  <footer>
    <p>&copy; 2025 Slide Stock</p>
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

**目的:** 認証状態に応じた振り分け。

**レイアウト:** BaseLayout（`showNavbar: false`）

**動作:**
1. クライアント JS で `GET /api/me` を呼び出し
2. 200 → `window.location.href = "/stocks"` にリダイレクト
3. 401 → ログイン案内を表示

**未認証時の表示:**

```html
<div class="landing">
  <h1>Slide Stock</h1>
  <p>SpeakerDeck / Docswell / Google Slides のスライドを<br>URL入力だけでストックできるサービスです。</p>
  <a href="/login" class="btn-primary">ログインして始める</a>
</div>
```

**スタイル:**
- 画面中央に垂直・水平中央配置
- サービス説明テキストは `max-width: 480px`

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
4. 成功（201）→ 一覧の先頭にカードを追加、フォームをリセット
5. エラー（400）→ #url-error にエラーメッセージ（API の error フィールド）を表示
6. エラー（409）→ 「このスライドは既にストック済みです」を表示
7. エラー（401）→ /login にリダイレクト
8. 送信ボタンを元に戻す
```

**バリデーションエラーの表示:**
- `#url-error` 要素にテキストを設定し `hidden` 属性を除去
- テキスト色: 赤系（`var(--color-error)`）
- 次の入力開始時にエラーを非表示に戻す（`input` イベントで `hidden` を付与）

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

**ステータス別表示:**

| status | 表示 |
|--------|------|
| `pending` | タイトル欄に「メタデータ取得中...」を薄字で表示。embed・メモ以外の操作は可能。 |
| `ready` | 通常表示（タイトル、著者名、メモ抜粋、リンク） |
| `failed` | タイトル欄に「メタデータの取得に失敗しました」を赤字で表示。元 URL リンクは表示。削除操作可能。 |

**プロバイダラベル:**

| provider | ラベル | バッジ色 |
|----------|--------|---------|
| `speakerdeck` | SpeakerDeck | 緑系 (`#4CAF50`) |
| `docswell` | Docswell | 青系 (`#2196F3`) |
| `google_slides` | Google Slides | 黄系 (`#FFC107`) |

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

**pending / failed 時:**
- `pending`: 「メタデータ取得中...」プレースホルダーを表示（`embed_url` が `null`）
- `failed`: 「スライドの読み込みができません」プレースホルダーを表示

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
- 9,500 文字超で警告色（黄色）に変化
- 10,000 文字超で `maxlength` により入力制限（エラー色）

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
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  status: "pending" | "ready" | "failed";
  memo_text: string | null;
  created_at: string;
  updated_at: string;
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
| ストック 0 件 | 「まだスライドがストックされていません。上のフォームからスライドのURLを追加してみましょう。」 |
| メモ未設定 | textarea が空のまま、placeholder が表示される |

### 7.3 エラー状態

| コンテキスト | 表示内容 | 表示位置 |
|-------------|---------|---------|
| URL バリデーションエラー | API の `error` フィールドの値をそのまま表示 | フォーム下の `#url-error` |
| 重複登録（409） | 「このスライドは既にストック済みです」 | フォーム下の `#url-error` |
| ネットワークエラー | 「サーバーに接続できません。ネットワーク接続を確認してください。」 | フォーム下の `#url-error` またはページ上部バナー |
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
  /* カラー */
  --color-primary: #1a73e8;        /* プライマリブルー */
  --color-primary-hover: #1557b0;
  --color-text: #202124;           /* 本文テキスト */
  --color-text-secondary: #5f6368; /* 補助テキスト */
  --color-background: #ffffff;     /* 背景 */
  --color-surface: #f8f9fa;        /* カード背景 */
  --color-border: #dadce0;         /* ボーダー */
  --color-error: #d93025;          /* エラー赤 */
  --color-success: #188038;        /* 成功緑 */
  --color-warning: #f9ab00;        /* 警告黄 */

  /* タイポグラフィ */
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-size-base: 16px;
  --font-size-sm: 14px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
  --line-height-base: 1.6;

  /* スペーシング */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;

  /* レイアウト */
  --max-width: 960px;
  --border-radius: 8px;
  --border-radius-sm: 4px;

  /* シャドウ */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.12);
}
```

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
