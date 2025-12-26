# Samurai Kirby Rust API / Workers 移行 TODO

## 1. 現状把握・整理

- [x] クライアント側WebSocket使用箇所の棚卸し
  - `src/network/WebSocketClient.ts`
  - `src/network/WebSocketConnection.ts`
  - `src/network/WebSocketPoolAdapter.ts`
  - `src/network/WebSocketPoolManager.ts`
  - `src/game/services/WebSocketConnectionService.ts`
  - `src/game/services/WebSocketMessageService.ts`
  - `src/game/SamuraiKirby.ts`（接続・切断・URL生成）
  - 詳細メモ: `docs/workers/notes/01-current-state-analysis.md` の「1.1 クライアント側WebSocket使用箇所」

- [x] サーバー側WebSocketロジックの棚卸し
  - `src/server/SamuraiKirbyServer.ts`
  - `src/server/handlers/GameMessageHandler.ts`
  - `src/server/handlers/RoomMessageHandler.ts`
  - `src/server/handlers/ReadyMessageHandler.ts`
  - `src/server/services/RoundService.ts`
  - `src/server/services/CountdownService.ts`
  - `src/server/services/GameService.ts`
  - `src/server/managers/RoomManager.ts`
  - `src/server/managers/PlayerManager.ts`
  - `src/server/managers/MatchmakingManager.ts`
  - 詳細メモ: `docs/workers/notes/01-current-state-analysis.md` の「1.2 サーバー側WebSocketロジック」

- [x] メッセージ種別と流れの整理
  - `ClientMessage.action` 9種 / `ServerMessage.type` 17種の一覧
  - 「どのクラスが処理しているか」「いつ送信されるか」を表にまとめる
  - 詳細メモ: `docs/workers/notes/01-current-state-analysis.md` の「1.3 メッセージ種別と流れ」

---

## 2. Rust Worker / DO 側のAPI・責務設計

- [x] Rust Worker（API Gateway）の責務定義
  - `/ws` エンドポイント仕様（Upgrade検証・Origin検証・roomId解決）
  - GameSession DO へのハンドオフフロー
  - `/health` や将来の `/api/*` の位置づけ
  - 詳細メモ: `docs/workers/notes/02-rust-worker-design.md`

- [x] GameSession DO の責務定義
  - ルーム単位の WebSocket 接続管理
  - ラウンド開始／感嘆符表示／反応／お手つき／結果通知
  - Ready 状態／カウントダウン／Rematch の管理
  - 勝敗・スコア・設定の保持とHibernation
  - 詳細メモ: `docs/workers/notes/03-gamesession-design.md`

- [x] RoomManager DO の責務定義
  - quick match ルームの検索・作成
  - カスタムルーム作成・参加（roomCode 管理）
  - ルームのライフサイクルとクリーンアップ戦略
  - 詳細メモ: `docs/workers/notes/04-roommanager-design.md`

- [x] サービス層ロジックの切り出し
  - GameService（反応検証・勝敗判定）
  - RoundService（結果送信・ラウンドリセット）
  - CountdownService（Ready完了後のカウントダウン）を
    - GameSession DO 内のモジュールとして再設計
  - 詳細メモ: `docs/workers/notes/08-services-module-design.md`

---

## 3. メッセージマッピングと移行仕様

- [x] ClientMessage.action → DO メソッド対応表の作成
  - 例:  
    - `join_room` → `RoomManager.handleQuickMatchJoin` / `handleCustomRoomJoin`  
    - `round_start` → `GameSession.handleRoundStart`  
    - `player_reaction` → `GameSession.handlePlayerReaction`  
    - `ready_toggle` → `GameSession.handleReadyToggle`  
    - `rematch_*` → `GameSession.handleRematch*`
  - 詳細メモ: `docs/workers/notes/05-message-mapping.md` の「3.1 ClientMessage.action → DOメソッド対応」

