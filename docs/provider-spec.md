# プロバイダ検出仕様

## 1. 概要

ユーザーが入力した URL から対応プロバイダを検出し、canonical URL に正規化する。
このモジュールは `worker/lib/provider.ts` に `detectProvider(url)` として実装する。

### 対応プロバイダ

| provider 識別子 | サービス名 | oEmbed 対応 |
|-----------------|-----------|-------------|
| `speakerdeck` | SpeakerDeck | Yes |
| `docswell` | Docswell | Yes |
| `google_slides` | Google Slides | No（embed URL を自前構築） |

### 関数シグネチャ

```typescript
type Provider = "speakerdeck" | "docswell" | "google_slides";

interface DetectResult {
  provider: Provider;
  canonicalUrl: string;
}

function detectProvider(url: string): DetectResult;
// 未対応 URL や無効な形式の場合は ProviderError を throw する
```

---

## 2. SpeakerDeck

### 2.1 URL パターン

**公開スライド URL:**
```
https://speakerdeck.com/{username}/{slug}
```

例:
- `https://speakerdeck.com/jnunemaker/atom`
- `https://speakerdeck.com/aaronpk/securing-your-apis-with-oauth-2-dot-0`

**プレイヤー URL（embed 用）:**
```
https://speakerdeck.com/player/{hex_id}
```
- `hex_id` は 32 文字の 16 進数（UUID ハイフンなし）
- oEmbed レスポンスの `html` フィールド内 iframe src に含まれる

### 2.2 URL マッチング正規表現

```typescript
const SPEAKERDECK_RE = /^https?:\/\/(www\.)?speakerdeck\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?$/;
```

**グループ:**
1. `www.` プレフィックス（optional）
2. `username` — `[a-zA-Z0-9_-]+`
3. `slug` — `[a-zA-Z0-9_-]+`

### 2.3 正規化ルール

| 項目 | ルール |
|------|--------|
| スキーム | `https` に統一 |
| ホスト | `speakerdeck.com`（`www.` を除去） |
| パス | `/{username}/{slug}` のみ保持 |
| クエリパラメータ | すべて除去 |
| フラグメント | すべて除去 |
| 末尾スラッシュ | 除去 |

**正規化例:**

| 入力 | canonical URL |
|------|---------------|
| `https://speakerdeck.com/jnunemaker/atom` | `https://speakerdeck.com/jnunemaker/atom` |
| `http://www.speakerdeck.com/jnunemaker/atom/` | `https://speakerdeck.com/jnunemaker/atom` |
| `https://speakerdeck.com/jnunemaker/atom?slide=3` | `https://speakerdeck.com/jnunemaker/atom` |

### 2.4 oEmbed エンドポイント

```
GET https://speakerdeck.com/oembed.json?url={canonical_url}
```

**レスポンス例:**
```json
{
  "type": "rich",
  "version": "1.0",
  "provider_name": "Speaker Deck",
  "provider_url": "https://speakerdeck.com/",
  "title": "Atom",
  "author_name": "John Nunemaker",
  "author_url": "https://speakerdeck.com/jnunemaker",
  "html": "<iframe ... src=\"https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3\" ...></iframe>",
  "width": 710,
  "height": 399,
  "ratio": 1.7777777777777777
}
```

**抽出するフィールド:**

| oEmbed フィールド | → stocks カラム |
|-------------------|-----------------|
| `title` | `title` |
| `author_name` | `author_name` |
| `html` 内 iframe `src` | `embed_url` |
| （なし） | `thumbnail_url`（oEmbed に含まれない） |

> **注意:** SpeakerDeck の oEmbed レスポンスには `thumbnail_url` が含まれない。
> サムネイルが必要な場合は、プレゼンページの OGP メタタグから取得する必要がある（MVP では null 許容）。

### 2.5 エッジケース

| ケース | 判定 | 理由 |
|--------|------|------|
| `https://speakerdeck.com/player/abc123` | **拒否** | embed URL であり、公開 URL ではない |
| `https://speakerdeck.com/jnunemaker` | **拒否** | ユーザープロフィールページ（slug がない） |
| `https://speakerdeck.com/c/technology` | **拒否** | カテゴリページ |
| `https://speakerdeck.com/features/pro` | **拒否** | 機能ページ |

