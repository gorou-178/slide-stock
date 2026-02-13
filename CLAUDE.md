# スライドストックサービス（名称未定）  
Cloudflare上で構築する個人向けスライドストックサービス

---

## 1. プロジェクト概要

本プロダクトは、SpeakerDeck / Docswell / Google Slides の公開スライドを  
**URL入力のみでストックできる個人向けWebサービス**である。

Cloudflareを基盤とし、運用コストを極力抑えつつ、
将来的な拡張や他クラウドへの移植も考慮した設計とする。

---

## 2. 目標（MVPゴール）

以下を実現する：

- アカウントごとに SpeakerDeck / Docswell / Google Slides のスライドをストックできる
- ログインは Google Login（OIDC）
- ストックしたスライドを oEmbed を用いて一覧表示できる
- 各スライドにテキストメモを残し、閲覧・編集できる
- 元のスライドURLへアクセスできる

---

## 3. 非目標（MVPでは行わない）

- 一般公開機能
- 全文検索
- AI検索
- サムネイルの再ホスティング（R2保存）
- ページ単位テキスト抽出

---

## 4. 技術構成

### フロントエンド

- **Astro（TypeScript）**
- Cloudflare Pages にデプロイ
- APIとは完全分離構成

理由：
- JS最小構成で高速
- 学習コストが低い
- API境界が明確で将来移植しやすい

---

### API

- Cloudflare Workers
- REST API設計
- JSONベース通信

設計原則：
- フロントからはHTTPのみ利用
- DBやCloudflare固有APIへ直接依存しない
- 認証はBearerトークン前提設計（Cookie併用可）

---

### 認証

- Google Login（OIDC）
- 取得情報：
  - sub（Google Subject ID）
  - email
  - name

API側でJWT検証を行い、セッションを発行

---

### データベース

- Cloudflare D1（SQLiteベース）
- SQLはRDB移植可能な設計を維持
  - 外部キー明示
  - 正規化を意識
  - ベンダー依存構文を避ける
- マイグレーション管理を実施

将来的にPostgreSQL等へ移行可能な設計とする。

---

### 非同期処理

- Cloudflare Queues を利用
- 処理内容：
  - URL登録後のメタデータ取得（oEmbed）
  - タイトル / 作者 / サムネURLの取得

設計方針：
- APIは即時レスポンス
- メタデータ取得はQueue経由でWorker Consumerが処理
- JSONメッセージ形式（schemaVersion付き）

---

## 5. 対応プロバイダ

- SpeakerDeck
- Docswell
- Google Slides（公開スライドのみ）

処理方針：
- URLからprovider判定
- 可能な場合はoEmbed利用
- embedUrlのみ保存（embed_htmlは保存しない）
- サムネイル画像の再配信は行わない

---

## 6. データモデル（MVP）

### users

- id
- google_sub（unique）
- email
- name
- created_at

### stocks

- id
- user_id
- original_url
- canonical_url
- provider
- title（nullable）
- author_name（nullable）
- thumbnail_url（nullable）
- embed_url（nullable）
- status（pending / ready / failed）
- created_at
- updated_at

### memos

- id
- stock_id
- user_id
- memo_text
- created_at
- updated_at

---

## 7. API設計（概要）

### 認証
- GET /me

### ストック管理
- POST /stocks
- GET /stocks
- GET /stocks/:id
- DELETE /stocks/:id

### メモ管理
- PUT /stocks/:id/memo
- GET /stocks/:id/memo

---

## 8. 画面構成（MVP）

### 1. ログイン画面
- Google Loginボタン

### 2. 一覧画面
- URL入力フォーム
- ストック一覧表示
  - タイトル
  - サムネイル
  - メモ
  - 元スライドリンク
  - embed表示（lazy load）

### 3. 詳細画面
- embed表示
- メモ編集

---

## 9. コスト最適化方針

- R2は使用しない（サムネ保存しない）
- 画像は元URL参照
- Workers無料枠活用
- D1無料枠活用
- Queues無料枠活用
- JSを最小化し転送量削減

目標：
月額ほぼゼロ〜数百円以内に抑える

---

## 10. 設計原則

- フロントとAPIは完全分離
- APIは純粋なHTTPインターフェース
- Cloudflare固有機能への依存は最小化
- 将来的なクラウド移行を想定した抽象化
- MVPは小さく作り、後から拡張可能にする

---

## 11. 将来拡張可能性（参考）

- ページ単位ベストスライド
- 全文検索
- AI検索（Embedding）
- 公開コレクション
- サムネキャッシュ（R2）

---

## 12. 成功基準

- URL入力のみでスライドが登録できる
- 一覧でembed表示できる
- メモが永続化される
- 月額コストが極小である
- 将来拡張が可能な設計である

---


