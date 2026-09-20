import * as React from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"

interface PreviewCardProps {
  preview?: React.ReactNode
  children: React.ReactNode
  hoverPreview?: boolean
  tooltipDelay?: number
  className?: string
}

export function PreviewCard({
  preview,
  children,
  hoverPreview = false,
  tooltipDelay = 300,
  className,
}: PreviewCardProps) {
  if (!hoverPreview || !preview) {
    return (
      <Card className={cn("transition-all duration-200 hover:shadow-md", className)}>
        <CardContent className="p-4">{children}</CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider delayDuration={tooltipDelay}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={cn("transition-all duration-200 hover:shadow-md cursor-help", className)}>
            <CardContent className="p-4">{children}</CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-sm">
          {preview}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface ConfigPreviewProps {
  config: Record<string, unknown>
  onEdit?: () => void
  onReset?: () => void
  title?: string
  showEditButton?: boolean
  showResetButton?: boolean
  className?: string
}

export function ConfigPreview({
  config,
  onEdit,
  onReset,
  title = "Configuration Preview",
  showEditButton = true,
  showResetButton = false,
  className,
}: ConfigPreviewProps) {
  return (
    <Card className={cn("w-full max-w-md", className)}>
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-sm">{title}</h3>
        <div className="flex gap-2">
          {showResetButton && onReset && (
            <button
              onClick={onReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
          {showEditButton && onEdit && (
            <button
              onClick={onEdit}
              className="text-xs text-primary hover:underline transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>
      <CardContent className="p-4 max-h-64 overflow-auto">
        <pre className="text-xs font-mono bg-muted/50 rounded p-3 overflow-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      </CardContent>
    </Card>
  )
}

interface EditConfigModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  initialConfig: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
  onSave: () => void
  children: (config: Record<string, unknown>, updateConfig: (key: string, value: unknown) => void) => React.ReactNode
}

export function EditConfigModal({
  isOpen,
  onClose,
  title,
  initialConfig,
  onChange,
  onSave,
  children,
}: EditConfigModalProps) {
  const [config, setConfig] = React.useState<Record<string, unknown>>(initialConfig)
  const [originalConfig, setOriginalConfig] = React.useState<Record<string, unknown>>(initialConfig)
  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig)

  React.useEffect(() => {
    setConfig(initialConfig)
    setOriginalConfig(initialConfig)
  }, [initialConfig, isOpen])

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    onChange({ ...config, [key]: value })
  }

  const resetConfig = () => {
    setConfig(initialConfig)
    onChange(initialConfig)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-4">{children(config, updateConfig)}</div>
        <DialogFooter className="gap-2">
          {hasChanges && (
            <button
              onClick={resetConfig}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <Button onClick={onSave} disabled={!hasChanges}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
