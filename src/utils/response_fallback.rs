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
    if let Ok(resp) = Response::from_bytes(b"Internal Server Error".to_vec()) {
        return resp.with_status(status);
    }

    // すべての方法が失敗した場合、最低限のレスポンスを構築
    // この時点でパニックを避けるために、Response::okを使う
    // 実際にはこのコードパスに到達することは極めて稀
    Response::ok("Internal Server Error").map_or_else(
        |_| {
            // 最後の手段: 空のレスポンスを作成
            // この時点でパニックを避けるために、最低限のResponseを返す
            // Response::okが失敗することは通常ありえないが、念のため
            Response::from_bytes(b"Error".to_vec()).unwrap()
        },
        |r| r.with_status(status),
    )
}

/// `ErrorResponse`の`to_response`が失敗した場合のフォールバック
pub fn safe_error_response(error: &crate::utils::ErrorResponse, status: u16) -> Response {
    error.to_response(status).unwrap_or_else(|e| {
        worker::console_log!("Failed to create error response: {:?}", e);
        guaranteed_error_response(status, "Error creating error response")
    })
}
