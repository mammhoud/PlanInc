# Unified Development Organization Plan — PlanInc & Formint

## Status: Draft · Version: 4.2 · Date: 2026-09-20

This document establishes a unified file organization for both PlanInc and Formint within the Structa Cloud monorepo at `/home/`. No symlinks are used. Shared libraries and extraction plans are handled in a separate document. This plan focuses on directory structure, product organization, commands, and developer workflow.

### shadcn/ui Migration (v4.2)

As of v4.2, the project has migrated from HeroUI to shadcn/ui for component primitives. FlyonUI has been removed as a dependency.

**Key changes:**
- Removed `flyonui` from dependencies
- Added shadcn/ui components in `src/frontend/src/components/ui/`
- Added Radix UI primitives for accessibility
- Added `lucide-react` for icons
- Updated `globals.css` with shadcn/ui theme variables
- Added responsive 8-tier design system
- Added interactive tooltip and config modal components

---

## 1. Current State Summary

### PlanInc (to be integrated into monorepo)
- **Current location:** `src/` (in monorepo)
- **Stack:** React 18 + Vite + TailwindCSS v4 + shadcn/ui (migrated from HeroUI) + MobX + Tauri v2 + Express/tRPC + SurrealDB
- **Package manager:** Bun
- **Key directories:** `src/frontend/`, `src/server/`, `src/frontend/src-tauri/`, `src/frontend/tauri-plugin-planinc/`, `runtime/`, `brandkit/`, `docs/`
- **UI Framework:** shadcn/ui with Radix primitives (migrated from HeroUI)

---

## 2. UI Component Architecture

### shadcn/ui Components (in `src/frontend/src/components/ui/`)

| Component | File | Status |
|-----------|------|--------|
| Button | `button.tsx` | ✅ Migrated |
| Card | `card.tsx` | ✅ Migrated |
| Dialog | `dialog.tsx` | ✅ Migrated |
| Input | `input.tsx` | ✅ Migrated |
| Textarea | `textarea.tsx` | ✅ Migrated |
| Select | `select.tsx` | ✅ Migrated |
| Badge | `badge.tsx` | ✅ Migrated |
| Dropdown Menu | `dropdown-menu.tsx` | ✅ Migrated |
| Popover | `popover.tsx` | ✅ Migrated |
| Tooltip | `tooltip.tsx` | ✅ Migrated |
| Tabs | `tabs.tsx` | ✅ Migrated |
| Preview Card | `preview-card.tsx` | ✅ New |
| Rich Tooltip | `tooltip-rich.tsx` | ✅ New |

### Interactive Components (in `src/frontend/src/components/Common/`)

| Component | File | Description |
|-----------|------|-------------|
| Interactive Tooltip | `InteractiveTooltip.tsx` | Rich tooltips with preview content |
| Config Modal | `ConfigModal.tsx` | Configuration editor with preview tabs |
| Simple Config Editor | (in ConfigModal) | Form-based config editing |

### Utilities (in `src/frontend/src/lib/`)

| Utility | File | Description |
|---------|------|-------------|
| cn() helper | `utils.ts` | Class merging with clsx + tailwind-merge |
| Migration helpers | `migration-helpers.ts` | HeroUI to shadcn/ui migration utilities |

---

## 3. Responsive Design System

### 8-Tier Responsive Scale

| Tier | Breakpoint | Data Attribute |
|------|------------|----------------|
| xs | 360px | `data-tier="xs"` |
| sm | 480px | `data-tier="sm"` |
| md | 768px | `data-tier="md"` |
| lg | 1024px | `data-tier="lg"` |
| xl | 1280px | `data-tier="xl"` |
| 2xl | 1600px | `data-tier="2xl"` |
| 3xl | 1920px | `data-tier="3xl"` |
| 4xl | 2560px | `data-tier="4xl"` |

### Responsive Border-Radius

All border-radius values scale responsively:

```css
/* From tokens.css */
--radius: 0.375rem (xs) → 0.8rem (4xl)
--pi-radius-sm: 2px → 9px
--pi-radius-md: 4px → 12px
--pi-radius-lg: 6px → 14px
--pi-radius-xl: 8px → 20px
--pi-radius-2xl: 12px → 24px
--pi-radius-3xl: 16px → 28px
```

### Responsive Motion Curves

```css
--motion-fast: 150ms (xs) → 250ms (2xl+)
--motion-base: 250ms (xs) → 500ms (2xl+)
--curve-smooth: cubic-bezier(0.16, 1, 0.3, 1) (from sm+)
--curve-sharp: cubic-bezier(0.4, 0, 0.2, 1)
--curve-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)
--curve-elastic: cubic-bezier(0.68, -0.55, 0.265, 1.55)
```

### Responsive Component Edge Attributes

```css
--card-radius: var(--pi-radius-md) → var(--pi-radius-3xl)
--modal-radius: var(--pi-radius-lg) → calc(var(--pi-radius-3xl) * 1.6)
--sheet-radius: var(--pi-radius-xl) → calc(var(--radius-3xl) * 1.6)
--button-radius: var(--pi-radius-sm) → var(--pi-radius-lg)
--input-radius: var(--pi-radius-sm) → var(--pi-radius-md)
```

