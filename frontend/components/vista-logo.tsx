import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function VistaLogo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Building2 className="size-4.5" aria-hidden />
      </span>
      {showWordmark && (
        <span className="text-sm font-semibold tracking-tight text-foreground">Vista</span>
      )}
    </span>
  );
}

export function VistaLogoLink({
  href = '/',
  className,
}: {
  href?: React.ComponentProps<typeof Link>['href'];
  className?: string;
}) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Building2 className="size-4.5" aria-hidden />
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">Vista</span>
    </Link>
  );
}
