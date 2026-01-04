import {
  ClientMessage,
  GameState,
  PlayerInfo,
  RoomSettings,
  ServerMessage,
} from "./types";

/**
 * GameSession Durable Object
 * 1つの対戦ルーム（ゲームセッション）単位でWebSocket接続とゲーム状態を管理
 */
export class GameSession {
  // Durable Object State
  ctx: DurableObjectState;
  env: Env;

  // メモリ上の状態
  private players: Map<string, PlayerConnection> = new Map();
  private gameState: GameState;
  private settings: RoomSettings;
  private roomId: string;
  // WebSocket接続と一時的なIDのマッピング（playerIdが確定するまでの追跡用）
  private pendingConnections: Map<WebSocket, string> = new Map(); // WebSocket -> 一時的なID
  // プレイヤーの最後のアクティビティ時刻（タイムアウトチェック用）
  private playerLastActivity: Map<string, number> = new Map(); // playerId -> timestamp

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;

    // デフォルト設定
    this.settings = {
      maxWins: 3,
      maxFalseStarts: 3,
      allowFalseStarts: true,
      maxPlayers: 2,
    };

    this.gameState = {
      inProgress: false,
      hostId: null,
      reactions: {},
      readyByPlayerId: {},
      countdownStarted: false,
      winsByPlayerId: {},
      falseStartsByPlayerId: {},
      rematchRequests: {}, // playerId -> boolean (rematchに同意したか)
    };

