use crate::utils::{ErrorCode, ErrorResponse};
use worker::{Env, Request, Response, Result};

/// `WebSocket`接続ハンドラー
///
/// `WebSocket` Upgradeリクエストを検証し、`GameSession` Durable Objectへ接続をハンドオフします
pub async fn handle_ws(req: Request, env: Env) -> Result<Response> {
    // 1. Upgradeヘッダ検証
    if let Some(resp) = validate_upgrade_headers(&req) {
        return Ok(resp);
    }

    // 2. Origin検証
    if let Some(resp) = validate_origin(&req, &env) {
        return Ok(resp);
    }

    // 3. roomId抽出
    let room_id = match extract_room_id(&req) {
        Ok(id) => id,
        Err(e) => {
            worker::console_log!("Failed to extract roomId: {:?}", e);
            let error = ErrorResponse::new(
                ErrorCode::InvalidRoomId,
                format!("Failed to extract roomId: {e}"),
                Some(false),
            );
            return Ok(error
                .to_response(400)
                .unwrap_or_else(|_| Response::error("Bad Request", 400).unwrap()));
        }
    };

    // 4. GameSession DOへの接続
    worker::console_log!("WebSocket connection request for roomId: {}", room_id);

    let namespace = env.durable_object("GAME_SESSION").map_err(|e| {
        worker::console_log!("Failed to get GAME_SESSION namespace: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object namespace".to_string())
    })?;

    let id = namespace.id_from_name(&room_id).map_err(|e| {
        worker::console_log!("Failed to get DO ID from name: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object ID".to_string())
    })?;

    worker::console_log!("Got DO ID for roomId: {}", room_id);

    // DO 側の fetch が WebSocket Upgrade を処理する
    let stub = id.get_stub().map_err(|e| {
        worker::console_log!("Failed to get DO stub: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object stub".to_string())
    })?;

    worker::console_log!("Got DO stub, forwarding request to DO");

    let resp = stub.fetch_with_request(req).await.map_err(|e| {
        worker::console_log!("Failed to fetch from DO: {:?}", e);
        worker::Error::RustError("Failed to connect to Durable Object".to_string())
    })?;

    worker::console_log!("Got response from DO, status: {}", resp.status_code());

    Ok(resp)
}

/// Upgradeヘッダの検証
/// エラー時はSome(Response)を返し、成功時はNoneを返す
fn validate_upgrade_headers(req: &Request) -> Option<Response> {
    let headers = req.headers();

    let Ok(upgrade) = headers.get("Upgrade") else {
        let error = ErrorResponse::new(
            ErrorCode::InternalError,
            "Failed to get Upgrade header".to_string(),
            Some(false),
        );
        return Some(
            error
                .to_response(500)
                .unwrap_or_else(|_| Response::error("Internal Error", 500).unwrap()),
        );
    };

    let Ok(connection) = headers.get("Connection") else {
        let error = ErrorResponse::new(
            ErrorCode::InternalError,
            "Failed to get Connection header".to_string(),
            Some(false),
        );
        return Some(
            error
                .to_response(500)
                .unwrap_or_else(|_| Response::error("Internal Error", 500).unwrap()),
        );
    };

    if upgrade.as_deref() != Some("websocket") {
        worker::console_log!("Invalid Upgrade header: {:?}", upgrade);
        let error = ErrorResponse::new(
            ErrorCode::InvalidUpgradeHeader,
            "Expected WebSocket upgrade".to_string(),
            Some(false),
        );
        return Some(
            error
                .to_response(426)
                .unwrap_or_else(|_| Response::error("Upgrade Required", 426).unwrap()),
        );
    }

    if let Some(conn) = connection {
        let conn_lower: String = conn.to_lowercase();
        if !conn_lower.contains("upgrade") {
            worker::console_log!("Invalid Connection header: {}", conn);
            let error = ErrorResponse::new(
                ErrorCode::InvalidUpgradeHeader,
                "Expected Connection: Upgrade header".to_string(),
                Some(false),
            );
            return Some(
                error
                    .to_response(426)
                    .unwrap_or_else(|_| Response::error("Upgrade Required", 426).unwrap()),
            );
        }
    } else {
        worker::console_log!("Missing Connection header");
        let error = ErrorResponse::new(
            ErrorCode::InvalidUpgradeHeader,
            "Missing Connection header".to_string(),
            Some(false),
        );
        return Some(
            error
                .to_response(426)
                .unwrap_or_else(|_| Response::error("Upgrade Required", 426).unwrap()),
        );
    }

    None
}

/// Origin検証
/// エラー時はSome(Response)を返し、成功時はNoneを返す
fn validate_origin(req: &Request, _env: &Env) -> Option<Response> {
    let headers = req.headers();
    let Ok(origin) = headers.get("Origin") else {
        // Originヘッダの取得に失敗した場合、開発環境では許可
        worker::console_log!("Warning: Failed to get Origin header, allowing in dev mode");
        return None;
    };

    // 開発環境では localhost と null origin (file://) を許可
    // 本番環境では環境変数から許可されたOriginリストを取得
    let allowed_origins = [
        "http://localhost:3000",
        "http://localhost:8787",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8787",
        "null", // file://プロトコルからの接続
    ];

    if let Some(orig) = origin {
        let origin_str: String = orig.clone();
        worker::console_log!(
            "Checking origin: '{}' (len: {})",
            origin_str,
            origin_str.len()
        );

        // "null" origin (file://プロトコル) も許可
        let is_allowed = if origin_str == "null" {
            worker::console_log!("Origin is 'null', allowing");
            true
        } else {
            let matched = allowed_origins.iter().any(|&allowed| {
                let matches = origin_str == allowed;
                if matches {
                    worker::console_log!("Origin matches allowed: {}", allowed);
                }
                matches
            });
            if !matched {
                worker::console_log!("Origin '{}' does not match any allowed origin", origin_str);
            }
            matched
        };

        if is_allowed {
            worker::console_log!("Origin allowed: {}", origin_str);
        } else {
            worker::console_log!("Invalid origin: {}", origin_str);
            let error = ErrorResponse::new(
                ErrorCode::InvalidOrigin,
                format!("Origin not allowed: {origin_str}"),
                Some(false),
            );
            return Some(
                error
                    .to_response(403)
                    .unwrap_or_else(|_| Response::error("Forbidden", 403).unwrap()),
            );
        }
    } else {
        // Originヘッダがない場合、開発環境では許可（file://プロトコルなど）
        worker::console_log!("Warning: Missing Origin header, allowing in dev mode");
        return None;
    }

    None
}

/// roomIdの抽出
fn extract_room_id(req: &Request) -> Result<String> {
    let url = req.url()?;

    let query_params: Vec<(String, String)> = url
        .query_pairs()
        .map(|(k, v): (std::borrow::Cow<str>, std::borrow::Cow<str>)| {
            (k.to_string(), v.to_string())
        })
        .collect();

    for (key, value) in query_params {
        if key == "roomId" {
            if value.is_empty() {
                worker::console_log!("Empty roomId parameter");
                return Err(worker::Error::RustError(
                    "roomId cannot be empty".to_string(),
                ));
            }
            return Ok(value);
        }
    }

    // roomIdが欠如している場合
    worker::console_log!("Missing roomId parameter");
    Err(worker::Error::RustError(
        "roomId query parameter is required".to_string(),
    ))
}
