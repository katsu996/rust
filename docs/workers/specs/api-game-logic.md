## ゲームAPI仕様（ラウンド/反応/結果）

### 1. 対象メッセージ
- `ClientMessage.action`:
  - `round_start`
  - `exclamation_show`
  - `player_reaction`
  - `false_start`
- `ServerMessage.type`:
  - `round_start`
  - `exclamation_show`
  - `player_reaction`（必要なら）
  - `false_start`
  - `round_result`
  - `error`

### 2. round_start

#### リクエスト
- action: `"round_start"`
- data:
  - `waitTime`: ラウンド開始前待機時間(ms or フレーム)
  - `gameStartTime`: クライアント基準の開始時刻（同期目的）

#### 条件
- 呼び出しプレイヤーが `hostId` であること。
- 既にラウンドが進行中でないこと。

#### 成功時
- GameSession DO が
  - 既存反応クリア
  - `round_start` を全員に送信

### 3. exclamation_show

#### リクエスト
- action: `"exclamation_show"`
- data:
  - `timestamp`: 感嘆符表示時刻

#### 成功時
- `exclamation_show` を全員へブロードキャスト。

### 4. player_reaction

#### リクエスト
- action: `"player_reaction"`
- data:
  - `reactionFrames`: 反応フレーム値

#### 処理
- GameSession DO:
  - ラウンド中か検証
  - 同一プレイヤーの二重反応をブロック
  - 反応が揃う／タイムアウト時に RoundService へ勝敗判定を依頼
  - `round_result` を全員に送信

### 5. false_start

#### リクエスト
- action: `"false_start"`
- data:
  - `timestamp`: お手つき発生時刻

#### 処理
- GameSession DO:
  - お手つきカウンタ更新
  - 必要ならラウンド即終了→ `round_result`（お手つき負け）を送信。


