# デプロイ手順

このドキュメントでは、Cloudflare Workers へのデプロイ手順を説明します。

## 目次

1. [前提条件](#前提条件)
2. [初回セットアップ](#初回セットアップ)
3. [デプロイ](#デプロイ)
4. [デプロイ後の確認](#デプロイ後の確認)
5. [本番環境の設定](#本番環境の設定)

## 前提条件

- Cloudflare アカウントを持っていること
- `wrangler` CLI がインストールされていること（`pnpm install`で自動インストール）
- Rust と Node.js がインストールされていること

## 初回セットアップ

### 1. Cloudflare アカウントへのログイン

```bash
npx wrangler login
```

ブラウザが開き、Cloudflare アカウントへのログインを求められます。ログイン後、CLI が認証されます。

### 2. アカウントIDの確認

```bash
npx wrangler whoami
```

現在ログインしているアカウント情報が表示されます。

### 3. `wrangler.toml`の確認

`wrangler.toml`ファイルで以下の設定を確認してください：

- `name`: Worker の名前（デフォルト: `rust`）
- `compatibility_date`: 互換性日付
- Durable Objects のバインディング設定

## デプロイ

### 初回デプロイ

```bash
pnpm deploy
```

または

```bash
npx wrangler deploy --minify
```

### 通常のデプロイ

```bash
pnpm deploy
```

### 特定の環境にデプロイ

```bash
# 開発環境
npx wrangler deploy --env development

# 本番環境（デフォルト）
npx wrangler deploy --env production
```

### デプロイ前の確認

デプロイ前に以下を確認してください：

```bash
# ビルドが正常に完了することを確認
pnpm build

# 型チェックが正常に完了することを確認
pnpm build:ts

# テストが正常に完了することを確認
pnpm test
```

## デプロイ後の確認

### 1. Worker の状態確認

```bash
npx wrangler deployments list
```

最新のデプロイメント情報が表示されます。

### 2. ヘルスチェック

```bash
curl https://<your-worker-name>.<your-subdomain>.workers.dev/health
```

レスポンス: `OK`

### 3. API エンドポイントの確認

```bash
# Quick Match API
curl -X POST https://<your-worker-name>.<your-subdomain>.workers.dev/api/quick-match \
  -H "Content-Type: application/json" \
  -d '{"playerId": "test-player"}'

# カスタムルーム作成
curl -X POST https://<your-worker-name>.<your-subdomain>.workers.dev/api/create-room \
  -H "Content-Type: application/json" \
  -d '{"playerId": "test-player", "customRoomSettings": {...}}'
```

### 4. WebSocket接続の確認

```javascript
const ws = new WebSocket('wss://<your-worker-name>.<your-subdomain>.workers.dev/ws?roomId=test-room');
ws.onopen = () => console.log('✅ 接続成功');
ws.onmessage = (event) => console.log('📨 受信:', JSON.parse(event.data));
```

## 本番環境の設定

### 1. カスタムドメインの設定（オプション）

1. Cloudflare Dashboard で Worker を選択
2. Settings → Triggers を選択
3. Custom Domains セクションでドメインを追加

### 2. Origin検証の設定

本番環境では、許可されたOriginのみを許可するように設定してください。

#### `wrangler.toml`での設定

```toml
[env.production.vars]
ALLOWED_ORIGINS = "https://yourdomain.com,https://www.yourdomain.com"
```

### 3. Durable Objects の設定確認

`wrangler.toml`で Durable Objects のバインディングが正しく設定されていることを確認：

```toml
[[durable_objects.bindings]]
name = "GAME_SESSION"
class_name = "GameSession"

[[durable_objects.bindings]]
name = "ROOM_MANAGER"
class_name = "RoomManager"

# 初回デプロイ時にDurable Objectsクラスを登録するために必要
# 無料プランでは new_sqlite_classes を使用する必要があります
[[migrations]]
tag = "v1"
new_sqlite_classes = ["GameSession", "RoomManager"]
```

**注意**:

- `script_name`は指定しません。同じスクリプト内のDurable Objectsを参照するためです。
- 無料プランでは`new_sqlite_classes`を使用します。有料プランでは`new_classes`も使用できます。

### 4. ログの確認

```bash
# リアルタイムログを確認
npx wrangler tail

# 特定の時間範囲のログを確認
npx wrangler tail --format pretty
```

## トラブルシューティング

### デプロイエラー

#### エラー: `Error: Failed to publish your Worker`

**原因**: ビルドエラーや設定エラー

**解決策**:

1. ローカルでビルドが成功することを確認: `pnpm build`
2. `wrangler.toml`の設定を確認
3. TypeScriptの型エラーがないことを確認: `pnpm build:ts`

#### エラー: `Error: Durable Object binding not found`

**原因**: Durable Objects のバインディングが正しく設定されていない

**解決策**:

1. `wrangler.toml`で Durable Objects のバインディングを確認
2. `src/durable-objects/worker.ts`で Durable Objects が正しくエクスポートされていることを確認

### 実行時エラー

#### エラー: `Binding GAME_SESSION is undefined`

**原因**: Durable Objects のバインディングが正しく設定されていない

**解決策**:

1. `wrangler.toml`の Durable Objects バインディングを確認
2. Worker を再デプロイ

### パフォーマンス問題

#### Durable Objects の応答が遅い

**原因**: Durable Objects の起動時間やネットワーク遅延

**解決策**:

1. Hibernation API を使用して状態を永続化（既に実装済み）
2. 不要な状態保存を減らす
3. Cloudflare のログでパフォーマンスを確認

## 継続的デプロイ（CI/CD）

### GitHub Actions の例

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### 必要なシークレット

GitHub Actions で使用するシークレット：

- `CLOUDFLARE_API_TOKEN`: Cloudflare API トークン
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare アカウントID

API トークンの取得方法：

1. Cloudflare Dashboard → My Profile → API Tokens
2. Create Token をクリック
3. Edit Cloudflare Workers テンプレートを使用
4. 必要な権限を設定してトークンを作成

## 参考リンク

- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Wrangler CLI ドキュメント](https://developers.cloudflare.com/workers/wrangler/)
- [Durable Objects ドキュメント](https://developers.cloudflare.com/durable-objects/)
