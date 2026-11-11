import { useEffect, useState } from "react";
import { BrainCircuit, Play, RefreshCw } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { request } from "../api";
import { Panel, PerformanceChart, money, pct } from "../components/UI";
const symbols = ["SPY", "AGG", "GLD", "QQQ", "CASH"];
const names = { profit: "Profit PPO", responsible: "Responsible PPO" };
const active = new Set(["queued", "running", "evaluating"]);
function Curve({ rows, validation = false }) {
  return (
    <div
      className="chart"
      aria-label={
        validation
          ? "Validation return by training step"
          : "Mean rollout reward by training step"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid stroke="#24303a" vertical={false} />
          <XAxis dataKey="steps" stroke="#768594" />
          <YAxis
            stroke="#768594"
            width={70}
            tickFormatter={(n) => Number(n).toFixed(3)}
          />
          <Tooltip
            contentStyle={{
              background: "#17212b",
              border: "1px solid #34404b",
            }}
            formatter={(n) => Number(n).toFixed(5)}
          />
          <Legend />
          <Line
            name={validation ? "Validation return (%)" : "Mean training reward"}
            dataKey={validation ? "validation_return" : "mean_training_reward"}
            stroke="#a5e87c"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export default function Training() {
  const [jobs, setJobs] = useState([]),
    [id, setId] = useState(""),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [pollError, setPollError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [config, setConfig] = useState({
    mode: "quick",
    seed: 7,
    fee_bps: 10,
    slippage_bps: 5,
    cash_annual_return: 0.02,
    min_esg: 65,
    risk_penalty: 0.5,
    drawdown_penalty: 0.1,
    cost_penalty: 1,
    esg_penalty: 0.5,
    min_weights: [0, 0, 0, 0, 0.02],
    max_weights: [0.6, 0.6, 0.6, 0.6, 0.6],
  });
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    async function poll() {
      try {
        const [list, description] = await Promise.all([
          request("training/jobs", { signal: controller.signal }),
          request("training/data", { signal: controller.signal }),
        ]);
        if (!stopped) {
          setJobs(list);
          setData(description);
          setPollError("");
          setLoading(false);
        }
      } catch (e) {
        if (!stopped) {
          setPollError(e.message);
          setLoading(false);
        }
      }
    }
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  const selected = jobs.find((j) => j.id === id) || jobs[0];
  const running = jobs.some((j) => active.has(j.status));
  const stale = Boolean(pollError);
  function change(key, value) {
    setError("");
    setConfig((c) => ({ ...c, [key]: value }));
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      const job = await request("training/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setJobs((j) => [job, ...j]);
      setId(job.id);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function evaluate() {
    setBusy(true);
    setError("");
    try {
      const job = await request(`training/jobs/${selected.id}/evaluate`, {
        method: "POST",
      });
      setJobs((j) => j.map((x) => (x.id === job.id ? job : x)));
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">REINFORCEMENT LEARNING LAB</div>
        <h1>AI agent training</h1>
        <p>
          Train two independent PPO policies. Evaluate saved models on a
          chronological held-out split.
        </p>
      </div>
      <div className="notice">
        <BrainCircuit size={18} />
        <span>
          Real Gymnasium + Stable-Baselines3 PPO, using seeded synthetic daily
          prices. ESG scores and cash yield are simulated assumptions. Quick
          mode verifies the pipeline; it does not establish investment
          performance.
        </span>
      </div>
      {(error || pollError) && (
        <div className="notice negative" role="alert">
          {error || pollError}
          <button onClick={() => setRefresh((v) => v + 1)}>Retry status</button>
        </div>
      )}
      <div className="training-grid">
        <Panel
          title="Experiment configuration"
          subtitle="One CPU thread · both agents train in a separate process"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <label className="config-field">
              Training mode
              <select
                value={config.mode}
                onChange={(e) => change("mode", e.target.value)}
              >
                <option value="quick">Quick · 512 steps per agent</option>
                <option value="standard">
                  Standard · 8,192 steps per agent
                </option>
              </select>
            </label>
            <div className="config-fields">
              {[
                ["seed", "Random seed", 0, 1000000, 1],
                ["min_esg", "Responsible ESG floor", 0, 100, 0.1],
                ["fee_bps", "Fee (basis points)", 0, 100, 1],
                ["slippage_bps", "Slippage (basis points)", 0, 100, 1],
                [
                  "cash_annual_return",
                  "Annual cash yield (fraction)",
                  0,
                  0.2,
                  0.001,
                ],
                ["risk_penalty", "Volatility penalty", 0, 10, 0.1],
                ["drawdown_penalty", "Drawdown penalty", 0, 10, 0.1],
                ["cost_penalty", "Extra cost penalty", 0, 10, 0.1],
                ["esg_penalty", "ESG proposal penalty", 0, 10, 0.1],
              ].map(([key, label, min, max, step]) => (
                <label className="config-field" key={key}>
                  {label}
                  <input
                    type="number"
                    required
                    min={min}
                    max={max}
                    step={step}
                    value={config[key]}
                    onChange={(e) => change(key, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <details className="methodology">
              <summary>Allocation bounds (%), shared by both agents</summary>
              {symbols.map((s, i) => (
                <div className="bounds-row" key={s}>
                  <span>{s}</span>
                  {["min_weights", "max_weights"].map((key) => (
                    <label key={key}>
                      {key === "min_weights" ? "Min" : "Max"}
                      <input
                        type="number"
                        aria-label={`${s} ${key === "min_weights" ? "minimum" : "maximum"} weight`}
                        min="0"
                        max="100"
                        step="1"
                        required
                        value={Math.round(config[key][i] * 100)}
                        onChange={(e) =>
                          change(
                            key,
                            config[key].map((x, j) =>
                              j === i ? Number(e.target.value) / 100 : x,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
            </details>
            <button
              type="submit"
              className="primary full"
              disabled={busy || running || loading || stale}
            >
              <Play size={15} />
              {busy
                ? "Submitting…"
                : running
                  ? "Experiment in progress"
                  : "Train both PPO agents"}
            </button>
            <p className="muted training-note">
              The profit agent shares the risk/cost settings, without an ESG
              floor or ESG penalty. The responsible agent additionally enforces
              the floor at every rebalance. Infeasible settings are rejected
              before a job starts.
            </p>
          </form>
        </Panel>
        <div className="training-results">
          <Panel
            title="Training status"
            subtitle="Persisted experiments · automatically refreshed every 2 seconds"
            action={
              <button
                aria-label="Refresh training status"
                onClick={() => setRefresh((v) => v + 1)}
              >
                <RefreshCw size={14} />
              </button>
            }
          >
            <div className="training-body">
              {loading ? (
                <p role="status">Loading experiments…</p>
              ) : jobs.length === 0 ? (
                <p className="muted">
                  No experiments yet. Train both agents to generate actual
                  models and metrics.
                </p>
              ) : (
                <>
                  <label className="config-field">
                    Experiment
                    <select
                      value={selected.id}
                      onChange={(e) => setId(e.target.value)}
                    >
                      {jobs.map((j) => (
                        <option value={j.id} key={j.id}>
                          {new Date(j.created_at).toLocaleString()} · {j.status}{" "}
                          · {j.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="job-status" role="status">
                    <span className="chip">
                      {selected.status.toUpperCase()}
                    </span>
                    <span>
                      {selected.active_agent
                        ? names[selected.active_agent]
                        : selected.config.mode + " mode"}
                    </span>
                  </div>
                  <code className="job-id">{selected.id}</code>
                  {selected.error && (
                    <p className="negative" role="alert">
                      {selected.error}
                    </p>
                  )}
                  {Object.entries(selected.agents).map(([agent, state]) => (
                    <div key={agent} className="agent-progress">
                      <div>
                        <strong>{names[agent]}</strong>
                        <span>
                          {state.steps} / {selected.timesteps_per_agent} steps ·{" "}
                          {state.status}
                        </span>
                      </div>
                      <progress
                        value={state.steps}
                        max={selected.timesteps_per_agent}
                      />
                      {state.selected_at_step && (
                        <small>
                          Validation-selected checkpoint: step{" "}
                          {state.selected_at_step}
                        </small>
                      )}
                    </div>
                  ))}
                  <button
                    className="primary full"
                    disabled={
                      busy ||
                      running ||
                      stale ||
                      !["trained", "completed"].includes(selected.status)
                    }
                    onClick={evaluate}
                  >
                    Evaluate saved models on test split
                  </button>
                  <p className="muted training-note">
                    Evaluation never trains or selects checkpoints. Repeated
                    test evaluation is exploratory; do not use it to tune
                    settings.
                  </p>
                </>
              )}
            </div>
          </Panel>
          {data && (
            <Panel
              title="Data & split boundaries"
              subtitle={`${data.observations} observations · trailing 20-day warmup`}
            >
              <div className="training-body">
                <p className="muted training-note">{data.label}</p>
                {Object.entries(data.splits).map(([name, split]) => (
                  <div className="split-row" key={name}>
                    <strong>{name}</strong>
                    <span>
                      {split.first_return_end} → {split.last_return_end}
                      <small>{split.transitions} realized daily returns</small>
                    </span>
                  </div>
                ))}
                <p className="muted training-note">
                  Observations use only prices known at each decision close. The
                  next close produces reward. Validation selects checkpoints;
                  test data is reserved for the Evaluate action.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
      {selected &&
        Object.entries(selected.agents).map(
          ([agent, state]) =>
            state.curve.length > 0 && (
              <Panel
                key={agent}
                title={`${names[agent]} · learning curves`}
                subtitle="Computed rollout rewards and validation returns; checkpoints every 128 environment steps"
              >
                <div className="learning-curves">
                  <Curve rows={state.curve} />
                  <Curve rows={state.curve} validation />
                </div>
              </Panel>
            ),
        )}
      {selected?.evaluation && (
        <>
          <div className="page-title evaluation-title">
            <h2>Held-out test evaluation</h2>
            <p>
              Computed from saved validation-selected models. Fees and slippage
              included; no claim of profitability.
            </p>
          </div>
          <div className="evaluation-grid">
            {Object.entries(selected.evaluation).map(([agent, result]) => (
              <Panel
                key={agent}
                title={names[agent]}
                subtitle={`${result.start_date} → ${result.end_date} · ${result.transitions} returns`}
              >
                <div className="evaluation-summary">
                  <strong>{pct(result.total_return)}</strong>
                  <span>{money(result.history.at(-1).value)} ending value</span>
                </div>
                <PerformanceChart data={result.history} />
                <dl className="comparison-list">
                  {[
                    [
                      "Annualized volatility",
                      result.annualized_volatility.toFixed(2) + "%",
                    ],
                    ["Max drawdown", result.max_drawdown.toFixed(2) + "%"],
                    [
                      "Fees / slippage",
                      money(result.fees) + " / " + money(result.slippage),
                    ],
                    [
                      "Cumulative one-way turnover",
                      result.turnover.toFixed(2) + "×",
                    ],
                    [
                      "Mean illustrative target ESG",
                      result.mean_esg.toFixed(2),
                    ],
                    ["Minimum target ESG", result.min_target_esg.toFixed(2)],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            ))}
          </div>
        </>
      )}
      <details className="methodology">
        <summary>Reward, constraints & execution methodology</summary>
        <p>
          Reward = log net growth − volatility penalty × trailing daily variance
          − drawdown penalty × current drawdown − extra cost penalty × execution
          cost fraction. The responsible policy also penalizes its proposed
          allocation’s ESG shortfall before repair. Cash earns the configured
          constant annual yield compounded at 252 periods per year. Actions are
          projected onto allocation bounds and a unit simplex; responsible
          actions are repaired to the feasible ESG floor. Constraints apply to
          trade targets; market drift may move end-of-day holdings outside them
          until the next rebalance. Execution solves a self-financing trade
          using fees and slippage on half the total absolute traded dollar
          holdings, including cash. Both policies start with $100,000 cash and
          pay first-rebalance costs. Scores: SPY 68, AGG 73, GLD 45, QQQ 64,
          CASH 50 — illustrative assumptions only.
        </p>
      </details>
    </>
  );
}
