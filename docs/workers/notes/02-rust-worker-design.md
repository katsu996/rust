# 02 Rust Worker 設計メモ（API Gateway）

このファイルは、`docs/workers/todo-rust-migration.md` の「2. Rust Worker / DO 側のAPI・責務設計」の  
**Rust Worker（API Gateway）部分**の詳細メモです。

## 2.1 Rust Worker（API Gateway）の責務

- フロントエンドからの HTTP / WebSocket リクエストを受け付ける入口。
- パスとメソッドに応じて
  - WebSocket接続要求 → GameSession DO へハンドオフ
  - 将来の REST API → RoomManager DO などへフォワード
  を行う。
- 共通のエラーハンドリングとロギングポリシーを実装する。

## 2.2 エンドポイント一覧（現時点の想定）

- `GET /ws`
  - WebSocket Upgrade 専用エンドポイント。
  - Upgrade/Connection ヘッダ検証、Origin 検証、`roomId` 抽出を行う。
  - `GAME_SESSION` DO にリクエストを転送し、DO 側で WebSocket を確立する。

- `GET /health`
  - シンプルなヘルスチェック用。
  - `200 OK` + `"ok"` など短いボディを返す。

- `GET/POST /api/*`（将来拡張）
  - プロフィール・統計・ランキングなど、非リアルタイム REST API 用。
  - 今回のフェーズでは詳細な仕様決めは不要で、「入口として確保」しておく想定。

## 2.3 ルーティングの考え方

- 1つの `main_router(req, env, ctx)` 関数を用意し、以下のように分岐するイメージ:
  - `GET /ws` → `handle_ws`
  - `GET /health` → `handle_health`
  - `/api/` プレフィックス → `handle_http_api`
  - それ以外 → `404 Not Found`

ルーティングの詳細は `docs/workers/design/rust-worker-routing.md` に記載しておき、  
ここでは「何をどこに振るか」の粒度にとどめる。

## 2.4 GameSession / RoomManager DO との連携

- GameSession DO:
  - `/ws` による WebSocket 接続時に利用。
  - Worker 側では `roomId` を決定し、`GAME_SESSION.idFromName(roomId)` で DO ID を計算。
  - その stub に対して `fetch(request)` を呼び、DO 側で Upgrade を完了させる。

- RoomManager DO:
  - 将来の `/api/rooms/*` などで利用。
  - quick match / custom room のメタ情報や roomCode を管理。

## 2.5 エラーハンドリングの境界

- Upgrade ヘッダなし / Origin 不正 / 明らかなクライアントエラー
  → Worker レイヤーで 4xx を返す。
- DO 呼び出し失敗など内部連携エラー
  → Worker で 5xx を返しつつ、内部ログに詳細を残す。

詳細なステータスコードやエラーボディ形式は  
`docs/workers/design/rust-worker-error-handling.md` に委譲する。


