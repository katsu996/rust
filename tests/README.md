# テストガイド

このディレクトリには、プロジェクトのテストファイルが含まれています。

## テスト構成

### Rust テスト

- 場所: `src/**/*.rs` 内の `#[cfg(test)]` モジュール
- 実行: `pnpm test:rust` または `cargo test --target wasm32-unknown-unknown`

### TypeScript ユニットテスト

- 場所: `tests/ts/unit/`
- 実行: `pnpm test:ts:unit`
- フレームワーク: Vitest

### TypeScript 統合テスト

- 場所: `tests/ts/integration/`
- 実行: `pnpm test:ts:integration`
- フレームワーク: Vitest
- 注意: 開発サーバー（`pnpm dev`）が起動している必要があります

### E2E テスト

- 場所: `tests/e2e/`
- 実行: `pnpm test:e2e`
- フレームワーク: Playwright
- 注意: 開発サーバー（`pnpm dev`）が起動している必要があります

## テストの実行

### すべてのテストを実行

```bash
pnpm test
```

### 個別に実行

```bash
# Rustテストのみ
pnpm test:rust

# TypeScriptユニットテストのみ
pnpm test:ts:unit

# TypeScript統合テストのみ
pnpm test:ts:integration

# E2Eテストのみ
pnpm test:e2e
```

### ウォッチモード

```bash
pnpm test:watch
```

### カバレッジ

```bash
pnpm test:coverage
```

## テストの書き方

### Rust テスト

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_example() {
        assert_eq!(2 + 2, 4);
    }
}
```

### TypeScript テスト（Vitest）

```typescript
import { describe, it, expect } from "vitest";

describe("MyFunction", () => {
  it("should work correctly", () => {
    expect(true).toBe(true);
  });
});
```

### E2E テスト（Playwright）

```typescript
import { test, expect } from "@playwright/test";

test("my feature", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/My App/);
});
```

## 注意事項

1. **統合テストとE2Eテスト**は開発サーバーが起動している必要があります
2. テスト実行前に `pnpm dev` を別ターミナルで起動してください
3. または、CI/CD環境では自動的にサーバーを起動する設定を追加してください

## CI/CD での実行

GitHub ActionsなどのCI/CD環境では、以下のようにテストを実行できます：

```yaml
- name: Run tests
  run: |
    pnpm test:rust
    pnpm test:ts
    # E2Eテストは別途サーバー起動が必要
```
