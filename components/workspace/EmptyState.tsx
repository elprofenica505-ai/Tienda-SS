import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function EmptyState({ icon = '◇', title, description, actionLabel, onAction, secondaryLabel, onSecondary }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="empty-state-actions">
        {actionLabel && onAction && <button className="button" onClick={onAction}>{actionLabel} ↗</button>}
        {secondaryLabel && onSecondary && <button className="text-link" onClick={onSecondary}>{secondaryLabel}</button>}
      </div>
    </div>
  );
}
