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
  logs/             # 自律モード実行ログ
scripts/
  task-runner.sh    # 自律モード用ランナー
  run-agents-tmux.sh # tmux 3ペイン起動
  prompts/
    pm.md           # PM ロールプロンプト
    qa.md           # QA ロールプロンプト
    dev.md          # DEV ロールプロンプト
    _security.md    # 全ロール共通セキュリティルール
```

### ロールと編集範囲

| ロール | 編集対象 | 責務 |
|--------|---------|------|
| PM | `docs/`, `tasks/` | 仕様策定、タスク管理 |
| QA | `**/*.test.ts` | テスト作成（テストファースト） |
| DEV | `src/`, `worker/`, 設定ファイル | 実装（テストを通す） |

---

## 2. 運用モード

### A) 自律モード（tmux常駐）

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

### B) 対話モード（Claude直接実行）

tmux/task-runnerを使わず、Claudeセッション上で直接タスクを実行する。
リモートアクセス時やtmuxが使えない環境で利用する。

#### ワークフロー

ユーザーが「タスクを実行して」と指示した場合、以下の手順で進める:

1. **タスク確認**: `tasks/TASKS.md` を読み、対象の未着手タスク `[ ]` を特定する
2. **依存チェック**: タスク説明の `[dep: T-xxx]` を確認し、依存先が `[x]` であることを検証する
3. **タスク読込**: `tasks/T-xxx.md` を読み、実行内容を把握する
4. **ロール確認**: `scripts/prompts/{role}.md` を読み、ロールの制約に従う
5. **CLAIM**: TASKS.md のタスクを `[>]` に更新する
6. **実行**: タスクの指示に従い作業を行う
7. **完了マーク**: 成功 → `[x]`、失敗 → `[!]`
8. **次のタスク**: ユーザーの指示に従い、次のタスクへ進む

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

---

## 3. フェーズ管理

タスクはフェーズ単位で管理する。TASKS.md の構成:

- **3. Next** — 現在実行可能なタスク（`[ ]` で記載）
- **5. Backlog** — 次フェーズ以降のタスク（HTMLコメント内に記載、grepで拾われない）

フェーズ完了時:
1. 次フェーズのタスクをBacklogのコメントから解除
2. 「3. Next」セクションに移動
3. 必要に応じて依存関係を更新
