import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CustomCheckboxProps {
  children?: React.ReactNode;
  label?: React.ReactNode;
  checked?: boolean;
  isSelected?: boolean;
  value?: string;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export const CustomCheckbox = ({
  children,
  label,
  checked,
  isSelected,
  value,
  defaultChecked,
  onChange,
  onCheckedChange,
  className,
  disabled,
}: CustomCheckboxProps) => {
  const selected = checked ?? isSelected ?? defaultChecked ?? false;
  const content = children ?? label ?? (selected ? "Enabled" : "Disabled");

  const handleCheckedChange = (next: boolean | "indeterminate") => {
    const value = next === true;
    onChange?.(value);
    onCheckedChange?.(value);
  };

  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={handleCheckedChange}
        value={value}
        disabled={disabled}
        className="sr-only peer"
      />
      <Badge
        variant={selected ? "default" : "secondary"}
        className={cn(
          "border px-2.5 py-0.5 transition-colors hover:bg-primary/20",
          selected
            ? "border-primary bg-primary hover:bg-primary"
            : "border-border hover:border-primary"
        )}
      >
        {content}
      </Badge>
    </label>
  );
}
