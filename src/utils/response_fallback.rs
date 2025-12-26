use worker::Response;

/// 確実にResponseを返すヘルパー
/// すべてのエラーハンドリングが失敗した場合の最終フォールバック
fn guaranteed_error_response(status: u16, message: &str) -> Response {
    // まず、Response::errorを試す
    if let Ok(resp) = Response::error(message, status) {
        return resp;
    }

    // Response::errorが失敗した場合、Response::from_bodyを試す
    if let Ok(resp) = Response::from_body(worker::ResponseBody::Body(message.as_bytes().to_vec())) {
        return resp.with_status(status);
    }

    // Response::from_bodyが失敗した場合、Response::from_bytesを試す
    if let Ok(resp) = Response::from_bytes(message.as_bytes().to_vec()) {
        return resp.with_status(status);
    }

    // 最後の手段: Response::okを試す
    if let Ok(resp) = Response::ok(message) {
        return resp.with_status(status);
    }

    // すべてが失敗した場合、空のResponseを構築
    // この時点に到達することは極めて稀だが、パニックを避ける
    Response::from_bytes(vec![])
        .or_else(|_| Response::ok(""))
        .or_else(|_| Response::error("", status))
        .or_else(|_| Response::from_bytes(b"Error".to_vec()))
        .or_else(|_| Response::from_bytes(b"".to_vec()))
        .unwrap_or_else(|_| {
            // すべての方法が失敗した場合、明確なエラーメッセージと共にパニック
            // このコードパスに到達することは極めて稀で、worker crateの重大なバグを示す
            panic!(
                "Failed to create error response after all fallback methods. \
                 This indicates a critical issue with the worker crate. \
                 Status: {status}, Message: {message}"
            )
        })
        .with_status(status)
}

/// `ErrorResponse`の`to_response`が失敗した場合のフォールバック
pub fn safe_error_response(error: &crate::utils::ErrorResponse, status: u16) -> Response {
    error.to_response(status).unwrap_or_else(|e| {
        worker::console_log!("Failed to create error response: {:?}", e);
        guaranteed_error_response(status, "Error creating error response")
    })
}
