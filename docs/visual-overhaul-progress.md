# Visual Design Overhaul -- Progress Report

Status: **In progress**
Last updated: 2026-03-20

---

## Plan summary

Rebuild the visual system in 3 layers so every surface in the app matches 10 design mockups. Shell constraint: icon rail structure, route structure, command palette stay unchanged. All changes are interior to the content/detail area and shared UI primitives.

The sidebar (navigator) is also being updated to match the mockups.

---

## Layer 1: Tokens and Surfaces -- DONE

All new tokens added to `base.css`:

- 6 surface tiers: `--surface-standard`, `--surface-flat`, `--surface-glass`, `--surface-editor`, `--surface-terminal`, `--surface-toolbar`
- Glass effect tokens: `--glass-blur`, `--glass-border`
- 5 status-tone groups (backlog/ready/in-progress/verify/done), each with `-text`, `-bg`, `-border`, `-tint`
- Ambient bloom: `--bloom-accent`, `--bloom-execution` (applied to `workspace-detail::before`)
- 5 glow tokens: `--glow-accent`, `--glow-warning`, `--glow-success`, `--glow-danger`, `--glow-execution`
- 4 line-height tokens: `--line-height-tight`, `--line-height-normal`, `--line-height-reading`, `--line-height-editorial`
- Dark scrollbar styling (`*::-webkit-scrollbar`)
- Body typography defaults (`font-size`, `line-height`, heading reset)
- `.content-backdrop` class with bloom pseudo-element

## Layer 2: Shared Primitives -- DONE

### Buttons (shared-ui.css)
- Removed all `!important` from `.btn-primary`, `.btn-destructive`, `.btn-success`
- Added `.btn-ghost` intent
- Proper hover brightening (bg + border) instead of opacity
- Disabled opacity changed to 0.4

### Badges (shared-ui.css)
- 5 status-tone modifiers: `.badge--backlog`, `.badge--ready`, `.badge--in-progress`, `.badge--verify`, `.badge--done`

### Custom Select component -- DONE
- **New file**: `packages/client/src/app/components/custom-select.tsx`
- Shared `<CustomSelect>` component with trigger, dropdown panel, selected state, disabled state
- CSS in shared-ui.css: `.custom-select-wrap`, `.custom-select-trigger`, `.custom-select-panel`, `.custom-select-item`
- **Replaced ALL native `<select>` elements** across the entire app:
  - `ticket-detail-sections.tsx` -- "Move ticket to"
  - `export-section.tsx` -- Agent target (Codex CLI / Claude Code / etc.)
  - `tickets-list-view.tsx` -- Status filter + Initiative filter
  - `runs-list-view.tsx` -- Status filter + Ticket filter
  - `specs-list-view.tsx` -- Initiative filter
  - `audit-panel.tsx` -- Diff mode + Export agent

### Cards (shared-ui.css)
- `.card-surface--glass`, `.card-surface--editor`, `.card-surface--terminal`, `.card-surface--status-tinted`

### Toasts (toast.tsx, feedback-and-settings.css)
- Left 3px color bar per level
- Status SVG icon (checkmark/X/info)
- `var(--surface-dropdown)` background with overlay shadow

### Confirm dialog (feedback-and-settings.css)
- `var(--gradient-card-accent)` background
- Ghost cancel button, filled destructive
- 100px min-width buttons, `var(--space-6)` padding

### Command palette (command-palette.css)
- Larger input (`var(--font-lg)`)
- Uppercase mode headers with letter-spacing
- Rounded palette items

### Spinners (shared-ui.css)
- 2.5px border, `var(--border-subtle)` track
- 2s pulse animation

### Other
- Aggregate table row transitions
- Form input focus glow ring
- `.panel-header` pattern, `.empty-state` class
- Removed all `!important` from CSS

## Layer 3a: Settings + Onboarding -- PARTIALLY DONE

### Settings modal -- DONE
- Widened to 880px
- Title: "Providers & Agents" with subtitle
- Provider picker: 3-card horizontal grid replacing dropdown
- AI Agents: single disabled label instead of per-row "Coming soon"
- Tests updated

