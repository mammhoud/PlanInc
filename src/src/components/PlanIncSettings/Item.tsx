import { Icon } from '@/components/Common/Iconify/icons';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";

type IProps = {
  leftContent?: any
  rightContent?: any
  type?: 'row' | 'col'
  hidden?: boolean
  className?: string
}


export const Item = observer(({ leftContent, rightContent, type = 'row', hidden = false, className }: IProps) => {
  if (hidden) return null
  if (type == 'col') {
    return <div className={`flex flex-col gap-1 py-2 min-w-0 pi-setting-row ${className ?? ''}`}>
      <div className="font-semibold min-w-0 break-words">{leftContent}</div>
      <div className="mt-1 w-full min-w-0">{rightContent}</div>
    </div>
  } else {
    // Responsive row: stacks vertically on narrow (<sm) screens so label and
    // control never overflow or overlap; side-by-side from sm up.
    return <div className={`flex flex-col gap-1.5 py-2 min-w-0 pi-setting-row sm:flex-row sm:items-center sm:gap-3 ${className ?? ''}`}>
      {!!leftContent && <div className={`min-w-0 break-words ${rightContent ? "font-semibold sm:flex-1" : 'w-full'}`}>{leftContent}</div>}
      {!!rightContent && <div className="min-w-0 sm:ml-auto sm:flex sm:justify-end [&>*]:min-w-0">{rightContent}</div>}
    </div>
  }
})


export const ItemWithTooltip = observer(({ content, toolTipContent }: { content: any, toolTipContent: any }) => {
  return <Tooltip>
    <TooltipTrigger asChild>
      <div className="flex items-center gap-2">
        {content}
        <Icon icon="proicons:info" width="18" height="18" />
      </div>
    </TooltipTrigger>
    <TooltipContent>
      <div className="max-w-[calc(100vw-3rem)] sm:max-w-[300px] flex flex-col gap-2 p-2 break-words">
        {toolTipContent}
      </div>
    </TooltipContent>
  </Tooltip>
})


interface SelectDropdownProps {
  value?: string
  placeholder?: string
  icon?: string
  options: Array<{
    key: string
    label: string
  }>
  onChange: (value: string) => void | Promise<void>
}
export const SelectDropdown = ({
  value,
  placeholder,
  icon,
  options,
  onChange
}: SelectDropdownProps) => {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className="max-w-full min-w-0"
        >
          {icon && <Icon icon={icon} width="20" height="20" />}
          <span className="truncate">{t(value as string) || placeholder}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Selection">
        {options.map(option => (
          <DropdownMenuItem key={option.key} onSelect={() => void onChange(option.key)}>{option.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
