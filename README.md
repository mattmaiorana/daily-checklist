# Daily Checklist

A minimal Obsidian sidebar plugin for a lightweight daily checklist. Check off your daily routines without leaving your active note, and optionally sync them into your daily note as an Obsidian callout.

## Features

- **Right-sidebar checklist** with one focused section: Daily Checklist.
- **Check / uncheck items** with one click.
- **Edit mode** to add, rename, delete, and drag-and-drop reorder items (desktop).
- **Daily reset.** Checked state clears automatically when the local date rolls over.
- **Optional daily note sync.** Items are written into an Obsidian callout in today's daily note. The callout type, title, and fold state are configurable.
- **Conservative daily-note safety.** The plugin only ever touches today's daily note, only after an explicit checklist mutation, only inside its exact configured callout, and only when the sync toggle is on.
- **Focus-preserving startup.** Optionally add the view to the right sidebar at startup without stealing focus from your active sidebar tab.

## Screenshots

> _Coming soon — sidebar view + settings tab._

## Installation

### Manual installation

1. Download the latest release from the [Releases page](https://github.com/) and extract:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Copy those three files into your vault at:
   ```
   <vault>/.obsidian/plugins/daily-checklist/
   ```
3. In Obsidian, open **Settings → Community plugins**, refresh the list, and enable **Daily Checklist**.

(The plugin is not yet on Obsidian's community plugin directory; manual installation is the supported path for now.)

## Settings overview

- **Enable daily checklist** — toggles whether the sidebar section renders.
- **Add Daily Checklist to sidebar on startup** — when on, ensures the view is available in the right sidebar at startup without stealing focus from your active sidebar tab. Manual ribbon / command opens still reveal and focus the view.
- **Write checklist to daily note** — gates all daily-note writes. When off, the plugin never touches your daily note.
- **Daily note callout type** — the string inside `[!type]`. Defaults to `todo`. Allowed characters: letters, digits, `_`, `-`.
- **Daily note callout title** — the title shown after the marker. Defaults to `Daily Checklist`.
- **Daily note callout fold state** — `Collapsed` writes `-`, `Open` writes `+`.
- **Daily notes folder** — folder where today's note lives.
- **Daily note date format** — moment.js format string. Forward slashes create nested folders (e.g. `YYYY/MM-MMMM/YYYY-MM-DD - dddd [Note]`).
- **Daily note template path** — optional. Used only when creating a new daily note.
- **Checklist items** — add, delete, and reorder the items shown in the sidebar.

## Daily note integration

When "Write checklist to daily note" is enabled, the plugin writes (and updates) a single Obsidian callout in today's daily note. With default settings:

```
> [!todo]- Daily Checklist
> - [ ] Read books to kids
> - [x] Dinner at the table
> - [ ] Evening walk
> - [ ] Journal
> - [ ] 7hrs of sleep
```

The callout type, title, and fold state are configurable.

### Daily note safety

These rules are non-negotiable:

- **Only today's daily note** is ever read or written.
- **No historical scanning**, no bulk modification of other notes.
- **No writes on plugin load, sidebar open, settings open, or render.** Only explicit checklist mutations (check / uncheck / add / rename / delete / reorder) trigger writes, and only when the "Write checklist to daily note" setting is on.
- **Only the exact configured callout** is rewritten. Plain markdown headings, other callout types, other titles, and the opposite fold marker are all ignored.
- **Replacement boundary:** the plugin replaces from the configured callout header line through the last consecutive line starting with `>`. Content after that boundary is never modified.
- **Existing daily notes are never overwritten.** A missing daily note is created; an existing one is read in place.
- **Template content is applied only at creation time.** Existing notes are never re-templated.
- **Path traversal blocked.** Folder/template paths containing `..` are rejected with a notice.
- **Atomic writes** via `app.vault.process`.

If you change the callout type / title / fold state mid-stream, the plugin does **not** retroactively migrate or rewrite the old callout. The next mutation will append a fresh callout with the new configured header; the old one stays in place for you to delete manually if you want to.

## Development

```sh
npm install          # one-time
npm run dev          # esbuild watch — rebuilds main.js on every save
npm run build        # production build
npx tsc --noEmit     # typecheck only
```

To test locally, symlink (or copy) this folder into `<vault>/.obsidian/plugins/daily-checklist/`, then enable the plugin in Community plugins.

Both `npm run build` and `npx tsc --noEmit` should pass clean before shipping any change.

## Release files

A GitHub release should attach exactly three files at the top level:

- `main.js`
- `manifest.json`
- `styles.css`

Users drop those three into `<vault>/.obsidian/plugins/daily-checklist/`.

## License

MIT — see [LICENSE](./LICENSE).
