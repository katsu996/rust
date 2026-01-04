use serde_json::{Value, json};
use worker::{Env, Request, Response, Result};

/// 管理画面用: 全ルーム一覧と詳細情報を取得
/// GET /api/admin/rooms
#[allow(clippy::too_many_lines)]
pub async fn handle_admin_rooms(_req: Request, env: Env) -> Result<Response> {
    worker::console_log!("[Admin] Starting handle_admin_rooms");
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
    worker::console_log!("[Admin] Creating request to RoomManager");
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
                "rooms": [],
                "totalRooms": 0,
                "activeRooms": 0,
                "onlineUsers": 0
            });
            let mut response_obj = Response::from_json(&empty_response)?;
            response_obj
                .headers_mut()
                .set("Content-Type", "application/json")?;
            return Ok(response_obj);
        }
    };

    // レスポンスをパース
    worker::console_log!("[Admin] Parsing RoomManager response");
    let status = resp.status_code();
    worker::console_log!("[Admin] RoomManager response status: {}", status);

    let rooms_data: Value = resp.json().await.map_err(|e| {
        worker::console_log!("[Admin] Failed to parse RoomManager response: {:?}", e);
        worker::Error::RustError("Failed to parse response".to_string())
    })?;

    worker::console_log!("[Admin] RoomManager response data: {:?}", rooms_data);

    let empty_vec = Vec::<Value>::new();
    let rooms_array = rooms_data
        .get("rooms")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty_vec);

    worker::console_log!("[Admin] Found {} rooms", rooms_array.len());

    // GameSession DOのnamespaceを取得
    let game_session_namespace = env.durable_object("GAME_SESSION").map_err(|e| {
        worker::console_log!("Failed to get GAME_SESSION namespace: {:?}", e);
        worker::Error::RustError("Failed to get GAME_SESSION namespace".to_string())
    })?;

    // 各ルームの詳細情報を取得
    let mut rooms_with_details = Vec::new();
    let mut total_online_users = 0;

    for room in rooms_array {
        if let Some(room_id) = room.get("roomId").and_then(|v| v.as_str()) {
            // GameSession DOのIDを取得（エラーが発生しても続行）
            let game_session_id = match game_session_namespace.id_from_name(room_id) {
                Ok(id) => id,
                Err(e) => {
                    worker::console_log!(
                        "[Admin] Failed to get GameSession DO ID for room {}: {:?}",
                        room_id,
                        e
                    );
                    // エラーが発生してもルーム情報は追加
                    let room_detail = room.clone();
                    rooms_with_details.push(room_detail);
                    continue;
                }
            };

            let game_session_stub = match game_session_id.get_stub() {
                Ok(stub) => stub,
                Err(e) => {
                    worker::console_log!(
                        "[Admin] Failed to get GameSession DO stub for room {}: {:?}",
                        room_id,
                        e
                    );
                    // エラーが発生してもルーム情報は追加
                    let room_detail = room.clone();
                    rooms_with_details.push(room_detail);
                    continue;
                }
            };

            // GameSessionから状態を取得（エラーが発生しても続行）
            let state_request = match Request::new_with_init(
                &format!("http://game-session-{room_id}/state?roomId={room_id}"),
                worker::RequestInit::new().with_method(worker::Method::Get),
            ) {
                Ok(req) => req,
                Err(e) => {
                    worker::console_log!(
                        "[Admin] Failed to create state request for room {}: {:?}",
                        room_id,
                        e
                    );
                    // エラーが発生してもルーム情報は追加
                    let room_detail = room.clone();
                    rooms_with_details.push(room_detail);
                    continue;
                }
            };

            let state_resp = game_session_stub.fetch_with_request(state_request).await;

            let mut room_detail = room.clone();
            if let Ok(mut state_resp) = state_resp
                && let Ok(state_data) = state_resp.json::<Value>().await
            {
                // ゲーム状態とプレイヤー情報を追加
                room_detail["gameState"] =
                    state_data.get("gameState").cloned().unwrap_or(json!({}));

                // GameSessionから取得したroomPlayersを使用
                let mut room_players = state_data.get("roomPlayers").cloned().unwrap_or(json!([]));

                // GameSessionのroomPlayersが空の場合、RoomManagerのplayerIdsから生成
                if let Some(players_array) = room_players.as_array()
                    && players_array.is_empty()
                {
                    // RoomManagerのplayerIdsからroomPlayersを生成
                    if let Some(player_ids) = room.get("playerIds").and_then(|v| v.as_array()) {
                        let mut generated_players = Vec::new();
                        for player_id in player_ids {
                            if let Some(id_str) = player_id.as_str() {
                                generated_players.push(json!({
                                    "playerId": id_str,
                                    "playerName": format!("Player-{}", id_str),
                                    "rating": 0,
                                    "isHost": false,
                                    "isReady": false
                                }));
                            }
                        }
                        room_players = json!(generated_players);
                        worker::console_log!(
                            "[Admin] Generated roomPlayers from RoomManager playerIds for room {}: {} players",
                            room_id,
                            generated_players.len()
                        );
                    }
                }

                // playerCountを更新（GameSessionのroomPlayersの長さを使用）
                let player_count = if let Some(players_array) = room_players.as_array() {
                    players_array.len() as u64
                } else {
                    // roomPlayersが配列でない場合、GameSessionのplayerCountを使用
                    state_data
                        .get("playerCount")
                        .and_then(Value::as_u64)
                        .unwrap_or_else(|| {
                            room.get("playerCount").and_then(Value::as_u64).unwrap_or(0)
                        })
                };

                room_detail["roomPlayers"] = room_players;

                // room_detailのplayerCountを更新
                room_detail["playerCount"] = json!(player_count);

                // オンラインユーザー数を集計
                if player_count > 0 {
                    #[allow(clippy::cast_possible_truncation)]
                    let player_count_u32 = player_count as u32;
                    total_online_users += player_count_u32;
                }
            } else {
                worker::console_log!(
                    "[Admin] Failed to get state for room {}: response error",
                    room_id
                );
                // GameSessionから状態を取得できなかった場合、RoomManagerのplayerIdsからroomPlayersを生成
                if let Some(player_ids) = room.get("playerIds").and_then(|v| v.as_array()) {
                    let mut generated_players = Vec::new();
                    for player_id in player_ids {
                        if let Some(id_str) = player_id.as_str() {
                            generated_players.push(json!({
                                "playerId": id_str,
                                "playerName": format!("Player-{}", id_str),
                                "rating": 0,
                                "isHost": false,
                                "isReady": false
                            }));
                        }
                    }
                    room_detail["roomPlayers"] = json!(generated_players);
                    worker::console_log!(
                        "[Admin] Generated roomPlayers from RoomManager playerIds for room {} (GameSession unavailable): {} players",
                        room_id,
                        generated_players.len()
                    );
                }
            }

            rooms_with_details.push(room_detail);
        }
    }

    // レスポンスを構築
    let response = json!({
        "rooms": rooms_with_details,
        "totalRooms": rooms_with_details.len(),
        "activeRooms": rooms_with_details.iter().filter(|r| {
            r.get("playerCount").and_then(Value::as_u64).unwrap_or(0) > 0
        }).count(),
        "onlineUsers": total_online_users
    });

    let mut response_obj = Response::from_json(&response)?;
    response_obj
        .headers_mut()
        .set("Content-Type", "application/json")?;

    Ok(response_obj)
}
