# Durable Objects メッセージハンドラー設計

## 1. 目的

- 既存のサーバー側ハンドラー
  - `ServerRoomMessageHandler`
  - `ServerGameMessageHandler`
  - `ReadyMessageHandler`
の責務を、**GameSession DO / RoomManager DO 内のメソッド**として再構成する。

## 2. ClientMessage.action → DOメソッド対応

| action             | DO             | メソッド名例 |
| ------------------ | -------------- | ------------ |
| `join_room`        | RoomManager    | `handleQuickMatchJoin` / `handleCustomRoomJoin` |
| `create_room`      | RoomManager    | `handleCustomRoomCreate`                        |
| `round_start`      | GameSession    | `handleRoundStart`                              |
| `exclamation_show` | GameSession    | `handleExclamationShow`                         |
| `player_reaction`  | GameSession    | `handlePlayerReaction`                          |
| `false_start`      | GameSession    | `handleFalseStart`                              |
| `ready_toggle`     | GameSession    | `handleReadyToggle`                             |
| `rematch_request`  | GameSession    | `handleRematchRequest`                          |
| `rematch_response` | GameSession    | `handleRematchResponse`                         |

## 3. GameSession DO 内ハンドラーの共通入り口

```ts
async function handleMessage(playerId: string, msg: ClientMessage) {
  switch (msg.action) {
    case "round_start":
      return this.handleRoundStart(playerId, msg.data);
    case "exclamation_show":
      return this.handleExclamationShow(playerId, msg.data);
    case "player_reaction":
      return this.handlePlayerReaction(playerId, msg.data);
    case "false_start":
      return this.handleFalseStart(playerId, msg.data);
    case "ready_toggle":
      return this.handleReadyToggle(playerId, msg.data);
    case "rematch_request":
      return this.handleRematchRequest(playerId, msg.data);
    case "rematch_response":
      return this.handleRematchResponse(playerId, msg.data);
    default:
      // 想定外のactionはログのみ
  }
}
```

## 4. 主なバリデーションポリシー

- `round_start` / `exclamation_show`
  - 呼び出しプレイヤーが `hostId` であることを確認。違反時は `ServerMessage.type = "error"`。
- `player_reaction` / `false_start`
  - ラウンド中（`inProgress`/`roundInProgress`）のみ受け付ける。
  - 同一プレイヤーからの二重送信は無視し、警告ログ。
- `ready_toggle` / `rematch_*`
  - 対象プレイヤーが current room のメンバーであること。

## 5. 旧ハンドラーとの対応表（抜粋）

| 旧クラス/メソッド                                   | 新DOメソッド                              |
| --------------------------------------------------- | ----------------------------------------- |
| `ServerRoomMessageHandler.handle`（join_room）      | `RoomManager.handleQuickMatchJoin` 等     |
| `ServerRoomMessageHandler.handleCreateRoom`         | `RoomManager.handleCustomRoomCreate`      |
| `ServerGameMessageHandler.handleRoundStart`         | `GameSession.handleRoundStart`            |
| `ServerGameMessageHandler.handleExclamationShow`    | `GameSession.handleExclamationShow`       |
| `ServerGameMessageHandler.handlePlayerReaction`     | `GameSession.handlePlayerReaction`        |
| `ServerGameMessageHandler.handleFalseStart`         | `GameSession.handleFalseStart`            |
| `ReadyMessageHandler.handleReadyToggle`             | `GameSession.handleReadyToggle`           |
| `ReadyMessageHandler.handleRematchRequest`          | `GameSession.handleRematchRequest`        |
| `ReadyMessageHandler.handleRematchResponse`         | `GameSession.handleRematchResponse`       |
