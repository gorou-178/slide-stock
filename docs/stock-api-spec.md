# Stock API 仕様

## 1. 概要

Stock API はスライドのストック（登録・一覧・詳細・削除）を管理する CRUD API である。
全エンドポイントは認証必須であり、セッション Cookie による認証ミドルウェア（docs/auth-spec.md セクション 5.5）を通過した `AuthContext` が前提となる。

### 前提ドキュメント

- [docs/architecture.md](architecture.md) — スライド登録フロー（シーケンス図）
- [docs/database.md](database.md) — stocks / memos テーブル定義
- [docs/provider-spec.md](provider-spec.md) — プロバイダ検出・URL 正規化
- [docs/oembed-spec.md](oembed-spec.md) — oEmbed / Queue 処理

### エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/stocks` | スライド URL を登録 |
| GET | `/api/stocks` | ストック一覧を取得 |
| GET | `/api/stocks/:id` | ストック詳細を取得 |
| DELETE | `/api/stocks/:id` | ストックを削除 |

---

## 2. 共通仕様

### 2.1 認証

全エンドポイントで認証が必須。セッション Cookie が無い、または無効な場合は以下を返す:

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "認証が必要です",
  "code": "UNAUTHORIZED"
}
```

### 2.2 エラーレスポンス形式

全エンドポイント共通のエラーレスポンス形式:

```typescript
interface ErrorResponse {
  error: string;   // 人間可読なエラーメッセージ（日本語）
  code: string;    // 機械処理用エラーコード（UPPER_SNAKE_CASE）
}
```

### 2.3 エラーコード一覧

| HTTP ステータス | code | 説明 |
|----------------|------|------|
| 400 | `INVALID_REQUEST` | リクエストボディが不正（JSON パースエラー含む） |
| 400 | `INVALID_URL` | URL 形式が不正 |
| 400 | `UNSUPPORTED_PROVIDER` | 対応していないプロバイダの URL |
| 400 | `INVALID_FORMAT` | プロバイダは対応しているがパス形式が不正 |
| 400 | `UNSUPPORTED_URL_TYPE` | embed URL やプロフィール URL などストック対象外 |
| 401 | `UNAUTHORIZED` | 認証が必要 |
| 404 | `NOT_FOUND` | 指定されたリソースが存在しない |
| 409 | `DUPLICATE_STOCK` | 同一 URL が既にストック済み |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |

> **設計判断（プロバイダ取得失敗を 4xx / 5xx で返さない）:** ADR-004 / oembed-spec.md §7 のとおり、メタデータ取得失敗時も stock 自体は INSERT 済みのため、API は 201 を返してメタデータフィールドを `null` にする。クライアントには「ストックは作成された、メタデータは取れていない」状態を 1 つのレスポンス形で表現する。詳細は §3.5。

### 2.4 日時形式

全日時フィールドは ISO 8601 文字列（UTC）:

```
"2025-06-15T10:30:00.000Z"
```

### 2.5 Content-Type

- リクエスト: `application/json`
- レスポンス: `application/json`

---

## 3. POST /api/stocks

新しいスライド URL をストックに登録する。

### 3.1 リクエスト

```
POST /api/stocks
Content-Type: application/json
Cookie: session=...

{
  "url": "https://speakerdeck.com/jnunemaker/atom"
}
```

**リクエストボディ:**

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `url` | string | Yes | ストックするスライドの URL |

### 3.2 処理フロー

```
1. リクエストボディの JSON パース
2. url フィールドの存在・型チェック
3. detectProvider(url) でプロバイダ検出・URL 正規化
   → 失敗時: ProviderError に応じた 400 エラー返却
4. 重複チェック: 同一ユーザー × canonical_url で既存 stock を検索
   → 重複あり: 409 Conflict 返却
5. stock を INSERT（メタデータは未取得、title / author_name / embed_url は null）
6. プロバイダ別 oEmbed / メタデータ取得を同期実行（best-effort、リトライなし、各 10 秒タイムアウト）
   → 成功: UPDATE でメタデータ反映（title / author_name / embed_url / thumbnail_url）
   → 失敗（404/403/5xx/タイムアウト/形式不正のいずれも）: catch して console.error にログ、UPDATE しない
