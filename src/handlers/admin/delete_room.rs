use serde_json::json;
use worker::{Env, Request, Response, Result};

/// 管理画面用: ルームを削除
/// DELETE /api/admin/rooms/{roomId}
pub async fn handle_admin_delete_room(req: Request, env: Env) -> Result<Response> {
    worker::console_log!("[Admin] Starting handle_admin_delete_room");

    // URLからroomIdを取得
    let url = req.url()?;
    let path = url.path();

    // /api/admin/rooms/{roomId} の形式からroomIdを抽出
    let room_id = path
        .strip_prefix("/api/admin/rooms/")
        .ok_or_else(|| worker::Error::RustError("Invalid path format".to_string()))?;

    if room_id.is_empty() {
        return Ok(Response::ok("Room ID is required")?.with_status(400));
    }

    worker::console_log!("[Admin] Deleting room: {}", room_id);

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
    let do_request = Request::new_with_init(
        "http://room-manager/delete-room",
        worker::RequestInit::new()
            .with_method(worker::Method::Delete)
            .with_headers({
                let headers = worker::Headers::new();
                headers.set("Content-Type", "application/json")?;
                headers
            })
            .with_body(Some(
                serde_json::to_string(&json!({ "roomId": room_id }))
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
