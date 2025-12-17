use serde::Serialize;
use utoipa::ToSchema;

/// ウェルカムレスポンスのエンドポイント情報
#[derive(Serialize, ToSchema)]
pub struct Endpoints {
    /// Swagger UI
    pub swagger: String,
    /// `OpenAPI` 仕様
    pub openapi: String,
    /// 計算エンドポイント
    pub math: String,
}

/// ルートエンドポイントのレスポンス
#[derive(Serialize, ToSchema)]
pub struct WelcomeResponse {
    /// ウェルカムメッセージ
    pub message: String,
    /// 利用可能なエンドポイント
    pub endpoints: Endpoints,
}

impl WelcomeResponse {
    pub fn new() -> Self {
        Self {
            message: "Welcome to Rust API".to_string(),
            endpoints: Endpoints {
                swagger: "/docs".to_string(),
                openapi: "/openapi.json".to_string(),
                math: "/math".to_string(),
            },
        }
    }
}

impl Default for WelcomeResponse {
    fn default() -> Self {
        Self::new()
    }
}
