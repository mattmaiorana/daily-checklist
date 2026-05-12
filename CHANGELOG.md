# Changelog

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
- Updated `FUTURE_PLANS.md`:
  - Added deferred follow-up items from the final review.

## [1.0.0] - 2026-05-07

- Initial stable release of Daily Checklist.
- Sidebar daily checklist with check/uncheck, edit mode, add, rename, delete, and desktop drag-and-drop reorder.
- Local-date daily reset.
- Optional daily note callout writing with configurable callout type, title, and fold state.
- Safe daily note path/template behavior.
- Pre-deployment hardening for vault safety.
