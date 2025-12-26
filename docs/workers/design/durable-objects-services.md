## Durable Objects サービス層設計

### 1. 目的
- 既存のサーバー側サービス:
  - `GameService`
  - `RoundService`
  - `CountdownService`
の責務を、GameSession DO 内の「サービスモジュール」に整理して再利用しやすくする。

### 2. GameService 相当
- 役割:
  - 反応時間データの検証（タイムスタンプ/フレーム値の妥当性）
  - 勝敗判定（`RoundResult`）
  - プレイヤー勝数の更新
- 主な関数:
  - `validateReactions(roomState): ValidReaction[]`
  - `calculateRoundResult(reactions): { result: RoundResult; winnerPlayerId: string | null }`
  - `updatePlayerWins(winnerPlayerId)`

### 3. RoundService 相当
- 役割:
  - ラウンド終了時に
    - 勝者決定
    - `round_result` のブロードキャスト
    - 次ラウンド準備（状態リセット/Ready初期化）
- 主な関数:
  - `determineRoundWinner()`
  - `sendRoundResults()`
  - `resetRoundState()`

### 4. CountdownService 相当
- 役割:
  - Ready 完了後のカウントダウン開始
  - カウントダウン完了後に `round_start` 相当の処理を呼び出す
- 主な関数:
  - `startCountdown(initial: number = 3)`
    - `COUNTDOWN_START` メッセージを送信
    - `setTimeout` / `alarm` 等で一定時間後にゲーム開始

### 5. DO 内での配置イメージ

```ts
class GameSession extends DurableObject {
  private gameLogic: GameService;
  private roundService: RoundService;
  private countdownService: CountdownService;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.gameLogic = new GameService(this.state, /* … */);
    this.roundService = new RoundService(this.state, /* … */);
    this.countdownService = new CountdownService(this.state, /* … */);
  }
}
```


