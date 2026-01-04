# rust

Cloudflare Workers で動作する Rust ベースの計算API です。
**utoipa** を使用した OpenAPI ドキュメント自動生成に対応しています。

## 特徴

- 🦀 **Rust** + Cloudflare Workers
- 📖 **OpenAPI 3.1** 自動生成（utoipa）
- 🎨 **Swagger UI** 内蔵
- ⚡ **エッジコンピューティング** による高速レスポンス

## API エンドポイント

### REST API

| エンドポイント | 説明 |
| --- | --- |
| `GET /math/add?a=X&b=Y` | 足し算（X + Y） |
| `GET /math/sub?a=X&b=Y` | 引き算（X - Y） |
| `GET /openapi.json` | OpenAPI 仕様（JSON） |
| `GET /docs` | Swagger UI |
| `GET /health` | ヘルスチェック |

### ゲームルーム管理 API

| エンドポイント | 説明 |
| --- | ---- |
| `POST /api/quick-match` | Quick matchルームの検索・作成・参加 |
| `POST /api/create-room` | カスタムルームの作成 |
| `POST /api/join-room` | カスタムルームへの参加（roomCode使用） |

#### Quick Match (`POST /api/quick-match`)

空きのあるQuick matchルームを検索し、見つからなければ新規作成します。

**リクエストボディ:**

```json
{
  "playerId": "player-123",
  "settings": {
    "maxWins": 3,
    "maxFalseStarts": 3,
    "allowFalseStarts": true,
    "maxPlayers": 2
  }
}
```

**レスポンス:**