7. 201 Created + stock オブジェクト返却（メタデータが取れていれば充足、取れなければ null）
```

> **設計判断（optimistic insert）:** ADR-004 / oembed-spec.md §5.1 のとおり、stock の INSERT を先に実行して oEmbed 取得は best-effort で行う。元 URL 自体に「あとで開けばよい」価値があるため、メタデータ未取得を 5xx 扱いにせず 201 を返す。pending / failed 状態は存在せず、UI 側でメタデータの有無による表示分岐のみ行う（ui-spec.md §5.3.3）。

### 3.3 バリデーション

`detectProvider(url)` が throw する `ProviderError` を HTTP エラーにマッピングする:

| ProviderErrorCode | → HTTP ステータス | → エラー code |
|-------------------|-----------------|--------------|
| `INVALID_URL` | 400 | `INVALID_URL` |
| `UNSUPPORTED_SCHEME` | 400 | `INVALID_URL` |
| `UNSUPPORTED_PROVIDER` | 400 | `UNSUPPORTED_PROVIDER` |
| `INVALID_FORMAT` | 400 | `INVALID_FORMAT` |
| `UNSUPPORTED_URL_TYPE` | 400 | `UNSUPPORTED_URL_TYPE` |

### 3.4 重複チェック

同一ユーザーが同じスライドを二重登録することを防ぐ。

**SQL:**
```sql
SELECT id FROM stocks
WHERE user_id = ? AND canonical_url = ?
LIMIT 1;
```

**重複時のレスポンス:**

```
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": "このスライドは既にストック済みです",
  "code": "DUPLICATE_STOCK"
}
```

> **設計判断:** 既存 stock の返却（200）ではなく 409 を採用する。理由:
> - フロントエンドが「既にストック済み」であることを明確に判別できる
> - POST の冪等性を保証する必要がない（同じ URL の再送信はユーザー操作ミスとみなす）
> - 「同じ URL を同じユーザーが異なる意図でストック」するユースケースは想定しない

### 3.5 stock 挿入（メタデータなしで先に書く）

重複チェック通過後、まず stock を INSERT する。この時点では `title` / `author_name` / `embed_url` / `thumbnail_url` は未取得のためカラムを指定しない（NULL がデフォルト）。`status` カラムは migration 0003 で削除済み（database.md）のため指定しない。

```sql
INSERT INTO stocks (
  id, user_id, original_url, canonical_url, provider,
  created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?);
```

- `id`: `uuidv7()` で生成
- `user_id`: AuthContext.userId
- `original_url`: リクエストの `url`（ユーザー入力そのまま）
- `canonical_url`: `detectProvider` が返した正規化 URL
- `provider`: `detectProvider` が返したプロバイダ識別子
- `created_at`, `updated_at`: 現在時刻（ISO 8601）

UNIQUE 制約違反（`uniq_stocks_user_canonical_url`、database.md / migration 0002）で同時送信レースが起きた場合は catch して 409 `DUPLICATE_STOCK` を返す。

### 3.6 同期 oEmbed 取得（best-effort）

INSERT の直後にプロバイダ別の oEmbed / メタデータ取得を同期実行する。リトライは行わず、各リクエストは 10 秒タイムアウト（oembed-spec.md §6 / §8）。

```typescript
let metadata: StockMetadata = {
  title: null, authorName: null, thumbnailUrl: null, embedUrl: null,
};

