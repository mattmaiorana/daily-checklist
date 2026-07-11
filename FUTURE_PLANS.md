# Daily Checklist — Future Plans

Deferred ideas and known non-blocking limitations for **after v1.0.0**. Nothing here is scheduled. Treat each item as a separate, scoped pass — not a v1 follow-up.

## A. Custom text / quote feature

Add a planned feature for a configurable **custom text / quote** displayed inside the sidebar.

Scope is intentionally narrow:
- **Sidebar-only.** The text appears in the sidebar, under the "Daily Checklist" section header, as a small static line of text. Treat it as a display/UI feature, not a note-integration feature.
- **No daily-note writes.** This feature must not write anything to the daily note. It must not create another managed daily-note region. It must not modify notes at all.
- **No new write path.** Because nothing is written to disk beyond `data.json` (the configured text itself), no additional daily-note safety review is needed for this feature on its own — but the implementation must affirmatively avoid wiring into `rewriteChecklistSection` or any other vault-write code path.

When implemented, treat it as a separate, scoped pass. Keep the storage simple (a single string setting) and keep the rendering trivial (one element below the section header).

## B. Optional non-callout daily note integration (heading-based)

v1 supports **callout-only** daily-note integration. A future version could add support for plain markdown heading integration (e.g. `## Daily Checklist`).

