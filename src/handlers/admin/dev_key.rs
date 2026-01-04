use worker::{Env, Request, Response, Result};

use crate::utils::{ErrorCode, ErrorResponse, add_cors_headers};

/// 開発環境用のAPIキー取得エンドポイント
///
/// 注意: このエンドポイントは開発環境（localhost）でのみ使用してください
/// 本番環境では使用しないでください
const ADMIN_API_KEY_ENV: &str = "ADMIN_API_KEY";

pub async fn handle_admin_dev_key(req: Request, env: Env) -> Result<Response> {
    // 開発環境でのみ有効にするため、Origin/RefererヘッダーまたはHostヘッダーをチェック
    let origin = req.headers().get("Origin").ok().flatten();
    let referer = req.headers().get("Referer").ok().flatten();
    let host = req.headers().get("Host").ok().flatten();

    let is_localhost = origin
        .as_ref()
        .is_some_and(|o| o.contains("localhost") || o.contains("127.0.0.1"))
        || referer
            .as_ref()
            .is_some_and(|r| r.contains("localhost") || r.contains("127.0.0.1"))
        || host.as_ref().is_some_and(|h| {
            h.contains("localhost") || h.contains("127.0.0.1") || h.starts_with("127.0.0.1:")
        });

    // localhostからのアクセスのみ許可
    if !is_localhost {
        let error_response = ErrorResponse::new(
            ErrorCode::Forbidden,
            "このエンドポイントは開発環境（localhost）でのみ使用できます".to_string(),
            Some(false),
        );
        let response = error_response.to_response(403)?;
        return add_cors_headers(response);
    }

    // 環境変数からAPIキーを取得
    let api_key = match env.secret(ADMIN_API_KEY_ENV) {
        Ok(secret) => secret.to_string(),
        Err(_) => {
            // シークレットが見つからない場合は通常の環境変数として試す
            env.var(ADMIN_API_KEY_ENV)
                .map(|v| v.to_string())
                .map_err(|_| {
                    worker::Error::RustError(format!(
                        "環境変数 {ADMIN_API_KEY_ENV} が設定されていません"
                    ))
                })?
        }
    };

    // JSONレスポンスを返す
    let json_response = serde_json::json!({
        "apiKey": api_key,
        "message": "開発環境用のAPIキーです。本番環境では使用しないでください。"
    });

    let response = Response::from_json(&json_response)?;
    add_cors_headers(response)
}
