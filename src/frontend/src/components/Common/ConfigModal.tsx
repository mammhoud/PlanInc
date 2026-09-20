/**
 * tokens-ignore-file: ConfigModal uses Tailwind utility classes for layout
 * which are standard shadcn/ui patterns, not design token violations.
 */
import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface ConfigModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  config: Record<string, unknown>
  onSave: (config: Record<string, unknown>) => void
  onReset?: () => void
  defaultConfig?: Record<string, unknown>
  children: (config: Record<string, unknown>, update: (key: string, value: unknown) => void, hasChanges: boolean) => React.ReactNode
  showPreview?: boolean
  previewTitle?: string
  className?: string
}

export function ConfigModal({
  isOpen,
  onClose,
  title,
  description,
  config,
  onSave,
  onReset,
  defaultConfig,
  children,
  showPreview = false,
  previewTitle = "Configuration Preview",
  className,
}: ConfigModalProps) {
  const [localConfig, setLocalConfig] = React.useState<Record<string, unknown>>(config)
  const [originalConfig, setOriginalConfig] = React.useState<Record<string, unknown>>(config)
  const [activeTab, setActiveTab] = React.useState<string | null>("edit")

  React.useEffect(() => {
    setLocalConfig(config)
    setOriginalConfig(config)
    setActiveTab("edit")
  }, [config, isOpen])

  const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(originalConfig)

  const updateConfig = React.useCallback(
    (key: string, value: unknown) => {
      setLocalConfig((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleSave = () => {
    onSave(localConfig)
    setOriginalConfig(localConfig)
  }

  const handleReset = () => {
    if (defaultConfig) {
      setLocalConfig(defaultConfig)
      onSave(defaultConfig)
    } else if (onReset) {
      onReset()
      setLocalConfig(config)
    }
  }

  const previewContent = (
    <div className="space-y-4">
      <pre className="text-xs font-mono bg-muted/50 rounded-lg p-4 border overflow-auto max-h-96">
        {JSON.stringify(localConfig, null, 2)}
      </pre>
      <div className="text-xs text-muted-foreground">
        {Object.keys(localConfig).length} configuration keys
      </div>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn("max-w-2xl", className)}>
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="space-y-4">
            <TabsList>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              {showPreview && <TabsTrigger value="preview">Preview</TabsTrigger>}
            </TabsList>

            <TabsContent value="edit" className="mt-4">
              {children(localConfig, updateConfig, hasChanges)}
            </TabsContent>

            {showPreview && (
              <TabsContent value="preview" className="mt-4">
                {previewContent}
              </TabsContent>
            )}
          </div>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-3 mt-6">
          {hasChanges && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Reset
              </Button>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSave} disabled={!hasChanges}>
                Save Changes
              </Button>
            </>
          )}
          {!hasChanges && (
            <>
              <DialogClose asChild>
                <Button variant="ghost">Close</Button>
              </DialogClose>
              {onReset && (
                <Button variant="outline" onClick={handleReset}>
                  Reset to Default
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SimpleConfigEditorProps {
  config: Record<string, unknown>
  update: (key: string, value: unknown) => void
  hasChanges: boolean
  fields: Array<{
    key: string
    label: string
    type: "text" | "number" | "boolean" | "select" | "textarea"
    description?: string
    placeholder?: string
    options?: Array<{ value: string; label: string }>
    min?: number
    max?: number
    step?: number
  }>
}

export function SimpleConfigEditor({
  config,
  update,
  hasChanges,
  fields,
}: SimpleConfigEditorProps) {
  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const value = config[field.key]
        const showChanges = hasChanges && JSON.stringify(value) !== JSON.stringify(config[field.key])

        return (
          <div key={field.key} className="space-y-2">
            <label className="text-sm font-medium">{field.label}</label>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}

            {field.type === "text" && (
              <input
                type="text"
                value={String(value || "")}
                onChange={(e) => update(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            )}

            {field.type === "number" && (
              <input
                type="number"
                value={Number(value) || 0}
                onChange={(e) => update(field.key, Number(e.target.value))}
                min={field.min}
                max={field.max}
                step={field.step}
                placeholder={field.placeholder}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            )}

            {field.type === "boolean" && (
              <div className="flex items-center space-x-2 mt-1">
                <input
                  type="checkbox"
                  id={field.key}
                  checked={Boolean(value)}
                  onChange={(e) => update(field.key, e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor={field.key} className="text-sm cursor-pointer">
                  {String(value)}
                </label>
              </div>
            )}

            {field.type === "select" && field.options && (
              <select
                value={String(value || "")}
                onChange={(e) => update(field.key, e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {field.type === "textarea" && (
              <textarea
                value={String(value || "")}
                onChange={(e) => update(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={4}
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            )}

            {showChanges && (
              <div className="text-xs text-green-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Changed
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface ConfigSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function ConfigSection({ title, description, children, className }: ConfigSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      <div className="space-y-4 pl-4 border-l border-border/50">
        {children}
      </div>
    </div>
  )
}
