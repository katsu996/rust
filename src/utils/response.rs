use serde::Serialize;
use worker::{Response, Result};

/// JSON 形式のレスポンスを作成
pub fn json_response<T: Serialize>(data: &T) -> Result<Response> {
    let json = serde_json::to_string(data).map_err(|e| worker::Error::RustError(e.to_string()))?;

    let headers = worker::Headers::new();
    headers.set("Content-Type", "application/json")?;

    Ok(Response::ok(json)?.with_headers(headers))
}
