export function KpiPanel() {
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="label">Access-block hours</div>
        <div className="value">—</div>
        <div className="note">lower is better · computed in Phase 7</div>
      </div>
      <div className="kpi">
        <div className="label">End-of-day headroom</div>
        <div className="value">—</div>
        <div className="note">higher is better · computed in Phase 7</div>
      </div>
    </div>
  )
}
