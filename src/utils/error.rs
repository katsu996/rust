use serde::Serialize;
use worker::{Response, Result};

/// エラーコード
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    InternalError,
    InvalidRoomId,
    InvalidUpgradeHeader,
    InvalidOrigin,
    #[allow(dead_code)] // 将来の使用のために保持
    DurableObjectError,
}

impl ErrorCode {
    /// エラーコードを文字列に変換
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InternalError => "INTERNAL_ERROR",
            Self::InvalidRoomId => "INVALID_ROOM_ID",
            Self::InvalidUpgradeHeader => "INVALID_UPGRADE_HEADER",
            Self::InvalidOrigin => "INVALID_ORIGIN",
            Self::DurableObjectError => "DURABLE_OBJECT_ERROR",
        }
    }
}

/// エラーレスポンス
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    error: ErrorResponseInner,
}

#[derive(Debug, Serialize)]
struct ErrorResponseInner {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    retryable: Option<bool>,
}

impl ErrorResponse {
    /// 新しいエラーレスポンスを作成
    #[must_use]
    pub fn new(code: ErrorCode, message: String, retryable: Option<bool>) -> Self {
        Self {
            error: ErrorResponseInner {
                code: code.as_str(),
                message,
                retryable,
            },
        }
    }

    /// HTTPレスポンスに変換
    pub fn to_response(&self, status: u16) -> Result<Response> {
        let json =
            serde_json::to_string(&self).map_err(|e| worker::Error::RustError(e.to_string()))?;

        let headers = worker::Headers::new();
        headers.set("Content-Type", "application/json")?;

        Ok(Response::ok(json)?
            .with_status(status)
            .with_headers(headers))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code_as_str() {
        assert_eq!(ErrorCode::InternalError.as_str(), "INTERNAL_ERROR");
        assert_eq!(ErrorCode::InvalidRoomId.as_str(), "INVALID_ROOM_ID");
        assert_eq!(
            ErrorCode::InvalidUpgradeHeader.as_str(),
            "INVALID_UPGRADE_HEADER"
        );
        assert_eq!(ErrorCode::InvalidOrigin.as_str(), "INVALID_ORIGIN");
        assert_eq!(
            ErrorCode::DurableObjectError.as_str(),
            "DURABLE_OBJECT_ERROR"
        );
    }

    #[test]
    fn test_error_response_creation() {
        let response = ErrorResponse::new(
            ErrorCode::InternalError,
            "Test error".to_string(),
            Some(false),
        );

        // シリアライズしてJSON構造を確認
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("INTERNAL_ERROR"));
        assert!(json.contains("Test error"));
        assert!(json.contains("retryable"));
    }
}
