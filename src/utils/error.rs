use serde::Serialize;
use worker::{Response, Result};

/// エラーコード
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    InvalidUpgradeHeader,
    InvalidOrigin,
    InvalidRoomId,
    DurableObjectError,
    InternalError,
}

impl ErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ErrorCode::InvalidUpgradeHeader => "INVALID_UPGRADE_HEADER",
            ErrorCode::InvalidOrigin => "INVALID_ORIGIN",
            ErrorCode::InvalidRoomId => "INVALID_ROOM_ID",
            ErrorCode::DurableObjectError => "DURABLE_OBJECT_ERROR",
            ErrorCode::InternalError => "INTERNAL_ERROR",
        }
    }
}

/// エラーレスポンス
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: ErrorInfo,
}

#[derive(Serialize)]
pub struct ErrorInfo {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}

impl ErrorResponse {
    pub fn new(code: ErrorCode, message: String, retryable: Option<bool>) -> Self {
        Self {
            error: ErrorInfo {
                code: code.as_str().to_string(),
                message,
                retryable,
            },
        }
    }

    pub fn to_response(&self, status: u16) -> Result<Response> {
        let json = serde_json::to_string(self)
            .map_err(|e| worker::Error::RustError(e.to_string()))?;

        let mut headers = worker::Headers::new();
        headers.set("Content-Type", "application/json")?;

        Response::error(&json, status)?.with_headers(headers)
    }
}

