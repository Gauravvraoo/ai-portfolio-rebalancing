import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader, WorkspaceSteps } from "../components/Design";
import { FlaskConical, Play, Download, RefreshCw } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
} from "recharts";
import { request } from "../api";
import { Panel, money } from "../components/UI";
import { useDataSource, Provenance } from "../components/DataSource";
import { compatibleExperiment, sourceName } from "../lib/dataSource";
import ResearchDatasetFields from "../components/ResearchDatasetFields";
const palette = [
  "#648cff",
  "#39c8bc",
  "#ad8cfa",
  "#f5bd72",
  "#ef91bc",
  "#76b9ed",
];
const tooltipStyle = {
  background: "#182337",
  border: "1px solid #34445e",
  borderRadius: 8,
};
const number = (v, d = 2) => (v == null ? "N/A" : Number(v).toFixed(d));
const metrics = [
  ["cumulative_return", "Cumulative return", "%"],
  ["annualized_return", "Annualized return", "%"],
  ["volatility", "Volatility", "%"],
  ["sharpe_ratio", "Sharpe", ""],
  ["sortino_ratio", "Sortino", ""],
  ["max_drawdown", "Max drawdown", "%"],
  ["calmar_ratio", "Calmar", ""],
  ["turnover", "Turnover", "×"],
  ["fees", "Fees", "$"],
  ["slippage", "Slippage", "$"],
  ["transaction_costs", "Total costs", "$"],
  ["weighted_esg", "Illustrative ESG", ""],
  ["final_value", "Final value", "$"],
];
function SeriesChart({ rows, strategies, field }) {
  return (
    <div
      className="backtest-chart"
      role="region"
      aria-label={
        field === "drawdown"
          ? "Strategy drawdowns"
          : "Strategy cumulative returns"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid stroke="#25343e" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#a1afc4"
            minTickGap={35}
            tickFormatter={(s) => s.slice(5)}
          />
          <YAxis
            stroke="#a1afc4"
            width={60}
            tickFormatter={(v) => `${number(v, 1)}%`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => `${number(v)}%`}
          />
          <Legend />
          {strategies.map((s) => (
            <Line
              key={s.id}
              dataKey={`${s.id}_${field}`}
              name={s.name}
              stroke={palette[s.color]}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
          <Brush
            dataKey="date"
            height={22}
            stroke="#647da8"
            fill="#111c30"
            tickFormatter={(s) => s.slice(5)}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export default function Backtesting({ baseline }) {
  const { source, range, cashYield } = useDataSource();
  const [search] = useSearchParams();
  const [tab, setTab] = useState("advanced"),
    [options, setOptions] = useState(null),
    [jobs, setJobs] = useState([]),
    [id, setId] = useState(() => search.get("run") || ""),
    [job, setJob] = useState(null),
    [error, setError] = useState(""),
    [metaError, setMetaError] = useState(""),
    [pollError, setPollError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(""),
    [refresh, setRefresh] = useState(0),
    [hidden, setHidden] = useState([]),
    [allocation, setAllocation] = useState("buy_hold");
  const [config, setConfig] = useState({
    experiment_id: "",
    initial_capital: 100000,
    rebalance_frequency: "weekly",
    fee_bps: 10,
    slippage_bps: 5,
    min_esg: 65,
    apply_esg_to_all: false,
    cash_annual_return: 0.02,
    risk_free_rate: 0,
    lookback: 60,
    risk_aversion: 5,
    start_date: "",
    end_date: "",
  });
  useEffect(() => {
    setConfig(c => ({ ...c, experiment_id: "", start_date: "", end_date: "", cash_annual_return: cashYield }));
  }, [source, range, cashYield]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.all([
      request("backtests/options", { signal: controller.signal }),
      request("backtests", { signal: controller.signal }),
    ])
      .then(([o, j]) => {
        if (active) {
          setOptions(o);
          setJobs(j);
          setId((old) => old || j[0]?.id || "");
          setMetaError("");
        }
      })
      .catch((e) => {
        if (active) setMetaError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let active = true,
      timer;
    setJob(null);
    setPollError("");
    setHidden([]);
    async function poll() {
      try {
        const next = await request(`backtests/${id}`, {
          signal: controller.signal,
        });
        if (!active) return;
        setJob(next);
        setJobs((js) => js.map((j) => (j.id === id ? next : j)));
        setPollError("");
        if (["queued", "running"].includes(next.status))
          timer = setTimeout(poll, 1500);
      } catch (e) {
        if (active) {
          setPollError(e.message);
          timer = setTimeout(poll, 3000);
        }
      }
    }
    poll();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, refresh]);
  useEffect(() => {
    const run = search.get("run");
    if (run) {
      setId(run);
      setTab("advanced");
    }
  }, [search]);
  const hasActiveJobs = jobs.some((j) => ["queued", "running"].includes(j.status));
  useEffect(() => {
    if (!hasActiveJobs) return;
    const controller = new AbortController();
    let stopped = false, timer;
    async function refreshJobs() {
      try {
        const list = await request("backtests", { signal: controller.signal });
        if (!stopped) setJobs(list);
      } catch {
        // Selected-run polling surfaces connection errors; keep retrying the
        // list so viewing an older result cannot freeze another run's status.
      } finally {
        if (!stopped) timer = setTimeout(refreshJobs, 1500);
      }
    }
    timer = setTimeout(refreshJobs, 1500);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [hasActiveJobs]);
  function change(k, v) {
    setConfig((c) => ({ ...c, [k]: v }));
    setError("");
  }
  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...config,
        data_source: source,
        data_range: range,
        experiment_id: config.experiment_id || null,
        start_date: config.start_date || null,
        end_date: config.end_date || null,
      };
      const next = await request("backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeoutMs: 120000,
      });
      setJobs((j) => [next, ...j]);
      setId(next.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function download(format, kind = "summary") {
    setExporting(format + kind);
    setError("");
    try {
      const response = await fetch(
        `/api/backtests/${job.id}/export?format=${format}&kind=${kind}`,
      );
      if (!response.ok)
        throw Error(`Export failed (${response.status}). Please retry.`);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `backtest-${job.id}${format === "csv" ? "-" + kind : ""}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting("");
    }
  }
  const result = job?.result;
  const series = (result?.results || []).map((s, i) => ({ ...s, color: i }));
  const visible = series.filter((s) => !hidden.includes(s.id));
  const rows = result
    ? result.results[0].history.map((r, i) =>
        Object.assign(
          { date: r.date },
          ...series.map((s) => ({
            [`${s.id}_cumulative_return`]: s.history[i].cumulative_return,
            [`${s.id}_drawdown`]: s.history[i].drawdown,
          })),
        ),
      )
    : [];
  const selectedAllocation =
    series.find((s) => s.id === allocation) || series[0];
  const allocationRows = selectedAllocation?.history.map((r) => ({
    date: r.date,
    ...Object.fromEntries(
      result.symbols.map((s, i) => [s, r.weights[i] * 100]),
    ),
  }));
  const running = hasActiveJobs;
  return (
    <>
      <div className="backtest-tabs">
        <button
          className={tab === "advanced" ? "primary" : ""}
          onClick={() => setTab("advanced")}
        >
          Advanced backtesting
        </button>
        <button
          className={tab === "baseline" ? "primary" : ""}
          onClick={() => setTab("baseline")}
        >
          Phase 1 baseline comparison
        </button>
      </div>
      {tab === "baseline" ? (
        baseline
      ) : (
        <>
          <PageHeader
            eyebrow="STRATEGY RESEARCH"
            title="Strategy comparison"
            description="Six perspectives. One fair test. Find the trade-offs behind the returns."
          />
          <WorkspaceSteps
            items={[
              ["Configure", "Choose a model and common execution settings"],
              ["Replay", "Run all strategies on the same held-out period"],
              ["Compare", "Explore calculated metrics and export the evidence"],
            ]}
          />
          <div className="notice">
            <FlaskConical size={17} />
            <span>
              New run source: {sourceName(source)}. Select a compatible trained experiment to include both PPO policies. All strategies replay its exact immutable dataset and held-out period, not refreshed quotes. ESG scores are illustrative, not verified ratings.
            </span>
          </div>
          {job?.data && <Provenance data={job.data} />}
          {(error || metaError || pollError) && (
            <div className="notice negative" role="alert">
              {error || metaError || pollError}
              <button onClick={() => setRefresh((n) => n + 1)}>
                Retry loading
              </button>
            </div>
          )}
          {loading ? (
            <div className="panel state" role="status">
              Loading backtesting workspace…
            </div>
          ) : (
            <>
              <Panel
                title="Backtest configuration"
                subtitle="Settings for a new run; saved results retain their own settings below"
                action={
                  <button
                    onClick={() => setRefresh((n) => n + 1)}
                    aria-label="Refresh experiments"
                  >
                    <RefreshCw size={15} />
                  </button>
                }
              >
                <form onSubmit={run} className="backtest-form">
                  <ResearchDatasetFields purpose="Backtest" />
                  <label className="config-field model-field">
                    PPO experiment
                    <select
                      value={config.experiment_id}
                      onChange={(e) => change("experiment_id", e.target.value)}
                    >
                      <option value="">
                        Benchmarks only · no trained models required
                      </option>
                      {options?.experiments.filter(e => compatibleExperiment(e, source, range)).map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.id.slice(0, 8)} · {e.data?.provider || "Repository fixture"} · {sourceName(e.data?.data_source)} · {e.mode} · seed {e.config.seed}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!options?.experiments.some(e => compatibleExperiment(e, source, range)) && (
                    <p className="training-note muted">
                      No compatible trained agents for this source/range.{" "}
                      <Link className="text-link" to="/training">
                        Train both agents in the AI lab
                      </Link>{" "}
                      or run the four benchmarks.
                    </p>
                  )}
                  <div className="backtest-fields">
                    {[
                      [
                        "initial_capital",
                        "Initial capital (USD)",
                        100,
                        1e9,
                        100,
                      ],
                      ["fee_bps", "Transaction fee (bps)", 0, 100, 1],
                      ["slippage_bps", "Slippage (bps)", 0, 100, 1],
                      ["min_esg", "ESG threshold", 0, 100, 0.1],
                    ].map(([key, label, min, max, step]) => (
                      <label className="config-field" key={key}>
                        {label}
                        <input
                          type="number"
                          required
                          value={config[key]}
                          min={min}
                          max={max}
                          step={step}
                          onChange={(e) => change(key, Number(e.target.value))}
                        />
                      </label>
                    ))}
                    <label className="config-field">
                      Rebalance frequency
                      <select
                        value={config.rebalance_frequency}
                        onChange={(e) =>
                          change("rebalance_frequency", e.target.value)
                        }
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">
                          Weekly · first observed close
                        </option>
                        <option value="monthly">
                          Monthly · first observed close
                        </option>
                      </select>
                    </label>
                  </div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={config.apply_esg_to_all}
                      onChange={(e) =>
                        change("apply_esg_to_all", e.target.checked)
                      }
                    />
                    Apply ESG execution overlay to all strategies
                  </label>
                  <details className="methodology">
                    <summary>
                      Period, estimation window and economic assumptions
                    </summary>
                    <div className="backtest-fields">
                      {[
                        ["start_date", "Start decision close"],
                        ["end_date", "End close"],
                      ].map(([key, label]) => (
                        <label className="config-field" key={key}>
                          {label}
                          <input
                            type="date"
                            value={config[key]}
                            onChange={(e) => change(key, e.target.value)}
                          />
                        </label>
                      ))}
                      {[
                        ["lookback", "Rolling lookback (returns)", 20, 120, 1],
                        ["risk_aversion", "MVO risk aversion", 0.1, 100, 0.1],
                        [
                          "cash_annual_return",
                          "Annual cash yield (fraction)",
                          0,
                          0.2,
                          0.001,
                        ],
                        [
                          "risk_free_rate",
                          "Risk-free rate (fraction)",
                          0,
                          0.2,
                          0.001,
                        ],
                      ].map(([key, label, min, max, step]) => (
                        <label className="config-field" key={key}>
                          {label}
                          <input
                            type="number"
                            required
                            value={config[key]}
                            min={min}
                            max={max}
                            step={step}
                            onChange={(e) =>
                              change(key, Number(e.target.value))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <p>
                      Dates must be actual observed closes inside the untouched
                      test interval. Leave blank for its full length. PPO models
                      are not retrained when inference settings change.
                    </p>
                  </details>
                  <div className="backtest-actions">
                    <button
                      className="primary"
                      type="submit"
                      disabled={
                        busy || running || Boolean(metaError) || !options
                      }
                    >
                      <Play size={15} />
                      {busy
                        ? "Submitting…"
                        : running
                          ? "Backtest running…"
                          : "Run backtest"}
                    </button>
                    <span className="muted training-note">
                      Buy & hold trades once. Other strategies share the
                      selected calendar schedule.
                    </span>
                  </div>
                </form>
              </Panel>
              <Panel
                title="Saved backtests"
                subtitle="Computed results and settings persist across page reloads"
              >
                <div className="training-body">
                  {jobs.length === 0 ? (
                    <div className="empty backtest-empty">
                      <h3>No backtests yet</h3>
                      <p>
                        Run the benchmarks or select trained PPO models to
                        generate a comparison.
                      </p>
                    </div>
                  ) : (
                    <>
                      <label className="config-field">
                        Backtest run
                        <select
                          value={id}
                          onChange={(e) => setId(e.target.value)}
                        >
                          {jobs.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.id.slice(0, 8)} · {j.status} ·{" "}
                              {j.config.rebalance_frequency}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!job ? (
                        <p role="status">Loading backtest…</p>
                      ) : (
                        <>
                          <div className="job-status" role="status">
                            <span className="chip">
                              {job.status.toUpperCase()}
                            </span>
                            <code className="job-id">{job.id}</code>
                          </div>
                          {["queued", "running"].includes(job.status) && (
                            <p className="muted" role="status">
                              Replaying strategies in a separate CPU process…
                            </p>
                          )}
                          {job.error && (
                            <p className="negative" role="alert">
                              {job.error}
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </Panel>
              {result && (
                <>
                  <div className="notice">
                    <span>
                      <strong>Saved run settings:</strong>{" "}
                      {result.period.start_close} → {result.period.end_close} ·{" "}
                      {result.period.returns} returns ·{" "}
                      {money(result.config.initial_capital)} initial cash ·{" "}
                      {result.config.fee_bps} bps fees +{" "}
                      {result.config.slippage_bps} bps slippage ·{" "}
                      {result.config.rebalance_frequency}. ESG{" "}
                      {result.config.min_esg}:{" "}
                      {result.config.apply_esg_to_all
                        ? "all trade targets"
                        : "Responsible PPO trade targets only"}
                      .{" "}
                      {result.results.length === 4
                        ? "Four benchmarks; PPO was not included."
                        : "Six strategies including saved PPO models."}
                    </span>
                  </div>
                  <div className="backtest-exports">
                    {[
                      ["json", "summary", "Export JSON"],
                      ["csv", "summary", "Export metrics CSV"],
                      ["csv", "history", "Export history CSV"],
                    ].map(([format, kind, label]) => (
                      <button
                        key={label}
                        disabled={Boolean(exporting)}
                        onClick={() => download(format, kind)}
                      >
                        <Download size={14} />
                        {exporting === format + kind ? "Preparing…" : label}
                      </button>
                    ))}
                  </div>
                  <Panel
                    title="Computed strategy metrics"
                    subtitle="Percentage metrics use 252 periods/year; undefined ratios are N/A"
                  >
                    <div
                      className="table-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="Scrollable data table"
                    >
                      <table className="backtest-table">
                        <thead>
                          <tr>
                            <th>Strategy</th>
                            {metrics.map(([key, label]) => (
                              <th key={key}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {series.map((s) => (
                            <tr key={s.id}>
                              <td>
                                <strong style={{ color: palette[s.color] }}>
                                  {s.name}
                                </strong>
                                <small className="strategy-policy">
                                  {s.esg_constrained
                                    ? "ESG constrained at trades"
                                    : "No ESG floor"}{" "}
                                  · {s.rebalances} trades
                                </small>
                              </td>
                              {metrics.map(([key, , unit]) => (
                                <td key={key}>
                                  {unit === "$"
                                    ? money(s.metrics[key])
                                    : `${number(s.metrics[key])}${s.metrics[key] == null ? "" : unit}`}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <div
                    className="strategy-toggles"
                    aria-label="Visible strategies"
                  >
                    {series.map((s) => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          checked={!hidden.includes(s.id)}
                          onChange={() =>
                            setHidden((h) =>
                              h.includes(s.id)
                                ? h.filter((x) => x !== s.id)
                                : [...h, s.id],
                            )
                          }
                        />
                        <i style={{ background: palette[s.color] }} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                  {!visible.length ? (
                    <div className="panel state">
                      Select at least one strategy to display comparison charts.
                    </div>
                  ) : (
                    <>
                      <Panel
                        title="Cumulative return comparison"
                        subtitle="Net of fees and slippage · drag the lower range selector to zoom"
                      >
                        <SeriesChart
                          rows={rows}
                          strategies={visible}
                          field="cumulative_return"
                        />
                      </Panel>
                      <Panel
                        title="Drawdown comparison"
                        subtitle="Percentage below each strategy’s running peak, including initial capital"
                      >
                        <SeriesChart
                          rows={rows}
                          strategies={visible}
                          field="drawdown"
                        />
                      </Panel>
                      <Panel
                        title="Risk–return comparison"
                        subtitle="Annualized return versus annualized sample volatility; short-period extrapolation"
                      >
                        <div
                          className="backtest-chart"
                          role="region"
                          aria-label="Risk return scatterplot"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart>
                              <CartesianGrid stroke="#25343e" />
                              <XAxis
                                type="number"
                                dataKey="x"
                                name="Annualized volatility"
                                unit="%"
                                stroke="#a1afc4"
                                domain={["auto", "auto"]}
                              />
                              <YAxis
                                type="number"
                                dataKey="y"
                                name="Annualized return"
                                unit="%"
                                stroke="#a1afc4"
                                domain={["auto", "auto"]}
                              />
                              <Tooltip
                                contentStyle={tooltipStyle}
                                cursor={{ strokeDasharray: "3 3" }}
                                formatter={(v) => number(v) + "%"}
                              />
                              <Legend />
                              {visible.map((s) => (
                                <Scatter
                                  key={s.id}
                                  name={s.name}
                                  fill={palette[s.color]}
                                  data={[
                                    {
                                      x: s.metrics.volatility,
                                      y: s.metrics.annualized_return,
                                    },
                                  ]}
                                  isAnimationActive={false}
                                />
                              ))}
                            </ScatterChart>
                          </ResponsiveContainer>
                        </div>
                      </Panel>
                    </>
                  )}
                  <Panel
                    title="Asset allocation history"
                    subtitle="End-of-day weights include market drift; initial observation is all cash"
                    action={
                      <select
                        aria-label="Allocation strategy"
                        value={selectedAllocation.id}
                        onChange={(e) => setAllocation(e.target.value)}
                      >
                        {series.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    }
                  >
                    <div
                      className="backtest-chart"
                      role="region"
                      aria-label="Asset allocation history"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={allocationRows}>
                          <CartesianGrid stroke="#25343e" vertical={false} />
                          <XAxis
                            dataKey="date"
                            stroke="#a1afc4"
                            minTickGap={35}
                            tickFormatter={(s) => s.slice(5)}
                          />
                          <YAxis
                            domain={[0, 100]}
                            allowDataOverflow
                            ticks={[0, 25, 50, 75, 100]}
                            stroke="#a1afc4"
                            tickFormatter={(v) => number(v, 0) + "%"}
                          />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(v) => number(v) + "%"}
                          />
                          <Legend />
                          {result.symbols.map((s, i) => (
                            <Area
                              key={s}
                              type="stepAfter"
                              dataKey={s}
                              stackId="weights"
                              fill={palette[i]}
                              stroke={palette[i]}
                              fillOpacity={0.65}
                              isAnimationActive={false}
                            />
                          ))}
                          <Brush
                            dataKey="date"
                            height={22}
                            stroke="#647da8"
                            fill="#111c30"
                            tickFormatter={(s) => s.slice(5)}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                  <details className="methodology">
                    <summary>
                      Execution, strategy definitions and metric conventions
                    </summary>
                    <p>{result.methodology}</p>
                    <p>
                      Buy & hold starts at SPY 35%, AGG 25%, GLD 15%, QQQ 20%,
                      CASH 5% before constraint projection. Equal weight starts
                      at 20% each and rebalances. Momentum ranks trailing
                      compounded returns and allocates to the top two assets,
                      including cash as a candidate. Rolling mean–variance
                      maximizes trailing annualized mean minus half the
                      risk-aversion coefficient times annualized portfolio
                      variance, with covariance shrinkage and long-only bounds.
                      Sharpe uses daily excess arithmetic mean over sample
                      volatility. Sortino uses the square root of mean squared
                      negative excess daily returns. Calmar uses geometric
                      annual return divided by drawdown magnitude. Weighted ESG
                      is the average of daily end-holding weighted scores,
                      excluding the initial cash state. The new form describes
                      the next run; the settings above describe these saved
                      results.
                    </p>
                  </details>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
