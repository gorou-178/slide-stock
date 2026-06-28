# Astro + Workers プロジェクト初期セットアップ

docs/architecture.md に従い、プロジェクトの技術基盤をセットアップしてください。

## やること

1. Astro プロジェクトを初期化する（TypeScript strict モード）
2. Cloudflare Pages 用アダプター（@astrojs/cloudflare）を導入する
3. Cloudflare Workers の API 構造を作成する
4. wrangler.toml を設定する（D1 バインディング含む）
5. D1 のマイグレーション SQL を docs/database.md に基づき作成する
6. ディレクトリ構造を整備する:
   - src/pages/ — Astro ページ
   - src/components/ — UI コンポーネント
   - src/layouts/ — レイアウト
   - src/lib/ — 共有ロジック
   - worker/ — Cloudflare Workers API
7. package.json の scripts を整備する（dev, build, preview, deploy）
8. tsconfig.json を適切に設定する

## 制約

- 既存の CLAUDE.md, docs/, tasks/, scripts/ は変更しないこと
- 不要なボイラープレートは追加しない（最小構成）
