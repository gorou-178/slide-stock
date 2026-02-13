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

## 4. 技術構成・アーキテクチャ

詳細は [docs/architecture.md](docs/architecture.md) を参照。

概要：
- フロントエンド: Astro (TypeScript) → Cloudflare Pages
- API: Cloudflare Workers (REST / JSON)
- 認証: Google Login (OIDC) → JWT検証 → セッション発行
- DB: Cloudflare D1 (SQLiteベース)
- 非同期処理: Cloudflare Queues (oEmbedメタデータ取得)
- 対応プロバイダ: SpeakerDeck / Docswell / Google Slides

---

## 5. データモデル

詳細は [docs/database.md](docs/database.md) を参照。

テーブル：
- **users** — ユーザー情報 (Google OIDC)
- **stocks** — ストックしたスライド情報
- **memos** — スライドに対するテキストメモ

---

## 6. API設計（概要）

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

## 7. 画面構成（MVP）

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

## 8. 成功基準

- URL入力のみでスライドが登録できる
- 一覧でembed表示できる
- メモが永続化される
- 月額コストが極小である
- 将来拡張が可能な設計である

---

## 9. 将来拡張可能性（参考）

- ページ単位ベストスライド
- 全文検索
- AI検索（Embedding）
- 公開コレクション
- サムネキャッシュ（R2）
