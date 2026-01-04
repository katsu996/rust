use worker::{Env, Request, Response, Result};

use crate::utils::{ErrorCode, ErrorResponse, add_cors_headers};

/// 環境変数キー: 管理APIキー
const ADMIN_API_KEY_ENV: &str = "ADMIN_API_KEY";

/// 認証ヘッダーからAPIキーを抽出
///
/// `Authorization: Bearer <token>` または `Authorization: <token>` の形式をサポート
fn extract_api_key_from_request(req: &Request) -> Option<String> {
    let headers = req.headers();
    let auth_header = headers.get("Authorization").ok()??;

    // "Bearer " プレフィックスを削除
    let token = auth_header
        .strip_prefix("Bearer ")
        .unwrap_or(&auth_header)
        .trim()
        .to_string();

    if token.is_empty() { None } else { Some(token) }
}

/// 環境変数からAPIキーを取得
fn get_admin_api_key_from_env(env: &Env) -> Result<String> {
    // まずシークレットとして試す（推奨）
    if let Ok(secret) = env.secret(ADMIN_API_KEY_ENV) {
        return Ok(secret.to_string());
    }

    // シークレットが見つからない場合は通常の環境変数として試す
    env.var(ADMIN_API_KEY_ENV)
        .map(|v| v.to_string())
        .map_err(|_| {
            worker::Error::RustError(format!("環境変数 {ADMIN_API_KEY_ENV} が設定されていません"))
        })
}

/// 管理エンドポイントの認証チェック
///
/// リクエストの`Authorization`ヘッダーからAPIキーを取得し、
/// 環境変数の`ADMIN_API_KEY`と比較します。
///
/// # 戻り値
/// - `Ok(None)`: 認証成功
/// - `Ok(Some(Response))`: 認証失敗（401 Unauthorized または 403 Forbidden）
/// - `Err(_)`: 内部エラー（環境変数の取得失敗など）
pub fn authenticate_admin_request(req: &Request, env: &Env) -> Result<Option<Response>> {
    // 環境変数からAPIキーを取得
    let expected_key = match get_admin_api_key_from_env(env) {
        Ok(key) => key,
        Err(_e) => {
            worker::console_log!("[Auth] 環境変数の取得に失敗");
            // 環境変数が設定されていない場合は500エラーを返す
            let error_response = ErrorResponse::new(
                ErrorCode::InternalError,
                "サーバー設定エラー: 認証設定が不完全です".to_string(),
                Some(false),
            );
            let response = error_response.to_response(500)?;
            let response_with_cors = add_cors_headers(response)?;
            return Ok(Some(response_with_cors));
        }
    };

    // リクエストからAPIキーを抽出
    let Some(provided_key) = extract_api_key_from_request(req) else {
        worker::console_log!("[Auth] Authorizationヘッダーが見つかりません");
        let error_response = ErrorResponse::new(
            ErrorCode::Unauthorized,
            "認証が必要です。Authorizationヘッダーを提供してください".to_string(),
            Some(false),
        );
        let response = error_response.to_response(401)?;
        let response_with_cors = add_cors_headers(response)?;
        return Ok(Some(response_with_cors));
    };

    // APIキーを比較（タイミング攻撃を防ぐため、定数時間比較を使用）
    if !constant_time_eq(&provided_key, &expected_key) {
        worker::console_log!("[Auth] APIキーが一致しません");
        let error_response = ErrorResponse::new(
            ErrorCode::Forbidden,
            "認証に失敗しました。無効なAPIキーです".to_string(),
            Some(false),
        );
        let response = error_response.to_response(403)?;
        let response_with_cors = add_cors_headers(response)?;
        return Ok(Some(response_with_cors));
    }

    worker::console_log!("[Auth] 認証成功");
    Ok(None)
}

/// 定数時間での文字列比較（タイミング攻撃対策）
///
/// 実際のCloudflare Workers環境では、この実装は完全な定数時間保証を
/// 提供しませんが、基本的な保護を提供します。
fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }

    a.bytes()
        .zip(b.bytes())
        .map(|(x, y)| x ^ y)
        .fold(0, |acc, x| acc | x)
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_api_key_bearer() {
        // このテストは実際のRequestオブジェクトが必要なため、
        // 統合テストとして実装する必要があります
    }

    #[test]
    fn test_constant_time_eq() {
        assert!(constant_time_eq("test", "test"));
        assert!(!constant_time_eq("test", "test1"));
        assert!(!constant_time_eq("test1", "test"));
        assert!(!constant_time_eq("test", "TEST"));
        assert!(constant_time_eq("", ""));
    }
}
