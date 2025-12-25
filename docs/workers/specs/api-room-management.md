## ルーム管理API仕様（WebSocketメッセージ観点）

### 1. 対象メッセージ
- `ClientMessage.action`:
  - `join_room`
  - `create_room`
- `ServerMessage.type`:
  - `room_joined`
  - `room_created`
  - `player_joined`
  - `player_left`
  - `error`

### 2. join_room

#### リクエスト
- action: `"join_room"`
- data:
  - `matchType`: `"quick"` or `"custom"` or `undefined`（レガシー）
  - `roomCode?`: カスタムルーム参加用コード
  - `roomId?`: レガシー用（指定なければデフォルト）
  - `playerName?`: プレイヤー名

#### 処理概要
1. RoomManager DO が `matchType` に応じて
   - quick: quick match ルームを検索/作成
   - custom: `roomCode` に対応するルームに参加
   - legacy: `roomId` 指定 or デフォルトルーム
2. GameSession DO に参加イベントを伝達
3. `room_joined` / `player_joined` を送り返す

#### 成功レスポンス例

```json
{
  "type": "room_joined",
  "roomId": "room-123",
  "playerId": "p1",
  "playerCount": 2,
  "isHost": true,
  "roomPlayers": [/* ... */]
}
```

### 3. create_room

#### リクエスト
- action: `"create_room"`
- data:
  - `playerName`
  - `customRoomSettings`:
    - `maxWins`
    - `maxFalseStarts`
    - `allowFalseStarts`
    - `maxPlayers`

#### 処理概要
1. RoomManager DO が新規ルームIDと roomCode を生成
2. GameSession DO を初期化し、ホストとしてプレイヤーを参加させる
3. `room_created` を送り返し、クライアントは続けて `join_room` or 直接 `/ws?roomId=...` 接続

#### 成功レスポンス例

```json
{
  "type": "room_created",
  "roomCode": "1234"
}
```


