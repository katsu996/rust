use serde::Serialize;
use utoipa::ToSchema;

/// 計算結果のレスポンス
#[derive(Serialize, ToSchema)]
pub struct CalculationResult {
    /// 1つ目の数値
    pub a: f64,
    /// 2つ目の数値
    pub b: f64,
    /// 演算子
    #[schema(example = "+")]
    pub operation: String,
    /// 計算結果
    pub result: f64,
}

impl CalculationResult {
    pub fn new(a: f64, b: f64, operation: &str, result: f64) -> Self {
        Self {
            a,
            b,
            operation: operation.to_string(),
            result,
        }
    }
}
