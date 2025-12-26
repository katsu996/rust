use crate::utils::{ErrorCode, ErrorResponse, safe_error_response};
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
            worker::console_log!("[WebSocket] Failed to extract roomId: {:?}", e);
            let error = ErrorResponse::new(
                ErrorCode::InvalidRoomId,
                format!("Failed to extract roomId: {e}"),
                Some(false),
            );
            return Ok(safe_error_response(&error, 400));
        }
    };

    // 4. GameSession DOへの接続
    let namespace = env.durable_object("GAME_SESSION").map_err(|e| {
        worker::console_log!("[WebSocket] Failed to get GAME_SESSION namespace: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object namespace".to_string())
    })?;

    let id = namespace.id_from_name(&room_id).map_err(|e| {
        worker::console_log!("[WebSocket] Failed to get DO ID from name: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object ID".to_string())
    })?;

    // DO 側の fetch が WebSocket Upgrade を処理する
    let stub = id.get_stub().map_err(|e| {
        worker::console_log!("[WebSocket] Failed to get DO stub: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object stub".to_string())
    })?;

    let resp = stub.fetch_with_request(req).await.map_err(|e| {
        worker::console_log!("[WebSocket] Failed to fetch from DO: {:?}", e);
        worker::Error::RustError("Failed to connect to Durable Object".to_string())
    })?;

    let status = resp.status_code();
    if status != 101 {
        worker::console_log!(
            "[WebSocket] WARNING: Expected status 101 (Switching Protocols), got {}",
            status
        );
    }

    Ok(resp)
}

/// Upgradeヘッダの検証
/// エラー時はSome(Response)を返し、成功時はNoneを返す
fn validate_upgrade_headers(req: &Request) -> Option<Response> {
    let headers = req.headers();

    let upgrade = match headers.get("Upgrade") {
        Ok(h) => h,
        Err(e) => {
            worker::console_log!("Failed to get Upgrade header: {:?}", e);
            let error = ErrorResponse::new(
                ErrorCode::InternalError,
                "Failed to get Upgrade header".to_string(),
                Some(false),
            );
            return Some(safe_error_response(&error, 500));
        }
    };

    let connection = match headers.get("Connection") {
        Ok(h) => h,
        Err(e) => {
            worker::console_log!("Failed to get Connection header: {:?}", e);
            let error = ErrorResponse::new(
                ErrorCode::InternalError,
                "Failed to get Connection header".to_string(),
                Some(false),
            );
            return Some(safe_error_response(&error, 500));
        }
    };

    if upgrade.as_deref() != Some("websocket") {
        worker::console_log!("Invalid Upgrade header: {:?}", upgrade);
        let error = ErrorResponse::new(
            ErrorCode::InvalidUpgradeHeader,
            "Expected WebSocket upgrade".to_string(),
            Some(false),
        );
        return Some(safe_error_response(&error, 426));
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
            return Some(safe_error_response(&error, 426));
        }
    } else {
        worker::console_log!("Missing Connection header");
        let error = ErrorResponse::new(
            ErrorCode::InvalidUpgradeHeader,
            "Missing Connection header".to_string(),
            Some(false),
        );
        return Some(safe_error_response(&error, 426));
    }

    None
}

/// Origin検証
/// エラー時はSome(Response)を返し、成功時はNoneを返す
fn validate_origin(req: &Request, env: &Env) -> Option<Response> {
    let headers = req.headers();
    let Ok(origin) = headers.get("Origin") else {
        // Originヘッダの取得に失敗した場合、開発環境では許可
        return None;
    };

    // デフォルトの許可されたOriginリスト
    // プロンプト要件に合わせて localhost:5173 を追加
    let mut allowed_origins: Vec<String> = vec![
        "http://localhost:5173".to_string(),
        "http://localhost:3000".to_string(),
        "http://localhost:8080".to_string(),
        "http://localhost:8787".to_string(),
        "http://127.0.0.1:5173".to_string(),
        "http://127.0.0.1:3000".to_string(),
        "http://127.0.0.1:8080".to_string(),
        "http://127.0.0.1:8787".to_string(),
        "https://rust.katsu996.workers.dev".to_string(),
        "null".to_string(),
    ];

    // 環境変数から追加の許可されたOriginを取得
    if let Ok(allowed_origins_env) = env.var("ALLOWED_ORIGINS") {
        let origins_str = allowed_origins_env.to_string();
        let additional_origins: Vec<String> = origins_str
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        allowed_origins.extend(additional_origins);
    }

    if let Some(orig) = origin {
        let origin_str: String = orig.clone();

        // "null" origin (file://プロトコル) も許可
        let is_allowed = if origin_str == "null" {
            true
        } else {
            allowed_origins.contains(&origin_str)
        };

        if !is_allowed {
            worker::console_log!("[WebSocket] Invalid origin: {}", origin_str);
            let error = ErrorResponse::new(
                ErrorCode::InvalidOrigin,
                format!(
                    "Origin not allowed: {origin_str}. Please contact support if this is a valid origin."
                ),
                Some(false),
            );
            return Some(safe_error_response(&error, 403));
        }
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
