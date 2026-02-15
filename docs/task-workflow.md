# タスク運用ワークフロー

このリポジトリは `tasks/TASKS.md` をSSOT（Single Source of Truth）として、PM/QA/DEV の3ロールがタスクを実行する。

---

## 1. タスクシステム概要

### TASKS.md の書式

```
- [ ] @role T-xxx — 説明         (未着手)
- [>] @role T-xxx — 説明         (CLAIM済み / 実行中)
- [x] @role T-xxx — 説明         (完了)
- [!] @role T-xxx — 説明         (失敗)
```

### ファイル構成

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

### ロールと編集範囲

| ロール | 編集対象 | 責務 |
|--------|---------|------|
| PM | `docs/`, `tasks/` | 仕様策定、タスク管理 |
| QA | `**/*.test.ts` | テスト作成（テストファースト） |
| DEV | `src/`, `worker/`, 設定ファイル | 実装（テストを通す） |

---

## 2. 運用モード

### A) 自律モード（tmux常駐 / ローカル）

ローカル環境でtask-runnerを常駐起動し、TASKS.md のタスクを自動で順次実行する。

```bash
# 起動
./scripts/run-agents-tmux.sh

# 既存セッションを再起動
./scripts/run-agents-tmux.sh --kill

# オプション
./scripts/run-agents-tmux.sh --interval 60 --dev-model opus
```

動作:
1. PM/QA/DEV 各1プロセスがTASKS.mdを監視
2. 未着手タスク `[ ]` を発見 → CLAIM `[>]` → `claude -p` で実行
3. 成功 → `[x]`、失敗 → `[!]`
4. ログは `tasks/logs/T-xxx.log` に保存（tmuxペインにも表示）
5. PRが存在する場合、タスク完了時にPRコメントを投稿

停止:
```bash
# グレースフル停止（推奨）
tmux send-keys -t slide-stock-agents:agents.0 C-c
tmux send-keys -t slide-stock-agents:agents.1 C-c
tmux send-keys -t slide-stock-agents:agents.2 C-c
sleep 2
tmux kill-session -t slide-stock-agents

# 即時停止（PIDファイルが残る可能性あり）
tmux kill-session -t slide-stock-agents
rm -f tasks/.runner.*.pid
rmdir tasks/.runner.lock 2>/dev/null
```

### B) 対話モード（Claude Code / ローカル）

tmux/task-runnerを使わず、Claudeセッション上で直接タスクを実行する。

#### ワークフロー

1. **タスク確認**: `tasks/TASKS.md` を読み、対象の未着手タスク `[ ]` を特定する
2. **依存チェック**: タスク説明の `[dep: T-xxx]` を確認し、依存先が `[x]` であることを検証する
3. **タスク読込**: `tasks/T-xxx.md` を読み、実行内容を把握する
4. **ロール確認**: `scripts/prompts/{role}.md` を読み、ロールの制約に従う
5. **CLAIM**: TASKS.md のタスクを `[>]` に更新する
6. **実行**: タスクの指示に従い作業を行う
7. **完了マーク**: 成功 → `[x]`、失敗 → `[!]`
8. **PRコメント**: PRが存在する場合、実行結果をPRコメントとして投稿する
9. **次のタスク**: ユーザーの指示に従い、次のタスクへ進む

#### 並列実行

独立したタスク（依存関係がないもの）は、Task ツール（subagent）を使って並列に実行できる。
ただし同じファイルを編集するタスクは直列に実行すること。

#### 指示例

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

### C) リモートモード（claude.ai + GitHub MCP）

claude.ai から GitHub MCP Server を経由してタスクを実行する。
ローカル環境が不要で、ブラウザのみで作業指示・実行・確認ができる。

#### 前提条件

- claude.ai に GitHub MCP Server が接続されていること（セットアップ手順: 後述）

#### 能力と制限

| 操作 | リモートモード | ローカルモード |
|------|--------------|--------------|
| TASKS.md 読み書き | GitHub API経由 | ローカルファイル |
| コード読み書き | commit経由 | ローカルファイル |
| PR作成・コメント | GitHub API経由 | `gh` コマンド |
| テスト実行 | GitHub Actions（自動） | ローカル実行 |
| ビルド・デプロイ | GitHub Actions（要設定） | ローカル実行 |

#### ワークフロー

1. **PR作成**: フェーズ用のブランチ・PRを作成する
2. **タスク確認**: GitHub API で `tasks/TASKS.md` を読む
3. **実行**: コードを書き、commit & push する
4. **CI実行**: GitHub Actions がテストを自動実行（結果はPR checksに表示）
5. **PRコメント**: タスク完了時に実行結果をPRコメントとして投稿する
6. **TASKS.md更新**: タスクステータスを更新して commit

---

## 3. PR運用フロー

作業履歴をGitHub PRに集約し、どのモードからでも参照可能にする。

### PR作成タイミング

フェーズ単位でPRを作成する:

```bash
# ローカルから
git checkout -b phase-2-core-backend
git push -u origin phase-2-core-backend
gh pr create --title "Phase 2: コアバックエンド" --body "T-501, T-507, T-508, T-511, T-512, T-521, T-522"
```

### PRコメントフォーマット

タスク完了時に以下の形式でPRコメントを投稿する:

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

### ローカルログとの関係

| ログ種別 | 保存先 | 用途 |
|---------|--------|------|
| PRコメント | GitHub PR | 進捗共有・履歴参照（どこからでも閲覧可） |
| ローカルログ | `tasks/logs/T-xxx.log` | 詳細デバッグ（自律・対話モードのみ） |

PRコメントは要約、ローカルログは完全な出力。

---

## 4. フェーズ管理

タスクはフェーズ単位で管理する。TASKS.md の構成:

- **3. Next** — 現在実行可能なタスク（`[ ]` で記載）
- **5. Backlog** — 次フェーズ以降のタスク（HTMLコメント内に記載、grepで拾われない）

フェーズ完了時:
1. フェーズPRをマージ
2. 次フェーズのタスクをBacklogのコメントから解除
3. 「3. Next」セクションに移動
4. 新しいフェーズPRを作成

---

## 5. GitHub MCP セットアップ（リモートモード用）

claude.ai から GitHub リポジトリを操作するために、GitHub MCP Server を接続する。

### 手順

1. claude.ai の Settings → Integrations → MCP Servers から GitHub を追加
2. GitHub アカウントを認証
3. 対象リポジトリ（`gorou-178/slide-stock`）へのアクセスを許可

### 利用可能な操作

- ファイルの読み取り・作成・更新（commit経由）
- ブランチの作成
- PRの作成・コメント・マージ
- Issueの作成・更新

### 注意事項

- シェルコマンドは実行できない（テスト・ビルド・デプロイは GitHub Actions に委譲）
- 大量のファイル変更は複数commitに分割すること
- `_security.md` のルール（秘匿情報の取り扱い）はリモートモードでも厳守
