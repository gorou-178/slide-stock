# フロントエンド仕様

画面定義、画面フロー、デザインルール

---

## §1 概要

本ドキュメントはスライドストックサービスの MVP フロントエンド UI を定義する。
Astro（TypeScript）で構築し、Cloudflare Pages にデプロイする。

ランディングページ（`/`）からアプリケーション画面（`/stocks`）まで、すべてのフロントエンド仕様をこのファイルに集約する。

### §1.1 前提ドキュメント

- [CLAUDE.md](../CLAUDE.md) — MVP 要件（セクション 7: 画面構成）
- [docs/architecture-spec.md](architecture-spec.md) — システム全体構成
- [docs/backend-spec.md](backend-spec.md) — 認証・セッション管理、Stock API、Memo API、oEmbed / Queue 処理仕様

### §1.2 設計原則

1. **JS 最小構成**: Astro のアイランドアーキテクチャを活かし、インタラクティブ部分のみクライアント JS を使用
2. **素の CSS**: CSS フレームワークは導入せず、素の CSS でスタイリング（依存ゼロ・軽量）
3. **プログレッシブエンハンスメント**: JS なしでも基本構造が壊れないセマンティック HTML
4. **モバイルファースト**: レスポンシブ対応はモバイルを基準に拡張

---

## §2 ページ構成（URL ルーティング）

| パス | ページ | 認証 | 説明 |
|------|--------|------|------|
| `/` | ランディングページ | 不要 | 静的 LP（認証チェックなし）。詳細は §3 を参照 |
| `/login` | ログインページ | 不要 | Google Login ボタン |
| `/stocks` | 一覧画面 | 必須 | URL 入力フォーム + ストック一覧 |
| `/stocks/[id]` | 詳細画面 | 必須 | embed 表示 + メモ編集 |

### §2.1 認証リダイレクト

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

## §3 ランディングページ

### §3.1 概要

トップページ（`/`）をサービスのランディングページとして構築する。
認証不要の静的ページで、`/stocks` 一覧画面とは完全に分離する。

#### 目的

- サービスの概要・価値を伝える
- 対応プロバイダを紹介する
- ログインへの導線（CTA）を提供する
- 認証済みユーザーには `/stocks` へのナビゲーションを提供する

#### 設計原則

- **認証チェック不要**: `/api/me` の呼び出しを行わず、完全な静的ページとする（認証済みユーザーも同じ LP を表示。CTA から `/stocks` に遷移すると `/stocks` 側で認証チェック）
- **既存 CSS を活用**: `global.css` のデザイントークン・ボタンスタイルを流用
- **モバイルファースト**: 既存のレスポンシブ対応方針に従う
- **JS なしで完全に機能する**: アナリティクス・トラッキング・スマート CTA 等の `<script>` 追加禁止。`<details>`/`<summary>` のような意味的 HTML で動的体験を表現
- **AI スロップ回避**: 3カラム feature グリッド・アイコン入りカラー丸・全要素中央寄せ・ジェネリックヒーローコピーは禁止

> **設計判断:** 旧仕様では `/` で認証チェックして振り分ける設計だったが、シンプルさ・CDN キャッシュ可能性・パフォーマンスを優先し、`/` は認証チェックなしの静的 LP に統一した。

### §3.2 ページ構成

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

### §3.3 セクション詳細

#### §3.3.1 Hero セクション

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

> **設計判断（CTA を一本化）:** 旧仕様では「ログインして始める」+「ストック一覧へ」の 2 ボタンを並べていたが、認証チェックなし LP 上では認証済み・未認証の両者に同じセクションを見せる方針（§2 と整合）。プライマリ CTA を 1 つに絞り、「使い方を見る」をテキストリンクで控えめに置くことで階層を明確化。`/stocks` への直接導線はナビゲーション（§3.3.4 参照）で提供する。

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

#### §3.3.2 対応プロバイダ セクション（バッジリスト）

**設計方針:** 旧仕様の「3カラムカード × プロバイダ説明文」も AI スロップ #2 に近い。各プロバイダの説明文は「oEmbed 対応」「embed 表示」と機能羅列で価値命題を伝えていない。**バッジを横一列に並べる軽量な構成**に変更し、プロバイダの存在感を出すだけにする。詳細説明は使い方セクションで間接的にカバーされる。

