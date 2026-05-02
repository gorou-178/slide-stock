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

- **認証チェック不要**: `/api/me` の呼び出しを行わず、完全な静的ページとする（認証済みユーザーも同じ LP を表示。CTA から `/stocks` に遷移すると `/stocks` 側で認証チェック）
- **既存 CSS を活用**: `global.css` のデザイントークン・ボタンスタイルを流用
- **モバイルファースト**: 既存のレスポンシブ対応方針に従う
- **JS なしで完全に機能する**: アナリティクス・トラッキング・スマート CTA 等の `<script>` 追加禁止。`<details>`/`<summary>` のような意味的 HTML で動的体験を表現
- **AI スロップ回避**: 3カラム feature グリッド・アイコン入りカラー丸・全要素中央寄せ・ジェネリックヒーローコピーは禁止

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

**設計方針:** 「URL を貼るだけで、スライドを自分の手元に」を **テキスト + 実物のスクリーンショット** で見せる。AI スロップ ハードリジェクション #3（強いヘッドラインに明確なアクションがない）と #2（弱いブランド）を同時に回避。

**レイアウト:** デスクトップは 2 カラム（左：ブランド + 見出し + 説明 + CTA、右：スクリーンショット）。モバイルは 1 カラム縦積み（テキスト先、画像後）。

**表示要素:**

| 要素 | 内容 |
|------|------|
| サービス名 | `Slide Stock` — wordmark（h1 ではなく装飾的ロゴ。SR には `aria-label="Slide Stock"`） |
| 見出し（h1） | 「スライドを、URL ひとつで自分のものに。」 |
| 補足説明 | 「SpeakerDeck・Docswell・Google Slides に対応。気になったスライドを瞬時にストックして、後で読み返せる。」 |
| CTA プライマリ | 「無料で始める」→ `/login`（`btn-primary btn-lg`） |
| CTA テキストリンク | 「使い方を見る」→ ページ内 `#how-it-works` へスムーズスクロール（`btn-text`） |
| 視覚アセット | `/stocks` 一覧画面のスクリーンショット（実装後の本物。デスクトップ用 1440×900 / モバイル用 390×844 を `<picture>` で出し分け） |

> **設計判断（CTA を一本化）:** 旧仕様では「ログインして始める」+「ストック一覧へ」の 2 ボタンを並べていたが、認証チェックなし LP 上では認証済み・未認証の両者に同じセクションを見せる方針（ui-spec.md §2 と整合）。プライマリ CTA を 1 つに絞り、「使い方を見る」をテキストリンクで控えめに置くことで階層を明確化。`/stocks` への直接導線はナビゲーション（後述 §3.4）で提供する。

**HTML 構造:**

```html
<section class="hero" aria-labelledby="hero-heading">
  <div class="hero-content">
    <p class="hero-wordmark" aria-label="Slide Stock">Slide Stock</p>
    <h1 id="hero-heading" class="hero-heading">
      スライドを、URL ひとつで<br class="desktop-only">自分のものに。
    </h1>
    <p class="hero-lede">
      SpeakerDeck・Docswell・Google Slides に対応。気になったスライドを瞬時にストックして、後で読み返せる。
    </p>
    <div class="hero-actions">
      <a href="/login" class="btn-primary btn-lg">無料で始める</a>
      <a href="#how-it-works" class="btn-text">使い方を見る</a>
    </div>
  </div>
  <div class="hero-visual">
    <picture>
      <source media="(min-width: 960px)" srcset="/images/hero-desktop.webp 1x, /images/hero-desktop@2x.webp 2x" type="image/webp">
      <source media="(min-width: 960px)" srcset="/images/hero-desktop.png 1x, /images/hero-desktop@2x.png 2x">
      <img
        src="/images/hero-mobile.png"
        srcset="/images/hero-mobile.png 1x, /images/hero-mobile@2x.png 2x"
        alt="Slide Stock のストック一覧画面のスクリーンショット。SpeakerDeck・Docswell・Google Slides のスライドが3件カード形式で表示されている"
        width="720" height="480" loading="eager">
    </picture>
  </div>
</section>
```

**スクリーンショット要件:**

