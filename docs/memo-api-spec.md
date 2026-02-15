# Memo API 仕様

## 1. 概要

Memo API はストックしたスライドに対するテキストメモの作成・更新・取得を管理する API である。
1 つの stock に対して 1 つの memo のみ存在できる（1:1 関係）。
全エンドポイントは認証必須であり、セッション Cookie による認証ミドルウェア（docs/auth-spec.md セクション 5.5）を通過した `AuthContext` が前提となる。

### 前提ドキュメント

- [docs/database.md](database.md) — memos テーブル定義（UNIQUE stock_id 制約）
- [docs/stock-api-spec.md](stock-api-spec.md) — Stock API 仕様（エラーレスポンス形式）
- [docs/auth-spec.md](auth-spec.md) — 認証・セッション管理

### エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| PUT | `/api/stocks/:id/memo` | メモを作成または更新（upsert） |
| GET | `/api/stocks/:id/memo` | メモを取得 |

---

## 2. 共通仕様

### 2.1 認証

全エンドポイントで認証が必須。stock-api-spec.md セクション 2.1 と同一。

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "認証が必要です",
  "code": "UNAUTHORIZED"
}
```

### 2.2 エラーレスポンス形式

stock-api-spec.md セクション 2.2 と同一の形式を使用:

```typescript
interface ErrorResponse {
  error: string;   // 人間可読なエラーメッセージ（日本語）
  code: string;    // 機械処理用エラーコード（UPPER_SNAKE_CASE）
}
```

### 2.3 エラーコード一覧

stock-api-spec.md セクション 2.3 の共通コードに加え、Memo API 固有のコードを定義:

| HTTP ステータス | code | 説明 |
|----------------|------|------|
| 400 | `INVALID_REQUEST` | リクエストボディが不正（JSON パースエラー、必須フィールド欠落） |
| 400 | `MEMO_TOO_LONG` | memo_text が最大文字数を超過 |
| 401 | `UNAUTHORIZED` | 認証が必要 |
| 404 | `NOT_FOUND` | 指定された stock が存在しない、またはメモが未作成（GET 時） |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |

### 2.4 所有権チェック（共通）

全エンドポイントで stock の所有権を検証する。パスパラメータ `:id` の stock が認証ユーザーのものであることを確認:

```sql
SELECT id FROM stocks WHERE id = ? AND user_id = ?;
```

- stock が存在しない場合、または他ユーザーの stock の場合は **404 を返す**
- 403 ではなく 404 を使用する理由: stock の存在有無を他ユーザーに漏らさないため（stock-api-spec.md セクション 5.4 と同一方針）

```json
{
  "error": "指定されたストックが見つかりません",
  "code": "NOT_FOUND"
}
```

### 2.5 Content-Type

- リクエスト: `application/json`
- レスポンス: `application/json`

### 2.6 日時形式

全日時フィールドは ISO 8601 文字列（UTC）:

```
"2025-06-15T10:30:00.000Z"
```

---

## 3. PUT /api/stocks/:id/memo

メモを作成または更新する（upsert）。

### 3.1 リクエスト

```
PUT /api/stocks/550e8400-e29b-41d4-a716-446655440000/memo
Content-Type: application/json
Cookie: session=...

