import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface RichTooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  placement?: "top" | "right" | "bottom" | "left"
  delayDuration?: number
  className?: string
  contentClassName?: string
}

export function RichTooltip({
  content,
  children,
  placement = "top",
  delayDuration = 300,
  className,
  contentClassName,
}: RichTooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={placement} className={cn("max-w-md", contentClassName)}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface HoverPreviewProps {
  preview: React.ReactNode
  children: React.ReactNode
  showPreview?: boolean
  placement?: "top" | "right" | "bottom" | "left"
  className?: string
}

export function HoverPreview({
  preview,
  children,
  showPreview = true,
  placement = "top",
  className,
}: HoverPreviewProps) {
  if (!showPreview) {
    return <>{children}</>
  }

  return (
    <RichTooltip
      content={preview}
      placement={placement}
      className={className}
    >
      {children}
    </RichTooltip>
  )
}

interface ConfigTooltipProps {
  configKey: string
  configValue: unknown
  configDescription?: string
  children: React.ReactNode
  showValue?: boolean
  formatValue?: (value: unknown) => React.ReactNode
  className?: string
}

export function ConfigTooltip({
  configKey,
  configValue,
  configDescription,
  children,
  showValue = true,
  formatValue,
  className,
}: ConfigTooltipProps) {
  const content = (
    <div className="space-y-2">
      <div className="font-semibold text-sm">{configKey}</div>
      {configDescription && (
        <div className="text-xs text-muted-foreground">{configDescription}</div>
      )}
      {showValue && (
        <div className="text-xs font-mono bg-muted/50 rounded p-2">
          {formatValue ? formatValue(configValue) : String(configValue)}
        </div>
      )}
    </div>
  )

  return (
    <RichTooltip content={content} className={className}>
      {children}
    </RichTooltip>
  )
}
