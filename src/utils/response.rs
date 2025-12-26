use serde::Serialize;
use worker::{Response, Result};

/// CORSヘッダーを設定したヘッダーオブジェクトを作成
pub fn create_cors_headers() -> Result<worker::Headers> {
    let headers = worker::Headers::new();
    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
    )?;
    headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
    )?;
    headers.set("Access-Control-Max-Age", "86400")?; // 24時間
    Ok(headers)
}

/// 既存のレスポンスにCORSヘッダーを追加
pub fn add_cors_headers(response: Response) -> Result<Response> {
    let headers = response.headers().clone();
    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
    )?;
    headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
    )?;
    headers.set("Access-Control-Max-Age", "86400")?; // 24時間
    Ok(response.with_headers(headers))
}

/// JSON 形式のレスポンスを作成（CORSヘッダー付き）
pub fn json_response<T: Serialize>(data: &T) -> Result<Response> {
    let json = serde_json::to_string(data).map_err(|e| worker::Error::RustError(e.to_string()))?;

    let headers = create_cors_headers()?;
    headers.set("Content-Type", "application/json")?;

    Ok(Response::ok(json)?.with_headers(headers))
}
