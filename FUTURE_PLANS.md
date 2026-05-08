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

`FolderSuggest.getSuggestions` and `MarkdownFileSuggest.getSuggestions` iterate `app.vault.getAllLoadedFiles()` per input event and per focus, sort the result, and slice to 200. **Read-only** — no writes. Fine for vaults of hundreds to low thousands of notes; could feel sluggish at tens of thousands.

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
