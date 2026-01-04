use worker::{Context, Env, Method, Request, Response, Result, event};

mod constants;
mod handlers;
mod models;
mod openapi;
mod utils;

/// メインルーター
/// パスとメソッドに応じて各ハンドラに振り分けます
async fn main_router(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    let path = url.path();
    let method = req.method();

    // OPTIONSリクエスト（プリフライトリクエスト）を処理
    if method == Method::Options {
        let headers = utils::create_cors_headers()?;
        return Ok(Response::ok("")?.with_headers(headers));
    }

    let response = match (method, path) {
        (Method::Get, "/") => handlers::root::handle()?,
        (Method::Get, "/health") => handlers::health::handle()?,
        (Method::Get, "/ws") => {
            // WebSocket接続の場合はCORSヘッダーを追加しない
            return handlers::websocket::handle_ws(req, env).await;
        }
        (Method::Post, "/api/rooms/quick-match") => {
            handlers::rooms::handle_quick_match(req, env).await?
        }
        (Method::Post, "/api/rooms/create-room") => {
            handlers::rooms::handle_create_room(req, env).await?
        }
        (Method::Post, "/api/rooms/join-room") => {
            handlers::rooms::handle_join_room(req, env).await?
        }
        (Method::Post, "/api/rooms/leave-room") => {
            handlers::rooms::handle_leave_room(req, env).await?
        }
        (Method::Get, "/api/admin/rooms") => {
            // 認証チェック
            if let Some(auth_error_response) = utils::authenticate_admin_request(&req, &env)? {
                return Ok(auth_error_response);
            }
            handlers::admin::handle_admin_rooms(req, env).await?
        }
        (Method::Get, "/api/admin/stats") => {
            // 認証チェック
            if let Some(auth_error_response) = utils::authenticate_admin_request(&req, &env)? {
                return Ok(auth_error_response);
            }
            handlers::admin::handle_admin_stats(req, env).await?
        }
        (Method::Get, "/api/admin/users") => {
            // 認証チェック
            if let Some(auth_error_response) = utils::authenticate_admin_request(&req, &env)? {
                return Ok(auth_error_response);
            }
            handlers::admin::handle_admin_users(req, env).await?
        }
        (Method::Get, "/api/admin/dev-key") => {
            // 開発環境用のAPIキー取得エンドポイント（認証不要）
            handlers::admin::handle_admin_dev_key(req, env).await?
        }
        (Method::Get, "/admin") => {
            // 管理画面HTML（環境変数を埋め込む、開発環境のみ）
            handlers::admin::handle_admin_html(req, env).await?
        }
        (Method::Delete, path) if path.starts_with("/api/admin/rooms/") => {
            // 認証チェック
            if let Some(auth_error_response) = utils::authenticate_admin_request(&req, &env)? {
                return Ok(auth_error_response);
            }
            handlers::admin::handle_admin_delete_room(req, env).await?
        }
        (Method::Get, "/math/add") => handlers::math::add::handle(&url)?,
        (Method::Get, "/math/sub") => handlers::math::sub::handle(&url)?,
        (Method::Get, "/benchmark/add_array") => handlers::benchmark::add_array::handle(&url)?,
        (Method::Get, "/openapi.json") => handlers::docs::openapi_json()?,
        (Method::Get, "/docs") => handlers::docs::swagger_ui()?,
        _ => Response::ok("Not Found")?.with_status(404),
    };

    // すべてのレスポンスにCORSヘッダーを追加（WebSocket接続を除く）
    utils::add_cors_headers(response)
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, ctx: Context) -> Result<Response> {
    match main_router(req, env, ctx).await {
        Ok(response) => Ok(response),
        Err(e) => {
            // エラーが発生した場合でもCORSヘッダーを追加
            worker::console_log!("Error in main_router: {:?}", e);
            let error_response = utils::ErrorResponse::new(
                utils::ErrorCode::InternalError,
                format!("Internal server error: {e}"),
                Some(false),
            );
            let response = error_response.to_response(500)?;
            // CORSヘッダーを追加
            utils::add_cors_headers(response)
        }
    }
}