---

## 4. Package Dependencies

### Updated Dependencies (v4.2)

**Removed:**
- `flyonui` (both dependencies and devDependencies)

**Added:**
- `@radix-ui/react-accordion`
- `@radix-ui/react-avatar`
- `@radix-ui/react-checkbox`
- `@radix-ui/react-checkbox-group`
- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-label`
- `@radix-ui/react-popover`
- `@radix-ui/react-progress`
- `@radix-ui/react-radio-group`
- `@radix-ui/react-scroll-area`
- `@radix-ui/react-select`
- `@radix-ui/react-separator`
- `@radix-ui/react-slider`
- `@radix-ui/react-slot`
- `@radix-ui/react-switch`
- `@radix-ui/react-tabs`
- `@radix-ui/react-tooltip`
- `class-variance-authority`
- `lucide-react`

---

## 5. Project Structure

```
src/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── textarea.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── popover.tsx
│   │   │   │   ├── tooltip.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── preview-card.tsx
│   │   │   │   └── tooltip-rich.tsx
│   │   │   ├── Common/          # PlanInc common components
│   │   │   │   ├── InteractiveTooltip.tsx
│   │   │   │   ├── ConfigModal.tsx
│   │   │   │   └── ...
│   │   │   ├── Layout/          # Layout components
│   │   │   ├── Planinc*/        # Feature components
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── utils.ts         # cn() helper
│   │   │   ├── migration-helpers.ts
│   │   │   └── ...
│   │   ├── store/               # MobX stores
│   │   ├── pages/               # Page components
│   │   ├── platform/            # Platform detection
│   │   └── styles/
│   │       ├── globals.css      # shadcn/ui theme + responsive
│   │       └── tokens.css       # Design tokens
│   ├── src-tauri/
│   └── tauri-plugin-planinc/
├── server/
├── shared/
└── planinc-types/
```

---

## 6. Migration Checklist (Completed)

### Phase 1: Core Components ✅
- [x] Create `components/ui/button.tsx`
- [x] Create `components/ui/card.tsx`
- [x] Create `components/ui/dialog.tsx`
- [x] Create `components/ui/input.tsx`
- [x] Create `components/ui/textarea.tsx`
- [x] Create `components/ui/select.tsx`
- [x] Create `components/ui/badge.tsx`
- [x] Create `components/ui/dropdown-menu.tsx`
- [x] Create `components/ui/popover.tsx`
- [x] Create `components/ui/tooltip.tsx`
- [x] Create `components/ui/tabs.tsx`
- [x] Create `lib/utils.ts` with cn() helper

### Phase 2: Interactive Features ✅
- [x] Create `components/Common/InteractiveTooltip.tsx`
- [x] Create `components/Common/ConfigModal.tsx`
- [x] Create `components/ui/preview-card.tsx`
- [x] Create `components/ui/tooltip-rich.tsx`
- [x] Create `lib/migration-helpers.ts`

### Phase 3: Configuration ✅
- [x] Update `tailwind.config.js` for shadcn/ui
- [x] Update `globals.css` with shadcn/ui theme
- [x] Add responsive 8-tier design system
- [x] Update `package.json` dependencies
- [x] Remove FlyonUI

### Phase 4: Documentation ✅
- [x] Create `docs/shadcn-migration-guide.md`
- [x] Update `AGENTS.md` with new patterns
- [x] Update unified development plan

---

## 7. Usage Examples

### Basic Button
```tsx
import { Button } from "@/components/ui/button"

<Button>Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button disabled>Disabled</Button>
<Button loading>Loading</Button>
```

### Dialog with Form
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit Settings</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <Input placeholder="Setting value" />
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleSave}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Config Modal with Preview
```tsx
import { ConfigModal, SimpleConfigEditor } from "@/components/Common/ConfigModal"

<ConfigModal
  isOpen={open}
  onClose={() => setOpen(false)}
  title="AI Settings"
  config={aiConfig}
  onSave={setAiConfig}
  defaultConfig={defaultAiConfig}
  showPreview={true}
>
  {(config, update, hasChanges) => (
    <SimpleConfigEditor
      config={config}
      update={update}
      hasChanges={hasChanges}
      fields={[
        { key: "apiKey", label: "API Key", type: "text", placeholder: "sk-..." },
        { key: "model", label: "Model", type: "select", options: [...] },
        { key: "temperature", label: "Temperature", type: "number", min: 0, max: 2, step: 0.1 },
      ]}
    />
  )}
</ConfigModal>
```

### Rich Tooltip
```tsx
import { ConfigTooltip } from "@/components/ui/tooltip-rich"

<ConfigTooltip
  configKey="Temperature"
  configValue={0.7}
  description="Controls randomness in responses"
>
  <button>Hover for info</button>
</ConfigTooltip>
```

---

## 8. Future Enhancements

- [ ] Migrate remaining HeroUI components to shadcn/ui
- [ ] Add Form component with React Hook Form integration
- [ ] Add Command Palette (cmdk) for keyboard navigation
- [ ] Add Toast/Notification system
- [ ] Add Skeleton loading components
- [ ] Add ScrollArea for virtualized lists
- [ ] Add Progress components for async operations
