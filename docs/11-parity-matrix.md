# Parity Matrix — Blinko / AppFlowy vs PlanInc

> **PI-012** · Phase **P0** of the PI-011 programme (`10-blinko-parity-and-design-plan.md`)

**Purpose.** P0's deliverable: one row per backlog item, with the Blinko evidence,
PlanInc's *verified* status, the gap type, and the owning phase. Its job is to
replace assumptions with evidence — and it already changed the programme's shape:
several items the plan listed as "ship this" are **already shipped**, and are
recorded here as such rather than re-implemented.

## How to read the status column

Every PlanInc status carries a **file reference** that was checked in this
checkout. A row without one is marked `unverified` and must not be quoted.

| Gap type | Meaning |
|---|---|
| `parity` | Blinko has it, PlanInc does not — implement |
| `partial` | Present but incomplete; the note says what is missing |
| `better-than` | Present and already ahead of Blinko |
| `differentiator` | Neither has it as a product feature; PlanInc's architecture makes it cheap |
| `not-wanted` | Deliberately declined, with the reason |

**Evidence rules.** Blinko **documentation** claims (docs.blinko.space) were
verified in P0's research pass. Blinko **source paths** remain unverified — this
checkout has no `application/tools/blinko/` (§Remarks, decision 3), so no source
path is quoted anywhere in this matrix. PlanInc claims are all file-checked.

---

## 1. AI settings & agent surface (§1.1)

| Item | Blinko evidence | PlanInc status (verified) | Gap | Phase |
|---|---|---|---|---|
| Enable-AI toggle | `ai-setting` | Settings are scoped by provider/model config — no global kill-switch | `partial` | P4 |
| Provider list (OpenAI, Azure, Anthropic, DeepSeek, Gemini, Grok, Ollama, OpenRouter) | `ai-setting` | Provider/model CRUD with dialogs — `PlanincSettings/AiSetting/{ProviderCard,ProviderDialogContent,ModelDialogContent}.tsx` | `better-than` | — |
| Separate embedding key + endpoint | `ai-setting` | `EmbeddingSettingsSection.tsx` exists; separate embedding credentials **not confirmed** | `partial` | P4 |
| Embedding dimensions auto-detect | `ai-setting` | `embeddingDimensions` is a config key (`shared/lib/types.ts`) — auto-detect unverified | `partial` | P4 |
| Index rebuild, incremental vs force, progress | `ai-setting` | **SHIPPED** — `RebuildEmbeddingProgress/index.tsx` drives `api.ai.rebuildEmbeddingStart/Stop/Progress` with polling, status pills and a stop control | `better-than` (resumability unverified) | P4 |
| Retrieval tuning (top-K, score, rerank model/top-K/score) | `ai-setting` | Config keys `embeddingTopK`, `embeddingScore`, `rerankTopK`, `rerankScore`, `rerankModelId` exist (`shared/lib/types.ts`) | `partial` — keys exist, UX unverified | P4 |
| Test Connection (with latency) | `ai-setting` | Not found | `parity` | P4 |
| HTTP proxy (AI-scoped) | `ai-setting`, `settings/preference` | `HttpProxySetting.tsx` + `isUseHttpProxy`/`httpProxy*` keys exist **globally** | `partial` — not AI-scoped | P4 |
| MCP client hub | 3rd-party only | **SHIPPED + better** — `McpServersSection.tsx`, `server/routerTrpc/mcpServers.ts`, `server/aiServer/mcp`, `McpToolBridge` | `better-than` | — |
| Per-agent tool policy / dry-run / audit log | — | Agent directories exist (`AgentDirectorySetting.tsx`, `working`/`skills`); **no tool allow/deny, dry-run or audit log** | `differentiator` | P7 |
| AI cost/latency observability | — | Token usage is tracked (`store/aiStore.tsx:32` — `promptTokens`/`completionTokens`/`totalTokens`); **no cost or latency surface** | `differentiator` | P7 |

## 2. Appearance / preference settings (§1.2)

