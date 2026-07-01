# Daily Checklist — Project Context

Personal Obsidian plugin. This file is the primer for future Claude Code sessions; read it before changing anything.

## 1. Project overview

- **Plugin name:** Daily Checklist
- **Plugin id:** `daily-checklist` (see `manifest.json`)
- **Current version:** 1.0.7 (see `CHANGELOG.md`)
- **Stack:** TypeScript, single-file `main.ts`, bundled to `main.js` via esbuild.
- **Surface:** A right-sidebar Obsidian view (`ItemView`, `VIEW_TYPE = "daily-checklist-view"`) with one section: Daily Checklist. Plus a settings tab.
- **Targets:** Desktop and mobile Obsidian (`isDesktopOnly: false`).
- **Repo layout:** flat — `main.ts`, `styles.css`, `manifest.json`, `package.json`, `package-lock.json`, `versions.json`, `tsconfig.json`, `esbuild.config.mjs`, `README.md`, `LICENSE`, `CHANGELOG.md`, `FUTURE_PLANS.md`. Plus `.github/workflows/release.yml` for CI and `images/` for README assets. No subfolders for source.

## 2. v1 scope

A focused Obsidian sidebar plugin for a lightweight daily checklist.

### Explicit exclusions (not in v1, do not add)

- No timer functionality
- No time tracking
- No running timers
- No Time Log
- No Time Totals
- No custom affirmation / quote / message feature yet

### Core v1 behavior

- Sidebar view with one **Daily Checklist** section.
- Normal mode: check / uncheck items.
- Edit mode (per-section `(edit)` ↔ `(done)` toggle): add, rename, delete, drag-and-drop reorder (desktop only).
- Per-day checked state in `data.json`, reset on first render after the local date rolls over.
- Loading / enabling / opening the sidebar / opening settings / rendering does **not** modify any note.
- **`DEFAULT_CHECKLIST`** (used only when `data.json` has no `checklistItems` key — i.e. fresh installs): `Exercise`, `Take vitamins`, `Evening walk`, `Read`, `Journal`.

### Settings

There is no per-plugin "enable" toggle: as a standalone plugin, Obsidian's own plugin enable/disable state controls availability. The sidebar view always renders the Daily Checklist section when it's open.

