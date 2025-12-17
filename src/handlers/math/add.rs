use worker::{Response, Result, Url};

use crate::constants::DEFAULT_PARAM_VALUE;
use crate::models::CalculationResult;
use crate::utils::{get_f64_param, json_response, parse_query_params};

/// 足し算エンドポイントのハンドラー
/// GET /math/add?a=X&b=Y
pub fn handle(url: &Url) -> Result<Response> {
    let params = parse_query_params(url);
    let a = get_f64_param(&params, "a", DEFAULT_PARAM_VALUE);
    let b = get_f64_param(&params, "b", DEFAULT_PARAM_VALUE);

    let result = CalculationResult::new(a, b, "+", a + b);

    json_response(&result)
}
