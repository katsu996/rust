use worker::{Response, Result};

use crate::constants::{API_TITLE, SWAGGER_UI_VERSION};
use crate::openapi::get_openapi_json;

/// `OpenAPI` JSON エンドポイント（utoipa で自動生成）
pub fn openapi_json() -> Result<Response> {
    let json = get_openapi_json();

    let headers = worker::Headers::new();
    headers.set("Content-Type", "application/json")?;

    Ok(Response::ok(json)?.with_headers(headers))
}

/// Swagger UI を提供
pub fn swagger_ui() -> Result<Response> {
    let html = format!(
        r#"<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{API_TITLE} - Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@{SWAGGER_UI_VERSION}/swagger-ui.css">
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@{SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
    <script>
        window.onload = () => {{
            SwaggerUIBundle({{
                url: '/openapi.json',
                dom_id: '#swagger-ui',
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIBundle.SwaggerUIStandalonePreset
                ],
                layout: 'BaseLayout'
            }});
        }};
    </script>
</body>
</html>"#
    );

    let headers = worker::Headers::new();
    headers.set("Content-Type", "text/html; charset=utf-8")?;

    Ok(Response::ok(html)?.with_headers(headers))
}
