## Rust Worker WebSocket接続ハンドリング設計

### 1. 目的・役割
- フロントエンド（TypeScriptクライアント）からの **WebSocket接続要求** を受け付ける。
- 接続要求を検証し、対応する **GameSession Durable Object** へ接続をハンドオフする。
- 不正なリクエストやエラー時には、HTTPレスポンスで明確な失敗理由を返す。

### 2. エンドポイント仕様
- **メソッド**: `GET`
- **パス**: `/ws`
- **必須ヘッダー**
  - `Upgrade: websocket`
  - `Connection: Upgrade`
- **推奨ヘッダー / クエリ**
  - `Sec-WebSocket-Protocol`（将来のバージョン管理用、現時点では任意）
  - `roomId`（クエリパラメータ、なければサーバー側で新規ルーム作成方針）

### 3. フローチャート（高レベル）
1. リクエスト受信
2. Upgradeヘッダー検証
3. オリジン/ホスト検証（CSRF/悪意ある接続を防ぐ）
4. `roomId` 決定（クエリ or 新規発行）
5. `GAME_SESSION` DO ID を `idFromName(roomId)` で算出
6. DO Stub に対して `fetch(request)` を呼び出し、Upgrade処理を委譲
7. DO から返ってきた `Response` をそのまま返却（101 or エラー）

### 4. 疑似コードイメージ

```rust
pub async fn handle_ws(req: Request, env: Env) -> Result<Response> {
    validate_upgrade_headers(&req)?;
    validate_origin(&req, &env)?;

    let room_id = extract_room_id(&req)?;

    let namespace = env.durable_object("GAME_SESSION")?;
    let id = namespace.id_from_name(&room_id)?;
    let stub = namespace.get(id)?;

    // DO 側の fetch が WebSocket Upgrade を処理する
    let resp = stub.fetch_with_request(req).await?;
    Ok(resp)
}
```

### 5. エラー条件とレスポンス
- Upgradeヘッダー欠如: `426 Upgrade Required` + メッセージ `"Expected WebSocket upgrade"`
- Origin不正: `403 Forbidden`
- roomId不正形式: `400 Bad Request`
- DO呼び出し失敗: `502 Bad Gateway`（内部ログには詳細エラー）

### 6. ロギング方針
- 接続成功時:
  - `playerId`（判明していれば）と `roomId`
  - クライアントIP/UA（プライバシーを考慮して必要最小限）
- 接続失敗時:
  - 拒否理由（ヘッダ不正・Origin不正など）を構造化ログで出力