**プロバイダ色:** §8.2 で定義した `--color-provider-*` 変数を流用（各社実際のブランド色）。

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

#### §3.3.3 使い方セクション（1 カラム ストーリー）

**設計方針:** 旧仕様の「3 ステップ × 横並びカード」は AI スロップ ブラックリスト #2（3カラムフィーチャグリッド）/ #3（アイコン入りカラー丸）に直撃する。**1 カラムの縦長ストーリー** に再設計し、各ステップは「見出し + 補足テキスト + 実物のスクリーンショット」の交互配置で順序感を表現する。

**ステップ構成（縦に 3 つ、上から下へ）:**

| 順番 | 見出し | 補足 | 視覚アセット |
|-----|--------|------|-------------|
| 1 | URL を貼るだけ。 | 対応する 3 プロバイダのスライド URL を入力するだけで登録完了。クリック前に `✓ SpeakerDeck` のように認識通知（§5.1 と整合）。 | 入力フォームに URL がペーストされた瞬間のスクリーンショット |
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

#### §3.3.4 ヘッダーナビゲーション（軽量）

LP 上部に薄いヘッダーバーを配置する。Navbar（§7.2）はアプリ用なので使わず、LP 専用の軽量ヘッダーとする。

```html
<header class="landing-header">
  <p class="landing-header-brand" aria-label="Slide Stock">Slide Stock</p>
  <nav class="landing-header-nav" aria-label="ヘッダーナビ">
    <a href="#how-it-works">使い方</a>
    <a href="/login" class="btn-text">ログイン</a>
  </nav>
</header>
```

`/stocks` への直接導線は意図的に置かない（認証必須のため未認証ユーザーが踏むと困惑する）。ログイン済みユーザーで「アプリに行きたい」場合は `/login` を踏めば認証済み判定で自動的に `/stocks` にリダイレクトされる（§2.1 の認証リダイレクトに従う）。

### §3.4 CTA 配置方針

- **Hero**: 「無料で始める」（プライマリ）+「使い方を見る」（テキストリンク・ページ内アンカー）。プライマリは 1 つだけにして階層を明確化
- **使い方セクション末尾**: 「無料で始める」を再度配置。スクロール後の離脱を防ぐ
- 認証状態に関わらず同じ LP を表示する設計のため、`/stocks` への直接 CTA は LP 上には置かない（必要なら header の小さなリンクで提供 — §3.3.4 参照）

### §3.5 スタイル追加

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

### §3.6 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/pages/index.astro` | ランディングページに再実装。認証チェック（`/api/me`）を除去。Hero・プロバイダ・利用イメージセクションを配置。 |
| `public/styles/global.css` | Hero、プロバイダ、利用イメージのスタイルを追加 |

#### 既存ページとの分離

| パス | 変更前 | 変更後 |
|------|--------|--------|
| `/` | 認証チェック → `/stocks` リダイレクト / ログイン案内 | 静的ランディングページ（認証不要） |
| `/login` | 変更なし | 変更なし |
| `/stocks` | 変更なし | 変更なし（認証必須のまま） |

---

## §4 ログインページ（`/login` — login.astro）

**目的:** Google OIDC ログインへの誘導。

**レイアウト:** BaseLayout（`showNavbar: false`）

**動作:**
1. クライアント JS で `GET /api/me` を呼び出し
2. 200（認証済み）→ `?return_to=<相対パス>` クエリがあればその値、なければ `/stocks` にリダイレクト
3. 401 → ログインボタンを表示（初期状態はローディング → 判定後にボタン表示）

**return_to クエリパラメータ:**
- セッション切れで `redirectToLogin()` 経由でこのページに飛ばされた場合、`?return_to=<元のパス>` が付与される（§7.3.2）
- 値はクライアント側で「`/` で始まり `//` で始まらない相対パス」のみ採用、それ以外は無視する（オープンリダイレクト対策）
- 有効な値の場合、`Google でログイン` リンクの href も `/api/auth/login?return_to=<エンコード値>` に書き換える。サーバー側で再検証してから `__Host-auth_return_to` Cookie に保存する（backend-spec.md §3.1）

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

---

## §5 一覧画面（`/stocks` — stocks.astro）

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

