use serde::Serialize;
use utoipa::ToSchema;

/// ルーム設定
#[derive(Serialize, ToSchema)]
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
#[derive(Serialize, ToSchema)]
pub struct QuickMatchRequest {
    /// プレイヤーID
    #[schema(example = "player-123")]
    pub player_id: String,
    /// ルーム設定（オプション）
    pub settings: Option<RoomSettings>,
}

/// Quick Match レスポンス
#[derive(Serialize, ToSchema)]
pub struct QuickMatchResponse {
    /// ルームID
    #[schema(example = "room-1234567890-abc123")]
    pub room_id: String,
}

/// カスタムルーム作成リクエスト
#[derive(Serialize, ToSchema)]
pub struct CreateRoomRequest {
    /// プレイヤーID
    #[schema(example = "player-123")]
    pub player_id: String,
    /// カスタムルーム設定
    pub custom_room_settings: RoomSettings,
}

/// カスタムルーム作成レスポンス
#[derive(Serialize, ToSchema)]
pub struct CreateRoomResponse {
    /// ルームID
    #[schema(example = "room-1234567890-abc123")]
    pub room_id: String,
    /// ルームコード（4文字の英数字）
    #[schema(example = "ABCD")]
    pub room_code: String,
}

/// ルーム参加リクエスト
#[derive(Serialize, ToSchema)]
pub struct JoinRoomRequest {
    /// プレイヤーID
    #[schema(example = "player-456")]
    pub player_id: String,
    /// ルームコード
    #[schema(example = "ABCD")]
    pub room_code: String,
}

/// ルーム参加レスポンス
#[derive(Serialize, ToSchema)]
pub struct JoinRoomResponse {
    /// ルームID
    #[schema(example = "room-1234567890-abc123")]
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