try {
  metadata = await fetchMetadataByProvider(provider, canonicalUrl);
  await env.DB.prepare(
    `UPDATE stocks
     SET title = ?, author_name = ?, embed_url = ?, thumbnail_url = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(metadata.title, metadata.authorName, metadata.embedUrl,
          metadata.thumbnailUrl, new Date().toISOString(), stockId)
    .run();
} catch (error) {
  console.error(JSON.stringify({
    action: "oembed_fetch_failed", stockId, provider, error: String(error),
  }));
  // メタデータなしで続行（stock 自体は INSERT 済み）
}
```

| 取得結果 | 後続処理 | API レスポンス |
|---------|---------|--------------|
| 成功 | UPDATE でメタデータ反映 | 201 + メタデータ充足 |
| 恒久エラー（404 / 403 / `PermanentError`） | catch + ログ、UPDATE せず | 201 + メタデータ null |
| 一般エラー（5xx / タイムアウト / ネットワーク） | catch + ログ、UPDATE せず | 201 + メタデータ null |

各プロバイダ別の取得処理は oembed-spec.md §2〜§4、エラー分類は oembed-spec.md §6.3。

### 3.7 レスポンス（201 Created）

#### 成功時（メタデータ取得も成功）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "original_url": "https://speakerdeck.com/jnunemaker/atom",
  "canonical_url": "https://speakerdeck.com/jnunemaker/atom",
  "provider": "speakerdeck",
  "title": "Atom",
  "author_name": "John Nunemaker",
  "thumbnail_url": null,
  "embed_url": "https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3",
  "memo_text": null,
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2025-06-15T10:30:00.000Z"
}
```

#### 取得失敗時（stock は作成、メタデータは null）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "original_url": "https://speakerdeck.com/jnunemaker/atom",
  "canonical_url": "https://speakerdeck.com/jnunemaker/atom",
  "provider": "speakerdeck",
  "title": null,
  "author_name": null,
  "thumbnail_url": null,
  "embed_url": null,
  "memo_text": null,
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2025-06-15T10:30:00.000Z"
}
```

> **注意:** レスポンスに `status` フィールドは含まれない（migration 0003 で削除済み）。クライアントは `embed_url` の有無でメタデータ取得の成否を判断する（ui-spec.md §5.3.3）。

### 3.8 エラーレスポンス例

**URL 形式不正（400）:**
```json
{
  "error": "入力された文字列は有効な URL ではありません",
  "code": "INVALID_URL"
}
```

**未対応プロバイダ（400）:**
```json
{
  "error": "対応していないサービスの URL です。SpeakerDeck / Docswell / Google Slides の URL を入力してください",
  "code": "UNSUPPORTED_PROVIDER"
}
```

**重複（409）:**
```json
{
  "error": "このスライドは既にストック済みです",
  "code": "DUPLICATE_STOCK"
}
```

> **注意:** プロバイダ側にスライドが存在しない（404）、アクセス拒否（403）、5xx、タイムアウト等の oEmbed 取得失敗ケースは**エラーレスポンスを返さない**。201 + メタデータ null の stock を返し、クライアント側で「タイトルが取れていないカード」として表示する（§3.7 の取得失敗時の例 / ui-spec.md §5.3.3）。

---

## 4. GET /api/stocks

認証ユーザーのストック一覧を取得する。

### 4.1 リクエスト

```
GET /api/stocks?limit=20&cursor=2025-06-14T08:00:00.000Z_550e8400-...
Cookie: session=...
```

### 4.2 クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `limit` | number | No | `20` | 取得件数（1〜100） |
| `cursor` | string | No | なし | ページネーションカーソル（次ページ取得用） |

**limit のバリデーション:**
- 数値でない場合: デフォルト値 `20` を使用
- 1 未満の場合: `1` に補正
- 100 を超える場合: `100` に補正

### 4.3 ページネーション方式: Cursor-based

**カーソル形式:**
```
{created_at}_{id}
```
例: `2025-06-14T08:00:00.000Z_550e8400-e29b-41d4-a716-446655440000`

**選択理由:**

| 方式 | メリット | デメリット |
|------|---------|-----------|
| **Cursor-based** | データ追加/削除時にずれない。D1 のインデックスと相性が良い。 | カーソル文字列の管理が必要。任意ページへのジャンプ不可。 |
| Offset-based | 実装がシンプル。任意ページジャンプ可能。 | データ追加/削除でページずれが発生。OFFSET が大きいとパフォーマンス低下。 |

> **採用:** Cursor-based。理由:
> - スライド登録/削除が頻繁に行われる一覧でページずれを防ぎたい
> - フロントエンドは「もっと読み込む」UI（無限スクロール or Load More ボタン）を想定
> - 任意ページジャンプは不要（個人利用でストック数は限定的）

### 4.4 SQL クエリ

**カーソルなし（初回）:**
```sql
SELECT
  s.id, s.original_url, s.canonical_url, s.provider,
  s.title, s.author_name, s.thumbnail_url, s.embed_url,
  s.created_at, s.updated_at,
  m.memo_text
FROM stocks s
LEFT JOIN memos m ON m.stock_id = s.id AND m.user_id = s.user_id
WHERE s.user_id = ?
ORDER BY s.created_at DESC, s.id DESC
LIMIT ?;
```

**カーソルあり（次ページ）:**
```sql
SELECT
  s.id, s.original_url, s.canonical_url, s.provider,
  s.title, s.author_name, s.thumbnail_url, s.embed_url,
  s.created_at, s.updated_at,
  m.memo_text
FROM stocks s
LEFT JOIN memos m ON m.stock_id = s.id AND m.user_id = s.user_id
WHERE s.user_id = ?
  AND (s.created_at < ? OR (s.created_at = ? AND s.id < ?))
ORDER BY s.created_at DESC, s.id DESC
LIMIT ?;
```

> **カーソル条件の説明:**
> `created_at` が同一の場合（同時刻に複数登録）、`id` の降順で安定ソートする。
> カーソルから `created_at` と `id` を分離し、`(created_at, id)` の複合条件で WHERE を構築する。

### 4.5 メモ結合

LEFT JOIN で `memos.memo_text` を結合する。メモが存在しない stock は `memo_text: null` で返却する。

> **設計判断:** 一覧 API でメモを含める理由:
> - フロントエンドの一覧画面でメモプレビューを表示するため（CLAUDE.md セクション 7.2）
> - 別途メモ API を一覧の件数分呼ぶ N+1 を回避するため
> - LEFT JOIN のコストは stocks のインデックスでカバーされ、パフォーマンス影響は軽微

### 4.6 レスポンス（200 OK）

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "original_url": "https://speakerdeck.com/jnunemaker/atom",
      "canonical_url": "https://speakerdeck.com/jnunemaker/atom",
      "provider": "speakerdeck",
      "title": "Atom",
      "author_name": "John Nunemaker",
      "thumbnail_url": null,
      "embed_url": "https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3",
      "memo_text": "良いスライド",
      "created_at": "2025-06-15T10:30:00.000Z",
      "updated_at": "2025-06-15T10:31:00.000Z"
    }
  ],
  "next_cursor": "2025-06-14T08:00:00.000Z_440e8400-e29b-41d4-a716-446655440000",
  "has_more": true
}
```

**レスポンス型:**
```typescript
interface StockListResponse {
  items: StockItem[];
  next_cursor: string | null;  // 次ページのカーソル。最終ページの場合は null
  has_more: boolean;           // 次ページが存在するか
}

