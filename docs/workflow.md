# 開発ワークフロー

タスク管理、テスト手法、コード管理

---

## 1. 概要

本プロジェクトでは `tasks/TASKS.md` を SSOT（Single Source of Truth）として、PM / QA / DEV の3ロールがタスクを並列に実行する。
作業モード（自律 / 対話 / リモート）に応じた運用フローを定め、GitHub PR に作業履歴を集約する。

テストは Vitest（単体テスト）と Playwright（E2E テスト）を併用し、CI は GitHub Actions で PR / main push 時に自動実行される。
デプロイは main ブランチへの push をトリガーとして Cloudflare へ自動デプロイされる（詳細は [architecture-spec.md](architecture-spec.md) を参照）。

---

## 2. タスク管理

### 2.1 TASKS.md の書式

```
- [ ] @role T-xxx — 説明         (未着手)
- [>] @role T-xxx — 説明         (CLAIM済み / 実行中)
- [x] @role T-xxx — 説明         (完了)
- [!] @role T-xxx — 説明         (失敗)
```

### 2.2 ファイル構成

```
tasks/
  TASKS.md          # タスクボード（SSOT）
  T-xxx.md          # 個別タスクの詳細指示
  logs/             # 実行ログ（ローカルモード）
scripts/
  task-runner.sh    # 自律モード用ランナー
  run-agents-tmux.sh # tmux 3ペイン起動
  prompts/
    pm.md           # PM ロールプロンプト
    qa.md           # QA ロールプロンプト
    dev.md          # DEV ロールプロンプト
    _security.md    # 全ロール共通セキュリティルール
.github/
  workflows/
    ci.yml          # PR時のテスト自動実行
```

### 2.3 ロールと編集範囲

| ロール | 編集対象 | 責務 |
|--------|---------|------|
| PM | `docs/`, `tasks/` | 仕様策定、タスク管理 |
| QA | `**/*.test.ts` | テスト作成（テストファースト） |
| DEV | `src/`, `worker/`, 設定ファイル | 実装（テストを通す） |

### 2.4 フェーズ管理

タスクはフェーズ単位で管理する。TASKS.md の構成:

- **3. Next** -- 現在実行可能なタスク（`[ ]` で記載）
- **5. Backlog** -- 次フェーズ以降のタスク（HTML コメント内に記載、grep で拾われない）

フェーズ完了時:
1. フェーズ PR をマージ
2. 次フェーズのタスクを Backlog のコメントから解除
3. 「3. Next」セクションに移動
4. 新しいフェーズ PR を作成

### 2.5 運用モード

#### A) 自律モード（tmux 常駐 / ローカル）

ローカル環境で task-runner を常駐起動し、TASKS.md のタスクを自動で順次実行する。

```bash
# 起動
./scripts/run-agents-tmux.sh

# 既存セッションを再起動
./scripts/run-agents-tmux.sh --kill

# オプション
./scripts/run-agents-tmux.sh --interval 60 --dev-model opus
```

動作:
1. PM / QA / DEV 各1プロセスが TASKS.md を監視
2. 未着手タスク `[ ]` を発見 → CLAIM `[>]` → `claude -p` で実行
3. 成功 → `[x]`、失敗 → `[!]`
4. ログは `tasks/logs/T-xxx.log` に保存（tmux ペインにも表示）
5. PR が存在する場合、タスク完了時に PR コメントを投稿

停止:
```bash
# グレースフル停止（推奨）
tmux send-keys -t slide-stock-agents:agents.0 C-c
tmux send-keys -t slide-stock-agents:agents.1 C-c
tmux send-keys -t slide-stock-agents:agents.2 C-c
sleep 2
tmux kill-session -t slide-stock-agents

# 即時停止（PID ファイルが残る可能性あり）
tmux kill-session -t slide-stock-agents
rm -f tasks/.runner.*.pid
rmdir tasks/.runner.lock 2>/dev/null
```

#### B) 対話モード（Claude Code / ローカル）

tmux / task-runner を使わず、Claude セッション上で直接タスクを実行する。

**ワークフロー:**

