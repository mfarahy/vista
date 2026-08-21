import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
  href,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: 'default' | 'outline';
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
  className?: string;
}) {
  const showButton = actionLabel && (onAction || href);
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-5 text-muted-foreground">{description}</p>
      )}
      {showButton &&
        (href ? (
          <Button variant={action ?? 'default'} className="mt-5" asChild>
            <a href={href}>{actionLabel}</a>
          </Button>
        ) : (
          <Button variant={action ?? 'default'} className="mt-5" onClick={onAction}>
            {actionLabel}
          </Button>
        ))}
    </div>
  );
}

export function InlineSpinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
      {label}
    </span>
  );
}
