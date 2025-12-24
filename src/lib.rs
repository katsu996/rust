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

    match (method, path) {
        (Method::Get, "/") => handlers::root::handle(),
        (Method::Get, "/health") => handlers::health::handle(),
        (Method::Get, "/ws") => handlers::websocket::handle_ws(req, env).await,
        (Method::Post, "/api/rooms/quick-match") => {
            handlers::rooms::handle_quick_match(req, env).await
        }
        (Method::Post, "/api/rooms/create-room") => {
            handlers::rooms::handle_create_room(req, env).await
        }
        (Method::Post, "/api/rooms/join-room") => handlers::rooms::handle_join_room(req, env).await,
        (Method::Get, "/math/add") => handlers::math::add::handle(&url),
        (Method::Get, "/math/sub") => handlers::math::sub::handle(&url),
        (Method::Get, "/benchmark/add_array") => handlers::benchmark::add_array::handle(&url),
        (Method::Get, "/openapi.json") => handlers::docs::openapi_json(),
        (Method::Get, "/docs") => handlers::docs::swagger_ui(),
        _ => Response::ok("Not Found").map(|r| r.with_status(404)),
    }
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, ctx: Context) -> Result<Response> {
    main_router(req, env, ctx).await
}
