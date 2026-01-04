# GameSession Durable Object 設計

## 1. 目的

- 1つの対戦ルーム（ゲームセッション）単位で
  - WebSocket接続
  - ゲーム状態（ラウンド・反応・勝敗）
  - Ready状態・カウントダウン・再戦
を集中管理する。

## 2. データ構造（概念）

```ts
interface PlayerConnection {
  ws: WebSocket;
  name: string;
  rating: number;
}

interface GameSessionState {
  roomId: string;
  players: Map<string, PlayerConnection>;
  gameState: {
    inProgress: boolean;
    hostId: string | null;
    reactions: Map<string, number>; // reactionFrames
    readyByPlayerId: Map<string, boolean>;
    countdownStarted: boolean;
  };
  settings: {
    maxWins: number;
    maxFalseStarts: number;
    allowFalseStarts: boolean;
    maxPlayers: number;
  };
}
```

## 3. 公開メソッド（DO fetch 内で使用）

- `handleWebSocketConnect(playerId, ws)`
  - 新規WS接続時に呼び出し、`players` に登録。
- `handleMessage(playerId, clientMessage)`
  - `ClientMessage.action` に応じて、下記の個別ハンドラへ委譲:
    - `handleJoinRoom`
    - `handleRoundStart`
    - `handleExclamationShow`
    - `handlePlayerReaction`
    - `handleFalseStart`
    - `handleReadyToggle`
    - `handleRematchRequest`
    - `handleRematchResponse`
- `handleDisconnect(playerId)`
  - プレイヤー切断時のルームからの削除・ホスト交代など。

## 4. 主なアクション処理

- `join_room`:
  - RoomManager DO から呼び出される前提 or 自身で簡易対応。
  - `roomPlayers` 更新、`room_joined` / `player_joined` 送信。
- `round_start`:
  - ホストのみ許可。
  - `gameState.inProgress = true`、既存 reactions クリア。
  - `round_start` メッセージを全員に送信。
- `exclamation_show`:
  - ホストのみ許可。
  - `exclamation_show` を全員へブロードキャスト。
- `player_reaction` / `false_start`:
  - `reactions` マップ更新。
  - RoundService 相当のロジックに委譲して勝敗確定→`round_result`。
- Ready/Rematch:
  - `ready_toggle` で Readyテーブル更新。
  - 全員Ready時にカウントダウン開始。
  - `rematch_*` は新ラウンド開始条件に利用。

## 5. ブロードキャストユーティリティ

```ts
function broadcast(message: ServerMessage, excludePlayerId?: string) {
  for (const [playerId, conn] of this.state.players) {
    if (playerId === excludePlayerId) continue;
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  }
}
```

## 6. Hibernation連携

- `state.storage.put("session", serializableState)` で
  - `roomId`
  - `settings`
  - 勝敗カウンタ
  - `readyByPlayerId`
などを定期的に永続化。
- `constructor` / `fetch` の最初で `storage.get` し、必要な状態を復元。
