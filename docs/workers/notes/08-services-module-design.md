# 08 サービス層ロジックの切り出し設計メモ

このファイルは、`docs/workers/todo-rust-migration.md` の「2. Rust Worker / DO 側のAPI・責務設計」の  
**サービス層ロジックの切り出し**に対応する詳細メモです。

## 2.4 サービス層ロジックの切り出し方針

現在のNode.jsサーバー側には以下の3つのサービスクラスが存在し、それぞれが特定の責務を持っています：

- **GameService**: 反応検証・勝敗判定
- **RoundService**: 結果送信・ラウンドリセット
- **CountdownService**: Ready完了後のカウントダウン

これらを GameSession DO 内のモジュールとして再設計し、外部依存（`PlayerManager`、`RoomManager` など）を DO の内部状態に置き換えます。

---

## 8.1 既存サービス層の責務整理

### 8.1.1 GameService の責務

**ファイル**: `src/server/services/GameService.ts`

**主なメソッド**:
- `validateReactions(room: Room)`: 反応時間データを検証し、反応時間の昇順でソート
- `calculateRoundResult(reactions)`: ラウンド結果を計算（勝者決定・引き分け判定）
- `getPlayerPerspectiveResult(roundResult, playerId)`: プレイヤー視点の結果を取得
- `getWinCounts(room, playerId)`: プレイヤーと対戦相手の勝利数を取得
- `updatePlayerWins(winnerPlayerId)`: プレイヤーの勝利数を更新

**依存関係**:
- `PlayerManager`: プレイヤー情報の取得・更新

**DO内での再設計**:
- DO の内部状態（`state.winsByPlayerId`、`state.reactions`）を直接操作
- `PlayerManager` への依存を削除し、DO の状態管理に統合

### 8.1.2 RoundService の責務

**ファイル**: `src/server/services/RoundService.ts`

**主なメソッド**:
- `determineRoundWinner(room, roomId)`: ラウンド勝者を決定し、結果を送信
- `sendRoundResults(room, roundResult)`: ラウンド結果を全プレイヤーに送信
- `resetRoundState(room, roomId, winnerPlayerId)`: ラウンド状態をリセット
- `isGameOver(room, roomId)`: ゲーム終了判定（`maxWins` 到達チェック）
- `scheduleNextRound(roomId)`: 次のラウンドを2秒後にスケジュール

**依存関係**:
- `GameService`: 反応検証・勝敗判定
- `PlayerManager`: プレイヤー情報の取得
- `RoomManager`: ルーム情報の取得
- `sendMessage`: WebSocket送信関数
- `onStartNextRound`: 次のラウンド開始コールバック（`CountdownService.startCountdown`）

**DO内での再設計**:
- DO の内部状態（`state.winsByPlayerId`、`state.reactions`、`state.settings.maxWins`）を直接操作
- `GameService` のロジックを DO 内のモジュール関数として統合
- `sendMessage` / `broadcast` を DO の内部メソッドに置き換え
- `onStartNextRound` を DO 内の `startCountdown()` 呼び出しに置き換え

### 8.1.3 CountdownService の責務

**ファイル**: `src/server/services/CountdownService.ts`

**主なメソッド**:
- `startCountdown(roomId)`: カウントダウンを開始（3秒）
- `startRoundTiming(roomId, room)`: ラウンドタイミングを開始（`ROUND_START` → `EXCLAMATION_SHOW`）
- `reassignHostAndStartRound(roomId, room)`: ホストを再割り当てしてラウンド開始
- `isGameOver(room, roomId)`: ゲーム終了判定（`maxWins` 到達チェック）

**依存関係**:
- `RoomManager`: ルーム情報の取得
- `PlayerManager`: プレイヤー情報の取得（`isGameOver` 内で使用）
- `broadcastToRoom`: ルーム全体へのブロードキャスト関数

**DO内での再設計**:
- DO の内部状態（`state.countdownStarted`、`state.roundInProgress`、`state.hostId`）を直接操作
- `broadcastToRoom` を DO の内部 `broadcast()` メソッドに置き換え
- タイマー管理を DO 内で行う（Hibernation API との整合性に注意）

