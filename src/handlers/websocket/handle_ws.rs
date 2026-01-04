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
    if let Some(resp) = validate_origin(&req) {
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
    worker::console_log!(
        "[WebSocket] Connecting to GameSession DO for roomId: {}",
        room_id
    );

    let namespace = env.durable_object("GAME_SESSION").map_err(|e| {
        worker::console_log!("[WebSocket] Failed to get GAME_SESSION namespace: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object namespace".to_string())
    })?;

    let id = namespace.id_from_name(&room_id).map_err(|e| {
        worker::console_log!("[WebSocket] Failed to get DO ID from name: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object ID".to_string())
    })?;

    worker::console_log!("[WebSocket] Got DO ID, getting stub...");

    // DO 側の fetch が WebSocket Upgrade を処理する
    let stub = id.get_stub().map_err(|e| {
        worker::console_log!("[WebSocket] Failed to get DO stub: {:?}", e);
        worker::Error::RustError("Failed to get Durable Object stub".to_string())
    })?;

    worker::console_log!("[WebSocket] Got stub, forwarding request to DO...");

    let mut resp = stub.fetch_with_request(req).await.map_err(|e| {
        worker::console_log!("[WebSocket] Failed to fetch from DO: {:?}", e);
        worker::Error::RustError("Failed to connect to Durable Object".to_string())
    })?;

    let status = resp.status_code();
    worker::console_log!("[WebSocket] DO response status: {}", status);

    if status == 101 {
        worker::console_log!("[WebSocket] WebSocket upgrade successful!");
    } else {
        worker::console_log!(
            "[WebSocket] WARNING: Expected status 101 (Switching Protocols), got {}",
            status
        );
        // エラーレスポンスの本文を取得してログに出力
        if let Ok(body) = resp.text().await {
            worker::console_log!("[WebSocket] Response body: {}", body);
        }
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
fn validate_origin(req: &Request) -> Option<Response> {
    let headers = req.headers();
    let Ok(origin) = headers.get("Origin") else {
        // Originヘッダの取得に失敗した場合、開発環境では許可
        worker::console_log!("[WebSocket] No Origin header, allowing connection");
        return None;
    };

    // デフォルトの許可されたOriginリスト
    let allowed_origins: Vec<String> = vec![
        "http://localhost:5173".to_string(),
        "http://localhost:3000".to_string(),
        "http://localhost:8080".to_string(),
        "http://localhost:8081".to_string(),
        "http://localhost:8787".to_string(),
        "http://127.0.0.1:5173".to_string(),
        "http://127.0.0.1:3000".to_string(),
        "http://127.0.0.1:8080".to_string(),
        "http://127.0.0.1:8081".to_string(),
        "http://127.0.0.1:8787".to_string(),
        "http://rust.katsu996.workers.dev".to_string(),
        "https://rust.katsu996.workers.dev".to_string(),
        "null".to_string(),
    ];

    if let Some(orig) = origin {
        let origin_str: String = orig.clone();
        worker::console_log!("[WebSocket] Checking origin: {}", origin_str);

        // "null" origin (file://プロトコル) も許可
        let is_allowed = if origin_str == "null" {
            true
        } else {
            // 部分一致も許可（サブドメインなど）
            let is_exact_match = allowed_origins.contains(&origin_str);
            let is_partial_match = allowed_origins
                .iter()
                .any(|allowed| origin_str.starts_with(allowed) || allowed.starts_with(&origin_str));
            is_exact_match || is_partial_match
        };

        if !is_allowed {
            worker::console_log!(
                "[WebSocket] Invalid origin: {} (allowed: {:?})",
                origin_str,
                allowed_origins
            );
            let error = ErrorResponse::new(
                ErrorCode::InvalidOrigin,
                format!(
                    "Origin not allowed: {origin_str}. Please contact support if this is a valid origin."
                ),
                Some(false),
            );
            return Some(safe_error_response(&error, 403));
        }
        worker::console_log!("[WebSocket] Origin allowed: {}", origin_str);
    } else {
        worker::console_log!("[WebSocket] No Origin header value, allowing connection");
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
