import { beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

/**
 * WebSocket の統合テスト
 *
 * 注意: このテストは開発サーバー（`pnpm dev`）が起動している必要があります
 * サーバーが起動していない場合、テストはスキップされます
 */

const BASE_URL = "http://127.0.0.1:8787";
const WS_URL = "ws://127.0.0.1:8787";

// サーバーが起動しているかチェック
async function checkServer(): Promise<boolean> {
    try {
        const response = await fetch(`${BASE_URL}/health`, {
            signal: AbortSignal.timeout(1000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

describe("WebSocket Integration Tests", () => {
    let roomId: string;
    let serverAvailable = false;

    beforeAll(async () => {
        serverAvailable = await checkServer();
        if (!serverAvailable) {
            console.warn(
                "⚠️  開発サーバーが起動していません。統合テストをスキップします。"
            );
            console.warn("   テストを実行するには: pnpm dev");
            return;
        }

        // テスト用のルームを作成
        const response = await fetch(`${BASE_URL}/api/quick-match`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                playerId: "test-ws-player-1",
            }),
        });

        const data = await response.json();
        roomId = data.roomId;
    });

    describe("WebSocket接続", () => {
        it.skipIf(!serverAvailable)("WebSocket接続が確立される", (done) => {
            const ws = new WebSocket(`${WS_URL}/ws?roomId=${roomId}`);

            ws.on("open", () => {
                expect(ws.readyState).toBe(WebSocket.OPEN);
                ws.close();
                done();
            });

            ws.on("error", (error) => {
                done(error);
            });
        });

        it.skipIf(!serverAvailable)(
            "接続確立時に connection_established メッセージを受信する",
            (done) => {
                const ws = new WebSocket(`${WS_URL}/ws?roomId=${roomId}`);

                ws.on("message", (data) => {
                    const message = JSON.parse(data.toString());
                    expect(message.type).toBe("connection_established");
                    expect(message).toHaveProperty("roomId");
                    expect(message).toHaveProperty("playerId");
                    expect(message).toHaveProperty("isHost");
                    ws.close();
                    done();
                });

                ws.on("error", (error) => {
                    done(error);
                });
            });

        it.skipIf(!serverAvailable)("最初のプレイヤーがホストになる", (done) => {
            const ws = new WebSocket(`${WS_URL}/ws?roomId=${roomId}`);

            ws.on("message", (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === "connection_established") {
                    expect(message.isHost).toBe(true);
                    ws.close();
                    done();
                }
            });

            ws.on("error", (error) => {
                done(error);
            });
        });
    });

    describe("メッセージ送受信", () => {
        it.skipIf(!serverAvailable)(
            "ready_toggle メッセージを送信できる",
            (done) => {
                const ws = new WebSocket(`${WS_URL}/ws?roomId=${roomId}`);

                ws.on("open", () => {
                    ws.send(
                        JSON.stringify({
                            action: "ready_toggle",
                            data: {},
                        })
                    );
                });

                ws.on("message", (data) => {
                    const message = JSON.parse(data.toString());
                    if (message.type === "ready_status") {
                        expect(message).toHaveProperty("readyByPlayerId");
                        ws.close();
                        done();
                    }
                });

                ws.on("error", (error) => {
                    done(error);
                });
            });
    });
});
