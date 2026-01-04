# RoomManager Durable Object 設計

## 1. 目的
- ルーム単位ではなく、**マッチング/ルーム一覧**を管理する集中コンポーネント。
- 主な責務:
  - クイックマッチ用ルームの検索・作成
  - カスタムルームの作成・参加
  - ルーム削除・ガベージコレクション（必要であれば）

### 2. データ構造（概念）

```ts
interface RoomInfo {
  roomId: string;
  code?: string; // カスタムルーム用コード
  matchType: "quick" | "custom";
  playerIds: Set<string>;
  settings: {
    maxWins: number;
    maxFalseStarts: number;
    allowFalseStarts: boolean;
    maxPlayers: number;
  };
}

interface RoomManagerState {
  rooms: Map<string, RoomInfo>;
  codeToRoomId: Map<string, string>;
}
```

## 3. 公開メソッド
- `handleQuickMatchJoin(playerId): Promise<{ roomId: string }>`
  - 空きのある quick match ルームを探し、無ければ新規作成。
- `handleCustomRoomCreate(playerId, settings): Promise<{ roomId: string; roomCode: string }>`
  - 新規ルーム作成 + カスタム設定保存 + 一意な roomCode 発行。
- `handleCustomRoomJoin(playerId, roomCode): Promise<{ roomId: string } | Error>`
  - `roomCode` から roomId を引き、参加条件を満たしていれば参加許可。
- `handleRoomLeave(playerId, roomId)`
  - ルームからプレイヤーを削除し、空になったらルームをクリーンアップ。

### 4. GameSession DO との連携
- RoomManager は「ルームのメタ情報とプレイヤー割り当て」を管理し、
  実際のゲーム処理は GameSession DO に委譲する。
- 例:
  - quick match:
    1. RoomManager: `handleQuickMatchJoin` → `roomId` 決定
    2. クライアント: `roomId` を保持したまま `/ws?roomId=...` に接続
    3. GameSession: `roomId` に紐づく DO でゲームロジックを実行

## 5. Hibernation/ストレージ
- `RoomManagerState` 全体を定期的に `state.storage.put("rooms", ...)` で保存。
- 長期間使用されていないルーム（最終更新時刻から一定時間経過）は
  - ガベージコレクタ的な処理で削除候補にする。


