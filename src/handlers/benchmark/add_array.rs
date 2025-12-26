use js_sys::{Function, JsString, Reflect};
use wasm_bindgen::{JsCast, JsValue};
use worker::{Response, Result, Url};

use crate::models::BenchmarkResult;
use crate::utils::{get_u64_param, json_response, parse_query_params};

/// 高精度時刻計測のためのPerformance APIラッパー
struct PerformanceTimer {
    perf_api: Option<(Function, JsValue)>,
}

impl PerformanceTimer {
    /// Performance APIが利用可能か確認し、タイマーを初期化する
    fn new() -> Self {
        let perf_api = Reflect::get(&js_sys::global(), &JsString::from("performance"))
            .ok()
            .and_then(|perf| {
                Reflect::get(&perf, &JsString::from("now"))
                    .ok()
                    .and_then(|now_fn_value| now_fn_value.dyn_into::<Function>().ok())
                    .map(|now_fn| (now_fn, perf))
            });

        Self { perf_api }
    }

    /// 現在時刻を取得する（ミリ秒）
    /// `Performance` APIが利用可能な場合はそれを使用し、そうでなければ`Date::now()`を使用
    fn now(&self) -> f64 {
        self.perf_api
            .as_ref()
            .and_then(|(now_fn, perf)| {
                now_fn
                    .call1(perf, &js_sys::Array::new())
                    .ok()
                    .and_then(|v| v.as_f64())
            })
            .unwrap_or_else(js_sys::Date::now)
    }
}

/// 配列の各要素に+1し、最後に合計数を返します。
///
/// 書籍『実践Rustプログラミング入門』 P422のサンプルコードを参照。
///
/// パフォーマンス参考値（releaseビルド）:
/// - n=10000, x=10000: 約0.06秒（2回目以降）
/// - n=100000, x=100000: 約4.8秒
/// - n=1000000, x=1000000: 約10分30秒
///
/// # Arguments
/// * `n` - 配列の要素数
/// * `x` - 処理を繰り返す回数
///
/// # Returns
/// 配列の各要素の合計値（n * x）
fn add_array(n: u64, x: u64) -> u64 {
    // 引数n個の要素を持った配列(正確にはベクタ)を作り各要素は0に初期化
    let mut a = vec![0u64; usize::try_from(n).unwrap_or(usize::MAX)];
    // 引数のx回、配列の全要素に+1していく
    for _ in 0..x {
        for item in a.iter_mut().take(usize::try_from(n).unwrap_or(usize::MAX)) {
            *item += 1;
        }
    }
    // 合計値を返す
    a.iter().sum()
}

/// ベンチマークエンドポイントのハンドラー
///
/// # パラメータ
/// * `n` - 配列の要素数（デフォルト: 10000）
/// * `x` - 処理を繰り返す回数（デフォルト: 10000）
/// * `iterations` - ベンチマークの実行回数（デフォルト: 10）
///
/// # 実行時間の計測について
/// **重要**: Cloudflare Workers環境では、セキュリティ上の理由によりI/O操作がないと
/// `Date::now()`が進まないため、実行時間は常に0として返されます。
///
/// # パフォーマンス参考値（ローカル環境、releaseビルド）
/// - n=10000, x=10000, iterations=10: 約0.6秒
/// - n=10000, x=10000, iterations=1: 約0.06秒（2回目以降）
pub fn handle(url: &Url) -> Result<Response> {
    let params = parse_query_params(url);
    let n = get_u64_param(&params, "n", 10000);
    let x = get_u64_param(&params, "x", 10000);
    let iterations = get_u64_param(&params, "iterations", 10);

    // 高精度タイマーを初期化
    let timer = PerformanceTimer::new();

    // ベンチマーク実行と計測
    let start = timer.now();
    let result = run_benchmark(n, x, iterations);
    let end = timer.now();

    let execution_time_ms = end - start;
    let benchmark_result = BenchmarkResult::new(n, x, iterations, execution_time_ms, result);
    json_response(&benchmark_result)
}

/// ベンチマークを実行する
fn run_benchmark(n: u64, x: u64, iterations: u64) -> u64 {
    let mut result = 0u64;
    for _ in 0..iterations {
        result = add_array(n, x);
    }
    result
}