### Onboarding (new-chooser) -- IN PROGRESS
- Glassmorphism cards: `var(--surface-glass)`, `backdrop-filter`, `var(--glass-border)`
- Cards enlarged: `min-height: 320px`, wider container (920px)
- Icon separated from title, icon 48px in rounded frame
- Title: `font-3xl` weight 700
- Description: `font-lg` with reading line-height
- Local radial bloom behind cards
- **Remaining**: Cards are close but may need further size/spacing tweaks after visual review

## Layer 3b: Overview + Kanban -- DONE

### Overview (overview.css)
- Action queue rows: subtle gradient overlay, glow on hover matching tone (accent/warning/execution)
- Initiative cards: `border-light`, box-shadow, glow-accent on hover
- Section headings: `font-sm` weight 600, letter-spacing 0.06em

### Kanban board -- DONE (major restructure)
- **Phase selector**: Replaced grid of phase cards with compact custom dropdown trigger + panel
  - `planning-phase-dropdown-trigger`, `planning-phase-dropdown-panel`, `planning-phase-dropdown-item`
  - Removed `PhaseNameEditor` inline rename (no longer inline)
- **Ticket cards**: Fully restructured TSX and CSS
  - Top row: mono ticket ID (`planning-ticket-card-id`) + three-dot overflow menu (`planning-ticket-card-overflow`, hover-only)
  - Title as click button
  - Stats row: file icon + "N files in scope" + coverage count right-aligned
  - Blocker badge (warning tone) when blocked
  - Removed old progress bar, old drag handle button, old meta text
  - Card is now `draggable` on the `<li>` element itself
  - Subtle gradient overlay on card background, glow-accent on hover
- **Column tinting**: Stronger tinting with higher-opacity rgba backgrounds and borders
- Tests updated (7 tests in tickets-step-section, 4 in initiative-tickets-layout)

## Layer 3c: PRD + Tech Spec -- PARTIALLY DONE

### CSS added (planning-shell.css)
- `.spec-section-nav-item.active` -- accent bg, left 3px border, glow shadow
- `.planning-document-body-editorial` -- editor surface, editorial line-height, stronger heading hierarchy
- `.planning-document-body-terminal` -- terminal surface, ruled background, mono headings
- `.planning-document-toolbar` -- floating toolbar class
- `.planning-section-card` -- uses `var(--surface-editor)` background with shadow
- `.planning-entry-card` / `.planning-step-card` -- subtle gradient overlay, box-shadow
- `.planning-topbar` -- subtle gradient overlay, deeper shadow

### NOT DONE
- TSX not updated to apply `planning-document-body-editorial` vs `planning-document-body-terminal` class based on spec type
- Spec section nav active state: CSS exists but TSX doesn't set the `active` class on nav items

## Layer 3d: Ticket Detail -- DONE (major restructure)

- **Title**: `font-3xl` weight 700 with status badge inline top-right
- **Tab bar**: Segmented control (3-column grid, filled active state) replacing text tabs
- **Content card**: Everything below title wrapped in `.ticket-content-card` (editor surface, border-light, radius-lg, space-6 padding)
- **Focus cards**: Removed "Current step" eyebrow and "Up next" badge
- **Brief card**: Flat sections with h2-level headings (Brief / Requirements / Resources), no accordion wrapper
- **Removed**: WorkflowSection wrapper, Supports section, implementation details disclosure, grouped covered items display
- **Status toolbar**: Uses `CustomSelect` instead of native select
- **Max-width**: 960px centered
- Tests updated (4 tests)

## Layer 3e: Run + Audit -- PARTIALLY DONE

### CSS added (run-report.css)
- Validation score: flex-column badge-card with tone backgrounds (`.score-pass-bg`, `.score-partial-bg`, `.score-fail-bg`)
- `.run-criteria-log` terminal surface with log entry grid
- `.audit-findings-terminal` terminal surface
- `.audit-export-preview` uses `var(--surface-terminal)`
- `.run-report-card` -- gradient overlay + shadow

### NOT DONE
- TSX not updated to apply tone background classes to validation score
- Criteria results not restructured as timestamped log entries

## Layer 3f: Planning / Refinement / Validation -- PARTIALLY DONE

### CSS changes
- `.planning-survey-card` -- gradient overlay, border-light, deeper shadow
- `.planning-intake-progress-fill` -- accent-to-execution gradient
- `.planning-intake-question-list` -- space-4 gap
- `.planning-review-card` -- gradient overlay, shadow
- `.planning-review-override-panel` -- uses tone-in-progress tokens
- Checkpoint/transition banner buttons -- styled with tone-matched hover

