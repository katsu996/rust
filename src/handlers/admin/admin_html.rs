use worker::{Env, Request, Response, Result};

use crate::utils::{ErrorCode, ErrorResponse, add_cors_headers};

/// 管理画面HTMLを提供（環境変数を埋め込む）
///
/// 開発環境でのみ有効。環境変数`ADMIN_API_KEY`をHTMLに埋め込みます。
const ADMIN_API_KEY_ENV: &str = "ADMIN_API_KEY";

pub async fn handle_admin_html(req: Request, env: Env) -> Result<Response> {
    // 開発環境でのみ有効にするため、Origin/Referer/Hostヘッダーをチェック
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

    // 開発環境でのみ有効
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

    // admin.htmlの内容を読み込む（コンパイル時に埋め込まれる）
    let html = include_str!("../../../browser-tools/admin.html");

    // プレースホルダーを環境変数で置換
    let html = html.replace("{{ADMIN_API_KEY}}", &api_key);

    let headers = worker::Headers::new();
    headers.set("Content-Type", "text/html; charset=utf-8")?;

    Ok(Response::ok(html)?.with_headers(headers))
}
