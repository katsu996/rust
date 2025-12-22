## Durable Objects 状態管理設計（Hibernation）

### 1. 目的
- GameSession / RoomManager DO の状態を、Cloudflare Durable Objects の
  - メモリ
  - `state.storage`
を利用して適切に永続化・復元する方針を定義する。

### 2. 永続化対象

#### GameSession
- 必須:
  - `roomId`
  - ルーム設定（`maxWins` / `maxFalseStarts` / `allowFalseStarts` / `maxPlayers`）
  - プレイヤーIDと勝数、FalseStart数
  - 現在のゲーム進行フェーズ（ラウンド中かどうか）
- 非永続（毎回計算or不要）:
  - WebSocketインスタンス
  - 一時的なタイマーID

#### RoomManager
- 必須:
  - すべての `RoomInfo` 一覧
  - `codeToRoomId` マップ
- 非永続:
  - キャッシュ的な統計情報（必要なら再構築）

### 3. 保存タイミング
- GameSession:
  - ラウンド終了時（`round_result` 送信後）
  - ルーム設定変更時
  - プレイヤー入退室時
- RoomManager:
  - 新規ルーム作成時
  - ルーム参加/退出時
  - ルーム削除時

### 4. 復元フロー
- DOインスタンス起動時または最初の `fetch` で:

```ts
const stored = await state.storage.get("session");
if (stored) {
  this.state = { ...this.state, ...stored };
} else {
  // 新規初期化
}
```

### 5. クリーンアップ戦略
- 各ルームに `lastUpdatedAt` を持たせる。
- RoomManager の定期的な GC:
  - `now - lastUpdatedAt > N分` のルームは削除候補。
  - 必要に応じて GameSession 側にも通知/クローズ処理。


