/**
 * tokens-ignore-file: Migration helpers contain color mapping data that
 * translates between HeroUI color names and shadcn/ui semantic colors.
 * This is reference data, not design decisions.
 */
import { cn } from "./utils"

// Migration helper types
export type HeroUIVariant = "solid" | "bordered" | "light" | "flat" | "ghost"
export type ShadcnVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"

// Convert HeroUI button variants to shadcn/ui variants
export function mapButtonVariant(variant: HeroUIVariant): ShadcnVariant {
  switch (variant) {
    case "solid":
      return "default"
    case "bordered":
      return "outline"
    case "light":
      return "secondary"
    case "flat":
      return "ghost"
    case "ghost":
      return "ghost"
    default:
      return "default"
  }
}

// Convert HeroUI color to shadcn/ui semantic colors
export function mapColor(color: string): string {
  const colorMap: Record<string, string> = {
    primary: "default",
    none: "default",
    default: "default",
    success: "success",
    warning: "warning",
    danger: "destructive",
    error: "destructive",
    info: "info",
  }
  return colorMap[color.toLowerCase()] || "default"
}

// Migration status indicator component
interface MigrationBadgeProps {
  component: string
  status: "migrated" | "partial" | "pending" | "deprecated"
  href?: string
}

export function MigrationBadge({ component, status, href }: MigrationBadgeProps) {
  const statusColors = {
    migrated: "bg-green-100 text-green-800 border-green-200",
    partial: "bg-amber-100 text-amber-800 border-amber-200",
    pending: "bg-gray-100 text-gray-800 border-gray-200",
    deprecated: "bg-red-100 text-red-800 border-red-200",
  }

  const statusLabels = {
    migrated: "Migrated",
    partial: "Partial",
    pending: "Pending",
    deprecated: "Deprecated",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        statusColors[status]
      )}
    >
      {statusLabels[status]}
    </span>
  )
}

// Migration guide component
interface MigrationGuideProps {
  component: string
  oldImport: string
  newImport: string
  example?: React.ReactNode
  notes?: string[]
}

export function MigrationGuide({ component, oldImport, newImport, example, notes }: MigrationGuideProps) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-4 bg-card">
      <h3 className="font-semibold text-sm">{component}</h3>

      <div className="space-y-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-red-500 line-through">{oldImport}</span>
          <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="text-green-500">{newImport}</span>
        </div>
      </div>

      {example && (
        <div className="bg-muted/50 rounded p-3 border">
          {example}
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className="space-y-1">
          {notes.map((note, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Quick migration utilities
export const migrationUtils = {
  // Map HeroUI color prop to shadcn/ui
  mapColor,

  // Map HeroUI variant to shadcn/ui
  mapButtonVariant,

  // Create cn with additional classes (useful during migration)
  cn: (base: string, additional: string) => cn(base, additional),

  // Check if component is migrated
  isMigrated: (componentName: string): boolean => {
    const migratedComponents = [
      "button",
      "card",
      "dialog",
      "input",
      "textarea",
      "select",
      "badge",
      "dropdown-menu",
      "popover",
      "tooltip",
      "tabs",
    ]
    return migratedComponents.includes(componentName.toLowerCase())
  },

  // Get migration status
  getMigrationStatus: (componentName: string): MigrationBadgeProps["status"] => {
    const migrated = ["button", "card", "dialog", "input", "textarea", "select", "badge"]
    const partial = ["dropdown-menu", "popover", "tooltip", "tabs"]
    const pending = ["switch", "checkbox", "radio-group", "slider", "progress"]

    if (migrated.includes(componentName.toLowerCase())) return "migrated"
    if (partial.includes(componentName.toLowerCase())) return "partial"
    if (pending.includes(componentName.toLowerCase())) return "pending"
    return "pending"
  },
}