- 実装後の `/stocks` 一覧画面の実物を使う（dogfood）
- 表示するストックは 3 件（プロバイダ各 1 件ずつ）でブランド色のバッジが視覚的に映える状態
- メモが入っているサンプルを 1〜2 件含めて「使い込まれた」感を出す
- 個人情報・実在しないスライドを避けるため、デモ専用アカウントで取ったスクリーンショットを使う
- WebP + PNG の両方を用意（古いブラウザフォールバック）
- 1x / 2x の Retina 対応

### 3.2 対応プロバイダ セクション（バッジリスト）

**設計方針:** 旧仕様の「3カラムカード × プロバイダ説明文」も AI スロップ #2 に近い。各プロバイダの説明文は「oEmbed 対応」「embed 表示」と機能羅列で価値命題を伝えていない。**バッジを横一列に並べる軽量な構成**に変更し、プロバイダの存在感を出すだけにする。詳細説明は使い方セクションで間接的にカバーされる。

**プロバイダ色:** ui-spec.md §8.2 で定義した `--color-provider-*` 変数を流用（各社実際のブランド色）。

**HTML 構造:**

```html
<section class="providers" aria-labelledby="providers-heading">
  <h2 id="providers-heading" class="section-heading">対応プロバイダ</h2>
  <p class="providers-lede">
    気になるスライドの URL を、そのまま貼るだけ。
  </p>
  <ul class="providers-list">
    <li><span class="badge badge-speakerdeck">SpeakerDeck</span></li>
    <li><span class="badge badge-docswell">Docswell</span></li>
    <li><span class="badge badge-google_slides">Google Slides</span></li>
  </ul>
</section>
```

### 3.3 使い方セクション（1 カラム ストーリー）

**設計方針:** 旧仕様の「3 ステップ × 横並びカード」は AI スロップ ブラックリスト #2（3カラムフィーチャグリッド）/ #3（アイコン入りカラー丸）に直撃する。**1 カラムの縦長ストーリー** に再設計し、各ステップは「見出し + 補足テキスト + 実物のスクリーンショット」の交互配置で順序感を表現する。

**ステップ構成（縦に 3 つ、上から下へ）:**

| 順番 | 見出し | 補足 | 視覚アセット |
|-----|--------|------|-------------|
| 1 | URL を貼るだけ。 | 対応する 3 プロバイダのスライド URL を入力するだけで登録完了。クリック前に `✓ SpeakerDeck` のように認識通知（ui-spec.md §5.3.1 と整合）。 | 入力フォームに URL がペーストされた瞬間のスクリーンショット |
| 2 | タイトル・著者名・サムネイルを自動取得。 | リクエスト内で oEmbed を取って完成した状態でカードを返す（同期モデル）。あなたが待つのは数秒。 | 取得直後の `/stocks` カード（タイトル・著者名・プロバイダバッジ表示） |
| 3 | スライドを見ながら、メモを残せる。 | 全画面で embed 表示。あなたの考えをメモ欄に残しておけば、後で「あのときの自分」と再会できる。 | 詳細画面の embed + メモ並びのスクリーンショット |

**HTML 構造:**

```html
<section id="how-it-works" class="how-it-works" aria-labelledby="how-heading">
  <h2 id="how-heading" class="section-heading">使い方</h2>

  <article class="step-block">
    <div class="step-block-text">
      <span class="step-block-index" aria-hidden="true">01</span>
      <h3 class="step-block-heading">URL を貼るだけ。</h3>
      <p class="step-block-body">
        対応する 3 プロバイダのスライド URL を入力するだけで登録完了。
        ペーストした瞬間「✓ SpeakerDeck のスライドを認識しました」と表示されるので、送信前に確信できる。
      </p>
    </div>
    <figure class="step-block-visual">
      <img src="/images/step-01-paste.webp" alt="URL 入力フォームに SpeakerDeck の URL がペーストされ、フォーム下に「✓ SpeakerDeck のスライドを認識しました」と表示されている" width="640" height="400" loading="lazy">
    </figure>
  </article>

  <article class="step-block step-block-reverse">
    <div class="step-block-text">
      <span class="step-block-index" aria-hidden="true">02</span>
      <h3 class="step-block-heading">タイトル・著者名・サムネイルを自動取得。</h3>
      <p class="step-block-body">
        リクエスト内で oEmbed を取って完成した状態でカードを返す。あなたが待つのは数秒。pending やリトライの面倒は無し。
      </p>
    </div>
    <figure class="step-block-visual">
      <img src="/images/step-02-stocked.webp" alt="ストック一覧画面で、登録直後のスライドカードがタイトル・著者名・プロバイダバッジとともに表示されている" width="640" height="400" loading="lazy">
    </figure>
  </article>

  <article class="step-block">
    <div class="step-block-text">
      <span class="step-block-index" aria-hidden="true">03</span>
      <h3 class="step-block-heading">スライドを見ながら、メモを残せる。</h3>
      <p class="step-block-body">
        全画面で embed 表示。あなたの考えをメモ欄に残しておけば、後で「あのときの自分」と再会できる。未保存の変更はブラウザがちゃんと警告する。
      </p>
    </div>
    <figure class="step-block-visual">
      <img src="/images/step-03-memo.webp" alt="ストック詳細画面で、左に embed されたスライド、右にメモエディタが並んで表示されている" width="640" height="400" loading="lazy">
    </figure>
  </article>
</section>
```