---

## 3. Docswell

### 3.1 URL パターン

**公開スライド URL:**
```
https://www.docswell.com/s/{username}/{slideId}-{title_slug}
```

構造:
- `username` — `[A-Za-z0-9_]+`
- `slideId` — `[A-Z0-9]{6}`（6 文字の英大文字 + 数字）
- `title_slug` — `[A-Za-z0-9_-]+`（タイトルのスラッグ、省略可）

例:
- `https://www.docswell.com/s/takai/59VDWM-Recap-Windows-Server-2025`
- `https://www.docswell.com/s/kromiii/ZL1Q8G-notion-to-slides`
- `https://www.docswell.com/s/kdk_wakaba/ZXE6GM-2024-12-06-154613`

**短縮形（title_slug なし）:**
```
https://www.docswell.com/s/{username}/{slideId}
```
- サーバーは 302 で canonical URL にリダイレクトする
- 例: `https://www.docswell.com/s/takai/59VDWM` → `https://www.docswell.com/s/takai/59VDWM-Recap-Windows-Server-2025`

**埋め込み URL:**
```
https://www.docswell.com/slide/{slideId}/embed
```

### 3.2 URL マッチング正規表現

```typescript
const DOCSWELL_RE = /^https?:\/\/(www\.)?docswell\.com\/s\/([A-Za-z0-9_]+)\/([A-Z0-9]{6})(-[A-Za-z0-9_-]+)?\/?$/;
```

**グループ:**
1. `www.` プレフィックス（optional）
2. `username` — `[A-Za-z0-9_]+`
3. `slideId` — `[A-Z0-9]{6}`
4. `title_slug` — `-[A-Za-z0-9_-]+`（optional、先頭のハイフンを含む）

### 3.3 正規化ルール

| 項目 | ルール |
|------|--------|
| スキーム | `https` に統一 |
| ホスト | `www.docswell.com`（`www.` を付与） |
| パス | `/s/{username}/{slideId}` のみ保持（title_slug を除去） |
| クエリパラメータ | すべて除去 |
| フラグメント | すべて除去 |
| 末尾スラッシュ | 除去 |

> **設計判断:** canonical URL に title_slug を含めない理由:
> - slideId（6 文字）でスライドは一意に識別できる
> - タイトル変更時に title_slug が変わる可能性があるため、永続的な識別子として不適切
> - oEmbed エンドポイントは title_slug 有無どちらでも正しく動作する

**正規化例:**

| 入力 | canonical URL |
|------|---------------|
| `https://www.docswell.com/s/takai/59VDWM-Recap-Windows-Server-2025` | `https://www.docswell.com/s/takai/59VDWM` |
| `https://docswell.com/s/takai/59VDWM-Recap-Windows-Server-2025` | `https://www.docswell.com/s/takai/59VDWM` |
| `https://www.docswell.com/s/takai/59VDWM` | `https://www.docswell.com/s/takai/59VDWM` |
| `http://docswell.com/s/takai/59VDWM/` | `https://www.docswell.com/s/takai/59VDWM` |

### 3.4 oEmbed エンドポイント

```
GET https://www.docswell.com/service/oembed?url={canonical_url}&format=json
```

**レスポンス例:**
```json
{
  "type": "rich",
  "version": 1,
  "provider_name": "ドクセル",
  "provider_url": "https://www.docswell.com/",
  "title": "Windows Server 2025 新機能おさらい",
  "url": "https://www.docswell.com/slide/59VDWM/embed",
  "author_name": "Kazuki Takai",
  "author_url": "https://www.docswell.com/user/takai",
  "html": "<iframe src=\"https://www.docswell.com/slide/59VDWM/embed\" ...></iframe>",
  "width": 620,
  "height": 349
}
```

**抽出するフィールド:**

| oEmbed フィールド | → stocks カラム |
|-------------------|-----------------|
| `title` | `title` |
| `author_name` | `author_name` |
| `url` | `embed_url` |
| （なし） | `thumbnail_url`（oEmbed に含まれない） |

