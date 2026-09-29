import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * GuidedTooltip — a thin, first-party wrapper over the Radix tooltip used to
 * make the product self-guiding.
 *
 * The app already mounts one global `<TooltipProvider delayDuration={300}>` in
 * `App.tsx`, so this component never nests a provider (nesting one resets the
 * delay and is the crash the testing notes call out). It only adds the things
 * every guided hint needs and that were being retyped at each call site:
 *
 *  - `label`   — the short name, used mainly when the surrounding chrome hides
 *                it (e.g. a collapsed sidebar).
 *  - `hint`    — the one-line "why / how" explanation.
 *  - `shortcut`— an optional keyboard hint rendered as a `<kbd>` chip.
 *
 * `label` and `hint` are both optional, but at least one should be supplied or
 * the tooltip would render empty. `children` is rendered with `asChild`, so the
 * trigger must be a single focusable element (a `Link`, a `Button`, …).
 */
export interface GuidedTooltipProps {
  /** Short name — supply when the surrounding chrome hides it. */
  label?: React.ReactNode;
  /** One-line explanation of what the control does. */
  hint?: React.ReactNode;
  /** Optional keyboard-shortcut hint rendered as a `<kbd>` chip. */
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** When false the trigger renders untouched (no tooltip layer at all). */
  enabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function GuidedTooltip({
  label,
  hint,
  shortcut,
  side = 'right',
  align = 'center',
  enabled = true,
  className,
  children,
}: GuidedTooltipProps) {
  // Nothing to say — render the trigger unchanged rather than an empty popup.
  if (!enabled || (!label && !hint && !shortcut)) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={cn('max-w-xs', className)}>
        <div className="flex flex-col gap-0.5">
          {label && <span className="font-medium">{label}</span>}
          {hint && (
            <span className={cn('text-xs text-muted-foreground', label && 'mt-0.5')}>{hint}</span>
          )}
          {shortcut && (
            <kbd className="mt-1 w-fit rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              {shortcut}
            </kbd>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
