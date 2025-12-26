import { expect, test } from "@playwright/test";

/**
 * Quick Match の E2E テスト
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

test.describe("Quick Match E2E", () => {
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

    test("Quick Matchフローが正常に動作する", async ({ request }) => {
        if (!serverAvailable) {
            test.skip();
            return;
        }
        // 1. Quick Matchに参加
        const quickMatchResponse = await request.post("/api/quick-match", {
            data: {
                playerId: "e2e-player-1",
            },
        });

        expect(quickMatchResponse.ok()).toBeTruthy();
        const quickMatchData = await quickMatchResponse.json();
        expect(quickMatchData).toHaveProperty("roomId");
        const roomId = quickMatchData.roomId;

        // 2. WebSocket接続（PlaywrightのWebSocketサポートを使用）
        // 注意: PlaywrightのWebSocketサポートは限定的なため、
        // 実際のテストでは別のアプローチが必要な場合があります
        // ここでは基本的な構造のみを示します
    });
});
