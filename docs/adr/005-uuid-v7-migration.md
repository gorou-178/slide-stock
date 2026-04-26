# ADR-005: UUID v4 から UUID v7 への移行と publicId 非採用の決定

## ステータス
Proposed

## コンテキスト

### 現行 UUID 生成箇所

`crypto.randomUUID()`（UUID v4）が以下の3箇所で使われている:

| ファイル | 行 | 用途 |
|---------|-----|------|
| `worker/handlers/auth.ts` | 192 | `userId = crypto.randomUUID()` — ユーザーID生成 |
| `worker/handlers/stocks.ts` | 128 | `const stockId = crypto.randomUUID()` — ストックID生成 |
| `worker/handlers/memo.ts` | 85 | `const memoId = crypto.randomUUID()` — メモID生成 |

### 外部公開されている ID

| ID | 公開経路 |
|----|---------|
| `stock.id` | APIレスポンス・URL（`/api/stocks/:id`, `/stocks/:id`）・カーソル（`{created_at}_{id}` 形式） |
| `memo.id` | メモ API レスポンス |
| `user.id` | `/api/me` レスポンス |

### UUID v4 の問題

**D1（SQLite）インデックス効率**: UUID v4 はランダム値のため、INSERT のたびに B-tree の中間ノードへの挿入が発生しページ分割・断片化が生じる。UUID v7 は時系列単調増加のため末尾追記になり断片化を防ぐ。

**`created_at` との不一致**: カーソルページネーション（`{created_at}_{id}` 形式）でセカンダリソートに `id DESC` を使用しているが、UUID v4 はランダムのため `created_at` との時系列整合性がない。UUID v7 は ms 精度タイムスタンプを内包するため自然に一致する。

### Cloudflare Workers の制約

`crypto.randomUUID()` は UUID v4 のみ対応しており、UUID v7 の生成にはライブラリが必要。

### publicId（外部公開用 ID 分離）の検討背景

内部主キー（UUID）をそのまま外部公開すると、予測可能な ID による情報漏洩（IDOR: Insecure Direct Object Reference）が懸念される場合がある。

## 選択肢

### A. UUID v7 生成方法

| 選択肢 | 概要 |
|--------|------|
| **(A-1) `uuidv7` npm パッケージ** | ESM 対応・~1KB・Workers 動作実績あり |
| (A-2) 自前実装（~10行） | 依存なしだが保守コスト・バグリスクあり |
| (A-3) 現状維持（v4） | 上記課題がそのまま残る |

### B. publicId（外部公開 ID 分離）

| 選択肢 | 概要 |
|--------|------|
| **(B-1) 不採用** — 既存 UUID を外部公開 ID として継続使用 | DB 変更なし・API 変更なし |
| (B-2) 採用 — 新規カラム `public_id` を追加 | DB マイグレーション・ルーティング変更・追加列管理が必要 |

## 決定

- **UUID v7 生成**: 選択肢 A-1（`uuidv7` npm パッケージ）を採用
- **publicId**: 選択肢 B-1（採用しない）

## 理由

### UUID v7 採用の根拠

| 観点 | v4 | v7 |
|------|----|----|
| D1 インデックス効率 | ランダム挿入で B-tree 断片化 | 時系列順挿入で効率的 |
| `created_at` との一致 | 不一致 | 一致（ms 精度タイムスタンプ内包） |
| カーソルソート整合性 | `created_at` と乖離する可能性 | `created_at` と一致、セカンダリソートが自然 |
| タイムスタンプ情報漏洩 | なし | あり（ms 精度）— ただし後述の通り追加リスクなし |
| Workers 対応 | ネイティブ | ライブラリ必要（`uuidv7` ~1KB） |

**`uuidv7` パッケージを採用する理由**: 自前実装（~10行）と比較してパッケージサイズは微差だが、仕様準拠・セキュリティ・メンテナンスの観点でライブラリの優位性が保守コストを上回る。

### publicId 不採用の根拠

1. **IDOR 対策は実装済み**: 全エンドポイントで `WHERE id = ? AND user_id = ?` による所有権チェックが実施されている（`stocks.ts:303-314`, `stocks.ts:337-341`, `memo.ts:71-75`）。他ユーザーの ID を知っていてもアクセスできない。

2. **タイムスタンプ漏洩は追加リスクなし**: UUID v7 が内包する ms 精度タイムスタンプと同等の情報（`created_at`）が既に API レスポンスで公開されている。UUID v7 への移行で情報漏洩リスクは増加しない。

3. **個人利用ツール**: 他ユーザーへのデータ公開・共有機能が存在しないため、外部 ID 分離の必要性がない。

4. **コスト対効果**: publicId 採用には DB マイグレーション・ルーティング変更・追加列管理が伴うが、上記の通りセキュリティ上の要件を満たさない。

## 実装方針

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `package.json` | `uuidv7` パッケージを `dependencies` に追加 |
| `worker/handlers/auth.ts:192` | `crypto.randomUUID()` → `uuidv7()` |
| `worker/handlers/stocks.ts:128` | `crypto.randomUUID()` → `uuidv7()` |
| `worker/handlers/memo.ts:85` | `crypto.randomUUID()` → `uuidv7()` |

### コード変更パターン

```typescript
// Before
import { ... } from '...'
const id = crypto.randomUUID()

// After
import { uuidv7 } from 'uuidv7'
const id = uuidv7()
```

### DB 変更

**不要**。UUID v7 は UUID v4 と同じ 36 文字のハイフン区切り文字列形式（`xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx`）のため、既存の `TEXT` 型カラムにそのまま格納できる。

### 既存 v4 レコードとの混在

**許容**。後方互換不要の方針（`task/order.md`）に従い、既存 v4 UUID の変換・マイグレーションは行わない。読み取り時は形式によらず参照可能。

### カーソルへの影響

`{created_at}_{id}` 形式のカーソルは変更なし。UUID v7 採用後は新規レコードのセカンダリソート（`id DESC`）が `created_at` と時系列一致し整合性が向上する。

### 注意点

- `memos.id` は ON CONFLICT UPSERT で既存レコードの `id` が変更されないため、UUID v7 化は新規 INSERT 時のみ影響する（問題なし）
- `uuidv7` パッケージの具体的なインポート API は実装フェーズで最新ドキュメントを確認すること