interface StockItem {
  id: string;
  original_url: string;
  canonical_url: string;
  provider: "speakerdeck" | "docswell" | "google_slides";
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  memo_text: string | null;
  created_at: string;
  updated_at: string;
}
```

### 4.7 next_cursor の生成

取得結果の件数が `limit` と一致する場合、最後のアイテムから `next_cursor` を生成する:

```typescript
const items = result.rows;
const hasMore = items.length === limit;
const nextCursor = hasMore
  ? `${items[items.length - 1].created_at}_${items[items.length - 1].id}`
  : null;
```

### 4.8 空一覧

ストックが 0 件の場合:

```json
{
  "items": [],
  "next_cursor": null,
  "has_more": false
}
```

---

## 5. GET /api/stocks/:id

指定されたストックの詳細情報を取得する。

### 5.1 リクエスト

```
GET /api/stocks/550e8400-e29b-41d4-a716-446655440000
Cookie: session=...
```

### 5.2 パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|------|------|
| `id` | string | stock の UUID |

### 5.3 SQL クエリ

```sql
SELECT
  s.id, s.original_url, s.canonical_url, s.provider,
  s.title, s.author_name, s.thumbnail_url, s.embed_url,
  s.created_at, s.updated_at,
  m.memo_text
FROM stocks s
LEFT JOIN memos m ON m.stock_id = s.id AND m.user_id = s.user_id
WHERE s.id = ? AND s.user_id = ?;
```

### 5.4 所有権チェック

WHERE 句に `s.user_id = ?`（認証ユーザーの ID）を含めることで、他ユーザーの stock へのアクセスを防ぐ。
該当なしの場合は 404 を返す（stock の存在有無を他ユーザーに漏らさないため、403 ではなく 404 を使用する）。

### 5.5 レスポンス（200 OK）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "original_url": "https://speakerdeck.com/jnunemaker/atom",
  "canonical_url": "https://speakerdeck.com/jnunemaker/atom",
  "provider": "speakerdeck",
  "title": "Atom",
  "author_name": "John Nunemaker",
  "thumbnail_url": null,
  "embed_url": "https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3",
  "memo_text": "良いスライド",
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2025-06-15T10:31:00.000Z"
}
```

