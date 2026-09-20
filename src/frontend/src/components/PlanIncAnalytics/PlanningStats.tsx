import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/Common/Iconify/icons';

export interface PlanningStatsValue {
  label: string;
  value: number | string;
  icon: string;
  accent: string;
}

export function PlanningStats({ items }: { items: PlanningStatsValue[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="border border-divider/60 bg-background/80 shadow-sm">
          <CardContent className="gap-2 p-4">
            <div className="flex items-center justify-between gap-2 text-foreground-500">
              <span className="text-xs font-semibold uppercase tracking-[0.12em]">{item.label}</span>
              <Icon icon={item.icon} width="18" height="18" className={item.accent} />
            </div>
            <strong className="text-2xl font-semibold tracking-tight">{item.value}</strong>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