    this.roomId = "";
  }

  /**
   * fetch メソッド - WebSocket Upgrade と HTTP リクエストを処理
   */
  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");

    // WebSocket Upgrade リクエストの処理
    if (upgradeHeader === "websocket") {
      try {
        return await this.handleWebSocketUpgrade(request);
      } catch (error) {
        console.error(`[GameSession] Error handling WebSocket upgrade:`, error);
        return new Response(`WebSocket upgrade failed: ${error}`, { status: 500 });
      }
    }

    // HTTP リクエストの処理
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/state") {
      // URLからroomIdを取得（HTTPリクエストの場合）
      const roomIdFromUrl = url.searchParams.get("roomId") || "";
      if (roomIdFromUrl && this.roomId === "") {
        this.roomId = roomIdFromUrl;
      }
      return this.handleGetState();
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * WebSocket Upgrade 処理
   * Rust Workerから転送されたWebSocket接続を処理
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    console.log(`[GameSession] handleWebSocketUpgrade called`);

    // roomId を URL から取得
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") || "";

    console.log(`[GameSession] Extracted roomId from URL: ${roomId}, full URL: ${request.url}`);

    if (!roomId) {
      console.error(`[GameSession] roomId is missing from URL`);
      return new Response("roomId is required", { status: 400 });
    }

    this.roomId = roomId;

    // 状態を復元
    console.log(`[GameSession] Restoring state for roomId: ${roomId}`);
    await this.restoreState();

    // Rust Workerから転送されたWebSocket接続を処理
    // Cloudflare Workersでは、WebSocket接続はRequestから直接取得できないため、
    // WebSocketPairを作成して処理する必要があります
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // WebSocketをacceptする（メッセージ送信前に必要）
    // @ts-ignore - DurableObjectStateの型定義が不完全な可能性がある
    this.ctx.acceptWebSocket(server);

    // 一時的なIDを生成（WebSocket接続を追跡するため）
    // このIDは、join_roomメッセージが送信されるまでの間、WebSocket接続を識別するために使用される
    const tempId = this.generatePlayerId();

    // WebSocket接続と一時的なIDのマッピングを保存
    // プレイヤーは、join_roomメッセージが送信された時点で初めて追加される
    this.pendingConnections.set(server, tempId);

    console.log(`[GameSession] WebSocket connection established with tempId: ${tempId}, waiting for join_room message`);

    // タイムアウト処理: 30秒以内にjoin_roomメッセージが送信されない場合、接続をクリーンアップ
    setTimeout(() => {
      if (this.pendingConnections.has(server)) {
        console.log(`[GameSession] Removing pending connection ${tempId} due to timeout (no join_room message received)`);
        this.pendingConnections.delete(server);
        // WebSocket接続を閉じる
        try {
          server.close(1000, "Timeout: no join_room message received");
        } catch (error) {
          console.error(`[GameSession] Error closing WebSocket:`, error);
        }
      }
    }, 30 * 1000); // 30秒

    // 注意: acceptWebSocketを使う場合、addEventListenerではなく
    // webSocketMessageとwebSocketCloseメソッドが自動的に呼び出されます

    // 注意: RoomManagerへの登録は、join_roomメッセージが送信された時点で行う
    // WebSocket接続時点では、プレイヤーはまだ追加されていないため、登録しない
    console.log(`[GameSession] Room registration will be done when join_room message is received`);

    // 接続確立メッセージを送信（一時的なIDを使用）
    // 注意: この時点ではプレイヤーはまだ追加されていないため、playerIdは一時的なID
    try {
      const messageStr = JSON.stringify({
        type: "connection_established",
        roomId,
        tempId, // 一時的なIDを送信
        isHost: false, // プレイヤーが追加されるまでホストは未確定
      });
      console.log(`[GameSession] Sending connection_established message with tempId: ${tempId}`);
      server.send(messageStr);
    } catch (error) {
      console.error(`[GameSession] Error sending connection_established message:`, error);
    }

    // 注意: この時点ではプレイヤーはまだ追加されていないため、既存プレイヤーへの通知は行わない
    // プレイヤーは、join_roomメッセージが送信された時点で初めて追加される

    // 状態を保存
    this.saveState();

    // クライアント側の WebSocket を返す
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
      },
    });
  }

  /**
   * WebSocket メッセージイベントハンドラー
   * acceptWebSocketで受け入れたWebSocketのメッセージは、このメソッドで処理されます
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    console.log(`[GameSession] webSocketMessage called`);

    // WebSocketからplayerIdまたは一時的なIDを取得
    let playerId = this.getPlayerIdByWebSocket(ws);
    let isPendingConnection = false;

    // プレイヤーがまだ追加されていない場合（pendingConnectionsに存在する場合）
    if (!playerId) {
      const tempId = this.pendingConnections.get(ws);
      if (tempId) {
        console.log(`[GameSession] Message received from pending connection with tempId: ${tempId}`);
        isPendingConnection = true;
        // join_roomメッセージの場合のみ、一時的なIDを使用
        // それ以外のメッセージは、プレイヤーが追加されるまで処理しない
        playerId = tempId;
      } else {
        console.error("[GameSession] Player not found for WebSocket and not in pendingConnections");
        return;
      }
    }

    console.log(`[GameSession] Message received from ${playerId} (type: ${typeof message})`);
    try {
      const messageStr = typeof message === "string" ? message : new TextDecoder().decode(message);
      console.log(`[GameSession] Parsed message string:`, messageStr);
      const parsedMessage: any = JSON.parse(messageStr);
      console.log(`[GameSession] Parsed raw message:`, JSON.stringify(parsedMessage, null, 2));

      // クライアントが送信するメッセージ形式に対応
      // 形式1: { action: "...", data: {...} } (標準形式)
      // 形式2: { id: "...", timestamp: ..., data: { action: "...", data: {...} } } (ラッパー形式)
      let clientMessage: ClientMessage;

      if (parsedMessage.action) {
        // 標準形式: そのまま使用
        clientMessage = parsedMessage as ClientMessage;
        console.log(`[GameSession] Message is in standard format`);
      } else if (parsedMessage.data && parsedMessage.data.action) {
        // ラッパー形式: data.dataからactionとdataを抽出
        console.log(`[GameSession] Message is in wrapped format, extracting from data.data`);
        clientMessage = {
          action: parsedMessage.data.action,
          data: parsedMessage.data.data,
        };
        console.log(`[GameSession] Extracted client message:`, JSON.stringify(clientMessage, null, 2));
      } else {
        // どちらの形式でもない場合
        console.error(`[GameSession] Invalid message format:`, JSON.stringify(parsedMessage, null, 2));
        throw new Error("Invalid message format: missing action field");
      }

      console.log(`[GameSession] Final client message:`, JSON.stringify(clientMessage, null, 2));
      console.log(`[GameSession] Message action: ${clientMessage.action}`);

      // join_roomメッセージの場合、プレイヤーがまだ追加されていない可能性がある
      if (clientMessage.action === "join_room") {
        console.log(`[GameSession] join_room message detected, calling handleJoinRoomFromWebSocket`);
        // handleJoinRoomFromWebSocketで、WebSocket接続から直接処理する
        try {
          await this.handleJoinRoomFromWebSocket(ws, clientMessage);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          console.error(`[GameSession] Error in handleJoinRoomFromWebSocket:`, errorMessage);
          if (errorStack) {
            console.error(`[GameSession] Error stack:`, errorStack);
          }
          const errorMsg = {
            type: "error" as const,
            error: {
              code: "JOIN_ROOM_ERROR",
              message: `Failed to join room: ${errorMessage}`,
            },
          };
          console.log(`[GameSession] Sending error message (handleJoinRoomFromWebSocket error):`, JSON.stringify(errorMsg, null, 2));
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(errorMsg));
              console.log(`[GameSession] Error message sent via WebSocket`);
            } else {
              console.error(`[GameSession] WebSocket not open, cannot send error message. State: ${ws.readyState}`);
            }
          } catch (sendError) {
            console.error(`[GameSession] Error sending error message via WebSocket:`, sendError);
          }
        }
      } else {
        // その他のメッセージは、プレイヤーが追加されている必要がある
        if (isPendingConnection) {
          console.error(`[GameSession] Message action ${clientMessage.action} received before join_room, ignoring`);
          const errorMsg = {
            type: "error" as const,
            error: {
              code: "JOIN_ROOM_REQUIRED",
              message: "You must send join_room message first",
            },
          };
          try {
            ws.send(JSON.stringify(errorMsg));
          } catch (error) {
            console.error(`[GameSession] Error sending error message:`, error);
          }
          return;
        }
        await this.handleMessage(playerId, clientMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[GameSession] Error in webSocketMessage:`, errorMessage);
      if (errorStack) {
        console.error(`[GameSession] Error stack:`, errorStack);
      }
      const errorMsg = {
        type: "error" as const,
        error: {
          code: "INVALID_MESSAGE",
          message: `Failed to process message: ${errorMessage}`,
        },
      };
      console.log(`[GameSession] Sending error message (catch block):`, JSON.stringify(errorMsg, null, 2));
      // playerIdが存在する場合はsendToを使用、そうでない場合はwsを直接使用
      if (playerId) {
        this.sendTo(playerId, errorMsg);
      } else {
        // playerIdが未確定の場合（join_room処理中にエラーが発生した場合など）、wsを直接使用
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(errorMsg));
            console.log(`[GameSession] Error message sent directly via WebSocket`);
          } else {
            console.error(`[GameSession] WebSocket not open, cannot send error message. State: ${ws.readyState}`);
          }
        } catch (sendError) {
          console.error(`[GameSession] Error sending error message via WebSocket:`, sendError);
        }
      }
    }
  }

  /**
   * WebSocket 切断イベントハンドラー
   * acceptWebSocketで受け入れたWebSocketの切断は、このメソッドで処理されます
   */
  async webSocketClose(ws: WebSocket): Promise<void> {
    console.log("[GameSession] webSocketClose called");

    // pendingConnectionsから削除
    if (this.pendingConnections.has(ws)) {
      const tempId = this.pendingConnections.get(ws);
      console.log(`[GameSession] Removing pending connection with tempId: ${tempId}`);
      this.pendingConnections.delete(ws);
      return;
    }

    // WebSocketからplayerIdを取得
    const playerId = this.getPlayerIdByWebSocket(ws);
    if (!playerId) {
      console.error("[GameSession] Player not found for WebSocket");
      return;
    }

    await this.handleDisconnect(playerId);
  }

  /**
   * WebSocketからplayerIdを取得
   */
  private getPlayerIdByWebSocket(ws: WebSocket): string | null {
    for (const [playerId, conn] of this.players.entries()) {
      if (conn.ws === ws) {
        return playerId;
      }
    }
    return null;
  }


  /**
   * メッセージハンドラー
   */
  private async handleMessage(playerId: string, message: ClientMessage): Promise<void> {
    console.log(`[GameSession] handleMessage called for player ${playerId}, action: ${message.action}`);
    try {
      switch (message.action) {
        case "join_room":
          console.log(`[GameSession] Routing to handleJoinRoom`);
          await this.handleJoinRoom(playerId, message);
          break;
        case "round_start":
          await this.handleRoundStart(playerId, message);
          break;
        case "exclamation_show":
          await this.handleExclamationShow(playerId, message);
          break;
        case "player_reaction":
          await this.handlePlayerReaction(playerId, message);
          break;
        case "false_start":
          await this.handleFalseStart(playerId, message);
          break;
        case "ready_toggle":
          await this.handleReadyToggle(playerId, message);
          break;
        case "rematch_request":
          await this.handleRematchRequest(playerId, message);
          break;
        case "rematch_response":
          await this.handleRematchResponse(playerId, message);
          break;
        case "get_room_state":
          await this.handleGetRoomState(playerId, message);
          break;
        default:
          console.error(`[GameSession] Unknown action: ${message.action}`);
          const errorMsg = {
            type: "error" as const,
            error: {
              code: "UNKNOWN_ACTION",
              message: `Unknown action: ${message.action}`,
            },
          };
          console.log(`[GameSession] Sending error message (unknown action):`, JSON.stringify(errorMsg, null, 2));
          this.sendTo(playerId, errorMsg);
      }
    } catch (error) {
      console.error(`[GameSession] Exception in handleMessage for action ${message.action}:`, error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      if (errorStack) {
        console.error(`[GameSession] Error stack:`, errorStack);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorMsg = {
        type: "error" as const,
        error: {
          code: "INTERNAL_ERROR",
          message: `Internal error while processing ${message.action}: ${errorMessage}`,
        },
      };
      console.log(`[GameSession] Sending error message (exception in handleMessage):`, JSON.stringify(errorMsg, null, 2));
      this.sendTo(playerId, errorMsg);
    }
  }

  /**
   * WebSocket接続から直接join_roomメッセージを処理
   */
  private async handleJoinRoomFromWebSocket(ws: WebSocket, message: ClientMessage): Promise<void> {
    console.log(`[GameSession] handleJoinRoomFromWebSocket called`);
    console.log(`[GameSession] Received join_room message:`, JSON.stringify(message, null, 2));

    // クライアントから送信されたplayerIdとplayerNameを取得
    const clientPlayerId = message.data?.playerId;
    const clientPlayerName = message.data?.playerName;

    if (!clientPlayerId) {
      console.error(`[GameSession] clientPlayerId is missing in join_room message`);
      const errorMsg = {
        type: "error" as const,
        error: {
          code: "INVALID_MESSAGE",
          message: "playerId is required in join_room message",
        },
      };
      try {
        ws.send(JSON.stringify(errorMsg));
      } catch (error) {
        console.error(`[GameSession] Error sending error message:`, error);
      }
      return;
    }

    console.log(`[GameSession] Extracted clientPlayerId: ${clientPlayerId}, clientPlayerName: ${clientPlayerName || 'not provided'}`);

    // 既にこのplayerIdでプレイヤーが存在するかチェック
    const existingPlayer = this.players.get(clientPlayerId);

    // 同じWebSocket接続に関連する既存のプレイヤーを削除（重複を防ぐ）
    const playersToRemove: string[] = [];
    for (const [pid, conn] of this.players.entries()) {
      if (conn.ws === ws && pid !== clientPlayerId) {
        console.log(`[GameSession] Removing existing player ${pid} (same WebSocket connection)`);
        playersToRemove.push(pid);
      }
    }
    for (const pid of playersToRemove) {
      this.players.delete(pid);
      delete this.gameState.readyByPlayerId[pid];
      delete this.gameState.reactions[pid];
      if (this.gameState.hostId === pid) {
        this.gameState.hostId = null;
      }
    }

    // 既にclientPlayerIdでプレイヤーが存在する場合、古いWebSocket接続を閉じて新しい接続に更新
    if (existingPlayer) {
      console.log(`[GameSession] Player with clientPlayerId ${clientPlayerId} already exists, updating connection`);

      // 古いWebSocket接続を閉じる（まだ開いている場合）
      const oldWs = existingPlayer.ws;
      if (oldWs !== ws && oldWs.readyState === WebSocket.OPEN) {
        console.log(`[GameSession] Closing old WebSocket connection for player ${clientPlayerId}`);
        try {
          oldWs.close(1000, "Connection replaced by new join_room");
        } catch (error) {
          console.error(`[GameSession] Error closing old WebSocket:`, error);
        }
      }

      // 既存のプレイヤーのWebSocket接続を更新
      existingPlayer.ws = ws;
      if (clientPlayerName) {
        existingPlayer.playerName = clientPlayerName;
      }
      // 最後のアクティビティ時刻を更新
      this.playerLastActivity.set(clientPlayerId, Date.now());
      // pendingConnectionsから削除
      this.pendingConnections.delete(ws);

      // 同じclientPlayerIdで異なるWebSocket接続に関連するプレイヤーをすべて削除（重複を防ぐ）
      const duplicatePlayersToRemove: string[] = [];
      for (const [pid, conn] of this.players.entries()) {
        if (pid === clientPlayerId && conn.ws !== ws) {
          console.log(`[GameSession] Removing duplicate player ${pid} with different WebSocket connection`);
          duplicatePlayersToRemove.push(pid);
        }
      }
      for (const pid of duplicatePlayersToRemove) {
        const conn = this.players.get(pid);
        if (conn && conn.ws !== ws && conn.ws.readyState === WebSocket.OPEN) {
          try {
            conn.ws.close(1000, "Duplicate connection removed");
          } catch (error) {
            console.error(`[GameSession] Error closing duplicate WebSocket:`, error);
          }
        }
        this.players.delete(pid);
        delete this.gameState.readyByPlayerId[pid];
        delete this.gameState.reactions[pid];
        if (this.gameState.hostId === pid) {
          this.gameState.hostId = null;
        }
      }

      // 既存のプレイヤーに関連する自動生成playerIdを削除
      const autoGeneratedToRemove: string[] = [];
      for (const [pid, conn] of this.players.entries()) {
        if (pid.startsWith("p") && pid !== clientPlayerId) {
          console.log(`[GameSession] Removing auto-generated playerId ${pid}`);
          autoGeneratedToRemove.push(pid);
        }
      }
      for (const pid of autoGeneratedToRemove) {
        this.players.delete(pid);
        delete this.gameState.readyByPlayerId[pid];
        delete this.gameState.reactions[pid];
        if (this.gameState.hostId === pid) {
          this.gameState.hostId = null;
        }
      }
    } else {
      // 新しいプレイヤーを追加
      console.log(`[GameSession] Adding new player with clientPlayerId ${clientPlayerId}`);
      const newConnection: PlayerConnection = {
        ws,
        playerId: clientPlayerId,
        playerName: clientPlayerName || `Player-${clientPlayerId}`,
        rating: 0,
      };
      this.players.set(clientPlayerId, newConnection);
      // 最後のアクティビティ時刻を記録
      this.playerLastActivity.set(clientPlayerId, Date.now());

      // pendingConnectionsから削除
      this.pendingConnections.delete(ws);

      // ホストが未設定の場合は最初のプレイヤーをホストに
      if (!this.gameState.hostId) {
        this.gameState.hostId = clientPlayerId;
      }
    }

    // 同じclientPlayerIdで複数のプレイヤーが存在する場合、すべて削除してから新しいプレイヤーを追加
    // これは、クライアントが複数のWebSocket接続を開いている場合や、同じplayerIdで複数回join_roomメッセージを送信している場合に対応
    const duplicateClientPlayerIds: string[] = [];
    for (const [pid, conn] of this.players.entries()) {
      if (pid === clientPlayerId && conn.ws !== ws) {
        console.log(`[GameSession] Found duplicate player ${pid} with different WebSocket connection`);
        duplicateClientPlayerIds.push(pid);
      }
    }
    for (const pid of duplicateClientPlayerIds) {
      const conn = this.players.get(pid);
      if (conn && conn.ws !== ws && conn.ws.readyState === WebSocket.OPEN) {
        console.log(`[GameSession] Closing duplicate WebSocket connection for player ${pid}`);
        try {
          conn.ws.close(1000, "Duplicate connection removed");
        } catch (error) {
          console.error(`[GameSession] Error closing duplicate WebSocket:`, error);
        }
      }
      console.log(`[GameSession] Removing duplicate player ${pid}`);
      this.players.delete(pid);
      delete this.gameState.readyByPlayerId[pid];
      delete this.gameState.reactions[pid];
      if (this.gameState.hostId === pid) {
        this.gameState.hostId = null;
      }
    }

    // すべての自動生成playerId（pで始まる形式）を削除（重複を防ぐ）
    const allAutoGeneratedToRemove: string[] = [];
    for (const [pid, conn] of this.players.entries()) {
      if (pid.startsWith("p") && pid !== clientPlayerId) {
        console.log(`[GameSession] Marking auto-generated playerId ${pid} for removal`);
        allAutoGeneratedToRemove.push(pid);
      }
    }
    for (const pid of allAutoGeneratedToRemove) {
      console.log(`[GameSession] Removing auto-generated playerId ${pid}`);
      this.players.delete(pid);
      delete this.gameState.readyByPlayerId[pid];
      delete this.gameState.reactions[pid];
      if (this.gameState.hostId === pid) {
        this.gameState.hostId = null;
      }
    }

    // 最終的なプレイヤーリストを確認してログ出力
    console.log(`[GameSession] Final player list after join_room:`, Array.from(this.players.keys()));

    // 最終的なplayerIdを設定
    const finalPlayerId = clientPlayerId;

    // RoomManagerにルームを登録（カスタムルーム参加時など、明示的にjoin_roomメッセージが送信された場合）
    if (!this.roomId) {
      console.error(`[GameSession] Cannot register room: roomId is empty`);
      const errorMsg = {
        type: "error" as const,
        error: {
          code: "ROOM_ID_MISSING",
          message: "Room ID is missing",
        },
      };
      console.log(`[GameSession] Sending error message:`, JSON.stringify(errorMsg, null, 2));
      try {
        ws.send(JSON.stringify(errorMsg));
      } catch (error) {
        console.error(`[GameSession] Error sending error message:`, error);
      }
      return;
    }

    // メッセージからroomIdを取得（クライアントが送信したroomIdと一致するか確認）
    const clientRoomId = message.data?.roomId;
    if (clientRoomId && clientRoomId !== this.roomId) {
      console.error(`[GameSession] Room ID mismatch: client sent ${clientRoomId}, but WebSocket connected to ${this.roomId}`);
      const errorMsg = {
        type: "error" as const,
        error: {
          code: "ROOM_ID_MISMATCH",
          message: `Room ID mismatch: expected ${this.roomId}, got ${clientRoomId}`,
        },
      };
      console.log(`[GameSession] Sending error message:`, JSON.stringify(errorMsg, null, 2));
      try {
        ws.send(JSON.stringify(errorMsg));
      } catch (error) {
        console.error(`[GameSession] Error sending error message:`, error);
      }
      return;
    }

    try {
      // matchTypeをメッセージから取得（カスタムルームの場合は"custom"）
      const matchType = message.data?.matchType || "quick";
      console.log(`[GameSession] Processing join_room for player ${finalPlayerId}, roomId: ${this.roomId}, matchType: ${matchType}`);

      if (!this.env.ROOM_MANAGER) {
        console.error(`[GameSession] ROOM_MANAGER binding is not available`);
        const errorMsg = {
          type: "error" as const,
          error: {
            code: "ROOM_MANAGER_UNAVAILABLE",
            message: "RoomManager is not available",
          },
        };
        console.log(`[GameSession] Sending error message:`, JSON.stringify(errorMsg, null, 2));
        try {
          ws.send(JSON.stringify(errorMsg));
        } catch (error) {
          console.error(`[GameSession] Error sending error message:`, error);
        }
        return;
      }

      const roomManagerId = this.env.ROOM_MANAGER.idFromName("room-manager");
      const roomManager = this.env.ROOM_MANAGER.get(roomManagerId);

      const requestBody = {
        roomId: this.roomId,
        playerId: finalPlayerId,
        matchType,
        settings: this.settings,
      };
      console.log(`[GameSession] Sending register-room request to RoomManager:`, JSON.stringify(requestBody, null, 2));

      const registerRequest = new Request(
        `https://dummy/register-room`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      const response = await roomManager.fetch(registerRequest);
      const responseText = await response.text();
      console.log(`[GameSession] RoomManager registration response status: ${response.status}`);
      console.log(`[GameSession] RoomManager registration response body:`, responseText);

      if (!response.ok) {
        console.error(`[GameSession] RoomManager registration failed: ${response.status} ${responseText}`);
        let errorMessage = `Failed to register room: ${responseText}`;
        let errorCode = "REGISTRATION_FAILED";

        // エラーレスポンスをパースして詳細なエラー情報を取得
        try {
          const errorResponse = JSON.parse(responseText);
          console.log(`[GameSession] Parsed error response:`, JSON.stringify(errorResponse, null, 2));
          if (errorResponse.error) {
            errorCode = errorResponse.error.code || errorCode;
            errorMessage = errorResponse.error.message || errorMessage;
            console.log(`[GameSession] Extracted error code: ${errorCode}, message: ${errorMessage}`);
          }
        } catch (e) {
          console.error(`[GameSession] Failed to parse error response as JSON:`, e);
          // JSONパースに失敗した場合はそのまま使用
        }

        const errorMsg = {
          type: "error" as const,
          error: {
            code: errorCode,
            message: errorMessage,
          },
        };
        console.log(`[GameSession] Sending error message to player:`, JSON.stringify(errorMsg, null, 2));
        try {
          ws.send(JSON.stringify(errorMsg));
        } catch (error) {
          console.error(`[GameSession] Error sending error message:`, error);
        }
        return;
      }

      console.log(`[GameSession] Successfully registered room ${this.roomId} with RoomManager for player ${finalPlayerId} (matchType: ${matchType})`);
    } catch (error) {
      console.error(`[GameSession] Exception in handleJoinRoomFromWebSocket:`, error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      if (errorStack) {
        console.error(`[GameSession] Error stack:`, errorStack);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorMsg = {
        type: "error" as const,
        error: {
          code: "INTERNAL_ERROR",
          message: `Failed to register room: ${errorMessage}`,
        },
      };
      console.log(`[GameSession] Sending error message (from catch block):`, JSON.stringify(errorMsg, null, 2));
      try {
        ws.send(JSON.stringify(errorMsg));
      } catch (error) {
        console.error(`[GameSession] Error sending error message:`, error);
      }
      return;
    }

    // ルーム参加成功を通知
    const finalPlayer = this.players.get(finalPlayerId);
    console.log(`[GameSession] Attempting to get finalPlayer for ${finalPlayerId}, players map size: ${this.players.size}`);
    console.log(`[GameSession] Current players:`, Array.from(this.players.keys()));
    if (!finalPlayer) {
      console.error(`[GameSession] finalPlayer not found for playerId ${finalPlayerId} after join_room processing`);
      const errorMsg = {
        type: "error" as const,
        error: {
          code: "PLAYER_NOT_FOUND",
          message: `Player ${finalPlayerId} not found after join_room processing`,
        },
      };
      console.log(`[GameSession] Sending error message (player not found):`, JSON.stringify(errorMsg, null, 2));
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(errorMsg));
          console.log(`[GameSession] Error message sent via WebSocket`);
        } else {
          console.error(`[GameSession] WebSocket not open, cannot send error message. State: ${ws.readyState}`);
        }
      } catch (error) {
        console.error(`[GameSession] Error sending error message via WebSocket:`, error);
      }
      return;
    }
    try {
      const successMsg = {
        type: "room_joined" as const,
        roomId: this.roomId,
        playerId: finalPlayerId,
        playerCount: this.players.size,
        isHost: this.gameState.hostId === finalPlayerId,
        roomPlayers: this.getRoomPlayers(),
      };
      console.log(`[GameSession] Sending room_joined message:`, JSON.stringify(successMsg, null, 2));
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(successMsg));
        console.log(`[GameSession] room_joined message sent successfully`);
      } else {
        console.error(`[GameSession] WebSocket not open, cannot send room_joined message. State: ${ws.readyState}`);
      }
    } catch (error) {
      console.error(`[GameSession] Error sending room_joined message:`, error);
      const errorMsg = {
        type: "error" as const,
        error: {
          code: "SEND_MESSAGE_ERROR",
          message: `Failed to send room_joined message: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(errorMsg));
        }
      } catch (sendError) {
        console.error(`[GameSession] Error sending error message:`, sendError);
      }
    }

    // 他のプレイヤーに通知
    this.broadcast(
      {
        type: "player_joined",
        roomId: this.roomId,
        playerId: finalPlayerId,
        playerCount: this.players.size,
        roomPlayers: this.getRoomPlayers(),
      },
      finalPlayerId
    );

    // 状態を保存
    await this.saveState();
  }

  /**
   * 既存のhandleJoinRoomメソッド（後方互換性のため残すが、使用しない）
   * @deprecated handleJoinRoomFromWebSocketを使用してください
   */
  private async handleJoinRoom(playerId: string, message: ClientMessage): Promise<void> {
    console.warn(`[GameSession] handleJoinRoom called (deprecated), redirecting to handleJoinRoomFromWebSocket`);
    // このメソッドは使用されないが、エラーを防ぐために残す
    const conn = this.players.get(playerId);
    if (conn) {
      await this.handleJoinRoomFromWebSocket(conn.ws, message);
    } else {
      console.error(`[GameSession] Player not found for playerId ${playerId}`);
    }
  }

  private async handleRoundStart(playerId: string, message: ClientMessage): Promise<void> {
    // Phase 2-3で実装
    if (this.gameState.hostId !== playerId) {
      this.sendTo(playerId, {
        type: "error",
        error: {
          code: "NOT_HOST",
          message: "Only host can start a round",
        },
      });
      return;
    }

    this.gameState.inProgress = true;
    this.gameState.reactions = {};

    this.broadcast({
      type: "round_start",
      waitTime: message.data?.waitTime,
      gameStartTime: message.data?.gameStartTime,
    });
  }

  private async handleExclamationShow(playerId: string, message: ClientMessage): Promise<void> {
    // Phase 2-3で実装
    if (this.gameState.hostId !== playerId) {
      this.sendTo(playerId, {
        type: "error",
        error: {
          code: "NOT_HOST",
          message: "Only host can show exclamation",
        },
      });
      return;
    }

    this.broadcast({
      type: "exclamation_show",
      timestamp: message.data?.timestamp,
    });
  }

  private async handlePlayerReaction(playerId: string, message: ClientMessage): Promise<void> {
    if (!this.gameState.inProgress) {
      this.sendTo(playerId, {
        type: "error",
        error: {
          code: "ROUND_NOT_IN_PROGRESS",
          message: "Round is not in progress",
        },
      });
      return;
    }

    if (this.gameState.reactions[playerId] !== undefined) {
      // 二重反応を無視
      return;
    }

    const reactionFrames = message.data?.reactionFrames || 0;
    this.gameState.reactions[playerId] = reactionFrames;

    // 全員の反応が揃ったら結果を送信
    if (Object.keys(this.gameState.reactions).length === this.players.size) {
      await this.sendRoundResults();
    }
  }

  private async handleFalseStart(playerId: string, message: ClientMessage): Promise<void> {
    if (!this.gameState.inProgress) {
      this.sendTo(playerId, {
        type: "error",
        error: {
          code: "ROUND_NOT_IN_PROGRESS",
          message: "Round is not in progress",
        },
      });
      return;
    }

    // お手つき回数を更新
    this.gameState.falseStartsByPlayerId[playerId] =
      (this.gameState.falseStartsByPlayerId[playerId] || 0) + 1;

    // お手つき負けの判定
    const falseStartCount = this.gameState.falseStartsByPlayerId[playerId];
    const maxFalseStarts = this.settings.maxFalseStarts;

    // お手つき負けの場合、そのプレイヤーを敗者としてラウンドを終了
    if (falseStartCount >= maxFalseStarts) {
      // お手つきしたプレイヤー以外のプレイヤーを勝者とする
      const winnerId = this.determineFalseStartWinner(playerId);

      if (winnerId) {
        // 勝利数を更新
        this.gameState.winsByPlayerId[winnerId] =
          (this.gameState.winsByPlayerId[winnerId] || 0) + 1;
      }

      // 全員にお手つき負けの結果を送信
      this.broadcast({
        type: "round_result",
        winnerId: winnerId || undefined,
        loserId: playerId,
        falseStart: true,
        reactions: { ...this.gameState.reactions },
        winsByPlayerId: { ...this.gameState.winsByPlayerId },
        falseStartsByPlayerId: { ...this.gameState.falseStartsByPlayerId },
      });

      // ラウンド状態をリセット
      this.resetRoundState();

      // 状態を保存
      await this.saveState();
    } else {
      // お手つき負けではない場合、お手つき通知のみ送信
      this.broadcast({
        type: "false_start",
        playerId,
        falseStartCount,
        maxFalseStarts,
      });
    }
  }

  /**
   * お手つき負けの場合の勝者を決定
   * お手つきしたプレイヤー以外の最初のプレイヤーが勝者
   */
  private determineFalseStartWinner(falseStartPlayerId: string): string | null {
    const playerIds = Array.from(this.players.keys());
    const winnerId = playerIds.find((id) => id !== falseStartPlayerId);
    return winnerId || null;
  }

  private async handleReadyToggle(playerId: string, message: ClientMessage): Promise<void> {
    this.gameState.readyByPlayerId[playerId] =
      !this.gameState.readyByPlayerId[playerId];

    this.broadcast({
      type: "ready_status",
      readyByPlayerId: { ...this.gameState.readyByPlayerId },
    });

    // 全員Readyの場合、カウントダウン開始
    const allReady = Object.keys(this.gameState.readyByPlayerId).every(
      (pid) => this.gameState.readyByPlayerId[pid]
    );
    if (allReady && this.players.size === this.settings.maxPlayers) {
      await this.startCountdown();
    }

    // 状態を保存
    await this.saveState();
  }

  /**
   * カウントダウンを開始
   */
  private async startCountdown(): Promise<void> {
    if (this.gameState.countdownStarted) {
      return; // 既にカウントダウンが開始されている場合は何もしない
    }

    this.gameState.countdownStarted = true;

    // カウントダウン（3, 2, 1）
    const countdownValues = [3, 2, 1];

    for (const count of countdownValues) {
      this.broadcast({
        type: "countdown_start",
        countdown: count,
      });

      // 1秒待機
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // カウントダウン終了後、ラウンド開始
    await this.startRoundTiming();
  }

  /**
   * ラウンドタイミングを開始
   */
  private async startRoundTiming(): Promise<void> {
    // ラウンド開始を通知
    this.gameState.inProgress = true;
    this.gameState.reactions = {};

    // 感嘆符表示のタイミングをランダムに決定（1-5秒後）
    const waitTime = Math.floor(Math.random() * 4000) + 1000; // 1000-5000ms
    const gameStartTime = Date.now() + waitTime;

    this.broadcast({
      type: "round_start",
      waitTime,
      gameStartTime,
    });

    // 感嘆符表示のタイミングをスケジュール
    setTimeout(() => {
      if (this.gameState.inProgress) {
        this.broadcast({
          type: "exclamation_show",
        });
      }
    }, waitTime);

    // 状態を保存
    await this.saveState();
  }

  private async handleRematchRequest(playerId: string, message: ClientMessage): Promise<void> {
    // rematchRequestsを初期化（初回のみ）
    if (!this.gameState.rematchRequests) {
      this.gameState.rematchRequests = {};
    }

    // リクエストを送ったプレイヤーもrematchに同意したとみなす
    this.gameState.rematchRequests[playerId] = true;

    // 他のプレイヤーにrematchリクエストを通知
    this.broadcast(
      {
        type: "rematch_request",
        playerId,
      },
      playerId
    );

    // 全員がrematchに同意したかチェック
    await this.checkRematchConsensus();

    // 状態を保存
    await this.saveState();
  }

  private async handleRematchResponse(playerId: string, message: ClientMessage): Promise<void> {
    const accepted = message.data?.accepted || false;

    // rematchRequestsを初期化（初回のみ）
    if (!this.gameState.rematchRequests) {
      this.gameState.rematchRequests = {};
    }

    // プレイヤーのrematch応答を記録
    this.gameState.rematchRequests[playerId] = accepted;

    // 全員にrematch応答を通知
    this.broadcast({
      type: "rematch_response",
      playerId,
      accepted,
    });

    // 全員がrematchに同意したかチェック
    await this.checkRematchConsensus();

    // 状態を保存
    await this.saveState();
  }

  /**
   * HTTP経由でルーム状態を取得
   */
  private async handleGetState(): Promise<Response> {
    // 状態を復元（メモリ上にない場合）
    if (this.roomId === "") {
      // URLからroomIdを取得を試みる
      // ただし、HTTPリクエストではroomIdがURLに含まれていない可能性がある
      // その場合は空の状態を返す
      return new Response(
        JSON.stringify({
          roomId: "",
          settings: this.settings,
          gameState: {
            inProgress: false,
            hostId: null,
            reactions: {},
            readyByPlayerId: {},
            countdownStarted: false,
            winsByPlayerId: {},
            falseStartsByPlayerId: {},
            rematchRequests: {},
          },
          roomPlayers: [],
          playerCount: 0,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // タイムアウトしたプレイヤーをチェックして削除
    // 注意: restoreStateはplayersを復元しないため、cleanupTimedOutPlayersの前に実行しない
    await this.cleanupTimedOutPlayers();

    // 現在のルーム状態を収集
    const roomState = {
      roomId: this.roomId,
      settings: { ...this.settings },
      gameState: {
        inProgress: this.gameState.inProgress,
        hostId: this.gameState.hostId,
        reactions: { ...this.gameState.reactions },
        readyByPlayerId: { ...this.gameState.readyByPlayerId },
        countdownStarted: this.gameState.countdownStarted,
        winsByPlayerId: { ...this.gameState.winsByPlayerId },
        falseStartsByPlayerId: { ...this.gameState.falseStartsByPlayerId },
        rematchRequests: this.gameState.rematchRequests
          ? { ...this.gameState.rematchRequests }
          : {},
      },
      roomPlayers: this.getRoomPlayers(),
      playerCount: this.players.size,
    };

    return new Response(JSON.stringify(roomState), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * ルーム状態取得ハンドラー（WebSocket経由）
   */
  private async handleGetRoomState(playerId: string, message: ClientMessage): Promise<void> {
    // 現在のルーム状態を収集
    const roomState: ServerMessage = {
      type: "room_state",
      roomId: this.roomId,
      settings: { ...this.settings },
      gameState: {
        inProgress: this.gameState.inProgress,
        hostId: this.gameState.hostId,
        reactions: { ...this.gameState.reactions },
        readyByPlayerId: { ...this.gameState.readyByPlayerId },
        countdownStarted: this.gameState.countdownStarted,
        winsByPlayerId: { ...this.gameState.winsByPlayerId },
        falseStartsByPlayerId: { ...this.gameState.falseStartsByPlayerId },
        rematchRequests: this.gameState.rematchRequests
          ? { ...this.gameState.rematchRequests }
          : {},
      },
      roomPlayers: this.getRoomPlayers(),
      playerCount: this.players.size,
    };

    // リクエストしたプレイヤーに状態を送信
    this.sendTo(playerId, roomState);
  }

  /**
   * 全員がrematchに同意したかチェックし、同意した場合はゲームをリセット
   */
  private async checkRematchConsensus(): Promise<void> {
    if (!this.gameState.rematchRequests) {
      return;
    }

    const allPlayers = Array.from(this.players.keys());
    const allAgreed = allPlayers.every(
      (pid) => this.gameState.rematchRequests![pid] === true
    );

    // 全員が同意し、かつ全員が参加している場合、ゲームをリセット
    if (allAgreed && allPlayers.length === this.settings.maxPlayers) {
      await this.resetGameForRematch();
    }
  }

  /**
   * Rematchのためにゲームをリセット
   */
  private async resetGameForRematch(): Promise<void> {
    // ゲーム状態をリセット
    this.gameState.inProgress = false;
    this.gameState.reactions = {};
    this.gameState.countdownStarted = false;
    this.gameState.readyByPlayerId = {};
    this.gameState.rematchRequests = {};
    // winsByPlayerIdとfalseStartsByPlayerIdはリセットしない（累積スコアを保持）

    // 全員にrematch開始を通知
    this.broadcast({
      type: "rematch_request",
      accepted: true,
      gameReset: true,
    });

    // 状態を保存
    await this.saveState();
  }

  /**
   * プレイヤー切断処理
   */
  private async handleDisconnect(playerId: string): Promise<void> {
    this.players.delete(playerId);
    this.playerLastActivity.delete(playerId);
    delete this.gameState.readyByPlayerId[playerId];
    delete this.gameState.reactions[playerId];

    // ホストが切断した場合、次のプレイヤーをホストに
    if (this.gameState.hostId === playerId) {
      const remainingPlayers = Array.from(this.players.keys());
      this.gameState.hostId = remainingPlayers.length > 0 ? remainingPlayers[0] : null;
    }

    // RoomManagerからプレイヤーを削除
    if (this.roomId) {
      try {
        const roomManagerId = this.env.ROOM_MANAGER.idFromName("room-manager");
        const roomManager = this.env.ROOM_MANAGER.get(roomManagerId);

        const leaveRequest = new Request(
          `https://dummy/leave-room`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerId,
              roomId: this.roomId,
            }),
          }
        );

        await roomManager.fetch(leaveRequest);
      } catch (error) {
        console.error(`[GameSession] Failed to remove player from RoomManager:`, error);
        // エラーが発生しても処理を続行
      }
    }

    // 他のプレイヤーに通知
    this.broadcast({
      type: "player_left",
      playerId,
      playerCount: this.players.size,
      roomPlayers: this.getRoomPlayers(),
    });

    // 状態を保存
    await this.saveState();
  }

  /**
   * ブロードキャスト（全員にメッセージを送信）
   */
  private broadcast(message: ServerMessage, excludePlayerId?: string): void {
    for (const [playerId, conn] of this.players.entries()) {
      if (playerId === excludePlayerId) continue;
      if (conn.ws.readyState === WebSocket.OPEN) {
        try {
          conn.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Error sending message to ${playerId}:`, error);
        }
      }
    }
  }

  /**
   * 個別送信
   */
  private sendTo(playerId: string, message: ServerMessage): void {
    const conn = this.players.get(playerId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      try {
        // エラーメッセージの場合は詳細なログを出力
        if (message.type === "error") {
          console.log(`[GameSession] Preparing to send error message to ${playerId}`);
          console.log(`[GameSession] Error message object:`, JSON.stringify(message, null, 2));
          if (message.error) {
            console.log(`[GameSession] Error code: ${message.error.code}, message: ${message.error.message}`);
          } else {
            console.error(`[GameSession] WARNING: Error message type but no error field!`);
          }
        }
        const messageStr = JSON.stringify(message);
        console.log(`[GameSession] Sending message to ${playerId} (${message.type}):`, messageStr);
        conn.ws.send(messageStr);
        console.log(`[GameSession] Message sent successfully to ${playerId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[GameSession] Error sending message to ${playerId}:`, errorMessage);
        console.error(`[GameSession] Message that failed to send:`, JSON.stringify(message, null, 2));
        const errorStack = error instanceof Error ? error.stack : undefined;
        if (errorStack) {
          console.error(`[GameSession] Error stack:`, errorStack);
        }
      }
    } else {
      if (!conn) {
        console.error(`[GameSession] Connection not found for player ${playerId}`);
      } else if (conn.ws.readyState !== WebSocket.OPEN) {
        console.error(`[GameSession] WebSocket not open for player ${playerId}, state: ${conn.ws.readyState}`);
      }
    }
  }

  /**
   * ルームプレイヤー情報を取得
   */
  private getRoomPlayers(): PlayerInfo[] {
    return Array.from(this.players.values()).map((conn) => ({
      playerId: conn.playerId,
      playerName: conn.playerName,
      rating: conn.rating,
      isHost: this.gameState.hostId === conn.playerId,
      isReady: this.gameState.readyByPlayerId[conn.playerId] || false,
    }));
  }

  /**
   * タイムアウトしたプレイヤーをクリーンアップ
   */
  private async cleanupTimedOutPlayers(): Promise<void> {
    if (!this.env.ROOM_MANAGER || !this.roomId) {
      return;
    }

    try {
      const roomManagerId = this.env.ROOM_MANAGER.idFromName("room-manager");
      const roomManager = this.env.ROOM_MANAGER.get(roomManagerId);

      // RoomManagerからルーム情報を取得
      const listRequest = new Request(`https://dummy/list-rooms`, {
        method: "GET",
      });
      const listResponse = await roomManager.fetch(listRequest);
      if (!listResponse.ok) {
        console.error(`[GameSession] Failed to get room list from RoomManager`);
        return;
      }

      const roomsData = await listResponse.json<{ rooms: Array<{ roomId: string; playerIds: string[] }> }>();
      const roomData = roomsData.rooms?.find((r) => r.roomId === this.roomId);

      console.log(`[GameSession] Room data from RoomManager:`, JSON.stringify(roomData, null, 2));
      console.log(`[GameSession] Current players in GameSession:`, Array.from(this.players.keys()));

      if (!roomData) {
        // ルームがRoomManagerに存在しない場合、すべてのプレイヤーを削除
        console.log(`[GameSession] Room ${this.roomId} not found in RoomManager, removing all players`);
        const playersToRemove = Array.from(this.players.keys());
        for (const playerId of playersToRemove) {
          await this.handleDisconnect(playerId);
        }
        return;
      }

      // RoomManagerに存在しないプレイヤーを削除
      const validPlayerIds = new Set(roomData.playerIds || []);
      const playersToRemove: string[] = [];

      for (const playerId of this.players.keys()) {
        if (!validPlayerIds.has(playerId)) {
          console.log(`[GameSession] Player ${playerId} not found in RoomManager, removing`);
          playersToRemove.push(playerId);
        }
      }

      for (const playerId of playersToRemove) {
        await this.handleDisconnect(playerId);
      }
    } catch (error) {
      console.error(`[GameSession] Error cleaning up timed out players:`, error);
    }
  }

  /**
   * プレイヤーIDを生成
   */
  private generatePlayerId(): string {
    return `p${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 状態を保存
   */
  private async saveState(): Promise<void> {
    const serializableState = {
      roomId: this.roomId,
      settings: this.settings,
      gameState: {
        inProgress: this.gameState.inProgress,
        hostId: this.gameState.hostId,
        readyByPlayerId: this.gameState.readyByPlayerId,
        winsByPlayerId: this.gameState.winsByPlayerId,
        falseStartsByPlayerId: this.gameState.falseStartsByPlayerId,
        rematchRequests: this.gameState.rematchRequests || {},
      },
    };
    await this.ctx.storage.put("session", serializableState);
  }

  /**
   * ラウンド結果を送信
   */
  private async sendRoundResults(): Promise<void> {
    // 反応時間データを検証
    if (!this.validateReactions()) {
      console.error("[GameSession] Invalid reactions data");
      return;
    }

    // 勝者を決定（最も反応が早いプレイヤー = reactionFramesが最小）
    const winnerId = this.determineRoundWinner();

    if (winnerId) {
      // 勝利数を更新
      this.updatePlayerWins(winnerId);
    }

    // ゲーム終了判定
    const gameOver = this.isGameOver();
    const gameWinnerId = gameOver ? this.getGameWinner() : undefined;

    // 全員にラウンド結果を送信
    this.broadcast({
      type: "round_result",
      winnerId: winnerId || undefined,
      reactions: { ...this.gameState.reactions },
      winsByPlayerId: { ...this.gameState.winsByPlayerId },
      falseStartsByPlayerId: { ...this.gameState.falseStartsByPlayerId },
      gameOver,
      gameWinnerId,
    });

    // ラウンド状態をリセット
    this.resetRoundState();

    // 状態を保存
    await this.saveState();
  }

  /**
   * 反応時間データを検証
   */
  private validateReactions(): boolean {
    const reactions = this.gameState.reactions;

    // 全員の反応が揃っているか確認
    if (Object.keys(reactions).length !== this.players.size) {
      return false;
    }

    // 各反応時間が有効な値（0以上の数値）か確認
    for (const [playerId, frames] of Object.entries(reactions)) {
      if (typeof frames !== "number" || frames < 0 || !isFinite(frames)) {
        console.error(`[GameSession] Invalid reaction time for player ${playerId}: ${frames}`);
        return false;
      }
    }

    return true;
  }

  /**
   * プレイヤーの勝利数を更新
   */
  private updatePlayerWins(playerId: string): void {
    this.gameState.winsByPlayerId[playerId] =
      (this.gameState.winsByPlayerId[playerId] || 0) + 1;
  }

  /**
   * ゲーム終了判定
   * maxWinsに達したプレイヤーがいるか確認
   */
  private isGameOver(): boolean {
    const maxWins = this.settings.maxWins;

    for (const [playerId, wins] of Object.entries(this.gameState.winsByPlayerId)) {
      if (wins >= maxWins) {
        return true;
      }
    }

    return false;
  }

  /**
   * ゲーム勝者を取得
   * maxWinsに達した最初のプレイヤーを返す
   */
  private getGameWinner(): string | undefined {
    const maxWins = this.settings.maxWins;

    for (const [playerId, wins] of Object.entries(this.gameState.winsByPlayerId)) {
      if (wins >= maxWins) {
        return playerId;
      }
    }

    return undefined;
  }

  /**
   * ラウンド勝者を決定
   * 最も反応が早い（reactionFramesが最小）プレイヤーが勝者
   */
  private determineRoundWinner(): string | null {
    const reactions = this.gameState.reactions;
    if (Object.keys(reactions).length === 0) {
      return null;
    }

    let winnerId: string | null = null;
    let minFrames = Infinity;

    for (const [playerId, frames] of Object.entries(reactions)) {
      if (frames < minFrames) {
        minFrames = frames;
        winnerId = playerId;
      }
    }

    return winnerId;
  }

  /**
   * ラウンド状態をリセット
   */
  private resetRoundState(): void {
    this.gameState.inProgress = false;
    this.gameState.reactions = {};
    this.gameState.countdownStarted = false;
    // readyByPlayerIdはリセットしない（次のラウンド用に保持）
  }

  /**
   * 状態を復元
   */
  private async restoreState(): Promise<void> {
    const stored = await this.ctx.storage.get<any>("session");
    if (stored) {
      this.roomId = stored.roomId || this.roomId;
      this.settings = { ...this.settings, ...stored.settings };
      this.gameState = {
        ...this.gameState,
        ...stored.gameState,
        reactions: {}, // メモリ上の一時状態は復元しない
        countdownStarted: false,
        rematchRequests: {}, // rematchRequestsもリセット
      };
    }
    // playersが空の場合、hostIdもリセット（接続が全て切断された状態）
    // 次の接続時に最初のプレイヤーがホストになる
    if (this.players.size === 0) {
      this.gameState.hostId = null;
    }
  }
}

/**
 * プレイヤー接続情報
 */
interface PlayerConnection {
  ws: WebSocket;
  playerId: string;
  playerName: string;
  rating: number;
}

/**
 * Env インターフェース（必要に応じて拡張）
 */
interface Env {
  ROOM_MANAGER: DurableObjectNamespace;
}