### 5.6 エラーレスポンス

**stock が存在しない、または他ユーザーの stock（404）:**
```json
{
  "error": "指定されたストックが見つかりません",
  "code": "NOT_FOUND"
}
```

---

## 6. DELETE /api/stocks/:id

指定されたストックとその関連メモを削除する。

### 6.1 リクエスト

```
DELETE /api/stocks/550e8400-e29b-41d4-a716-446655440000
Cookie: session=...
```

### 6.2 パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|------|------|
| `id` | string | stock の UUID |

### 6.3 処理フロー

```
1. 所有権チェック: stock が存在し、認証ユーザーのものか確認
   → 該当なし: 404 返却
2. 関連メモを削除（stock 削除前に実行）
3. stock を削除
4. 204 No Content 返却
```

### 6.4 関連メモの削除方針: 手動削除（アプリケーション側）

```sql
-- 1. 関連メモを削除
DELETE FROM memos WHERE stock_id = ? AND user_id = ?;

-- 2. stock を削除
DELETE FROM stocks WHERE id = ? AND user_id = ?;
```

> **設計判断:** CASCADE ではなく手動削除を採用する。理由:
> - D1 の外部キー制約 CASCADE サポートが限定的な場合を考慮
> - 削除対象を明示的に制御でき、将来の監査ログ追加などに対応しやすい
> - stock と memo は 1:1 関係のため、クエリ数の増加は 1 件のみで影響は軽微

### 6.5 所有権チェック

DELETE でも GET と同様に `user_id` 条件で所有権を検証する。
stock が存在しない場合と、他ユーザーの stock の場合はどちらも 404 を返す。

```sql
SELECT id FROM stocks WHERE id = ? AND user_id = ?;
```

### 6.6 レスポンス（204 No Content）

```
HTTP/1.1 204 No Content
```

レスポンスボディは空。

### 6.7 エラーレスポンス

**stock が存在しない、または他ユーザーの stock（404）:**
```json
{
  "error": "指定されたストックが見つかりません",
  "code": "NOT_FOUND"
}
```

### 6.8 冪等性

同じ stock に対する DELETE の二重呼び出しは、2 回目が 404 を返す。
これは意図的な動作であり、フロントエンドは 204 と 404 の両方を「削除完了」として扱ってよい。

---

## 7. Stock オブジェクト定義

全エンドポイントで共通の stock レスポンス型:

```typescript
interface StockResponse {
  id: string;                    // UUID v7
  original_url: string;          // ユーザー入力 URL
  canonical_url: string;         // 正規化 URL
  provider: Provider;            // プロバイダ識別子
  title: string | null;          // スライドタイトル（oEmbed 取得失敗 / Google Slides で HTML 失敗時は null）
  author_name: string | null;    // 著者名（oEmbed 取得失敗 / Google Slides は仕様上常に null）
  thumbnail_url: string | null;  // サムネイル URL（MVP では常に null）
  embed_url: string | null;      // 埋め込み URL（oEmbed 取得失敗時は null）
  memo_text: string | null;      // メモ本文（未作成時は null）
  created_at: string;            // 作成日時（ISO 8601）
  updated_at: string;            // 更新日時（ISO 8601）
}

type Provider = "speakerdeck" | "docswell" | "google_slides";
```

> **注意:** `user_id` はレスポンスに含めない。認証済みユーザー自身のデータのみが返るため、冗長かつセキュリティ上不要。

