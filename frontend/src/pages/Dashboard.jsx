import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Wallet,
  TrendingUp,
  Activity,
  ShieldCheck,
  Leaf,
  ArrowUpRight,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Clock3,
  ArrowDownRight,
  Download,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useApi, useLatestBacktest } from "../api";
import {
  Panel,
  State,
  PerformanceChart,
  Holdings,
  colors,
  money,
  pct,
} from "../components/UI";
import {
  DataNotice,
  PageHeader,
  StatCard,
  EmptyState,
  Loading,
  ErrorState,
} from "../components/Design";
import { sourceName } from "../lib/dataSource";
import { monthlySharpe, recentTrades } from "../lib/portfolio";
function RecentActivity() {
  const resource = useLatestBacktest();
  const [chosen, setChosen] = useState("");
  const result = resource.data?.result;
  const selected =
    result?.results.find((s) => s.id === chosen) ||
    result?.results.find((s) => s.id === "responsible") ||
    result?.results[0];
  const events = recentTrades(result, selected?.id);
  return (
    <Panel
      title="Recent simulated rebalancing"
      subtitle="Actual trade records from the latest completed backtest"
      action={
        result && (
          <Link
            className="text-link"
            to={`/comparison?run=${resource.data.id}`}
          >
            View run <ArrowUpRight size={14} />
          </Link>
        )
      }
    >
      {resource.loading ? (
        <Loading label="Loading simulated activity…" />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.retry} />
      ) : !result ? (
        <EmptyState
          icon={Clock3}
          title="Your research starts here"
          description="Complete a backtest to see actual simulated rebalance dates, allocations and execution costs."
          to="/comparison"
          action="Run your first backtest"
        />
      ) : (
        <>
          <div className="activity-context">
            <label>
              Strategy
              <select
                value={selected.id}
                onChange={(e) => setChosen(e.target.value)}
              >
                {result.results.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <span>
              Run {resource.data.id.slice(0, 8)} · {sourceName(result.data?.data_source)}
            </span>
          </div>
          {events.length ? (
            <div className="activity-list">
              {events.map((row) => (
                <div className="activity-item" key={row.date}>
                  <span className="activity-icon">
                    <ArrowLeftRight size={16} />
                  </span>
                  <div>
                    <strong>
                      {selected.name} <span>rebalanced</span>
                    </strong>
                    <small>
                      {row.date} · {(row.turnover * 100).toFixed(2)}% one-way
                      turnover
                    </small>
                    <details>
                      <summary>View allocation</summary>
                      <div className="weight-tags">
                        {result.symbols.map((s, i) => (
                          <span key={s}>
                            {s} {(row.target_weights[i] * 100).toFixed(1)}%
                          </span>
                        ))}
                      </div>
                    </details>
                  </div>
                  <div className="activity-cost">
                    <strong>${(row.fees + row.slippage).toFixed(2)}</strong>
                    <small>fees + slippage</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No rebalance events"
              description="The selected strategy has no executed trade records in this run."
            />
          )}
        </>
      )}
    </Panel>
  );
}
export default function Dashboard() {
  const resource = useApi("portfolio");
  const [window, setWindow] = useState("All"),
    [mode, setMode] = useState("value");
  return (
    <>
      <PageHeader
        eyebrow="PORTFOLIO INTELLIGENCE"
        title="Portfolio overview"
        description="A clearer view of your capital, risk, and investment decisions."
      >
        <Link className="button secondary" to="/reports">
          <Download size={15} /> View reports
        </Link>
        <Link className="button primary" to="/rebalance">
          <ArrowLeftRight size={15} /> Rebalance portfolio
        </Link>
      </PageHeader>
      <State resource={resource}>
        {(d) => {
          const sharpe = monthlySharpe(d.history);
          const count =
            window === "3M" ? 4 : window === "6M" ? 7 : d.history.length;
          const history = d.history
            .slice(-count)
            .map((r) => ({
              ...r,
              value:
                mode === "value"
                  ? r.value
                  : (r.value / d.initial_capital - 1) * 100,
            }));
          return (
            <>
              <div className="stats dashboard-kpis">
                <StatCard
                  label="Portfolio value"
                  value={money(d.value)}
                  detail={`${money(d.initial_capital)} starting capital`}
                  icon={Wallet}
                />
                <StatCard
                  label="Cumulative return"
                  value={pct(d.total_return)}
                  detail={`${money(d.profit)} simulated gain`}
                  icon={TrendingUp}
                  tone="teal"
                />
                <StatCard
                  label="Sharpe ratio"
                  value={sharpe == null ? "N/A" : sharpe.toFixed(2)}
                  detail="Monthly values · 0% risk-free"
                  icon={ChartNoAxesCombined}
                  tone="purple"
                />
                <StatCard
                  label="Annualized volatility"
                  value={`${d.annualized_volatility.toFixed(2)}%`}
                  detail="12 monthly returns"
                  icon={Activity}
                />
                <StatCard
                  label="Maximum drawdown"
                  value={`${d.max_drawdown.toFixed(2)}%`}
                  detail="Observed at monthly closes"
                  icon={ArrowDownRight}
                  tone="purple"
                />
                <StatCard
                  label="Illustrative ESG"
                  value={
                    <>
                      {d.esg_score.toFixed(1)}
                      <small>/100</small>
                    </>
                  }
                  detail="Current value-weighted score"
                  icon={Leaf}
                  tone="teal"
                />
              </div>
              <DataNotice>
                <strong>Baseline simulation</strong> · Monthly synthetic prices, Dec
                2023 – Dec 2024. Activity below comes from a separate, labeled daily
                backtest.
              </DataNotice>
              <div className="dashboard-grid">
                <Panel
                  className="performance-panel"
                  title="Portfolio performance"
                  subtitle="Balanced portfolio · buy & hold"
                  action={
                    <div className="segmented" aria-label="Performance period">
                      {["3M", "6M", "All"].map((w) => (
                        <button
                          key={w}
                          aria-pressed={window === w}
                          className={window === w ? "selected" : ""}
                          onClick={() => setWindow(w)}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  }
                >
                  <div className="chart-summary">
                    <div>
                      <small>ENDING PORTFOLIO VALUE</small>
                      <strong>{money(d.value)}</strong>
                    </div>
                    <span className="return-tag">
                      <TrendingUp size={14} />
                      {pct(d.total_return)}
                      <small>full period</small>
                    </span>
                    <div className="segmented chart-mode">
                      <button
                        aria-pressed={mode === "value"}
                        className={mode === "value" ? "selected" : ""}
                        onClick={() => setMode("value")}
                      >
                        Value
                      </button>
                      <button
                        aria-pressed={mode === "return"}
                        className={mode === "return" ? "selected" : ""}
                        onClick={() => setMode("return")}
                      >
                        Return
                      </button>
                    </div>
                  </div>
                  <PerformanceChart
                    data={history}
                    percentage={mode === "return"}
                  />
                  <div className="chart-foot">
                    <span>
                      <i /> Balanced portfolio
                    </span>
                    <span>
                      KPIs & returns remain full-period · {history[0].date} →{" "}
                      {d.end_date}
                    </span>
                  </div>
                </Panel>
                <Panel
                  title="Asset allocation"
                  subtitle="End-of-period portfolio weights"
                  action={
                    <span className="icon-tag">
                      <Leaf size={16} />
                    </span>
                  }
                >
                  <div
                    className="donut"
                    role="img"
                    aria-label="Asset allocation donut"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={d.holdings}
                          dataKey="value"
                          nameKey="symbol"
                          innerRadius={76}
                          outerRadius={98}
                          paddingAngle={4}
                          stroke="none"
                          isAnimationActive={false}
                        >
                          {d.holdings.map((a, i) => (
                            <Cell key={a.symbol} fill={colors[i]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                          }}
                          formatter={(v) => money(v)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                      <small>DIVERSIFIED ACROSS</small>
                      <strong>
                        5<span>assets</span>
                      </strong>
                      <span>Current allocation</span>
                    </div>
                  </div>
                  <div className="legend">
                    {d.holdings.map((a, i) => (
                      <div key={a.symbol}>
                        <span>
                          <i style={{ background: colors[i] }} />
                          <strong>{a.symbol}</strong>
                          <small>{a.category}</small>
                        </span>
                        <b>{(a.current_weight * 100).toFixed(1)}%</b>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
              <div className="dashboard-bottom">
                <RecentActivity />
                <Panel
                  title="Risk & responsibility"
                  subtitle="Transparent signals, with context"
                >
                  <div className="risk-indicators">
                    <div className="indicator-title">
                      <span className="icon-tag">
                        <ShieldCheck size={18} />
                      </span>
                      <div>
                        <strong>Portfolio risk</strong>
                        <small>Monthly sample observations</small>
                      </div>
                    </div>
                    <div className="indicator-value">
                      <span>Annualized volatility</span>
                      <strong>{d.annualized_volatility.toFixed(2)}%</strong>
                    </div>
                    <div className="indicator-value">
                      <span>Maximum drawdown</span>
                      <strong>{d.max_drawdown.toFixed(2)}%</strong>
                    </div>
                    <p>
                      Monthly sampling can miss intramonth losses. These figures
                      do not predict future risk.
                    </p>
                    <div className="indicator-title esg-heading">
                      <span className="icon-tag teal">
                        <Leaf size={18} />
                      </span>
                      <div>
                        <strong>Illustrative ESG score</strong>
                        <small>Simulated assumptions only</small>
                      </div>
                      <b>
                        {d.esg_score.toFixed(1)}
                        <small>/100</small>
                      </b>
                    </div>
                    <meter
                      aria-label="Illustrative ESG score"
                      min="0"
                      max="100"
                      value={d.esg_score}
                    />
                    <div className="meter-labels">
                      <span>0</span>
                      <span>Weighted by current holdings</span>
                      <span>100</span>
                    </div>
                    <p>
                      Not a vendor rating or evidence of real-world
                      sustainability impact.
                    </p>
                  </div>
                </Panel>
              </div>
              <Panel
                title="Your holdings"
                subtitle="Five assets, one transparent baseline. Sample prices in USD."
                action={
                  <Link className="text-link" to="/market">
                    Explore the market <ArrowUpRight size={14} />
                  </Link>
                }
              >
                <Holdings holdings={d.holdings} />
              </Panel>
              <details className="methodology">
                <summary>Data sources & calculation methodology</summary>
                <p>{d.methodology}</p>
                <p>
                  Sharpe is calculated from the API’s cent-rounded monthly
                  portfolio values as mean monthly return / sample monthly
                  return standard deviation × √12, using a zero risk-free rate.
                  It is N/A when undefined. Period controls change only the
                  chart window; KPI cards retain the complete baseline sample.
                  Rebalancing activity is independently sourced from the
                  indicated saved daily backtest.
                </p>
              </details>
            </>
          );
        }}
      </State>
    </>
  );
}
