import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * REST API の統合テスト
 *
 * 注意: このテストは開発サーバー（`pnpm dev`）が起動している必要があります
 * サーバーが起動していない場合、テストはスキップされます
 */

const BASE_URL = "http://127.0.0.1:8787";

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

describe("REST API Integration Tests", () => {
    let serverAvailable = false;

    beforeAll(async () => {
        serverAvailable = await checkServer();
        if (!serverAvailable) {
            console.warn(
                "⚠️  開発サーバーが起動していません。統合テストをスキップします。"
            );
            console.warn("   テストを実行するには: pnpm dev");
        }
    });
    beforeAll(() => {
        // 開発サーバーが起動しているか確認
        // 実際の実装では、サーバーの起動を待つ処理を追加
    });

    afterAll(() => {
        // クリーンアップ処理
    });

    describe("ヘルスチェック", () => {
        it.skipIf(!serverAvailable)(
            "GET /health が正常に応答する",
            async () => {
                const response = await fetch(`${BASE_URL}/health`);
                expect(response.status).toBe(200);
                const text = await response.text();
                expect(text).toBe("OK");
            });
    });

    describe("Quick Match API", () => {
        it.skipIf(!serverAvailable)(
            "POST /api/quick-match が正常に動作する",
            async () => {
                const response = await fetch(`${BASE_URL}/api/quick-match`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        playerId: "test-player-1",
                    }),
                });

                expect(response.status).toBe(200);
                const data = await response.json();
                expect(data).toHaveProperty("roomId");
                expect(typeof data.roomId).toBe("string");
            });

        it.skipIf(!serverAvailable)(
            "設定を指定してQuick Matchに参加できる",
            async () => {
                const response = await fetch(`${BASE_URL}/api/quick-match`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        playerId: "test-player-2",
                        settings: {
                            maxWins: 5,
                            maxFalseStarts: 2,
                            allowFalseStarts: true,
                            maxPlayers: 2,
                        },
                    }),
                });

                expect(response.status).toBe(200);
                const data = await response.json();
                expect(data).toHaveProperty("roomId");
            });
    });

    describe("カスタムルーム API", () => {
        it.skipIf(!serverAvailable)(
            "POST /api/create-room が正常に動作する",
            async () => {
                const response = await fetch(`${BASE_URL}/api/create-room`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        playerId: "test-player-3",
                        customRoomSettings: {
                            maxWins: 3,
                            maxFalseStarts: 3,
                            allowFalseStarts: true,
                            maxPlayers: 2,
                        },
                    }),
                });

                expect(response.status).toBe(200);
                const data = await response.json();
                expect(data).toHaveProperty("roomId");
                expect(data).toHaveProperty("roomCode");
                expect(typeof data.roomCode).toBe("string");
                expect(data.roomCode.length).toBe(4);
                expect(data.roomCode).toMatch(/^\d{4}$/); // 数字4桁のみ
            });

        it.skipIf(!serverAvailable)(
            "POST /api/join-room が正常に動作する",
            async () => {
                // まずルームを作成
                const createResponse = await fetch(`${BASE_URL}/api/create-room`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        playerId: "test-player-4",
                        customRoomSettings: {
                            maxWins: 3,
                            maxFalseStarts: 3,
                            allowFalseStarts: true,
                            maxPlayers: 2,
                        },
                    }),
                });

                const createData = await createResponse.json();
                const roomCode = createData.roomCode;

                // ルームに参加
                const joinResponse = await fetch(`${BASE_URL}/api/join-room`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        playerId: "test-player-5",
                        roomCode: roomCode,
                    }),
                });

                expect(joinResponse.status).toBe(200);
                const joinData = await joinResponse.json();
                expect(joinData).toHaveProperty("roomId");
                expect(joinData.roomId).toBe(createData.roomId);
            });

        it.skipIf(!serverAvailable)(
            "存在しないroomCodeで参加しようとするとエラーになる",
            async () => {
                const response = await fetch(`${BASE_URL}/api/join-room`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        playerId: "test-player-6",
                        roomCode: "9999",
                    }),
                });

                expect(response.status).toBe(404);
                const data = await response.json();
                expect(data).toHaveProperty("error");
                expect(data.error).toHaveProperty("code", "ROOM_NOT_FOUND");
            });
    });
});