> **設計判断（status フィールド廃止）:** ADR-004 で同期モデルに移行し、migration 0003 で `stocks.status` カラムを物理削除した。レスポンスにも `status` フィールドは含まれない。クライアントはメタデータ取得の成否を `embed_url` / `title` の有無で判定する（ui-spec.md §5.3.3）。

---

## 8. テストケース一覧

QA（T-536）で作成するテストケースの網羅表。

### 8.1 POST /api/stocks

#### 正常系（メタデータ取得も成功）

oEmbed のレスポンスはモック（fetch スタブ）で固定値を返す前提。`status` フィールドは存在しないこと、`title` / `author_name` / `embed_url` が埋まっていることを確認する。

| # | シナリオ | リクエスト | プロバイダ応答（モック） | 期待: ステータス | 期待: レスポンス |
|---|---------|-----------|-------------------------|-----------------|-----------------|
| P1 | SpeakerDeck URL 登録 | `{ "url": "https://speakerdeck.com/user/slide" }` | 200 + 正常な oEmbed JSON | 201 | title / author_name / embed_url 充足、`status` キーなし |
| P2 | Docswell URL 登録 | `{ "url": "https://www.docswell.com/s/user/ABC123-title" }` | 200 + 正常な oEmbed JSON | 201 | title / author_name / embed_url 充足、`status` キーなし |
| P3 | Google Slides URL 登録 | `{ "url": "https://docs.google.com/presentation/d/1abc.../edit" }` | HTML 取得 200 + `<title>` 含む | 201 | embed_url=`{canonical}/embed`、title 充足、author_name=null |
| P4 | URL 正規化の確認 | `{ "url": "http://www.speakerdeck.com/user/slide/" }` | 200 + 正常な oEmbed JSON | 201 | canonical_url が正規化されていること |

#### oEmbed 取得失敗（stock は残る、メタデータ null）

ADR-004 / oembed-spec.md §7 のとおり、プロバイダ取得失敗時も 201 + メタデータ null の stock が返り、DB にも stock が残る。

| # | シナリオ | リクエスト | プロバイダ応答（モック） | 期待: ステータス | 期待: レスポンス + DB |
|---|---------|-----------|-------------------------|-----------------|---------------------|
| P14 | プロバイダ 404 | 正常な SpeakerDeck URL | 404 | 201 | title=null / author_name=null / embed_url=null。stock は DB に残る |
| P15 | プロバイダ 403 | 正常な Docswell URL | 403 | 201 | 同上 |
| P16 | プロバイダ 5xx | 正常な SpeakerDeck URL | 503 | 201 | 同上（リトライしない） |
| P17 | プロバイダ タイムアウト | 正常な Docswell URL | 11 秒以上の遅延（10秒タイムアウト超過） | 201 | 同上 |
| P18 | oEmbed レスポンス形式不正 | 正常な SpeakerDeck URL | 200 だが `html` が iframe を含まない | 201 | 同上（PermanentError） |
| P19 | Docswell embed URL がドメイン外 | 正常な Docswell URL | 200 だが `url` が `evil.example.com` | 201 | 同上（PermanentError、SSRF 対策） |
| P20 | Google Slides の HTML 取得失敗 | Google Slides URL | HTML 取得 500 | 201 | embed_url=`{canonical}/embed` 充足、title=null（軟性失敗、§4.5） |

#### バリデーション・認証・重複（早期エラー）

stock の INSERT より前で弾くケース。これらは stock を作成しない。

| # | シナリオ | リクエスト | 期待: ステータス | 期待: code |
|---|---------|-----------|-----------------|-----------|
| P5 | URL 未指定 | `{}` | 400 | `INVALID_REQUEST` |
| P6 | URL が空文字 | `{ "url": "" }` | 400 | `INVALID_URL` |
| P7 | 不正な URL 形式 | `{ "url": "not-a-url" }` | 400 | `INVALID_URL` |
| P8 | 未対応プロバイダ | `{ "url": "https://slideshare.net/user/slide" }` | 400 | `UNSUPPORTED_PROVIDER` |
| P9 | 不正なパス形式 | `{ "url": "https://speakerdeck.com/user" }` | 400 | `INVALID_FORMAT` |
| P10 | embed URL（対象外） | `{ "url": "https://speakerdeck.com/player/abc123" }` | 400 | `UNSUPPORTED_URL_TYPE` |
| P11 | 重複 URL 登録 | 既存と同じ canonical_url | 409 | `DUPLICATE_STOCK` |
| P12 | JSON パースエラー | 不正な JSON | 400 | `INVALID_REQUEST` |
| P13 | 未認証 | Cookie なし | 401 | `UNAUTHORIZED` |

