# Changelog

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
