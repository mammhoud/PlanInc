# Enhancements, Audit & Recommendations

> **PI-024** · Companion to PI-011 (programme), PI-012 (parity matrix), PI-013
> (settings reference) and PI-022 (agenda).
>
> **Purpose.** PI-011 planned the work, PI-012 recorded what Blinko has, and
> PI-013 listed the settings. This document is the **operator's view**: what is
> actually shipped across the modules a user touches, what is thin, what should
> become a tooltip, and the ordered list of enhancements worth doing next.
>
> **Evidence rule.** Every `file` claim below was checked in this checkout. Rows
> marked ⚠️ *stale* correct an earlier document rather than repeat it.

---

## 1. Executive summary

The product is in better shape than PI-012 implies. Three surfaces the matrix
listed as missing (`parity`) have since shipped, and the corrections matter
because they remove work from the roadmap:

| PI-012 claim | Verified reality | Action |
|---|---|---|
| "Backlinks / bidirectional links — **none**" | **Shipped.** `PlanIncReference/index.tsx` queries `notes.noteReferenceList` for both `references` and `referencedBy`, and `PlanIncCard/referencesContent.tsx` renders the count + list on the card. | ⚠️ *stale* — correct PI-012 |
| "Command palette (Cmd/Ctrl-K) — **Missing**" | **Shipped.** `Layout/CommandPalette.tsx` — actions + navigation + settings, arrow-key nav, global `TooltipProvider` already mounted in `App.tsx`. | ⚠️ *stale* — correct PI-012 |
| "Daily review" | **Shipped.** `pages/review.tsx` — daily *and* random mode, edit-in-place, convert note↔plan, archive, delete, confetti on completion. | ✅ confirmed |

**Net effect:** the remaining gaps are concentrated in four areas — *guided
discovery*, *streak/analytics on reviews*, *share preview*, and *module
cross-linking* — not in the headline features.

---

## 2. Module audit (file-verified)

### 2.1 Settings

- `pages/settings.tsx` defines `allSettings` (key/title/icon/component/group/
  `requireAdmin`/keywords) rendered by `ScrollableTabs` and searchable from
  `GlobalSearch` **and** the command palette. This is the "settings section
  registry" PI-012 calls shipped-and-better — kept as-is.
- Settings are grouped, and admin-only sections are filtered by
  `user.isSuperAdmin` in both `GlobalSearch` and `CommandPalette` — the two
  visibility rules already agree.

**Thin spot:** a setting's *value* has no explanation on hover. PI-013 publishes
the reference table, but that document is not reachable from the control it
describes. See §5 (tooltip map) — `ConfigTooltip` in
`Common/InteractiveTooltip.tsx` already exists for exactly this and is
under-used.

### 2.2 Integrations

| Surface | State (file) | Note |
|---|---|---|
| MCP **server** (inbound) | `routerExpress/mcp.ts` — SSE + streamable HTTP, tool-scoped | better-than reference |
| MCP **client** hub | `PlanIncSettings/McpServersSection.tsx`, `aiServer/mcp`, `McpToolBridge` | shipped |
| Webhooks | `lib/commentWebhook.ts` `SendWebhook`, `webhookEndpoint` key | note-event coverage + HMAC + delivery log still open (PI-012 §4.3) |
| Plugins | `PlanIncSettings/PluginSetting.tsx`, `store/plugin/pluginManagerStore` | install/upgrade/uninstall shipped; **capability enforcement** open |
| SSO / S3 | `SSOSetting.tsx`, `StorageSetting.tsx` | shipped |
| Scheduled tasks | `aiServer/tools/scheduledTask.ts`, exposed over MCP | shipped as agent tools |

**Recommendation I1 (P6):** finish the webhook story — add `note.create/update/
delete` events with an HMAC header and a small delivery-log table. The
`SendWebhook` seam and the `webhookEndpoint` config key already exist, so this is
additive, not a rewrite.

**Recommendation I2 (P6):** plugin capability *enforcement* should **warn first,
enforce behind a flag.** Existing plugins would break otherwise; a warning
banner per undeclared capability gives operators the data to decide.

### 2.3 Sharing & previews

- Share links with password + expiry are shipped (`PlanincShareDialog/index.tsx`,
  `pages/share/[id].tsx`, `publishPublicNote`, staged password).
- Link preview fetching exists (`public.linkPreview` → `LinkInfo` in
  `lib/apiTypes.ts`).

**Gap:** there is **no preview of what a share link will look like** before it is
created — the sharer sees the form, not the rendered card. This is the single
highest-value UX addition in the sharing flow.

**Recommendation S1 (P5):** reuse `PreviewCard`
(`components/ui/preview-card.tsx`) inside `PlanincShareDialog` to render the
exact public card (title, excerpt, cover, expiry chip) as the sharer types. No
new public route is needed — the card component already renders from a `Note`.

**Recommendation S2:** surface a "link opens for anyone / password required /
expires in N days" summary line above the copy button, so the security posture is
readable at a glance.

