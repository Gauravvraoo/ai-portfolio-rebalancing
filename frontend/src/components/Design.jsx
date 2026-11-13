import {
  AlertCircle,
  ArrowUpRight,
  Database,
  FlaskConical,
  LoaderCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
export function PageHeader({
  eyebrow = "RESEARCH WORKSPACE",
  title,
  description,
  children,
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">
          <span />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
export function DataNotice({ children, badge = "SYNTHETIC DATA" }) {
  return (
    <div className="notice">
      <FlaskConical size={17} />
      <span>
        {children || (
          <>
            <strong>Simulation environment.</strong> Synthetic prices and
            illustrative ESG assumptions. Educational research only.
          </>
        )}
      </span>
      <span className="sample-badge">{badge}</span>
    </div>
  );
}
export function StatCard({ label, value, detail, icon: Icon, tone = "blue" }) {
  return (
    <div className={`metric tone-${tone}`}>
      <div className="metric-label">
        <span>{label}</span>
        {Icon && (
          <span className="metric-icon">
            <Icon size={17} />
          </span>
        )}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
export function EmptyState({
  icon: Icon = Database,
  title,
  description,
  to,
  action,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {to && (
        <Link className="button secondary" to={to}>
          {action}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function ErrorState({ message, retry }) {
  return (
    <div className="error-state" role="alert">
      <span className="empty-icon">
        <AlertCircle size={23} />
      </span>
      <div>
        <h3>We couldn’t load this data</h3>
        <p>{message}</p>
      </div>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
export function StatusPill({ status }) {
  return (
    <span className={`status-pill status-${status}`}>
      <i />
      {status}
    </span>
  );
}
export function WorkspaceSteps({ items }) {
  return (
    <div className="workspace-steps">
      {items.map(([title, text], i) => (
        <div key={title}>
          <span>{String(i + 1).padStart(2, "0")}</span>
          <div>
            <strong>{title}</strong>
            <p>{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
export function Loading({ label = "Loading simulation data…" }) {
  return (
    <div className="state" role="status">
      <LoaderCircle className="spinner-icon" size={24} />
      <span>{label}</span>
      <div className="skeleton-lines">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
