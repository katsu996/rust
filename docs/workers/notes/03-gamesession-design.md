# 03 GameSession Durable Object 設計メモ

このファイルは、`docs/workers/todo-rust-migration.md` の「2. Rust Worker / DO 側のAPI・責務設計」の  
**GameSession DO の責務定義**に対応する詳細メモです。

## 2.2 GameSession DO の責務（整理）

- 1ルーム（1ゲームセッション）単位で以下を管理する:
  - 参加プレイヤーとその WebSocket 接続
  - ゲーム進行状態（ラウンド中か／Ready 状態／勝敗カウンタなど）
  - ラウンド開始・感嘆符表示・反応・お手つき・結果送信
  - Ready 状態・カウントダウン・Rematch
- 外部（Rust Worker / RoomManager）とのインターフェース:
  - WebSocket Upgrade 後のメッセージ処理
  - 必要に応じてルームメタ情報を RoomManager DO と共有（将来）

## 3.1 状態モデル（概念）

```ts
interface PlayerConnection {
  ws: WebSocket;
  name: string;
  rating: number;
}

interface GameSessionState {
  roomId: string;
  players: Map<string, PlayerConnection>;
  hostId: string | null;
  inProgress: boolean;
  reactions: Map<string, number>;
  readyByPlayerId: Map<string, boolean>;
  countdownStarted: boolean;
  winsByPlayerId: Map<string, number>;
  falseStartsByPlayerId: Map<string, number>;
  settings: {
    maxWins: number;
    maxFalseStarts: number;
    allowFalseStarts: boolean;
    maxPlayers: number;
  };
}
```

DO 内では上記に近い構造を `state` として持ち、必要な部分のみ `state.storage` に永続化する。

## 3.2 主なメソッド案

- 接続関連:
  - `handleWebSocketConnect(playerId: string, ws: WebSocket)`
  - `handleDisconnect(playerId: string)`
- メッセージ入口:
  - `handleMessage(playerId: string, msg: ClientMessage)`
    - `switch` で各アクションへディスパッチ。
- 各アクション処理:
  - `handleRoundStart(playerId, data)`
  - `handleExclamationShow(playerId, data)`
  - `handlePlayerReaction(playerId, data)`
  - `handleFalseStart(playerId, data)`
  - `handleReadyToggle(playerId, data)`
  - `handleRematchRequest(playerId, data)`
  - `handleRematchResponse(playerId, data)`

## 3.3 ブロードキャストと単発送信

- 全員送信:

```ts
function broadcast(msg: ServerMessage, exclude?: string) { /* ... */ }
```

- 個別送信:

```ts
function sendTo(playerId: string, msg: ServerMessage) { /* ... */ }
```

`ServerMessage.type` ごとの送信タイミングは `docs/workers/specs/api-*.md` に準拠する。

## 3.4 Hibernationとの関係

- 永続化対象:
  - `roomId`, `settings`
  - `winsByPlayerId`, `falseStartsByPlayerId`
  - 最後のラウンド結果など、再開時に必要な最小限の情報
- 非永続:
  - WebSocket インスタンス
  - タイマーID

GameSession DO が再起動された場合は、`storage` から状態を読み出しつつ、  
新規接続プレイヤーに対しては「現在のスコア・設定・必要なら直前の結果」などを再送することで  
UX の連続性を保つ想定。  

