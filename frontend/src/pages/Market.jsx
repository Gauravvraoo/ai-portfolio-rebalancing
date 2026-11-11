import { useState } from "react";
import {
  ChartNoAxesCombined,
  Layers3,
  CalendarRange,
  Leaf,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useApi } from "../api";
import {
  Panel,
  State,
  PerformanceChart,
  colors,
  money,
  pct,
} from "../components/UI";
import {
  PageHeader,
  DataNotice,
  EmptyState,
  StatCard,
} from "../components/Design";
export default function Market() {
  const resource = useApi("market");
  const [hidden, setHidden] = useState([]),
    [category, setCategory] = useState("All assets");
  return (
    <>
      <PageHeader
        eyebrow="THE ASSET UNIVERSE"
        title="Market analysis"
        description="Explore the building blocks behind every portfolio decision."
      >
        <Link className="button secondary" to="/rebalance">
          Build an allocation <ArrowUpRight size={15} />
        </Link>
      </PageHeader>
      <DataNotice>
        Synthetic sample prices · No live quotes. ESG scores are illustrative
        assumptions, not vendor ratings.
      </DataNotice>
      <State resource={resource}>
        {(d) => {
          const assets = d.assets.filter(
            (a) => category === "All assets" || a.category === category,
          );
          const lines = assets
            .filter((a) => !hidden.includes(a.symbol))
            .map((a) => a.symbol);
          return (
            <>
              <div className="stats market-summary">
                <StatCard
                  label="Investable assets"
                  value={d.assets.length.toString().padStart(2, "0")}
                  detail="Equities, bonds, gold & cash"
                  icon={Layers3}
                />
                <StatCard
                  label="Monthly observations"
                  value={d.history.length}
                  detail={`${d.history[0].date} → ${d.history.at(-1).date}`}
                  icon={CalendarRange}
                  tone="purple"
                />
                <StatCard
                  label="Data provenance"
                  value="Synthetic"
                  detail="Reproducible educational fixture"
                  icon={ChartNoAxesCombined}
                  tone="teal"
                />
              </div>
              <Panel
                title="Relative asset performance"
                subtitle="Cumulative price return from the first sample close"
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
                        {a.symbol}
                        <span>{pct(a.period_return)}</span>
                      </button>
                    );
                  })}
                </div>
                {lines.length ? (
                  <PerformanceChart data={d.history} lines={lines} />
                ) : (
                  <EmptyState
                    title="Choose an asset to compare"
                    description="Enable a symbol above to restore its computed return series."
                  />
                )}
                <div className="chart-foot">
                  <span>
                    <i /> Monthly synthetic observations
                  </span>
                  <span>Returns exclude dividends, fees and taxes</span>
                </div>
              </Panel>
              <div className="section-heading">
                <div>
                  <div className="eyebrow">KNOW YOUR EXPOSURE</div>
                  <h2>Asset overview</h2>
                </div>
                <span className="chip">{assets.length} assets shown</span>
              </div>
              <div className="asset-grid">
                {assets.map((a) => {
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
                        <strong>{money(a.price)}</strong>
                        <span
                          className={
                            a.period_return >= 0 ? "positive" : "negative"
                          }
                        >
                          {pct(a.period_return)}
                        </span>
                        <small>Sample end price · full-period return</small>
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
                title="The complete sample universe"
                subtitle="Prices are synthetic. ESG values are simulated assumptions."
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
                        <th>Sample end price</th>
                        <th>Period return</th>
                        <th>Illustrative ESG</th>
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
                          <td>{money(a.price)}</td>
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
                  synthetic prices. Filters change visibility only; they do not
                  alter the data, portfolio holdings or calculation period. ESG
                  is a manually chosen assumption with no vendor provenance.
                </p>
              </details>
            </>
          );
        }}
      </State>
    </>
  );
}
