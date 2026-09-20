import * as React from "react"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { HoverPreview, RichTooltip } from "@/components/ui/tooltip-rich"

interface InteractiveTooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  placement?: "top" | "right" | "bottom" | "left"
  delayDuration?: number
  interactive?: boolean
  className?: string
}

export function InteractiveTooltip({
  content,
  children,
  placement = "top",
  delayDuration = 300,
  interactive = false,
  className,
}: InteractiveTooltipProps) {
  if (interactive) {
    return (
      <RichTooltip
        content={content}
        placement={placement}
        delayDuration={delayDuration}
        className={className}
      >
        {children}
      </RichTooltip>
    )
  }

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={placement} className={cn("max-w-md", className)}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface PreviewOnHoverProps {
  preview: React.ReactNode
  children: React.ReactNode
  showPreview?: boolean
  placement?: "top" | "right" | "bottom" | "left"
  className?: string
}

export function PreviewOnHover({
  preview,
  children,
  showPreview = true,
  placement = "top",
  className,
}: PreviewOnHoverProps) {
  return (
    <HoverPreview
      preview={preview}
      showPreview={showPreview}
      placement={placement}
      className={className}
    >
      {children}
    </HoverPreview>
  )
}

interface ConfigTooltipProps {
  configKey: string
  configValue: unknown
  description?: string
  children: React.ReactNode
  showValue?: boolean
  formatValue?: (value: unknown) => React.ReactNode
  className?: string
}

export function ConfigTooltip({
  configKey,
  configValue,
  description,
  children,
  showValue = true,
  formatValue,
  className,
}: ConfigTooltipProps) {
  const content = (
    <div className="space-y-2">
      <div className="font-semibold text-sm text-foreground">{configKey}</div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {showValue && (
        <div className="text-xs font-mono bg-muted/50 rounded-lg p-2 border">
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

interface FieldTooltipProps {
  label: string
  description: string
  children: React.ReactNode
  example?: string
  className?: string
}

export function FieldTooltip({
  label,
  description,
  children,
  example,
  className,
}: FieldTooltipProps) {
  const content = (
    <div className="space-y-2">
      <div className="font-semibold text-sm">{label}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {example && (
        <div className="text-xs font-mono bg-muted/50 rounded p-2 border mt-2">
          <span className="text-muted-foreground">Example:</span> {example}
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
