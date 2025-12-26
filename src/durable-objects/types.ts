/**
 * メッセージ型定義
 * 既存のTypeScriptクライアントと互換性を保つ
 */

// ClientMessage.action の型
export type ClientMessageAction =
  | "join_room"
  | "create_room"
  | "round_start"
  | "exclamation_show"
  | "player_reaction"
  | "false_start"
  | "ready_toggle"
  | "rematch_request"
  | "rematch_response";

// ServerMessage.type の型
export type ServerMessageType =
  | "connection_established"
  | "room_joined"
  | "room_created"
  | "player_joined"
  | "player_left"
  | "host_changed"
  | "round_start"
  | "exclamation_show"
  | "player_reaction"
  | "false_start"
  | "round_result"
  | "opponent_info"
  | "opponent_found"
  | "ready_status"
  | "countdown_start"
  | "rematch_request"
  | "rematch_response"
  | "error";

// ClientMessage の型定義
export interface ClientMessage {
  action: ClientMessageAction;
  data?: {
    roomId?: string;
    roomCode?: string;
    matchType?: "quick" | "custom";
    playerName?: string;
    reactionFrames?: number;
    waitTime?: number;
    gameStartTime?: number;
    timestamp?: number;
    customRoomSettings?: {
      maxWins?: number;
      maxFalseStarts?: number;
      allowFalseStarts?: boolean;
      maxPlayers?: number;
    };
    [key: string]: any; // その他のフィールド
  };
}

// ServerMessage の型定義
export interface ServerMessage {
  type: ServerMessageType;
  roomId?: string;
  playerId?: string;
  playerCount?: number;
  isHost?: boolean;
  roomPlayers?: PlayerInfo[];
  roomCode?: string;
  reactionFrames?: number;
  winnerId?: string;
  loserId?: string;
  winsByPlayerId?: Record<string, number>;
  falseStartsByPlayerId?: Record<string, number>;
  readyByPlayerId?: Record<string, boolean>;
  countdown?: number;
  gameOver?: boolean;
  gameWinnerId?: string;
  error?: {
    code: string;
    message: string;
  };
  [key: string]: any; // その他のフィールド
}

// プレイヤー情報
export interface PlayerInfo {
  playerId: string;
  playerName: string;
  rating?: number;
  isHost?: boolean;
  isReady?: boolean;
}

// ルーム設定
export interface RoomSettings {
  maxWins: number;
  maxFalseStarts: number;
  allowFalseStarts: boolean;
  maxPlayers: number;
}

// ゲーム状態
export interface GameState {
  inProgress: boolean;
  hostId: string | null;
  reactions: Record<string, number>; // playerId -> reactionFrames
  readyByPlayerId: Record<string, boolean>;
  countdownStarted: boolean;
  winsByPlayerId: Record<string, number>;
  falseStartsByPlayerId: Record<string, number>;
  rematchRequests?: Record<string, boolean>; // playerId -> accepted (rematchに同意したか)
}

// ルーム情報
export interface RoomInfo {
  roomId: string;
  code?: string; // カスタムルーム用コード
  matchType: "quick" | "custom";
  playerIds: Set<string>;
  settings: RoomSettings;
}