### 2.4 Reviews (of notes)

- `pages/review.tsx` is complete for the daily loop.
- `api.notes.reviewNote` advances the schedule; `dailyReviewNoteList` /
  `randomReviewNoteList` feed it.

**Gaps:** (a) no **streak or "reviewed N today"** counter, so the habit has no
feedback; (b) the confetti fires on *every* empty render, including the moment
the day's queue loads empty — a small but real over-fire.

**Recommendation R1 (P5):** add a compact review strip — reviewed-today, current
streak, and queue size — driven by the existing `reviewNote` mutation plus a
count, not a new store. This turns a nice page into a habit.

**Recommendation R2 (bug, P5):** gate the completion confetti behind a
`hasCelebrated` ref so it fires once per session, not per render.

### 2.5 Relations between modules

- **Notes ↔ notes:** shipped (references / referencedBy, §1).
- **Notes ↔ resources:** `note.ts` links attachments via `attachments.noteId`
  and `PlanIncResource/ResourceItem.tsx` renders them.
- **Notes ↔ tickets / study / skills:** these modules read the same note stream
  (`pages/tickets.tsx`, `study.tsx`) but **do not render the cross-links back**
  — a ticket does not show the note it was raised from, and a study item does not
  show its source note.

**Recommendation M1 (P7):** promote `PlanIncReference` from a modal into an
**inline "Related" strip** that any module can embed (`<RelatedItems
of={note} />`). Same query, same cards — only the placement changes it from
"hidden behind a right-click" to "visible in every module".

**Recommendation M2 (P7):** the graph page (`pages/graph.tsx`) already walks
references. Add a **module-coloured edge legend** (note / plan / ticket / study /
resource) so the graph becomes the cross-module map rather than a note-only one.

### 2.6 Calculated / derived logic (manager + product review)

Checked the derivation points that drive user-visible numbers:

| Derivation | Location | Verdict |
|---|---|---|
| Plan status buckets (`overdue`/`due-soon`/`open`/`no-deadline`) | `pages/index.tsx` `planStatusOf` | Correct; uses `dayjs(deadline)` and a 3-day `due-soon` window, compares by day. |
| Task date fallback (`metadata.expireAt` → `createdAt`) | `pages/index.tsx` `taskDateOf` | Correct and shared by calendar, timeline and status lanes. |
| Category columns incl. uncategorised | `pages/index.tsx` `categoryColumns` | Correct; uncategorised column is opt-in via `agendaShowUncategorised`. |
| Kanban counts | `categoryColumns` / `statusColumns` `.plans.length` | Counts are over the **paged** set, so the column count and the footer agree — intentional. |
| Progress percent | `ImportProgress` `Math.round(progress/total*100)`, guarded `isNaN→0` | Correct division guard; renders 0% instead of NaN. |
| Tag tree filter | `TagListPanel.filterTags` | Correct recursion (keeps a branch when a descendant matches). |
| Card columns clamp | `cardColumnsFor` + `preferredCardColumns` | Correct; `check:contracts` asserts the clamp (12 cases). |

**Recommendation C1:** the release/archive scheduled task and the analytics
`tagStats` both read counts from the same tables; when PI-012's "P7 observability"
lands, add a single `insights` computation entry point so the two cannot drift.

---

## 3. What was landed in this pass

| Change | Path |
|---|---|
| Guided tooltip primitive (single, provider-safe) | `Common/GuidedTooltip.tsx` |
| Nav items now carry a one-line "why" hint; collapsed sidebar names each item | `Layout/Sidebar.tsx` |
| Sidebar collapse toggle explains the side-nav mode | `Layout/Sidebar.tsx` |
| Agenda-category quick filter in the tag rail | `Common/CategorySelector/index.tsx`, `Common/TagListPanel.tsx` |
| Brand mark, wordmark, lockups and animated loader as SVG, token-backed | `frontend/public/*.svg`, `PlanincLogo/*` |
| Brand gradient stops promoted into the token layer | `styles/tokens.css` |

**Design contract honoured:** the new SVG components consume
`var(--pi-color-*)` only. `lint:tokens` reports 159 raw values against a 169
baseline — no regression.

---

## 4. Prioritised enhancement plan

Ordered by (user value ÷ effort). Each item names the seam it should use so it
stays additive.

| # | Enhancement | Seam | Phase |
|---|---|---|---|
| 1 | **Share preview** — render the public card live in the share dialog | `PreviewCard` + `Note` | P5 |
| 2 | **Review strip** — reviewed-today, streak, queue size | `reviewNote` + count | P5 |
| 3 | **Related strip** — inline cross-links in every module | `PlanIncReference` | P7 |
| 4 | **Guided tooltips everywhere** — see §5 | `GuidedTooltip` | P5 |
| 5 | **Webhook completion** — note events + HMAC + delivery log | `SendWebhook` | P6 |
| 6 | **Plugin capability warning** | plugin manager | P6 |
| 7 | **Graph module legend** — cross-module edge colours | `pages/graph.tsx` | P7 |
| 8 | **Setting-value tooltips** | `ConfigTooltip` | P3 |
| 9 | **Review confetti fix** | `pages/review.tsx` | P5 |
| 10 | **Insights single entry point** | `routerTrpc/analytics.ts` | P7 |

