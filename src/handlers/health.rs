use worker::{Response, Result};

/// ヘルスチェックエンドポイント
pub fn handle() -> Result<Response> {
    Response::ok("OK")
}

