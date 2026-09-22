import { Icon } from '@/components/Common/Iconify/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from "react-i18next";
import { RootStore } from "@/store";
import { PlanIncStore } from "@/store/planincStore";

interface TagSelectorProps {
  selectedTag: string | null;
  onSelectionChange: (key: string) => void;
  variant?: "bordered" | "flat" | "faded" | "underlined";
  className?: string;
}

export default function TagSelector({
  selectedTag,
  onSelectionChange,
  variant = "bordered",
  className = "max-w-full"
}: TagSelectorProps) {
  const { t } = useTranslation();
  const planincStore = RootStore.Get(PlanIncStore);
  const tags = planincStore.tagList.value?.falttenTags || [];
  const selected = tags.find(t => String(t.id) === String(selectedTag));

  return (
    <Select
      value={selectedTag ?? undefined}
      onValueChange={(key) => onSelectionChange(key as string)}
    >
      <SelectTrigger className={className}>
        {selected?.icon ? (
          <div>{selected.icon}</div>
        ) : (
          <Icon icon="mingcute:hashtag-line" width="20" height="20" />
        )}
        <SelectValue placeholder={t('select-tags')} />
      </SelectTrigger>
      <SelectContent>
        {tags.map((tag: any) => (
          <SelectItem key={tag.id} value={String(tag.id)}>
            <div className="flex gap-2 items-center">
              {tag.icon ? (
                <div>{tag.icon}</div>
              ) : (
                <Icon icon="mingcute:hashtag-line" width="20" height="20" />
              )}
              <span className="text-small">{tag.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
