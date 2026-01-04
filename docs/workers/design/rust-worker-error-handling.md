# Rust Worker エラーハンドリング設計

## 1. 目的

- WebSocket/HTTP 両方に対して、一貫したエラー応答とロギング戦略を提供する。
- クライアントが「再試行すべきか/ユーザーにエラーを出すべきか」を判断しやすい情報を返す。

## 2. エラー分類

### 2.1 クライアント起因 (4xx)

- 400 Bad Request
  - 不正なクエリ/ヘッダ（例: roomId フォーマット不正）
- 401 Unauthorized（将来の認証導入時）
- 403 Forbidden
  - Origin検証失敗、アクセス権限不足
- 404 Not Found
  - 不存在のエンドポイント/ルーム等
- 426 Upgrade Required
  - WebSocket Upgradeヘッダ不足

### 2.2 サーバー/インフラ起因 (5xx)

- 500 Internal Server Error
  - 予期しない例外
- 502 Bad Gateway
  - DO への fetch 失敗などの内部連携エラー
- 503 Service Unavailable
  - Workers/DO 側の高負荷・一時停止

## 3. レスポンス形式

- 可能な限り JSON 形式で返す:

```json
{
  "error": {
    "code": "INVALID_ROOM_ID",
    "message": "roomId is invalid format",
    "retryable": false
  }
}
```

- WebSocket 接続中に致命的エラーが発生した場合:
  - `ServerMessage.type = "error"` を送信し、場合により `close()`。

## 4. ロギングポリシー

- すべての 4xx/5xx で構造化ログを出力:
  - `category`: `"client_error"` / `"server_error"`
  - `status`: HTTPステータス
  - `code`: 内部エラーコード
  - `roomId` / `playerId` / `path`
  - `stack`: 可能ならスタックトレース（内部のみ）

## 5. 再試行ポリシーの示し方

- `retryable: true` のときのみ、クライアントは自動再接続/再リクエストを試みる。
  - 例: 一時的な 503, 502 など
- `retryable: false` の場合は UI にエラー表示し、ユーザー操作を促す。