### §5.1 URLInputForm コンポーネント

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
> 詳細は backend-spec.md を参照（sync モデル + rollback semantics に整合済み、ADR-009 §4-2）。

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
| `input` / `paste` | URL を読み、クライアント側 `detectProvider(url)` を実行（backend-spec.md のプロバイダ検出ロジックを移植） |
| 検出成功 | `#url-detect` に `「✓ SpeakerDeck のスライドを認識しました」` を表示。color = `var(--color-success)` |
| 検出失敗・空入力 | `#url-detect` を `hidden` |
| 検出時のラベル | `speakerdeck` → `SpeakerDeck`、`docswell` → `Docswell`、`google_slides` → `Google Slides` |

> **設計判断（コード重複）:** プロバイダ検出ロジックがクライアント・サーバー両方に存在することになるが、即時フィードバックの体験価値が重複コスト（〜30 行）を上回る。共通ロジックは `src/lib/detect-provider.ts` に切り出し、API ハンドラとフロントの両方が import する設計を推奨。

### §5.2 StockList コンポーネント

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

### §5.3 StockCard コンポーネント

1 つのストックを表示するカード。

**HTML 構造:**

```html
<article class="stock-card" data-stock-id="{id}">
  <a href="/stocks/{id}" class="stock-card-thumbnail" aria-hidden="true" tabindex="-1">
    <img
      src="{thumbnail_url || '/images/thumbnail-empty.svg'}"
      alt=""
      loading="lazy"
      decoding="async"
      width="320"
      height="180"
      class="stock-card-thumbnail-img"
    />
  </a>

  <div class="stock-card-body">
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
  </div>
</article>
```

**表示内容:**

ストックは登録時点で oEmbed 取得が完了しているため、すべてのカードは `title` / `embed_url` が揃った状態で表示される（`author_name` は Google Slides では仕様上 `null`）。`thumbnail_url` がある場合はサムネイル画像を表示し、ない場合や画像読み込み失敗時は文言なしの `/images/thumbnail-empty.svg` を同じ 16:9 枠で表示する。`pending` / `failed` 状態は ADR-009 §4-2 の rollback semantics により存在しない。Google Slides の HTML タイトル取得失敗もメタデータ null を残さない hard failure として扱う（ADR-009 §4-5、軟性失敗の廃止）。

> **設計判断（`status` 廃止）:** `stocks.status` カラムは migration 0003 で削除済み（ADR-009 §4-3 でも維持）。同期モデル + rollback semantics により取得失敗時に stock を作成しないため、`pending` / `failed` カードは UI に存在しない。`embed_url === null` の stock も原則作られない。クライアントはメタデータ取得の成否を、API レスポンスのステータスコード（201 か 4xx/5xx か）で判定する。

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

**レイアウト（モバイル折り返し対応、T-J）:**

長い日本語タイトル + プロバイダバッジが 1 行に収まらないケースを安全に扱うため、ヘッダーは flex で構成し、タイトルは折り返し可能、バッジはサイズ固定にする。

```css
.stock-card-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
}

.stock-card-title {
  flex: 1;
  min-width: 0;          /* flex item のデフォルト min-width: auto を解除して overflow させる */
  overflow-wrap: anywhere; /* 単語境界がない日本語でも折り返しを許可 */
}

.stock-card-header .badge {
  flex-shrink: 0;        /* バッジは縮まない／改行しない */
}
```

> **設計判断:** `justify-content: space-between` は使わない。タイトルを `flex: 1` で広げ、バッジは固有幅で右端に置く構成にした方が、タイトル折り返しとバッジ非折り返しの両立が素直に書ける。`min-width: 0` を入れないと flexbox 既定の `min-width: auto` がタイトルの折り返しを妨げる。

---

## §6 詳細画面（`/stocks/[id]` — stocks/[id].astro）

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

### §6.1 EmbedViewer コンポーネント

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

> **同期モデル化 + Google Slides 軟性失敗廃止に伴う変更:** 旧仕様では `pending` / `failed` プレースホルダーや「Google Slides の HTML タイトル取得失敗時の embed_url null カード」を定義していたが、ADR-009 §4-2 / §4-5 により取得失敗時は stock 自体を作らず `UPSTREAM_*` エラーを返すため、`embed_url === null` のレコードは原則発生しない。詳細画面で `embed_url === null` を発見した場合は **データ不整合（仕様外）として扱う**。フォールバック表示として「スライドの読み込みができません」プレースホルダーを保険として実装してもよいが、発生したらバグ報告対象。

