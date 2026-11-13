import { Link } from "react-router-dom";
import {
  Activity,
  Layers3,
  CalendarDays,
  Landmark,
  ArrowUpRight,
  Database,
  CheckCircle2,
  LoaderCircle,
  AlertCircle,
  FlaskConical,
} from "lucide-react";
import { useApi } from "../api";
import { useDataSource } from "./DataSource";
import { marketPath } from "../lib/dataSource";

const etfs = ["SPY", "AGG", "GLD", "QQQ"];
const dateLabel = (value) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unavailable";
function Metric({ icon: Icon, label, value, detail }) {
  return (
    <div className="intelligence-metric">
      <div className="intelligence-metric-label">
        <Icon size={16} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
export default function HistoricalMarketIntelligence() {
  const { source, range, cashYield } = useDataSource();
  // A changed selection starts a fresh loading state, without stale dataset metrics.
  return (
    <IntelligenceSummary
      key={`${source}:${range}:${cashYield}`}
      source={source}
      range={range}
      cashYield={cashYield}
    />
  );
}
function IntelligenceSummary({ source, range, cashYield }) {
  const resource = useApi(
    source === "real" ? marketPath(source, range, cashYield) : null,
    120000,
  );
  const data = resource.data;
  const tracked = etfs.filter((symbol) =>
    data?.assets?.some((asset) => asset.symbol === symbol),
  );
  const loaded =
    source === "real" &&
    !resource.loading &&
    !resource.error &&
    data?.data?.data_source === "real" &&
    data.history?.length > 0 &&
    tracked.length > 0;
  const status =
    source !== "real"
      ? "Synthetic demo"
      : resource.loading
        ? "Loading"
        : resource.error
          ? "Provider error"
          : loaded
            ? "Loaded"
            : "Unavailable";
  const StatusIcon =
    source !== "real"
      ? FlaskConical
      : resource.loading
        ? LoaderCircle
        : loaded
          ? CheckCircle2
          : AlertCircle;
  return (
    <section
      className={`historical-intelligence ${loaded ? "is-loaded" : ""}`}
      aria-labelledby="intelligence-title"
      aria-busy={source === "real" && resource.loading}
    >
      <div className="intelligence-header">
        <div className="intelligence-heading">
          <span className="intelligence-emblem">
            <Activity size={23} aria-hidden="true" />
          </span>
          <div>
            <span className="intelligence-eyebrow">YOUR RESEARCH DATASET</span>
            <h2 id="intelligence-title">Historical Market Intelligence</h2>
          </div>
        </div>
        <span
          className={`intelligence-status ${loaded ? "loaded" : ""}`}
          role="status"
        >
          <StatusIcon size={14} aria-hidden="true" />
          {status}
        </span>
      </div>
      {loaded ? (
        <>
          <div className="intelligence-metrics">
            <Metric
              icon={Activity}
              label="Aligned observations"
              value={data.history.length.toLocaleString("en-US")}
              detail="Common trading sessions"
            />
            <Metric
              icon={Layers3}
              label="Tracked ETFs"
              value={
                <>
                  {tracked.length}
                  <span className="intelligence-unit"> ETFs</span>
                </>
              }
              detail={tracked.join(" · ")}
            />
            <Metric
              icon={CalendarDays}
              label="Last trading date"
              value={dateLabel(
                data.data.last_trading_date || data.history.at(-1).date,
              )}
              detail="Latest available observation"
            />
            <Metric
              icon={Landmark}
              label="Annual cash yield"
              value={`${(cashYield * 100).toFixed(1)}%`}
              detail="Configured assumption · not a quoted rate"
            />
          </div>
          <div className="intelligence-provenance">
            <span>
              <Database size={14} aria-hidden="true" />
              <strong>{data.data.provider || "Provider not disclosed"}</strong>
            </span>
            <span>
              {range} window · {data.data.start_date || data.history[0].date} →{" "}
              {data.data.end_date || data.history.at(-1).date}
            </span>
            <span>
              {data.data.price_adjustment || "Adjustment status not disclosed"}
            </span>
          </div>
          {data.data.fallback_used && (
            <p className="intelligence-fallback">
              Configured fallback: {data.data.primary_provider} →{" "}
              {data.data.provider_id || data.data.provider} ·{" "}
              {data.data.fallback_reason?.code ||
                "Primary provider unavailable"}
            </p>
          )}
        </>
      ) : (
        <div
          className="intelligence-empty"
          role={resource.error && source === "real" ? "alert" : undefined}
        >
          <strong>
            {source !== "real"
              ? "Explore the market behind your next portfolio decision."
              : resource.loading
                ? "Preparing your historical research window…"
                : "Historical dataset is unavailable."}
          </strong>
          <p>
            {source !== "real"
              ? "Synthetic Demo is selected. Choose Real Historical Market Data above to load aligned ETF observations. No real-data metrics are shown."
              : resource.loading
                ? "Fetching provider data and aligning trading sessions. Metrics appear after the dataset loads successfully."
                : resource.error ||
                  "No usable real historical observations were returned. No synthetic values have been substituted."}
          </p>
          {source === "real" && !resource.loading && (
            <button className="button secondary" onClick={resource.retry}>
              Retry historical data
            </button>
          )}
        </div>
      )}
      <div className="intelligence-footer">
        <div>
          <span className="intelligence-disclaimer">
            <i aria-hidden="true" />
            Historical data, not live streaming
          </span>
          <small>
            Separate from the synthetic portfolio KPIs below. CASH yield is
            assumed; ESG remains illustrative.
          </small>
        </div>
        <Link className="intelligence-link" to="/market">
          Explore Market Analysis <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
