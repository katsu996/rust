/**
 * Worker エントリーポイント
 * Rust WorkerとTypeScript Durable Objectsを統合
 */

// Rust Workerのデフォルトエクスポートをインポート
// build/index.jsはデフォルトエクスポートとしてWorkerEntrypointを継承したクラスをエクスポートします
// @ts-ignore - build/index.jsの型定義が不完全なため
import RustWorkerClass from '../build/index.js';

// Rust Workerのfetch関数を直接エクスポート（Cloudflare Workersの要件）
// @ts-ignore - 型定義が不完全なため
export default RustWorkerClass;

// TypeScript Durable Objectsをエクスポート
export { GameSession, RoomManager } from './durable-objects/worker';
