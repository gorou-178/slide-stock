# MVP実装計画の策定とタスク分解

CLAUDE.md、docs/architecture.md、docs/database.md を読み込み、以下を実施してください。

## やること

1. CLAUDE.md の MVP ゴールを確認し、必要な機能を洗い出す
2. tasks/TASKS.md の現在のタスク一覧を確認する
3. 不足しているタスクがあれば追加する
4. 各タスクの詳細ファイル（tasks/NNN-xxx.md）が存在しない場合は作成する
5. タスクの順序が適切か確認し、必要なら並べ替える

## 確認ポイント

- 全ての MVP 要件がタスクでカバーされているか
- QA → Dev の TDD 順序が守られているか
- Phase の分割が適切か
- D1 マイグレーション用のタスクがあるか
- デプロイ設定（wrangler.toml）のタスクがあるか

## 出力

- tasks/TASKS.md を更新する（必要な場合）
- 不足しているタスク詳細ファイルを tasks/ に作成する
