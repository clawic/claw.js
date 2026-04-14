export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-block">
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && <button className="btn btn--sm btn--secondary" onClick={onRetry}>Retry</button>}
    </div>
  );
}
