use worker::{Env, Request, Response, Result};

/// Quick match ルームの検索・作成・参加
/// POST /api/rooms/quick-match
pub async fn handle_quick_match(mut req: Request, env: Env) -> Result<Response> {
    // リクエストボディを取得
    let body = req.json::<serde_json::Value>().await.map_err(|e| {
        worker::console_log!("Failed to parse request body: {:?}", e);
        worker::Error::RustError("Invalid JSON".to_string())
    })?;

    // RoomManager DOを取得
    let namespace = env.durable_object("ROOM_MANAGER").map_err(|e| {
        worker::console_log!("Failed to get ROOM_MANAGER namespace: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object namespace".to_string())
    })?;

    // RoomManager DOのIDを取得（シングルトンとして使用）
    let id = namespace.id_from_name("room-manager").map_err(|e| {
        worker::console_log!("Failed to get DO ID: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object ID".to_string())
    })?;

    let stub = id.get_stub().map_err(|e| {
        worker::console_log!("Failed to get DO stub: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object stub".to_string())
    })?;

    // RoomManager DOにリクエストを転送
    // RoomManager DOのfetchメソッドはurl.pathnameを見るため、/quick-matchを指定
    let do_request = Request::new_with_init(
        "http://room-manager/quick-match",
        worker::RequestInit::new()
            .with_method(worker::Method::Post)
            .with_headers({
                let headers = worker::Headers::new();
                headers.set("Content-Type", "application/json")?;
                headers
            })
            .with_body(Some(
                serde_json::to_string(&body)
                    .map_err(|e| {
                        worker::console_log!("Failed to serialize request body: {:?}", e);
                        worker::Error::RustError(format!("JSON serialization failed: {e}"))
                    })?
                    .into(),
            )),
    )?;

    let resp = stub.fetch_with_request(do_request).await.map_err(|e| {
        worker::console_log!("Failed to fetch from RoomManager DO: {:?}", e);
        worker::Error::RustError("Failed to connect to RoomManager".to_string())
    })?;

    Ok(resp)
}
