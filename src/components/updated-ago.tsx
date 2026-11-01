import { cn, formatUpdatedAgo } from '@/lib/utils';

export function UpdatedAgo({ at, className }: { at: string | null | undefined; className?: string }) {
  const label = formatUpdatedAgo(at);
  if (!label) return null;
  return <p className={cn('text-[11px] text-zinc-500', className)}>{label}</p>;
}
