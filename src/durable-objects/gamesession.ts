import {
  ClientMessage,
  ServerMessage,
  PlayerInfo,
  RoomSettings,
  GameState,
} from "./types";

/**
 * GameSession Durable Object
 * 1つの対戦ルーム（ゲームセッション）単位でWebSocket接続とゲーム状態を管理
 */
export class GameSession {
  private state: DurableObjectState;
  private env: Env;
  
  // メモリ上の状態
  private players: Map<string, PlayerConnection> = new Map();
  private gameState: GameState;
  private settings: RoomSettings;
  private roomId: string;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
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
    };
    
    this.roomId = "";
  }

  /**
   * fetch メソッド - WebSocket Upgrade と HTTP リクエストを処理
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // WebSocket Upgrade リクエストの処理
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    // HTTP リクエストの処理（将来の拡張用）
    return new Response("Not implemented", { status: 501 });
  }

  /**
   * WebSocket Upgrade 処理
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // roomId を URL から取得
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") || "";
    
    if (!roomId) {
      return new Response("roomId is required", { status: 400 });
    }

    this.roomId = roomId;

    // 状態を復元
    await this.restoreState();

    // WebSocket 接続を処理
    this.handleWebSocketConnect(server, roomId);

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
   * WebSocket 接続の処理
   */
  private handleWebSocketConnect(ws: WebSocket, roomId: string): void {
    ws.accept();

    // プレイヤーIDを生成（実際の実装では認証から取得）
    const playerId = this.generatePlayerId();

    // プレイヤー接続を保存
    const connection: PlayerConnection = {
      ws,
      playerId,
      playerName: `Player-${playerId}`,
      rating: 0,
    };

    this.players.set(playerId, connection);

    // ホストが未設定の場合は最初のプレイヤーをホストに
    if (!this.gameState.hostId) {
      this.gameState.hostId = playerId;
    }

    // 接続確立メッセージを送信
    this.sendTo(playerId, {
      type: "connection_established",
      roomId,
      playerId,
      isHost: this.gameState.hostId === playerId,
    });

    // 既存プレイヤーに通知
    this.broadcast(
      {
        type: "player_joined",
        roomId,
        playerId,
        playerCount: this.players.size,
        roomPlayers: this.getRoomPlayers(),
      },
      playerId
    );

    // WebSocket メッセージの受信処理
    ws.addEventListener("message", async (event) => {
      try {
        const message: ClientMessage = JSON.parse(event.data as string);
        await this.handleMessage(playerId, message);
      } catch (error) {
        console.error("Error handling message:", error);
        this.sendTo(playerId, {
          type: "error",
          error: {
            code: "INVALID_MESSAGE",
            message: "Failed to parse message",
          },
        });
      }
    });

    // WebSocket 切断処理
    ws.addEventListener("close", () => {
      this.handleDisconnect(playerId);
    });

    // 状態を保存
    this.saveState();
  }

  /**
   * メッセージハンドラー
   */
  private async handleMessage(playerId: string, message: ClientMessage): Promise<void> {
    switch (message.action) {
      case "join_room":
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
      default:
        this.sendTo(playerId, {
          type: "error",
          error: {
            code: "UNKNOWN_ACTION",
            message: `Unknown action: ${message.action}`,
          },
        });
    }
  }

  /**
   * 各アクションのハンドラー（Phase 2-3で詳細実装）
   */
  private async handleJoinRoom(playerId: string, message: ClientMessage): Promise<void> {
    // Phase 2-3で実装
    this.sendTo(playerId, {
      type: "room_joined",
      roomId: this.roomId,
      playerId,
      playerCount: this.players.size,
      isHost: this.gameState.hostId === playerId,
      roomPlayers: this.getRoomPlayers(),
    });
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
    // Phase 2-3で実装
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

    // 全員の反応が揃ったら結果を送信（Phase 2-3で実装）
    if (Object.keys(this.gameState.reactions).length === this.players.size) {
      // RoundService に委譲して勝敗判定
      // await this.sendRoundResults();
    }
  }

  private async handleFalseStart(playerId: string, message: ClientMessage): Promise<void> {
    // Phase 2-3で実装
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

    this.gameState.falseStartsByPlayerId[playerId] =
      (this.gameState.falseStartsByPlayerId[playerId] || 0) + 1;

    // お手つき負けの処理（Phase 2-3で実装）
  }

  private async handleReadyToggle(playerId: string, message: ClientMessage): Promise<void> {
    // Phase 2-3で実装
    this.gameState.readyByPlayerId[playerId] =
      !this.gameState.readyByPlayerId[playerId];

    this.broadcast({
      type: "ready_status",
      readyByPlayerId: { ...this.gameState.readyByPlayerId },
    });

    // 全員Readyの場合、カウントダウン開始（Phase 2-3で実装）
    const allReady = Object.keys(this.gameState.readyByPlayerId).every(
      (pid) => this.gameState.readyByPlayerId[pid]
    );
    if (allReady && this.players.size === this.settings.maxPlayers) {
      // await this.startCountdown();
    }
  }

  private async handleRematchRequest(playerId: string, message: ClientMessage): Promise<void> {
    // Phase 2-3で実装
    this.broadcast(
      {
        type: "rematch_request",
        playerId,
      },
      playerId
    );
  }

  private async handleRematchResponse(playerId: string, message: ClientMessage): Promise<void> {
    // Phase 2-3で実装
    this.broadcast({
      type: "rematch_response",
      playerId,
      accepted: message.data?.accepted || false,
    });
  }

  /**
   * プレイヤー切断処理
   */
  private handleDisconnect(playerId: string): void {
    this.players.delete(playerId);
    delete this.gameState.readyByPlayerId[playerId];
    delete this.gameState.reactions[playerId];

    // ホストが切断した場合、次のプレイヤーをホストに
    if (this.gameState.hostId === playerId) {
      const remainingPlayers = Array.from(this.players.keys());
      this.gameState.hostId = remainingPlayers.length > 0 ? remainingPlayers[0] : null;
    }

    // 他のプレイヤーに通知
    this.broadcast({
      type: "player_left",
      playerId,
      playerCount: this.players.size,
      roomPlayers: this.getRoomPlayers(),
    });

    // 状態を保存
    this.saveState();
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
        conn.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to ${playerId}:`, error);
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
      },
    };
    await this.state.storage.put("session", serializableState);
  }

  /**
   * 状態を復元
   */
  private async restoreState(): Promise<void> {
    const stored = await this.state.storage.get<any>("session");
    if (stored) {
      this.roomId = stored.roomId || this.roomId;
      this.settings = { ...this.settings, ...stored.settings };
      this.gameState = {
        ...this.gameState,
        ...stored.gameState,
        reactions: {}, // メモリ上の一時状態は復元しない
        countdownStarted: false,
      };
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
  // 将来の環境変数やバインディング
}

