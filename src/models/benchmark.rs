use serde::Serialize;
use utoipa::ToSchema;

/// ベンチマーク結果のレスポンス
#[derive(Serialize, ToSchema)]
pub struct BenchmarkResult {
    /// 配列の要素数
    pub n: u64,
    /// 処理を繰り返す回数
    pub x: u64,
    /// 実行回数
    pub iterations: u64,
    /// 実行時間（ミリ秒）
    pub execution_time_ms: f64,
    /// 実行時間（秒）
    pub execution_time_sec: f64,
    /// 1回あたりの平均実行時間（ミリ秒）
    pub avg_execution_time_ms: f64,
    /// 1回あたりの平均実行時間（秒）
    pub avg_execution_time_sec: f64,
    /// 計算結果（配列の各要素の合計値）
    pub result: u64,
}

impl BenchmarkResult {
    #[allow(clippy::cast_precision_loss)]
    pub fn new(n: u64, x: u64, iterations: u64, execution_time_ms: f64, result: u64) -> Self {
        let avg_execution_time_ms = execution_time_ms / iterations as f64;
        Self {
            n,
            x,
            iterations,
            execution_time_ms,
            execution_time_sec: execution_time_ms / 1000.0,
            avg_execution_time_ms,
            avg_execution_time_sec: avg_execution_time_ms / 1000.0,
            result,
        }
    }
}
