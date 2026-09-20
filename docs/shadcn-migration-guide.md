# shadcn/ui Migration Guide

This document provides a comprehensive guide for migrating from HeroUI to shadcn/ui in PlanInc.

## Overview

We're migrating from HeroUI (`@heroui/react`) to shadcn/ui to:
- Own our component code (no runtime dependency lock-in)
- Use Radix UI primitives for better accessibility
- Adopt CSS variable-based theming (industry standard)
- Enable Tailwind v4 native integration
- Simplify the dependency tree (removing FlyonUI)

## Migration Status

| Component | Status | Notes |
|-----------|--------|-------|
| Button | ✅ Migrated | Full replacement with variants |
| Card | ✅ Migrated | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Dialog | ✅ Migrated | Full Radix Dialog implementation |
| Input | ✅ Migrated | Text input with all features |
| Textarea | ✅ Migrated | Text area with all features |
| Select | ✅ Migrated | Full Radix Select implementation |
| Badge | ✅ Migrated | With all variants |
| Dropdown Menu | ✅ Migrated | Full Radix DropdownMenu implementation |
| Popover | ✅ Migrated | Full Radix Popover implementation |
| Tooltip | ✅ Migrated | Full Radix Tooltip implementation |
| Tabs | ✅ Migrated | Full Radix Tabs implementation |
| Preview Card | ✅ New | Hover preview functionality |
| Config Modal | ✅ New | Configuration editing with preview |
| Rich Tooltip | ✅ New | Interactive tooltips with content |

## Installation

### Required Dependencies

```bash
# Core UI components (already in package.json)
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install @radix-ui/react-popover @radix-ui/react-tooltip
npm install @radix-ui/react-tabs @radix-ui/react-select
npm install @radix-ui/react-slot
npm install class-variance-authority
npm install lucide-react

# Remove FlyonUI
npm uninstall flyonui
```

### Configuration

Update `tailwind.config.js`:
- Remove Flyonui plugin from plugins array
- Keep the shadcn/ui color configuration
- Ensure CSS variables are defined in globals.css

Update `globals.css`:
- Include shadcn/ui theme variables
- Add responsive design tokens
- Remove Flyonui @plugin and @import statements

## Component Migration

### Button Migration

**Before (HeroUI):**
```tsx
import { Button } from "@heroui/react"

<Button variant="solid" color="primary">Click me</Button>
<Button variant="bordered" size="sm">Small</Button>
```

**After (shadcn/ui):**
```tsx
import { Button } from "@/components/ui/button"

<Button>Click me</Button>
<Button variant="outline" size="sm">Small</Button>
```

**Variant Mapping:**
| HeroUI | shadcn/ui |
|--------|-----------|
| `variant="solid"` | `variant="default"` |
| `variant="bordered"` | `variant="outline"` |
| `variant="light"` | `variant="secondary"` |
| `variant="flat"` | `variant="ghost"` |
| `variant="ghost"` | `variant="ghost"` |

### Card Migration

**Before (HeroUI):**
```tsx
import { Card, CardBody, CardHeader } from "@heroui/react"

<Card>
  <CardHeader>Title</CardHeader>
  <CardBody>Content</CardBody>
</Card>
```

**After (shadcn/ui):**
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

### Dialog Migration

**Before (HeroUI):**
```tsx
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react"

<Modal isOpen={open} onClose={setOpen}>
  <ModalHeader>Title</ModalHeader>
  <ModalBody>Content</ModalBody>
  <ModalFooter>
    <Button onPress={() => setOpen(false)}>Close</Button>
  </ModalFooter>
</Modal>
```

**After (shadcn/ui):**
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    <div>Content</div>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="ghost">Close</Button>
      </DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Input Components

**Before (HeroUI):**
```tsx
import { Input, Textarea, Select, SelectItem } from "@heroui/react"

<Input value={value} onChange={setVal} placeholder="Enter text" />
<Textarea value={text} onChange={setVal} />
<Select selectedValue={val} onSelectionChange={setVal}>
  <SelectItem value="a">Option A</SelectItem>
</Select>
```

**After (shadcn/ui):**
```tsx
import { Input, Textarea } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

<Input value={value} onChange={(e) => setVal(e.target.value)} placeholder="Enter text" />
<Textarea value={text} onChange={(e) => setVal(e.target.value)} />
<Select value={val} onValueChange={setVal}>
  <SelectTrigger>
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="a">Option A</SelectItem>
  </SelectContent>
</Select>
```

### Dropdown Menu Migration

**Before (HeroUI):**
```tsx
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/react"

<Dropdown>
  <DropdownTrigger>Open</DropdownTrigger>
  <DropdownMenu>
    <DropdownItem>Item 1</DropdownItem>
    <DropdownItem>Item 2</DropdownItem>
  </DropdownMenu>
</Dropdown>
```

