## Rust Worker API仕様書

### 1. 概要
- Cloudflare Workers 上で動作する Rust Worker の **公開インターフェース** を定義する。
- WebSocketエンドポイント `/ws` と、将来拡張される `/api/*` HTTP エンドポイントを統一的に扱う。

### 2. エントリーポイント

#### 2.1 main 関数
- 型イメージ:

```rust
#[event(fetch)]
pub async fn main(req: Request, env: Env, ctx: worker::Context) -> Result<Response> {
    main_router(req, env, ctx).await
}
```

#### 2.2 main_router
- 役割: パス/メソッドに応じて各ハンドラに振り分け。
- 参照: `rust-worker-routing.md`

### 3. 公開ハンドラ一覧

| 関数                      | 役割                                  |
|---------------------------|---------------------------------------|
| `handle_ws`              | `/ws` WebSocket Upgrade処理           |
| `handle_health`          | `/health` シンプルヘルスチェック      |
| `handle_http_api`        | `/api/*` REST APIディスパッチ（将来） |

### 4. 環境変数・バインディング

#### 4.1 Durable Objects
- `GAME_SESSION`: GameSession DO 名前空間
- `ROOM_MANAGER`: RoomManager DO 名前空間

#### 4.2 将来のKV/Storage等
- ランキングやプロフィール永続化に使うストレージは別途定義（本仕様では範囲外）。

### 5. エラーモデル
- 参照: `rust-worker-error-handling.md`
- すべてのハンドラは `Result<Response>` を返し、エラーは HTTPステータス＋JSONボディで表現。


