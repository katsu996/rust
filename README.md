# rust

Cloudflare Workers で動作する Rust ベースの計算API です。  
**utoipa** を使用した OpenAPI ドキュメント自動生成に対応しています。

## 特徴

- 🦀 **Rust** + Cloudflare Workers
- 📖 **OpenAPI 3.1** 自動生成（utoipa）
- 🎨 **Swagger UI** 内蔵
- ⚡ **エッジコンピューティング** による高速レスポンス

## API エンドポイント

| エンドポイント | 説明 |
|---------------|------|
| `GET /math/add?a=X&b=Y` | 足し算（X + Y） |
| `GET /math/sub?a=X&b=Y` | 引き算（X - Y） |
| `GET /openapi.json` | OpenAPI 仕様（JSON） |
| `GET /docs` | Swagger UI |

### レスポンス例

```json
{
  "a": 10,
  "b": 5,
  "operation": "+",
  "result": 15
}
```

## 前提条件

- [Rust](https://rustup.rs/) (最新版)
- [Node.js](https://nodejs.org/) (v18以上推奨)
- [pnpm](https://pnpm.io/) または npm

### Rust ターゲットの追加

```bash
rustup target add wasm32-unknown-unknown
```

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. Windows環境でのesbuild設定（初回のみ）

Windows環境では、worker-buildがesbuildを正しく見つけられない場合があります。以下のコマンドで手動設定してください：

```powershell
# esbuildのパスを確認
$esbuildPath = Get-ChildItem -Path "node_modules" -Recurse -Filter "esbuild.exe" | Select-Object -First 1 -ExpandProperty FullName

# worker-buildが期待するディレクトリを作成してコピー
$targetDir = "$env:LOCALAPPDATA\worker-build\esbuild-win32-x64-0.27.0.exe\bin"
New-Item -ItemType Directory -Force -Path $targetDir
Copy-Item $esbuildPath "$targetDir\esbuild.exe"
```

## 開発

### ローカル開発サーバーの起動

```bash
pnpm dev
```

サーバーは `http://127.0.0.1:8787` で起動します。

- API: `http://127.0.0.1:8787/math/add?a=10&b=5`
- Swagger UI: `http://127.0.0.1:8787/docs`

コードを変更すると自動的にリビルドされ、ホットリロードが適用されます。

### 手動ビルド

```bash
pnpm build
```

## デプロイ

Cloudflare Workers にデプロイするには：

```bash
pnpm deploy
```

初回デプロイ時は Cloudflare アカウントへのログインが必要です：

```bash
npx wrangler login
```

## プロジェクト構造

```md
rust/
├── src/
│   ├── lib.rs              # エントリーポイント（ルーティング）
│   ├── constants.rs        # 定数定義
│   ├── openapi.rs          # OpenAPI 定義（utoipa）
│   ├── handlers/           # リクエストハンドラー
│   │   ├── mod.rs
│   │   ├── math/           # /math/* エンドポイント
│   │   │   ├── mod.rs
│   │   │   ├── add.rs      # /math/add
│   │   │   └── sub.rs      # /math/sub
│   │   └── docs.rs         # OpenAPI/Swagger UI
│   ├── models/             # データモデル
│   │   ├── mod.rs
│   │   └── calculation.rs  # 計算結果
│   └── utils/              # ユーティリティ
│       ├── mod.rs
│       ├── params.rs       # パラメータ取得
│       └── response.rs     # JSONレスポンス
├── build/                  # ビルド成果物（自動生成）
├── Cargo.toml              # Rust 依存関係
├── rustfmt.toml            # フォーマッター設定
├── wrangler.toml           # Wrangler 設定
└── package.json            # Node.js 依存関係
```

## 新しいエンドポイントの追加方法

### 1. モデルを追加（必要な場合）

```rust
// src/models/your_model.rs
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct YourModel {
    /// フィールドの説明
    pub field: String,
}
```

### 2. ハンドラーを追加

```rust
// src/handlers/your_group/your_handler.rs
use worker::{Response, Result, Url};
use crate::utils::json_response;

pub fn handle(url: &Url) -> Result<Response> {
    // 処理
}
```

```rust
// src/handlers/your_group/mod.rs
pub mod your_handler;
```

```rust
// src/handlers/mod.rs に追加
pub mod your_group;
```

### 3. OpenAPI ドキュメントを追加

```rust
// src/openapi.rs に追加
#[utoipa::path(
    get,
    path = "/your-group/your-endpoint",
    tag = "YourTag",
    responses(
        (status = 200, description = "成功", body = YourModel)
    )
)]
fn your_endpoint() {}

// #[openapi(...)] の paths に追加
#[derive(OpenApi)]
#[openapi(
    paths(add, sub, your_endpoint),  // ← 追加
    ...
)]
```

### 4. ルーティングを追加

```rust
// src/lib.rs
match url.path() {
    "/your-group/your-endpoint" => handlers::your_group::your_handler::handle(&url),
    ...
}
```

## コード品質

### フォーマット

```bash
cargo fmt
```

### リンター

```bash
cargo clippy
```

## 技術スタック

| 技術 | 用途 |
|-----|------|
| [worker-rs](https://github.com/cloudflare/workers-rs) | Cloudflare Workers Rust SDK |
| [utoipa](https://github.com/juhaku/utoipa) | OpenAPI 自動生成 |
| [serde](https://serde.rs/) | シリアライズ/デシリアライズ |
| [wrangler](https://developers.cloudflare.com/workers/wrangler/) | デプロイツール |

## 参考リンク

- [Cloudflare Workers Rust Documentation](https://developers.cloudflare.com/workers/languages/rust/)
- [workers-rs GitHub](https://github.com/cloudflare/workers-rs)
- [utoipa GitHub](https://github.com/juhaku/utoipa)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
