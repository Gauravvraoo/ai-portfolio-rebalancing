import { createContext, useContext, useState } from 'react';
import { sourceName } from '../lib/dataSource';
const Context = createContext(null);
export function DataSourceProvider({ children }) {
  const [selection, setSelection] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('verdant-data-source'));
      if (['synthetic', 'real'].includes(stored?.source) && ['1Y', '3Y', '5Y'].includes(stored?.range))
        return { source: stored.source, range: stored.range, cashYield: Number.isFinite(stored.cashYield) && stored.cashYield >= 0 && stored.cashYield <= 0.2 ? stored.cashYield : 0.02 };
    } catch { /* storage unavailable or invalid */ }
    return { source: 'synthetic', range: '3Y', cashYield: 0.02 };
  });
  function change(next) {
    setSelection(current => {
      const value = { ...current, ...next };
      try { localStorage.setItem('verdant-data-source', JSON.stringify(value)); } catch { /* optional persistence */ }
      return value;
    });
  }
  return <Context.Provider value={{ ...selection, change }}>{children}</Context.Provider>;
}
export const useDataSource = () => useContext(Context);
export function DataSourceControls() {
  const { source, range, cashYield, change } = useDataSource();
  return <section className="panel source-controls" aria-label="Research data selection">
    <div className="config-fields">
      <label className="config-field">Data source<select aria-label="Data source" value={source} onChange={e => change({ source: e.target.value })}>
        <option value="synthetic">Synthetic Demo</option><option value="real">Real Historical Market Data</option>
      </select></label>
      <label className="config-field">Historical date range<select aria-label="Historical date range" disabled={source !== 'real'} value={range} onChange={e => change({ range: e.target.value })}>
        {['1Y','3Y','5Y'].map(r => <option key={r}>{r}</option>)}
      </select></label>
      <label className="config-field">Market cash annual yield (%)<input aria-label="Market cash annual yield (%)" type="number" min="0" max="20" step="0.1" value={Number((cashYield * 100).toFixed(4))} onChange={e => {
        const value = Number(e.target.value) / 100;
        if (Number.isFinite(value) && value >= 0 && value <= 0.2) change({ cashYield: value });
      }} /></label>
    </div>
    <p className="muted" role="status">Active source: <strong>{sourceName(source)}</strong>. Applies to Market Analysis and new research jobs. Baseline dashboard/allocation studio remain the labeled synthetic monthly demo. CASH is an assumed-yield account; ETF history is not live streaming. ESG scores remain illustrative.</p>
  </section>;
}
export function Provenance({ data }) {
  if (!data) return null;
  return <div className="notice"><span>
    <strong>{sourceName(data.data_source)}</strong> · {data.provider || 'Repository fixture'}
    {' · '}{data.start_date} → {data.end_date}
    {data.last_trading_date && <> · Last available trading date: {data.last_trading_date}</>}
    {data.fetched_at && <> · Retrieved: {data.fetched_at}</>}
    {data.cache_hit !== undefined && <> · {data.cache_hit ? 'Cached response (up to 6 hours; refresh requests coalesce for 60 seconds)' : 'Fetched provider response'}</>}
    {' · '}{data.price_adjustment || 'Synthetic prices'}
    {data.data_source === 'real' && <> · Historical daily data, not live or real-time streaming. CASH yield is an assumption.</>}
    {' · '}ESG scores are illustrative, not verified ratings.
  </span></div>;
}
