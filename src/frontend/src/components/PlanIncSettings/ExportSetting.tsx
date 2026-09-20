import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RootStore } from "@/store";
import { PromiseCall } from "@/store/standard/PromiseState";
import dayjs from "@/lib/dayjs";
import { api } from "@/lib/trpc";
import { Item } from "./Item";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { helper } from "@/lib/helper";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from "@/components/Common/CollapsibleCard";
import { getPlanIncEndpoint } from "@/lib/planincEndpoint";
import { downloadFromLink } from "@/lib/tauriHelper";

export const ExportSetting = observer(() => {
  const { t } = useTranslation();
  const [exportFormat, setExportFormat] = useState("markdown");

  const [dateRange, setDateRange] = useState<{
    start: string | null;
    end: string | null;
  }>({
    start: null,
    end: null
  });

  const formatOptions = [
    { label: "Markdown", value: "markdown" },
    { label: "JSON", value: "json" },
    { label: "CSV", value: "csv" }
  ];


  const handleExport = async () => {
    RootStore.Get(ToastPlugin).loading(t('exporting'), { id: 'exporting' })
    const exportParams: any = {
      baseURL: window.location.origin,
      format: exportFormat as 'markdown' | 'csv' | 'json'
    };

    if (dateRange.start && dateRange.end) {
      exportParams.startDate = new Date(dateRange.start);
      exportParams.endDate = new Date(dateRange.end);
    }
    try {
      const res = await PromiseCall(api.task.exportMarkdown.mutate(exportParams));
      RootStore.Get(ToastPlugin).dismiss('exporting')
      if (res?.downloadUrl) {
        downloadFromLink(getPlanIncEndpoint(res.downloadUrl));
      }
    } catch (error) {
      RootStore.Get(ToastPlugin).error(error.message)
    }
  };

  return (
    <CollapsibleCard
      icon="tabler:file-export"
      title={t('export')}
    >
      <Card className="flex flex-col p-4 bg-background">
        <CardContent className="flex flex-col p-0 gap-2">
          <Item
            leftContent={<>{t('export-format')}</>}
            rightContent={
              <Select
                value={exportFormat}
                onValueChange={setExportFormat}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{t(item.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          <Item
            leftContent={<>{t('time-range')}</>}
            rightContent={
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {dateRange.start && dateRange.end ? (
                    `${dayjs(new Date(dateRange.start)).format('YYYY-MM-DD')} ~ ${dayjs(new Date(dateRange.end)).format('YYYY-MM-DD')}`
                  ) : t('all')}
                </span>
                <Input
                  type="date"
                  aria-label={t('time-range')}
                  className="w-auto"
                  value={dateRange.start ?? ''}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value || null }))}
                />
                <span className="text-sm text-muted-foreground">~</span>
                <Input
                  type="date"
                  aria-label={t('time-range')}
                  className="w-auto"
                  value={dateRange.end ?? ''}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value || null }))}
                />
                {(dateRange.start || dateRange.end) && (
                  <Button variant="ghost" size="sm" onClick={() => setDateRange({ start: null, end: null })}>
                    {t('clear')}
                  </Button>
                )}
              </div>
            }
          />


          <div className="flex justify-end">
            <Button
              className="mt-4"
              onClick={handleExport}
            >
              <Icon icon="system-uicons:arrow-top-right" width="24" height="24" />
              {t('export')}
            </Button>
          </div>

        </CardContent>
      </Card>
    </CollapsibleCard>
  );
});
