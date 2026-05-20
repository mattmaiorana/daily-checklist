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

`onVisibilityChange` (`main.ts`) calls `await this.loadSettings()` on foreground. If a checklist mutation's `saveSettings` is in flight at that moment, `loadSettings` reads the pre-save snapshot from disk and overwrites the in-memory mutation. The next mutation then writes the stale state back, silently losing the original toggle.

In practice this requires the user to background and foreground Obsidian within the ~10 ms `data.json` write window — essentially zero probability on a single-user, single-device workflow. The reset-on-date-rollover is idempotent and self-heals; only a non-reset toggle would be silently lost.

A defensive fix would track in-flight saves via a `saving: Promise<void> | null` member and `await` it before reloading on visibility change. Five lines, no observable behavior change in the common case. Defer until needed.

## I. Duplicate checklist item names share state

`checklistState.checked` is keyed by the raw item string. If the user adds two items with the same name `"Foo"`:
- Both checkboxes toggle together when either is clicked.
- Deleting either row removes both (the `filter(i => i !== "Foo")` removes all matches).
- Renaming only updates the first match (via `indexOf`).

The plugin does not crash, and the daily-note callout output is consistent with the underlying state. The UX is surprising.

Future fix options:
- Use stable per-item IDs in the storage shape instead of raw-name keys (would require a `data.json` migration step).
- Or, on add, append a disambiguator if the name already exists.

Out of v1 scope.

## J. Settings tab does not auto-refresh on sidebar-driven changes

The settings tab's checklist editor (`renderClList`) only renders when `display()` is called. If the settings tab is open in a tab/window while the user mutates the checklist from the sidebar, the settings tab's item list shows stale data until the tab is reopened.

The reverse direction (settings → sidebar) is handled correctly via `refreshViews()`.

Fix later: track the live settings-tab instance on the plugin and call `renderClList()` from sidebar mutation handlers (or after `saveSettings` resolves). Not a safety issue; UX polish.

## K. Debounce settings string-field saves

`addText.onChange` fires per keystroke; each fires an `await saveSettings()`. For a 20-character entry, that's 20 disk writes to `data.json`. Not catastrophic (the file is tiny) but wasteful.

A 200–500 ms debounce (using Obsidian's `debounce()` helper) would reduce this to one write per pause. Out of v1 scope.

## L. No reorder UI on touch devices

Drag-and-drop is correctly suppressed when `navigator.maxTouchPoints > 0` (HTML5 D&D's touch story is unreliable). But there's no replacement — touch users cannot reorder items.

Possible solutions later:
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