**エラーレスポンス（存在しない / 非公開）:**
```json
{"status": 404, "errors": "Slide not found or private"}
```

### 3.5 エッジケース

| ケース | 判定 | 理由 |
|--------|------|------|
| `https://www.docswell.com/slide/59VDWM/embed` | **拒否** | embed URL であり、公開 URL ではない |
| `https://www.docswell.com/user/takai` | **拒否** | ユーザープロフィールページ |
| `https://www.docswell.com/s/takai/xxxxx` | **拒否** | slideId が 6 文字でない |
| `https://www.docswell.com/s/takai/abcdef-test` | **拒否** | slideId が小文字（大文字 + 数字のみ） |

---

## 4. Google Slides

### 4.1 URL パターン

**公開プレゼンテーション URL:**
```
https://docs.google.com/presentation/d/{presentationId}/{suffix}
```

構造:
- `presentationId` — `[a-zA-Z0-9_-]{25,}` （通常 44 文字、最低 25 文字以上）
- `suffix` — `edit` / `preview` / `present` / `embed` / `pub` / `copy` / `export` 等（任意）

例:
- `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit`
- `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit?usp=sharing`
- `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/preview`
- `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/embed`
- `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/pub`

**「ウェブに公開」URL（published）:**
```
https://docs.google.com/presentation/d/e/{publishedId}/pub
```
- `publishedId` は `2PACX-` で始まる長い文字列
- 元の presentationId とは異なるオペーク ID

### 4.2 URL マッチング正規表現

```typescript
// 通常の公開 URL
const GOOGLE_SLIDES_RE = /^https?:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]{25,})(?:\/[a-z]*)?(?:[?#].*)?$/;

// 「ウェブに公開」URL
const GOOGLE_SLIDES_PUBLISHED_RE = /^https?:\/\/docs\.google\.com\/presentation\/d\/e\/(2PACX-[a-zA-Z0-9_-]+)(?:\/[a-z]*)?(?:[?#].*)?$/;
```

**通常 URL のグループ:**
1. `presentationId` — `[a-zA-Z0-9_-]{25,}`

**Published URL のグループ:**
1. `publishedId` — `2PACX-[a-zA-Z0-9_-]+`

> **MVP 方針:** 通常の `/d/{id}` URL のみ対応する。
> Published URL（`/d/e/2PACX-...`）は MVP では非対応とし、エラーメッセージで通常の共有 URL を使うよう案内する。

### 4.3 正規化ルール

| 項目 | ルール |
|------|--------|
| スキーム | `https` に統一 |
| ホスト | `docs.google.com`（固定） |
| パス | `/presentation/d/{presentationId}` のみ保持 |
| suffix | 除去（`edit`, `preview`, `embed` 等） |
| クエリパラメータ | すべて除去（`usp=sharing` 等） |
| フラグメント | すべて除去（`#slide=id.p` 等） |

**正規化例:**

| 入力 | canonical URL |
|------|---------------|
| `https://docs.google.com/presentation/d/1abc123.../edit` | `https://docs.google.com/presentation/d/1abc123...` |
| `https://docs.google.com/presentation/d/1abc123.../edit?usp=sharing` | `https://docs.google.com/presentation/d/1abc123...` |
| `https://docs.google.com/presentation/d/1abc123.../edit#slide=id.p3` | `https://docs.google.com/presentation/d/1abc123...` |
| `https://docs.google.com/presentation/d/1abc123.../embed?start=true` | `https://docs.google.com/presentation/d/1abc123...` |
| `https://docs.google.com/presentation/d/1abc123.../preview` | `https://docs.google.com/presentation/d/1abc123...` |
| `https://docs.google.com/presentation/d/1abc123...` | `https://docs.google.com/presentation/d/1abc123...` |

### 4.4 メタデータ取得（oEmbed 非対応）

Google Slides は oEmbed に対応していない。以下の方式でメタデータを取得する:

**embed URL の構築:**
```
https://docs.google.com/presentation/d/{presentationId}/embed
```

