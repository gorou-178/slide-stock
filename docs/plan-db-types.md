# プラン: DB 型の適正化

## 現状の問題

### 1. SQLite スキーマ — 全カラムが `TEXT`
```sql
CREATE TABLE stocks (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,        -- 実際は 3値の enum
    status TEXT NOT NULL DEFAULT 'pending',  -- 実際は 'ready' のみ（Queue 廃止後）
    created_at TEXT NOT NULL,      -- ISO 8601 文字列
    updated_at TEXT NOT NULL,      -- ISO 8601 文字列
    ...
);
```
CHECK 制約がなく、不正値の INSERT を DB レベルで防げない。

### 2. TypeScript — `StockRow` が全フィールド `string`
```typescript
// worker/handlers/stocks.ts
interface StockRow {
  provider: string;    // → 'speakerdeck' | 'docswell' | 'google_slides' であるべき
  status: string;      // → 'ready' であるべき
  created_at: string;  // → ISODateString のような型があると良い
  ...
}
```
一方、テスト用の `TestStock` や API クライアントの `StockItem` は既に正しいリテラル型を使っている。

### 3. `memo.ts` の `.first()` が型引数なし
```typescript
// worker/handlers/memo.ts:104, 126
.first();  // → Record<string, unknown> が返る
```

## 方針

### レイヤー別の対応

| レイヤー | 対応 | 理由 |
|---------|------|------|
| **SQLite スキーマ** | CHECK 制約を追加 | DB レベルで不正値を防止 |
| **TypeScript DB Row 型** | 共有型定義ファイルを作成 | 型の一元管理、リテラル型活用 |
| **API レスポンス型** | 既存で十分（変更なし） | `StockItem`, `MemoResponse` は既に適切 |

### SQLite CHECK 制約が有効な理由
- D1 は SQLite ベースで CHECK 制約をサポートしている
- `provider` や `status` のようなenum 値は DB レベルで守るべき
- マイグレーションで `ALTER TABLE` ではなく新テーブル作成＋データ移行が必要（SQLite の制約）

### branded type は使わない理由
- `UserId`, `StockId` のような branded type は過剰
  - 型安全性の恩恵が小さい（UUID 文字列を間違える場面が少ない）
  - D1 の `.first<T>()` との相性が悪い（型変換が煩雑）
- ISO 日付文字列も `string` のまま（テンプレートリテラル型はエディタ補完を阻害）

## 変更計画

### Phase 1: 共有 DB Row 型の定義

**新規ファイル**: `worker/types/db.ts`

```typescript
import type { Provider } from "../lib/provider";

/** stocks テーブルの行型 */
export interface StockRow {
  id: string;
  user_id: string;
  original_url: string;
  canonical_url: string;
  provider: Provider;
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  status: "ready";
  created_at: string;
  updated_at: string;
}

/** stocks + memos LEFT JOIN の結果型（一覧・詳細用） */
export interface StockWithMemoRow extends StockRow {
  memo_text: string | null;
}

/** memos テーブルの行型 */
export interface MemoRow {
  id: string;
  stock_id: string;
  user_id: string;
  memo_text: string;
  created_at: string;
  updated_at: string;
}

/** users テーブルの行型 */
export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  created_at: string;
}
```

### Phase 2: ハンドラーの型適用

**対象ファイル**:

| ファイル | 変更内容 |
|---------|---------|
| `worker/handlers/stocks.ts` | ローカル `StockRow` を削除、`StockWithMemoRow` をインポート。`handleCreateStock` のレスポンスリテラルに `provider` の型を `Provider` にキャスト |
| `worker/handlers/memo.ts` | `.first()` → `.first<MemoRow>()` に型引数追加（104行目, 126行目） |
| `worker/handlers/auth.ts` | `.first<{ id: string }>()` はそのままで良い（SELECT id のみなので UserRow は不要） |
| `src/pages/api/me.ts` | `.first<Pick<UserRow, 'id' \| 'email' \| 'name'>>()` に変更 |
| `src/test/seed.ts` | `TestStock.provider` → `Provider` 型をインポートして使用、`status` を `"ready"` に |

### Phase 3: SQLite CHECK 制約マイグレーション

**新規ファイル**: `migrations/0003_add_check_constraints.sql`

SQLite は `ALTER TABLE` で CHECK 制約を追加できないため、テーブル再作成が必要:

```sql
-- 1. 新テーブル作成（CHECK 制約付き）
CREATE TABLE stocks_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    original_url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    provider TEXT NOT NULL CHECK(provider IN ('speakerdeck', 'docswell', 'google_slides')),
    title TEXT,
    author_name TEXT,
    thumbnail_url TEXT,
    embed_url TEXT,
    status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. データ移行
INSERT INTO stocks_new SELECT * FROM stocks;

-- 3. 旧テーブル削除・リネーム
DROP TABLE stocks;
ALTER TABLE stocks_new RENAME TO stocks;

-- 4. インデックス再作成
CREATE INDEX idx_stocks_user_id ON stocks(user_id);
CREATE INDEX idx_stocks_user_id_created_at ON stocks(user_id, created_at);
CREATE UNIQUE INDEX idx_stocks_user_canonical ON stocks(user_id, canonical_url);
```

### Phase 4: テスト更新・検証

- `src/test/seed.ts` の `TestStock` 型を `StockRow` ベースに整合
- 全テスト GREEN 確認
- ビルド確認

## 影響範囲

| 影響 | 詳細 |
|------|------|
| 振る舞い変更 | なし（型のみの変更） |
| マイグレーション | `0003_add_check_constraints.sql`（本番適用時はデータ移行を伴う） |
| テスト | 型変更による修正のみ、テスト数の増減なし |
| API レスポンス | 変更なし |
| フロントエンド | 変更なし（`StockItem` は既に適切な型） |

## ファイル一覧

| 操作 | ファイル |
|------|---------|
| 新規 | `worker/types/db.ts` |
| 新規 | `migrations/0003_add_check_constraints.sql` |
| 編集 | `worker/handlers/stocks.ts` |
| 編集 | `worker/handlers/memo.ts` |
| 編集 | `src/pages/api/me.ts` |
| 編集 | `src/test/seed.ts` |
