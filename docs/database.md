# データベース定義

## ER図

```mermaid
erDiagram
    users ||--o{ stocks : "has many"
    users ||--o{ memos : "has many"
    stocks ||--o| memos : "has one"

    users {
        TEXT id PK
        TEXT google_sub UK "Google Subject ID"
        TEXT email
        TEXT name
        TEXT created_at
    }

    stocks {
        TEXT id PK
        TEXT user_id FK "users.id"
        TEXT original_url "ユーザー入力URL"
        TEXT canonical_url "正規化URL"
        TEXT provider "speakerdeck / docswell / google_slides"
        TEXT title "nullable - oEmbed 取得失敗時 null"
        TEXT author_name "nullable - oEmbed 取得失敗時 / Google Slides は常に null"
        TEXT thumbnail_url "nullable - MVP は常に null"
        TEXT embed_url "nullable - oEmbed 取得失敗時 null"
        TEXT created_at
        TEXT updated_at
    }

    memos {
        TEXT id PK
        TEXT stock_id FK "stocks.id"
        TEXT user_id FK "users.id"
        TEXT memo_text
        TEXT created_at
        TEXT updated_at
    }
```

---

## テーブル定義

### users

ユーザー情報を管理する。Google OIDCで取得した情報を格納。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | TEXT | PK | UUID |
| google_sub | TEXT | UNIQUE, NOT NULL | Google Subject ID |
| email | TEXT | NOT NULL | メールアドレス |
| name | TEXT | NOT NULL | 表示名 |
| created_at | TEXT | NOT NULL | 作成日時 (ISO 8601) |

### stocks

ストックしたスライド情報を管理する。MVP は同期モデル（ADR-004、oembed-spec.md §5、stock-api-spec.md §3）で、`POST /api/stocks` のリクエスト内で stock を INSERT した直後に oEmbed メタデータ取得を best-effort で実行する。取得成功時は `UPDATE` でメタデータを反映、失敗時は title / author_name / embed_url が `null` のままレコードが残る。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | TEXT | PK | UUID v7（時系列ソート可能、`uuidv7` パッケージ） |
| user_id | TEXT | FK → users.id, NOT NULL | 所有ユーザー |
| original_url | TEXT | NOT NULL | ユーザーが入力した元URL |
| canonical_url | TEXT | NOT NULL | 正規化されたURL |
| provider | TEXT | NOT NULL | `speakerdeck` / `docswell` / `google_slides` |
| title | TEXT | nullable | スライドタイトル（oEmbed 取得失敗時 null） |
| author_name | TEXT | nullable | 著者名（oEmbed 取得失敗時 / Google Slides は常に null） |
| thumbnail_url | TEXT | nullable | サムネイルURL（MVP では常に null） |
| embed_url | TEXT | nullable | 埋め込み用URL（oEmbed 取得失敗時 null） |
| created_at | TEXT | NOT NULL | 作成日時 (ISO 8601) |
| updated_at | TEXT | NOT NULL | 更新日時 (ISO 8601) |

> **status カラムの履歴:** 当初は `'pending' / 'ready' / 'failed'` を持つカラムだったが、ADR-004 で同期化した後 migration 0003 (`drop_status.sql`) で物理削除した。クライアントはメタデータ取得の成否を `embed_url` / `title` の有無で判定する（ui-spec.md §5.3.3）。

#### マイグレーション履歴

| Migration | 内容 |
|-----------|------|
| `0001_init.sql` | 初期スキーマ（users / stocks / memos）。stocks に `status TEXT NOT NULL DEFAULT 'pending'` を含む |
| `0002_unique_stock_per_user.sql` | `(user_id, canonical_url)` の UNIQUE 制約を追加（`uniq_stocks_user_canonical_url`） |
| `0003_drop_status.sql` | ADR-004 後、`stocks.status` カラムを `ALTER TABLE ... DROP COLUMN status` で削除 |

### memos

各スライドに対するテキストメモ。1つのstockに対して1つのmemo。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | TEXT | PK | UUID |
| stock_id | TEXT | FK → stocks.id, NOT NULL | 対象スライド |
| user_id | TEXT | FK → users.id, NOT NULL | メモ作成者 |
| memo_text | TEXT | NOT NULL | メモ本文 |
| created_at | TEXT | NOT NULL | 作成日時 (ISO 8601) |
| updated_at | TEXT | NOT NULL | 更新日時 (ISO 8601) |

---

## stock のライフサイクル

`status` カラムは廃止されているため明示的な遷移図はない。実装上のライフサイクルは以下の 2 状態のみ:

| 状態 | 判定方法 | 説明 |
|------|---------|------|
| メタデータ充足 | `embed_url IS NOT NULL` | 通常の表示。タイトル・著者・embed プレビューを表示 |
| メタデータ未取得 | `embed_url IS NULL` | フォールバック表示。`original_url` のリンクのみ。再取得 UI は MVP では未実装（oembed-spec.md §7.3） |

stock は INSERT 後に削除されるか、ユーザーが DELETE するまで残る（メタデータ未取得状態のままでも問題ない）。

---

## インデックス方針

| テーブル | カラム | 種類 | 目的 |
|----------|--------|------|------|
| users | google_sub | UNIQUE | OIDC認証時の高速検索 |
| stocks | user_id | INDEX | ユーザー別一覧取得 |
| stocks | user_id, created_at | INDEX | ユーザー別一覧の日時ソート |
| memos | stock_id | UNIQUE | stock毎に1メモの制約 |

---

## 設計方針

- 全IDは UUID (TEXT型) を使用 — D1/PostgreSQL双方で互換性あり
- 日時は ISO 8601 文字列 (TEXT型) — SQLite互換かつ可読性確保
- 外部キー制約を明示 — 参照整合性を維持
- ベンダー依存構文を避ける — 将来のPostgreSQL等への移行を考慮