### §6.2 MemoEditor コンポーネント

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
5. 成功（200）→ 保存成功フィードバック（下記）
6. エラー（400 MEMO_TOO_LONG）→ 「メモは10,000文字以内で入力してください」表示
7. エラー（401）→ redirectToLogin() で /login?return_to=<現在パス> にリダイレクト
8. エラー（404）→ 「ストックが見つかりません」表示
```

**保存成功フィードバック（視覚的強化）:**

| 動作 | 詳細 |
|------|------|
| textarea ボーダーの緑点灯 | `.memo-saved` クラスを 600ms 付与。CSS で `border-color: var(--color-success)` + 緑のリング `box-shadow`。クラス削除で元に戻る |
| ステータステキスト | `#memo-status` に「✓ 保存しました HH:MM」を `aria-live="polite"` のまま表示（時刻はクライアント時計、`HH:MM` ゼロ埋め 2 桁）|
| フェードアウト | ステータステキストは 3 秒後にクリアされる（既存挙動を維持）|
| `prefers-reduced-motion` | ボーダー点灯の transition は CSS で抑制 |

> **設計判断:** 「保存しました」だけだとボタンを押した記憶と紐づかず「ちゃんと保存されたか？」というユーザー疑念が残りやすい。textarea 自体に色変化を持たせ、タイムスタンプを添えることで「いま自分が押した行為に対する応答」だと一目で分かる。

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

### §6.3 削除機能

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

## §7 共通コンポーネント

### §7.1 コンポーネント階層

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

### §7.2 BaseLayout

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

### §7.3 Navbar

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
3. 失敗 → toast 通知（下記）でメッセージ表示
```

### §7.4 Toast 通知

`BaseLayout` の末尾に `<div id="toast" role="status" aria-live="polite" hidden></div>` を 1 つだけ配置する。各ページのクライアント JS はインライン `showToast(message, kind)` ヘルパーで内容と class を切り替えてから `hidden=false`、4 秒後に自動的に `hidden=true` に戻す。

| kind | スタイル | 使用例 |
|------|---------|-------|
| `error` | `.toast-error`、赤系の左ボーダー | ログアウト失敗・ネットワーク失敗 |
| `success` | `.toast-success`、緑系の左ボーダー | 将来の汎用成功通知（必要になったら追加）|

- スタックは作らない（連続表示時は前回タイマーをクリアして上書き、最後のメッセージのみ表示）
- モバイルでは画面下に固定して左右パディングを画面端まで広げる（`max-width: 360px` を解除）

> **設計判断:** alert／confirm／prompt のネイティブダイアログはブランド体験を損ね、画面操作をブロックする。toast は非ブロッキング、自動消滅、デザイントークン準拠で、後続の「memo 保存トースト化」「URL 入力成功トースト」などにも転用しやすい。

### §7.5 API 呼び出しヘルパー: api-client.ts

API 呼び出しの共通処理をまとめるユーティリティモジュール。

#### §7.5.1 関数一覧

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

#### §7.5.2 共通エラーハンドリング

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

// 401 を受けた呼び出し側はこのヘルパーを使う（return_to を保持）
function redirectToLogin(): void
```

- 401 レスポンス時は自動的に `/login` にリダイレクトしない（呼び出し側の判断に委ねる）。代わりに各ページが `redirectToLogin()` ヘルパーを呼ぶ
- `redirectToLogin()` は現在のパス + クエリを `return_to` として `/login?return_to=<エンコード値>` に渡す。`/` と `/login*` 自体からの遷移時は `return_to` を付けない（無限ループと無意味な戻り先を回避）
- 戻り先の検証は `/login` ページのクライアント側と `/api/auth/login` のサーバー側で二重に行う（同一オリジン内の相対パスのみ採用、`//` 始まり・絶対 URL・改行を含むものは無視）
- ネットワークエラー時は `ApiError` ではなく元の `TypeError` をそのまま throw する

#### §7.5.3 型定義