### 8.2 GET /api/stocks

#### 正常系

| # | シナリオ | クエリ | 期待: ステータス | 期待: レスポンス |
|---|---------|-------|-----------------|-----------------|
| L1 | デフォルト一覧取得 | なし | 200 | items 配列（最大 20 件）、created_at DESC |
| L2 | limit 指定 | `?limit=5` | 200 | items 最大 5 件 |
| L3 | カーソルページネーション | `?cursor=...` | 200 | カーソル以降のアイテム |
| L4 | ストック 0 件 | なし | 200 | `{ items: [], next_cursor: null, has_more: false }` |
| L5 | メモ付きストック | なし | 200 | memo_text が結合されている |
| L6 | メモなしストック | なし | 200 | memo_text が null |
| L7 | has_more=false（最終ページ） | なし | 200 | `has_more: false`, `next_cursor: null` |

#### ユーザー間分離

| # | シナリオ | 期待 |
|---|---------|------|
| L8 | ユーザー A のストックがユーザー B の一覧に含まれない | items にユーザー A のデータが含まれない |

#### 異常系

| # | シナリオ | 期待: ステータス | 期待: code |
|---|---------|-----------------|-----------|
| L9 | 未認証 | 401 | `UNAUTHORIZED` |

### 8.3 GET /api/stocks/:id

#### 正常系

| # | シナリオ | 期待: ステータス | 期待: レスポンス |
|---|---------|-----------------|-----------------|
| D1 | 自分のストック取得 | 200 | stock オブジェクト（メモ付き） |
| D2 | メモなしストック取得 | 200 | stock オブジェクト（memo_text=null） |

#### 異常系

| # | シナリオ | 期待: ステータス | 期待: code |
|---|---------|-----------------|-----------|
| D3 | 存在しない ID | 404 | `NOT_FOUND` |
| D4 | 他ユーザーのストック | 404 | `NOT_FOUND` |
| D5 | 未認証 | 401 | `UNAUTHORIZED` |

### 8.4 DELETE /api/stocks/:id

#### 正常系

| # | シナリオ | 期待: ステータス | 備考 |
|---|---------|-----------------|------|
| X1 | 自分のストック削除 | 204 | レスポンスボディ空 |
| X2 | メモ付きストック削除 | 204 | 関連メモも削除される |
| X3 | 削除後の GET | 404 | 削除されたストックは取得できない |
| X4 | 削除後の一覧 | 200 | 削除されたストックが一覧に含まれない |

#### 異常系

| # | シナリオ | 期待: ステータス | 期待: code |
|---|---------|-----------------|-----------|
| X5 | 存在しない ID | 404 | `NOT_FOUND` |
| X6 | 他ユーザーのストック | 404 | `NOT_FOUND` |
| X7 | 未認証 | 401 | `UNAUTHORIZED` |

---

## 9. 実装タスクとの対応

| タスク | 本仕様の該当セクション | 実装ファイル |
|--------|----------------------|------------|
| T-531 POST /stocks 実装 | §3（POST /api/stocks）+ oembed-spec.md §5 / §6（同期 best-effort 取得） | `worker/handlers/stock-create.ts` |
| T-532 GET /stocks 実装 | §4（GET /api/stocks） | `worker/handlers/stocks.ts` `handleListStocks` |
| T-533 GET /stocks/:id 実装 | §5（GET /api/stocks/:id） | `worker/handlers/stocks.ts` `handleGetStock` |
| T-534 DELETE /stocks/:id 実装 | §6（DELETE /api/stocks/:id） | `worker/handlers/stocks.ts` `handleDeleteStock` |
| T-536 Stock API ユニットテスト | §8（テストケース一覧）特に §8.1 P14〜P20（oEmbed 取得失敗時も stock が残ること） | `worker/handlers/stocks.test.ts`, `worker/handlers/integration.test.ts` |
