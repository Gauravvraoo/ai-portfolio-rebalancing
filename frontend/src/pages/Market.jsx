import {
  MarketPerformance,
  RiskComparison,
  CorrelationHeatmap,
} from "../components/MarketCharts";
import { useState } from "react";
import { Leaf, RefreshCw, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useApi } from "../api";
import { useDataSource, Provenance } from "../components/DataSource";
import { marketPath, sourceName } from "../lib/dataSource";
import { Panel, State, colors, pct } from "../components/UI";
import { PageHeader, DataNotice, EmptyState } from "../components/Design";
const marketPrice = (asset) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: asset.symbol === "CASH" ? 4 : 2,
  }).format(asset.price);

export default function Market() {
  const { source, range, cashYield, change } = useDataSource();
  const [refreshToken, setRefreshToken] = useState(0);
  const resource = useApi(
    marketPath(source, range, cashYield, refreshToken > 0) +
      `&refresh_token=${refreshToken}`,
    120000,
  );
  const [hidden, setHidden] = useState([]),
    [category, setCategory] = useState("All assets");
  return (
    <div className="market-workspace" aria-busy={resource.loading}>
      <PageHeader
        eyebrow="THE ASSET UNIVERSE"
        title="Market analysis"
        description="Explore the building blocks behind every portfolio decision."
      >
        <Link className="button secondary" to="/rebalance">
          Build an allocation <ArrowUpRight size={15} />
        </Link>
      </PageHeader>
      <DataNotice
        badge={source === "real" ? "HISTORICAL · NOT LIVE" : "SYNTHETIC DATA"}
      >
        {sourceName(source)} · Historical observations, not live quotes. ESG
        scores are illustrative assumptions, not verified vendor ratings.
      </DataNotice>
      <div className="market-toolbar">
        <div>
          <span className="eyebrow">MARKET RESEARCH</span>
          <p>Compare the same observation window across every asset.</p>
        </div>
        <div
          className="market-range"
          role="group"
          aria-label="Quick historical range"
        >
          {["1Y", "3Y", "5Y"].map((value) => (
            <button
              key={value}
              aria-pressed={range === value}
              disabled={source !== "real" || resource.loading}
              onClick={() => change({ range: value })}
            >
              {value}
            </button>
          ))}
        </div>
        <button
          className="button secondary"
          disabled={resource.loading}
          onClick={() => {
            setRefreshToken((v) => v + 1);
          }}
        >
          <RefreshCw
            size={16}
            className={resource.loading ? "market-refreshing" : ""}
          />
          {resource.loading ? "Loading market data…" : "Refresh market data"}
        </button>
      </div>
      {resource.loading && (
        <p role="status" className="muted">
          Preparing {sourceName(source)} · aligning observations and calculating
          returns. Provider requests can take a moment.
        </p>
      )}
      <State resource={resource}>
        {(d) => {
          if (!d.history?.length)
            return (
              <EmptyState
                title="No historical prices available"
                description="Refresh or choose another source. No synthetic fallback is used."
              />
            );
          const assets = d.assets.filter(
            (a) => category === "All assets" || a.category === category,
          );
          const lines = assets
            .filter((a) => !hidden.includes(a.symbol))
            .map((a) => a.symbol);
          return (
            <>
              <Provenance data={d.data} />
              <div className="section-heading">
                <div>
                  <div className="eyebrow">KNOW YOUR EXPOSURE</div>
                  <h2>Asset overview</h2>
                </div>
                <span className="chip">
                  {d.assets.length} assets · latest available
                </span>
              </div>
              <div className="asset-grid market-asset-grid">
                {d.assets
                  .slice()
                  .sort(
                    (a, b) =>
                      ["SPY", "QQQ", "AGG", "GLD", "CASH"].indexOf(a.symbol) -
                      ["SPY", "QQQ", "AGG", "GLD", "CASH"].indexOf(b.symbol),
                  )
                  .map((a) => {
                    const i = d.assets.indexOf(a);
                    return (
                      <Panel
                        key={a.symbol}
                        title={
                          <>
                            <span
                              className="asset-token"
                              style={{ "--asset-color": colors[i] }}
                            >
                              {a.symbol[0]}
                            </span>
                            {a.symbol}
                          </>
                        }
                        subtitle={a.name}
                      >
                        <div className="asset-card-value">
                          <strong>{marketPrice(a)}</strong>
                          <span
                            className={
                              a.period_return >= 0 ? "positive" : "negative"
                            }
                          >
                            {pct(a.period_return)}
                          </span>
                          <small>
                            {a.symbol === "CASH" && source === "real"
                              ? "Cash account value per initial $1"
                              : source === "real"
                                ? "Latest adjusted close"
                                : "Synthetic sample close"}{" "}
                            · full-period return
                          </small>
                          <small>As of {d.history.at(-1).date}</small>
                          {a.symbol === "CASH" && (
                            <small className="cash-assumption">
                              {source === "real"
                                ? `${(cashYield * 100).toFixed(1)}% assumed annual yield · not a market quote`
                                : "Synthetic account · zero interest"}
                            </small>
                          )}
                        </div>
                        <div className="asset-card-footer">
                          <span>{a.category}</span>
                          <span>
                            <Leaf size={12} />
                            {a.illustrative_esg}/100*
                          </span>
                        </div>
                      </Panel>
                    );
                  })}
              </div>
              <Panel
                title="Relative asset performance"
                className="market-performance"
                subtitle="Cumulative return (%) · starts at 0% on the first observation; CASH uses the stated assumption"
                action={
                  <label className="inline-field">
                    Universe
                    <select
                      aria-label="Asset category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        "All assets",
                        ...new Set(d.assets.map((a) => a.category)),
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                }
              >
                <div className="asset-filters">
                  {assets.map((a) => {
                    const i = d.assets.indexOf(a);
                    return (
                      <button
                        key={a.symbol}
                        aria-pressed={!hidden.includes(a.symbol)}
                        onClick={() =>
                          setHidden((h) =>
                            h.includes(a.symbol)
                              ? h.filter((s) => s !== a.symbol)
                              : [...h, a.symbol],
                          )
                        }
                        className={
                          hidden.includes(a.symbol) ? "muted-filter" : ""
                        }
                      >
                        <i style={{ background: colors[i] }} />
                        {a.symbol === "CASH" ? "CASH (assumed)" : a.symbol}
                        <span>{pct(a.period_return)}</span>
                      </button>
                    );
                  })}
                </div>
                {lines.length ? (
                  <MarketPerformance data={d.history} lines={lines} />
                ) : (
                  <EmptyState
                    title="Choose an asset to compare"
                    description="Enable a symbol above to restore its computed return series."
                  />
                )}
                <div className="chart-foot">
                  <span>
                    <i />{" "}
                    {source === "real"
                      ? "Aligned adjusted daily observations"
                      : "Monthly synthetic observations"}
                  </span>
                  <span>
                    {source === "real"
                      ? "Adjusted for splits/dividends; excludes fees/taxes"
                      : "Returns exclude dividends, fees and taxes"}
                  </span>
                </div>
              </Panel>
              <div className="market-analytics-grid">
                <Panel
                  title="Historical return & volatility"
                  subtitle="Full-period cumulative return versus annualized volatility (%); different horizons, not a risk-adjusted ranking."
                >
                  <RiskComparison assets={d.assets} />
                  <p className="muted">
                    Volatility uses{" "}
                    {source === "real" ? "252 daily" : "12 monthly"} periods per
                    year. CASH return reflects{" "}
                    {source === "real"
                      ? "assumed yield"
                      : "zero synthetic interest"}
                    .
                  </p>
                </Panel>
                {d.correlation && (
                  <Panel
                    title={
                      source === "real"
                        ? "Daily return correlations"
                        : "Monthly return correlations"
                    }
                    subtitle="Pearson correlation · common observed returns · −1 to +1"
                  >
                    <CorrelationHeatmap
                      assets={d.assets}
                      correlation={d.correlation}
                    />
                  </Panel>
                )}
              </div>
              <Panel
                title="Dataset details"
                subtitle={
                  source === "real"
                    ? "Adjusted historical prices. ESG values are illustrative assumptions."
                    : "Prices are synthetic. ESG values are simulated assumptions."
                }
              >
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Scrollable data table"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Category</th>
                        <th>Latest close / account</th>
                        <th>Period return</th>
                        <th>Illustrative ESG</th>
                        {<th>Annualized volatility</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((a, i) => (
                        <tr key={a.symbol}>
                          <td>
                            <div className="asset">
                              <span
                                className="asset-icon"
                                style={{
                                  color: colors[d.assets.indexOf(a)],
                                  background:
                                    colors[d.assets.indexOf(a)] + "14",
                                }}
                              >
                                {a.symbol[0]}
                              </span>
                              <div>
                                <strong>{a.symbol}</strong>
                                <small>{a.name}</small>
                              </div>
                            </div>
                          </td>
                          <td>{a.category}</td>
                          <td>{marketPrice(a)}</td>
                          <td
                            className={
                              a.period_return >= 0 ? "positive" : "negative"
                            }
                          >
                            {pct(a.period_return)}
                          </td>
                          <td>
                            <span className="esg-tag">
                              {a.illustrative_esg}/100 · illustrative
                            </span>
                          </td>
                          {<td>{a.annualized_volatility.toFixed(2)}%</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <details className="methodology">
                <summary>About this dataset</summary>
                <p>
                  {d.data_label}. Returns are calculated from the first and last
                  adjusted or synthetic prices according to the selected source.
                  Filters change visibility only; they do not alter the data,
                  portfolio holdings or calculation period. ESG is a manually
                  chosen assumption with no vendor provenance.
                </p>
              </details>
            </>
          );
        }}
      </State>
    </div>
  );
}
