import { useEffect, useRef, useState } from "react";
import { NavLink, Routes, Route, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  BrainCircuit,
  ArrowLeftRight,
  GitCompareArrows,
  FileChartColumn,
  ArrowUpRight,
  ChevronRight,
  ShieldCheck,
  Menu,
  X,
  Layers3,
  FlaskConical,
  ArrowDownToLine,
} from "lucide-react";
import { useApi } from "./api";
import { Panel } from "./components/UI";
import { EmptyState } from "./components/Design";
import Dashboard from "./pages/Dashboard";
import Market from "./pages/Market";
import Rebalance from "./pages/Rebalance";
import Reports from "./pages/Reports";
import Training from "./pages/Training";
import Backtesting from "./pages/Backtesting";
import BaselineComparison from "./pages/BaselineComparison";
import { DataSourceControls } from "./components/DataSource";
const navigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/market", "Market Analysis", ChartNoAxesCombined],
  ["/training", "AI Agent Training", BrainCircuit],
  ["/rebalance", "Portfolio Rebalancing", ArrowLeftRight],
  ["/comparison", "Strategy Comparison", GitCompareArrows],
  ["/reports", "Reports", FileChartColumn],
];
export default function App() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  const health = useApi("health");
  const sidebar = useRef(null),
    toggle = useRef(null),
    main = useRef(null);
  const currentPage =
    navigation.find(([path]) => path === location.pathname)?.[1] ||
    "Page not found";
  useEffect(() => {
    document.title = `${currentPage} · Verdant`;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [location.pathname, currentPage]);
  useEffect(() => {
    if (!open) return;
    const panel = sidebar.current;
    const before = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.querySelector("button").focus();
    function key(e) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const controls = [...panel.querySelectorAll("a,button")].filter(
          (el) => el.getClientRects().length,
        );
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 901px)");
    const close = () => {
      setMobile(!media.matches);
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        id="workspace-navigation"
        ref={sidebar}
        className={`sidebar ${open ? "open" : ""}`}
        aria-label="Workspace navigation"
        inert={mobile && !open ? true : undefined}
        aria-hidden={mobile && !open ? true : undefined}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
      >
        <div className="brand-row">
          <Link to="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-mark">
              <Layers3 size={22} />
            </span>
            <span>
              verdant<span className="brand-period">.</span>
              <small>PORTFOLIO INTELLIGENCE</small>
            </span>
          </Link>
          <button
            className="sidebar-close icon-button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Layers3 size={17} />
          </span>
          <div>
            <strong>Research workspace</strong>
            <small>Portfolio simulation</small>
          </div>
          <ShieldCheck size={15} />
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(([path, label, Icon]) => (
            <NavLink
              end={path === "/"}
              key={path}
              to={path}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              <ChevronRight size={13} className="nav-arrow" />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="phase-card">
            <span className="lab-icon">
              <BrainCircuit size={22} />
            </span>
            <h3>
              Your next insight
              <br />
              starts with an experiment.
            </h3>
            <p>Train. Compare. Understand.</p>
            <Link to="/training" onClick={() => setOpen(false)}>
              Open the AI lab <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="environment-label">
            <i />
            LOCAL RESEARCH ENVIRONMENT
          </div>
          <div className="profile">
            <span>VP</span>
            <div>
              <strong>Verdant Research</strong>
              <small>Educational workspace</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      {open && (
        <div
          className="overlay"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className="main-shell" inert={open ? true : undefined}>
        <header className="topbar">
          <div className="header-left">
            <button
              ref={toggle}
              className="menu-button icon-button"
              aria-label="Open navigation"
              aria-controls="workspace-navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={13} />
            <strong>{currentPage}</strong>
          </div>
          <div className="header-right">
            <span className="mode-label">
              <FlaskConical size={13} /> Simulation mode
            </span>
            <span
              className={`health ${health.data && !health.error && !health.loading ? "connected" : ""}`}
              role="status"
              title={health.error || "Backend database health"}
            >
              <i />
              {health.loading
                ? "Connecting"
                : health.error
                  ? "API offline"
                  : "API connected"}
            </span>
            {health.error && <button onClick={health.retry}>Retry</button>}
            <Link
              className="icon-button header-report"
              aria-label="Open reports"
              to="/reports"
            >
              <ArrowDownToLine size={17} />
            </Link>
            <span className="header-avatar" aria-label="Research workspace">
              R
            </span>
          </div>
        </header>
        <main
          className={
            location.pathname === "/market" ? "market-main" : undefined
          }
          id="main-content"
          tabIndex={-1}
          ref={main}
        >
          <div className="page-content" key={location.pathname}>
            <DataSourceControls />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/market" element={<Market />} />
              <Route path="/training" element={<Training />} />
              <Route path="/rebalance" element={<Rebalance />} />
              <Route
                path="/comparison"
                element={<Backtesting baseline={<BaselineComparison />} />}
              />
              <Route path="/reports" element={<Reports />} />
              <Route
                path="*"
                element={
                  <Panel title="Page not found">
                    <EmptyState
                      title="This page isn’t in your workspace"
                      description="Return to your portfolio overview to continue exploring."
                      to="/"
                      action="Back to dashboard"
                    />
                  </Panel>
                }
              />
            </Routes>
          </div>
          <footer>
            <span>
              <Layers3 size={13} />
              <strong>VERDANT</strong>
              <span className="footer-dot">/</span> Built for thoughtful
              investment research.
            </span>
            <span>Educational simulation · Not investment advice</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
