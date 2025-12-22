use worker::{Env, Request, Response, Result};
use crate::utils::error::{ErrorCode, ErrorResponse};

/// WebSocket接続ハンドラー
/// 
/// WebSocket Upgradeリクエストを検証し、GameSession Durable Objectへ接続をハンドオフします
pub async fn handle_ws(req: Request, env: Env) -> Result<Response> {
    // 1. Upgradeヘッダ検証
    if let Err(resp) = validate_upgrade_headers(&req) {
        return Ok(resp);
    }

    // 2. Origin検証
    if let Err(resp) = validate_origin(&req, &env) {
        return Ok(resp);
    }

    // 3. roomId抽出
    let room_id = match extract_room_id(&req) {
        Ok(id) => id,
        Err(resp) => return Ok(resp),
    };

    // 4. GameSession DOへの接続
    worker::console_log!("WebSocket connection request for roomId: {}", room_id);
    
    let namespace = env
        .durable_object("GAME_SESSION")
        .map_err(|e| {
            worker::console_log!("Failed to get GAME_SESSION namespace: {:?}", e);
            let error = ErrorResponse::new(
                ErrorCode::DurableObjectError,
                "Failed to get Durable Object namespace".to_string(),
                Some(true),
            );
            error.to_response(502)
                .unwrap_or_else(|_| Response::error("Bad Gateway", 502).unwrap())
        })?;

    let id = namespace
        .id_from_name(&room_id)
        .map_err(|e| {
            worker::console_log!("Failed to get DO ID from name: {:?}", e);
            let error = ErrorResponse::new(
                ErrorCode::DurableObjectError,
                "Failed to get Durable Object ID".to_string(),
                Some(true),
            );
            error.to_response(502)
                .unwrap_or_else(|_| Response::error("Bad Gateway", 502).unwrap())
        })?;

    let stub = namespace
        .get(id)
        .map_err(|e| {
            worker::console_log!("Failed to get DO stub: {:?}", e);
            let error = ErrorResponse::new(
                ErrorCode::DurableObjectError,
                "Failed to get Durable Object stub".to_string(),
                Some(true),
            );
            error.to_response(502)
                .unwrap_or_else(|_| Response::error("Bad Gateway", 502).unwrap())
        })?;

    // DO 側の fetch が WebSocket Upgrade を処理する
    let resp = stub
        .fetch_with_request(req)
        .await
        .map_err(|e| {
            worker::console_log!("Failed to fetch from DO: {:?}", e);
            let error = ErrorResponse::new(
                ErrorCode::DurableObjectError,
                "Failed to connect to Durable Object".to_string(),
                Some(true),
            );
            error.to_response(502)
                .unwrap_or_else(|_| Response::error("Bad Gateway", 502).unwrap())
        })?;

    Ok(resp)
}

/// Upgradeヘッダの検証
fn validate_upgrade_headers(req: &Request) -> Result<(), Response> {
    let headers = req.headers();
    
    let upgrade = headers.get("Upgrade")
        .map_err(|_| {
            let error = ErrorResponse::new(
                ErrorCode::InternalError,
                "Failed to get Upgrade header".to_string(),
                Some(false),
            );
            error.to_response(500).unwrap_or_else(|_| Response::error("Internal Error", 500).unwrap())
        })?;
    
    let connection = headers.get("Connection")
        .map_err(|_| {
            let error = ErrorResponse::new(
                ErrorCode::InternalError,
                "Failed to get Connection header".to_string(),
                Some(false),
            );
            error.to_response(500).unwrap_or_else(|_| Response::error("Internal Error", 500).unwrap())
        })?;

    if upgrade.as_deref() != Some("websocket") {
        worker::console_log!("Invalid Upgrade header: {:?}", upgrade);
        let error = ErrorResponse::new(
            ErrorCode::InvalidUpgradeHeader,
            "Expected WebSocket upgrade".to_string(),
            Some(false),
        );
        return Err(error.to_response(426)
            .unwrap_or_else(|_| Response::error("Upgrade Required", 426).unwrap()));
    }

    if let Some(conn) = connection {
        let conn_lower = conn.to_lowercase();
        if !conn_lower.contains("upgrade") {
            worker::console_log!("Invalid Connection header: {}", conn);
            let error = ErrorResponse::new(
                ErrorCode::InvalidUpgradeHeader,
                "Expected Connection: Upgrade header".to_string(),
                Some(false),
            );
            return Err(error.to_response(426)
                .unwrap_or_else(|_| Response::error("Upgrade Required", 426).unwrap()));
        }
    } else {
        worker::console_log!("Missing Connection header");
        let error = ErrorResponse::new(
            ErrorCode::InvalidUpgradeHeader,
            "Missing Connection header".to_string(),
            Some(false),
        );
        return Err(error.to_response(426)
            .unwrap_or_else(|_| Response::error("Upgrade Required", 426).unwrap()));
    }

    Ok(())
}

