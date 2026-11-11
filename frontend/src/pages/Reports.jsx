import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  FileSpreadsheet,
  FileJson,
  BrainCircuit,
  ArrowUpRight,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import { useApi, request } from "../api";
import { Panel, State } from "../components/UI";
import {
  PageHeader,
  DataNotice,
  EmptyState,
  StatusPill,
  Loading,
  ErrorState,
} from "../components/Design";
import { downloadApi, downloadBlob } from "../lib/portfolio";
export default function Reports() {
  const baseline = useApi("portfolio"),
    backtests = useApi("backtests"),
    training = useApi("training/jobs");
  const [run, setRun] = useState(""),
    [experiment, setExperiment] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const completed =
    backtests.data?.filter((j) => j.status === "completed") || [];
  const selected = completed.find((j) => j.id === run) || completed[0];
  const selectedTraining =
    training.data?.find((j) => j.id === experiment) || training.data?.[0];
  async function download(key, path, filename) {
    setBusy(key);
    setError("");
    try {
      await downloadApi(path, filename);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function exportExperiment() {
    setBusy("experiment");
    setError("");
    try {
      const data = await request(`training/jobs/${selectedTraining.id}`);
      downloadBlob(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        `experiment-${data.id}.json`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="YOUR RESEARCH, DOCUMENTED"
        title="Reports"
        description="From portfolio snapshots to complete experiment records. Every export has a source."
      >
        <Link className="button secondary" to="/comparison">
          Explore backtests <ArrowUpRight size={15} />
        </Link>
      </PageHeader>
      <DataNotice>
        Exports contain actual API results from synthetic data. ESG scores and
        cash yield are illustrative assumptions. No live trades or investment
        statements.
      </DataNotice>
      {error && (
        <div className="notice negative" role="alert">
          {error}
        </div>
      )}
      <div className="report-intro">
        <span className="report-emblem">
          <FolderOpen size={28} />
        </span>
        <div>
          <h2>Your research library</h2>
          <p>
            Reproducible records. Transparent assumptions. Ready to explore.
          </p>
        </div>
        <span className="chip">
          <ShieldCheck size={13} /> API-backed exports
        </span>
      </div>
      <div className="report-grid">
        <Panel
          title="Baseline portfolio"
          subtitle="Monthly sample · buy & hold"
        >
          <span className="report-type-icon">
            <FileSpreadsheet size={27} />
          </span>
          <State resource={baseline}>
            {(d) => (
              <div className="report-card-body">
                <h3>Portfolio performance export</h3>
                <p>
                  {d.observations} monthly observations with portfolio value and
                  drawdown.
                </p>
                <div className="report-meta">
                  <span>Sample period</span>
                  <strong>
                    {d.start_date} → {d.end_date}
                  </strong>
                  <span>Source</span>
                  <strong>Phase 1 SQLite baseline</strong>
                  <span>Format</span>
                  <strong>CSV</strong>
                </div>
                <button
                  className="primary full"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    download("baseline", "report", "verdant-simulation.csv")
                  }
                >
                  <Download size={15} />
                  {busy === "baseline" ? "Preparing…" : "Download CSV"}
                </button>
                <details className="methodology">
                  <summary>What this report includes</summary>
                  <p>{d.methodology}</p>
                </details>
              </div>
            )}
          </State>
        </Panel>
        <Panel
          title="Backtest comparison"
          subtitle="Computed metrics & complete daily records"
        >
          <span className="report-type-icon purple">
            <FileJson size={27} />
          </span>
          {backtests.loading ? (
            <Loading label="Loading saved backtests…" />
          ) : backtests.error ? (
            <ErrorState message={backtests.error} retry={backtests.retry} />
          ) : !selected ? (
            <EmptyState
              title="No completed backtests"
              description="Run a historical comparison to unlock its metrics, daily history and full result export."
              to="/comparison"
              action="Create a backtest"
            />
          ) : (
            <div className="report-card-body">
              <label className="config-field">
                Backtest to export
                <select
                  value={selected.id}
                  onChange={(e) => setRun(e.target.value)}
                >
                  {completed.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.id.slice(0, 8)} · {j.config.rebalance_frequency} ·{" "}
                      {j.config.experiment_id ? "6 strategies" : "4 benchmarks"}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                The saved run’s settings and results are used for every
                download.
              </p>
              <div className="report-downloads">
                {[
                  [
                    "json",
                    "summary",
                    "Download backtest JSON",
                    "Full configuration, provenance & records",
                  ],
                  [
                    "csv",
                    "summary",
                    "Download metrics CSV",
                    "All computed strategy metrics",
                  ],
                  [
                    "csv",
                    "history",
                    "Download history CSV",
                    "Daily values, costs & allocations",
                  ],
                ].map(([format, kind, label, hint]) => (
                  <button
                    key={label}
                    disabled={Boolean(busy)}
                    onClick={() =>
                      download(
                        format + kind,
                        `backtests/${selected.id}/export?format=${format}&kind=${kind}`,
                        `backtest-${selected.id}-${kind}.${format}`,
                      )
                    }
                  >
                    <Download size={16} />
                    <span>
                      <strong>
                        {busy === format + kind ? "Preparing…" : label}
                      </strong>
                      <small>{hint}</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
              <Link className="text-link" to={`/comparison?run=${selected.id}`}>
                Open this comparison <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </Panel>
        <Panel
          title="AI experiment record"
          subtitle="Real training progress & evaluation metadata"
        >
          <span className="report-type-icon teal">
            <BrainCircuit size={27} />
          </span>
          {training.loading ? (
            <Loading label="Loading experiment records…" />
          ) : training.error ? (
            <ErrorState message={training.error} retry={training.retry} />
          ) : !selectedTraining ? (
            <EmptyState
              title="No experiments recorded"
              description="Train the PPO agents to save configurations, progress and evaluation results."
              to="/training"
              action="Open the AI lab"
            />
          ) : (
            <div className="report-card-body">
              <label className="config-field">
                Experiment to export
                <select
                  value={selectedTraining.id}
                  onChange={(e) => setExperiment(e.target.value)}
                >
                  {training.data.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.id.slice(0, 8)} · {j.config.mode} · {j.status}
                    </option>
                  ))}
                </select>
              </label>
              <StatusPill status={selectedTraining.status} />
              <p>
                Includes the actual configuration, data manifest, progress and
                any recorded evaluation. Model binaries remain in the backend
                artifact directory.
              </p>
              <div className="report-meta">
                <span>Training mode</span>
                <strong>{selectedTraining.config.mode}</strong>
                <span>Random seed</span>
                <strong>{selectedTraining.config.seed}</strong>
                <span>Format</span>
                <strong>JSON metadata</strong>
              </div>
              <button
                className="secondary full"
                onClick={exportExperiment}
                disabled={Boolean(busy)}
              >
                <Download size={15} />
                {busy === "experiment"
                  ? "Preparing…"
                  : "Download experiment JSON"}
              </button>
            </div>
          )}
        </Panel>
      </div>
      <Panel
        title="Saved backtest archive"
        subtitle="A record of computed comparisons and their current state"
        action={
          <Link className="text-link" to="/comparison">
            New comparison <ArrowUpRight size={14} />
          </Link>
        }
      >
        {backtests.loading ? (
          <Loading />
        ) : backtests.error ? (
          <ErrorState message={backtests.error} retry={backtests.retry} />
        ) : !backtests.data?.length ? (
          <EmptyState
            title="A clean slate for your research"
            description="Your backtests will appear here after you run a comparison."
          />
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Scrollable data table"
          >
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Universe</th>
                  <th>Frequency</th>
                  <th>Execution assumptions</th>
                  <th>Status</th>
                  <th>Results</th>
                </tr>
              </thead>
              <tbody>
                {backtests.data.slice(0, 10).map((j) => (
                  <tr key={j.id}>
                    <td>
                      <strong className="mono">{j.id.slice(0, 8)}</strong>
                    </td>
                    <td>
                      {j.config.experiment_id
                        ? "Benchmarks + PPO"
                        : "Four benchmarks"}
                    </td>
                    <td className="capitalize">
                      {j.config.rebalance_frequency}
                    </td>
                    <td>
                      {j.config.fee_bps} bps fees · {j.config.slippage_bps} bps
                      slippage
                    </td>
                    <td>
                      <StatusPill status={j.status} />
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        to={`/comparison?run=${j.id}`}
                      >
                        {j.status === "completed"
                          ? "View results"
                          : "View status"}
                        <ArrowUpRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