**After (shadcn/ui):**
```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"

<DropdownMenu>
  <DropdownMenuTrigger>Open</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item 1</DropdownMenuItem>
    <DropdownMenuItem>Item 2</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Tooltip Migration

**Before (HeroUI):**
```tsx
import { Tooltip } from "@heroui/react"

<Tooltip content="Help text">
  <button>Hover me</button>
</Tooltip>
```

**After (shadcn/ui):**
```tsx
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <button>Hover me</button>
    </TooltipTrigger>
    <TooltipContent>Help text</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## New Components

### Interactive Tooltip

Enhanced tooltip with rich content support:

```tsx
import { InteractiveTooltip } from "@/components/Common/InteractiveTooltip"

<InteractiveTooltip
  content={
    <div className="space-y-2">
      <div className="font-semibold">Feature Name</div>
      <p className="text-sm text-muted-foreground">Description of the feature</p>
    </div>
  }
>
  <button>Hover for info</button>
</InteractiveTooltip>
```

### Config Modal

Configuration editor with preview:

```tsx
import { ConfigModal, SimpleConfigEditor } from "@/components/Common/ConfigModal"

<ConfigModal
  isOpen={open}
  onClose={() => setOpen(false)}
  title="Settings"
  config={config}
  onSave={setConfig}
  defaultConfig={defaultConfig}
  showPreview={true}
>
  {(config, update, hasChanges) => (
    <SimpleConfigEditor
      config={config}
      update={update}
      hasChanges={hasChanges}
      fields={[
        { key: "enabled", label: "Enabled", type: "boolean" },
        { key: "apiKey", label: "API Key", type: "text", placeholder: "Enter key" },
      ]}
    />
  )}
</ConfigModal>
```

### Preview Card

Card with hover preview:

```tsx
import { PreviewCard, ConfigPreview } from "@/components/ui/preview-card"

<PreviewCard
  hoverPreview={true}
  preview={
    <ConfigPreview
      config={config}
      title="Current Configuration"
    />
  }
>
  <div>Hover to see preview</div>
</PreviewCard>
```

## Theming

### Color Variables

shadcn/ui uses CSS variables for theming. Define them in `globals.css`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  /* ... more variables */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... more variables */
}
```

### Responsive Design

The design system includes an 8-tier responsive system:

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

Border-radius, motion curves, and component edge attributes all scale responsively.

## Migration Checklist

### Phase 1: Setup
- [ ] Install shadcn/ui dependencies
- [ ] Remove FlyonUI
- [ ] Update tailwind.config.js
- [ ] Update globals.css with shadcn/ui theme

### Phase 2: Core Components
- [ ] Migrate Button usage
- [ ] Migrate Card usage
- [ ] Migrate Dialog/Modal usage
- [ ] Migrate Input/Textarea usage
- [ ] Migrate Select usage

### Phase 3: Navigation & Overlay
- [ ] Migrate Dropdown Menu usage
- [ ] Migrate Popover usage
- [ ] Migrate Tooltip usage
- [ ] Migrate Tabs usage

### Phase 4: Advanced Features
- [ ] Add Interactive Tooltip where needed
- [ ] Add Config Modal for settings
- [ ] Add Preview Card for hover previews
- [ ] Implement responsive design enhancements

### Phase 5: Cleanup
- [ ] Remove unused HeroUI imports
- [ ] Remove FlyonUI references
- [ ] Update AGENTS.md with new patterns
- [ ] Test all migrated components

## Common Patterns

### Form with Validation

```tsx
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormMessage } from "@/components/ui/form-message"

<form>
  <div className="space-y-2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" />
    <FormMessage>Error message</FormMessage>
  </div>
  <Button type="submit" className="mt-4">Submit</Button>
</form>
```

### Modal with Form

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Note</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <Input placeholder="Title" />
      <Input placeholder="Content" />
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleSave}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Navigation with Dropdown

```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost">
      <Avatar>U</Avatar>
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem>Profile</DropdownMenuItem>
    <DropdownMenuItem>Settings</DropdownMenuItem>
    <DropdownMenuItem variant="destructive">Sign out</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

## Troubleshooting

### Import Errors
- Ensure `@/` path alias is configured in tsconfig.json
- Check that component files exist in `components/ui/`

### Style Conflicts
- Remove any HeroUI-specific classes
- Use `cn()` utility for class merging
- Check CSS variable definitions in globals.css

### Missing Dependencies
- Run `bun install` to install all dependencies
- Check package.json for required Radix UI packages

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com/docs)
- [Radix UI Primitives](https://www.radix-ui.com/docs/primitives)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4)
- [Lucide Icons](https://lucide.dev)