**タイトル取得:**
- プレゼンページの HTML を fetch し、`<title>` タグまたは OGP `<meta property="og:title">` から抽出する
- 公開設定でない場合は取得できない（`title` は null のまま）

**サムネイル取得:**
- MVP では null とする（Google Slides はサムネイル URL を公開 API なしに取得するのが困難）

**author_name:**
- Google Slides の公開ページにはauthorが明示されないため、null とする

### 4.5 エッジケース

| ケース | 判定 | 理由 |
|--------|------|------|
| `https://docs.google.com/presentation/d/e/2PACX-.../pub` | **拒否（MVP）** | Published URL は非対応 |
| `https://docs.google.com/presentation/d/1abc.../export?format=pdf` | **受理** → canonical 化 | export suffix は除去して正規化 |
| `https://docs.google.com/presentation/d/1abc.../copy` | **受理** → canonical 化 | copy suffix は除去して正規化 |
| `https://docs.google.com/spreadsheets/d/...` | **拒否** | スプレッドシートであり Slides ではない |
| `https://docs.google.com/document/d/...` | **拒否** | ドキュメントであり Slides ではない |
| `https://slides.new` | **拒否** | 新規作成ショートカット。既存スライドではない |

---

## 5. 共通バリデーション

### 5.1 入力前処理

`detectProvider` に渡す前に以下の前処理を行う:

1. 前後の空白を trim する
2. URL として有効かチェック（`new URL(input)` で parse できるか）
3. スキームが `http` または `https` であることを確認

### 5.2 検出順序

```
1. SpeakerDeck の正規表現にマッチ → provider: "speakerdeck"
2. Docswell の正規表現にマッチ    → provider: "docswell"
3. Google Slides の正規表現にマッチ → provider: "google_slides"
4. いずれにもマッチしない          → ProviderError を throw
```

### 5.3 エラー定義

```typescript
class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

type ProviderErrorCode =
  | "INVALID_URL"         // URL として無効（parse 不可）
  | "UNSUPPORTED_SCHEME"  // http/https 以外のスキーム
  | "UNSUPPORTED_PROVIDER"// 対応プロバイダのドメインではない
  | "INVALID_FORMAT"      // ドメインは対応しているがパス形式が不正
  | "UNSUPPORTED_URL_TYPE"// embed URL や profile URL など、ストック対象外の URL
```

**エラーメッセージ例:**

| code | メッセージ |
|------|-----------|
| `INVALID_URL` | `"入力された文字列は有効な URL ではありません"` |
| `UNSUPPORTED_SCHEME` | `"http または https の URL を入力してください"` |
| `UNSUPPORTED_PROVIDER` | `"対応していないサービスの URL です。SpeakerDeck / Docswell / Google Slides の URL を入力してください"` |
| `INVALID_FORMAT` | `"URL の形式が正しくありません。スライドの公開 URL を入力してください"` |
| `UNSUPPORTED_URL_TYPE` | `"この URL は登録できません。スライドの公開ページの URL を入力してください"` |

---

## 6. テストケース一覧

QA（T-512）で作成するテストケースの網羅表。

### 6.1 SpeakerDeck

#### 正常系

| # | 入力 URL | 期待: provider | 期待: canonicalUrl |
|---|---------|---------------|-------------------|
| S1 | `https://speakerdeck.com/user/slide` | `speakerdeck` | `https://speakerdeck.com/user/slide` |
| S2 | `http://speakerdeck.com/user/slide` | `speakerdeck` | `https://speakerdeck.com/user/slide` |
| S3 | `https://www.speakerdeck.com/user/slide` | `speakerdeck` | `https://speakerdeck.com/user/slide` |
| S4 | `https://speakerdeck.com/user/slide/` | `speakerdeck` | `https://speakerdeck.com/user/slide` |
| S5 | `https://speakerdeck.com/user-name/my-slide-2024` | `speakerdeck` | `https://speakerdeck.com/user-name/my-slide-2024` |

#### 異常系

