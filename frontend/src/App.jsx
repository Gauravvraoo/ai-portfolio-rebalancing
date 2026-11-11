import Training from "./pages/Training";
import { useState } from "react";
import { NavLink, Routes, Route, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  BrainCircuit,
  ArrowLeftRight,
  GitCompareArrows,
  FileChartColumn,
  Leaf,
  ArrowUpRight,
  ChevronRight,
  ShieldCheck,
  Menu,
  X,
  Download,
  Activity,
  Wallet,
  FlaskConical,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useApi, request } from "./api";
import {
  Panel,
  State,
  PerformanceChart,
  Holdings,
  colors,
  money,
  pct,
} from "./components/UI";
const navigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/market", "Market Analysis", ChartNoAxesCombined],
  ["/training", "AI Agent Training", BrainCircuit],
  ["/rebalance", "Portfolio Rebalancing", ArrowLeftRight],
  ["/comparison", "Strategy Comparison", GitCompareArrows],
  ["/reports", "Reports", FileChartColumn],
];
function Dashboard() {
  const resource = useApi("portfolio");
  return (
    <State resource={resource}>
      {(d) => (
        <>
          <div className="intro">
            <div>
              <div className="eyebrow">YOUR PORTFOLIO, IN PERSPECTIVE</div>
              <h1>
                A clearer view. A smarter future<span>.</span>
              </h1>
              <p>
                Explore your allocation, understand risk, and invest with
                intention.
              </p>
            </div>
            <Link className="button primary" to="/rebalance">
              <ArrowLeftRight size={16} /> Explore allocation
            </Link>
          </div>
          <div className="notice">
            <FlaskConical size={16} />
            <span>
              <strong>Educational simulation</strong> · Synthetic sample prices,
              Dec 2023 – Dec 2024. No live market data.
            </span>
            <span className="sample-badge">PHASE 01</span>
          </div>
          <div className="stats">
            <Metric
              label="Portfolio value"
              value={money(d.value)}
              detail={`${money(d.profit)} sample-period gain`}
              icon={Wallet}
            />
            <Metric
              label="Total return"
              value={pct(d.total_return)}
              detail="Buy-and-hold · full sample period"
              icon={ChartNoAxesCombined}
            />
            <Metric
              label="Annualized volatility"
              value={`${d.annualized_volatility.toFixed(2)}%`}
              detail="Based on 12 monthly returns"
              icon={Activity}
            />
            <Metric
              label="Illustrative ESG score"
              value={
                <>
                  {d.esg_score.toFixed(1)}
                  <small> / 100</small>
                </>
              }
              detail="Value-weighted · illustrative only"
              icon={Leaf}
            />
          </div>
          <div className="dashboard-grid">
            <Panel
              title="Portfolio performance"
              subtitle="The journey of your simulated investment"
              action={<span className="chip">Full sample period</span>}
            >
              <div className="chart-summary">
                <strong>{money(d.value)}</strong>
                <span className="positive">
                  <ArrowUpRight size={15} />
                  {pct(d.total_return)}
                </span>
                <small>from {money(d.initial_capital)}</small>
              </div>
              <PerformanceChart data={d.history} />
              <div className="chart-foot">
                <span>
                  <i /> Balanced portfolio
                </span>
                <span>Monthly observations · USD</span>
              </div>
            </Panel>
            <Panel title="Asset allocation" subtitle="Diversified by design">
              <div className="donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={d.holdings}
                      dataKey="value"
                      innerRadius={71}
                      outerRadius={89}
                      paddingAngle={4}
                      stroke="none"
                    >
                      {d.holdings.map((a, i) => (
                        <Cell key={a.symbol} fill={colors[i]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <small>ASSET CLASSES</small>
                  <strong>05</strong>
                  <span>Buy & hold</span>
                </div>
              </div>
              <div className="legend">
                {d.holdings.map((a, i) => (
                  <div key={a.symbol}>
                    <span>
                      <i style={{ background: colors[i] }} />
                      {a.symbol}
                      <small>{a.category}</small>
                    </span>
                    <strong>{(a.current_weight * 100).toFixed(1)}%</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <Panel
            title="Your holdings"
            subtitle="Five assets. One transparent portfolio."
            action={
              <Link className="text-link" to="/market">
                Market analysis <ArrowUpRight size={14} />
              </Link>
            }
          >
            <Holdings holdings={d.holdings} />
          </Panel>
          <div className="bottom-grid">
            <Panel
              title="Risk, with context"
              subtitle="Know what sits behind the numbers"
            >
              <div className="risk-row">
                <ShieldCheck size={28} />
                <div>
                  <strong>Maximum observed drawdown</strong>
                  <p>Monthly observations may understate intramonth losses.</p>
                </div>
                <b>{d.max_drawdown.toFixed(2)}%</b>
              </div>
            </Panel>
            <div className="future-card">
              <div className="eyebrow">THE NEXT CHAPTER</div>
              <h2>Intelligence meets intention.</h2>
              <p>Train and evaluate two PPO agents in the research lab.</p>
              <Link to="/training">
                Open the training lab <ArrowUpRight size={16} />
              </Link>
              <BrainCircuit className="future-icon" size={100} />
            </div>
          </div>
          <details className="methodology">
            <summary>Data & calculation methodology</summary>
            <p>{d.methodology}</p>
          </details>
        </>
      )}
    </State>
  );
}
function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <Icon size={17} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function Market() {
  const r = useApi("market");
  return (
    <>
      <PageTitle
        title="Market analysis"
        text="Explore the sample asset universe and compare cumulative price returns."
      />
      <State resource={r}>
        {(d) => (
          <>
            <div className="notice">
              <FlaskConical size={16} />
              {d.data_label}. These are not real historical quotes.
            </div>
            <Panel
              title="Asset performance"
              subtitle="Cumulative change since 31 Dec 2023; all series start at 0%"
            >
              <div className="inline-legend">
                {d.assets.map((a, i) => (
                  <span key={a.symbol}>
                    <i style={{ background: colors[i] }} />
                    {a.symbol}
                  </span>
                ))}
              </div>
              <PerformanceChart
                data={d.history}
                lines={d.assets.map((a) => a.symbol)}
              />
            </Panel>
            <div className="asset-grid">
              {d.assets.map((a, i) => (
                <Panel key={a.symbol} title={a.symbol} subtitle={a.name}>
                  <strong className="large-number" style={{ color: colors[i] }}>
                    {pct(a.period_return)}
                  </strong>
                  <p className="muted">Sample price {money(a.price)}</p>
                  <p>Illustrative ESG: {a.illustrative_esg}/100</p>
                </Panel>
              ))}
            </div>
          </>
        )}
      </State>
    </>
  );
}
function PageTitle({ title, text }) {
  return (
    <div className="page-title">
      <div className="eyebrow">PORTFOLIO WORKSPACE</div>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function Rebalance() {
  const [weights, setWeights] = useState({
      SPY: 35,
      AGG: 25,
      GLD: 15,
      QQQ: 20,
      CASH: 5,
    }),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await request("simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weights: Object.fromEntries(
              Object.entries(weights).map(([k, v]) => [k, v / 100]),
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
      <PageTitle
        title="Portfolio rebalancing"
        text="Test a starting allocation against the same sample period."
      />
      <div className="notice">
        <FlaskConical size={16} />
        This is a buy-and-hold allocation simulation. No trades are placed or
        saved; automated rebalancing comes later.
      </div>
      <div className="sim-grid">
        <Panel
          title="Build your allocation"
          subtitle="$100,000 initial simulated capital"
        >
          <form onSubmit={run}>
            {Object.entries(weights).map(([s, v], i) => (
              <label className="weight-row" key={s}>
                <span>
                  <i style={{ background: colors[i] }} />
                  {s}
                </span>
                <div>
                  <input
                    aria-label={`${s} allocation percent`}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    required
                    value={v}
                    onChange={(e) => {
                      setWeights({ ...weights, [s]: Number(e.target.value) });
                      setResult(null);
                    }}
                  />{" "}
                  %
                </div>
              </label>
            ))}
            <div className="weight-total">
              Total allocation{" "}
              <strong className={total === 100 ? "positive" : "negative"}>
                {total}%
              </strong>
            </div>
            <button className="primary full" disabled={total !== 100 || busy}>
              {busy ? "Calculating…" : "Run allocation simulation"}
              <ArrowUpRight size={16} />
            </button>
            {total !== 100 && (
              <p className="negative">Allocations must total 100%.</p>
            )}
            {error && (
              <p role="alert" className="negative">
                {error}
              </p>
            )}
          </form>
        </Panel>
        <Panel
          title="Simulation results"
          subtitle="Calculated by the FastAPI portfolio engine"
        >
          {result ? (
            <>
              <div className="result-metrics">
                <Metric
                  label="Final value"
                  value={money(result.value)}
                  detail={pct(result.total_return) + " total return"}
                  icon={Wallet}
                />
                <Metric
                  label="Volatility"
                  value={result.annualized_volatility.toFixed(2) + "%"}
                  detail={`Illustrative ESG ${result.esg_score.toFixed(1)}/100`}
                  icon={Activity}
                />
              </div>
              <PerformanceChart data={result.history} />
            </>
          ) : (
            <div className="empty">
              <ArrowLeftRight size={38} />
              <h3>Your allocation, explored.</h3>
              <p>
                Set weights to 100% and run the simulation to see computed
                results.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
function Comparison() {
  const r = useApi("strategies");
  return (
    <>
      <PageTitle
        title="Strategy comparison"
        text="Compare three rule-based starting allocations on identical sample data."
      />
      <div className="notice">
        <FlaskConical size={16} />
        Preset buy-and-hold strategies, not AI predictions. Returns exclude
        fees, dividends and taxes.
      </div>
      <State resource={r}>
        {(data) => (
          <div className="comparison-grid">
            {data.map((d) => (
              <Panel
                key={d.name}
                title={d.name}
                subtitle="Synthetic sample · Dec 2023 – Dec 2024"
              >
                <strong className="large-number positive">
                  {pct(d.total_return)}
                </strong>
                <p className="muted">Total sample-period return</p>
                <PerformanceChart data={d.history} />
                <dl className="comparison-list">
                  <div>
                    <dt>Final portfolio value</dt>
                    <dd>{money(d.value)}</dd>
                  </div>
                  <div>
                    <dt>Annualized volatility</dt>
                    <dd>{d.annualized_volatility.toFixed(2)}%</dd>
                  </div>
                  <div>
                    <dt>Maximum drawdown</dt>
                    <dd>{d.max_drawdown.toFixed(2)}%</dd>
                  </div>
                  <div>
                    <dt>Illustrative ESG</dt>
                    <dd>{d.esg_score.toFixed(1)} / 100</dd>
                  </div>
                </dl>
                <div className="preset-weights">
                  {Object.entries(d.weights).map(([s, w]) => (
                    <span key={s}>
                      {s} {Math.round(w * 100)}%
                    </span>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </State>
    </>
  );
}
function Reports() {
  const r = useApi("portfolio");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/report");
      if (!response.ok)
        throw new Error("Report download failed. Please retry.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "verdant-simulation.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Reports"
        text="Export a reproducible record of your baseline sample simulation."
      />
      <State resource={r}>
        {(d) => (
          <Panel
            title="Balanced portfolio · sample report"
            subtitle={`${d.start_date} → ${d.end_date}`}
          >
            <div className="report-content">
              <FileChartColumn size={45} />
              <div>
                <h3>Portfolio performance export</h3>
                <p className="muted">
                  {d.observations} monthly observations, portfolio value in USD
                  and drawdown percentages.
                </p>
                <p className="muted">
                  Generated from the same SQLite data as your dashboard.
                  Synthetic sample data only.
                </p>
              </div>
              <button className="primary" onClick={download} disabled={busy}>
                <Download size={16} />
                {busy ? "Preparing…" : "Download CSV"}
              </button>
            </div>
            {error && (
              <p role="alert" className="negative">
                {error}
              </p>
            )}
            <details className="methodology">
              <summary>What this report includes</summary>
              <p>{d.methodology}</p>
            </details>
          </Panel>
        )}
      </State>
    </>
  );
}
export default function App() {
  const location = useLocation();
  const currentPage =
    navigation.find(([path]) => path === location.pathname)?.[1] ||
    "Page not found";
  const [open, setOpen] = useState(false);
  const health = useApi("health");
  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <Link to="/" className="brand">
          <div className="brand-mark">
            <Leaf size={23} />
          </div>
          verdant<span>●</span>
        </Link>
        <div className="workspace-label">INVESTMENT WORKSPACE</div>
        <nav>
          {navigation.map(([path, label, Icon]) => (
            <NavLink
              end={path === "/"}
              key={path}
              to={path}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {path === "/" && <span className="nav-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="phase-card">
            <div>
              <span className="tiny-dot" /> PHASE 02
            </div>
            <h3>A foundation for smarter investing.</h3>
            <p>
              Built for exploration.
              <br />
              Designed with purpose.
            </p>
            <Link to="/training">
              Open the training lab <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="profile">
            <span>GR</span>
            <div>
              <strong>Research workspace</strong>
              <small>Educational project</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      {open && <div className="overlay" onClick={() => setOpen(false)} />}
      <div className="main-shell">
        <header>
          <div className="header-left">
            <button
              className="menu-button"
              aria-label={open ? "Close navigation" : "Open navigation"}
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{currentPage}</strong>
          </div>
          <div className="header-right">
            <span
              className={`health ${health.data ? "connected" : ""}`}
              title={health.error || "Backend database health"}
            >
              <i />
              {health.loading
                ? "Connecting"
                : health.data
                  ? "API connected"
                  : "API offline"}
            </span>
            {health.error && <button onClick={health.retry}>Retry</button>}
            <span className="header-avatar">GR</span>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/market" element={<Market />} />
            <Route path="/training" element={<Training />} />
            <Route path="/rebalance" element={<Rebalance />} />
            <Route path="/comparison" element={<Comparison />} />
            <Route path="/reports" element={<Reports />} />
            <Route
              path="*"
              element={
                <Panel title="Page not found">
                  <Link to="/">Return to dashboard</Link>
                </Panel>
              }
            />
          </Routes>
          <footer>
            <span>
              <Leaf size={13} /> VERDANT <span className="footer-dot">/</span>{" "}
              Investment intelligence, thoughtfully built.
            </span>
            <span>Educational backtesting only · Not investment advice</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