| Item | Blinko evidence | PlanInc status (verified) | Gap | Phase |
|---|---|---|---|---|
| Theme light/dark/**system**, applied instantly | `preference` | `Common/Theme/ThemeSwitcher` + `config.theme` | `parity` ✔ shipped | — |
| Theme colour palette | `preference` | `Common/Theme/ThemeColor` + `lib/themePalettes.ts` (now token-backed, P3) | `parity` ✔ shipped | — |
| Language applied immediately | `preference` | `Common/LanguageSwitcher` + i18next | `parity` ✔ shipped | — |
| Content display: order by create time, fold length, card columns, time format, max page width, page size, toolbar visibility | `preference` | Keys present: `isOrderByCreateTime`, `textFoldLength`, `maxHomePageWidth`, `toolbarVisibility` (+ card column config in `PerferSetting`) | `partial` — no page size | P3 |
| Background animation toggle | `preference` | `isCloseBackgroundAnimation` key | `parity` ✔ shipped | — |
| Custom background (login/share) | `preference` | `customBackgroundUrl` key + `PerferSetting` | `parity` ✔ shipped | — |
| Auto-hiding nav bar (mobile) | `preference` | Not found | `parity` | P3 |
| Typography control (family) | AppFlowy | `Common/FontSwitcher` | `parity` ✔ shipped | — |
| Typography **scale**, line height, editor-vs-UI split, mono | AppFlowy | Not found | `differentiator` | P3 |
| Density modes (comfortable/compact) | AppFlowy, Blinko data-density | Not found | `parity` | P3 |
| Focus/zen mode | note-app convention | `planincStore.fullscreenEditorNoteId` (`store/planincStore.tsx:87`) = fullscreen editor; no app-level zen mode | `partial` | P3 |
| RTL / text direction | AppFlowy | Not found | `parity` | P3/P8 |
| Contrast boost, focus ring, keyboard hints | WCAG 2.2 | Not found | `parity` | P3/P8 |
| Motion: reduce-motion control | MDN `prefers-reduced-motion` | Token layer honours `prefers-reduced-motion` (`tokens.css`); **no user-facing switch** | `partial` | P3 |

## 3. Note / content features (§5.1)

| Item | Blinko evidence | PlanInc status (verified) | Gap | Phase |
|---|---|---|---|---|
| Daily review | `how-to-use/daily-review` | `isCloseDailyReview` key + `frontend/src/pages/review.tsx` | `parity` ✔ shipped | — |
| Cover / icon on notes | AppFlowy shell | `cardHeader`/`cardFooter`/`FullscreenEditor` carry cover (`coverUrl`) + icon surfaces | `parity` ✔ shipped | — |
| Backlinks / bidirectional links | AppFlowy | **none** — no `backlink*` symbol anywhere in `app/src`, `server`, `shared` | `differentiator` (SurrealDB graph edges) | P7 |
| Templates / starter notes | AppFlowy | Not found | `parity` | P10 |
| Importers (Markdown, Memos, PlanInc) | — | **SHIPPED** — `ImportSetting.tsx`, `ImportMarkdownProgress`, `ImportMemosProgress`, `ImportPlanincProgress` | `better-than` | — |
| Importers (Obsidian, Notion) | — | Not found | `parity` | P10 |
| Music player | `how-to-use/music` | `PlanincMusicPlayer` + `MusicSetting.tsx` | `parity` ✔ shipped | — |
| Note share links (password + expiry) | `how-to-use/share-your-note` | **SHIPPED** — `PlanincShareDialog/index.tsx` (`expiryDate`, `password`, 7/30/custom options) + `pages/share/[id].tsx` | `parity` ✔ shipped | — |
| Tags + toolbar | `how-to-use/{tags,toolbar}` | Tag system + `toolbarVisibility` | `parity` ✔ shipped | — |
| Plan categories, custom form fields, share approvals | — | **Beyond Blinko** — `CategorySetting.tsx`, `FormFieldSetting.tsx`, `ShareApprovalSetting.tsx` | `better-than` | — |

## 4. Integrations (§1.3, §5.3)

| # | Item | Blinko evidence | PlanInc status (verified) | Gap | Phase |
|---|---|---|---|---|---|
| 1 | Personal access tokens (create/revoke, scoped) | `settings/access-token` | JWT auth exists and machine clients can use it — `server/lib/helper.ts:207` `getTokenFromRequest` accepts `Authorization: Bearer` **and** `?token=`; **no user-facing create/revoke/scope API** | `parity` | P6 |
| 2 | REST API + OpenAPI browser (`/api-doc`) | `settings/access-token` | **Spec SHIPPED** — `server/swagger.ts` calls `generateOpenApiDocument` (`trpc-to-openapi`); routes carry `.meta({ openapi: … })` | `partial` — no browse/publish surface | P6/P9 |
| 3 | Webhooks (`note.create/update/delete`) | `settings/webhook` | **Outbound webhooks SHIPPED** — `server/lib/commentWebhook.ts` (`SendWebhook`, event→type map), `webhookEndpoint` key, `SHARE_INVITE_WEBHOOK` (`shareApproval.ts:110`). No note-event coverage, no HMAC signature, no delivery log/replay | `partial` | P6 |
| 4 | PlanInc **as** an MCP server | 3rd-party `mcp-server-blinko` | **SHIPPED + better** — `server/routerExpress/mcp.ts` uses `@modelcontextprotocol/sdk` `McpServer` with SSE **and** streamable-HTTP transports, exposing search/upsert/update/delete note, comment, web search and scheduled-task tools | `better-than` | — |
| 5 | MCP client hub hardening | — | `McpServersSection.tsx` + `McpToolBridge` | `better-than` | — |
| 6 | RSS → note ingestion | `how-to-use/rss` | RSS exists **outbound only** — `server/routerExpress/rss.ts`, feed URLs in `server/lib/helper.ts:109`. Ingestion absent | `parity` | P6 |
| 7 | Plugin marketplace + permissions | `ecosystem/blinko-plugin`, `plugins/*` | **SHIPPED** — `PluginSetting.tsx`, `store/plugin/pluginManagerStore`, `PluginRender`, install/upgrade/uninstall, version compare, `PluginInfo` type. **Enforcement of declared capabilities is the gap** | `partial` | P6/P10 |
| 8 | Event bus reused by webhooks/plugins/agents | — | Not found | `differentiator` | P7 |
| 9 | Automation rules | — | **Scheduled tasks exist as agent tools** — `server/aiServer/tools/scheduledTask.ts` (create/delete/list), exposed over MCP. No event triggers, no visible run history | `partial` | P7 |
| 10 | Chat-bot bridge (Telegram/WeChat-class) | `ecosystem/wechat-bot` | Not found | `not-wanted` for now — policy-dependent, and MCP covers the same need more safely | — |
| 11 | SSO / account linking / S3 | `settings/{sso,link-account,s3}` | **SHIPPED** — `SSOSetting.tsx`, `StorageSetting.tsx` + `s3*` keys, `oauth2Providers` | `parity` ✔ shipped | — |
| 12 | Desktop/mobile capture parity | `desktop/*`, `android/*` | **SHIPPED** — `pages/{quicknote,quicktool,quickai}.tsx` + `HotkeySetting.tsx` (Tauri `get_registered_shortcuts`), `tauriHelper.ts`; Android share parity **unverified** (no device) | `partial` | P6 |

## 5. UX & interaction (§5.2)

| Item | PlanInc status (verified) | Gap | Phase |
|---|---|---|---|
| Command palette (Cmd/Ctrl-K) | **Missing** — no `cmdk`; `Layout/GlobalSearch.tsx` is a search modal that *also* lists `allSettings`, i.e. a strong base but not an action palette | `parity` | P5 |
| Keyboard nav + in-app shortcut hints | Desktop hotkeys exist (`HotkeySetting.tsx`); no `Kbd` hints in the UI | `partial` | P5 |
| Virtualised lists | **Missing** — no virtualization dependency in `package.json` | `parity` | P5 |
| Slash-menu / block affordances | Vditor ships a slash hint (`vditor-hint` styles in `styles/vditor.css`); no app-level block affordances | `partial` | P5 |
| Collapsible shell + resizable inspector | Partial (layout exists; no resizer) | `partial` | P5 |
| Density, zen mode, split view | `EditorToolbar/i18n.ts:73` carries a `splitView` string (editor-level); no app split view, no density, no zen | `parity` | P3/P5 |
| Optimistic UI + undo on destructive actions | Toasts present (`react-hot-toast`); no undo | `parity` | P5 |
| Connectivity indicator | `store/baseStore.ts:150` tracks `navigator.onLine`; not surfaced | `partial` | P5 |
| Reduced-motion respect | Token layer only (no user control) | `partial` | P3 |
| Drag-and-drop consolidation | **Both** `@dnd-kit` **and** legacy `react-beautiful-dnd-next` in use — the latter in `pages/resources.tsx`, `PlanincResource/ResourceItem.tsx`, `AttachmentRender/DraggableFileGrid.tsx` | `parity` | P5 |
| Bulk selection / multi-note actions | Missing | `parity` | P5 |
| Inline AI affordances (rewrite/expand/tag in place) | Agent surface is settings-centric; in-editor affordances unverified | `partial` | P5 |
| Settings section registry + search | **SHIPPED + better** — `pages/settings.tsx` `allSettings` (key/title/icon/component/group/`requireAdmin`/keywords) rendered by `ScrollableTabs`, searchable from `GlobalSearch` | `better-than` | — |

---

## What P0 changed about the programme

1. **P6 shrinks from "build" to "finish + document."** The MCP server, the OpenAPI
   document, webhooks, share links, plugins, SSO and S3 already exist. What is
   actually missing is: token management (1), note-event webhooks with signatures
   and a delivery log (3), RSS **ingestion** (6), plugin capability *enforcement*
   (7), and an API browse/publish surface (2).
2. **P2's "settings shell + section registry" is already there** at *section*
   granularity (`allSettings`). P2 therefore targets *setting*-level metadata —
   which is what the registry below implements — instead of a shell rewrite.
3. **P7 gains a cheap win**: backlinks/graph edges are absent everywhere, and
   SurrealDB is already a graph store, so this is the highest-leverage
   differentiator (§5.1).
4. **P3/P5 own the appearance + interaction gaps** that are verifiably absent:
   density, typography scale, RTL, zen, command palette, virtualisation, bulk
   selection, undo, dnd consolidation.

## Decisions this matrix feeds

| # | Decision | Blocked work |
|---|---|---|
| 1 | Vendor Blinko source for line-level review, or keep the matrix docs-only? | Blinko source paths in P6/P10 |
| 2 | Access tokens: reuse the existing JWT (`getTokenFromRequest`) or introduce scoped, revocable tokens? | P6-1 |
| 3 | Plugin capabilities: enforce (breaking for existing plugins) or warn first? | P6-7 |

---

## Remarks & Notes

- **AI-generated:** this matrix was produced by an AI agent from documentation
  research plus file-level inspection of this checkout. Every PlanInc claim cites
  a file that was checked; Blinko claims cite docs slugs. Treat the two columns
  differently in review.
- **`not-wanted` rationale (chat-bot bridge):** MCP already provides a safer,
  authenticated, tool-scoped path for external clients; a bespoke bot bridge adds
  a credential surface without adding capability.
- **Unverified rows are named, not hidden:** separate embedding credentials,
  embedding-dimension auto-detection, retrieval-tuning UX, Android share parity
  and Zen/split-view reach are all marked `partial` with the specific unknown.
- **Phase mapping** follows `10-blinko-parity-and-design-plan.md` §7; where this
  matrix moved work between phases, the note above says why.