{
  "memo_text": "良いスライド。特にアーキテクチャ図がわかりやすい。"
}
```

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|-----------|------|------|
| `id` | string | stock の UUID |

**リクエストボディ:**

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `memo_text` | string | Yes | メモ本文 |

### 3.2 バリデーション

| ルール | 条件 | エラー |
|--------|------|--------|
| JSON パース | リクエストボディが不正な JSON | 400 `INVALID_REQUEST` |
| memo_text 存在 | `memo_text` フィールドが存在しない | 400 `INVALID_REQUEST` |
| memo_text 型 | `memo_text` が string でない | 400 `INVALID_REQUEST` |
| 空文字列 | `memo_text` が空文字列 `""` または空白のみ | 400 `INVALID_REQUEST` |
| 最大文字数 | `memo_text` が 10,000 文字を超過 | 400 `MEMO_TOO_LONG` |

**バリデーション詳細:**

- **空文字列の扱い:** 空文字列 `""` および空白文字のみ（`"   "`）のメモは許可しない。メモを消したい場合は DELETE /stocks/:id でストックごと削除するか、将来のメモ削除 API で対応する。
  - trim 後に空文字列となる場合は `INVALID_REQUEST` を返す
- **最大文字数:** 10,000 文字（Unicode 文字数）。D1 の TEXT 型に物理的な上限はないが、個人メモとして合理的な上限を設定する。
- **memo_text の前後空白:** trim しない。ユーザーの入力をそのまま保存する（フロントエンドで trim するかは UI 側の判断）。ただし、空白のみかどうかの判定は trim 後の値で行う。

**バリデーションエラーレスポンス例:**

```json
{
  "error": "memo_text は必須です",
  "code": "INVALID_REQUEST"
}
```

```json
{
  "error": "メモは10,000文字以内で入力してください",
  "code": "MEMO_TOO_LONG"
}
```

### 3.3 処理フロー

```
1. リクエストボディの JSON パース
2. memo_text のバリデーション（存在・型・空文字列・最大文字数）
3. 所有権チェック: stock が存在し、認証ユーザーのものか確認
   → 該当なし: 404 返却
