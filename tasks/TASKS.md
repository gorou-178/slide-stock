# タスク一覧

## Phase 0: プロジェクト基盤

- [x] @pm  001-plan — MVP実装計画の策定とタスク分解
- [x] @dev 002-setup-project — Astro + Workers プロジェクト初期セットアップ
- [x] @dev 003-setup-testing — テスト基盤の構築 (Vitest + Playwright)

## Phase 0.5: テスト環境整備

- [x] @qa 004-test-e2e-scaffold — E2E テスト基盤の構築 (Playwright セットアップ・初期シナリオ)
- [x] @dev 005-impl-e2e-scaffold — E2E テスト実行環境の実装 (dev サーバー連携・CI 対応)
- [x] @qa 006-test-auth-bypass — 認証バイパス付きテスト環境のテスト作成
- [x] @pm help-e2e-custom-user-test — 相談: E2E テスト「カスタムユーザーでの認証」が about:blank での相対URL解決で失敗する件
- [x] @qa 006a-fix-custom-user-test — E2E テスト「カスタムユーザーでの認証」修正（goto追加）
- [x] @dev 007-impl-auth-bypass — Google ログインを迂回するテスト用認証モックの実装
- [x] @dev 008-seed-testdata — テスト用シードデータの作成 (ユーザー・ストック・メモ)
- [x] @dev 009-d1-migration — D1 マイグレーション SQL の作成と適用手順の整備

## Phase 1: 認証

- [x] @qa 010-test-auth — Google OIDC 認証のテスト作成
- [x] @dev 011-impl-auth — Google OIDC 認証の実装

## Phase 2: ストック機能

- [x] @qa 020-test-url-provider — URL 判定・プロバイダ振り分けのテスト作成
- [x] @dev 021-impl-url-provider — URL 判定・プロバイダ振り分けの実装
- [x] @qa 022-test-stocks — スライドストック CRUD のテスト作成
- [x] @dev 023-impl-stocks — スライドストック CRUD の実装
- [x] @qa 024-test-oembed — oEmbed メタデータ取得 (Queue Consumer) のテスト作成
- [x] @dev 025-impl-oembed — oEmbed メタデータ取得 (Queue Consumer) の実装

## Phase 3: メモ機能

- [x] @qa 030-test-memo — メモ機能のテスト作成
- [x] @dev 031-impl-memo — メモ機能の実装

## Phase 4: フロントエンド

- [x] @qa 040-test-ui-login — ログイン画面のテスト作成
- [x] @dev 041-impl-ui-login — ログイン画面の実装
- [x] @qa 042-test-ui-list — 一覧画面のテスト作成
- [x] @dev 043-impl-ui-list — 一覧画面の実装
- [x] @qa 044-test-ui-detail — 詳細画面のテスト作成
- [x] @dev 045-impl-ui-detail — 詳細画面の実装

## Phase 5: 統合・デプロイ

- [x] @qa 050-test-e2e-integration — E2E 統合テスト (全画面フロー)
- [x] @dev 051-deploy-config — Cloudflare デプロイ設定の整備 (Pages・Workers・D1・Queues)
- [x] @pm 052-final-review — 最終レビューと要件充足確認
