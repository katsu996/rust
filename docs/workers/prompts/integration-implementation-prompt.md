# 統合実装プロンプト（AI向け）

## コンテキスト

- Rust Worker / GameSession DO / RoomManager DO の実装を統合し、フロントエンドの WebSocket クライアントとエンドツーエンドで動作させる。
- Phase 1（Rust Worker）と Phase 2（Durable Objects）の実装が完了していることを前提とする。

## 前提となる実装

- Phase 1: Rust Worker の実装（`rust-worker-implementation-prompt.md` 参照）
- Phase 2: Durable Objects の実装（`durable-objects-implementation-prompt.md` 参照）
- 既存 TypeScript クライアント（`ClientMessage` / `ServerMessage` 型）

## 事前に読むべき設計書

### 統合関連
- `docs/workers/notes/06-client-switch-plan.md` - クライアント側切り替え計画
- `docs/workers/notes/07-server-decommission-plan.md` - サーバー側廃止計画

### 既存コード参照
- `src/game/SamuraiKirby.ts` - メインゲームクラス（WebSocket 接続処理）
- `src/network/WebSocketClient.ts` - WebSocket クライアント実装
- `src/network/WebSocketConnection.ts` - WebSocket 接続管理
- `src/config/NetworkConfig.ts` - ネットワーク設定（URL 生成）

## 実装タスク

### 1. wrangler.toml の設定

#### DO バインディングの追加
```toml
[[durable_objects.bindings]]
name = "GAME_SESSION"
class_name = "GameSession"
script_name = "samurai-kirby-worker"

[[durable_objects.bindings]]
name = "ROOM_MANAGER"
class_name = "RoomManager"
script_name = "samurai-kirby-worker"
```

#### Rust Worker から DO への接続設定
- Rust Worker から GameSession DO / RoomManager DO への接続方法を確認
- `roomId` から DO ID を生成するロジックを実装

### 2. Rust Worker の DO 接続実装

Phase 1 で実装した `handle_ws` を拡張し、GameSession DO への接続を実装：

1. `roomId` から GameSession DO ID を生成
2. GameSession DO へのリクエストを転送
3. WebSocket Upgrade を DO に渡す

### 3. フロントエンドの接続先 URL 切り替え

#### 変更箇所
- `src/config/NetworkConfig.ts` - `getWebSocketUrl()` の実装を変更
- `src/game/SamuraiKirby.ts` - WebSocket 接続処理の確認

#### 新しい URL 形式
- 旧: `ws://localhost:3000` または `ws://<host>:<port>`
- 新: `wss://<worker-host>/ws?roomId=<room-id>`

#### 実装方針
- port 判定ロジックを削除
- Workers の URL を直接使用
- 開発環境と本番環境の URL を適切に設定

### 4. エンドツーエンドテスト

#### 基本フローのテスト
以下のフローを手動および自動テストで確認：

1. **ルーム参加**
   - quick match での参加
   - カスタムルームの作成・参加

2. **ゲーム進行**
   - Ready 状態の管理
   - カウントダウンの動作
   - ラウンド開始 → 感嘆符表示 → 反応 → 結果通知

3. **Rematch**
   - Rematch リクエスト・レスポンス
   - 次のゲームへの移行

4. **切断・再接続**
   - プレイヤーの切断
   - 再接続処理

#### エッジケースのテスト
- 途中切断
- タイムアウト
- 二重送信
- 不正メッセージ
- 過剰接続

## テスト観点

### 接続関連
- [ ] WebSocket 接続が安定して確立・維持・切断される
- [ ] 同じ `roomId` で複数クライアントが接続できる
- [ ] 接続エラー時に適切なエラーメッセージが表示される

### メッセージ処理
- [ ] メッセージ順序がクライアントの期待と一致している
- [ ] すべての `ClientMessage.action` が正しく処理される
- [ ] すべての `ServerMessage.type` が適切なタイミングで送信される

### エラーハンドリング
- [ ] 切断やエラー発生時に、クライアントが適切にリカバリ/エラーメッセージを表示できる
- [ ] 再接続ロジックが正しく動作する
- [ ] エラー時のログ出力が適切に行われる

### パフォーマンス
- [ ] メッセージの遅延が許容範囲内である
- [ ] 複数ルームが同時に動作する
- [ ] 負荷がかかっても安定して動作する

## ローカルテスト方法

### 1. Workers + DO の起動
```bash
wrangler dev
```

### 2. フロントエンドの起動
```bash
# 既存のフロントエンド起動コマンド
npm run dev
```

### 3. 接続確認
- ブラウザでフロントエンドにアクセス
- ゲームを開始し、WebSocket 接続が確立されることを確認
- 開発者ツールの Network タブで WebSocket 接続を確認

### 4. 動作確認
- quick match で対戦を開始
- ゲームの基本フロー（Ready → カウントダウン → ラウンド → 結果）を確認
- Rematch の動作を確認

## 注意点

### 既存サーバーとの競合
- 既存の Node.js サーバー（`src/server/SamuraiKirbyServer.ts`）と並行稼働させない
- フロントエンドの接続先 URL を完全に切り替える

### 段階的な移行
- 機能ごとに段階的に移行し、各機能ごとにテストする
- 問題が発生した場合は、既存サーバーに戻せるようにする

### ログとデバッグ
- Workers のログを確認する（`wrangler tail`）
- フロントエンドのコンソールログを確認する
- 必要に応じて、デバッグ用のログを追加する

## 次のステップ

統合が完了したら、以下のステップを検討：

1. **既存サーバーの廃止**: `src/server/` 以下のコードを削除 or アーカイブ（`docs/workers/notes/07-server-decommission-plan.md` 参照）
2. **パフォーマンステスト**: 負荷テストを実施し、スケーリング特性を確認
3. **セキュリティ強化**: 認証/認可、レートリミットの実装
4. **監視・ログ**: ログ・メトリクス・監視の実装