**レイアウト挙動:**

| 画面幅 | 配置 |
|-------|------|
| < 720px（モバイル） | 全ステップ縦積み。`step-block-text` の上に `step-block-visual` が来る |
| ≥ 720px（タブレット以上） | 各 `step-block` が 2 カラム（テキスト + 画像）。`step-block-reverse` でカラム入れ替え（ジグザグ） |

> **設計判断（番号アイコン丸の廃止）:** 旧仕様の `step-number` 円バッジは AI スロップ #3 に該当。代わりに大きな数字ラベル `01` `02` `03` を見出しの上にタイポグラフィの一部として配置し、タイポ階層で順序を表現する。装飾要素を 1 つ減らせる。

---

## 4. CTA 配置方針

- **Hero**: 「無料で始める」（プライマリ）+「使い方を見る」（テキストリンク・ページ内アンカー）。プライマリは 1 つだけにして階層を明確化
- **使い方セクション末尾**: 「無料で始める」を再度配置。スクロール後の離脱を防ぐ
- 認証状態に関わらず同じ LP を表示する設計のため、`/stocks` への直接 CTA は LP 上には置かない（必要なら header の小さなリンクで提供 — §3.4 参照）

### 3.4 ヘッダーナビゲーション（軽量）

LP 上部に薄いヘッダーバーを配置する。Navbar（ui-spec.md §4.2）はアプリ用なので使わず、LP 専用の軽量ヘッダーとする。

```html
<header class="landing-header">
  <p class="landing-header-brand" aria-label="Slide Stock">Slide Stock</p>
  <nav class="landing-header-nav" aria-label="ヘッダーナビ">
    <a href="#how-it-works">使い方</a>
    <a href="/login" class="btn-text">ログイン</a>
  </nav>
</header>
```

`/stocks` への直接導線は意図的に置かない（認証必須のため未認証ユーザーが踏むと困惑する）。ログイン済みユーザーで「アプリに行きたい」場合は `/login` を踏めば認証済み判定で自動的に `/stocks` にリダイレクトされる（ui-spec.md §2 の認証リダイレクトに従う）。

---

## 5. スタイル追加

`global.css` に以下を追加。`text-align: center` の濫用、装飾的丸アイコン、3 カラム feature グリッドはすべて避ける。