---

## 5. Tooltip map — making the project guided & featurable

Tooltips are how a feature-dense app teaches itself. The rule used here: **a
tooltip is warranted when the control's label cannot carry the whole meaning** —
collapsed chrome, an icon-only button, a value with a unit, or a control whose
effect is non-obvious.

Already done in this pass:

| Surface | Label | Hint |
|---|---|---|
| Sidebar nav item (collapsed) | the item's translated name | the one-line "why" from `NAV_HINTS` |
| Sidebar nav item (expanded) | — | same hint |
| Sidebar collapse toggle | `Collapse` | `side-nav-mode-hint` (pin vs drawer) |

Recommended next, highest value first:

| Surface | What the tooltip should say | Why |
|---|---|---|
| **Agenda view switcher** (`PlanningViewSwitch`) | "Board / Calendar / Timeline — same plans, different lens" | Six modes are self-evident once named; the *equivalence* is not. |
| **Kanban group-by toggle** | "Group by category (agenda lanes) or by finish status" | Two words mean nothing until explained once. |
| **Show-completed chip** | "Merges archived plans into a Done lane" | It changes a persisted account preference — worth warning. |
| **Plan card deadline chip** | Exact due date + "overdue / due in N days" | The chip is colour-only today; colour alone fails colour-blind users. |
| **Setting controls** (`ConfigTooltip`) | Current value + one-line meaning | The value is often invisible (appearance v2 attributes). |
| **Tag rail category filter** | "Filters the board by agenda lane" | New control; discoverability depends on the hint. |
| **Share dialog expiry** | "The link stops working after this date" | Security-relevant; a bare date is easy to misread. |
| **Import dialogs** (`Import*Progress`) | What is imported, and that it is additive | Destructive-looking ops need reassurance. |
| **Plugin install button** | "Installs and enables this plugin's declared tools" | Mentions the capability surface. |
| **AI provider "Test connection"** (when built) | "Sends one request; shows latency" | Cost/latency is otherwise invisible. |

**Featurability rule of thumb:** every new icon-only control ships with a
`GuidedTooltip`, and every new persisted preference ships with a hint on the
control that sets it. That is the cheapest way to keep a growing surface
learnable without a tour library.

**i18n constraint (read before adding tooltip text).** PI-009 enforces locale
parity in `e2e/i18n-parity.spec.mjs`: a new key must be added to `en` **and to
all 16 other locales**, or the spec fails. The sidebar tooltips shipped in this
pass therefore reuse existing keys (`collapse`, `side-nav-mode-hint`, the nav
labels) rather than inventing new ones. Any hint in the table above that needs a
new string must be added through the normal translation workflow — the
`translator.yml` action picks up new `en` keys — not hard-coded in markup.

**Tooltip placement note.** `GuidedTooltip` renders `TooltipTrigger asChild`, so
the trigger must forward a ref. The shadcn `Button`/`Link` pair does; HeroUI's
`Button` is only safe where the existing code already wraps it in a Radix
primitive.

---

## 6. File organisation

No reorganisation was required in this pass; the additions follow existing
conventions:

- A reusable hook-free primitive lives in `Common/` as a single file
  (`GuidedTooltip.tsx`).
- A feature with more than one file gets a folder with an `index.tsx`
  (`CategorySelector/`, `PlanincLogo/`).
- Static brand assets live at the `public/` root; derived PNG icons live in
  `public/icons/` beside their `README.md`.

`check:contracts` (tokens + settings + platform + token-strict) and
`tsc --noEmit` are the two gates that must stay green after any move.

---

## 7. Verification

```bash
bun run --cwd frontend check:contracts   # tokens · settings · platform · token-strict
bun run --cwd frontend lint:tokens       # raw-value report (must not exceed baseline)
cd frontend && npx tsc --noEmit -p tsconfig.json

# share preview / review strip / related strip, once landed
bunx playwright test --config playwright.canonical.config.ts   # :1112, hermetic DB
```

**Verified in this pass:** `check:contracts` passed (159 raw values vs the 169
baseline, no regression); `tsc --noEmit` exited 0.
**Not run here:** Playwright and a live visual check (no browser/bun network in
the authoring environment) — the two commands above are the gate.

---

## 8. Remarks

- **AI-generated** in the same sense as PI-012: file-level inspection, not a
  runtime pass. Treat the audit table as a map, not a test report.
- **Corrections are the point.** Where PI-012 said "missing" and the code says
  "shipped", this document says so, because roadmap work that is already done is
  the most expensive kind of stale documentation.
- **No item was removed** from PI-015/PI-021 (the Django plan and its task
  board); §4 is a parallel, product-facing order of work that can be done on the
  current stack.