---

## 8.2 GameSession DO 内モジュール設計

### 8.2.1 モジュール構造案

GameSession DO 内で、以下のようなモジュール構造を想定：

```typescript
// GameSession DO 内の構造（概念）

export class GameSession {
  // 状態管理
  private state: GameSessionState;
  
  // モジュール関数（静的またはインスタンスメソッドとして実装）
  
  // === GameService 相当 ===
  private validateReactions(): [string, PlayerReactionData][]
  private calculateRoundResult(reactions): { result: RoundResult; winnerPlayerId: string | null }
  private getPlayerPerspectiveResult(roundResult, playerId): RoundResult
  private getWinCounts(playerId): { playerWins: number; opponentWins: number }
  private updatePlayerWins(winnerPlayerId: string | null): void
  
  // === RoundService 相当 ===
  private determineRoundWinner(): void
  private sendRoundResults(roundResult): void
  private resetRoundState(winnerPlayerId: string | null): void
  private isGameOver(): boolean
  private scheduleNextRound(): void
  
  // === CountdownService 相当 ===
  private startCountdown(): void
  private startRoundTiming(): void
  private reassignHostAndStartRound(): void
  
  // === 共通ユーティリティ ===
  private broadcast(msg: ServerMessage, exclude?: string): void
  private sendTo(playerId: string, msg: ServerMessage): void
}
```

### 8.2.2 状態管理の統合

**既存の依存関係を DO の状態に置き換え**:

| 既存依存 | DO内での置き換え |
|---------|----------------|
| `PlayerManager.getPlayer(playerId)` | `state.players.get(playerId)` または `state.winsByPlayerId.get(playerId)` |
| `PlayerManager.incrementPlayerWins(playerId)` | `state.winsByPlayerId.set(playerId, (state.winsByPlayerId.get(playerId) ?? 0) + 1)` |
| `RoomManager.getRoom(roomId)` | `this.state`（DO 自体が1ルームを表す） |
| `room.gameState.playerReactions` | `state.reactions` |
| `room.gameState.readyPlayers` | `state.readyByPlayerId` |
| `room.gameState.countdownStarted` | `state.countdownStarted` |
| `room.gameState.roundInProgress` | `state.roundInProgress` |
| `room.customSettings.maxWins` | `state.settings.maxWins` |
| `room.players` | `state.players.keys()` |

### 8.2.3 メッセージ送信の統合

**既存の送信関数を DO の内部メソッドに置き換え**:

| 既存関数 | DO内での置き換え |
|---------|----------------|
| `sendMessage(ws, msg)` | `this.sendTo(playerId, msg)` |
| `broadcastToRoom(roomId, msg, excludeId?)` | `this.broadcast(msg, excludeId)` |

**実装例**:

```typescript
private broadcast(msg: ServerMessage, exclude?: string): void {
  for (const [playerId, connection] of this.state.players.entries()) {
    if (playerId === exclude) continue;
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(msg));
    }
  }
}

private sendTo(playerId: string, msg: ServerMessage): void {
  const connection = this.state.players.get(playerId);
  if (connection?.ws.readyState === WebSocket.OPEN) {
    connection.ws.send(JSON.stringify(msg));
  }
}
```

### 8.2.4 タイマー管理とHibernation API

**注意点**:
- DO が Hibernation 状態に入ると、タイマー（`setTimeout`）は失われる
- カウントダウンやラウンドタイミングは、DO がアクティブな間のみ有効

**方針**:
1. **カウントダウン開始時**: `state.countdownStarted = true` を永続化し、タイマーを開始
2. **Hibernation 復帰時**: `state.countdownStarted` を確認し、必要に応じて再開
3. **タイマーIDの管理**: DO がアクティブな間のみ有効なため、永続化不要

**実装例**:

