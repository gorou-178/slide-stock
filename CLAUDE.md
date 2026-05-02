# CLAUDE.md

プロジェクトの技術情報・開発ガイドは [AGENTS.md](AGENTS.md) を参照。
このファイルには Claude Code 固有の指示のみ記載する。

---

## 言語

ユーザーや読者が目にする**散文**は日本語、機械が解釈する**識別子・規約文字列**は英語、で切り分ける。

### 日本語で書く
- ユーザー向けの応答・説明・AskUserQuestion・レポート・retro/レビュー出力
- **PR / Issue の本文（description / body）、レビューコメント**
- **CHANGELOG.md のエントリ本文**（`### Added` / `### Changed` 配下の bullet など散文部分）
- ドキュメント（`docs/`、`tasks/` など）

### 英語のまま残す
- コード、ファイル名、パス
- コミットメッセージ（`feat:` `chore:` 等の Conventional Commits 慣習）
- **PR / コミットの「タイトル」**（`v0.0.2.0 feat(fonts): ...` 形式は GitHub/CI 互換性のため）
- **CHANGELOG のセクション見出し**（`## [X.Y.Z.W] - YYYY-MM-DD` / `### Added` / `### Changed` / `### Fixed` / `### Removed` などの Keep a Changelog 規約）
- 設定ファイル内の値、環境変数名

`/ship`・`/review`・`/qa` 等の skill が英語テンプレートを提供している場合でも、本文を投稿/コミットする前に上記ルールに従って翻訳する。

---

## 作業モード

セッション中の作業モードを以下の2つに分ける。ユーザーが明示的にモードを切り替える。

### プランモード

設計・仕様策定に集中するモード。

- **許可**: `docs/`, `tasks/`, `CLAUDE.md` など**ドキュメントファイルの閲覧・編集のみ**
- **禁止**: `src/`, `worker/`, 設定ファイル（`wrangler.toml`, `astro.config.*`, `tsconfig.*`, `package.json` 等）、テストファイル（`*.test.ts`）など**コードファイルの編集**
- コードの**閲覧（Read / Grep / Glob）は許可**する（設計の参考にするため）
- シェルコマンドの実行（ビルド・テスト・デプロイ等）は禁止
- モード切替: ユーザーが「開発モードに切り替えて」等と指示する

### 開発モード

実装・テスト・デプロイを行うモード。現状の開発フローに従う。

- **許可**: すべてのファイルの閲覧・編集、シェルコマンドの実行
- ロール別の編集範囲（PM / QA / DEV）はタスク運用ルールに従う
- モード切替: ユーザーが「プランモードに切り替えて」等と指示する

### デフォルト

セッション開始時のデフォルトは**プランモード**とする。

---

## タスク運用

詳細は [docs/task-workflow.md](docs/task-workflow.md) を参照。

- `tasks/TASKS.md` をSSOTとし、PM/QA/DEV の3ロールが並列にタスクを実行する
- **自律モード**: `./scripts/run-agents-tmux.sh` でtmux常駐起動
- **対話モード**: Claudeセッション上で直接タスクを実行（リモート対応）

### タスク書式
- `- [ ] @role T-xxx — 説明`  未着手
- `- [>] @role T-xxx — 説明`  CLAIM済み（実行中）
- `- [x] @role T-xxx — 説明`  完了
- `- [!] @role T-xxx — 説明`  失敗

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health