Why this needs a separate safety review:
- Heading boundaries are more ambiguous than callout boundaries. A callout's extent is delimited by a single, line-prefix character (`>`); a heading's "block" is delimited by other heading lines, which is conceptually clear but harder to get right under edge cases (frontmatter, fenced code blocks, embedded headings, mixed levels, etc.).
- The likely rule would be: "replace from the configured heading until the next heading of the same or higher level, or end-of-file." That rule needs to handle: code fences (`---` and ``` ``` ``` ``` ``` ``` blocks shouldn't terminate), HTML comments, and frontmatter.

Do **not** implement this unless explicitly requested. If implemented:
- Keep callout integration as the default. Heading mode should be opt-in.
- Reject heading mode in the same daily note as a managed callout — they should be mutually exclusive per note.
- Add explicit tests for: code fences inside a managed heading section, frontmatter at the start of a note, multiple managed-named headings (only the first is managed), and a heading at the very end of the file.

## C. Adjacent callout / blockquote limitation

**Known limitation; documented; acceptable for v1.**

Current callout replacement rule: extent = consecutive `>`-prefixed lines from the matched header line; ends at the first non-`>` line. This means an unrelated callout or blockquote line **immediately adjacent** to the managed callout — with no blank line between them — is absorbed into the managed extent and lost on the next rewrite.

The plugin's own append behavior always writes a blank-line separator before the new callout (`<existing>\n\n<callout>\n`), so external content needs to be packed against ours by hand or by another tool to hit this. The conservative boundary is preferred to a more permissive parser that could misread other blocks as part of ours.

Future improvements could explore:
- A more precise parser that understands Obsidian callout continuation syntax.
- A pre-write check that warns the user when adjacent `>`-prefixed content is detected.
- A migration helper that inserts a blank-line separator between callouts.

None of these are blocking; v1 is fine to ship as-is.

## D. Callout-setting migration / cleanup helper

v1 uses **exact-match** detection — when the user changes `dailyNoteCalloutType`, `dailyNoteCalloutTitle`, or `dailyNoteCalloutFoldState`, the plugin no longer matches the previously-written callout. The next mutation appends a new callout with the configured header; the old callout is left in place and must be deleted manually.

This is intentionally conservative: it preserves the rule "only manage the exact configured callout" without any heuristic match.

A future version could add an explicit, manual command:
- `Daily Checklist: Migrate old callout to new settings`
- `Daily Checklist: Find callouts in today's note`

Constraints:
- Must never silently rewrite old callouts.
- Must operate on a single explicit invocation, not on settings change.
- Must show a confirmation/preview of what will change before writing.
- Must not bulk-scan historical notes — only today's daily note.

## E. Large-vault autocomplete optimization

`FolderSuggest.getSuggestions` and `MarkdownFileSuggest.getSuggestions` iterate `app.vault.getAllLoadedFiles()` per input event and per focus, sort the result, and slice to 200. **Read-only** — no writes, no scanning of note *contents* (only path names). Fine for vaults of hundreds to low thousands of notes; could feel sluggish at tens of thousands.

The Obsidian community-plugin checker flags any use of `getAllLoadedFiles()` as "vault enumeration." Here it's deliberate and minimal — it powers the two folder/markdown-file autocomplete inputs in the settings tab and runs only while the user types into those fields. We accept the checker warning rather than degrade the autocomplete UX.

Possible optimizations later:
- Cache the candidate list at suggest construction time and invalidate on a debounced timer.
- Precompute a lowercased path index.
- Use a more incremental match (prefix tree / fuzzy matcher with an early-exit threshold).

Not urgent. Read-only and bounded; the only cost is a small input-handling delay.

## F. Autocomplete unload cleanup edge case

`TextInputSuggest` attaches `scroll` and `resize` listeners on `open()` and removes them on `close()`. This handles the common path correctly. The remaining edge case: if the user disables the plugin while a suggest dropdown is open, the listeners are not torn down by the plugin's `unload` lifecycle — they were registered against `window`, not via `this.register`/`this.registerDomEvent`.

A future polish pass could:
- Track all live `TextInputSuggest` instances on the `SettingTab` (or plugin) and `close()` them in `hide()` / `onunload()`.
- Or rewrite `TextInputSuggest` to use `Component.registerDomEvent` so cleanup is automatic.

The probability of hitting this path in normal use is essentially zero (you'd have to disable the plugin while a folder/template autocomplete dropdown is actively shown), and the cost of the leak is two stranded `window` listeners. Cleanup is welcome but not urgent.

## G. Configurable sidebar header

Allow the user to change the sidebar section header from the current hardcoded `"DAILY CHECKLIST"` label to a custom string via a new setting.

Scope:
- **Sidebar UI only.** Affects the rendered label of the section header in the right-sidebar view. Nothing else.
- **Independent of the daily-note callout title.** Keep this as a *separate* setting from `dailyNoteCalloutTitle`. The sidebar label and the callout title can legitimately differ — for example, a short sidebar label and a longer callout title. Do not auto-sync the two unless explicitly designed later.
- **No automatic effect on daily-note writes.** Changing the sidebar label must not rewrite, migrate, or duplicate any daily-note callout. The callout title remains controlled exclusively by `dailyNoteCalloutTitle`.

When implemented:
- Add one new string setting (e.g. `sidebarHeaderLabel`) with a default of `"Daily Checklist"`.
- Sanitize the same way other string settings are: trim, fall back to default on empty.
- Render in the existing `dc-section-label` element instead of the hardcoded string.
- No changes to `buildCalloutHeader` or `rewriteChecklistSection`.

## H. Visibilitychange race with in-flight saveSettings

**Resolved in 1.0.9.** The plugin now tracks in-flight saves via a `pendingSaves` counter (incremented/decremented around `saveData` in `saveSettings`), and `onVisibilityChange` returns early while `hasPendingSave` is true rather than reloading. This closes the realistic ordering (a tap just before a foreground reload). A sub-millisecond interleave where the tap lands *during* the reload's `loadData` remains theoretically possible but is not worth further complexity on a single-user plugin.

## I. Duplicate checklist item names share state

**Resolved in 1.0.9** by prevention: add and rename now reject a name already present in `checklistItems` (with a `Notice`) at all three entry points (sidebar add/rename, settings add). Because items remain keyed by their raw string, forbidding duplicates keeps delete/rename/checked-state coherent without a `data.json` migration to per-item IDs.

Residual (accepted): an item whose name collides with an `Object.prototype` member is handled for reads via `isItemChecked` (own-property + `=== true` guard), but an item literally named `__proto__` still cannot be *persistently* checked — the assignment `checked["__proto__"] = true` is a silent no-op on a plain object. Zero corruption, absurd input; not worth null-prototyping the `checked` map across the load/reset paths. Revisit only if per-item IDs are ever introduced.

## J. Settings tab does not auto-refresh on sidebar-driven changes

The settings tab's checklist editor (`renderClList`) only renders when `display()` is called. If the settings tab is open in a tab/window while the user mutates the checklist from the sidebar, the settings tab's item list shows stale data until the tab is reopened.

The reverse direction (settings → sidebar) is handled correctly via `refreshViews()`.

Fix later: track the live settings-tab instance on the plugin and call `renderClList()` from sidebar mutation handlers (or after `saveSettings` resolves). Not a safety issue; UX polish.

## K. Debounce settings string-field saves

`addText.onChange` fires per keystroke; each fires an `await saveSettings()`. For a 20-character entry, that's 20 disk writes to `data.json`. Not catastrophic (the file is tiny) but wasteful.

A 200–500 ms debounce (using Obsidian's `debounce()` helper) would reduce this to one write per pause. Out of v1 scope.

## L. Touch reorder gaps (`maxTouchPoints` heuristic)

Drag-and-drop is suppressed when `navigator.maxTouchPoints > 0` (HTML5 D&D's touch story is unreliable). As of 1.0.9 both the sidebar **and** the settings-tab item editor gate their drag affordances on this check, so mobile no longer shows dead grips in settings (previously the settings grips rendered but did nothing). Two gaps remain:

- **No touch replacement.** Touch users still cannot reorder items at all.
- **Touchscreen-laptop false positive.** `maxTouchPoints > 0` is also true on desktop/laptop touchscreens even when a mouse is attached, so those users lose mouse drag-reorder unnecessarily. Switching the gate from `maxTouchPoints` to Obsidian's `Platform.isMobile` would fix this, but it changes behavior on hybrid devices and touches both surfaces, so treat it as a deliberate scoped pass.

Possible solutions later:
- Switch the gate to `Platform.isMobile` (addresses the touchscreen-laptop case).
- Long-press to enter a reorder mode with up/down buttons.
- Always-show up/down arrows next to each row in edit mode on touch.
- A "Move up" / "Move down" command in the settings tab item list.

Out of v1 scope.

## M. Extract shared drag-and-drop helper

The sidebar and settings tab implement near-identical drag-and-drop logic — ~30 lines each, ~95% overlap. A shared helper taking `{ container, items, onReorder }` would consolidate the logic and reduce maintenance risk.

Pure refactor; no observable behavior change. Defer until either copy needs to change.

## N. Settings-tab cancel button labelled "Delete"

The temporary "+ Add item" row in the settings tab uses `setButtonText("Delete").setWarning()` for what is functionally a Cancel action. The styling matches the actual Delete buttons on saved rows. A fresh user could reasonably read "Delete" on an unsaved row as "delete this item" — though the action does cancel correctly.

Could be relabelled `"Cancel"` while keeping the red `.setWarning()` styling for visual consistency with adjacent rows.

## O. Notice on daily-note write failures for non-path reasons

The eight `rewriteChecklistSection` call sites all wrap in `.catch(console.error)`. The two Notice-bearing failures inside `getOrCreateDailyNote` (unsafe path, missing template) already surface to the user. But `vault.create` or `vault.process` failures for non-path reasons — disk full, permission denied, sync conflict — only log to console; the user sees no UI feedback.

Future improvement: add a top-level `Notice` from the catch handler at each mutation site (or factor through a helper), e.g. "Daily Checklist: couldn't update today's daily note. See console for details." UX polish; not a safety concern.

## P. Re-review Obsidian dev dependency when raising minAppVersion

`package.json` now pins `"obsidian": "^1.5.0"` to match `manifest.minAppVersion`. When the minimum app version is raised in the future, the dev dependency range should be bumped in lockstep so the local TypeScript API surface matches the minimum supported runtime API.

The lockfile pins the specific resolved version installed at the time, so `npm ci` is deterministic; but the range in `package.json` should not be allowed to drift below `manifest.minAppVersion`.

## Q. Memoize the drag-handle icon

`setIcon(handle, "grip-vertical")` is called once per row per render. For a 5-item checklist this is invisible; for very long checklists, it embeds a full SVG O(n) times per render. A pre-built icon node (cloned per row) or a CSS background-image would eliminate the per-row injection.

Refactor; no observable behavior change in typical use.

## R. Append path trims trailing whitespace outside the managed callout

When `rewriteChecklistSection` appends a new callout to a note that has no matching header yet, it writes `content.trimEnd() + "\n\n" + callout`. The `trimEnd()` strips any trailing blank lines / trailing whitespace the note already had — a (tiny) modification of content *outside* the managed callout boundary. The replace path (matched header) is unaffected; this is append-only.

In practice this is almost certainly desirable (no one wants trailing blank lines), and it's the only place the plugin touches bytes it doesn't own. If strict boundary purity is ever wanted, strip only trailing newline runs (`content.replace(/\n+$/, "")`) instead of all trailing whitespace, or document the behavior explicitly. Not a safety concern — content is only *removed* at the very end of the file, never inside existing text.

## S. Multiple sidebar leaves of the view desync on mutation

Sidebar mutation handlers re-render only their own container (or do a targeted label toggle), and do **not** call `refreshViews()`. Obsidian allows more than one leaf of the same view type (e.g. the user drags a second Daily Checklist leaf into the left sidebar). In that case, checking/adding/renaming in one leaf leaves the other showing stale checks/items until a `visibilitychange`, a settings-tab mutation, or a reopen refreshes it.

No data corruption — a mutation from the stale leaf still operates on the fresh `plugin.settings`; only the display lags. This is the sidebar-leaf analogue of item **J** (settings tab stale on sidebar edits).

Deferred because the obvious fix (have sidebar mutations call `refreshViews()`) re-renders *all* leaves, which restarts each in non-edit mode and would kick a second leaf out of edit mode mid-edit. A correct fix should skip the originating leaf and preserve edit state. Low value for a single-user, single-leaf workflow; revisit if multi-leaf use becomes common.
