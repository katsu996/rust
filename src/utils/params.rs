use std::collections::HashMap;
use worker::Url;

/// URLからクエリパラメータを取得する
pub fn parse_query_params(url: &Url) -> HashMap<String, String> {
    url.query_pairs()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// パラメータからf64の値を取得する（デフォルト値付き）
pub fn get_f64_param(params: &HashMap<String, String>, key: &str, default: f64) -> f64 {
    params
        .get(key)
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(default)
}
