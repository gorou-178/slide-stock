# slide-stock

SpeakerDeck / Docswell / Google Slides のスライドを URL 入力だけでストックできる個人向け Web サービス。

## 技術構成

- フロントエンド: Astro (TypeScript) → Cloudflare Pages
- API: Cloudflare Workers (REST / JSON)
- DB: Cloudflare D1
- 非同期処理: Cloudflare Queues (oEmbed メタデータ取得)
- 認証: Google OIDC

## ローカル開発

### 前提条件

- Node.js 20+
- npm

### セットアップ

```bash
npm install
```

### データベース準備

```bash
# マイグレーション（テーブル作成）
npm run db:migrate:local

# シードデータ投入（テストユーザー + サンプルストック3件）
npm run db:seed
```

### 起動

2つのターミナルで起動する。

```bash
# ターミナル1: フロントエンド（Astro dev server — localhost:4321）
npm run dev

# ターミナル2: API（Cloudflare Workers — localhost:8787）
npm run dev:worker
```

ブラウザで http://localhost:4321 にアクセス。

`.dev.vars` に `TEST_MODE=true` が設定済みのため、Google ログインなしで `Test User 1` として自動認証される。

### データベース操作

```bash
# シードデータで初期化（既存データを削除して再投入）
npm run db:seed

# 全データ削除（空の状態にリセット）
npm run db:reset
```

### テスト

```bash
# ユニットテスト
npm test

# ウォッチモード
npm run test:watch
```

### ビルド

```bash
npm run build
```
