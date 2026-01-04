use serde_json::{Value, json};
use worker::{Env, Request, Response, Result};

/// 管理画面用: 全体統計情報を取得
/// GET /api/admin/stats
#[allow(clippy::too_many_lines)]
pub async fn handle_admin_stats(_req: Request, env: Env) -> Result<Response> {
    worker::console_log!("[Admin] Starting handle_admin_stats");
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

    worker::console_log!("[Admin] Fetching from RoomManager DO");
    let mut resp = match stub.fetch_with_request(do_request).await {
        Ok(resp) => resp,
        Err(e) => {
            worker::console_log!("[Admin] Failed to fetch from RoomManager DO: {:?}", e);
            // エラーが発生した場合でも空のレスポンスを返す
            let empty_response = json!({
                "totalRooms": 0,
                "activeRooms": 0,
                "fullRooms": 0,
                "availableRooms": 0,
                "onlineUsers": 0,
                "quickMatchRooms": 0,
                "customRooms": 0
            });
            let mut response_obj = Response::from_json(&empty_response)?;
            response_obj
                .headers_mut()
                .set("Content-Type", "application/json")?;
            return Ok(response_obj);
        }
    };

    // レスポンスをパース
    let status = resp.status_code();
    worker::console_log!("[Admin] RoomManager response status: {}", status);

    let rooms_data: Value = resp.json().await.map_err(|e| {
        worker::console_log!("Failed to parse RoomManager response: {:?}", e);
        worker::Error::RustError("Failed to parse response".to_string())
    })?;

    worker::console_log!("[Admin] RoomManager response data: {:?}", rooms_data);

    let empty_vec = Vec::<Value>::new();
    let rooms_array = rooms_data
        .get("rooms")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty_vec);

    worker::console_log!("[Admin] Found {} rooms in stats", rooms_array.len());

    // 統計情報を計算
    let total_rooms = rooms_array.len();
    let mut active_rooms = 0;
    let mut full_rooms = 0;
    let mut available_rooms = 0;
    let mut quick_match_rooms = 0;
    let mut custom_rooms = 0;
    let mut total_online_users = 0;

    // GameSession DOのnamespaceを取得
    let game_session_namespace = env.durable_object("GAME_SESSION").map_err(|e| {
        worker::console_log!("Failed to get GAME_SESSION namespace: {:?}", e);
        worker::Error::RustError("Failed to get GAME_SESSION namespace".to_string())
    })?;

    for room in rooms_array {
        #[allow(clippy::cast_possible_truncation)]
        let player_count = room.get("playerCount").and_then(Value::as_u64).unwrap_or(0) as u32;
        #[allow(clippy::cast_possible_truncation)]
        let max_players = room.get("maxPlayers").and_then(Value::as_u64).unwrap_or(0) as u32;
        let match_type = room.get("matchType").and_then(Value::as_str).unwrap_or("");

        if player_count > 0 {
            active_rooms += 1;
        }

        if player_count >= max_players && max_players > 0 {
            full_rooms += 1;
        } else if player_count < max_players {
            available_rooms += 1;
        }

        if match_type == "quick" {
            quick_match_rooms += 1;
        } else if match_type == "custom" {
            custom_rooms += 1;
        }

        // GameSessionからオンラインユーザー数を取得
        if let Some(room_id) = room.get("roomId").and_then(Value::as_str)
            && let Ok(game_session_id) = game_session_namespace.id_from_name(room_id)
            && let Ok(game_session_stub) = game_session_id.get_stub()
            && let Ok(state_request) = Request::new_with_init(
                &format!("http://game-session-{room_id}/state?roomId={room_id}"),
                worker::RequestInit::new().with_method(worker::Method::Get),
            )
            && let Ok(mut state_resp) = game_session_stub.fetch_with_request(state_request).await
            && let Ok(state_data) = state_resp.json::<Value>().await
            && let Some(player_count) = state_data.get("playerCount").and_then(Value::as_u64)
        {
            #[allow(clippy::cast_possible_truncation)]
            let player_count_u32 = player_count as u32;
            total_online_users += player_count_u32;
        }
    }

    // レスポンスを構築
    let response = json!({
        "totalRooms": total_rooms,
        "activeRooms": active_rooms,
        "fullRooms": full_rooms,
        "availableRooms": available_rooms,
        "onlineUsers": total_online_users,
        "quickMatchRooms": quick_match_rooms,
        "customRooms": custom_rooms
    });

    let mut response_obj = Response::from_json(&response)?;
    response_obj
        .headers_mut()
        .set("Content-Type", "application/json")?;

    Ok(response_obj)
}
