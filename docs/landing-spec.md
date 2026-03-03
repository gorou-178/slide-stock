# ランディングページ仕様

## 1. 概要

トップページ（`/`）をサービスのランディングページとして構築する。
認証不要の静的ページで、`/stocks` 一覧画面とは完全に分離する。

### 目的

- サービスの概要・価値を伝える
- 対応プロバイダを紹介する
- ログインへの導線（CTA）を提供する
- 認証済みユーザーには `/stocks` へのナビゲーションを提供する

### 設計原則

- **認証チェック不要**: `/api/me` の呼び出しを行わず、完全な静的ページとする
- **既存 CSS を活用**: `global.css` のデザイントークン・ボタンスタイルを流用
- **モバイルファースト**: 既存のレスポンシブ対応方針に従う

---

## 2. ページ構成

```
┌─────────────────────────────────────┐
│           (Navbar なし)              │
├─────────────────────────────────────┤
│                                     │
│  Hero セクション                     │
│  ┌─────────────────────────────┐    │
│  │ Slide Stock                  │    │
│  │ スライドをURLだけで           │    │
│  │ ストックできるサービス         │    │
│  │ [ログインして始める]          │    │
│  │ [ストック一覧へ →]            │    │
│  └─────────────────────────────┘    │
│                                     │
│  対応プロバイダ セクション            │
│  ┌─────┐ ┌─────┐ ┌──────────┐      │
│  │ SD  │ │ DW  │ │ G Slides │      │
│  └─────┘ └─────┘ └──────────┘      │
│                                     │
│  利用イメージ セクション              │
│  1. URL を入力                      │
│  2. 自動でメタデータ取得              │
│  3. embed で閲覧 & メモ              │
│                                     │
├─────────────────────────────────────┤
│ [Footer]                            │
└─────────────────────────────────────┘
```

---

## 3. セクション詳細

### 3.1 Hero セクション

**表示要素:**

| 要素 | 内容 |
|------|------|
| サービス名 | `Slide Stock` — h1 |
| キャッチコピー | 「SpeakerDeck / Docswell / Google Slides のスライドを URL 入力だけでストックできるサービスです。」 |
| CTA ボタン（プライマリ） | 「ログインして始める」→ `/login` |
| CTA ボタン（セカンダリ） | 「ストック一覧へ」→ `/stocks`（認証済みユーザー向け） |

**HTML 構造:**

```html
<section class="hero" aria-label="サービス紹介">
  <h1 class="hero-title">Slide Stock</h1>
  <p class="hero-description">
    SpeakerDeck / Docswell / Google Slides のスライドを<br>
    URL入力だけでストックできるサービスです。
  </p>
  <div class="hero-actions">
    <a href="/login" class="btn-primary btn-lg">ログインして始める</a>
    <a href="/stocks" class="btn-secondary btn-lg">ストック一覧へ</a>
  </div>
</section>
```

### 3.2 対応プロバイダ セクション

**表示要素:**

| プロバイダ | 説明 | バッジ色 |
|-----------|------|---------|
| SpeakerDeck | oEmbed 対応、embed 表示 | 緑系 (`#4CAF50`) |
| Docswell | oEmbed 対応、embed 表示 | 青系 (`#2196F3`) |
| Google Slides | 公開スライド、embed 表示 | 黄系 (`#FFC107`) |

**HTML 構造:**

```html
<section class="providers" aria-label="対応プロバイダ">
  <h2 class="section-title">対応プロバイダ</h2>
  <div class="provider-cards">
    <div class="provider-card">
      <span class="badge badge-speakerdeck">SpeakerDeck</span>
      <p>oEmbed 対応。スライドの embed 表示・メタデータ自動取得に対応。</p>
    </div>
    <div class="provider-card">
      <span class="badge badge-docswell">Docswell</span>
      <p>oEmbed 対応。スライドの embed 表示・メタデータ自動取得に対応。</p>
    </div>
    <div class="provider-card">
      <span class="badge badge-google_slides">Google Slides</span>
      <p>公開設定のスライドに対応。embed 表示が可能。</p>
    </div>
  </div>
</section>
```

