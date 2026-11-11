import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Play,
  Wallet,
  Activity,
  Leaf,
  Download,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { request } from "../api";
import {
  Panel,
  PerformanceChart,
  Holdings,
  colors,
  money,
  pct,
} from "../components/UI";
import {
  PageHeader,
  DataNotice,
  EmptyState,
  StatCard,
  Loading,
} from "../components/Design";
import { downloadBlob } from "../lib/portfolio";
const presets = {
  Balanced: [35, 25, 15, 20, 5],
  Defensive: [20, 45, 15, 5, 15],
  Growth: [35, 10, 5, 45, 5],
};
const symbols = ["SPY", "AGG", "GLD", "QQQ", "CASH"];
export default function Rebalance() {
  const [weights, setWeights] = useState(presets.Balanced),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const total = weights.reduce((a, b) => a + b, 0);
  function change(next) {
    setWeights(next);
    setResult(null);
    setError("");
  }
  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError("");
    try {
      setResult(
        await request("simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weights: Object.fromEntries(
              symbols.map((s, i) => [s, weights[i] / 100]),
            ),
          }),
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="ALLOCATION STUDIO"
        title="Portfolio rebalancing"
        description="Explore the relationship between allocation, risk, and responsibility."
      >
        <Link className="button secondary" to="/comparison">
          Historical rebalancing <ArrowUpRight size={15} />
        </Link>
      </PageHeader>
      <DataNotice>
        This studio simulates starting weights followed by buy & hold on monthly
        synthetic data. For scheduled rebalancing and transaction costs, use
        historical backtesting.
      </DataNotice>
      <div className="sim-grid">
        <Panel
          title="Build your allocation"
          subtitle="$100,000 initial simulated capital"
        >
          <form onSubmit={run}>
            <fieldset disabled={busy}>
              <legend className="sr-only">Portfolio starting weights</legend>
              <div className="preset-controls" aria-label="Allocation presets">
                {Object.entries(presets).map(([name, w]) => (
                  <button
                    type="button"
                    key={name}
                    aria-pressed={JSON.stringify(weights) === JSON.stringify(w)}
                    className={
                      JSON.stringify(weights) === JSON.stringify(w)
                        ? "selected"
                        : ""
                    }
                    onClick={() => change(w)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="allocation-preview">
                <div className="mini-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={symbols.map((s, i) => ({
                          symbol: s,
                          value: weights[i],
                        }))}
                        dataKey="value"
                        innerRadius={44}
                        outerRadius={55}
                        paddingAngle={3}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {symbols.map((s, i) => (
                          <Cell key={s} fill={colors[i]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div>
                    <strong>{total}%</strong>
                    <small>ALLOCATED</small>
                  </div>
                </div>
                <div>
                  <strong>Your starting mix</strong>
                  <p>
                    {total === 100
                      ? "Fully allocated and ready to simulate."
                      : "Adjust weights to total exactly 100%."}
                  </p>
                </div>
              </div>
              {symbols.map((s, i) => (
                <div className="weight-control" key={s}>
                  <label className="weight-row">
                    <span>
                      <i style={{ background: colors[i] }} />
                      {s}
                    </span>
                    <span className="weight-input">
                      <input
                        aria-label={`${s} allocation percent`}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        required
                        value={weights[i]}
                        onChange={(e) =>
                          change(
                            weights.map((v, j) =>
                              j === i ? Number(e.target.value) : v,
                            ),
                          )
                        }
                      />
                      <span>%</span>
                    </span>
                  </label>
                  <input
                    type="range"
                    className="allocation-slider"
                    aria-label={`${s} allocation slider`}
                    min="0"
                    max="100"
                    step="1"
                    value={weights[i]}
                    onChange={(e) =>
                      change(
                        weights.map((v, j) =>
                          j === i ? Number(e.target.value) : v,
                        ),
                      )
                    }
                    style={{ "--asset-color": colors[i] }}
                  />
                </div>
              ))}
              <div className="weight-total">
                <span>Total allocation</span>
                <strong className={total === 100 ? "positive" : "negative"}>
                  {total}% <small>/ 100%</small>
                </strong>
              </div>
              <button className="primary full" disabled={total !== 100 || busy}>
                <Play size={15} />
                {busy ? "Calculating…" : "Run allocation simulation"}
              </button>
              {total !== 100 && (
                <p className="negative form-message">
                  Allocations must total 100%.
                </p>
              )}
            </fieldset>
            {error && (
              <p className="negative form-message" role="alert">
                {error}
              </p>
            )}
          </form>
        </Panel>
        <Panel
          title="Simulation results"
          subtitle="Computed from the monthly sample · fractional shares · no costs"
          action={
            result && (
              <button
                aria-label="Export simulation JSON"
                onClick={() =>
                  downloadBlob(
                    new Blob([JSON.stringify(result, null, 2)], {
                      type: "application/json",
                    }),
                    "allocation-simulation.json",
                  )
                }
              >
                <Download size={14} />
                Export JSON
              </button>
            )
          }
        >
          {busy ? (
            <Loading label="Calculating your allocation…" />
          ) : result ? (
            <>
              <div className="result-metrics">
                <StatCard
                  label="Final value"
                  value={money(result.value)}
                  detail={`${pct(result.total_return)} cumulative return`}
                  icon={Wallet}
                />
                <StatCard
                  label="Volatility"
                  value={`${result.annualized_volatility.toFixed(2)}%`}
                  detail={`${result.max_drawdown.toFixed(2)}% maximum drawdown`}
                  icon={Activity}
                  tone="purple"
                />
                <StatCard
                  label="Illustrative ESG"
                  value={result.esg_score.toFixed(1)}
                  detail="Value-weighted · out of 100"
                  icon={Leaf}
                  tone="teal"
                />
              </div>
              <PerformanceChart data={result.history} />
              <div className="chart-foot">
                <span>
                  <i /> Your simulated allocation
                </span>
                <span>
                  {result.start_date} → {result.end_date}
                </span>
              </div>
              <details className="methodology inset">
                <summary>Calculation assumptions</summary>
                <p>{result.methodology}</p>
              </details>
            </>
          ) : (
            <EmptyState
              icon={ArrowLeftRight}
              title="Your allocation, explored."
              description="Choose a starting mix, make it your own, and run the simulation to see calculated results."
            />
          )}
        </Panel>
      </div>
      {result && (
        <Panel
          title="Simulated holdings"
          subtitle="Actual computed final holdings for the submitted allocation"
        >
          <Holdings holdings={result.holdings} />
        </Panel>
      )}
    </>
  );
}
