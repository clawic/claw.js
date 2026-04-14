import type { JobRecord } from "../api/client";

export function JobBanner({ job }: { job: JobRecord }) {
  return (
    <div className="job-banner" data-testid="job-status-banner">
      <span className="job-id">{job.id.slice(0, 8)}</span>
      <strong>{job.kind}</strong>
      <span>{job.message}</span>
      <div className="job-progress">
        <div className="job-progress-bar" style={{ width: `${job.progressPercent}%` }} />
      </div>
      <span>{job.progressPercent}%</span>
      {job.status === "completed" && <span className="status-badge status-completed">Done</span>}
      {job.status === "failed" && <span className="status-badge status-failed">Failed</span>}
    </div>
  );
}
