# Changelog

## [1.0.7] - 2026-07-01

This patch release addresses plugin-checker warnings from the Obsidian community review.

### Changed

- Replaced raw `createEl("h3")` section headings in the settings tab with `new Setting(...).setHeading()`, as required for a consistent settings UI.
- Bumped `minAppVersion` from `1.5.0` to `1.6.0` to correctly declare the requirement for `workspace.revealLeaf`, and added `await` to both call sites.
- Replaced `document` with `activeDocument` in all event listener registrations (drag-handle `mouseup`, `visibilitychange`) for popout window compatibility.
- Refactored the `visibilitychange` handler from `async/await` to a `.then().catch()` chain so it no longer returns a Promise into a void event listener slot.
- Added `.catch(console.error)` to all `saveSettings().then(...)` chains in mutation handlers.
- Added explicit type annotations for the `moment` call and the `vault.process` callback parameter to suppress `@typescript-eslint/no-unsafe-*` warnings in environments where the Obsidian re-exports resolve to `any`.
- Typed the `loadData()` return value as `Record<string, unknown> | null` to eliminate the unsafe-assignment chain through `loadSettings`.
- Removed five redundant `as HTMLInputElement` type assertions on `createEl("input")` calls; replaced one `as HTMLElement | null` querySelector cast with `querySelector<HTMLElement>`.
- Renamed the command: `id` from `open-daily-checklist` → `open`, `name` from `Open Daily Checklist` → `Open` (Obsidian prepends the plugin name automatically).

### Notes

- The vault enumeration note (`getAllLoadedFiles()` in the folder/file autocomplete suggesters) is a Behavior-level checker note that applies equally to the previous hand-rolled implementation. It is expected and cannot be removed without dropping autocomplete entirely.
- No settings, daily-note write behavior, or user-visible functionality changed.

## [1.0.6] - 2026-07-01

This patch release fixes a runtime error on visibility change and replaces the hand-rolled settings autocomplete with Obsidian's native suggest API.

### Fixed

- Fixed `TypeError: leaf.view.refresh is not a function` thrown in `onVisibilityChange` (and defensively in `refreshViews`) when a Daily Checklist leaf existed but its view had not yet finished initializing. Both sites now use an `instanceof DailyChecklistView` guard instead of an unchecked cast.

### Changed

- Replaced the hand-rolled `TextInputSuggest` abstract class (manual DOM creation, `getBoundingClientRect` positioning, `document.body.appendChild`, `window` scroll/resize listeners, and `new Scope` keymap management) with subclasses of Obsidian's native `AbstractInputSuggest`. Obsidian now owns all popup lifecycle; the plugin supplies only `getSuggestions`, `renderSuggestion`, and `selectSuggestion`.
- Removed the `.dc-suggest` CSS block — the native suggest popup is themed by Obsidian.

### Notes

- No settings, daily-note write behavior, or user-visible functionality changed.
- Clears the plugin-checker warnings that flagged `document`/`window` usage, manual listener accumulation, and `innerHTML`.

## [1.0.5] - 2026-05-25

This patch release refines the sidebar editing experience and tightens the Daily Checklist visual layout.

### Added

- Added header-click editing: clicking the `DAILY CHECKLIST` sidebar title can now enter or exit edit mode.
- Added a setting, "Enable header click to edit," to control the sidebar header edit-mode shortcut.

### Changed

- Replaced the visible `(edit)` link with the cleaner clickable-header interaction.
- Updated the sidebar title color to use Obsidian's `--text-normal` variable.
- Tightened sidebar checklist spacing so rows sit closer to native Obsidian task-list rhythm.
- Aligned the sidebar content left padding to 16px.
- Made header-to-list spacing consistent whether header-click editing is enabled or disabled.

### Removed

- Removed the redundant "Enable daily checklist" setting. As a standalone plugin, Daily Checklist now relies on Obsidian's plugin enable/disable state for availability.

### Notes

- Checklist items can still be managed from the settings tab even when header-click editing is disabled.
- Existing `showSidebarEditLink` settings are preserved; the storage key is reused for the new header-click behavior.
- No daily-note write behavior changed.

## [1.0.4] - 2026-05-20

This patch release addresses Obsidian plugin checker warnings ahead of public submission.

### Changed

- Replaced the `builtin-modules` dependency with Node's built-in `module.builtinModules` in the build configuration.
- Removed `!important` CSS declarations by increasing selector specificity for the settings add-item row.

### Notes

- No plugin behavior changed.
- Build and typecheck remain clean.

## [1.0.3] - 2026-05-20

This patch release updates the default checklist items for new installs.

### Changed

- Updated the default checklist items to:
  - Exercise
  - Take vitamins
  - Evening walk
  - Read
  - Journal

### Notes

- Existing users are unaffected if their vault already has saved checklist items in `data.json`.

## [1.0.2] - 2026-05-20

This patch release prepares Daily Checklist for public Obsidian submission with release metadata cleanup and workspace-safety polish.

### Changed

- Updated the minimum Obsidian version to `1.5.0` for `Vault.process` compatibility.
- Pinned the Obsidian dev dependency instead of using `latest`.
- Removed a redundant plugin-name heading from the settings tab.
- Cleaned up public changelog wording.

### Fixed

- Fixed the README release link for manual installation.
- Removed sidebar leaf detachment on plugin unload to preserve Obsidian workspace layout during updates.

### Notes

- Release assets are built by GitHub Actions.
- Release assets include artifact attestations for `main.js`, `manifest.json`, and `styles.css`.

## [1.0.1] - 2026-05-12

- Added focus-preserving startup sidebar behavior:
  - Renamed the setting to "Add Daily Checklist to sidebar on startup."
  - Startup now ensures the view is available in the right sidebar without stealing focus from the active sidebar tab.
  - Manual ribbon/command opens still reveal/focus the view.
- Hardened callout configuration:
  - Sanitizes callout title newline characters.
  - Validates callout type using a conservative letters/numbers/underscore/hyphen whitelist.
  - Prevents malformed hand-edited `data.json` values from creating duplicate malformed callouts.
- Improved startup error handling:
  - Catches errors from startup sidebar creation instead of allowing unhandled promise rejections.

## [1.0.0] - 2026-05-07

- Initial stable release of Daily Checklist.
- Sidebar daily checklist with check/uncheck, edit mode, add, rename, delete, and desktop drag-and-drop reorder.
- Local-date daily reset.
- Optional daily note callout writing with configurable callout type, title, and fold state.
- Safe daily note path/template behavior.
- Pre-deployment hardening for vault safety.