```json
{
  "roomId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### カスタムルーム作成 (`POST /api/create-room`)

カスタム設定でルームを作成し、roomCodeを発行します。

**リクエストボディ:**

```json
{
  "playerId": "player-123",
  "customRoomSettings": {
    "maxWins": 5,
    "maxFalseStarts": 2,
    "allowFalseStarts": true,
    "maxPlayers": 2
  }
}
```

**レスポンス:**

```json
{
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "roomCode": "1234"
}
```

#### カスタムルーム参加 (`POST /api/join-room`)

roomCodeを使用してカスタムルームに参加します。

**リクエストボディ:**

```json
{
  "playerId": "player-456",
  "roomCode": "1234"
}
```

**レスポンス:**

```json
{
  "roomId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**エラーレスポンス:**

```json
{
  "error": {
    "code": "ROOM_NOT_FOUND",
    "message": "Room not found"
  }
}
```

### WebSocket API

| エンドポイント | 説明 |
| --------------- | ------ |
| `GET /ws?roomId=<room-id>` | WebSocket接続（GameSession Durable Objectへ接続） |

#### WebSocket接続の要件

- **必須ヘッダー**:
  - `Upgrade: websocket`
  - `Connection: Upgrade`
- **必須クエリパラメータ**:
  - `roomId`: ルームID（`/api/quick-match` または `/api/create-room` で取得）
- **Origin検証**: 開発環境では `localhost` と `file://` プロトコルを許可

#### WebSocketメッセージ形式

**クライアント → サーバー (`ClientMessage`):**

```json
{
  "action": "join_room" | "round_start" | "player_reaction" | "ready_toggle" | "rematch_request" | ...,
  "data": {
    "reactionFrames": 120,
    "waitTime": 3000,
    "accepted": true,
    ...
  }
}
```

**サーバー → クライアント (`ServerMessage`):**

```json
{
  "type": "connection_established" | "round_start" | "round_result" | "error" | ...,
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "playerId": "player-123",
  "isHost": true,
  "reactionFrames": 120,
  "winnerId": "player-123",
  "winsByPlayerId": { "player-123": 2, "player-456": 1 },
  ...
}
```

### レスポンス例

```json
{
  "a": 10,
  "b": 5,
  "operation": "+",
  "result": 15
}
```

## 前提条件

- [Rust](https://rustup.rs/) (最新版)
- [Node.js](https://nodejs.org/) (v18以上推奨)
- [pnpm](https://pnpm.io/) または npm

### Rust ターゲットの追加

```bash
rustup target add wasm32-unknown-unknown
```

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. Windows環境でのesbuild設定（初回のみ）

Windows環境では、worker-buildがesbuildを正しく見つけられない場合があります。以下のコマンドで手動設定してください：

```powershell
# esbuildのパスを確認
$esbuildPath = Get-ChildItem -Path "node_modules" -Recurse -Filter "esbuild.exe" | Select-Object -First 1 -ExpandProperty FullName

# worker-buildが期待するディレクトリを作成してコピー
$targetDir = "$env:LOCALAPPDATA\worker-build\esbuild-win32-x64-0.27.0.exe\bin"
New-Item -ItemType Directory -Force -Path $targetDir
Copy-Item $esbuildPath "$targetDir\esbuild.exe"
```

## 開発

### ローカル開発サーバーの起動

```bash
pnpm dev
```

サーバーは `http://127.0.0.1:8787` で起動します。

- API: `http://127.0.0.1:8787/math/add?a=10&b=5`
- Swagger UI: `http://127.0.0.1:8787/docs`

コードを変更すると自動的にリビルドされ、ホットリロードが適用されます。

### 手動ビルド

```bash
pnpm build
```

## テスト

### 1. 開発サーバーの起動

```bash
pnpm dev
```

サーバーは `http://127.0.0.1:8787` で起動します。

### 2. WebSocket接続テスト

#### 方法A: テスト用HTMLファイルを使用（推奨）

1. ブラウザで `test-websocket.html` を開く
2. Room IDを入力（例: `test-room`）
3. 「接続」ボタンをクリック
4. 接続が確立されると、サーバーから `connection_established` メッセージが受信されます

#### 方法B: ブラウザの開発者コンソールを使用

```javascript
// WebSocket接続
const ws = new WebSocket('ws://127.0.0.1:8787/ws?roomId=test-room');

ws.onopen = () => console.log('✅ 接続確立');
ws.onmessage = (event) => console.log('📨 受信:', JSON.parse(event.data));
ws.onerror = (error) => console.error('❌ エラー:', error);
ws.onclose = (event) => console.log('🔌 切断:', event.code);

// メッセージ送信例
ws.send(JSON.stringify({
  action: "ready_toggle",
  data: {}
}));
```

**注意**: ブラウザの開発者コンソールから直接WebSocket接続を試す場合、Content Security Policy (CSP) によりブロックされる場合があります。その場合は `test-websocket.html` を使用してください。

### 3. REST APIテスト

#### Quick Match

```bash
curl -X POST http://127.0.0.1:8787/api/quick-match \
  -H "Content-Type: application/json" \
  -d '{"playerId": "player-123"}'
```

#### カスタムルーム作成

```bash
curl -X POST http://127.0.0.1:8787/api/create-room \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "player-123",
    "customRoomSettings": {
      "maxWins": 5,
      "maxFalseStarts": 2,
      "allowFalseStarts": true,
      "maxPlayers": 2
    }
  }'
```

#### カスタムルーム参加

```bash
curl -X POST http://127.0.0.1:8787/api/join-room \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "player-456",
    "roomCode": "1234"
  }'
```

### 4. エンドツーエンドテストフロー

#### Quick Matchフロー

1. **ルーム作成/参加**

   ```bash
   curl -X POST http://127.0.0.1:8787/api/quick-match \
     -H "Content-Type: application/json" \
     -d '{"playerId": "player-1"}'
   ```

   レスポンス: `{"roomId": "550e8400-e29b-41d4-a716-446655440000"}`

2. **WebSocket接続**

   ```javascript
   const ws = new WebSocket('ws://127.0.0.1:8787/ws?roomId=550e8400-e29b-41d4-a716-446655440000');
   ```

3. **ゲームフロー**
   - Ready状態の切り替え: `{"action": "ready_toggle"}`
   - カウントダウン開始（全員Ready時）
   - ラウンド開始: サーバーから `round_start` メッセージ
   - 反応送信: `{"action": "player_reaction", "data": {"reactionFrames": 120}}`
   - 結果受信: サーバーから `round_result` メッセージ

#### カスタムルームフロー

1. **ルーム作成**

   ```bash
   curl -X POST http://127.0.0.1:8787/api/create-room \
     -H "Content-Type: application/json" \
     -d '{"playerId": "player-1", "customRoomSettings": {...}}'
   ```

   レスポンス: `{"roomId": "550e8400-e29b-41d4-a716-446655440000", "roomCode": "1234"}`

2. **ルーム参加**（別プレイヤー）

   ```bash
   curl -X POST http://127.0.0.1:8787/api/join-room \
     -H "Content-Type: application/json" \
     -d '{"playerId": "player-2", "roomCode": "1234"}'
   ```

3. **WebSocket接続**（両プレイヤー）

   ```javascript
   // プレイヤー1
   const ws1 = new WebSocket('ws://127.0.0.1:8787/ws?roomId=room-123');

   // プレイヤー2
   const ws2 = new WebSocket('ws://127.0.0.1:8787/ws?roomId=room-123');
   ```

### 5. ヘルスチェック

```bash
curl http://127.0.0.1:8787/health
```

レスポンス: `OK`

## デプロイ

Cloudflare Workers にデプロイするには：

```bash
pnpm deploy
```

初回デプロイ時は Cloudflare アカウントへのログインが必要です：

```bash
npx wrangler login
```

詳細なデプロイ手順とトラブルシューティングについては、以下を参照してください：

- [デプロイ手順](docs/DEPLOYMENT.md)
- [トラブルシューティングガイド](docs/TROUBLESHOOTING.md)

## プロジェクト構造

```md
rust/
├── src/
│   ├── lib.rs              # エントリーポイント（ルーティング）
│   ├── constants.rs        # 定数定義
│   ├── openapi.rs          # OpenAPI 定義（utoipa）
│   ├── handlers/           # リクエストハンドラー
│   │   ├── mod.rs
│   │   ├── math/           # /math/* エンドポイント
│   │   │   ├── mod.rs
│   │   │   ├── add.rs      # /math/add
│   │   │   └── sub.rs      # /math/sub
│   │   └── docs.rs         # OpenAPI/Swagger UI
│   ├── models/             # データモデル
│   │   ├── mod.rs
│   │   └── calculation.rs  # 計算結果
│   └── utils/              # ユーティリティ
│       ├── mod.rs
│       ├── params.rs       # パラメータ取得
│       └── response.rs     # JSONレスポンス
├── build/                  # ビルド成果物（自動生成）
├── Cargo.toml              # Rust 依存関係
├── rustfmt.toml            # フォーマッター設定
├── wrangler.toml           # Wrangler 設定
└── package.json            # Node.js 依存関係
```

## 新しいエンドポイントの追加方法

### 1. モデルを追加（必要な場合）

```rust
// src/models/your_model.rs
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct YourModel {
    /// フィールドの説明
    pub field: String,
}
```

### 2. ハンドラーを追加

```rust
// src/handlers/your_group/your_handler.rs
use worker::{Response, Result, Url};
use crate::utils::json_response;

pub fn handle(url: &Url) -> Result<Response> {
    // 処理
}
```

```rust
// src/handlers/your_group/mod.rs
pub mod your_handler;
```

```rust
// src/handlers/mod.rs に追加
pub mod your_group;
```

### 3. OpenAPI ドキュメントを追加

```rust
// src/openapi.rs に追加
#[utoipa::path(
    get,
    path = "/your-group/your-endpoint",
    tag = "YourTag",
    responses(
        (status = 200, description = "成功", body = YourModel)
    )
)]
fn your_endpoint() {}

// #[openapi(...)] の paths に追加
#[derive(OpenApi)]
#[openapi(
    paths(add, sub, your_endpoint),  // ← 追加
    ...
)]
```

### 4. ルーティングを追加

```rust
// src/lib.rs
match url.path() {
    "/your-group/your-endpoint" => handlers::your_group::your_handler::handle(&url),
    ...
}
```

## テストの実行

### すべてのテストを実行

```bash
pnpm test
```

これにより、以下のテストが順番に実行されます：

1. Rustテスト（`cargo test`）
2. TypeScriptテスト（`vitest run`）
3. E2Eテスト（`playwright test`）

### 個別にテストを実行

```bash
# Rustテストのみ
pnpm test:rust

# TypeScriptユニットテストのみ
pnpm test:ts:unit

# TypeScript統合テストのみ
pnpm test:ts:integration

# TypeScriptテスト全体
pnpm test:ts

# E2Eテストのみ
pnpm test:e2e
```

### ウォッチモード

```bash
pnpm test:watch
```

### カバレッジ

```bash
pnpm test:coverage
```

**注意**: 統合テストとE2Eテストは開発サーバー（`pnpm dev`）が起動している必要があります。

詳細は `tests/README.md` を参照してください。

## コード品質

### フォーマット

```bash
cargo fmt
```

### リンター

```bash
cargo clippy
```

### コードチェック（フォーマット + リンター）

```bash
pnpm check
```

### TypeScript型チェック

```bash
pnpm build:ts
```

## 技術スタック

| 技術 | 用途 |
| ----- | ------ |
| [worker-rs](https://github.com/cloudflare/workers-rs) | Cloudflare Workers Rust SDK |
| [utoipa](https://github.com/juhaku/utoipa) | OpenAPI 自動生成 |
| [serde](https://serde.rs/) | シリアライズ/デシリアライズ |
| [wrangler](https://developers.cloudflare.com/workers/wrangler/) | デプロイツール |

## 参考リンク

- [Cloudflare Workers Rust Documentation](https://developers.cloudflare.com/workers/languages/rust/)
- [workers-rs GitHub](https://github.com/cloudflare/workers-rs)
- [utoipa GitHub](https://github.com/juhaku/utoipa)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
