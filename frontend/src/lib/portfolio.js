/** Zero-risk-free Sharpe calculated from the API's cent-rounded monthly observations. */
export function monthlySharpe(history) {
  if (
    !history ||
    history.length < 3 ||
    history.some((p) => !Number.isFinite(p.value) || p.value <= 0)
  )
    return null;
  const returns = history
    .slice(1)
    .map((p, i) => p.value / history[i].value - 1);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return variance > 1e-20 ? (mean / Math.sqrt(variance)) * Math.sqrt(12) : null;
}
export function recentTrades(result, strategyId, limit = 5) {
  const strategy = result?.results?.find((s) => s.id === strategyId);
  return strategy
    ? strategy.history
        .filter((row) => row.rebalance)
        .slice(-limit)
        .reverse()
    : [];
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadApi(path, filename) {
  const response = await fetch(`/api/${path}`);
  if (!response.ok)
    throw Error(`Download failed (${response.status}). Please retry.`);
  downloadBlob(await response.blob(), filename);
}
