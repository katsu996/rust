# 実装プロンプト集

このディレクトリには、Rust Worker と Durable Objects を実装する際に使用する AI 向けプロンプトが含まれています。

## ファイル構成

### 実装手順ガイド

- **`implementation-guide.md`** - 実装の全体フローと各フェーズの手順をまとめたガイド
  - **まずこれを読む**: 実装を開始する前に、このファイルを読んで全体像を把握してください

### プロンプトファイル

- **`rust-worker-implementation-prompt.md`** - Phase 1: Rust Worker 実装用プロンプト
- **`durable-objects-implementation-prompt.md`** - Phase 2: Durable Objects 実装用プロンプト
- **`integration-implementation-prompt.md`** - Phase 3: 統合・テスト用プロンプト

## 使い方

### 1. 実装手順ガイドを読む

まず `implementation-guide.md` を読んで、実装の全体フローを理解してください。

### 2. 各フェーズのプロンプトを使用

各フェーズで、対応するプロンプトファイルを AI に渡します：

1. **Phase 1**: `rust-worker-implementation-prompt.md` を使用
2. **Phase 2**: `durable-objects-implementation-prompt.md` を使用
3. **Phase 3**: `integration-implementation-prompt.md` を使用

### 3. 設計書とメモファイルを提供

各プロンプトには「事前に読むべき設計書」が記載されています。AI にプロンプトを渡す際は、これらの設計書も一緒に提供してください。

設計書は以下のディレクトリにあります：

- `docs/workers/design/` - 設計書
- `docs/workers/specs/` - API 仕様書
- `docs/workers/notes/` - 詳細メモ

### 4. 既存コードを参照

プロンプトには「既存コード参照」セクションがあります。必要に応じて、既存の TypeScript コード（`src/server/` 以下）も参照として提供してください。

## 実装の流れ

```
1. implementation-guide.md を読む
   ↓
2. Phase 1: rust-worker-implementation-prompt.md を使用
   ↓
3. Phase 2: durable-objects-implementation-prompt.md を使用
   ↓
4. Phase 3: integration-implementation-prompt.md を使用
```

## 注意点

- 各プロンプトは独立して使用できますが、Phase 3 では Phase 1 と Phase 2 の実装が完了している必要があります
- プロンプト内で指定されている設計書は、必ず提供してください
- 実装中に不明点があれば、設計書やメモファイルを参照してください
- 既存の TypeScript コードを参考にしながら実装を進めてください

## 関連ドキュメント

- `docs/workers/todo-rust-migration.md` - 移行 TODO リスト（全体の進捗管理）
- `docs/workers/design/` - 設計書一覧
- `docs/workers/specs/` - API 仕様書一覧
- `docs/workers/notes/` - 詳細メモ一覧
