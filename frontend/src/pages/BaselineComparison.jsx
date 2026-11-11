import { FlaskConical } from "lucide-react";
import { useApi } from "../api";
import { PageHeader } from "../components/Design";
import { Panel, State, PerformanceChart, pct, money } from "../components/UI";
export default function BaselineComparison() {
  const r = useApi("strategies");
  return (
    <>
      <PageHeader
        title="Strategy comparison"
        description="Compare three rule-based starting allocations on identical sample data."
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
