# ビルド設定の説明

## 現在の設定

### Rust Worker

- メインエントリーポイント: `build/worker/shim.mjs`
- ビルドコマンド: `cargo install -q worker-build && worker-build --release`
- ソース: `src/` (Rustファイル)

### TypeScript Durable Objects

- エントリーポイント: `src/durable-objects/worker.ts`
- エクスポート: `GameSession`, `RoomManager`
- ビルド: wranglerが自動的にTypeScriptをビルドしてバンドルに含めます

## 動作確認方法

### 1. ローカル開発サーバーの起動

```bash
pnpm dev
```

### 2. ビルドエラーの確認

TypeScriptのコンパイルエラーがないか確認:

```bash
pnpm build:ts
```

### 3. ビルドの実行

```bash
pnpm build
```

## 注意事項

### TypeScript Durable Objectsのビルド

- wranglerは自動的にTypeScriptファイルをビルドしてバンドルに含めます
- `src/durable-objects/worker.ts`がエントリーポイントとして使用されます
- `wrangler.toml`の`[[durable_objects.bindings]]`でクラス名を指定します

### トラブルシューティング

#### Durable Objectsが見つからない場合

1. `src/durable-objects/worker.ts`が正しくエクスポートしているか確認
2. `wrangler.toml`の`class_name`がエクスポートされたクラス名と一致しているか確認
3. `script_name`が`"rust"`（Worker名）と一致しているか確認

#### ビルドエラーが発生する場合

1. TypeScriptの型エラーを確認: `pnpm build:ts`
2. Rustのコンパイルエラーを確認: `cargo build`
3. `tsconfig.json`の設定を確認

## 次のステップ

1. `pnpm dev`でローカルサーバーを起動
2. WebSocket接続をテスト: `ws://localhost:8787/ws?roomId=test-room`
3. エラーが発生した場合は、ログを確認して修正
