## Rust Worker ルーティング設計

### 1. 目的
- 1つの Worker 内で、**WebSocketエンドポイント**と将来の **HTTP/RESTエンドポイント** を適切に振り分ける。
- WebSocket接続は **GameSession DO / RoomManager DO** にルーティングする。

### 2. エンドポイント分類
- `/ws`:
  - WebSocket用。`handle_ws` に委譲（`rust-worker-websocket-handling.md` 参照）。
- `/health`:
  - ヘルスチェック用。`200 OK` と簡易情報を返す。
- `/api/*`（将来拡張用）:
  - 非リアルタイムREST API向けのプレースホルダ。

### 3. ルーティング関数の責務
- 受け取った `Request` の
  - パス
  - メソッド
を見て、対応するハンドラ関数にディスパッチする。

### 4. 疑似コードイメージ

```rust
pub async fn main_router(req: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
    let path = req.path();
    let method = req.method();

    match (method, path.as_str()) {
        (Method::Get, "/ws") => handle_ws(req, env).await,
        (Method::Get, "/health") => handle_health(req).await,
        _ if path.starts_with("/api/") => handle_http_api(req, env).await,
        _ => Response::error("Not Found", 404),
    }
}
```

### 5. GameSession / RoomManager DO へのルーティング
- `GameSession`:
  - 主に `/ws` の中で DO に委譲される。
  - `roomId` ベースで `id_from_name(room_id)` を計算。
- `RoomManager`:
  - ルーム作成/検索/マッチング用に `/api/rooms/*` で呼び出し。
  - `ROOM_MANAGER.id_from_name("global")` のように単一インスタンスでもよい。

### 6. エラー時ルーティング
- 想定外のパス/メソッドは `404 Not Found`。
- ハンドラ内部エラーは、ここではラップせず各ハンドラで `5xx` を返す方針。


