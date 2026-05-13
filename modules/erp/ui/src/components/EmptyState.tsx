interface Props {
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, text, actionLabel, onAction }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      {text && <div className="empty-state-text">{text}</div>}
      {actionLabel && onAction && (
        <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
