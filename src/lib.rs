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
    main_router(req, env, ctx).await
}
