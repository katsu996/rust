//! `OpenAPI` ドキュメント定義モジュール

#![allow(clippy::needless_for_each)]

use utoipa::OpenApi;

use crate::models::{CalculationResult, WelcomeResponse};

/// `OpenAPI` ドキュメント定義
///
/// title, description, version, authors は `Cargo.toml` から自動取得
#[derive(OpenApi)]
#[openapi(
    paths(root, add, sub),
    components(schemas(WelcomeResponse, CalculationResult)),
    tags(
        (name = "General", description = "一般エンドポイント"),
        (name = "Calculator", description = "計算エンドポイント")
    )
)]
pub struct ApiDoc;

/// API 情報
///
/// API のウェルカムメッセージと利用可能なエンドポイント一覧を返します
#[allow(dead_code)]
#[utoipa::path(
    get,
    path = "/",
    tag = "General",
    responses(
        (status = 200, description = "API 情報", body = WelcomeResponse)
    )
)]
fn root() {}

/// 足し算
///
/// 2つの数値を足し算します
#[allow(dead_code)]
#[utoipa::path(
    get,
    path = "/math/add",
    tag = "Calculator",
    params(
        ("a" = f64, Query, description = "1つ目の数値"),
        ("b" = f64, Query, description = "2つ目の数値")
    ),
    responses(
        (status = 200, description = "計算結果", body = CalculationResult)
    )
)]
fn add() {}

/// 引き算
///
/// 2つの数値を引き算します（a - b）
#[allow(dead_code)]
#[utoipa::path(
    get,
    path = "/math/sub",
    tag = "Calculator",
    params(
        ("a" = f64, Query, description = "1つ目の数値"),
        ("b" = f64, Query, description = "2つ目の数値")
    ),
    responses(
        (status = 200, description = "計算結果", body = CalculationResult)
    )
)]
fn sub() {}

/// `OpenAPI` スキーマを JSON 文字列として取得
pub fn get_openapi_json() -> String {
    ApiDoc::openapi().to_pretty_json().unwrap()
}
