import { RoomInfo, RoomSettings, ClientMessage } from "./types";

/**
 * RoomManager Durable Object
 * マッチング/ルーム一覧を管理する集中コンポーネント
 */
export class RoomManager {
  private state: DurableObjectState;
  private env: Env;

  // メモリ上の状態
  private rooms: Map<string, RoomInfo> = new Map();
  private codeToRoomId: Map<string, string> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /**
   * fetch メソッド
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // HTTP リクエストの処理
    if (request.method === "POST") {
      if (path === "/quick-match") {
        return this.handleQuickMatchJoin(request);
      } else if (path === "/create-room") {
        return this.handleCustomRoomCreate(request);
      } else if (path === "/join-room") {
        return this.handleCustomRoomJoin(request);
      }
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Quick match ルームの検索・作成・参加
   */
  private async handleQuickMatchJoin(request: Request): Promise<Response> {
    await this.restoreState();

    const body = await request.json<{ playerId: string; settings?: RoomSettings }>();
    const { playerId, settings } = body;

    // デフォルト設定
    const defaultSettings: RoomSettings = {
      maxWins: 3,
      maxFalseStarts: 3,
      allowFalseStarts: true,
      maxPlayers: 2,
    };
    const roomSettings = settings || defaultSettings;

    // 空きのある quick match ルームを検索
    let availableRoom: RoomInfo | null = null;
    for (const room of this.rooms.values()) {
      if (
        room.matchType === "quick" &&
        room.playerIds.size < room.settings.maxPlayers &&
        this.isSettingsMatch(room.settings, roomSettings)
      ) {
        availableRoom = room;
        break;
      }
    }

    let roomId: string;
    if (availableRoom) {
      // 既存ルームに参加
      roomId = availableRoom.roomId;
      availableRoom.playerIds.add(playerId);
    } else {
      // 新規ルームを作成
      roomId = this.generateRoomId();
      const newRoom: RoomInfo = {
        roomId,
        matchType: "quick",
        playerIds: new Set([playerId]),
        settings: roomSettings,
      };
      this.rooms.set(roomId, newRoom);
    }

    await this.saveState();

    return new Response(
      JSON.stringify({
        roomId,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * カスタムルームの作成
   */
  private async handleCustomRoomCreate(request: Request): Promise<Response> {
    await this.restoreState();

    const body = await request.json<{
      playerId: string;
      customRoomSettings: RoomSettings;
    }>();
    const { playerId, customRoomSettings } = body;

    // 新規ルームIDとroomCodeを生成
    const roomId = this.generateRoomId();
    const roomCode = this.generateRoomCode();

    const newRoom: RoomInfo = {
      roomId,
      code: roomCode,
      matchType: "custom",
      playerIds: new Set([playerId]),
      settings: customRoomSettings,
    };

    this.rooms.set(roomId, newRoom);
    this.codeToRoomId.set(roomCode, roomId);

    await this.saveState();

    return new Response(
      JSON.stringify({
        roomId,
        roomCode,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * カスタムルームへの参加（roomCode使用）
   */
  private async handleCustomRoomJoin(request: Request): Promise<Response> {
    await this.restoreState();

    const body = await request.json<{ playerId: string; roomCode: string }>();
    const { playerId, roomCode } = body;

    // roomCodeからroomIdを取得
    const roomId = this.codeToRoomId.get(roomCode);
    if (!roomId) {
      return new Response(
        JSON.stringify({
          error: {
            code: "ROOM_NOT_FOUND",
            message: "Room not found",
          },
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return new Response(
        JSON.stringify({
          error: {
            code: "ROOM_NOT_FOUND",
            message: "Room not found",
          },
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // ルームが満員かチェック
    if (room.playerIds.size >= room.settings.maxPlayers) {
      return new Response(
        JSON.stringify({
          error: {
            code: "ROOM_FULL",
            message: "Room is full",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // プレイヤーを追加
    room.playerIds.add(playerId);
    await this.saveState();

    return new Response(
      JSON.stringify({
        roomId,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * ルームから退出
   */
  async handleRoomLeave(playerId: string, roomId: string): Promise<void> {
    await this.restoreState();

    const room = this.rooms.get(roomId);
    if (room) {
      room.playerIds.delete(playerId);

      // ルームが空になったら削除
      if (room.playerIds.size === 0) {
        this.rooms.delete(roomId);
        if (room.code) {
          this.codeToRoomId.delete(room.code);
        }
      }
    }

    await this.saveState();
  }

  /**
   * 設定が一致するかチェック
   */
  private isSettingsMatch(a: RoomSettings, b: RoomSettings): boolean {
    return (
      a.maxWins === b.maxWins &&
      a.maxFalseStarts === b.maxFalseStarts &&
      a.allowFalseStarts === b.allowFalseStarts &&
      a.maxPlayers === b.maxPlayers
    );
  }

  /**
   * ルームIDを生成
   */
  private generateRoomId(): string {
    return `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * roomCodeを生成（4文字の英数字）
   */
  private generateRoomCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * 状態を保存
   */
  private async saveState(): Promise<void> {
    const serializableState = {
      rooms: Array.from(this.rooms.entries()).map(([roomId, room]) => ({
        roomId,
        code: room.code,
        matchType: room.matchType,
        playerIds: Array.from(room.playerIds),
        settings: room.settings,
      })),
      codeToRoomId: Array.from(this.codeToRoomId.entries()),
    };
    await this.state.storage.put("rooms", serializableState);
  }

  /**
   * 状態を復元
   */
  private async restoreState(): Promise<void> {
    const stored = await this.state.storage.get<any>("rooms");
    if (stored) {
      this.rooms = new Map(
        stored.rooms.map((r: any) => [
          r.roomId,
          {
            roomId: r.roomId,
            code: r.code,
            matchType: r.matchType,
            playerIds: new Set(r.playerIds),
            settings: r.settings,
          },
        ])
      );
      this.codeToRoomId = new Map(stored.codeToRoomId);
    }
  }
}

/**
 * Env インターフェース（必要に応じて拡張）
 */
interface Env {
  // 将来の環境変数やバインディング
}

