# 実装手順ガイド

このドキュメントは、別リポジトリで Rust Worker と Durable Objects を実装する際の手順をまとめたものです。

## 実装の全体フロー

実装は以下の3段階で進めます：

1. **Phase 1: Rust Worker 実装** - WebSocket ゲートウェイの実装
2. **Phase 2: Durable Objects 実装** - GameSession と RoomManager の実装
3. **Phase 3: 統合・テスト** - エンドツーエンドの統合と動作確認

各フェーズは独立して実装・テスト可能ですが、Phase 3 では Phase 1 と Phase 2 の両方が必要です。

---

## Phase 1: Rust Worker 実装

### 前提条件

- Cloudflare Workers の開発環境が整っていること
- `worker-rs` クレートを使用した Rust プロジェクトがセットアップ済みであること
- `wrangler.toml` の基本設定が完了していること

### 使用するプロンプト

**`rust-worker-implementation-prompt.md`** を使用します。

> 📄 **プロンプトファイル**: [`rust-worker-implementation-prompt.md`](./rust-worker-implementation-prompt.md)

### 実装手順

1. **設計書の確認**
   - `docs/workers/design/rust-worker-websocket-handling.md`
   - `docs/workers/design/rust-worker-routing.md`
   - `docs/workers/design/rust-worker-error-handling.md`
   - `docs/workers/design/rust-worker-api-spec.md`
   - `docs/workers/notes/02-rust-worker-design.md`（詳細メモ）

2. **実装タスク**
   - `main` エントリポイントとルーティングの実装
   - `/ws` エンドポイントの実装（WebSocket Upgrade 処理）
   - `/health` エンドポイントの実装（オプション）
   - エラーハンドリングの実装

3. **ローカルテスト**
   ```bash
   wrangler dev
   ```
   - `/ws?roomId=test-room` への WebSocket 接続リクエストを送信
   - Upgrade ヘッダがない場合に 426 を返すことを確認
   - 不正な Origin の場合に 403 を返すことを確認

4. **確認事項**
   - [ ] WebSocket Upgrade リクエストが正しく処理される
   - [ ] エラー条件ごとに適切な HTTP ステータスが返される
   - [ ] ログ出力が適切に行われる

### 注意点

- この段階では Durable Objects への接続はまだ実装しない（Phase 2 で実装）
- WebSocket Upgrade の検証のみに集中する

---

## Phase 2: Durable Objects 実装

### 前提条件

- Phase 1 が完了していること（または Phase 1 と並行して実装可能）
- TypeScript で Durable Objects を実装する環境が整っていること
- `wrangler.toml` に DO バインディングの設定を追加できること

### 使用するプロンプト

**`durable-objects-implementation-prompt.md`** を使用します。

> 📄 **プロンプトファイル**: [`durable-objects-implementation-prompt.md`](./durable-objects-implementation-prompt.md)

### 実装手順

#### 2-1. GameSession Durable Object の実装

1. **設計書の確認**
   - `docs/workers/design/durable-objects-gamesession.md`
   - `docs/workers/design/durable-objects-message-handlers.md`
   - `docs/workers/design/durable-objects-services.md`
   - `docs/workers/design/durable-objects-state-management.md`
   - `docs/workers/specs/api-game-logic.md`
   - `docs/workers/specs/api-ready-state.md`
   - `docs/workers/specs/api-edge-cases.md`
   - `docs/workers/notes/03-gamesession-design.md`（詳細メモ）
   - `docs/workers/notes/05-message-mapping.md`（メッセージマッピング）
   - `docs/workers/notes/08-services-module-design.md`（サービス層設計）

2. **実装タスク**
   - GameSession DO クラスの作成
   - 状態管理（`state.storage` を使用）
   - WebSocket 接続の処理（`fetch` 内で Upgrade 処理）
   - メッセージハンドラーの実装（`handleMessage` と各アクション処理）
   - サービス層モジュールの実装（GameService、RoundService、CountdownService 相当）

3. **ローカルテスト**
   ```bash
   wrangler dev
   ```
   - Rust Worker から GameSession DO への接続を確認
   - WebSocket メッセージの送受信を確認

4. **確認事項**
   - [ ] 同じ `roomId` で複数クライアントが接続した際に、単一の DO インスタンスが使用される
   - [ ] WebSocket メッセージが正しく処理される
   - [ ] 状態が `state.storage` に永続化される

#### 2-2. RoomManager Durable Object の実装

1. **設計書の確認**
   - `docs/workers/design/durable-objects-roommanager.md`
   - `docs/workers/specs/api-room-management.md`
   - `docs/workers/notes/04-roommanager-design.md`（詳細メモ）
   - `docs/workers/notes/05-message-mapping.md`（メッセージマッピング）

