interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 text-text-mute">{icon}</div>
      <p className="mb-1 text-sm font-medium text-text-dim">{title}</p>
      <p className="mb-4 text-xs text-text-mute">{description}</p>
      {action && (
        action.href ? (
          <a href={action.href} className="text-sm text-accent hover:underline transition-colors">
            {action.label} →
          </a>
        ) : (
          <button onClick={action.onClick} className="text-sm text-accent hover:underline transition-colors">
            {action.label} →
          </button>
        )
      )}
    </div>
  );
}
