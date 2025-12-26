## Ready状態・Rematch API仕様

### 1. 対象メッセージ
- `ClientMessage.action`:
  - `ready_toggle`
  - `rematch_request`
  - `rematch_response`
- `ServerMessage.type`:
  - `ready_status`
  - `countdown_start`
  - `rematch_request`
  - `rematch_response`
  - `error`

### 2. ready_toggle

#### リクエスト
- action: `"ready_toggle"`
- data:
  - `isReady`: `true` or `false`

#### 処理
- GameSession DO:
  - `readyByPlayerId[playerId] = isReady`
  - 全員の Ready 状態を集計し `ready_status` を全員に通知
  - 全員 Ready かつ最小参加人数を満たしていれば `countdown_start` をトリガー

### 3. rematch_request / rematch_response

#### rematch_request
- action: `"rematch_request"`
- data: 空（将来拡張用に予約）
- GameSession DO:
  - 対戦相手に `rematch_request` を転送

#### rematch_response
- action: `"rematch_response"`
- data:
  - `rematchAccepted`: `true` or `false`
- GameSession DO:
  - 双方が `rematchAccepted === true` なら、スコア/状態を保持しつつ新ラウンド開始に遷移
  - 少なくとも一方が `false` の場合は、再戦不成立としてメニュー等へ戻る方向のフラグを設定


