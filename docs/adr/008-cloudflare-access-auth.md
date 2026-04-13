# ADR-008: 認証委譲の検討 — カスタム Google OIDC から Cloudflare Access への移行

## ステータス
Rejected

## コンテキスト

### 現状のアーキテクチャ

認証は Google OIDC Authorization Code Flow を自前実装している:

```
GET /api/auth/login → Google Authorization Endpoint へリダイレクト
GET /api/auth/callback → code→token 交換 → ID Token 検証(jose) → ユーザー upsert → セッション Cookie 発行
POST /api/auth/logout → Cookie 削除
```

セッション管理は HMAC-SHA256 署名付き Cookie（Stateless）方式。

### 認証関連コードの規模

| ファイル | 行数 | 役割 |
|---|---|---|
| `worker/handlers/auth.ts` | 231 | login/callback/logout + ID Token検証 + セッションCookie生成 |
| `worker/middleware/session-auth.ts` | 72 | セッションCookie HMAC検証 |
| `worker/middleware/test-auth-bypass.ts` | 101 | テスト用認証バイパス（TEST_MODE） |
| `worker/auth-helpers.ts` | 37 | resolveAuth（テスト/本番の認証振り分け） |
| **ソース合計** | **441** | |
| テスト 3ファイル | ~1,105 | auth.test / session-auth.test / test-auth-bypass.test |

依存ライブラリ: `jose`（JWT検証）

環境変数/Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `CALLBACK_URL`, `SESSION_MAX_AGE`

### Cloudflare Access とは

Cloudflare Zero Trust の一機能。アプリケーションの前段でアクセスポリシーを適用し、認証済みリクエストのみをオリジンに到達させる。

- リクエストに `Cf-Access-Jwt-Assertion` ヘッダーが自動付与される
- Workers 側では JWT を検証するだけでユーザー identity を取得可能
- Google を Identity Provider (IdP) として設定可能
- 無料プラン: 50ユーザーまで（個人ツールなので十分）

## 検討した選択肢

### 選択肢 A: 現状維持（カスタム Google OIDC）

現行実装をそのまま維持する。

### 選択肢 B: Cloudflare Access に移行

Cloudflare Access で認証を代行し、Workers は JWT 検証のみ行う。

移行後の想定構成:
```
ブラウザ → Cloudflare Access (認証) → Workers (Cf-Access-Jwt-Assertion を検証)
```

削除可能なコード:
- `worker/handlers/auth.ts` の大部分（login/callback/logout ハンドラ、Token交換、セッションCookie生成）
- `worker/middleware/session-auth.ts`（全体）
- `src/pages/api/auth/login.ts`, `callback.ts`, `logout.ts`（3ファイル全体）
- 環境変数: `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `CALLBACK_URL`, `SESSION_MAX_AGE`

残存するコード:
- Access JWT 検証ミドルウェア（~30行、新規作成）
- `worker/middleware/test-auth-bypass.ts`（ローカル開発用に残す）
- `worker/auth-helpers.ts`（resolveAuth の分岐先が変わるだけ）
- ユーザー upsert ロジック（Access JWT の claims からユーザーを作成/更新）

## 分析

### メリット（選択肢 B）

| 項目 | 詳細 |
|---|---|
| コード削減 | ソース ~300行 + テスト ~800行を削除可能。認証ミドルウェアは ~30行に |
| Secrets 削減 | `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` が不要に（Workers に秘密鍵を持たせない） |
| セキュリティ向上 | セッション管理を Cloudflare に委譲。CSRF/Token漏洩リスクが構造的に排除される |
| 依存削除 | `jose` ライブラリが不要に（Access JWT は `Cf-Access-Jwt-Assertion` ヘッダーで検証） |

### デメリット（選択肢 B）

| 項目 | 詳細 | 重大度 |
|---|---|---|
| **ローカル開発の複雑化** | Cloudflare Access はローカルでは動作しない。`cloudflared tunnel` + Access 設定が必要、または TEST_MODE バイパスに依存し続ける | **高** |
| **ベンダーロックイン深化** | 認証がCloudflare Zero Trust に依存。他プラットフォーム移行時に認証基盤の再構築が必要 | **中** |
| **運用面の追加設定** | Zero Trust ダッシュボードでの Access Application / IdP 設定が必要。GCP Console の OAuth 設定も Cloudflare 経由に変更 | **中** |
| **ログアウト制御の制約** | ログアウトは Cloudflare Access のセッション管理に依存。アプリ側でのきめ細かい制御が困難に | **低** |
| **テスト環境の乖離** | ローカル（TEST_MODE バイパス）と本番（Access JWT）で認証経路が完全に異なる。E2Eテストで本番認証フローを再現できない | **中** |

### 定量比較

| 指標 | 現状（A） | Access移行後（B） |
|---|---|---|
| 認証ソースコード | ~441行 | ~170行（バイパス101 + helpers37 + 新JWT検証30） |
| 認証テストコード | ~1,105行 | ~500行（バイパステスト318 + 新JWT検証テスト ~180） |
| Secrets 数 | 3個 | 0個（Access Team Domain のみ） |
| 依存ライブラリ | jose | なし |
| 認証エンドポイント | 3個（login/callback/logout） | 0個（Accessが処理） |
| ローカル開発の手順 | .dev.vars 設定のみ | cloudflared tunnel または TEST_MODE |
| 移行作業量 | - | Zero Trust設定 + コード改修 + テスト書き直し（1-2日） |

## 決定

**選択肢 A（現状維持）を採用する。**

### 理由

1. **コスト対効果が低い**: 削減できるのは ~270行のソースコードと ~600行のテスト。個人ツールでこの規模の認証コードは十分管理可能。動作実績もあり、テストも充実している

2. **ローカル開発体験の悪化**: 現状は `.dev.vars` に Secrets を書くだけでローカルで完全な認証フローを再現できる。Access 移行後は `cloudflared tunnel` が必要になるか、テスト環境と本番環境の認証経路が乖離する

3. **設計原則との矛盾**: `docs/architecture.md` の設計原則「Cloudflare固有機能への依存は最小化」「将来的なクラウド移行を想定した抽象化」に反する。現在の OIDC 実装は標準的であり、どのプラットフォームにも移植可能

4. **既に十分セキュア**: ADR-006 による Cookie セキュリティ強化（__Host- prefix、Secure 常時付与）が完了しており、現行実装のセキュリティレベルは十分

5. **認証コードは安定している**: Phase 6A のセキュリティ強化以降、認証周りの変更は少ない。メンテナンスコストは低い

### 再検討の条件

以下のいずれかが発生した場合、再検討する:

- **マルチユーザー化**: 複数ユーザーへのサービス公開時（アクセスポリシー管理が必要になる）
- **追加 IdP 要件**: Google 以外の認証プロバイダー対応が必要になった場合
- **セキュリティインシデント**: 自前認証コードに脆弱性が発見された場合
