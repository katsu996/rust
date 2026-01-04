import { RoomInfo, RoomSettings } from "./types";

/**
 * RoomManager Durable Object
 * マッチング/ルーム一覧を管理する集中コンポーネント
 */
export class RoomManager {
  // Durable Object State
  ctx: DurableObjectState;
  env: Env;

  // メモリ上の状態
  private rooms: Map<string, RoomInfo> = new Map();
  private codeToRoomId: Map<string, string> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  /**
   * fetch メソッド
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // HTTP リクエストの処理
    if (request.method === "GET") {
      if (path === "/list-rooms") {
        return this.handleListRooms();
      }
    } else if (request.method === "POST") {
      if (path === "/quick-match") {
        return this.handleQuickMatchJoin(request);
      } else if (path === "/create-room") {
        return this.handleCustomRoomCreate(request);
      } else if (path === "/join-room") {
        return this.handleCustomRoomJoin(request);
      } else if (path === "/register-room") {
        return this.handleRegisterRoom(request);
      } else if (path === "/leave-room") {
        return this.handleLeaveRoom(request);
      } else if (path === "/delete-room") {
        return this.handleDeleteRoom(request);
      }
    } else if (request.method === "DELETE") {
      if (path === "/delete-room") {
        return this.handleDeleteRoom(request);
      }
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Quick match ルームの検索・作成・参加
   */
  private async handleQuickMatchJoin(request: Request): Promise<Response> {
    await this.restoreState();

    // クリーンアップを実行
    await this.cleanupTimedOutPlayers();

    const body = await request.json<{ playerId: string; settings?: RoomSettings }>();
    const { playerId, settings } = body;

    if (!playerId) {
      console.error(`[RoomManager] playerId is missing in request body`);
      return new Response(
        JSON.stringify({
          error: {
            code: "INVALID_REQUEST",
            message: "playerId is required",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[RoomManager] Quick match request for playerId: ${playerId}`);

    // デフォルト設定
    const defaultSettings: RoomSettings = {
      maxWins: 3,
      maxFalseStarts: 3,
      allowFalseStarts: true,
      maxPlayers: 2,
    };
    const roomSettings = settings || defaultSettings;

    // プレイヤーが既に他のルームに参加しているかチェック
    // 既存のルームから退出してから新しいクイックマッチに参加できるようにする
    // ただし、WebSocket接続済み（playerConnectedAtが記録されている）の場合は削除しない
    for (const [existingRoomId, room] of this.rooms.entries()) {
      if (room.playerIds.has(playerId)) {
        const isConnected = room.playerConnectedAt.has(playerId);
        if (isConnected) {
          console.log(`[RoomManager] Player ${playerId} is already connected to room ${existingRoomId}, skipping removal`);
          // WebSocket接続済みの場合は、既存のルームIDを返す
          await this.saveState();
          return new Response(
            JSON.stringify({
              roomId: existingRoomId,
            }),
            {
              headers: { "Content-Type": "application/json" },
            }
          );
        } else {
          console.log(`[RoomManager] Player ${playerId} is in room ${existingRoomId} but not connected, removing from existing room`);
          // 既存のルームから退出
          room.playerIds.delete(playerId);
          room.playerJoinedAt.delete(playerId);
          room.playerConnectedAt.delete(playerId);

          // ルームが空になったら削除
          if (room.playerIds.size === 0) {
            this.rooms.delete(existingRoomId);
            if (room.code) {
              this.codeToRoomId.delete(room.code);
            }
            console.log(`[RoomManager] Deleted empty room ${existingRoomId}`);
          }
        }
      }
    }

    // 空きのある quick match ルームを検索
    // まず、設定が完全一致するルームを探す
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

    // 設定が一致するルームが見つからない場合、maxPlayersが一致するルームを探す
    // （クイックマッチではmaxPlayersが最も重要な設定）
    if (!availableRoom) {
      for (const room of this.rooms.values()) {
        if (
          room.matchType === "quick" &&
          room.playerIds.size < room.settings.maxPlayers &&
          room.settings.maxPlayers === roomSettings.maxPlayers
        ) {
          availableRoom = room;
          break;
        }
      }
    }

    let roomId: string;
    const now = Date.now();
    if (availableRoom) {
      // 既存ルームに参加
      roomId = availableRoom.roomId;
      // 既に参加している場合は追加しない（念のため）
      if (!availableRoom.playerIds.has(playerId)) {
        availableRoom.playerIds.add(playerId);
        // WebSocket接続が確立されるまでの間、playerJoinedAtに記録（クリーンアップ用）
        availableRoom.playerJoinedAt.set(playerId, now);
      }
    } else {
      // 新規ルームを作成
      roomId = this.generateRoomId();
      const newRoom: RoomInfo = {
        roomId,
        matchType: "quick",
        playerIds: new Set([playerId]),
        settings: roomSettings,
        // WebSocket接続が確立されるまでの間、playerJoinedAtに記録（クリーンアップ用）
        playerJoinedAt: new Map([[playerId, now]]),
        playerConnectedAt: new Map(),
      };
      this.rooms.set(roomId, newRoom);
      console.log(`[RoomManager] Created new quick match room ${roomId} for player ${playerId}`);
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

    let body: {
      playerId: string;
      customRoomSettings: RoomSettings;
    };
    try {
      body = await request.json<{
        playerId: string;
        customRoomSettings: RoomSettings;
      }>();
    } catch (error) {
      console.error(`[RoomManager] Failed to parse request body:`, error);
      return new Response(
        JSON.stringify({
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid JSON in request body",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { playerId, customRoomSettings } = body;

    // 入力検証
    if (!playerId || typeof playerId !== "string" || playerId.trim().length === 0) {
      console.error(`[RoomManager] playerId is missing or invalid in request body`);
      return new Response(
        JSON.stringify({
          error: {
            code: "INVALID_REQUEST",
            message: "playerId is required and must be a non-empty string",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (
      !customRoomSettings ||
      typeof customRoomSettings !== "object" ||
      Array.isArray(customRoomSettings)
    ) {
      console.error(`[RoomManager] customRoomSettings is missing or invalid in request body`);
      return new Response(
        JSON.stringify({
          error: {
            code: "INVALID_REQUEST",
            message: "customRoomSettings is required and must be an object",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // customRoomSettingsの各フィールドを検証
    if (
      typeof customRoomSettings.maxWins !== "number" ||
      typeof customRoomSettings.maxFalseStarts !== "number" ||
      typeof customRoomSettings.allowFalseStarts !== "boolean" ||
      typeof customRoomSettings.maxPlayers !== "number"
    ) {
      console.error(
        `[RoomManager] customRoomSettings has invalid fields:`,
        customRoomSettings
      );
      return new Response(
        JSON.stringify({
          error: {
            code: "INVALID_REQUEST",
            message:
              "customRoomSettings must contain valid maxWins (number), maxFalseStarts (number), allowFalseStarts (boolean), and maxPlayers (number)",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 新規ルームIDとroomCodeを生成
    const roomId = this.generateRoomId();
    const roomCode = this.generateRoomCode();
    const now = Date.now();

    const newRoom: RoomInfo = {
      roomId,
      code: roomCode,
      matchType: "custom",
      playerIds: new Set([playerId]),
      settings: customRoomSettings,
      playerJoinedAt: new Map([[playerId, now]]),
      playerConnectedAt: new Map(),
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
    const now = Date.now();
    room.playerIds.add(playerId);
    room.playerJoinedAt.set(playerId, now);
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
   * ルーム一覧取得
   */
  private async handleListRooms(): Promise<Response> {
    console.log(`[RoomManager] handleListRooms called`);
    await this.restoreState();

    // クリーンアップを実行
    await this.cleanupTimedOutPlayers();

    console.log(`[RoomManager] Current rooms in memory: ${this.rooms.size}`);

    // デフォルト設定
    const defaultSettings: RoomSettings = {
      maxWins: 3,
      maxFalseStarts: 3,
      allowFalseStarts: true,
      maxPlayers: 2,
    };

    const roomsList = Array.from(this.rooms.values()).map((room) => {
      // settingsがundefinedの場合はデフォルト設定を使用
      const settings = room.settings || defaultSettings;

      return {
        roomId: room.roomId,
        matchType: room.matchType,
        playerCount: room.playerIds.size,
        maxPlayers: settings.maxPlayers,
        settings: settings,
        code: room.code,
        playerIds: Array.from(room.playerIds),
      };
    });

    console.log(`[RoomManager] Returning ${roomsList.length} rooms`);
    const response = JSON.stringify({ rooms: roomsList });
    console.log(`[RoomManager] Response: ${response.substring(0, 500)}...`);

    return new Response(response, {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * ルームを登録（GameSessionから呼び出される）
   */
  private async handleRegisterRoom(request: Request): Promise<Response> {
    console.log(`[RoomManager] handleRegisterRoom called`);
    await this.restoreState();

    try {
      const body = await request.json<{
        roomId: string;
        playerId: string;
        matchType?: "quick" | "custom";
        settings?: RoomSettings;
      }>();
      const { roomId, playerId, matchType = "quick", settings } = body;

      console.log(`[RoomManager] Registering room ${roomId} for player ${playerId}, matchType: ${matchType}`);

      // 既存のルームを取得または新規作成
      let room = this.rooms.get(roomId);
      const now = Date.now();
      if (!room) {
        // デフォルト設定
        const defaultSettings: RoomSettings = {
          maxWins: 3,
          maxFalseStarts: 3,
          allowFalseStarts: true,
          maxPlayers: 2,
        };
        const roomSettings = settings || defaultSettings;

        room = {
          roomId,
          matchType,
          playerIds: new Set([playerId]),
          settings: roomSettings,
          playerJoinedAt: new Map(),
          playerConnectedAt: new Map([[playerId, now]]),
        };
        this.rooms.set(roomId, room);
        console.log(`[RoomManager] Created new room ${roomId} for player ${playerId}`);
      } else {
        // 既存のルームにプレイヤーを追加（まだ登録されていない場合）
        if (!room.playerIds.has(playerId)) {
          // ルームが満員かチェック
          if (room.playerIds.size >= room.settings.maxPlayers) {
            console.error(`[RoomManager] Room ${roomId} is full (${room.playerIds.size}/${room.settings.maxPlayers})`);
            return new Response(
              JSON.stringify({
                success: false,
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
          room.playerIds.add(playerId);
          console.log(`[RoomManager] Added player ${playerId} to existing room ${roomId} (current players: ${Array.from(room.playerIds).join(", ")})`);
        } else {
          console.log(`[RoomManager] Player ${playerId} already in room ${roomId} (current players: ${Array.from(room.playerIds).join(", ")})`);
        }
        // プレイヤーが接続したことを記録
        this.markPlayerConnected(playerId, roomId);
      }

      await this.saveState();
      console.log(`[RoomManager] Room ${roomId} registered successfully. Total rooms: ${this.rooms.size}`);

      return new Response(
        JSON.stringify({
          success: true,
          roomId,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error(`[RoomManager] Error in handleRegisterRoom:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: errorMessage,
          },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  /**
   * ルームから退出
   */
  async handleRoomLeave(playerId: string, roomId: string): Promise<void> {
    await this.restoreState();

    const room = this.rooms.get(roomId);
    if (room) {
      room.playerIds.delete(playerId);
      room.playerJoinedAt.delete(playerId);
      room.playerConnectedAt.delete(playerId);

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
   * ルームから退出（HTTP経由）
   */
  private async handleLeaveRoom(request: Request): Promise<Response> {
    await this.restoreState();

    const body = await request.json<{
      playerId: string;
      roomId: string;
    }>();
    const { playerId, roomId } = body;

    if (!playerId || !roomId) {
      return new Response(
        JSON.stringify({
          error: {
            code: "INVALID_REQUEST",
            message: "playerId and roomId are required",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    await this.handleRoomLeave(playerId, roomId);

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * ルームを削除（管理用）
   */
  async deleteRoom(roomId: string): Promise<void> {
    await this.restoreState();

    const room = this.rooms.get(roomId);
    if (room) {
      // ルームコードがある場合は削除
      if (room.code) {
        this.codeToRoomId.delete(room.code);
      }
      // ルームを削除
      this.rooms.delete(roomId);
      console.log(`[RoomManager] Deleted room ${roomId}`);
    }

    await this.saveState();
  }

  /**
   * ルーム削除（HTTP経由）
   */
  private async handleDeleteRoom(request: Request): Promise<Response> {
    await this.restoreState();

    const body = await request.json<{
      roomId: string;
    }>();
    const { roomId } = body;

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

    await this.deleteRoom(roomId);

    return new Response(
      JSON.stringify({
        success: true,
        roomId,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * タイムアウトしたプレイヤーをクリーンアップ
   */
  private async cleanupTimedOutPlayers(): Promise<void> {
    const now = Date.now();
    const WEBSOCKET_CONNECTION_TIMEOUT = 30 * 1000; // 30秒
    const MATCHING_WAIT_TIMEOUT = 300 * 1000; // 300秒（5分）

    const roomsToDelete: string[] = [];

    for (const [roomId, room] of this.rooms.entries()) {
      const playersToRemove: string[] = [];

      // WebSocket接続タイムアウト（30秒）のチェック
      for (const [playerId, joinedAt] of room.playerJoinedAt.entries()) {
        const connectedAt = room.playerConnectedAt.get(playerId);
        // playerJoinedAtが記録されているが、playerConnectedAtが記録されていない場合
        if (!connectedAt) {
          const elapsed = now - joinedAt;
          if (elapsed > WEBSOCKET_CONNECTION_TIMEOUT) {
            console.log(`[RoomManager] Removing player ${playerId} from room ${roomId} due to WebSocket connection timeout`);
            playersToRemove.push(playerId);
          }
        }
      }

      // マッチング待ちタイムアウト（300秒）のチェック
      // WebSocket接続は確立されているが、ルームが満員になっていない場合
      if (room.playerIds.size < room.settings.maxPlayers) {
        for (const [playerId, connectedAt] of room.playerConnectedAt.entries()) {
          const elapsed = now - connectedAt;
          if (elapsed > MATCHING_WAIT_TIMEOUT) {
            console.log(`[RoomManager] Removing player ${playerId} from room ${roomId} due to matching wait timeout`);
            playersToRemove.push(playerId);
          }
        }
      }

      // タイムアウトしたプレイヤーを削除
      for (const playerId of playersToRemove) {
        room.playerIds.delete(playerId);
        room.playerJoinedAt.delete(playerId);
        room.playerConnectedAt.delete(playerId);
      }

      // ルームが空になったら削除
      if (room.playerIds.size === 0) {
        roomsToDelete.push(roomId);
      }
    }

    // 空になったルームを削除
    for (const roomId of roomsToDelete) {
      const room = this.rooms.get(roomId);
      if (room && room.code) {
        this.codeToRoomId.delete(room.code);
      }
      this.rooms.delete(roomId);
      console.log(`[RoomManager] Deleted empty room ${roomId}`);
    }
  }

  /**
   * プレイヤーが接続したことを記録
   */
  private markPlayerConnected(playerId: string, roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const now = Date.now();
    room.playerConnectedAt.set(playerId, now);
    // playerJoinedAtをクリア（接続が確立されたので不要）
    room.playerJoinedAt.delete(playerId);
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
   * ルームIDを生成（UUID v4）
   */
  private generateRoomId(): string {
    // crypto.randomUUID()はCloudflare Workersでサポートされている
    return crypto.randomUUID();
  }

  /**
   * roomCodeを生成（4桁の数字）
   */
  private generateRoomCode(): string {
    const digits = "0123456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += digits.charAt(Math.floor(Math.random() * digits.length));
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
        playerJoinedAt: Array.from(room.playerJoinedAt.entries()),
        playerConnectedAt: Array.from(room.playerConnectedAt.entries()),
      })),
      codeToRoomId: Array.from(this.codeToRoomId.entries()),
    };
    await this.ctx.storage.put("rooms", serializableState);
  }

  /**
   * 状態を復元
   */
  private async restoreState(): Promise<void> {
    const stored = await this.ctx.storage.get<any>("rooms");
    if (stored) {
      // デフォルト設定
      const defaultSettings: RoomSettings = {
        maxWins: 3,
        maxFalseStarts: 3,
        allowFalseStarts: true,
        maxPlayers: 2,
      };

      this.rooms = new Map(
        stored.rooms.map((r: any) => [
          r.roomId,
          {
            roomId: r.roomId,
            code: r.code,
            matchType: r.matchType,
            playerIds: new Set(r.playerIds || []),
            // settingsがundefinedの場合はデフォルト設定を使用
            settings: r.settings || defaultSettings,
            // playerJoinedAtとplayerConnectedAtを復元（後方互換性のため、存在しない場合は空のMap）
            playerJoinedAt: r.playerJoinedAt ? new Map(r.playerJoinedAt) : new Map(),
            playerConnectedAt: r.playerConnectedAt ? new Map(r.playerConnectedAt) : new Map(),
          },
        ])
      );
      this.codeToRoomId = new Map(stored.codeToRoomId || []);
    }
  }
}

/**
 * Env インターフェース（必要に応じて拡張）
 */
interface Env {
  // 将来の環境変数やバインディング
}