### 3.3 利用イメージ セクション

**3 ステップで説明:**

| ステップ | 見出し | 説明 |
|---------|--------|------|
| 1 | URL を入力 | 対応プロバイダのスライド URL を貼り付けるだけ |
| 2 | 自動でメタデータ取得 | タイトル・著者名・サムネイルを自動取得 |
| 3 | embed で閲覧 & メモ | スライドを embed で閲覧し、メモを残せる |

**HTML 構造:**

```html
<section class="how-it-works" aria-label="使い方">
  <h2 class="section-title">使い方</h2>
  <div class="steps">
    <div class="step">
      <span class="step-number">1</span>
      <h3>URL を入力</h3>
      <p>対応プロバイダのスライド URL を貼り付けるだけ。</p>
    </div>
    <div class="step">
      <span class="step-number">2</span>
      <h3>自動でメタデータ取得</h3>
      <p>タイトル・著者名・サムネイルを自動で取得します。</p>
    </div>
    <div class="step">
      <span class="step-number">3</span>
      <h3>embed で閲覧 & メモ</h3>
      <p>スライドを embed で閲覧し、メモを残せます。</p>
    </div>
  </div>
</section>
```

---

## 4. CTA 配置方針

- **Hero**: メインの CTA（ログインして始める）を最上部に配置
- **Hero**: サブ CTA（ストック一覧へ）を横に配置。認証済みユーザーが直接一覧に行ける導線
- ページ下部に追加 CTA は不要（シンプルなページのため）

---

## 5. スタイル追加

`global.css` に以下を追加:

```css
/* --- Hero --- */
.hero {
  text-align: center;
  padding: var(--space-2xl) var(--space-md);
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: var(--space-md);
}

.hero-description {
  color: var(--color-text-secondary);
  max-width: 480px;
  margin: 0 auto var(--space-xl);
  font-size: var(--font-size-lg);
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: center;
  flex-wrap: wrap;
}

.btn-lg {
  padding: var(--space-md) var(--space-xl);
  font-size: var(--font-size-lg);
}

/* --- Providers --- */
.providers {
  padding: var(--space-2xl) var(--space-md);
}

.section-title {
  text-align: center;
  font-size: var(--font-size-xl);
  margin-bottom: var(--space-xl);
}

.provider-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-lg);
  max-width: var(--max-width);
  margin: 0 auto;
}

.provider-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: var(--space-lg);
  text-align: center;
}

.provider-card .badge {
  margin-bottom: var(--space-md);
}

.provider-card p {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* --- How It Works --- */
.how-it-works {
  padding: var(--space-2xl) var(--space-md);
  background: var(--color-background);
}

.steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-xl);
  max-width: var(--max-width);
  margin: 0 auto;
}

.step {
  text-align: center;
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 50%;
  font-weight: 700;
  margin-bottom: var(--space-md);
}

.step h3 {
  font-size: var(--font-size-lg);
  margin-bottom: var(--space-sm);
}

.step p {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
```

---

## 6. 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/pages/index.astro` | ランディングページに再実装。認証チェック（`/api/me`）を除去。Hero・プロバイダ・利用イメージセクションを配置。 |
| `public/styles/global.css` | Hero、プロバイダ、利用イメージのスタイルを追加 |

### 既存ページとの分離

| パス | 変更前 | 変更後 |
|------|--------|--------|
| `/` | 認証チェック → `/stocks` リダイレクト / ログイン案内 | 静的ランディングページ（認証不要） |
| `/login` | 変更なし | 変更なし |
| `/stocks` | 変更なし | 変更なし（認証必須のまま） |

---

## 7. 実装タスクとの対応

| タスク | 本仕様の該当セクション |
|--------|----------------------|
| T-631 トップページをランディングページに刷新 | 全セクション |
