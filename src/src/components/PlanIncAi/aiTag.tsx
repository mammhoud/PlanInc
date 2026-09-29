import React from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

interface AiTagProps {
  tags: string[];
  defaultSelected?: string[];
  onSelect: (selected: string[], isInsertBefore: boolean) => void;
  confirmText?: string;
  label?: string;
}

export const AiTag: React.FC<AiTagProps> = ({
  tags,
  defaultSelected = [],
  onSelect,
}) => {
  const [selected, setSelected] = React.useState<string[]>(defaultSelected);
  const [isInsertBefore, setIsInsertBefore] = React.useState(false);
  const { t } = useTranslation()
  const handleConfirm = () => {
    onSelect(selected, isInsertBefore);
  };

  const handleSelectAll = () => {
    setSelected(tags);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => {
          const checked = selected.includes(tag);
          return (
            <Label
              key={tag}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(next) =>
                  setSelected(next ? [...selected, tag] : selected.filter((item) => item !== tag))
                }
              />
              {tag}
            </Label>
          );
        })}
      </div>
      <div className='flex mt-2 gap-2 items-center'>
        <div className='flex flex-1 items-center gap-4' role="radiogroup" aria-label={t('insert-position')}>
          <Label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="ai-tag-insert-position"
              value="insert-before"
              checked={isInsertBefore}
              onChange={() => setIsInsertBefore(true)}
              className="h-4 w-4 accent-primary"
            />
            {t('insert-before')}
          </Label>
          <Label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="ai-tag-insert-position"
              value="insert-after"
              checked={!isInsertBefore}
              onChange={() => setIsInsertBefore(false)}
              className="h-4 w-4 accent-primary"
            />
            {t('insert-after')}
          </Label>
        </div>
        <Button variant="outline" onClick={handleSelectAll}>{t('select-all')}</Button>
        <Button
          onClick={handleConfirm}
          className="w-fit ml-auto"
        >
          {t('confirm')}
        </Button>
      </div>
    </div>
  );
};