4. memos テーブルに upsert（INSERT OR REPLACE）
5. 200 OK + memo オブジェクト返却
```

### 3.4 Upsert SQL

memos テーブルの `stock_id` に UNIQUE 制約があるため、`INSERT ... ON CONFLICT` を使用する:

```sql
INSERT INTO memos (id, stock_id, user_id, memo_text, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (stock_id) DO UPDATE SET
  memo_text = excluded.memo_text,
  updated_at = excluded.updated_at;
```

- `id`: UUID v4 を生成（新規作成時のみ使用。既存レコードがある場合は id は更新されない）
- `stock_id`: パスパラメータの `:id`
- `user_id`: AuthContext.userId
- `memo_text`: リクエストボディの `memo_text`
- `created_at`: 現在時刻（新規作成時のみ使用）
- `updated_at`: 現在時刻

> **設計判断:** `INSERT OR REPLACE` ではなく `ON CONFLICT ... DO UPDATE` を採用する。理由:
> - `INSERT OR REPLACE` は既存行を DELETE → INSERT するため、`id` と `created_at` が変わってしまう
> - `ON CONFLICT ... DO UPDATE` は既存行の `id` と `created_at` を保持しつつ `memo_text` と `updated_at` のみ更新できる

### 3.5 upsert 後のレコード取得

upsert 後、レスポンス用にメモレコードを取得する:

```sql
SELECT id, stock_id, memo_text, created_at, updated_at
FROM memos
WHERE stock_id = ? AND user_id = ?;
```

### 3.6 レスポンス（200 OK）

新規作成・更新いずれの場合も 200 を返す。

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "stock_id": "550e8400-e29b-41d4-a716-446655440000",
  "memo_text": "良いスライド。特にアーキテクチャ図がわかりやすい。",
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2025-06-15T12:00:00.000Z"
}
```

> **設計判断:** PUT の新規作成時も 201 ではなく 200 を返す。理由:
> - upsert 動作のため、クライアント側で新規/更新を区別する必要がない
> - フロントエンドは「メモが保存された」ことだけを知ればよい
> - 実装をシンプルに保つ（INSERT か UPDATE かの判定コードが不要）

### 3.7 エラーレスポンス例

**stock が存在しない（404）:**
```json
{
  "error": "指定されたストックが見つかりません",
  "code": "NOT_FOUND"
}
```

**memo_text が空（400）:**
```json
{
  "error": "メモの内容が空です",
  "code": "INVALID_REQUEST"
}
```

**memo_text が長すぎる（400）:**
```json
{
  "error": "メモは10,000文字以内で入力してください",
  "code": "MEMO_TOO_LONG"
}
```

---

## 4. GET /api/stocks/:id/memo

指定された stock のメモを取得する。

### 4.1 リクエスト

```
GET /api/stocks/550e8400-e29b-41d4-a716-446655440000/memo
Cookie: session=...
```

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|-----------|------|------|
| `id` | string | stock の UUID |

### 4.2 処理フロー

```
1. 所有権チェック: stock が存在し、認証ユーザーのものか確認
   → 該当なし: 404 返却（"指定されたストックが見つかりません"）
2. memos テーブルから stock_id でメモを検索
   → メモが存在しない: 404 返却（"メモが見つかりません"）
3. 200 OK + memo オブジェクト返却
```

### 4.3 SQL クエリ

所有権チェックとメモ取得を 1 クエリで実行する:

```sql
SELECT m.id, m.stock_id, m.memo_text, m.created_at, m.updated_at
FROM memos m
INNER JOIN stocks s ON s.id = m.stock_id
WHERE m.stock_id = ? AND s.user_id = ?;
```

- `stock_id`: パスパラメータの `:id`
- `user_id`: AuthContext.userId

**結果の判定:**

| INNER JOIN の結果 | 意味 | レスポンス |
|------------------|------|-----------|
| 行あり | stock が認証ユーザーのもので、メモも存在する | 200 + memo オブジェクト |
| 行なし | stock が存在しない / 他ユーザー / メモ未作成のいずれか | 下記の 2 段階判定へ |

**行なしの場合の判定:**

メモ未作成と stock 不存在/権限エラーを区別するため、stock の存在チェックを追加で行う:

```sql
SELECT id FROM stocks WHERE id = ? AND user_id = ?;
```

| stock 存在チェック | 意味 | レスポンス |
|-------------------|------|-----------|
| stock あり | stock は存在するがメモが未作成 | 404 `NOT_FOUND`（"メモが見つかりません"） |
| stock なし | stock が存在しない or 他ユーザー | 404 `NOT_FOUND`（"指定されたストックが見つかりません"） |

> **設計判断:** stock 不存在とメモ未作成で同じ 404 ステータスを返すが、エラーメッセージを区別する。
> これにより、フロントエンドは `error` メッセージで状態を判別でき、`code` での機械処理も一貫性を保てる。

### 4.4 レスポンス（200 OK）

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "stock_id": "550e8400-e29b-41d4-a716-446655440000",
  "memo_text": "良いスライド。特にアーキテクチャ図がわかりやすい。",
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2025-06-15T12:00:00.000Z"
}
```

### 4.5 エラーレスポンス

**stock が存在しない / 他ユーザーの stock（404）:**
```json
{
  "error": "指定されたストックが見つかりません",
  "code": "NOT_FOUND"
}
```

**メモが未作成（404）:**
```json
{
  "error": "メモが見つかりません",
  "code": "NOT_FOUND"
}
```

---

## 5. Memo オブジェクト定義

全エンドポイントで共通の memo レスポンス型:

```typescript
interface MemoResponse {
  id: string;         // UUID
  stock_id: string;   // 対象 stock の UUID
  memo_text: string;  // メモ本文
  created_at: string; // 作成日時（ISO 8601）
  updated_at: string; // 更新日時（ISO 8601）
}
```

> **注意:** `user_id` はレスポンスに含めない。認証済みユーザー自身のデータのみが返るため、冗長かつセキュリティ上不要（stock-api-spec.md と同一方針）。

---

## 6. バリデーション定数

| 定数名 | 値 | 説明 |
|--------|-----|------|
| `MEMO_MAX_LENGTH` | `10000` | memo_text の最大文字数 |

---

## 7. Stock API との関係

### 7.1 一覧・詳細 API でのメモ表示

GET /api/stocks および GET /api/stocks/:id では、LEFT JOIN で `memo_text` を結合して返却する（stock-api-spec.md セクション 4.5, 5.3）。
これにより、一覧画面でのメモプレビュー表示に追加の API コールが不要となる。

### 7.2 stock 削除時のメモ連動削除

DELETE /api/stocks/:id では、stock 削除前に関連メモも削除する（stock-api-spec.md セクション 6.4）。
Memo API 側では stock 削除のハンドリングは不要。

---

## 8. テストケース一覧

QA（T-543）で作成するテストケースの網羅表。

### 8.1 PUT /api/stocks/:id/memo

#### 正常系

| # | シナリオ | リクエスト | 期待: ステータス | 期待: レスポンス |
|---|---------|-----------|-----------------|-----------------|
| M1 | 新規メモ作成 | `{ "memo_text": "良いスライド" }` | 200 | memo オブジェクト（created_at = updated_at） |
| M2 | メモ更新（既存メモあり） | `{ "memo_text": "更新したメモ" }` | 200 | memo オブジェクト（updated_at が更新、created_at は変わらない） |
| M3 | 最大文字数ぴったり（10,000文字） | `{ "memo_text": "あ"×10000 }` | 200 | memo オブジェクト |
| M4 | マルチバイト文字を含むメモ | `{ "memo_text": "日本語のメモ🎉" }` | 200 | memo オブジェクト |

#### 異常系

| # | シナリオ | リクエスト | 期待: ステータス | 期待: code |
|---|---------|-----------|-----------------|-----------|
| M5 | memo_text 未指定 | `{}` | 400 | `INVALID_REQUEST` |
| M6 | memo_text が空文字列 | `{ "memo_text": "" }` | 400 | `INVALID_REQUEST` |
| M7 | memo_text が空白のみ | `{ "memo_text": "   " }` | 400 | `INVALID_REQUEST` |
| M8 | memo_text が 10,001 文字 | `{ "memo_text": "あ"×10001 }` | 400 | `MEMO_TOO_LONG` |
| M9 | memo_text が string でない | `{ "memo_text": 123 }` | 400 | `INVALID_REQUEST` |
| M10 | JSON パースエラー | 不正な JSON | 400 | `INVALID_REQUEST` |
| M11 | stock が存在しない | 存在しない UUID | 404 | `NOT_FOUND` |
| M12 | 他ユーザーの stock | 他ユーザーの stock ID | 404 | `NOT_FOUND` |
| M13 | 未認証 | Cookie なし | 401 | `UNAUTHORIZED` |

### 8.2 GET /api/stocks/:id/memo

#### 正常系

| # | シナリオ | 期待: ステータス | 期待: レスポンス |
|---|---------|-----------------|-----------------|
| G1 | メモが存在する stock | 200 | memo オブジェクト |

#### 異常系

| # | シナリオ | 期待: ステータス | 期待: code | 期待: error |
|---|---------|-----------------|-----------|-------------|
| G2 | メモが未作成の stock | 404 | `NOT_FOUND` | "メモが見つかりません" |
| G3 | stock が存在しない | 404 | `NOT_FOUND` | "指定されたストックが見つかりません" |
| G4 | 他ユーザーの stock | 404 | `NOT_FOUND` | "指定されたストックが見つかりません" |
| G5 | 未認証 | 401 | `UNAUTHORIZED` | — |

### 8.3 Stock API との連携

| # | シナリオ | 期待 |
|---|---------|------|
| I1 | PUT でメモ作成後、GET /api/stocks/:id の memo_text にメモが反映される | memo_text が一致 |
| I2 | PUT でメモ更新後、GET /api/stocks の一覧の memo_text にメモが反映される | memo_text が一致 |
| I3 | DELETE /api/stocks/:id で stock 削除後、GET /api/stocks/:id/memo が 404 を返す | 404 |

---

## 9. 実装タスクとの対応

| タスク | 本仕様の該当セクション |
|--------|----------------------|
| T-541 PUT /stocks/:id/memo 実装 | セクション 3（PUT /api/stocks/:id/memo） |
| T-542 GET /stocks/:id/memo 実装 | セクション 4（GET /api/stocks/:id/memo） |
| T-543 Memo API ユニットテスト | セクション 8（テストケース一覧） |
