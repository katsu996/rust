use worker::{Response, Result};

use crate::models::WelcomeResponse;
use crate::utils::json_response;

/// ルートエンドポイントのハンドラー
/// GET /
pub fn handle() -> Result<Response> {
    let response = WelcomeResponse::new();
    json_response(&response)
}
