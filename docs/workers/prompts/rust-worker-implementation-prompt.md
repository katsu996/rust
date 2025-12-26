# Rust Worker 実装プロンプト（AI向け）

## コンテキスト

- Samurai Kirby のリアルタイムゲームサーバを、Cloudflare Workers 上の Rust Worker と Durable Objects で実装する。
- フロントエンドは既存の TypeScript クライアントで、WebSocket プロトコルは現行と同一の `ClientMessage` / `ServerMessage` 形式を使う。
- このフェーズでは、WebSocket ゲートウェイとしての Rust Worker のみを実装する。Durable Objects への接続は Phase 2 で実装する。

## 事前に読むべき設計書

### 必須設計書
- `docs/workers/design/rust-worker-websocket-handling.md` - WebSocket Upgrade 処理の詳細
- `docs/workers/design/rust-worker-routing.md` - ルーティング設計
- `docs/workers/design/rust-worker-error-handling.md` - エラーハンドリング設計
- `docs/workers/design/rust-worker-api-spec.md` - API 仕様全体

### 参考メモ
- `docs/workers/notes/02-rust-worker-design.md` - Rust Worker 設計の詳細メモ

### 既存コード参照（理解のため）
- `src/server/SamuraiKirbyServer.ts` - 既存の Node.js サーバー実装（参考用）

## 実装タスク

### 1. プロジェクトセットアップ
- `worker-rs` クレートを使用した Rust プロジェクトのセットアップ
- `wrangler.toml` の基本設定（DO バインディングは Phase 2 で追加）

### 2. エントリポイントとルーティング
- `main` エントリポイントの実装
- `main_router` 関数の実装
- `/ws` への `GET` リクエストのルーティング
- `/health` エンドポイントの実装（オプション、将来の REST API 拡張用）

### 3. WebSocket Upgrade 処理（`handle_ws`）
以下の処理を設計書に従って実装：

1. **Upgrade ヘッダ検証**
   - `Upgrade: websocket` ヘッダの存在確認
   - 欠如している場合は `426 Upgrade Required` を返す

2. **Origin 検証**
   - 許可された Origin のリストと照合
   - 不正な Origin の場合は `403 Forbidden` を返す
   - 開発環境では `localhost` を許可

3. **roomId 抽出**
   - クエリパラメータ `?roomId=...` から `roomId` を抽出
   - `roomId` が欠如している場合は `400 Bad Request` を返す

4. **GameSession DO へのリクエスト転送（Phase 2 で実装）**
   - このフェーズでは、DO への接続は実装しない
   - 代わりに、適切な形式でリクエストを構築する準備をする

### 4. エラーハンドリング
- エラー条件ごとに適切な HTTP ステータスコードを返す
- エラーレスポンスは JSON 形式で返す
- ログ出力を適切に行う

## 実装の詳細

### WebSocket Upgrade リクエストの形式

```
GET /ws?roomId=<room-id> HTTP/1.1
Host: <worker-host>
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: <base64-encoded-key>
Sec-WebSocket-Version: 13
Origin: <client-origin>
```

### エラーレスポンスの形式

```json
{
  "error": "error_code",
  "message": "human-readable error message"
}
```

### 使用する HTTP ステータスコード

- `400 Bad Request`: リクエスト形式が不正（例: `roomId` が欠如）
- `403 Forbidden`: Origin 検証失敗
- `426 Upgrade Required`: Upgrade ヘッダが欠如
- `500 Internal Server Error`: サーバー内部エラー

## テスト観点

### 基本動作
- [ ] Upgrade ヘッダが欠如しているリクエストに対して `426 Upgrade Required` を返す
- [ ] 不正な Origin に対して `403 Forbidden` を返す
- [ ] `roomId` が欠如しているリクエストに対して `400 Bad Request` を返す
- [ ] 正常な `/ws` リクエストが正しく処理される（Phase 2 で DO 接続を実装後、`101 Switching Protocols` を返す）

### ローカルテスト方法

```bash
# Workers を起動
wrangler dev

# 別ターミナルで WebSocket 接続をテスト
# (例: wscat を使用)
wscat -c "ws://localhost:8787/ws?roomId=test-room"
```

## 注意点

- このフェーズでは Durable Objects への接続は実装しない
- WebSocket Upgrade の検証のみに集中する
- Phase 2 で DO 接続を実装する際に、このコードを拡張する