2. **実装タスク**
   - RoomManager DO クラスの作成
   - quick match ルームの検索・作成ロジック
   - カスタムルームの作成・参加ロジック（roomCode 管理）
   - ルームのライフサイクル管理

3. **ローカルテスト**
   - quick match の動作確認
   - カスタムルームの作成・参加の動作確認

4. **確認事項**
   - [ ] quick match で適切なルームが検索・作成される
   - [ ] カスタムルームの roomCode が正しく管理される
   - [ ] ルームのクリーンアップが適切に行われる

### 注意点

- 既存の TypeScript コード（`src/server/` 以下）を参照しながら実装する
- メッセージ形式（`ClientMessage` / `ServerMessage`）は既存の型定義に準拠する
- Hibernation API の動作を理解し、適切に状態を永続化する

---

## Phase 3: 統合・テスト

### 前提条件

- Phase 1 と Phase 2 が完了していること
- フロントエンド（TypeScript クライアント）のコードにアクセスできること

### 使用するプロンプト

**`integration-implementation-prompt.md`** を使用します。

> 📄 **プロンプトファイル**: [`integration-implementation-prompt.md`](./integration-implementation-prompt.md)

### 実装手順

1. **設計書の確認**
   - `docs/workers/notes/06-client-switch-plan.md`（クライアント側切り替え計画）
   - `docs/workers/notes/07-server-decommission-plan.md`（サーバー側廃止計画）

2. **統合タスク**
   - `wrangler.toml` に DO バインディングを追加
   - Rust Worker から GameSession DO / RoomManager DO への接続を実装
   - フロントエンドの WebSocket 接続先 URL を Workers の `/ws` に切り替え

3. **エンドツーエンドテスト**
   - join_room → 対戦 → Ready → Rematch → 切断までの一連のフローを確認
   - エッジケース（切断、タイムアウト、二重送信など）の動作確認

4. **確認事項**
   - [ ] WebSocket 接続が安定して確立・維持・切断される
   - [ ] メッセージ順序がクライアントの期待と一致している
   - [ ] 切断やエラー発生時に、クライアントが適切にリカバリ/エラーメッセージを表示できる
   - [ ] すべての `ClientMessage.action` が正しく処理される
   - [ ] すべての `ServerMessage.type` が適切なタイミングで送信される

### 注意点

- 既存の Node.js サーバーと並行稼働させない（接続先 URL を切り替える）
- 段階的に機能を移行し、各機能ごとにテストする

---

## プロンプトの使い方

### AI にプロンプトを渡す際の手順

1. **コンテキストの提供**
   - このリポジトリの構造を説明する
   - 既存の TypeScript コード（特に `src/server/` 以下）への参照方法を説明する

2. **設計書の提供**
   - プロンプト内で指定されている設計書をすべて提供する
   - 必要に応じてメモファイルも提供する

3. **実装タスクの明確化**
   - プロンプト内の実装タスクを1つずつ進める
   - 各タスク完了後にテストを実行し、動作確認する

4. **フィードバックループ**
   - 実装中に不明点があれば、設計書やメモファイルを参照する
   - 必要に応じて既存の TypeScript コードを参照する

### プロンプトのカスタマイズ

各プロンプトは基本的な実装タスクを記載していますが、以下の点をカスタマイズできます：

- **技術スタックの詳細**: 使用するクレートやライブラリのバージョン
- **テストフレームワーク**: 使用するテストフレームワークの指定
- **ログ出力形式**: ログの出力形式やレベル
- **エラーハンドリング**: エラーメッセージの形式や処理方法

---

## トラブルシューティング

### よくある問題

1. **WebSocket Upgrade が失敗する**
   - Upgrade ヘッダの検証ロジックを確認
   - Origin 検証の設定を確認

2. **Durable Object に接続できない**
   - `wrangler.toml` の DO バインディング設定を確認
   - Rust Worker から DO への接続方法を確認

3. **メッセージが正しく処理されない**
   - メッセージ形式（`ClientMessage` / `ServerMessage`）を確認
   - メッセージマッピング（`docs/workers/notes/05-message-mapping.md`）を参照

4. **状態が永続化されない**
   - Hibernation API の使用方法を確認
   - `state.storage` への書き込みタイミングを確認

### 参考資料

- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Durable Objects ドキュメント](https://developers.cloudflare.com/durable-objects/)
- [worker-rs クレート](https://github.com/cloudflare/workers-rs)

---

## 次のステップ

実装が完了したら、以下のステップを検討してください：

1. **パフォーマンステスト**: 負荷テストを実施し、スケーリング特性を確認
2. **セキュリティ強化**: 認証/認可、レートリミットの実装（`docs/workers/todo-rust-migration.md` のセクション6を参照）
3. **監視・ログ**: ログ・メトリクス・監視の実装（同上）
4. **非リアルタイム REST API**: プロフィール/統計/ランキング API の実装（同上）

