# 06 クライアント側切り替え方針メモ（TS → Workers WebSocket）

このファイルは、`docs/workers/todo-rust-migration.md` の「4. クライアント側の切り替え方針」に対応する詳細メモです。

## 4.1 接続先URLの新ルール

- 旧構成:
  - `ws://localhost:3000` など、Node.js サーバーを直接指す URL。
  - `SamuraiKirby.getWebSocketUrl()` 内で `location.port` を見てポートを切り替えるロジックあり。

- 新構成（案）:
  - `wss://api.samurai-kirby.com/ws?roomId=<roomId>`
  - もしくは開発環境向け: `wss://dev-api.samurai-kirby.com/ws?...`
  - ポート判定ロジックは廃止し、「環境ごとのベースURL」は `NetworkConfig` 等に集約。

### 実装イメージ

- `src/config/NetworkConfig.ts` に以下のような関数を用意:

```ts
export function getWebSocketEndpoint(roomId: string): string {
  const base = import.meta.env.VITE_API_WS_BASE_URL; // 例: wss://api.samurai-kirby.com
  return `${base}/ws?roomId=${encodeURIComponent(roomId)}`;
}
```

- `SamuraiKirby.getWebSocketUrl()` はこの関数を呼ぶだけに簡略化する。

## 4.2 再接続・エラー処理方針

- 現行:
  - `WebSocketConnection` が再接続回数・待機時間・ACKタイムアウトなどを管理。
- 移行後:
  - 基本方針は維持しつつ、Workers 側のエラーコード/クローズコードに応じて
    - 一時的エラー: 自動再接続対象（例: 1011, 1012 など）
    - 恒久的エラー（認証エラー・バージョン不一致など）: 自動再接続しない
  - クローズイベントの `code` / `reason` をロギングし、UI でユーザーに分かるメッセージを出す。

## 4.3 残すロジック／差し替えるロジック／削除するロジック

- **残すもの**
  - `ClientMessage` / `ServerMessage` 型定義
  - `WebSocketHandler` やゲーム側のメッセージハンドラー (`GameMessageHandler` 等)
  - `WebSocketMessageService` の「typeごとのハンドラ登録」という構造

- **差し替えるもの**
  - `getWebSocketUrl` の実装を `NetworkConfig` ベースに書き換え
  - `WebSocketConnection` の再接続条件（Workers側クローズコードに合わせて微調整）

- **最終的に削除する候補**
  - Node.js ポートに依存した URL 判定ロジック
  - 1つのゲームに対して過剰な WebSocket プールが前提になっている箇所（必要に応じてシンプル化）


