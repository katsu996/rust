# 05 メッセージマッピング・移行仕様メモ

このファイルは、`docs/workers/todo-rust-migration.md` の「3. メッセージマッピングと移行仕様」に対応する詳細メモです。

## 3.1 ClientMessage.action → DOメソッド対応

| action             | 現行処理（TS / Node）                                         | 移行後処理（Workers / DO）                                      |
|--------------------|--------------------------------------------------------------|------------------------------------------------------------------|
| `join_room`        | `ServerRoomMessageHandler.handle` → quick/custom/legacy      | `RoomManager.handleQuickMatchJoin` / `handleCustomRoomJoin`     |
| `create_room`      | `ServerRoomMessageHandler.handleCreateRoom`                  | `RoomManager.handleCustomRoomCreate`                            |
| `round_start`      | `ServerGameMessageHandler.handleRoundStart`                  | `GameSession.handleRoundStart`                                  |
| `exclamation_show` | `ServerGameMessageHandler.handleExclamationShow`             | `GameSession.handleExclamationShow`                             |
| `player_reaction`  | `ServerGameMessageHandler.handlePlayerReaction`              | `GameSession.handlePlayerReaction`                              |
| `false_start`      | `ServerGameMessageHandler.handleFalseStart`                  | `GameSession.handleFalseStart`                                  |
| `ready_toggle`     | `ReadyMessageHandler.handleReadyToggle`                      | `GameSession.handleReadyToggle`                                 |
| `rematch_request`  | `ReadyMessageHandler.handleRematchRequest`                   | `GameSession.handleRematchRequest`                              |
| `rematch_response` | `ReadyMessageHandler.handleRematchResponse`                  | `GameSession.handleRematchResponse`                             |

## 3.2 ServerMessage.type → 送信元DO対応

| type                   | 現行送信元                              | 移行後送信元                  |
|------------------------|-----------------------------------------|------------------------------|
| `connection_established` | `SamuraiKirbyServer.handleNewConnection` | `GameSession.handleWebSocketConnect` |
| `room_joined`          | `RoomManager.sendRoomJoinedConfirmation` | `GameSession` / `RoomManager`       |
| `player_joined`        | `RoomManager.notifyExistingPlayers`      | `GameSession`                        |
| `player_left`          | `SamuraiKirbyServer.leaveRoom`           | `GameSession.handleDisconnect`      |
| `round_start`          | `ServerGameMessageHandler.handleRoundStart` | `GameSession.handleRoundStart`   |
| `exclamation_show`     | `ServerGameMessageHandler.handleExclamationShow` | `GameSession.handleExclamationShow` |
| `player_reaction`      | （必要に応じて）`ServerGameMessageHandler` | `GameSession`                   |
| `false_start`          | `ServerGameMessageHandler.handleFalseStart` | `GameSession.handleFalseStart` |
| `round_result`         | `RoundService.sendRoundResults`          | `GameSession.sendRoundResults`      |
| `opponent_info`        | 既存サーバーロジック                     | `GameSession`                        |
| `opponent_found`       | 既存サーバーロジック                     | `GameSession` / `RoomManager`       |
| `ready_status`         | `ReadyMessageHandler`                    | `GameSession`                        |
| `countdown_start`      | `CountdownService.startCountdown`        | `GameSession.startCountdown`        |
| `rematch_request`      | `ReadyMessageHandler`                    | `GameSession`                        |
| `rematch_response`     | `ReadyMessageHandler`                    | `GameSession`                        |
| `room_created`         | `ServerRoomMessageHandler.handleCreateRoom` | `RoomManager.handleCustomRoomCreate` |
| `error`                | 各ハンドラ（Server全般）                | Workers / DO 双方                  |

## 3.3 エッジケースの扱い（概要）

- 重複 `player_reaction`:
  - 現行: 2回目以降は警告ログを出して無視。
  - 移行後: GameSession DO でも同様に無視し、ログに残す。
- ラウンド外での `player_reaction` / `false_start`:
  - 現行: `error` メッセージ返却。
  - 移行後: `ServerMessage.type = "error"` を返しつつ、内部状態は変更しない。
- Ready 状態が揃わないまま一定時間経過:
  - 現行: 明示的なタイムアウトは薄い。
  - 移行後: Countdown/GC設計と合わせて、将来的に仕様追加候補として docs/future に切り出す。