- [x] ServerMessage.type → DO 送信元対応表の作成
  - 例:  
    - `room_joined` / `player_joined` → GameSession / RoomManager  
    - `round_start` / `exclamation_show` → GameSession  
    - `round_result` → GameSession（RoundService経由）  
    - `ready_status` / `countdown_start` → GameSession
  - 詳細メモ: `docs/workers/notes/05-message-mapping.md` の「3.2 ServerMessage.type → 送信元DO対応」

- [x] エッジケースの仕様化
  - 途中切断・タイムアウト・二重送信・不正メッセージ・過剰接続などの扱い
  - 詳細メモ: `docs/workers/notes/05-message-mapping.md` の「3.3 エッジケースの扱い（概要）」

---

## 4. クライアント側の切り替え方針（TS → Rust API/Workers）

- [x] WebSocket接続先URLの切り替え仕様
  - 旧: Node.js サーバー（`ws://localhost:3000` 等）
  - 新: Workers 上の `wss://<api-host>/ws?roomId=...`
  - `getWebSocketUrl` の新ルールと、port 判定ロジックの削除方針
  - 詳細メモ: `docs/workers/notes/06-client-switch-plan.md` の「4.1 接続先URLの新ルール」

- [x] 再接続・エラー処理の方針
  - Workers/DO 側のエラーコードに合わせた再接続条件
  - 再接続回数上限・ユーザーへのエラーメッセージ仕様
  - 詳細メモ: `docs/workers/notes/06-client-switch-plan.md` の「4.2 再接続・エラー処理方針」

- [x] 既存WebSocketクライアントロジックの「残す／消す」境界決め
  - **残す**: `ClientMessage/ServerMessage` 型、`WebSocketHandler` などメッセージ処理部分
  - **差し替える**: 実際の接続先・エラー/再接続戦略
  - **最終的に削除**: Nodeサーバー前提の URL ロジック、不要な Pool 実装など
  - 詳細メモ: `docs/workers/notes/06-client-switch-plan.md` の「4.3 残すロジック／差し替えるロジック／削除するロジック」

---

## 5. サーバー側（Node.js → Rust Worker/DO）の廃止ステップ

- [x] Node.js WebSocket サーバーの完全移行条件を定義
  - すべての `ClientMessage.action` / `ServerMessage.type` が DO 側にマップ済みであること
  - テストが Workers/DO を前提として通ること
  - 詳細メモ: `docs/workers/notes/07-server-decommission-plan.md` の「5.1 完全移行の判定条件」

- [x] Node サーバーコードの段階的削除計画
  1. `SamuraiKirbyServer.ts` を参照専用扱いにし、新ロジックは Workers/DO のみで追加
  2. 対応済みのハンドラ/サービスごとに、TS 側と DO 側の処理を比較・ドキュメント化
  3. 全ハンドラ/サービス移行完了後に `src/server/` 以下を削除 or アーカイブ
  - 詳細メモ: `docs/workers/notes/07-server-decommission-plan.md` の「5.2 段階的削除ステップ」

- [x] テスト・監視の切り替え
  - 既存テストのうち「サーバー依存」のものを Workers/DO 向けに書き換える方針を整理
  - 新/旧サーバーの二重起動を避けるための運用ルール
  - 詳細メモ: `docs/workers/notes/07-server-decommission-plan.md` の「5.3 テスト・監視の切り替え」

---

## 6. 将来用（今回すぐはやらないが、課題として記録）

- [ ] 認証/認可・レートリミット設計（`docs/future/auth-and-security-design.md`）
- [ ] 非リアルタイムREST API（プロフィール/統計/ランキング）設計（`docs/future/non-realtime-rest-api-design.md`）
- [ ] ログ・メトリクス・監視設計（`docs/future/observability-and-ops.md`）
- [ ] Workers/DO のスケーリング・制限対応（`docs/future/scaling-and-limits.md`）