- **Enable header click to edit** — toggle. **Default: `true`.** Storage key `showSidebarEditLink` (legacy name — predates this UI; reused without migration since the boolean meaning is identical: "is there a sidebar entry point for edit mode?"). When on, the `DAILY CHECKLIST` section title is rendered as a reset-styled semantic `<button class="dc-section-title-btn">` with `aria-label="Toggle Daily Checklist edit mode"` — clicking it (or pressing Enter/Space while focused) toggles between normal and edit mode. The button looks identical to a plain span; only `cursor: pointer` and a subtle `var(--text-muted)` hover/focus color hint at interactivity. When off, the title is a plain span and there is no sidebar entry point for edit mode — items can still be managed via the plugin's settings-tab checklist editor. Toggling this setting calls `refreshViews()`, which always starts the next render in non-edit mode, so a user who was mid-edit when they disabled the setting returns to the calm view rather than being stuck in unreachable edit mode. No daily-note write occurs from toggling this setting.
- **Add Daily Checklist to sidebar on startup** — toggle. **Default: `true`.** When on, the plugin calls `app.workspace.onLayoutReady(() => this.ensureSidebarLeafOnStartup())` from `onload`. The startup helper is deliberately **focus-preserving**: if a Daily Checklist leaf already exists (e.g. restored from the saved workspace), it does nothing; otherwise it creates one in the right sidebar via `setViewState({ type: VIEW_TYPE, active: false })` and **never calls `revealLeaf`**. Whichever sidebar tab Obsidian had active stays active. Manual ribbon and command opens still go through `activateView()`, which *does* reveal/focus the view (that's the right behavior for an explicit user request). **Safety:** the startup path goes through `setViewState` → `view.onOpen` → `render`, none of which call `rewriteChecklistSection`, `getOrCreateDailyNote`, or any vault-write API. The only persisted side effect is the existing render-time `resetIfNewDay()`, which writes `data.json` only — never a daily note. Startup never creates today's daily note.
- **Write checklist to daily note** — gates all daily-note writes.
- **Daily note callout type** — text; the string inside `[!type]` (default `todo`).
- **Daily note callout title** — text; the title shown after the marker (default `Daily Checklist`).
- **Daily note callout fold state** — dropdown: `Collapsed` (`-`) or `Open` (`+`). Default `collapsed`.
- **Daily notes folder** — text with folder autocomplete.
- **Daily note date format** — moment-style format string. Forward slashes create nested folders.
- **Daily note template path** — text with markdown file autocomplete; applied only at creation.
- **Checklist item editor** — add / delete / drag-reorder rows. Mutations sync to the daily-note callout when the write toggle is on.

## 3. Daily note integration — callout-only model

v1 manages exactly one region: an Obsidian callout whose header is generated from settings. The plugin is **callout-only** — it does not manage plain markdown headings (e.g. `## Daily Checklist`) and v1 has no plans to.

The header is built by `buildCalloutHeader(settings)` from three configurable fields:

| Setting key                     | Default            | Notes                                                                      |
|---------------------------------|--------------------|----------------------------------------------------------------------------|
| `dailyNoteCalloutType`          | `todo`             | The string inside `[!...]`. Stored without brackets or `!`. Blank → `todo`.|
| `dailyNoteCalloutTitle`         | `Daily Checklist`  | The title shown after the marker. Blank → `Daily Checklist`.               |
| `dailyNoteCalloutFoldState`     | `collapsed`        | `collapsed` writes `-`, `open` writes `+`. Anything else → `collapsed`.    |

Default managed header (factory settings):

```
> [!todo]- Daily Checklist
> - [ ] Item
> - [x] Item
```

Body lines are always written as `> - [ ] Item` / `> - [x] Item`.

**Exact-match (Option A) detection.** The plugin only ever looks for the exact line that `buildCalloutHeader(settings)` produces *right now*. Trailing whitespace on the candidate line is tolerated (`trimEnd()`). No regex, no `startsWith`, no fuzzy match. Other callout types, titles, fold markers, and plain markdown headings are all ignored.

**Behavior on settings change.** If the user changes the type, title, or fold state, the previously-written callout no longer matches. On the next explicit checklist mutation, the new configured callout is **appended** to today's daily note. The old callout is left in place — it must be deleted manually if undesired. This is intentional: it preserves the rule "only manage the exact configured callout" without any heuristic match.

## 4. Daily note safety rules

These are non-negotiable:

- **Atomic writes** via `app.vault.process(file, fn)`. Never `read` + `modify`.
- **Only today's daily note is touched.** No historical scanning, no bulk modification.
- **No writes on plugin load, sidebar open, settings open, or render.** Only explicit checklist mutations (check / uncheck / add / rename / delete / reorder) trigger writes, and only when "Write checklist to daily note" is on.
- **Only the exact configured callout is rewritten.** Header = `buildCalloutHeader(settings)`.
- **Replacement boundary:** starts at the matched header line, ends at the first following line that does **not** start with `>`. Content after that boundary is never modified.
- **Plain markdown headings are not managed in v1** (e.g. a hand-written `## Daily Checklist` is left alone).
- **Never overwrite an existing daily note.** `getOrCreateDailyNote` only creates if missing; if a race created it first, the existing file is returned.
- **Apply template content only at creation time.** Existing notes are never re-templated.
- **Create missing parent folders** safely (one segment at a time, with race-tolerance on `EEXIST`).
- **No marker comments** (`<!-- ... -->`) for section boundaries. The callout header line is the sole marker.
- **Reject unsafe paths.** `isSafeVaultPath` blocks any path containing a `..` segment or that is empty after trimming. The daily-note path and the template path are both validated before any vault operation. On rejection, a `Notice` is shown and the write is aborted; the plugin will not silently "fix" or fall back to a different location.
- **Sanitize emitted item text.** `sanitizeChecklistItemForCallout` strips CR/LF (replaces with a single space) and trims, before any item appears in a callout body line. The map key (`checklistState.checked[item]`) stays raw — only the rendered line is sanitized — so this cannot decouple a row's checked state from its identity.

## 5. Daily note path / template behavior

- `dailyNoteFolder` — folder where daily notes live. Empty = vault root.
- `dailyNoteDateFormat` — moment.js format. Forward slashes are interpreted as nested folder segments (e.g. `YYYY/MM-MMMM/YYYY-MM-DD - dddd [Note]`).
- `dailyNoteTemplatePath` — optional. Applied only when creating a new daily note. Existing notes are never re-templated.
- Missing parent folders are created safely segment-by-segment with race tolerance.
- Existing notes are never overwritten.

## 6. Implementation notes

- **`data.json`** — runtime state (settings + checklistItems + checklistState). Gitignored.
- **`main.js`** — esbuild output. Gitignored. Always rebuild before testing in Obsidian; the harness loads `main.js`, not `main.ts`.
- **Settings merge:** `Object.assign({}, DEFAULT_SETTINGS, saved)` is shallow. After it:
  - `checklistItems` is reseeded if the saved key is `undefined`; if it's a non-array, it is reseeded; if it's an array, non-string entries are filtered out (empty arrays preserved as user-meaningful state).
  - `checklistState` is reseeded if missing, or if the saved value is not a plain object with a string `date`. If `date` is valid but `checked` is malformed (missing / non-object / array), `checked` is reset to `{}` while preserving `date`.
  - The three callout-config fields are sanitized: non-string or empty values fall back to defaults; an unrecognized fold state falls back to `collapsed`.
  - These guards make a hand-corrupted `data.json` unable to crash the renderer or the writer.
- **Daily reset:** plugin-level `resetIfNewDay()` mutates `checklistState` in memory and returns `true` if the local date rolled over. Persistence is the caller's responsibility, so a reset batches into the same `saveSettings()` call as the triggering mutation. The view's `render()` runs `resetIfNewDay()` and persists with a fire-and-forget `saveSettings()` — no daily-note write on render.
- **Drag-and-drop:** disabled on touch via `navigator.maxTouchPoints`. The drag handle is a separate grip; `mousedown` on the grip gates `dragstart` so the rest of the row stays click-friendly.
- **Inline inputs only.** No `window.prompt` / `alert` / `confirm` (unsupported on Obsidian mobile).
- **Cross-device sync:** on `visibilitychange` (foreground), the plugin reloads `data.json` and re-renders. Read-only — no daily-note write happens here.
- **Folder/file autocomplete** in settings uses a small `TextInputSuggest`. Window scroll/resize listeners are attached only while the dropdown is open, so they don't accumulate as the settings tab is reopened.

## 7. Build / test commands

```sh
npm install          # one-time
npm run dev          # esbuild watch — rebuilds main.js on every save
npm run build        # production build (no watch, no sourcemap)
npx tsc --noEmit     # typecheck only
```

Both `npm run build` and `npx tsc --noEmit` should pass clean before shipping any change.

To test in a vault: symlink (or copy) this folder into `<vault>/.obsidian/plugins/daily-checklist/`, then enable the plugin in Obsidian's Community Plugins settings.

### Release workflow

Releases are built by `.github/workflows/release.yml` (GitHub Actions):

- Triggered automatically on a pushed `X.Y.Z` version tag, or manually via `workflow_dispatch` against an existing tag.
- Checks out the tagged source, runs `npm ci`, `npx tsc --noEmit`, `npm run build`, verifies `main.js` / `manifest.json` / `styles.css` exist, extracts the matching `## [<tag>] - <date>` section from `CHANGELOG.md` (heading line stripped, blank lines trimmed), generates GitHub artifact attestations for all three assets via `actions/attest-build-provenance@v2`, then creates or updates the GitHub release with `gh release create/edit --notes-file`.
- Releasing a new version: bump `manifest.json` / `package.json` / `package-lock.json` / `versions.json` / `CLAUDE.md`, add a `## [<tag>] - <date>` section to `CHANGELOG.md`, commit, then `git tag <tag> && git push origin <tag>`.

## 8. Future work / not yet implemented

- **Custom affirmation / quote / message feature** — planned but explicitly excluded from v1. Do not add until requested.
- **Non-callout (heading-based) daily note integration** — if ever considered, treat as a separate careful safety review. Heading-based block boundaries are riskier than callout boundaries because a heading's "block" extent is not delimited by a single character at the start of every line; getting it wrong risks modifying unrelated content. v1 deliberately avoids this.

## 9. Things to avoid

- **Don't reintroduce timer / time-tracking concepts.** No count-up/countdown timers, Time Log, Time Totals, timer templates, or `> [!example]- Time Tracker` callouts.
- **Don't add the Phase 2 message/quote/affirmation feature** until explicitly asked.
- **Don't add legacy/migration code.** The current `data.json` shape is the only shape that needs to work.
- **Don't bypass `app.vault.process`** for daily-note writes.
- **Don't redesign the UI** without being asked. The section structure, edit toggle, and inline-input ergonomics are intentional.
- **Don't broaden callout matching.** Exact-match (with `trimEnd()`) is the safety property; do not regress to regex, `startsWith`, fold-marker preservation, or any heuristic match.
- **Don't write to notes on load / open / render** — only on explicit checklist mutations.
- **Don't commit:** `data.json`, `main.js`, `node_modules/`, `.claude/`, `settings.local.json`, `.DS_Store`. All are in `.gitignore`.