```typescript
interface StockItem {
  id: string;
  original_url: string;
  canonical_url: string;
  provider: "speakerdeck" | "docswell" | "google_slides";
  title: string | null;          // 同期モデル + rollback semantics 下では原則必ず存在（型は将来非同期化用に nullable のまま）
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;       // 同期モデル + rollback semantics 下では原則必ず存在（型は将来非同期化用に nullable のまま）
  memo_text: string | null;
  created_at: string;
  updated_at: string;
  // 注: status カラムは ADR-009 §4-3 で廃止（migration 0003）。型定義にも含めない。
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

### §7.6 状態管理

フレームワークレベルの状態管理は導入しない。各ページのクライアント JS で `fetch` + DOM 操作を直接行う。

#### §7.6.1 ローディング状態

| コンテキスト | 表示 | 実装 |
|-------------|------|------|
| 一覧の初期読み込み | CSS アニメーションのスピナー | `#stock-loading` の表示/非表示を切り替え |
| URL 送信中 | 送信ボタンが「追加中...」に変わり `disabled` | ボタンの `textContent` と `disabled` 属性を操作 |
| メモ保存中 | 保存ボタンが「保存中...」に変わり `disabled` | 同上 |
| 「もっと読み込む」 | ボタンが「読み込み中...」に変わり `disabled` | 同上 |
| 詳細画面の初期読み込み | スピナー表示 | ローディングコンテナの表示/非表示 |

#### §7.6.2 空状態

| コンテキスト | 表示内容 |
|-------------|---------|
| ストック 0 件 | 見出し「まだスライドがありません」+ 対応プロバイダリンク（SpeakerDeck / Docswell / Google Slides）+ フォームへのアクション誘導 |
| メモ未設定 | textarea が空のまま、placeholder が表示される |

#### §7.6.3 同期登録時のサーバー応答待ち

> **設計判断（同期モデル化）:** 旧仕様の「pending ストックのポーリング」は同期モデル化により不要となったため削除。POST /api/stocks のレスポンスを待つ間のクライアント挙動は §5.1 の送信処理 4-10 を参照。

POST /api/stocks のレスポンス待ち中の体験は以下を保証する：

| 経過時間 | 表示 |
|---------|------|
| 0〜3 秒 | 送信ボタンが「追加中...」+ disabled |
| 3 秒〜 | フォーム下に進捗テキスト「スライド情報を取得しています...」を `aria-live="polite"` で追加表示 |
| 8 秒〜 | 進捗テキストを「もう少々お待ちください...」に切替 |
| 15 秒（クライアント側タイムアウト） | エラー表示「タイムアウトしました。もう一度お試しください。」入力値はフォームに保持 |

サーバー側タイムアウトは backend-spec.md の合計 12 秒（プロバイダ呼び出し 10 秒 + バッファ）を想定。クライアント側 15 秒はサーバー応答に余裕を持たせるための上限。

#### §7.6.4 エラー状態

| コンテキスト | 表示内容 | 表示位置 |
|-------------|---------|---------|
| URL バリデーションエラー（400 INVALID_URL / UNSUPPORTED_PROVIDER / INVALID_FORMAT / UNSUPPORTED_URL_TYPE） | API の `error` フィールドの値をそのまま表示 | フォーム下の `#url-error` |
| プロバイダ側にスライドがない／非公開（400 UPSTREAM_NOT_FOUND / UPSTREAM_FORBIDDEN） | 「スライドが見つかりません。URL が正しいか、スライドが公開されているか確認してください。」入力値はフォームに保持 | フォーム下の `#url-error` |
| 重複登録（409 DUPLICATE_STOCK、事前重複チェック / 並列レース両方） | 「このスライドは既にストック済みです」 | フォーム下の `#url-error` |
| プロバイダ取得失敗（502 UPSTREAM_FAILURE / UPSTREAM_INVALID_RESPONSE / 504 UPSTREAM_TIMEOUT） | 「プロバイダから応答がありません。時間をおいて再度お試しください。」入力値はフォームに保持 | フォーム下の `#url-error` |
| クライアント側タイムアウト（15 秒） | 「タイムアウトしました。もう一度お試しください。」入力値はフォームに保持 | フォーム下の `#url-error` |
| ネットワークエラー | 「サーバーに接続できません。ネットワーク接続を確認してください。」入力値はフォームに保持 | フォーム下の `#url-error` |
| 認証エラー（401 UNAUTHORIZED） | ログインページにリダイレクト（メッセージ表示なし） | — |
| 詳細画面 404 | 「ストックが見つかりません」+ 一覧に戻るリンク | ページ本文 |
| メモ保存エラー | API の `error` フィールドの値を `#memo-status` に赤字表示 | メモエディタ下部 |
| 内部エラー（500 INTERNAL_ERROR） | 「エラーが発生しました。しばらくしてからやり直してください。」入力値はフォームに保持 | フォーム下の `#url-error` |

