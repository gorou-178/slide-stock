# ADR-007: Google OAuthエンドポイントバージョン混在の調査と確認

## ステータス
Accepted

## コンテキスト

`worker/handlers/auth.ts` では以下の3つのGoogle OAuthエンドポイントを使用している。

| エンドポイント | 使用URL | コード参照 |
|---|---|---|
| Authorization（認可） | `https://accounts.google.com/o/oauth2/v2/auth` | `worker/handlers/auth.ts:99` |
| JWKS（公開鍵） | `https://www.googleapis.com/oauth2/v3/certs` | `worker/handlers/auth.ts:74` |
| Token（トークン交換） | `https://oauth2.googleapis.com/token` | `worker/handlers/auth.ts:148` |

Authorizationエンドポイントが `v2` を使用し、JWKSエンドポイントが `v3` を使用しているため、バージョン番号が混在しているように見えた。T-752としてこの整合性の調査が必要と判断された。

## 調査結果

Google OpenID Connect Discovery Document（`https://accounts.google.com/.well-known/openid-configuration`）を参照し、現行実装との対照を行った。

### エンドポイント対照表

| エンドポイント | Discovery Document の正規値 | 現行実装 | 一致 |
|---|---|---|---|
| `authorization_endpoint` | `https://accounts.google.com/o/oauth2/v2/auth` | `https://accounts.google.com/o/oauth2/v2/auth` | ✓ |
| `jwks_uri` | `https://www.googleapis.com/oauth2/v3/certs` | `https://www.googleapis.com/oauth2/v3/certs` | ✓ |
| `token_endpoint` | `https://oauth2.googleapis.com/token` | `https://oauth2.googleapis.com/token` | ✓ |

3エンドポイントすべてがDiscovery Documentの正規値と完全に一致している。

### 「v2/v3混在」の実態

`v2` と `v3` は同一APIの異なるバージョンではなく、**独立したAPIファミリーの独立したバージョン番号**である。

- **`v2`**: Google OAuth 2.0 Authorization Server の認可エンドポイントバージョン（`accounts.google.com` ドメイン）
- **`v3`**: Google APIs（`googleapis.com` ドメイン）の公開鍵配信エンドポイントバージョン

両者は異なるドメイン・異なるAPIファミリーに属しており、バージョン番号を揃える必要も意味もない。

### scopeの妥当性

現行実装で使用しているscope `openid email profile` と取得するクレームの対応：

| スコープ | 付与されるクレーム | コードでの使用箇所 |
|---|---|---|
| `openid` | `sub`（Subject ID） | `worker/handlers/auth.ts:81`（`claims.sub`） |
| `email` | `email` | `worker/handlers/auth.ts:82`（`claims.email`） |
| `profile` | `name` | `worker/handlers/auth.ts:83`（`claims.name`） |

取得するすべてのクレーム（`sub`, `email`, `name`）に対して過不足なくscopeが設定されており、妥当である。

## 決定

**現行実装を変更しない。**

3つのエンドポイントはすべてGoogle OpenID Connect Discovery Documentが定める正規値と一致している。「バージョン混在」に見えるが、実際には各エンドポイントの正式バージョンを使用しており、問題はない。

## 理由

1. AuthorizationエンドポイントのURL（`v2/auth`）はDiscovery Documentの`authorization_endpoint`フィールドと完全一致する
2. JWKSエンドポイントのURL（`v3/certs`）はDiscovery Documentの`jwks_uri`フィールドと完全一致する
3. TokenエンドポイントのURL（バージョン番号なし）はDiscovery Documentの`token_endpoint`フィールドと完全一致する
4. `v2`と`v3`は異なるAPIファミリーの独立したバージョニングであり、番号を揃える必要はない
5. scopeは取得するクレーム（`sub`, `email`, `name`）に対して過不足なく妥当である