| # | 入力 URL | 期待: エラーコード |
|---|---------|------------------|
| S6 | `https://speakerdeck.com/user` | `INVALID_FORMAT` |
| S7 | `https://speakerdeck.com/player/abc123def456` | `UNSUPPORTED_URL_TYPE` |
| S8 | `https://speakerdeck.com/c/technology` | `INVALID_FORMAT` |
| S9 | `https://speakerdeck.com/features/pro` | `INVALID_FORMAT` |

### 6.2 Docswell

#### 正常系

| # | 入力 URL | 期待: provider | 期待: canonicalUrl |
|---|---------|---------------|-------------------|
| D1 | `https://www.docswell.com/s/takai/59VDWM-Recap-Windows-Server-2025` | `docswell` | `https://www.docswell.com/s/takai/59VDWM` |
| D2 | `https://docswell.com/s/takai/59VDWM-Recap-Windows-Server-2025` | `docswell` | `https://www.docswell.com/s/takai/59VDWM` |
| D3 | `https://www.docswell.com/s/takai/59VDWM` | `docswell` | `https://www.docswell.com/s/takai/59VDWM` |
| D4 | `http://docswell.com/s/takai/59VDWM/` | `docswell` | `https://www.docswell.com/s/takai/59VDWM` |
| D5 | `https://www.docswell.com/s/kdk_wakaba/ZXE6GM-2024-12-06-154613` | `docswell` | `https://www.docswell.com/s/kdk_wakaba/ZXE6GM` |

#### 異常系

| # | 入力 URL | 期待: エラーコード |
|---|---------|------------------|
| D6 | `https://www.docswell.com/slide/59VDWM/embed` | `UNSUPPORTED_URL_TYPE` |
| D7 | `https://www.docswell.com/user/takai` | `INVALID_FORMAT` |
| D8 | `https://www.docswell.com/s/takai/abc` | `INVALID_FORMAT` |
| D9 | `https://www.docswell.com/s/takai/abcdef-test` | `INVALID_FORMAT` |

### 6.3 Google Slides

#### 正常系

| # | 入力 URL | 期待: provider | 期待: canonicalUrl |
|---|---------|---------------|-------------------|
| G1 | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit` | `google_slides` | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc` |
| G2 | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit?usp=sharing` | `google_slides` | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc` |
| G3 | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit#slide=id.p3` | `google_slides` | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc` |
| G4 | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/preview` | `google_slides` | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc` |
| G5 | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/embed?start=true` | `google_slides` | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc` |
| G6 | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc` | `google_slides` | `https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc` |

#### 異常系

| # | 入力 URL | 期待: エラーコード |
|---|---------|------------------|
| G7 | `https://docs.google.com/presentation/d/e/2PACX-abc123/pub` | `UNSUPPORTED_URL_TYPE` |
| G8 | `https://docs.google.com/spreadsheets/d/1abc123.../edit` | `UNSUPPORTED_PROVIDER` |
| G9 | `https://docs.google.com/document/d/1abc123.../edit` | `UNSUPPORTED_PROVIDER` |
| G10 | `https://docs.google.com/presentation/d/short` | `INVALID_FORMAT` |

### 6.4 共通異常系

| # | 入力 URL | 期待: エラーコード |
|---|---------|------------------|
| C1 | `not-a-url` | `INVALID_URL` |
| C2 | `ftp://speakerdeck.com/user/slide` | `UNSUPPORTED_SCHEME` |
| C3 | `https://example.com/slides` | `UNSUPPORTED_PROVIDER` |
| C4 | `https://slideshare.net/user/slide` | `UNSUPPORTED_PROVIDER` |
| C5 | `` (空文字) | `INVALID_URL` |
| C6 | `   ` (空白のみ) | `INVALID_URL` |

---

## 7. 実装タスクとの対応

| タスク | 本仕様の該当セクション |
|--------|----------------------|
| T-511 プロバイダ検出モジュール実装 | セクション 1 〜 5 |
| T-512 プロバイダ検出ユニットテスト | セクション 6 |
| T-520 oEmbed/Queue 処理仕様 | セクション 2.4, 3.4, 4.4（oEmbed 部分） |
| T-531 POST /stocks 実装 | セクション 1, 5（detectProvider 呼び出し） |
