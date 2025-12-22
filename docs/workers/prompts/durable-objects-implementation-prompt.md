# Durable Objects 実装プロンプト（AI向け）

## コンテキスト

- GameSession / RoomManager Durable Object を実装し、既存の WebSocket メッセージプロトコルをサーバ側に移植する。
- 既存の Node.js サーバー（`src/server/` 以下）のロジックを Durable Objects に移行する。
- メッセージ形式（`ClientMessage` / `ServerMessage`）は既存の型定義に準拠する。

## 事前に読むべき設計書

### GameSession DO 関連
- `docs/workers/design/durable-objects-gamesession.md` - GameSession DO の基本設計
- `docs/workers/design/durable-objects-message-handlers.md` - メッセージハンドラーの設計
- `docs/workers/design/durable-objects-services.md` - サービス層の設計
- `docs/workers/design/durable-objects-state-management.md` - 状態管理の設計
- `docs/workers/specs/api-game-logic.md` - ゲームロジックの API 仕様
- `docs/workers/specs/api-ready-state.md` - Ready 状態管理の API 仕様
- `docs/workers/specs/api-edge-cases.md` - エッジケースの仕様

### RoomManager DO 関連
- `docs/workers/design/durable-objects-roommanager.md` - RoomManager DO の基本設計
- `docs/workers/specs/api-room-management.md` - ルーム管理の API 仕様

### 参考メモ
- `docs/workers/notes/03-gamesession-design.md` - GameSession DO 設計の詳細メモ
- `docs/workers/notes/04-roommanager-design.md` - RoomManager DO 設計の詳細メモ
- `docs/workers/notes/05-message-mapping.md` - メッセージマッピング表
- `docs/workers/notes/08-services-module-design.md` - サービス層モジュール設計

### 既存コード参照（実装の参考）
- `src/server/SamuraiKirbyServer.ts` - 既存の Node.js サーバー実装
- `src/server/handlers/GameMessageHandler.ts` - ゲームメッセージハンドラー
- `src/server/handlers/RoomMessageHandler.ts` - ルームメッセージハンドラー
- `src/server/handlers/ReadyMessageHandler.ts` - Ready メッセージハンドラー
- `src/server/services/GameService.ts` - ゲームサービス（反応検証・勝敗判定）
- `src/server/services/RoundService.ts` - ラウンドサービス（結果送信・ラウンドリセット）
- `src/server/services/CountdownService.ts` - カウントダウンサービス
- `src/types/network/MessageTypes.ts` - メッセージ型定義（`ClientMessage` / `ServerMessage`）

## 実装タスク

### Phase 2-1: GameSession Durable Object

#### 1. 基本構造の実装
- GameSession DO クラスを作成
- `state.storage` を使ってセッション状態を保持
- Hibernation API に対応した状態管理

#### 2. WebSocket 接続の処理
- `fetch` メソッド内で WebSocket Upgrade リクエストを受信
- `handleWebSocketConnect(playerId, ws)` を実装
- 接続状態を `state.players` に保存

#### 3. メッセージハンドラーの実装
- `handleMessage(playerId, ClientMessage)` を実装
- `ClientMessage.action` に応じて各ハンドラにディスパッチ：
  - `round_start` → `handleRoundStart`
  - `exclamation_show` → `handleExclamationShow`
  - `player_reaction` → `handlePlayerReaction`
  - `false_start` → `handleFalseStart`
  - `ready_toggle` → `handleReadyToggle`
  - `rematch_request` → `handleRematchRequest`
  - `rematch_response` → `handleRematchResponse`

#### 4. サービス層モジュールの実装
既存のサービス層（GameService、RoundService、CountdownService）を DO 内のモジュールとして実装：

- **GameService 相当**:
  - `validateReactions()` - 反応時間データの検証
  - `calculateRoundResult()` - ラウンド結果の計算
  - `getPlayerPerspectiveResult()` - プレイヤー視点の結果取得
  - `getWinCounts()` - 勝利数の取得
  - `updatePlayerWins()` - 勝利数の更新