### NOT DONE
- No TSX changes in refinement-section.tsx or validation-section.tsx

## Layer 3g-h: Aggregates + Pipeline -- DONE (minimal)

- Pipeline: brighter active glow (0.16 opacity), completed dots with success ring shadow
- Table rows: transition on hover (already applied via existing classes)

## Navigator / Sidebar -- IN PROGRESS

### CSS changes (navigator.css)
- More padding on items (0.45rem 0.8rem)
- Active item: `var(--accent-bg)` + `font-weight: 500` (stronger highlight)
- Section headers: flex layout with space-between for chevron alignment, more margin
- Larger dots (7px)
- Subtler tree border (`var(--border-subtle)`)

### NOT DONE
- No TSX changes to navigator component
- Mockup shows search input at top of sidebar, collapsible "Initiatives" section header -- needs TSX work

---

## Files changed (30 files)

### New files
| File | Purpose |
|------|---------|
| `packages/client/src/app/components/custom-select.tsx` | Shared custom dropdown replacing all native `<select>` |

### CSS files modified (16)
| File | Changes |
|------|---------|
| `base.css` | Surface tiers, tones, glows, bloom, scrollbars, typography, line heights |
| `shared-ui.css` | Buttons, badges, custom select, cards, panel headers, empty states, spinners, markdown typography |
| `feedback-and-settings.css` | Toasts, confirm dialog, settings modal, provider card grid |
| `command-palette.css` | Larger input, uppercase mode headers, rounded items |
| `entry-flows.css` | Onboarding glassmorphism, card sizing, icon separation |
| `overview.css` | Action queue glow, initiative card shadow/glow, section headings |
| `planning-tickets.css` | Phase dropdown, ticket card restructure, column tinting, card stats |
| `planning-shell.css` | Topbar shadow, step card gradient, section card editor surface, spec nav active, editorial/terminal surfaces |
| `ticket-execution.css` | Segmented tabs, flat sections, content card, status badge, header actions, large headings |
| `run-report.css` | Validation score badge, terminal log surface, report card shadow |
| `planning-intake.css` | Survey card gradient/shadow, progress bar gradient, question spacing |
| `planning-reviews.css` | Review card gradient/shadow, override panel tones, banner button styling |
| `pipeline.css` | Active glow, completed dot ring |
| `workspace.css` | Ambient bloom on detail, panel gradient/shadow |
| `navigator.css` | Item padding, active state, section headers, dot size |

### TSX files modified (13)
| File | Changes |
|------|---------|
| `toast.tsx` | Status icon SVG per level |
| `settings-modal.tsx` | Provider card grid, title/subtitle, simplified nav |
| `settings-modal.test.tsx` | Updated for card grid |
| `new-chooser.tsx` | Icon separated from title |
| `tickets-step-section.tsx` | Phase dropdown, card restructure (ID, overflow, stats, blocker) |
| `tickets-step-section.test.tsx` | Updated for new structure |
| `initiative-tickets-layout.test.tsx` | Updated drag target |
| `ticket-view.tsx` | Title + badge header, content card wrapper |
| `ticket-view.test.tsx` | Updated for flat layout |
| `ticket-detail-sections.tsx` | Removed anchor chrome, flat brief sections, CustomSelect |
| `export-section.tsx` | CustomSelect for agent target |
| `tickets-list-view.tsx` | CustomSelect for filters |
| `runs-list-view.tsx` | CustomSelect for filters |
| `specs-list-view.tsx` | CustomSelect for filter |
| `audit-panel.tsx` | CustomSelect for mode + agent |

---

## Remaining work

### Must finish
1. **Navigator TSX** -- search input styling, collapsible section headers to match mockup
2. **Onboarding cards** -- final sizing pass after visual review
3. **Spec section TSX** -- apply `planning-document-body-editorial` / `planning-document-body-terminal` class based on spec type, set `active` class on nav items

### Should do
4. **Run view TSX** -- apply tone background class to validation score, restructure criteria as log entries
5. **Refinement/validation TSX** -- apply badge system to review status chips
6. **Aggregate views** -- apply `.empty-state` class to empty states

### Verification needed
7. Full visual walkthrough of every view after all TSX wiring
8. `npm run check && npm test` -- currently passing (0 errors, 112 tests)
9. `npm run test:e2e` -- not yet run