```typescript
private startCountdown(): void {
  if (this.state.countdownStarted) return;
  if (this.isGameOver()) return;
  
  this.state.countdownStarted = true;
  // 永続化（必要に応じて）
  this.ctx.storage.put({ countdownStarted: true });
  
  this.broadcast({
    type: ServerMessageType.COUNTDOWN_START,
    countdownValue: 3,
  });
  
  // タイマーは非永続（DO がアクティブな間のみ有効）
  setTimeout(() => {
    this.state.countdownStarted = false;
    this.state.roundInProgress = true;
    this.state.reactions.clear();
    this.startRoundTiming();
  }, 3000);
}
```

---

## 8.3 モジュール間の呼び出しフロー

### 8.3.1 ラウンド開始から結果送信まで

```
1. handleReadyToggle() → 全員Ready確認
2. → startCountdown() (CountdownService相当)
3. → 3秒後: startRoundTiming() (CountdownService相当)
4. → broadcast(ROUND_START)
5. → waitTime後: broadcast(EXCLAMATION_SHOW)
6. → handlePlayerReaction() → 反応受信
7. → determineRoundWinner() (RoundService相当)
8. → validateReactions() (GameService相当)
9. → calculateRoundResult() (GameService相当)
10. → updatePlayerWins() (GameService相当)
11. → sendRoundResults() (RoundService相当)
12. → resetRoundState() (RoundService相当)
13. → isGameOver() チェック
14. → ゲーム継続の場合: scheduleNextRound() → startCountdown() へ戻る
```

### 8.3.2 ゲーム終了判定の統合

**現在**: `RoundService.isGameOver()` と `CountdownService.isGameOver()` が重複実装

**DO内**: 1つの `isGameOver()` メソッドに統合

```typescript
private isGameOver(): boolean {
  const playerIds = Array.from(this.state.players.keys());
  if (playerIds.length < 2) return false;
  
  const maxWins = this.state.settings.maxWins;
  const wins = playerIds.map(id => this.state.winsByPlayerId.get(id) ?? 0);
  const maxCurrentWins = wins.length ? Math.max(...wins) : 0;
  
  return maxCurrentWins >= maxWins;
}
```

---

## 8.4 実装時の注意点

### 8.4.1 状態の永続化範囲

**永続化が必要な状態**:
- `state.winsByPlayerId`: ゲーム終了判定に必要
- `state.settings.maxWins`: ゲーム終了判定に必要
- `state.falseStartsByPlayerId`: お手つきカウント（将来拡張用）

**永続化が不要な状態**:
- `state.reactions`: ラウンドごとにリセット
- `state.readyByPlayerId`: ラウンドごとにリセット
- `state.countdownStarted`: タイマーと連動（DO がアクティブな間のみ有効）
- `state.roundInProgress`: ラウンドごとにリセット

### 8.4.2 エラーハンドリング

各モジュール関数内で、以下のエラーケースを考慮：

- **プレイヤー不在**: `state.players.get(playerId)` が `undefined` の場合
- **WebSocket切断**: `ws.readyState !== WebSocket.OPEN` の場合
- **状態不整合**: `state.reactions.size === 0` で `determineRoundWinner()` が呼ばれた場合

### 8.4.3 ログ出力

既存のサービス層では `logger` を使用していますが、DO 内では Cloudflare Workers のログ機能を使用：

```typescript
// 既存
logger.info("Calculating round result", { fastestPlayerId, ... });

// DO内
console.log("[GameSession] Calculating round result", { fastestPlayerId, ... });
```

---

## 8.5 まとめ

- **GameService**: 反応検証・勝敗判定ロジックを DO 内のメソッドに統合
- **RoundService**: 結果送信・ラウンドリセット・ゲーム終了判定を DO 内のメソッドに統合
- **CountdownService**: カウントダウン・ラウンドタイミングを DO 内のメソッドに統合
- **外部依存の削除**: `PlayerManager`、`RoomManager` への依存を DO の内部状態に置き換え
- **タイマー管理**: Hibernation API との整合性を考慮した実装
- **状態永続化**: 必要な状態のみ `state.storage` に永続化

これらのモジュール関数は、GameSession DO のメッセージハンドラー（`handleRoundStart`、`handlePlayerReaction` など）から呼び出されます。

