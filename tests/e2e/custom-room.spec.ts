import { expect, test } from "@playwright/test";

/**
 * カスタムルーム の E2E テスト
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

test.describe("Custom Room E2E", () => {
    let serverAvailable = false;

    test.beforeAll(async () => {
        serverAvailable = await checkServer();
        if (!serverAvailable) {
            console.warn(
                "⚠️  開発サーバーが起動していません。E2Eテストをスキップします。"
            );
            console.warn("   テストを実行するには: pnpm dev");
        }
    });

    test("カスタムルーム作成・参加フローが正常に動作する", async ({
        request,
    }) => {
        if (!serverAvailable) {
            test.skip();
            return;
        }
        // 1. カスタムルームを作成
        const createResponse = await request.post("/api/create-room", {
            data: {
                playerId: "e2e-host",
                customRoomSettings: {
                    maxWins: 5,
                    maxFalseStarts: 2,
                    allowFalseStarts: true,
                    maxPlayers: 2,
                },
            },
        });

        expect(createResponse.ok()).toBeTruthy();
        const createData = await createResponse.json();
        expect(createData).toHaveProperty("roomId");
        expect(createData).toHaveProperty("roomCode");
        const { roomId, roomCode } = createData;

        // 2. ルームに参加
        const joinResponse = await request.post("/api/join-room", {
            data: {
                playerId: "e2e-joiner",
                roomCode: roomCode,
            },
        });

        expect(joinResponse.ok()).toBeTruthy();
        const joinData = await joinResponse.json();
        expect(joinData).toHaveProperty("roomId");
        expect(joinData.roomId).toBe(roomId);
    });

    test("存在しないroomCodeで参加しようとするとエラーになる", async ({
        request,
    }) => {
        if (!serverAvailable) {
            test.skip();
            return;
        }
        const response = await request.post("/api/join-room", {
            data: {
                playerId: "e2e-player-error",
                roomCode: "XXXX",
            },
        });

        expect(response.status()).toBe(404);
        const data = await response.json();
        expect(data).toHaveProperty("error");
        expect(data.error).toHaveProperty("code", "ROOM_NOT_FOUND");
    });
});
