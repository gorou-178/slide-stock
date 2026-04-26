# ADR-005: DBスキーマ最適化 — 型最適化と status カラム削除

## ステータス
Proposed

## コンテキスト

### 現行スキーマ

`migrations/0001_init.sql` で定義された3テーブルの全カラム一覧:

| テーブル | カラム | 現在の型 | NULL許可 |
|---------|--------|---------|---------|
| users | id | TEXT | NOT NULL |
| users | google_sub | TEXT | NOT NULL |
| users | email | TEXT | NOT NULL |
| users | name | TEXT | NOT NULL |
| users | created_at | TEXT | NOT NULL |
| stocks | id | TEXT | NOT NULL |
| stocks | user_id | TEXT | NOT NULL |
| stocks | original_url | TEXT | NOT NULL |
| stocks | canonical_url | TEXT | NOT NULL |
| stocks | provider | TEXT | NOT NULL |
| stocks | title | TEXT | NULL |
| stocks | author_name | TEXT | NULL |
| stocks | thumbnail_url | TEXT | NULL |
| stocks | embed_url | TEXT | NULL |
| stocks | **status** | TEXT | NOT NULL |
| stocks | created_at | TEXT | NOT NULL |
| stocks | updated_at | TEXT | NOT NULL |
| memos | id | TEXT | NOT NULL |
| memos | stock_id | TEXT | NOT NULL |
| memos | user_id | TEXT | NOT NULL |
| memos | memo_text | TEXT | NOT NULL |
| memos | created_at | TEXT | NOT NULL |
| memos | updated_at | TEXT | NOT NULL |

### ADR-004 との関係

ADR-004（Queue廃止）にて `status` カラムの方針を「残す（DEFAULT 'ready' に変更）」と決定した。
しかし ADR-004 の実装完了後、status が常に `'ready'` で固定される状態が確定した。
本 ADR は ADR-004 の方針を上書きし、status カラムの完全削除を決定する。

## 決定

### 1. 型最適化: 変更なし

全カラムを精査した結果、**型変更が必要なカラムは存在しない**と判断する。

| カラム | 現在の型 | 評価 | 根拠 |
|--------|---------|------|------|
| id（全テーブル） | TEXT | 変更不要 | UUID。SQLite/D1 に UUID 型なし |
| google_sub | TEXT | 変更不要 | Google の不透明な識別子文字列 |
| email | TEXT | 変更不要 | メールアドレス文字列 |
| name | TEXT | 変更不要 | 名前文字列 |
| original_url / canonical_url | TEXT | 変更不要 | URL文字列 |
| provider | TEXT | 変更不要 | SQLite に ENUM 型なし。CHECK 制約追加は本タスクのスコープ外 |
| title / author_name | TEXT NULL | 変更不要 | 文字列。NULL は取得失敗を表す |
| thumbnail_url / embed_url | TEXT NULL | 変更不要 | URL文字列 |
| memo_text | TEXT | 変更不要 | 任意長テキスト |
| created_at / updated_at | TEXT | 変更不要 | 後述 |
| **status** | TEXT | **削除** | 後述 |

**タイムスタンプ（TEXT ISO 8601）について:**

SQLite は Date/Time 格納に TEXT（ISO 8601）、REAL（ユリウス日）、INTEGER（Unix エポック秒）の3形式をサポートする。

現行実装では `new Date().toISOString()` で ISO 8601 文字列を生成・格納し（`worker/handlers/stocks.ts:129`）、
カーソルページネーションが `s.created_at < ?` の文字列比較に依存している（`worker/handlers/stocks.ts:258`）。
ISO 8601 は辞書順と時系列順が一致するため、この比較は正しく動作する。

INTEGER（Unix エポック秒）への変更はアプリケーションコード全体の改修を伴い、
変更コストがメリットを上回るため採用しない。

### 2. status カラム削除

**ADR-004 の方針（残す）を上書きし、status カラムを完全削除する。**

#### 削除根拠

ADR-004 によるQueue廃止後、status は以下の状態になった:

| 根拠 | 詳細 |
|------|------|
| INSERT 時の固定値 | `worker/handlers/stocks.ts:133-134` で `status = 'ready'` をハードコード。`'pending'`/`'failed'` は一切使われない |
| UPDATE 対象外 | `worker/handlers/stocks.ts:159-165` のメタデータ UPDATE 文に status なし。UPDATE 後も変更されない |
| フロントエンド型がリテラル | `src/lib/api-client.ts:22` で `status: 'ready'`（TypeScript リテラル型）。常に同一値のため型として意味をなさない |
| 情報エントロピーゼロ | 常に `'ready'` のみで、他の値をとり得ない。格納する情報がない |

#### 不採用の選択肢

| 選択肢 | 不採用理由 |
|--------|-----------|
| status を残して DEFAULT 'ready' に変更 | ADR-004 がこの方針を採用したが、T-754 の要件で完全削除が明示指示された |
| BOOLEAN（INTEGER 0/1）に変更してから削除 | 中間状態が不要。完全削除一択 |

## 実装設計

### マイグレーション SQL

次フェーズで `migrations/0003_drop_status.sql` を作成する:

```sql
-- Migration: 0003_drop_status
-- Description: Remove status column from stocks table
-- status was always 'ready' after ADR-004 removed async queue processing

ALTER TABLE stocks DROP COLUMN status;
```

**前提条件:**
- `ALTER TABLE ... DROP COLUMN` は SQLite 3.35+ でサポート
- D1 は SQLite 3.37+ を採用しているため対応済み
- status カラムにインデックスなし（`0001_init.sql`・`0002_unique_stock_per_user.sql` で確認）→ DROP COLUMN 前のインデックス削除不要

### アプリケーション変更一覧

次フェーズで以下を変更する:

| ファイル | 変更内容 |
|---------|---------|
| `worker/handlers/stocks.ts:32` | `StockRow.status: string` フィールド削除 |
| `worker/handlers/stocks.ts:133-134` | INSERT 文から `status, 'ready',` 削除 |
| `worker/handlers/stocks.ts:185` | レスポンスオブジェクトから `status: "ready"` 削除 |
| `worker/handlers/stocks.ts:252-253` | SELECT 文から `s.status,` 削除 |
| `worker/handlers/stocks.ts:268-269` | SELECT 文から `s.status,` 削除 |
| `worker/handlers/stocks.ts:306-307` | SELECT 文から `s.status,` 削除 |
| `src/lib/api-client.ts:22` | `StockItem.status: 'ready'` フィールド削除 |
| `src/test/seed.ts:57` | `TestStock.status: "pending" \| "ready" \| "failed"` フィールド削除 |
| `src/test/seed.ts:73,87,101` | 各シードデータオブジェクトから `status: "ready"` 削除 |
| `src/test/helpers.ts:26` | INSERT SQL から `status` カラム削除 |
| `src/test/helpers.ts:41` | `.bind()` 引数から `stock.status,` 削除 |

### 移行フェーズ

| Phase | 内容 | テストゲート |
|-------|------|------------|
| **Phase 1（本 ADR）** | 設計書作成 | — |
| **Phase 2** | `migrations/0003_drop_status.sql` 作成。アプリケーションコード変更（`stocks.ts`、`api-client.ts`） | ビルド成功 + 全テスト GREEN |
| **Phase 3** | D1 マイグレーション実行（本番・ステージング） | デプロイ後動作確認 |
