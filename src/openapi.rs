//! `OpenAPI` ドキュメント定義モジュール

#![allow(clippy::needless_for_each)]

use utoipa::OpenApi;

use crate::models::{
    BenchmarkResult, CalculationResult, CreateRoomRequest, CreateRoomResponse, ErrorInfo,
    JoinRoomRequest, JoinRoomResponse, QuickMatchRequest, QuickMatchResponse, RoomErrorResponse,
    RoomSettings, WelcomeResponse,
};

/// `OpenAPI` ドキュメント定義
///
/// title, description, version, authors は `Cargo.toml` から自動取得
#[derive(OpenApi)]
#[openapi(
    info(
        title = "Rust API",
        description = "Cloudflare Workersで動作するRustベースの計算APIとゲームルーム管理API。WebSocketによるリアルタイム通信をサポートしています。",
        version = "1.0.0"
    ),
    paths(
        crate::openapi::root,
        crate::openapi::add,
        crate::openapi::sub,
        crate::openapi::benchmark_add_array,
        crate::openapi::quick_match,
        crate::openapi::create_room,
        crate::openapi::join_room,
        crate::openapi::websocket
    ),
    components(schemas(
        WelcomeResponse,
        CalculationResult,
        BenchmarkResult,
        RoomSettings,
        QuickMatchRequest,
        QuickMatchResponse,
        CreateRoomRequest,
        CreateRoomResponse,
        JoinRoomRequest,
        JoinRoomResponse,
        ErrorInfo,
        RoomErrorResponse
    )),
    tags(
        (name = "General", description = "一般エンドポイント"),
        (name = "Math", description = "計算エンドポイント"),
        (name = "Benchmark", description = "ベンチマークエンドポイント"),
        (name = "Rooms", description = "ルーム管理エンドポイント（Quick Match、カスタムルーム作成・参加）"),
        (name = "WebSocket", description = "WebSocket接続（リアルタイム通信）")
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
    tag = "Math",
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
/// 2つの数値を引き算します
#[allow(dead_code)]
#[utoipa::path(
    get,
    path = "/math/sub",
    tag = "Math",
    params(
        ("a" = f64, Query, description = "1つ目の数値"),
        ("b" = f64, Query, description = "2つ目の数値")
    ),
    responses(
        (status = 200, description = "計算結果", body = CalculationResult)
    )
)]
fn sub() {}

/// ベンチマーク
///
/// 配列の各要素に+1する処理を指定回数実行し、実行時間を計測します。
/// 各言語ごとの実行速度の比較、ベンチマークで使用することを目的としています
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

/// Quick Match
///
/// 空きのあるQuick matchルームを検索し、見つからなければ新規作成します。
#[allow(dead_code)]
#[utoipa::path(
    post,
    path = "/api/rooms/quick-match",
    tag = "Rooms",
    request_body = QuickMatchRequest,
    responses(
        (status = 200, description = "ルームID", body = QuickMatchResponse),
        (status = 500, description = "サーバーエラー", body = RoomErrorResponse)
    )
)]
fn quick_match() {}

/// カスタムルーム作成
///
/// カスタム設定でルームを作成し、roomCodeを発行します。
#[allow(dead_code)]
#[utoipa::path(
    post,
    path = "/api/rooms/create-room",
    tag = "Rooms",
    request_body = CreateRoomRequest,
    responses(
        (status = 200, description = "ルームIDとルームコード", body = CreateRoomResponse),
        (status = 500, description = "サーバーエラー", body = RoomErrorResponse)
    )
)]
fn create_room() {}

/// カスタムルーム参加
///
/// roomCodeを使用してカスタムルームに参加します。
#[allow(dead_code)]
#[utoipa::path(
    post,
    path = "/api/rooms/join-room",
    tag = "Rooms",
    request_body = JoinRoomRequest,
    responses(
        (status = 200, description = "ルームID", body = JoinRoomResponse),
        (status = 400, description = "ルームが満員", body = RoomErrorResponse),
        (status = 404, description = "ルームが見つからない", body = RoomErrorResponse),
        (status = 500, description = "サーバーエラー", body = RoomErrorResponse)
    )
)]
fn join_room() {}

/// WebSocket接続
///
/// WebSocket接続を確立し、ゲームセッションに参加します。
/// ルームIDは `/api/rooms/quick-match` または `/api/rooms/create-room` で取得できます。
///
/// **注意**: `OpenAPI` 3.1ではWebSocketを直接サポートしていないため、
/// このエンドポイントは説明のみです。実際の接続にはWebSocketクライアントが必要です。
#[allow(dead_code)]
#[utoipa::path(
    get,
    path = "/ws",
    tag = "WebSocket",
    params(
        ("roomId" = String, Query, description = "ルームID（/api/rooms/quick-match または /api/rooms/create-room で取得）")
    ),
    responses(
        (status = 101, description = "WebSocket接続が確立されました（Switching Protocols）"),
        (status = 400, description = "無効なリクエスト（roomIdが欠如しているなど）"),
        (status = 403, description = "Originが許可されていません"),
        (status = 426, description = "WebSocketアップグレードが必要です")
    )
)]
fn websocket() {}

/// `OpenAPI` スキーマを JSON 文字列として取得
pub fn get_openapi_json() -> String {
    ApiDoc::openapi()
        .to_pretty_json()
        .unwrap_or_else(|e| {
            worker::console_log!("Failed to generate OpenAPI JSON: {:?}", e);
            // エラー時は空のJSONを返す
            r#"{"openapi":"3.1.0","info":{"title":"Rust API","version":"1.0.0"},"paths":{},"components":{},"tags":[]}"#.to_string()
        })
}
