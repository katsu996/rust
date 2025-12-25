# テストガイド

このドキュメントでは、リアルタイムゲームサーバーのテスト方法を説明します。

## 目次

1. [前提条件](#前提条件)
2. [開発サーバーの起動](#開発サーバーの起動)
3. [WebSocket接続テスト](#websocket接続テスト)
4. [REST APIテスト](#rest-apiテスト)
5. [エンドツーエンドテスト](#エンドツーエンドテスト)
6. [トラブルシューティング](#トラブルシューティング)

## 前提条件

- 開発サーバーが起動していること（`pnpm dev`）
- サーバーは `http://127.0.0.1:8787` で起動していること

## 開発サーバーの起動

```bash
pnpm dev
```

サーバーが正常に起動すると、以下のメッセージが表示されます：

```
⎔ Starting local server...
[wrangler:inf] Ready on http://127.0.0.1:8787
```

## WebSocket接続テスト

### 方法A: テスト用HTMLファイルを使用（推奨）

1. ブラウザで `test-websocket.html` を開く
2. Room IDを入力（例: `test-room`）
3. 「接続」ボタンをクリック
4. 接続が確立されると、サーバーから `connection_established` メッセージが受信されます

**テスト用HTMLファイルの機能:**

- WebSocket接続/切断
- メッセージ送信/受信
- ログ表示
- JSONメッセージの自動解析

### 方法B: ブラウザの開発者コンソールを使用

```javascript
// WebSocket接続
const ws = new WebSocket('ws://127.0.0.1:8787/ws?roomId=test-room');

ws.onopen = () => console.log('✅ 接続確立');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('📨 受信:', data);
};
ws.onerror = (error) => console.error('❌ エラー:', error);
ws.onclose = (event) => console.log('🔌 切断:', event.code);

// メッセージ送信例
ws.send(JSON.stringify({
  action: "ready_toggle",
  data: {}
}));
```

**注意**: ブラウザの開発者コンソールから直接WebSocket接続を試す場合、Content Security Policy (CSP) によりブロックされる場合があります。その場合は `test-websocket.html` を使用してください。

### 方法C: Node.jsスクリプトを使用

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:8787/ws?roomId=test-room');

ws.on('open', () => {
  console.log('✅ 接続確立');
  
  // メッセージ送信
  ws.send(JSON.stringify({
    action: "ready_toggle",
    data: {}
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 受信:', message);
});

ws.on('error', (error) => {
  console.error('❌ エラー:', error);
});

ws.on('close', (code) => {
  console.log('🔌 切断:', code);
});
```

## REST APIテスト

### Quick Match

空きのあるQuick matchルームを検索し、見つからなければ新規作成します。

```bash
curl -X POST http://127.0.0.1:8787/api/quick-match \
  -H "Content-Type: application/json" \
  -d '{"playerId": "player-123"}'
```

**レスポンス例:**

```json
{
  "roomId": "room-1234567890-abc123"
}
```

### カスタムルーム作成

カスタム設定でルームを作成し、roomCodeを発行します。

```bash
curl -X POST http://127.0.0.1:8787/api/create-room \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "player-123",
    "customRoomSettings": {
      "maxWins": 5,
      "maxFalseStarts": 2,
      "allowFalseStarts": true,
      "maxPlayers": 2
    }
  }'
```

**レスポンス例:**

```json
{
  "roomId": "room-1234567890-abc123",
  "roomCode": "1234"
}
```

### カスタムルーム参加

roomCodeを使用してカスタムルームに参加します。

```bash
curl -X POST http://127.0.0.1:8787/api/join-room \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "player-456",
    "roomCode": "1234"
  }'
```

**レスポンス例:**

```json
{
  "roomId": "room-1234567890-abc123"
}
```

**エラーレスポンス例:**

```json
{
  "error": {
    "code": "ROOM_NOT_FOUND",
    "message": "Room not found"
  }
}
```

### ヘルスチェック

```bash
curl http://127.0.0.1:8787/health
```

**レスポンス:** `OK`

## エンドツーエンドテスト

### Quick Matchフロー

1. **ルーム作成/参加**

   ```bash
   curl -X POST http://127.0.0.1:8787/api/quick-match \
     -H "Content-Type: application/json" \
     -d '{"playerId": "player-1"}'
   ```

   レスポンスから `roomId` を取得

2. **WebSocket接続**

   ```javascript
   const ws = new WebSocket('ws://127.0.0.1:8787/ws?roomId=room-123');
   ```

3. **接続確立確認**
   - サーバーから `connection_established` メッセージを受信
   - `isHost: true` が最初のプレイヤーに設定されることを確認

4. **Ready状態の切り替え**

   ```javascript
   ws.send(JSON.stringify({
     action: "ready_toggle",
     data: {}
   }));
   ```

   - サーバーから `ready_status` メッセージを受信

5. **2人目のプレイヤー参加**
   - 別のブラウザ/タブで同じルームに接続
   - サーバーから `player_joined` メッセージを受信

6. **全員Ready時のカウントダウン**
   - 2人ともReady状態になると、自動的にカウントダウン開始
   - サーバーから `countdown_start` メッセージを受信（3, 2, 1）

7. **ラウンド開始**
   - サーバーから `round_start` メッセージを受信
   - `waitTime` と `gameStartTime` が含まれる

8. **反応送信**

   ```javascript
   ws.send(JSON.stringify({
     action: "player_reaction",
     data: {
       reactionFrames: 120
     }
   }));
   ```

9. **結果受信**
   - 全員が反応すると、サーバーから `round_result` メッセージを受信
   - `winnerId`, `reactions`, `winsByPlayerId` が含まれる

10. **リマッチ**

    ```javascript
    ws.send(JSON.stringify({
      action: "rematch_request",
      data: {}
    }));
    ```

    - 全員がリマッチに同意すると、ゲームがリセットされ、新しいラウンドが開始

### カスタムルームフロー

1. **ルーム作成**（プレイヤー1）

   ```bash
   curl -X POST http://127.0.0.1:8787/api/create-room \
     -H "Content-Type: application/json" \
     -d '{"playerId": "player-1", "customRoomSettings": {...}}'
   ```

   `roomCode` を取得（例: `1234`）

2. **ルーム参加**（プレイヤー2）

   ```bash
   curl -X POST http://127.0.0.1:8787/api/join-room \
     -H "Content-Type: application/json" \
     -d '{"playerId": "player-2", "roomCode": "1234"}'
   ```

3. **WebSocket接続**（両プレイヤー）

   ```javascript
   // プレイヤー1
   const ws1 = new WebSocket('ws://127.0.0.1:8787/ws?roomId=room-123');
   
   // プレイヤー2
   const ws2 = new WebSocket('ws://127.0.0.1:8787/ws?roomId=room-123');
   ```

4. **以降はQuick Matchフローと同じ**

## トラブルシューティング

### WebSocket接続エラー

**問題**: `WebSocket接続エラー` または `コード: 1006`

**解決策:**

1. 開発サーバーが起動していることを確認
2. `roomId` が正しく指定されていることを確認
3. `test-websocket.html` を使用してテスト（CSPの問題を回避）

### Origin検証エラー

**問題**: `Invalid origin: null`

**解決策:**

- 開発環境では `null` origin（`file://` プロトコル）が許可されています
- ブラウザの開発者コンソールから接続する場合は、`test-websocket.html` を使用してください

### Durable Object bindingエラー

**問題**: `Failed to get GAME_SESSION namespace: RustError("Binding GAME_SESSION is undefined.")`

**解決策:**

1. `wrangler.toml` に Durable Objects の binding が正しく設定されていることを確認
2. 開発サーバーを再起動

### TypeScript型エラー

**問題**: `error TS2304: Cannot find name 'Env'`

**解決策:**

```bash
pnpm build:ts
```

で型エラーを確認し、修正してください。

### Rustコンパイルエラー

**問題**: コンパイルエラーが発生する

**解決策:**

```bash
cargo check --target wasm32-unknown-unknown
```

でエラーを確認し、修正してください。

## テストチェックリスト

- [ ] 開発サーバーが正常に起動する
- [ ] ヘルスチェックエンドポイントが動作する
- [ ] Quick Match APIが正常に動作する
- [ ] カスタムルーム作成APIが正常に動作する
- [ ] カスタムルーム参加APIが正常に動作する
- [ ] WebSocket接続が確立される
- [ ] 最初のプレイヤーがホストになる
- [ ] 2人目のプレイヤーが参加できる
- [ ] Ready状態の切り替えが動作する
- [ ] 全員Ready時にカウントダウンが開始される
- [ ] ラウンド開始メッセージが送信される
- [ ] プレイヤーの反応が正しく処理される
- [ ] ラウンド結果が正しく計算される
- [ ] リマッチ機能が動作する