---

## §8 デザイントークン / スタイル

### §8.1 ファイル構成

```
public/
└── styles/
    └── global.css     # 全スタイルを1ファイルに収める
```

> **設計判断:** MVP では CSS ファイルを 1 つにまとめる。コンポーネント数が少なく（10 未満）、
> 分割のオーバーヘッドが利点を上回る。将来コンポーネント数が増えた場合にファイル分割を検討する。

### §8.2 CSS カスタムプロパティ（デザイントークン）

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

### §8.2.1 フォント self-host 設定

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

### §8.2.2 タイポグラフィ用途別マッピング

| 用途 | font-family | weight | size | letter-spacing |
|------|------------|--------|------|----------------|
| h1（ページタイトル） | display | 700 | 32px | tight |
| h2（セクションタイトル） | display | 600 | 24px | tight |
| h3（カードタイトル等） | display | 600 | 18px | normal |
| 本文 | body | 400 | 16px | normal |
| 補助テキスト | body | 400 | 14px | normal |
| ボタン | body | 500 | 14px | normal |
| コード／URL 表示 | mono | 400 | 14px | normal |

### §8.3 グローバルリセット

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

### §8.4 ボタンスタイル

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

### §8.5 カードスタイル

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

## §9 レスポンシブ / アクセシビリティ

### §9.1 ブレイクポイント

| 名前 | 幅 | 対象 |
|------|-----|------|
| Mobile | `< 640px` | スマートフォン |
| Tablet | `640px 〜 959px` | タブレット |
| Desktop | `≥ 960px` | デスクトップ |

### §9.2 レイアウト変化

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

### §9.3 メディアクエリ

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

### §9.4 セマンティック HTML

| 要件 | 実装 |
|------|------|
| ナビゲーション | `<nav>` + `role="navigation"` + `aria-label` |
| メインコンテンツ | `<main>` 要素を使用 |
| セクション | `<section>` + `aria-label` で目的を明示 |
| ストックカード | `<article>` 要素を使用 |
| フォーム | `<form>` + `role="form"` + `aria-label` |
| 見出し階層 | `<h1>` → `<h2>` の正しい階層を維持 |

### §9.5 フォームアクセシビリティ

| 要件 | 実装 |
|------|------|
| ラベル | すべての `<input>` / `<textarea>` に `<label>` を関連付け（`for`/`id`） |
| スクリーンリーダー専用ラベル | 視覚的に非表示のラベルには `.sr-only` クラスを使用 |
| エラーメッセージ | `role="alert"` + `aria-live="polite"` で動的通知 |
| 必須フィールド | `required` 属性を使用 |
| 入力型 | `type="url"` でモバイルキーボード最適化 |

### §9.6 キーボード操作

| 要件 | 実装 |
|------|------|
| フォーカス順序 | 自然な Tab 順序を維持（`tabindex` の変更は最小限） |
| フォーカスインジケータ | ブラウザデフォルトの `outline` を維持。カスタムする場合は `outline: 2px solid var(--color-primary)` |
| Enter キーでの送信 | `<form>` 内の `<button type="submit">` でネイティブ動作を活用 |
| Escape キー | モーダルやドロップダウンを閉じる（MVP では該当 UI なし） |

### §9.7 ARIA

| 要件 | 実装 |
|------|------|
| ローディング状態 | `role="status"` + `aria-label="読み込み中"` |
| 動的コンテンツ更新 | `aria-live="polite"` で変更を通知 |
| 外部リンク | `target="_blank"` には `rel="noopener noreferrer"` を付与 |
| iframe | `title` 属性でコンテンツを説明 |
| アイコン | 装飾的アイコンには `aria-hidden="true"` |

### §9.8 スクリーンリーダー専用クラス

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
