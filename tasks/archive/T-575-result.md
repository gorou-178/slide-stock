# T-575: MVP 受入テスト結果

## テスト実施日
2026-03-04

## テスト環境
ローカル開発環境（本番デプロイ前の事前検証）

---

## 基準1: URL入力のみでスライドが登録できる

| プロバイダ | テスト結果 | 備考 |
|-----------|-----------|------|
| SpeakerDeck | PASS (テスト検証済) | ユニットテスト 31 件 + 統合テスト検証済 |
| Docswell | PASS (テスト検証済) | ユニットテスト + 統合テスト検証済 |
| Google Slides | PASS (テスト検証済) | ユニットテスト + 統合テスト検証済 |

**検証方法**: `worker/handlers/stocks.test.ts` (31 テスト) + `worker/handlers/integration.test.ts` (全プロバイダフルフロー)

---

## 基準2: 一覧で embed 表示できる

| 項目 | テスト結果 | 備考 |
|------|-----------|------|
| ストック一覧表示 | PASS (テスト検証済) | GET /api/stocks でページネーション・メモ結合テスト済 |
| oEmbed iframe 表示 | PASS (実装検証済) | `EmbedViewer.astro` で sandbox 付き iframe 実装済 |
| メタデータ自動取得 | PASS (テスト検証済) | Queue コンシューマー 11 テスト + 統合テスト検証済 |

**検証方法**: `worker/handlers/stocks.test.ts` + `worker/handlers/queue-consumer.test.ts` + `worker/handlers/integration.test.ts`

---

## 基準3: メモが永続化される

| 項目 | テスト結果 | 備考 |
|------|-----------|------|
| メモ作成 | PASS (テスト検証済) | PUT /api/stocks/:id/memo 19 テスト |
| メモ取得 | PASS (テスト検証済) | GET /api/stocks/:id/memo + 一覧 JOIN 検証済 |
| メモ更新 | PASS (テスト検証済) | Upsert テスト検証済 |

**検証方法**: `worker/handlers/memo.test.ts` (19 テスト)

---

## 基準4: 月額コストが極小である

| 項目 | 結果 | 備考 |
|------|------|------|
| Cloudflare 無料枠活用 | PASS (設計検証) | Workers / D1 / Queues / Pages すべて無料枠で運用可能 |
| R2 不使用 | PASS | サムネイル画像は元 URL 参照（再配信なし） |
| JS 最小構成 | PASS | Astro アイランドアーキテクチャで JS を最小化 |

**想定コスト**: 0〜300円/月（個人利用の場合、無料枠内に収まる見込み）

---

## 基準5: 将来拡張が可能な設計である

| 項目 | 結果 | 備考 |
|------|------|------|
| フロント・API 完全分離 | PASS | REST API 境界が明確 |
| プロバイダ追加容易 | PASS | `provider.ts` に検出ルール追加、`oembed.ts` にフェッチ関数追加で対応 |
| DB 移行可能 | PASS | 標準 SQL 準拠、D1 固有構文なし |
| 認証方式変更容易 | PASS | セッション Cookie の payload を session_id に差し替えるだけで DB セッションに移行可能 |
| ドキュメント完備 | PASS | `docs/` に 9 仕様書 + 2 ADR |

---

## 総合判定

| 基準 | 結果 |
|------|------|
| 1. URL入力のみでスライド登録 | PASS |
| 2. 一覧で embed 表示 | PASS |
| 3. メモが永続化 | PASS |
| 4. 月額コストが極小 | PASS (設計ベース) |
| 5. 将来拡張可能な設計 | PASS |

**結論**: MVP 受入基準を満たす。本番デプロイ後に実環境での再検証を推奨。

---

## テストカバレッジサマリ

| テストファイル | テスト数 |
|---------------|---------|
| worker/lib/provider.test.ts | 35 |
| worker/handlers/stocks.test.ts | 31 |
| worker/handlers/auth.test.ts | 21 |
| worker/handlers/memo.test.ts | 19 |
| worker/middleware/session-auth.test.ts | 11 |
| worker/handlers/queue-consumer.test.ts | 11 |
| worker/lib/oembed.test.ts | 8 |
| worker/handlers/integration.test.ts | 6 |
| その他 | 43 |
| **合計** | **185** |

## 本番デプロイ後の追加検証項目

- [ ] 実際の Google ログインフロー（本番 OAuth 認証情報で）
- [ ] SpeakerDeck / Docswell / Google Slides の実 URL で登録テスト
- [ ] oEmbed メタデータ取得の実動作確認
- [ ] セキュリティヘッダー確認（`curl -sI` で検証）
- [ ] Cloudflare ダッシュボードでのリソース使用量確認
