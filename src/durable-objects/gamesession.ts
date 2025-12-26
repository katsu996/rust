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

    // HTTP リクエストの処理（将来の拡張用）
    return new Response("Not implemented", { status: 501 });
  }

  /**
   * WebSocket Upgrade 処理
   * Rust Workerから転送されたWebSocket接続を処理
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    // roomId を URL から取得
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") || "";

    if (!roomId) {
      return new Response("roomId is required", { status: 400 });
    }

    this.roomId = roomId;

    // 状態を復元
    await this.restoreState();

    // Rust Workerから転送されたWebSocket接続を処理
    // Cloudflare Workersでは、WebSocket接続はRequestから直接取得できないため、
    // WebSocketPairを作成して処理する必要があります
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // WebSocketをacceptする（メッセージ送信前に必要）
    // @ts-ignore - DurableObjectStateの型定義が不完全な可能性がある
    this.ctx.acceptWebSocket(server);

    // プレイヤーIDを生成（実際の実装では認証から取得）
    const playerId = this.generatePlayerId();

    // プレイヤー接続を保存
    const connection: PlayerConnection = {
      ws: server,
      playerId,
      playerName: `Player-${playerId}`,
      rating: 0,
    };

    this.players.set(playerId, connection);

    // ホストが未設定の場合は最初のプレイヤーをホストに
    if (!this.gameState.hostId) {
      this.gameState.hostId = playerId;
    }

    // 注意: acceptWebSocketを使う場合、addEventListenerではなく
    // webSocketMessageとwebSocketCloseメソッドが自動的に呼び出されます

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

    // WebSocketからplayerIdを取得
    const playerId = this.getPlayerIdByWebSocket(ws);
    if (!playerId) {
      console.error("[GameSession] Player not found for WebSocket");
      return;
    }

    console.log(`[GameSession] Message received from ${playerId}:`, message);
    try {
      const messageStr = typeof message === "string" ? message : new TextDecoder().decode(message);
      console.log(`[GameSession] Parsed message string:`, messageStr);
      const clientMessage: ClientMessage = JSON.parse(messageStr);
      console.log(`[GameSession] Parsed client message:`, clientMessage);
      await this.handleMessage(playerId, clientMessage);
    } catch (error) {
      console.error(`[GameSession] Error parsing message from ${playerId}:`, error);
      this.sendTo(playerId, {
        type: "error",
        error: {
          code: "INVALID_MESSAGE",
          message: "Failed to parse message",
        },
      });
    }
  }

  /**
   * WebSocket 切断イベントハンドラー
   * acceptWebSocketで受け入れたWebSocketの切断は、このメソッドで処理されます
   */
  async webSocketClose(ws: WebSocket): Promise<void> {
    console.log("[GameSession] webSocketClose called");

    // WebSocketからplayerIdを取得
    const playerId = this.getPlayerIdByWebSocket(ws);
    if (!playerId) {
      console.error("[GameSession] Player not found for WebSocket");
      return;
    }

    this.handleDisconnect(playerId);
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
  // 将来の環境変数やバインディング
}
