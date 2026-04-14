interface Props {
  title?: string;
  message: string;
  correlationId?: string;
  onRetry?: () => void;
}

export function ErrorBlock({ title = "Error", message, correlationId, onRetry }: Props) {
  return (
    <div className="error-block">
      <div className="error-block-title">{title}</div>
      <div className="error-block-message">{message}</div>
      {correlationId && <div className="correlation-id">ID: {correlationId}</div>}
      {onRetry && (
        <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
