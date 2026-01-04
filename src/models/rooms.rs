use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// ルーム設定
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RoomSettings {
    /// 最大勝利数
    #[schema(example = 3)]
    pub max_wins: u32,
    /// 最大お手つき数
    #[schema(example = 3)]
    pub max_false_starts: u32,
    /// お手つきを許可するか
    #[schema(example = true)]
    pub allow_false_starts: bool,
    /// 最大プレイヤー数
    #[schema(example = 2)]
    pub max_players: u32,
}

/// Quick Match リクエスト
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct QuickMatchRequest {
    /// プレイヤーID
    #[schema(example = "player-123")]
    pub player_id: String,
    /// ルーム設定（オプション）
    pub settings: Option<RoomSettings>,
}

/// Quick Match レスポンス
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct QuickMatchResponse {
    /// ルームID（UUID）
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub room_id: String,
}

/// カスタムルーム作成リクエスト
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateRoomRequest {
    /// プレイヤーID
    #[schema(example = "player-123")]
    pub player_id: String,
    /// カスタムルーム設定
    pub custom_room_settings: RoomSettings,
}

/// カスタムルーム作成レスポンス
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateRoomResponse {
    /// ルームID（UUID）
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub room_id: String,
    /// ルームコード（4桁の数字）
    #[schema(example = "1234")]
    pub room_code: String,
}

/// ルーム参加リクエスト
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct JoinRoomRequest {
    /// プレイヤーID
    #[schema(example = "player-456")]
    pub player_id: String,
    /// ルームコード
    #[schema(example = "1234")]
    pub room_code: String,
}

/// ルーム参加レスポンス
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct JoinRoomResponse {
    /// ルームID（UUID）
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub room_id: String,
}

/// エラー情報
#[derive(Serialize, ToSchema)]
pub struct ErrorInfo {
    /// エラーコード
    #[schema(example = "ROOM_NOT_FOUND")]
    pub code: String,
    /// エラーメッセージ
    #[schema(example = "Room not found")]
    pub message: String,
}

/// エラーレスポンス
#[derive(Serialize, ToSchema)]
pub struct RoomErrorResponse {
    /// エラー情報
    pub error: ErrorInfo,
}

/// ルーム退出リクエスト
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LeaveRoomRequest {
    /// プレイヤーID
    #[schema(example = "player-123")]
    pub player_id: String,
    /// ルームID（UUID）
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub room_id: String,
}

/// ルーム退出レスポンス
#[derive(Serialize, ToSchema)]
pub struct LeaveRoomResponse {
    /// 成功フラグ
    #[schema(example = true)]
    pub success: bool,
}