1. **タスク確認**: `tasks/TASKS.md` を読み、対象の未着手タスク `[ ]` を特定する
2. **依存チェック**: タスク説明の `[dep: T-xxx]` を確認し、依存先が `[x]` であることを検証する
3. **タスク読込**: `tasks/T-xxx.md` を読み、実行内容を把握する
4. **ロール確認**: `scripts/prompts/{role}.md` を読み、ロールの制約に従う
5. **CLAIM**: TASKS.md のタスクを `[>]` に更新する
6. **実行**: タスクの指示に従い作業を行う
7. **完了マーク**: 成功 → `[x]`、失敗 → `[!]`
8. **PR コメント**: PR が存在する場合、実行結果を PR コメントとして投稿する
9. **次のタスク**: ユーザーの指示に従い、次のタスクへ進む

**並列実行:**

独立したタスク（依存関係がないもの）は、Task ツール（subagent）を使って並列に実行できる。
ただし同じファイルを編集するタスクは直列に実行すること。

**指示例:**

```
# 特定タスクを実行
「T-511 を実行してください」

# フェーズ単位で実行
「Phase 2 のタスクを実行してください」

# ロール指定で実行
「PM タスクを全て実行してください」

# 並列実行
「T-511 と T-521 を並列で実行してください」
```

#### C) リモートモード（claude.ai + GitHub MCP）

claude.ai から GitHub MCP Server を経由してタスクを実行する。
ローカル環境が不要で、ブラウザのみで作業指示・実行・確認ができる。

**前提条件:**

