use worker::{Response, Result, Url};
use wasm_bindgen::{JsCast, JsValue};
use js_sys::{Function, Reflect};

use crate::models::BenchmarkResult;
use crate::utils::{get_u64_param, json_response, parse_query_params};

/// 配列の各要素に+1し、最後に合計数を返します。
/// param n: u64 配列の要素数
/// param x: u64 処理を繰り返す回数
/// returns u64 配列の各要素の合計値
fn add_array(n: u64, x: u64) -> u64 {
    // 引数n個の要素を持った配列(正確にはベクタ)を作り各要素は0に初期化
    let mut a = vec![0u64; n as usize];
    // 引数のx回、配列の全要素に+1していく
    for _ in 0..x {
        for i in 0..n as usize {
            a[i] += 1;
        }
    }
    // 合計値を返す
    a.iter().sum()
}

/// ベンチマークエンドポイントのハンドラー
/// GET /benchmark/add_array?n=10000&x=10000&iterations=10
/// デフォルト: n=10000, x=10000, iterations=10
///
/// 注意: Cloudflare Workersの実行時間制限を考慮し、デフォルトの実行回数は10回に設定しています。
/// より多くの実行回数が必要な場合は、iterationsパラメータで指定できますが、
/// 実行時間制限（通常10秒程度）を超えないように注意してください。
pub fn handle(url: &Url) -> Result<Response> {
    let params = parse_query_params(url);
    let n = get_u64_param(&params, "n", 10000);
    let x = get_u64_param(&params, "x", 10000);
    let iterations = get_u64_param(&params, "iterations", 10);

    // ベンチマーク実行
    // WASM環境では Performance API を使用して高精度タイマーを取得
    // Cloudflare Workers環境ではグローバルオブジェクトからperformanceを取得し、
    // Reflectを使ってperformance.now()を直接呼び出す
    let global = js_sys::global();
    let performance_obj = Reflect::get(&global, &JsValue::from_str("performance"))
        .map_err(|_| worker::Error::RustError("Performance API not available".to_string()))?;
    
    // performance.now関数を取得してFunction型に変換
    let now_fn_value = Reflect::get(&performance_obj, &JsValue::from_str("now"))
        .map_err(|_| worker::Error::RustError("performance.now is not available".to_string()))?;
    let now_fn: Function = now_fn_value
        .dyn_into()
        .map_err(|_| worker::Error::RustError("performance.now is not a function".to_string()))?;
    
    // performance.now()を呼び出して開始時刻を取得
    let start = now_fn
        .call1(&performance_obj, &js_sys::Array::new())
        .map_err(|_| worker::Error::RustError("Failed to call performance.now()".to_string()))?
        .as_f64()
        .ok_or_else(|| worker::Error::RustError("performance.now() did not return a number".to_string()))?;
    
    let mut result = 0u64;

    for _ in 0..iterations {
        result = add_array(n, x);
    }

    // performance.now()を呼び出して終了時刻を取得
    let end = now_fn
        .call1(&performance_obj, &js_sys::Array::new())
        .map_err(|_| worker::Error::RustError("Failed to call performance.now()".to_string()))?
        .as_f64()
        .ok_or_else(|| worker::Error::RustError("performance.now() did not return a number".to_string()))?;
    
    let execution_time_ms = end - start;

    let benchmark_result = BenchmarkResult::new(n, x, iterations, execution_time_ms, result);

    json_response(&benchmark_result)
}