```css
/* --- Landing Header (LP 専用、Navbar とは別) --- */
.landing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  max-width: var(--max-width);
  margin: 0 auto;
}

.landing-header-brand {
  font-family: var(--font-family-display);
  font-weight: 700;
  font-size: var(--font-size-lg);
  letter-spacing: var(--letter-spacing-tight);
}

.landing-header-nav {
  display: flex;
  gap: var(--space-lg);
  align-items: center;
}

/* --- Hero (2 カラム asymmetric、中央寄せ禁止) --- */
.hero {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2xl);
  padding: var(--space-3xl) var(--space-lg) var(--space-4xl);
  max-width: var(--max-width);
  margin: 0 auto;
  /* 中央寄せはしない: text-align は left のまま */
}

@media (min-width: 960px) {
  .hero {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: var(--space-4xl);
    padding-block: var(--space-4xl) calc(var(--space-4xl) * 1.5);
    align-items: center;
  }
}

.hero-wordmark {
  font-family: var(--font-family-display);
  font-weight: 600;
  font-size: var(--font-size-base);
  color: var(--color-primary);
  letter-spacing: var(--letter-spacing-tight);
  margin-bottom: var(--space-md);
  text-transform: none;
}

.hero-heading {
  font-family: var(--font-family-display);
  font-weight: 700;
  font-size: clamp(2rem, 5vw, 3.25rem);
  line-height: 1.1;
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-text);
  margin-bottom: var(--space-lg);
}

.hero-lede {
  font-size: var(--font-size-lg);
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xl);
  max-width: 38ch;  /* 読みやすさ優先で width 制約 */
}

.hero-actions {
  display: flex;
  gap: var(--space-lg);
  align-items: center;
  flex-wrap: wrap;
}

.hero-visual img {
  width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 24px 48px -12px rgba(15, 23, 42, 0.18);
  /* シャドウは「LP の世界に浮いてる」感を出す装飾。1箇所だけ意図的に使う */
}

.desktop-only {
  display: none;
}
@media (min-width: 720px) {
  .desktop-only {
    display: inline;
  }
}

/* --- Section Heading (左寄せ、中央寄せ禁止) --- */
.section-heading {
  font-family: var(--font-family-display);
  font-weight: 700;
  font-size: clamp(1.5rem, 3vw, 2rem);
  letter-spacing: var(--letter-spacing-tight);
  margin-bottom: var(--space-2xl);
  /* text-align: left（デフォルト）*/
}

/* --- How It Works (1 カラム ストーリー、ジグザグ) --- */
.how-it-works {
  padding: var(--space-4xl) var(--space-lg);
  max-width: var(--max-width);
  margin: 0 auto;
}

.step-block {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-xl);
  padding-block: var(--space-3xl);
  border-bottom: 1px solid var(--color-border);
}

.step-block:last-of-type {
  border-bottom: none;
}

@media (min-width: 720px) {
  .step-block {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    gap: var(--space-4xl);
    align-items: center;
  }
  .step-block-reverse {
    /* テキストとビジュアルの順を入れ替える（ジグザグ）*/
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  }
  .step-block-reverse .step-block-text {
    order: 2;
  }
  .step-block-reverse .step-block-visual {
    order: 1;
  }
}

.step-block-index {
  font-family: var(--font-family-mono);
  font-weight: 500;
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  letter-spacing: 0.1em;
  display: block;
  margin-bottom: var(--space-md);
}

.step-block-heading {
  font-family: var(--font-family-display);
  font-weight: 700;
  font-size: clamp(1.25rem, 2.5vw, 1.75rem);
  line-height: 1.2;
  letter-spacing: var(--letter-spacing-tight);
  margin-bottom: var(--space-md);
}

.step-block-body {
  font-size: var(--font-size-base);
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.step-block-visual img {
  width: 100%;
  height: auto;
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

/* --- Providers (実際の対応プロバイダのバッジ表示、装飾カードは不要) --- */
.providers {
  padding: var(--space-3xl) var(--space-lg);
  max-width: var(--max-width);
  margin: 0 auto;
}

.providers-list {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
  /* grid ではなく flex（カードを「並べる」のではなく「ラインに沿って置く」） */
}

.providers-list .badge {
  /* 既存の .badge スタイルを流用 */
  font-size: var(--font-size-base);
  padding: var(--space-sm) var(--space-md);
}

/* --- Footer (BaseLayout の .site-footer を継承、余白だけ調整) --- */
.site-footer {
  padding: var(--space-3xl) var(--space-lg);
  max-width: var(--max-width);
  margin: 0 auto;
  border-top: 1px solid var(--color-border);
}

.footer-nav {
  display: flex;
  gap: var(--space-lg);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}

.footer-meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.footer-version {
  font-family: var(--font-family-mono);
  margin-left: var(--space-sm);
}

/* prefers-reduced-motion: 装飾的なシャドウ・トランジションは保持、本文に影響しない */
@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

> **削除した旧スタイル:**
> - `.step-number`（40px 丸アイコン、AI スロップ #3）
> - `.steps { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) }`（3カラムグリッド、AI スロップ #2）
> - `.section-title { text-align: center }`（中央寄せ濫用、AI スロップ #4）
> - `.hero { text-align: center }`（同上）

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
