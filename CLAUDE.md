# Daily Checklist — Project Context

Personal Obsidian plugin (single-user, pre-release). Read this primer before changing anything.

## 1. Project overview

- **Plugin name:** Daily Checklist (`id: daily-checklist`, see `manifest.json`).
- **Stack:** TypeScript, single-file `main.ts`, bundled to `main.js` via esbuild.
- **Surface:** A right-sidebar Obsidian view (`ItemView`, `VIEW_TYPE = "daily-checklist-view"`) with one section: Daily Checklist. Plus a settings tab.
- **Targets:** Desktop and mobile Obsidian (`isDesktopOnly: false`).
- **Repo layout:** flat — `main.ts`, `styles.css`, `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`. No subfolders for source.

## 2. Phase 1 scope

Phase 1 is a faithful port of the Daily Checklist behavior that previously lived inside the Daily Time Tracker plugin, now standalone. **No new features yet.**

What is in scope:
- Sidebar view with a single "Daily Checklist" section.
- Normal view: check / uncheck items.
- Edit mode (per-section `(edit)` toggle): add, rename, delete, drag-and-drop reorder (desktop only).
- Per-day checked state in `data.json`, reset on first render after the local date rolls over.
- Optional write to the daily note's `> [!todo]- Daily Checklist` callout.
- Settings tab: enable toggle, write-to-daily-note toggle, daily-notes folder (with folder autocomplete), date format, template path (with markdown file autocomplete), checklist item editor.

What is **explicitly excluded** in Phase 1:
- All timer / time-tracking functionality (count-up, countdown, running timers, Time Log, Time Totals, timer templates, timer modal, timer settings).
- The "Time Tracker" callout (`> [!example]- Time Tracker`) — this plugin does not read or write it.
- Any custom message / quote / affirmation feature (planned for Phase 2 — do not add yet).

## 3. Reference material

- `_reference/obsidian-daily-time-tracker/` is a **read-only** copy of the previous plugin. It is the source of truth for porting decisions: behavior, callout safety rules, settings ergonomics, and CSS styling.
- Do not modify anything inside `_reference/`. The folder is gitignored and will not ship.
- When making decisions, prefer "what did the reference do?" over inventing new behavior.

## 4. Daily note output format

The plugin manages exactly one region: an Obsidian callout whose header is generated from settings. The plugin is **callout-only** — it does not manage plain markdown headings (e.g. `## Daily Checklist`) and there are no plans to.

The header is built by `buildCalloutHeader(settings)` from three configurable fields:

| Setting key                     | Default          | Notes                                                  |
|---------------------------------|------------------|--------------------------------------------------------|
| `dailyNoteCalloutType`          | `todo`           | The string inside `[!...]`. Stored without brackets or `!`. Blank → `todo`. |
| `dailyNoteCalloutTitle`         | `Daily Checklist`| The title shown after the marker. Blank → `Daily Checklist`. |
| `dailyNoteCalloutFoldState`     | `collapsed`      | `collapsed` writes `-`, `open` writes `+`. Anything else → `collapsed`. |

Examples (body shown for context — the plugin owns the body and rewrites it whole):

```
> [!todo]- Daily Checklist
> - [ ] Item
> - [x] Item
```

```
> [!check]+ Evening Routine
> - [ ] Item
```

**Exact-match (Option A) detection.** The plugin only ever looks for the line `buildCalloutHeader(settings)` produces *right now*. Trailing whitespace on the candidate line is tolerated (`trimEnd()`). No other callout type, title, or fold marker is matched — even ones the plugin itself wrote in the past under different settings.

**Boundary.** Callout extent = the run of consecutive `>`-prefixed lines starting at the matched header line. Replacement stops at the first following line that does not start with `>`. Content after that boundary is never touched.

**Behavior on settings change.** If you change the type, title, or fold state, the plugin will no longer match the previously-written callout. On the next explicit checklist mutation, the new configured callout will be **appended** to today's daily note. The old callout is left in place — it must be deleted manually if undesired. This is intentional: the rule "only manage the exact configured callout" is preserved without any heuristic match.

