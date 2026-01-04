use serde_json::{Value, json};
use worker::{Env, Request, Response, Result};

/// 管理画面用: オンラインユーザー一覧を取得
/// GET /api/admin/users
pub async fn handle_admin_users(_req: Request, env: Env) -> Result<Response> {
    worker::console_log!("[Admin] Starting handle_admin_users");

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

    // RoomManager DOから全ルーム一覧を取得
    let do_request = Request::new_with_init(
        "http://room-manager/list-rooms",
        worker::RequestInit::new().with_method(worker::Method::Get),
    )?;

    let mut resp = match stub.fetch_with_request(do_request).await {
        Ok(resp) => resp,
        Err(e) => {
            worker::console_log!("[Admin] Failed to fetch from RoomManager DO: {:?}", e);
            let empty_response = json!({
                "users": []
            });
            let mut response_obj = Response::from_json(&empty_response)?;
            response_obj
                .headers_mut()
                .set("Content-Type", "application/json")?;
            return Ok(response_obj);
        }
    };

    let rooms_data: Value = resp.json().await.map_err(|e| {
        worker::console_log!("[Admin] Failed to parse RoomManager response: {:?}", e);
        worker::Error::RustError("Failed to parse response".to_string())
    })?;

    let empty_vec = Vec::<Value>::new();
    let rooms_array = rooms_data
        .get("rooms")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty_vec);

    // GameSession DOのnamespaceを取得
    let game_session_namespace = env.durable_object("GAME_SESSION").map_err(|e| {
        worker::console_log!("Failed to get GAME_SESSION namespace: {:?}", e);
        worker::Error::RustError("Failed to get GAME_SESSION namespace".to_string())
    })?;

    // 全ユーザー情報を収集
    let mut users = Vec::new();
    let mut user_set = std::collections::HashSet::new();

    for room in rooms_array {
        if let Some(room_id) = room.get("roomId").and_then(|v| v.as_str()) {
            // GameSessionから状態を取得
            if let Ok(game_session_id) = game_session_namespace.id_from_name(room_id)
                && let Ok(game_session_stub) = game_session_id.get_stub()
                && let Ok(state_request) = Request::new_with_init(
                    &format!("http://game-session-{room_id}/state?roomId={room_id}"),
                    worker::RequestInit::new().with_method(worker::Method::Get),
                )
                && let Ok(mut state_resp) =
                    game_session_stub.fetch_with_request(state_request).await
                && let Ok(state_data) = state_resp.json::<Value>().await
            {
                // プレイヤー情報を取得
                if let Some(room_players) = state_data.get("roomPlayers").and_then(|v| v.as_array())
                {
                    for player in room_players {
                        if let Some(player_id) = player.get("playerId").and_then(|v| v.as_str()) {
                            // 重複を避ける
                            if !user_set.contains(player_id) {
                                user_set.insert(player_id.to_string());

                                let user_info = json!({
                                    "playerId": player_id,
                                    "playerName": player.get("playerName").and_then(|v| v.as_str()).unwrap_or("Unknown"),
                                    "rating": player.get("rating").and_then(Value::as_u64).unwrap_or(0),
                                    "isHost": player.get("isHost").and_then(Value::as_bool).unwrap_or(false),
                                    "isReady": player.get("isReady").and_then(Value::as_bool).unwrap_or(false),
                                    "roomId": room_id,
                                    "matchType": room.get("matchType").and_then(|v| v.as_str()).unwrap_or("unknown"),
                                    "roomCode": room.get("code").and_then(|v| v.as_str()),
                                });

                                users.push(user_info);
                            }
                        }
                    }
                }
            }
        }
    }

    // レスポンスを構築
    let response = json!({
        "users": users,
        "totalUsers": users.len()
    });

    let mut response_obj = Response::from_json(&response)?;
    response_obj
        .headers_mut()
        .set("Content-Type", "application/json")?;

    Ok(response_obj)
}
