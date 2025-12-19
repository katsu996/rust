use worker::{Context, Env, Request, Response, Result, event};

mod constants;
mod handlers;
mod models;
mod openapi;
mod utils;

#[event(fetch)]
async fn fetch(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;

    match url.path() {
        "/" => handlers::root::handle(),
        "/math/add" => handlers::math::add::handle(&url),
        "/math/sub" => handlers::math::sub::handle(&url),
        "/benchmark/add_array" => handlers::benchmark::add_array::handle(&url),
        "/openapi.json" => handlers::docs::openapi_json(),
        "/docs" => handlers::docs::swagger_ui(),
        _ => Response::ok("Not Found").map(|r| r.with_status(404)),
    }
}