- **RoundService 相当**:
  - `determineRoundWinner()` - ラウンド勝者の決定と結果送信
  - `sendRoundResults()` - ラウンド結果の送信
  - `resetRoundState()` - ラウンド状態のリセット
  - `isGameOver()` - ゲーム終了判定
  - `scheduleNextRound()` - 次のラウンドのスケジュール

- **CountdownService 相当**:
  - `startCountdown()` - カウントダウンの開始
  - `startRoundTiming()` - ラウンドタイミングの開始
  - `reassignHostAndStartRound()` - ホストの再割り当て

#### 5. ブロードキャストと送信機能
- `broadcast(msg: ServerMessage, exclude?: string)` - 全員への送信
- `sendTo(playerId: string, msg: ServerMessage)` - 個別送信

### Phase 2-2: RoomManager Durable Object

#### 1. 基本構造の実装
- RoomManager DO クラスを作成
- ルーム一覧とコード→IDマップを管理
- `state.storage` を使って状態を永続化

#### 2. quick match の実装
- `handleQuickMatchJoin(playerId, ws)` - quick match ルームの検索・作成・参加
- マッチメイキングロジック（既存の `MatchmakingManager` を参考）

#### 3. カスタムルームの実装
- `handleCustomRoomCreate(playerId, ws, settings)` - カスタムルームの作成
- `handleCustomRoomJoin(playerId, ws, roomCode)` - roomCode による参加
- roomCode の生成と管理

#### 4. ルームのライフサイクル管理
- ルームのクリーンアップ戦略
- プレイヤーが全員退出した際の処理

## メッセージ形式

### ClientMessage（クライアント → サーバー）

```typescript
interface ClientMessage {
  action: ClientMessageAction;
  data?: {
    roomId?: string;
    roomCode?: string;
    reactionFrames?: number;
    waitTime?: number;
    gameStartTime?: number;
    timestamp?: number;
    // ... その他のフィールド
  };
}
```

### ServerMessage（サーバー → クライアント）

```typescript
interface ServerMessage {
  type: ServerMessageType;
  // ... 各種オプショナルフィールド
}
```

詳細は `src/types/network/MessageTypes.ts` を参照。

## 実装の詳細

### 状態管理（Hibernation API）

**永続化が必要な状態**:
- `roomId`, `settings`
- `winsByPlayerId`, `falseStartsByPlayerId`
- 最後のラウンド結果など、再開時に必要な最小限の情報

**永続化が不要な状態**:
- WebSocket インスタンス
- タイマーID
- `reactions`, `readyByPlayerId`（ラウンドごとにリセット）

### タイマー管理

- DO が Hibernation 状態に入ると、タイマー（`setTimeout`）は失われる
- カウントダウンやラウンドタイミングは、DO がアクティブな間のみ有効
- 必要に応じて、タイマー開始時に `state.countdownStarted = true` を永続化

### エラーハンドリング

- プレイヤー不在: `state.players.get(playerId)` が `undefined` の場合
- WebSocket 切断: `ws.readyState !== WebSocket.OPEN` の場合
- 状態不整合: `state.reactions.size === 0` で `determineRoundWinner()` が呼ばれた場合

## テスト観点

### GameSession DO
- [ ] 同じ `roomId` で複数クライアントが接続した際に、単一の DO インスタンスが使用される
- [ ] WebSocket メッセージが正しく処理される
- [ ] 状態が `state.storage` に永続化される
- [ ] `join_room` → `round_start` → `exclamation_show` → `player_reaction` → `round_result` までの基本フローが通る
- [ ] Ready 状態の管理が正しく動作する
- [ ] カウントダウンが正しく動作する
- [ ] Rematch が正しく動作する

### RoomManager DO
- [ ] quick match で適切なルームが検索・作成される
- [ ] カスタムルームの roomCode が正しく管理される
- [ ] ルームのクリーンアップが適切に行われる

## 注意点

- 既存の TypeScript コード（`src/server/` 以下）を参照しながら実装する
- メッセージ形式（`ClientMessage` / `ServerMessage`）は既存の型定義に準拠する
- Hibernation API の動作を理解し、適切に状態を永続化する
- タイマー管理は Hibernation との整合性を考慮する
- エラーハンドリングを適切に実装する


