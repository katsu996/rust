# トラブルシューティングガイド

このドキュメントでは、よくある問題とその解決方法を説明します。

## 目次

1. [ビルドエラー](#ビルドエラー)
2. [実行時エラー](#実行時エラー)
3. [WebSocket接続の問題](#websocket接続の問題)
4. [Durable Objects の問題](#durable-objects-の問題)
5. [テストの問題](#テストの問題)
6. [デプロイの問題](#デプロイの問題)

## ビルドエラー

### Rust コンパイルエラー

#### エラー: `error: could not compile 'rust'`

**原因**: Rust のコンパイルエラー

**解決策**:

```bash
# 詳細なエラーメッセージを確認
cargo build --target wasm32-unknown-unknown

# 型エラーを確認
cargo check --target wasm32-unknown-unknown
```

#### エラー: `error: linker 'cc' not found`

**原因**: システムに C コンパイラがインストールされていない

**解決策**:

- **Windows**: Visual Studio Build Tools をインストール
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt-get install build-essential`

### TypeScript コンパイルエラー

#### エラー: `error TS2304: Cannot find name 'Env'`

**原因**: TypeScript の型定義が不足している

**解決策**:

```bash
# 型チェックを実行してエラーを確認
pnpm build:ts

# @cloudflare/workers-types がインストールされていることを確認
pnpm list @cloudflare/workers-types
```

#### エラー: `error TS2307: Cannot find module`

**原因**: モジュールのパスが間違っている、または依存関係が不足している

**解決策**:

```bash
# 依存関係を再インストール
pnpm install

# 型定義ファイルを確認
ls node_modules/@cloudflare/workers-types
```

### Wrangler ビルドエラー

#### エラー: `error: download of config.json failed`

**原因**: ネットワークエラーまたは worker-build の設定問題

**解決策**:

```bash
# 既存のビルドを使用（Windows環境）
# wrangler.toml の build コマンドが既存ビルドを使用するように設定されていることを確認

# 手動でビルド
cargo build --release --target wasm32-unknown-unknown
worker-build --release
```

## 実行時エラー

### WebSocket接続エラー

#### エラー: `WebSocket接続エラー (コード: 1006)`

**原因**:

- サーバーが起動していない
- Origin検証に失敗
- roomId が指定されていない

**解決策**:

1. 開発サーバーが起動していることを確認: `pnpm dev`
2. Origin検証のログを確認（サーバー側のコンソール）
3. roomId が正しく指定されていることを確認: `ws://127.0.0.1:8787/ws?roomId=test-room`

#### エラー: `Invalid origin: null`

**原因**: `file://` プロトコルからの接続が許可されていない

**解決策**:

- 開発環境では `null` origin が自動的に許可されます
- ブラウザの開発者コンソールから接続する場合は、`test-websocket.html` を使用してください

#### エラー: `TypeError: You must call one of accept() or state.acceptWebSocket() on this WebSocket before sending messages.`

**原因**: WebSocket が accept されていない

**解決策**:

- `src/durable-objects/gamesession.ts` で `this.ctx.acceptWebSocket(server)` が呼ばれていることを確認
- この問題は既に修正済みです

### Durable Objects エラー

#### エラー: `Failed to get GAME_SESSION namespace: RustError("Binding GAME_SESSION is undefined.")`

**原因**: Durable Objects のバインディングが正しく設定されていない

**解決策**:

1. `wrangler.toml` で Durable Objects のバインディングを確認:

   ```toml
   [[durable_objects.bindings]]
   name = "GAME_SESSION"
   class_name = "GameSession"
   script_name = "rust"
   ```

2. `src/durable-objects/worker.ts` で Durable Objects が正しくエクスポートされていることを確認

3. `src/worker-entry.ts` で Durable Objects が正しくエクスポートされていることを確認

4. 開発サーバーを再起動: `pnpm dev`

#### エラー: `Failed to get DO ID from name`

**原因**: Durable Objects の ID 取得に失敗

**解決策**:

1. roomId が正しく指定されていることを確認
2. Durable Objects のバインディングが正しく設定されていることを確認
3. サーバーログで詳細なエラーメッセージを確認

### API エラー

#### エラー: `404 Not Found`

**原因**: エンドポイントのパスが間違っている、またはルーティングが正しく設定されていない

**解決策**:

1. `src/lib.rs` でルーティングが正しく設定されていることを確認
2. リクエストのパスとメソッドが正しいことを確認
3. 開発サーバーを再起動

#### エラー: `500 Internal Server Error`

**原因**: サーバー側のエラー

**解決策**:

1. サーバーログで詳細なエラーメッセージを確認
2. `wrangler dev` のコンソール出力を確認
3. エラーハンドリングが正しく実装されていることを確認

## WebSocket接続の問題

### 接続が確立されない

#### 問題: WebSocket接続がタイムアウトする

**原因**:

- サーバーが起動していない
- ファイアウォールがブロックしている
- ネットワークの問題

**解決策**:

1. サーバーが起動していることを確認: `curl http://127.0.0.1:8787/health`
2. ポート8787が使用可能であることを確認
3. ファイアウォールの設定を確認

#### 問題: `connection_established` メッセージが受信されない

**原因**:

- WebSocket の accept が正しく処理されていない
- メッセージ送信のタイミングが早すぎる

**解決策**:

1. `src/durable-objects/gamesession.ts` で `this.ctx.acceptWebSocket(server)` が呼ばれていることを確認
2. クライアント側で接続確立を待ってからメッセージを送信

### メッセージ送受信の問題

#### 問題: メッセージが送信されない

**原因**:

- WebSocket の readyState が OPEN でない
- メッセージの形式が正しくない

**解決策**:

```javascript
// クライアント側のコード
if (ws.readyState === WebSocket.OPEN) {
  ws.send(JSON.stringify({
    action: "ready_toggle",
    data: {}
  }));
}
```

#### 問題: メッセージが受信されない

**原因**:

- メッセージハンドラーが正しく実装されていない
- メッセージの形式が正しくない

**解決策**:

1. サーバーログでメッセージが受信されていることを確認
2. `src/durable-objects/gamesession.ts` の `handleMessage` メソッドを確認
3. メッセージの形式が `ClientMessage` インターフェースに一致していることを確認

## Durable Objects の問題

### 状態が保存されない

#### 問題: 状態が永続化されない

**原因**:

- `saveState()` が呼ばれていない
- ストレージへの書き込みが失敗している

**解決策**:

1. `src/durable-objects/gamesession.ts` で `saveState()` が適切に呼ばれていることを確認
2. サーバーログでエラーがないことを確認
3. `this.ctx.storage.put()` の呼び出しを確認

### 状態が復元されない

#### 問題: 状態が正しく復元されない

**原因**:

- `restoreState()` が呼ばれていない
- ストレージから読み込んだデータの形式が正しくない

**解決策**:

1. `src/durable-objects/gamesession.ts` の `restoreState()` メソッドを確認
2. ストレージに保存されているデータの形式を確認
3. デバッグログを追加して状態の復元を確認

## テストの問題

### Rust テストが実行されない

#### 問題: `cargo test` が失敗する

**原因**:

- テストコードにエラーがある
- テストターゲットが正しく設定されていない

**解決策**:

```bash
# テストを実行してエラーを確認
cargo test

# 特定のテストのみ実行
cargo test test_error_code_as_str
```

### TypeScript テストが実行されない

#### 問題: `pnpm test:ts` が失敗する

**原因**:

- Vitest の設定が正しくない
- テストファイルにエラーがある

**解決策**:

```bash
# テストを実行してエラーを確認
pnpm test:ts

# 特定のテストファイルのみ実行
pnpm test:ts tests/ts/unit/gamesession.test.ts
```

### E2E テストが実行されない

#### 問題: `pnpm test:e2e` が失敗する

**原因**:

- 開発サーバーが起動していない
- Playwright の設定が正しくない

**解決策**:

1. 開発サーバーを起動: `pnpm dev`
2. 別のターミナルでテストを実行: `pnpm test:e2e`
3. Playwright の設定を確認: `playwright.config.ts`

## デプロイの問題

### デプロイが失敗する

#### エラー: `Cannot create binding for class 'GameSession' that is not exported by script 'rust'`

**原因**: Durable Objects が Worker スクリプトからエクスポートされていない、または`script_name`が誤って設定されている

**解決策**:

1. `src/worker-entry.ts`で Durable Objects がエクスポートされていることを確認:

   ```typescript
   export { GameSession, RoomManager } from './durable-objects/worker';
   ```

2. `wrangler.toml`で`script_name`を削除（同じスクリプト内のDurable Objectsの場合）:

   ```toml
   [[durable_objects.bindings]]
   name = "GAME_SESSION"
   class_name = "GameSession"
   # script_name = "rust"  ← 削除
   ```

3. マイグレーション設定を追加:

   ```toml
   [[migrations]]
   tag = "v1"
   new_sqlite_classes = ["GameSession", "RoomManager"]
   ```

#### エラー: `In order to use Durable Objects with a free plan, you must create a namespace using a 'new_sqlite_classes' migration.`

**原因**: 無料プランでは`new_sqlite_classes`を使用する必要がある

**解決策**:
`wrangler.toml`のマイグレーション設定で`new_sqlite_classes`を使用:

```toml
[[migrations]]
tag = "v1"
new_sqlite_classes = ["GameSession", "RoomManager"]
```

**注意**: 有料プランでは`new_classes`も使用できますが、無料プランでは`new_sqlite_classes`が必須です。

#### 問題: `wrangler deploy` が失敗する

**原因**:

- ビルドエラー
- 認証エラー
- 設定エラー

**解決策**:

```bash
# ローカルでビルドが成功することを確認
pnpm build

# 認証を確認
npx wrangler whoami

# 設定を確認
cat wrangler.toml
```

## よくある質問（FAQ）

### Q: 開発サーバーを起動しても接続できない

**A**: 以下を確認してください：

1. サーバーが正常に起動しているか: `curl http://127.0.0.1:8787/health`
2. ポート8787が使用可能か
3. ファイアウォールの設定

### Q: WebSocket接続は成功するが、メッセージが送受信されない

**A**: 以下を確認してください：

1. メッセージの形式が正しいか（JSON形式、`ClientMessage`インターフェースに一致）
2. サーバーログでメッセージが受信されているか
3. メッセージハンドラーが正しく実装されているか

### Q: Durable Objects の状態が保存されない

**A**: 以下を確認してください：

1. `saveState()` が適切に呼ばれているか
2. ストレージへの書き込みが成功しているか（エラーログを確認）
3. Hibernation API が正しく使用されているか

### Q: テストが実行されない

**A**: 以下を確認してください：

1. 依存関係がインストールされているか: `pnpm install`
2. テストファイルが正しい場所にあるか
3. テストの設定が正しいか（`vitest.config.ts`, `playwright.config.ts`）

## ログの確認方法

### 開発環境

```bash
# wrangler dev のコンソール出力を確認
pnpm dev
```

### 本番環境

```bash
# リアルタイムログを確認
npx wrangler tail

# フォーマット済みログを確認
npx wrangler tail --format pretty
```

## サポート

問題が解決しない場合は、以下を確認してください：

1. [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
2. [Wrangler CLI ドキュメント](https://developers.cloudflare.com/workers/wrangler/)
3. [Durable Objects ドキュメント](https://developers.cloudflare.com/durable-objects/)
4. プロジェクトの GitHub Issues