## 5. Daily note safety rules

These are non-negotiable:

- **Only write the exact configured callout.** Header = `buildCalloutHeader(settings)`. Never modify plain `## Daily Checklist` (or similar) headings, any other callout type/title/fold marker, or any other content.
- **Replace in place** when the callout exists. **Append at end of file** when it doesn't.
- **Never overwrite an existing daily note.** `getOrCreateDailyNote` only creates if missing; if a race created it first, return the existing file.
- **Apply template content only at creation time.** Existing notes are never re-templated.
- **Atomic writes** via `app.vault.process(file, fn)`. Do not use `read` + `modify`.
- **Create missing parent folders** safely (one segment at a time, with race-tolerance on `EEXIST`).
- **Never bulk-modify or scan historical notes.** Only today's daily note is ever touched.
- **Loading / enabling / opening the sidebar must not write to any note.** Only an explicit checklist mutation (check/uncheck/add/rename/delete/reorder) triggers a write, and only when "Write checklist to daily note" is enabled.
- **No marker comments** (`<!-- ... -->`) for section boundaries. The callout header is the marker.

## 6. Build / test commands

```sh
npm install          # one-time
npm run dev          # esbuild watch — rebuilds main.js on every save
npm run build        # production build (no watch, no sourcemap)
npx tsc --noEmit     # typecheck only
```

Both `npm run build` and `npx tsc --noEmit` should pass clean before shipping any change. Obsidian loads `main.js`, not `main.ts`, so always rebuild before testing.

To test in a vault: symlink (or copy) this folder into `<vault>/.obsidian/plugins/daily-checklist/`, then enable the plugin in Obsidian's Community Plugins settings.

## 7. Implementation notes

- **`data.json`** is runtime state (settings + checklistItems + checklistState). Gitignored.
- **`main.js`** is the esbuild output. Gitignored.
- **Settings merge:** `Object.assign({}, DEFAULT_SETTINGS, saved)` is shallow. After it, `checklistItems` and `checklistState` are reseeded only when the saved key is `undefined` — empty arrays / empty objects are preserved as user-meaningful state.
- **Daily reset:** `ensureChecklistResetToday` runs on every render of the checklist section. If `checklistState.date` is not today, it's reset to `{ date: today, checked: {} }` in memory; this is persisted on the next mutation.
- **Drag-and-drop:** disabled on touch devices via `navigator.maxTouchPoints` check. The drag handle is a separate grip element; `mousedown` on the handle gates `dragstart` to avoid hijacking text selection and checkbox clicks.
- **Inline inputs only.** No `window.prompt` / `alert` / `confirm` (unsupported on Obsidian mobile). Use inline `<input>` rows for "+ Add item" and rename.
- **Cross-device sync:** on `visibilitychange` (foreground), the plugin reloads `data.json` and re-renders. No write happens here — only a read + render.
- **Folder/file autocomplete** in settings uses a small `TextInputSuggest` adapted from periodic-notes / Calendar Plus. It piggybacks on Obsidian's native `.suggestion-container` / `.suggestion-item` / `.is-selected` styling.

## 8. Things to avoid

- **Don't reintroduce timer/time-tracking concepts.** No count-up/countdown timers, no Time Log, no Time Totals, no timer templates, no `> [!example]- Time Tracker` callout.
- **Don't add the Phase 2 message/quote/affirmation feature** until explicitly asked.
- **Don't modify `_reference/`.** It's a frozen reference snapshot.
- **Don't add legacy/migration code.** The current `data.json` shape is the only shape that needs to work.
- **Don't bypass `app.vault.process`** for daily-note writes.
- **Don't redesign the UI** without being asked. The section structure, edit toggle, and inline-input ergonomics are intentional.
- **Don't use marker comments** for section boundaries — the callout header is the only marker.
- **Don't commit:** `data.json`, `main.js`, `node_modules/`, `.claude/`, `settings.local.json`, `.DS_Store`. All are in `.gitignore`.
