# 04 RoomManager Durable Object 設計メモ

このファイルは、`docs/workers/todo-rust-migration.md` の「2. Rust Worker / DO 側のAPI・責務設計」の  
**RoomManager DO の責務定義**に対応する詳細メモです。

## 2.3 RoomManager DO の責務（整理）

- 全体の「ルーム一覧」と「マッチング状態」を管理する。
- 主な役割:
  - quick match 用のルームを見つける or 作成する。
  - custom room の作成（roomCode 発行）と参加受付。
  - 空になったルームのクリーンアップ。

## 4.1 状態モデル（概念）

```ts
interface RoomInfo {
  roomId: string;
  code?: string; // カスタムルームコード
  matchType: "quick" | "custom";
  playerIds: Set<string>;
  settings: {
    maxWins: number;
    maxFalseStarts: number;
    allowFalseStarts: boolean;
    maxPlayers: number;
  };
  lastUpdatedAt: number;
}

interface RoomManagerState {
  rooms: Map<string, RoomInfo>;
  codeToRoomId: Map<string, string>;
}
```

## 4.2 公開メソッド案

- quick match 関連:
  - `findOrCreateQuickMatchRoom(): string`  
    - 参加可能な quick ルームを探し、無ければ新規作成して roomId を返す。
- custom room 関連:
  - `createCustomRoom(playerId, settings): { roomId: string; roomCode: string }`
  - `joinCustomRoom(playerId, roomCode): { success: boolean; roomId?: string; error?: string }`
- 共通:
  - `leaveRoom(playerId, roomId)`
  - `cleanupStaleRooms()`（定期的 or 明示呼び出しでGC）

## 4.3 GameSession DO との連携

- RoomManager 自体は WebSocket を直接扱わず、
  - `roomId` の割り当て
  - カスタム設定の決定
だけを行う。
- クライアントフローの例:
  1. `join_room` / `create_room` で RoomManager に問い合わせ。
  2. レスポンスとして `roomId` / `roomCode` を受け取る。
  3. クライアントはその `roomId` をクエリに付けて `/ws` に接続。
  4. GameSession DO が実際のゲーム処理を担当。

## 4.4 HibernationとGC

- `rooms` / `codeToRoomId` を `state.storage` に保存する。
- `cleanupStaleRooms` で
  - `now - lastUpdatedAt > 閾値` のルームを削除候補にする。
  - 将来的には GameSession DO 側と連携して、対応するセッションも終了させる。


