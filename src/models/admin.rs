use serde::Serialize;
use utoipa::ToSchema;

use crate::models::rooms::RoomSettings;

/// 管理画面用: ルーム情報
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminRoomInfo {
    /// ルームID（UUID）
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub room_id: String,
    /// マッチタイプ
    #[schema(example = "quick")]
    pub match_type: String,
    /// プレイヤー数
    #[schema(example = 2)]
    pub player_count: u32,
    /// 最大プレイヤー数
    #[schema(example = 2)]
    pub max_players: u32,
    /// ルーム設定
    pub settings: RoomSettings,
    /// ルームコード（カスタムルームの場合）
    #[schema(example = "1234")]
    pub code: Option<String>,
    /// ゲーム状態（オプション）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_state: Option<serde_json::Value>,
    /// プレイヤー情報（オプション）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub room_players: Option<Vec<serde_json::Value>>,
}

/// 管理画面用: ルーム一覧レスポンス
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminRoomsResponse {
    /// ルーム一覧
    pub rooms: Vec<AdminRoomInfo>,
    /// 総ルーム数
    #[schema(example = 5)]
    pub total_rooms: usize,
    /// アクティブルーム数
    #[schema(example = 3)]
    pub active_rooms: usize,
    /// オンラインユーザー数
    #[schema(example = 8)]
    pub online_users: u32,
}

/// 管理画面用: 統計情報レスポンス
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminStatsResponse {
    /// 総ルーム数
    #[schema(example = 5)]
    pub total_rooms: usize,
    /// アクティブルーム数
    #[schema(example = 3)]
    pub active_rooms: usize,
    /// 満員ルーム数
    #[schema(example = 1)]
    pub full_rooms: usize,
    /// 空きルーム数
    #[schema(example = 2)]
    pub available_rooms: usize,
    /// オンラインユーザー数
    #[schema(example = 8)]
    pub online_users: u32,
    /// Quick Matchルーム数
    #[schema(example = 3)]
    pub quick_match_rooms: usize,
    /// カスタムルーム数
    #[schema(example = 2)]
    pub custom_rooms: usize,
}

/// 管理画面用: ルーム削除レスポンス
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminDeleteRoomResponse {
    /// 成功フラグ
    #[schema(example = true)]
    pub success: bool,
    /// 削除されたルームID
    #[schema(example = "room-1234567890-abc123")]
    pub room_id: String,
}