- claude.ai に GitHub MCP Server が接続されていること（セットアップ手順: [5.5 GitHub MCP セットアップ](#55-github-mcp-セットアップリモートモード用) を参照）

**能力と制限:**

| 操作 | リモートモード | ローカルモード |
|------|--------------|--------------|
| TASKS.md 読み書き | GitHub API 経由 | ローカルファイル |
| コード読み書き | commit 経由 | ローカルファイル |
| PR 作成・コメント | GitHub API 経由 | `gh` コマンド |
| テスト実行 | GitHub Actions（自動） | ローカル実行 |
| ビルド・デプロイ | GitHub Actions（要設定） | ローカル実行 |

**ワークフロー:**

1. **PR 作成**: フェーズ用のブランチ・PR を作成する
2. **タスク確認**: GitHub API で `tasks/TASKS.md` を読む
3. **実行**: コードを書き、commit & push する
4. **CI 実行**: GitHub Actions がテストを自動実行（結果は PR checks に表示）
5. **PR コメント**: タスク完了時に実行結果を PR コメントとして投稿する
6. **TASKS.md 更新**: タスクステータスを更新して commit

### 2.6 PR コメントフォーマット

タスク完了時に以下の形式で PR コメントを投稿する:

**成功時:**
```markdown
### ✅ T-511 — プロバイダ検出モジュール実装
- **Role**: @dev
- **Mode**: autonomous / interactive / remote
- **Duration**: 2026-02-15 21:00 → 21:05

#### 変更内容
- `worker/lib/provider.ts` を新規作成
- `worker/lib/provider.test.ts` のテストが全てパス

#### テスト結果
- vitest: 12 passed, 0 failed
```

**失敗時:**
```markdown
### ❌ T-511 — プロバイダ検出モジュール実装
- **Role**: @dev
- **Mode**: autonomous
- **Duration**: 2026-02-15 21:00 → 21:02
- **Error**: テスト 3件失敗（provider.test.ts:45, :67, :89）
```

### 2.7 ログの種類

| ログ種別 | 保存先 | 用途 |
|---------|--------|------|
| PR コメント | GitHub PR | 進捗共有・履歴参照（どこからでも閲覧可） |
| ローカルログ | `tasks/logs/T-xxx.log` | 詳細デバッグ（自律・対話モードのみ） |

PR コメントは要約、ローカルログは完全な出力。

---

## 3. Git 運用

### 3.1 ブランチ戦略

- `main` ブランチが本番デプロイ対象
- フェーズ単位で feature ブランチを作成し、PR 経由でマージする
- PR → main で CI が実行され、main push で Cloudflare へ自動デプロイされる

### 3.2 コミット規約

Conventional Commits 形式を使用する:

```
type(scope): description
```

| type | 用途 | 例 |
|------|------|-----|
| `feat` | 新機能追加 | `feat(stocks): add cursor pagination` |
| `fix` | バグ修正 | `fix(auth): validate redirect URI` |
| `test` | テスト追加・修正 | `test(memo): add upsert test` |
| `docs` | ドキュメント変更 | `docs: update architecture spec` |
| `chore` | 雑務（設定変更等） | `chore: update dependencies` |
| `refactor` | リファクタリング | `refactor(worker): extract handler` |

### 3.3 Push ルール

- `git push` は**人間のみ**が実行する（エージェントはローカル commit のみ）
- `.dev.vars` や Secrets を含むファイルはコミットしない
- `wrangler.toml` の `database_id` に本番値をハードコードしない
- 小さな単位でコミットする（意味のある差分ごと）

### 3.4 PR 運用フロー

作業履歴を GitHub PR に集約し、どのモードからでも参照可能にする。

**PR 作成タイミング:**

フェーズ単位で PR を作成する:

```bash
# ローカルから
git checkout -b phase-2-core-backend
git push -u origin phase-2-core-backend
gh pr create --title "Phase 2: コアバックエンド" --body "T-501, T-507, T-508, T-511, T-512, T-521, T-522"
```

---

## 4. テスト手法

### 4.1 テストツール

| ツール | 用途 | 設定ファイル |
|--------|------|-------------|
| Vitest | 単体テスト（Cloudflare Workers pool） | `vitest.config.ts`, `wrangler.test.toml` |
| Playwright | E2E テスト（Chromium） | `e2e/` ディレクトリ |

### 4.2 テスト実行コマンド

```bash
npm test             # Vitest 単体テスト
npm run test:watch   # Vitest watch モード
npm run test:e2e     # Playwright E2E (Chromium, port 4321 自動起動)
```

### 4.3 テストファイル配置

- 単体テストは `worker/**/*.test.ts` にテスト対象と同階層に配置する
- E2E テストは `e2e/` ディレクトリに配置する
- テストファースト: QA ロールがテストを先に書き、DEV ロールがそれを通す実装を行う

### 4.4 テスト環境

- Vitest は `@cloudflare/vitest-pool-workers` を使用し、Cloudflare Workers ランタイム上でテストを実行する
- D1 マイグレーションはテスト設定で自動適用される
- `TEST_MODE` は本番環境では無効化される（`CALLBACK_URL` が本番ドメインの場合は自動無効化）

---

## 5. CI/CD

### 5.1 CI（GitHub Actions）

PR 作成時および main ブランチへの push 時に GitHub Actions が自動実行される。

**設定ファイル:** `.github/workflows/ci.yml`

**実行内容:**
1. Node.js 20 環境をセットアップ
2. `npm ci` で依存パッケージをインストール
3. `npm test` で Vitest 単体テストを実行

### 5.2 デプロイ

- main ブランチへの push をトリガーとして Cloudflare へ自動デプロイされる
- フロントエンド（Astro）は Cloudflare Pages に静的出力としてデプロイ
- API（Workers）は Cloudflare Workers にデプロイ
- 詳細なデプロイ構成については [architecture-spec.md](architecture-spec.md) を参照

### 5.3 GitHub MCP セットアップ（リモートモード用）

claude.ai から GitHub リポジトリを操作するために、GitHub MCP Server を接続する。

**手順:**

1. claude.ai の Settings → Integrations → MCP Servers から GitHub を追加
2. GitHub アカウントを認証
3. 対象リポジトリ（`gorou-178/slide-stock`）へのアクセスを許可

**利用可能な操作:**

- ファイルの読み取り・作成・更新（commit 経由）
- ブランチの作成
- PR の作成・コメント・マージ
- Issue の作成・更新

**注意事項:**

- シェルコマンドは実行できない（テスト・ビルド・デプロイは GitHub Actions に委譲）
- 大量のファイル変更は複数 commit に分割すること
- `_security.md` のルール（秘匿情報の取り扱い）はリモートモードでも厳守

---

## 関連ドキュメント

- [architecture-spec.md](architecture-spec.md) -- アーキテクチャ全体設計
- [backend-spec.md](backend-spec.md) -- 認証・API バックエンド仕様
- [data-model-spec.md](data-model-spec.md) -- データベーススキーマ・マイグレーション
- [frontend-spec.md](frontend-spec.md) -- UI コンポーネント・画面仕様
- [provider-spec.md](provider-spec.md) -- スライドプロバイダ検出仕様
- [oembed-spec.md](oembed-spec.md) -- oEmbed メタデータ取得仕様
- [stock-api-spec.md](stock-api-spec.md) -- Stock API 仕様
- [memo-api-spec.md](memo-api-spec.md) -- Memo API 仕様
