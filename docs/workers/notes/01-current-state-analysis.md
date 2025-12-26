# 01 現状把握メモ（TypeScript実装）

このファイルは、`docs/workers/todo-rust-migration.md` の「1. 現状把握・整理」に対応する詳細な調査メモです。

## 1.1 クライアント側WebSocket使用箇所

- `src/network/WebSocketClient.ts`
  - 単一 WebSocket 接続を管理する薄いラッパークラス。
  - `connect` / `disconnect` / `sendMessage` / `onMessage` / `onConnectionChange` を提供。
- `src/network/WebSocketConnection.ts`
  - 再接続ロジック・メッセージキュー・ACK待ちなど、接続のライフサイクル管理を担当。
  - `MessageEnvelope` 形式で送信し、サーバーからの `"ack"` を処理。
- `src/network/WebSocketPoolAdapter.ts`
  - 複数 WebSocket をプールして使うためのアダプター。
  - 実際には 1 接続で足りる構成にリファクタリング可能。
- `src/network/WebSocketPoolManager.ts`
  - プールされた WebSocket 接続の生成と再利用を管理。
- `src/game/services/WebSocketConnectionService.ts`
  - ゲーム全体としての「接続中/切断中/再接続中」状態を抽象化して GameState に反映。
- `src/game/services/WebSocketMessageService.ts`
  - `ServerMessageType` ごとに `WebSocketHandler` を通してハンドラを登録する。
  - `CONNECTION_ESTABLISHED` / `ERROR` は特別扱い。
- `src/game/SamuraiKirby.ts`
  - `getWebSocketUrl` で接続先を決定。
  - `createWebSocketClient` を呼び出してクライアントインスタンスを生成し、上記サービスへ渡す。

## 1.2 サーバー側WebSocketロジック

- `src/server/SamuraiKirbyServer.ts`
  - Node.js + `ws` による WebSocket サーバのエントリーポイント。
  - 接続受付、`playerId` の採番、`MessageRouter` による `ClientMessage.action` のルーティング。
  - ルーム参加/離脱 (`joinRoom` / `leaveRoom`)、ルーム内ブロードキャスト (`broadcastToRoom`) を提供。
- `src/server/handlers/GameMessageHandler.ts`
  - `round_start` / `exclamation_show` / `player_reaction` / `false_start` の処理。
  - 反応タイムアウトの管理と、RoundService への勝敗判定トリガー。
- `src/server/handlers/RoomMessageHandler.ts`
  - `join_room` / `create_room` の処理。
  - MatchmakingManager と RoomManager を使って quick/custom ルームへ割り当て。
- `src/server/handlers/ReadyMessageHandler.ts`
  - `ready_toggle` / `rematch_request` / `rematch_response` の処理。
  - Ready 状態集計と CountdownService へのカウントダウントリガー。
- `src/server/services/RoundService.ts`
  - 勝敗判定結果を各プレイヤー視点に変換し、`round_result` を送信。
  - ラウンド終了後の状態リセットと、次ラウンド開始トリガー。
- `src/server/services/CountdownService.ts`
  - Ready 完了後のカウントダウン開始・完了時のラウンド開始。
  - ゲーム終了条件のチェックも兼ねる。
- `src/server/services/GameService.ts`
  - 反応時間の検証、勝敗判定ロジック、勝数更新ロジックを提供。
- `src/server/managers/RoomManager.ts`
  - ルームの生成・取得・削除、ルーム内プレイヤー管理、`room_joined` / `player_joined` / `player_left` 送信を担当。
- `src/server/managers/PlayerManager.ts`
  - プレイヤーの登録・削除・名称設定・勝数/FalseStart数/反応時間などの管理。
- `src/server/managers/MatchmakingManager.ts`
  - quick match と custom room 用のマッチメイキングロジック（roomId 決定、エラー理由生成）。

## 1.3 メッセージ種別と流れ

### Client → Server (`ClientMessage.action`)

- `join_room` : ルーム参加要求（quick/custom/legacy）。
- `create_room` : カスタムルーム作成要求。
- `round_start` : ホストによるラウンド開始。
- `exclamation_show` : ホストによる感嘆符表示トリガー。
- `player_reaction` : プレイヤーの反応フレーム送信。
- `false_start` : お手つき通知。
- `ready_toggle` : Ready 状態トグル。
- `rematch_request` : 再戦リクエスト。
- `rematch_response` : 再戦の受諾/拒否。

### Server → Client (`ServerMessage.type`)

- `connection_established` : 接続確立と `playerId` 付与。
- `room_joined` : ルーム参加完了通知、現在のプレイヤー数など。
- `player_joined` : 他プレイヤー参加通知。
- `player_left` : プレイヤー離脱通知。
- `round_start` : ラウンド開始タイミング通知（待機時間・開始時刻）。
- `exclamation_show` : 感嘆符表示タイミング通知。
- `player_reaction` : （必要な場合）他プレイヤーの反応情報。
- `false_start` : お手つき発生通知。
- `round_result` : ラウンド結果（勝敗/勝数/全員の勝数マップ）。
- `opponent_info` / `opponent_found` : 対戦相手情報（名前/レーティング/マッチング完了）。
- `ready_status` : 全プレイヤーの Ready 状態一覧。
- `countdown_start` : カウントダウン開始通知。
- `rematch_request` / `rematch_response` : 再戦リクエスト/レスポンスの転送。
- `room_created` : カスタムルーム作成完了通知（roomCode 等）。
- `error` : エラー通知（メッセージ文字列を含む）。


