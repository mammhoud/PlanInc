import { observer } from "mobx-react-lite";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from '@/components/Common/Iconify/icons';
import { useState } from "react";

export const PasswordInput = observer(({
  value,
  onChange,
  onBlur,
  label,
  placeholder,
  className
}: {
  value: string,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void,
  label?: string,
  placeholder?: string,
  className?: string
}) => {
  const [isConfirmVisible, setIsConfirmVisible] = useState(false)
  const toggleConfirmVisibility = () => setIsConfirmVisible(!isConfirmVisible)
  return <div className={className}>
    {label && <Label className="mb-1.5 block">{label} <span className="text-destructive">*</span></Label>}
    <div className="relative">
      <Input
        name="confirmPassword"
        placeholder={placeholder}
        type={isConfirmVisible ? "text" : "password"}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        required
        className="pr-10"
      />
      <button type="button" onClick={toggleConfirmVisibility} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {isConfirmVisible ? (
          <Icon
            className="pointer-events-none text-2xl text-default-400"
            icon="solar:eye-closed-linear"
          />
        ) : (
          <Icon
            className="pointer-events-none text-2xl text-default-400"
            icon="solar:eye-bold"
          />
        )}
      </button>
    </div>
  </div>
})
