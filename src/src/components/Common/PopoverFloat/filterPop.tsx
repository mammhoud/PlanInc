import { Icon } from '@/components/Common/Iconify/icons';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { RootStore } from "@/store";
import { PlanIncStore } from "@/store/planincStore";
import { useState } from "react";
import dayjs from "@/lib/dayjs";
import TagSelector from "@/components/Common/TagSelector";

export default function FilterPop() {
  const { t } = useTranslation();
  const planincStore = RootStore.Get(PlanIncStore);

  const [isOpen, setIsOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{
    start: string | null;
    end: string | null;
  }>({
    start: null,
    end: null
  });
  const [tagStatus, setTagStatus] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);

  const conditions = [
    { label: t('has-link'), value: 'hasLink' },
    { label: t('has-file'), value: 'hasFile' },
    { label: t('public'), value: 'isShare' },
    { label: t('has-todo'), value: 'hasTodo' },
  ];

  const handleApplyFilter = () => {
    planincStore.noteListFilterConfig = {
      ...planincStore.noteListFilterConfig,
      startDate: dateRange.start ? new Date(dateRange.start.toString()) : null,
      endDate: dateRange.end ? new Date(dateRange.end.toString()) : null,
      tagId: selectedTag ? Number(selectedTag) : null,
      withoutTag: tagStatus === 'without',
      withFile: selectedCondition === 'hasFile',
      withLink: selectedCondition === 'hasLink',
      isShare: selectedCondition === 'isShare' ? true : false,
      hasTodo: selectedCondition === 'hasTodo',
      isArchived: null
    };
    planincStore.noteList.resetAndCall({});
    setIsOpen(false);
  };

  const handleReset = () => {
    setDateRange({ start: null, end: null });
    setTagStatus("all");
    setSelectedTag(null);
    setSelectedCondition(null);

    planincStore.noteListFilterConfig = {
      ...planincStore.noteListFilterConfig,
      startDate: null,
      endDate: null,
      tagId: null,
      withoutTag: false,
      withFile: false,
      withLink: false,
      isArchived: false,
      isShare: null,
      hasTodo: false
    };
    planincStore.noteList.resetAndCall({});
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost">
          <Icon className="cursor-pointer text-default-600" icon="tabler:filter-bolt" width="24" height="24" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start">
        <div className="p-4 flex flex-col gap-4 min-w-[300px]">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <Icon icon="solar:sort-by-time-broken" width="24" height="24" />
              {t('time-range')}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex items-center gap-2 bg-default-100 rounded-lg p-3 cursor-pointer">
                  <Icon icon="solar:calendar-bold" className="text-default-500" width="20" height="20" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {dateRange.start ? dayjs(new Date(dateRange.start.toString())).format('YYYY-MM-DD') : t('start-date')}
                    </span>
                    <span className="text-default-500">{t('to')}</span>
                    <span className="text-sm">
                      {dateRange.end ? dayjs(new Date(dateRange.end.toString())).format('YYYY-MM-DD') : t('end-date')}
                    </span>
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="p-0 bg-transparent border-none shadow-none w-auto">
                <div className="flex flex-col gap-2 bg-background border rounded-md shadow-md p-3">
                  <Input
                    type="date"
                    aria-label={t('start-date')}
                    value={dateRange.start ?? ''}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value || null })}
                  />
                  <Input
                    type="date"
                    aria-label={t('end-date')}
                    value={dateRange.end ?? ''}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value || null })}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <Icon icon="fluent:tag-search-24-regular" width="20" height="20" />
              {t('tag-status')}
            </div>
            <Select
              value={tagStatus}
              onValueChange={setTagStatus}
            >
              <SelectTrigger className="w-full h-12">
                <SelectValue placeholder={t('select-tag-status')} />
              </SelectTrigger>
              <SelectContent>
                {[
                  { key: 'all', label: t('all'), icon: <Icon icon="solar:notes-bold" width="20" height="20" /> },
                  { key: 'with', label: t('with-tags'), icon: <Icon icon="lucide:tags" width="20" height="20" /> },
                  { key: 'without', label: t('without-tags'), icon: <Icon icon="majesticons:tag-off-line" width="20" height="20" /> }
                ].map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    <div className="flex gap-2 items-center">
                      {item.icon}
                      <span className="text-small">{item.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tagStatus === "with" && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <Icon icon="solar:tags-bold" width="20" height="20" />
                {t('select-tags')}
              </div>
              
              <TagSelector
                selectedTag={selectedTag}
                onSelectionChange={(key) => setSelectedTag(key)}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <Icon icon="material-symbols:conditions" width="20" height="20" />
              {t('additional-conditions')}
            </div>
            <div className="flex flex-col gap-2" role="radiogroup">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="filter-condition"
                  value=""
                  checked={(selectedCondition || "") === ""}
                  onChange={(e) => setSelectedCondition(e.target.value)}
                  className="h-4 w-4"
                />
                {t('no-condition')}
              </label>
              {conditions.map(condition => (
                <label key={condition.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="filter-condition"
                    value={condition.value}
                    checked={selectedCondition === condition.value}
                    onChange={(e) => setSelectedCondition(e.target.value)}
                    className="h-4 w-4"
                  />
                  {condition.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleApplyFilter}
              className="flex-1"
            >
              <Icon icon="solar:filter-bold" width="20" height="20" />
              {t('apply-filter')}
            </Button>
            <Button
              variant="ghost"
              onClick={handleReset}
              className="flex-1"
            >
              <Icon icon="fluent:arrow-reset-20-filled" width="20" height="20" />
              {t('reset')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
} 