/// Origin検証
fn validate_origin(req: &Request, _env: &Env) -> Result<(), Response> {
    let headers = req.headers();
    let origin = headers.get("Origin")
        .map_err(|_| {
            let error = ErrorResponse::new(
                ErrorCode::InternalError,
                "Failed to get Origin header".to_string(),
                Some(false),
            );
            error.to_response(500).unwrap_or_else(|_| Response::error("Internal Error", 500).unwrap())
        })?;

    // 開発環境では localhost を許可
    // 本番環境では環境変数から許可されたOriginリストを取得
    let allowed_origins = vec![
        "http://localhost:3000",
        "http://localhost:8787",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8787",
    ];

    if let Some(orig) = origin {
        let origin_str = orig.to_string();
        let is_allowed = allowed_origins.iter().any(|&allowed| origin_str == allowed);
        
        if !is_allowed {
            worker::console_log!("Invalid origin: {}", origin_str);
            let error = ErrorResponse::new(
                ErrorCode::InvalidOrigin,
                "Origin not allowed".to_string(),
                Some(false),
            );
            return Err(error.to_response(403)
                .unwrap_or_else(|_| Response::error("Forbidden", 403).unwrap()));
        }
    } else {
        // Originヘッダがない場合も拒否（開発環境では緩和可能）
        worker::console_log!("Missing Origin header");
        let error = ErrorResponse::new(
            ErrorCode::InvalidOrigin,
            "Missing Origin header".to_string(),
            Some(false),
        );
        return Err(error.to_response(403)
            .unwrap_or_else(|_| Response::error("Forbidden", 403).unwrap()));
    }

    Ok(())
}

/// roomIdの抽出
fn extract_room_id(req: &Request) -> Result<String, Response> {
    let url = req.url()
        .map_err(|_| {
            let error = ErrorResponse::new(
                ErrorCode::InternalError,
                "Failed to parse URL".to_string(),
                Some(false),
            );
            error.to_response(500).unwrap_or_else(|_| Response::error("Internal Error", 500).unwrap())
        })?;
    
    let query_params: Vec<(String, String)> = url
        .query_pairs()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();

    for (key, value) in query_params {
        if key == "roomId" {
            if value.is_empty() {
                worker::console_log!("Empty roomId parameter");
                let error = ErrorResponse::new(
                    ErrorCode::InvalidRoomId,
                    "roomId cannot be empty".to_string(),
                    Some(false),
                );
                return Err(error.to_response(400)
                    .unwrap_or_else(|_| Response::error("Bad Request", 400).unwrap()));
            }
            return Ok(value);
        }
    }

    // roomIdが欠如している場合
    worker::console_log!("Missing roomId parameter");
    let error = ErrorResponse::new(
        ErrorCode::InvalidRoomId,
        "roomId query parameter is required".to_string(),
        Some(false),
    );
    Err(error.to_response(400)
        .unwrap_or_else(|_| Response::error("Bad Request", 400).unwrap()))
}

