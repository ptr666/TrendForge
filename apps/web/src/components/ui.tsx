import type { ApiState, VerificationResult } from "../types.js";

export function StatusPill({ state, label }: { state: ApiState | boolean | string; label: string }) {
  const className = typeof state === "boolean" ? (state ? "ok" : "warn") : state;
  return <span className={`pill ${className}`}>{label}</span>;
}

export function ResultPanel({ title, result }: { title: string; result?: VerificationResult }) {
  return (
    <section className="result-panel" aria-live="polite">
      <div className="section-title compact">
        <h3>{title}</h3>
        {result && <StatusPill state={Boolean(result.ok)} label={result.ok ? "verified" : "needs attention"} />}
      </div>
      <pre>{result ? JSON.stringify(result, null, 2) : "No result yet."}</pre>
    </section>
  );
}
