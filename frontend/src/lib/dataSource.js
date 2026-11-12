export const sourceName = (source) => source === 'real' ? 'Real Historical Market Data' : 'Synthetic Demo';
export const artifactSource = (artifact) => artifact?.data?.data_source || artifact?.config?.data_source || 'synthetic';
export function compatibleExperiment(experiment, source, range) {
  return artifactSource(experiment) === source && (source !== 'real' || experiment.data?.data_range === range);
}
export function marketPath(source, range, cashYield, refresh = false) {
  return `market?${new URLSearchParams({ data_source: source, data_range: range, cash_annual_return: cashYield, refresh })}`;
}
