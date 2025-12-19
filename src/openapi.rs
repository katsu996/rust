//! `OpenAPI` ドキュメント定義モジュール

#![allow(clippy::needless_for_each)]

use utoipa::OpenApi;

use crate::models::{BenchmarkResult, CalculationResult, WelcomeResponse};

/// `OpenAPI` ドキュメント定義
///
/// title, description, version, authors は `Cargo.toml` から自動取得
#[derive(OpenApi)]
#[openapi(
    paths(
        crate::openapi::root,
        crate::openapi::add,
        crate::openapi::sub,
        crate::openapi::benchmark_add_array
    ),
    components(schemas(WelcomeResponse, CalculationResult, BenchmarkResult)),
    tags(
        (name = "General", description = "一般エンドポイント"),
        (name = "Calculator", description = "計算エンドポイント"),
        (name = "Benchmark", description = "ベンチマークエンドポイント")
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

/// ベンチマーク: add_array
///
/// 配列の各要素に+1する処理を指定回数実行し、実行時間を計測します。
/// 各言語ごとの実行速度の比較、ベンチマークで使用することを目的としています。
#[allow(dead_code)]
#[utoipa::path(
    get,
    path = "/benchmark/add_array",
    tag = "Benchmark",
    params(
        ("n" = Option<u64>, Query, description = "配列の要素数（デフォルト: 10000）"),
        ("x" = Option<u64>, Query, description = "処理を繰り返す回数（デフォルト: 10000）"),
        ("iterations" = Option<u64>, Query, description = "ベンチマークの実行回数（デフォルト: 10）")
    ),
    responses(
        (status = 200, description = "ベンチマーク結果", body = BenchmarkResult)
    )
)]
fn benchmark_add_array() {}

/// `OpenAPI` スキーマを JSON 文字列として取得
pub fn get_openapi_json() -> String {
    ApiDoc::openapi().to_pretty_json().unwrap()
}
