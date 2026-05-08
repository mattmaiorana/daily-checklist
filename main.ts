import {
  App,
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Scope,
  Setting,
  TFile,
  TFolder,
  WorkspaceLeaf,
  moment,
  normalizePath,
  setIcon,
} from "obsidian";

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEW_TYPE = "daily-checklist-view";
const CHECKLIST_CALLOUT_HEADER = "> [!todo]- Daily Checklist";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChecklistState {
  date: string;
  checked: Record<string, boolean>;
}

interface DailyChecklistSettings {
  showChecklist: boolean;
  writeChecklistToDailyNote: boolean;
  dailyNoteFolder: string;
  dailyNoteDateFormat: string;
  dailyNoteTemplatePath: string;
  checklistItems: string[];
  checklistState: ChecklistState;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CHECKLIST: string[] = [
  "Read books to kids",
  "Dinner at the table",
  "Evening walk",
  "Journal",
  "7hrs of sleep",
];

const DEFAULT_SETTINGS: DailyChecklistSettings = {
  showChecklist: true,
  writeChecklistToDailyNote: true,
  dailyNoteFolder: "Daily Notes",
  dailyNoteDateFormat: "YYYY-MM-DD",
  dailyNoteTemplatePath: "",
  checklistItems: DEFAULT_CHECKLIST,
  checklistState: { date: "", checked: {} },
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateForPath(folder: string, fmt: string, date: Date = new Date()): string {
  // Use moment for full token support: YYYY, MM, MMMM, DD, dddd, [literals], and
  // forward slashes inside the format that resolve to nested folder segments.
  const effectiveFmt = (fmt && fmt.trim()) || "YYYY-MM-DD";
  const filename = moment(date).format(effectiveFmt);
  const directory = (folder ?? "").trim();
  const joined = directory ? `${directory}/${filename}` : filename;
  const normalized = normalizePath(joined);
  return normalized.endsWith(".md") ? normalized : `${normalized}.md`;
}

async function ensureParentFolderExists(app: App, path: string): Promise<void> {
  const segments = path.split("/");
  segments.pop(); // drop basename
  if (segments.length === 0) return;

  const accumulated: string[] = [];
  for (const segment of segments) {
    if (!segment) continue;
    accumulated.push(segment);
    const ancestor = normalizePath(accumulated.join("/"));
    if (app.vault.getAbstractFileByPath(ancestor)) continue;
    try {
      await app.vault.createFolder(ancestor);
    } catch (err) {
      // Race: another concurrent caller may have just created it.
      if (!app.vault.getAbstractFileByPath(ancestor)) throw err;
    }
  }
}

// ── Daily Note I/O ────────────────────────────────────────────────────────────

async function getOrCreateDailyNote(
  app: App,
  settings: DailyChecklistSettings,
  date: Date = new Date()
): Promise<TFile> {
  const path = formatDateForPath(settings.dailyNoteFolder, settings.dailyNoteDateFormat, date);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;

  let content = "";
  const tmplRaw = settings.dailyNoteTemplatePath?.trim();
  if (tmplRaw) {
    const tmplPath = normalizePath(tmplRaw);
    const tmpl = app.vault.getAbstractFileByPath(tmplPath);
    if (tmpl instanceof TFile) {
      content = await app.vault.read(tmpl);
    } else {
      new Notice("Daily Checklist: template file not found, creating empty note.");
    }
  }

  await ensureParentFolderExists(app, path);

  try {
    return await app.vault.create(path, content);
  } catch (err) {
    // Race: another concurrent caller may have just created the file.
    const justCreated = app.vault.getAbstractFileByPath(path);
    if (justCreated instanceof TFile) return justCreated;
    throw err;
  }
}

async function rewriteChecklistSection(
  app: App,
  settings: DailyChecklistSettings
): Promise<void> {
  if (!settings.writeChecklistToDailyNote) return;
  const file = await getOrCreateDailyNote(app, settings);

  const calloutLines: string[] = [CHECKLIST_CALLOUT_HEADER];
  for (const item of settings.checklistItems) {
    const mark = settings.checklistState.checked[item] ? "x" : " ";
    calloutLines.push(`> - [${mark}] ${item}`);
  }

  await app.vault.process(file, (content) => {
    const lines = content.split("\n");
    const calloutStart = lines.findIndex(l => l === CHECKLIST_CALLOUT_HEADER);

    if (calloutStart !== -1) {
      // Callout extent = consecutive lines beginning with ">" starting at the
      // header. Stops at the first non-callout line.
      let calloutEnd = calloutStart + 1;
      while (calloutEnd < lines.length && lines[calloutEnd].startsWith(">")) calloutEnd++;
      lines.splice(calloutStart, calloutEnd - calloutStart, ...calloutLines);
      return lines.join("\n");
    }

    // Callout doesn't exist — append to end of file.
    return content.trimEnd() + `\n\n${calloutLines.join("\n")}\n`;
  });
}

// ── Settings input suggest ────────────────────────────────────────────────────
// Lightweight folder/file autocomplete for text inputs in the settings tab.
// Visually relies on Obsidian's native .suggestion-container / .suggestion-item
// / .is-selected styling, so the look is theme-driven.

abstract class TextInputSuggest<T> {
  protected app: App;
  protected inputEl: HTMLInputElement;
  private suggestEl: HTMLDivElement;
  private listEl: HTMLDivElement;
  private suggestionEls: HTMLDivElement[] = [];
  private values: T[] = [];
  private selectedIdx = 0;
  private isOpen = false;
  private scope: Scope;
  private repositionListener: () => void;

  constructor(app: App, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;

    this.scope = new Scope();
    this.scope.register([], "ArrowDown", (e) => {
      if (e.isComposing) return;
      this.setSelected(this.selectedIdx + 1, true);
      return false;
    });
    this.scope.register([], "ArrowUp", (e) => {
      if (e.isComposing) return;
      this.setSelected(this.selectedIdx - 1, true);
      return false;
    });
    this.scope.register([], "Enter", (e) => {
      if (e.isComposing) return;
      this.commit();
      return false;
    });
    this.scope.register([], "Escape", () => {
      this.close();
      return false;
    });

    this.suggestEl = createDiv({ cls: "suggestion-container dc-suggest" });
    this.listEl = this.suggestEl.createDiv({ cls: "suggestion" });

    inputEl.addEventListener("input", () => this.onInputChanged());
    inputEl.addEventListener("focus", () => this.onInputChanged());
    inputEl.addEventListener("blur", () => {
      window.setTimeout(() => this.close(), 100);
    });
    this.suggestEl.addEventListener("mousedown", (e) => e.preventDefault());

    this.repositionListener = () => { if (this.isOpen) this.position(); };
    window.addEventListener("scroll", this.repositionListener, true);
    window.addEventListener("resize", this.repositionListener);
  }

  private onInputChanged(): void {
    const values = this.getSuggestions(this.inputEl.value);
    if (values.length === 0) {
      this.close();
      return;
    }
    this.values = values;
    this.renderAll();
    this.open();
    this.setSelected(0, false);
  }

  private renderAll(): void {
    this.listEl.empty();
    this.suggestionEls = this.values.map((value) => {
      const el = this.listEl.createDiv({ cls: "suggestion-item" });
      this.renderSuggestion(value, el);
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const idx = this.suggestionEls.indexOf(el);
        if (idx === -1) return;
        this.selectedIdx = idx;
        this.commit();
      });
      el.addEventListener("mousemove", () => {
        const idx = this.suggestionEls.indexOf(el);
        if (idx !== -1) this.setSelected(idx, false);
      });
      return el;
    });
  }

  private setSelected(idx: number, scrollIntoView: boolean): void {
    if (this.suggestionEls.length === 0) return;
    const n = this.suggestionEls.length;
    const norm = ((idx % n) + n) % n;
    this.suggestionEls[this.selectedIdx]?.removeClass("is-selected");
    const next = this.suggestionEls[norm];
    next?.addClass("is-selected");
    if (scrollIntoView) next?.scrollIntoView({ block: "nearest" });
    this.selectedIdx = norm;
  }

  private commit(): void {
    const value = this.values[this.selectedIdx];
    if (value !== undefined) this.selectSuggestion(value);
    this.close();
  }

  private position(): void {
    const rect = this.inputEl.getBoundingClientRect();
    const style = this.suggestEl.style;
    style.position = "fixed";
    style.left = `${rect.left}px`;
    style.top = `${rect.bottom + 2}px`;
    style.width = `${rect.width}px`;
  }

  private open(): void {
    if (this.isOpen) {
      this.position();
      return;
    }
    document.body.appendChild(this.suggestEl);
    this.position();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app as any).keymap?.pushScope?.(this.scope);
    this.isOpen = true;
  }

  close(): void {
    if (!this.isOpen) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app as any).keymap?.popScope?.(this.scope);
    this.suggestEl.detach();
    this.isOpen = false;
  }

  abstract getSuggestions(input: string): T[];
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T): void;
}

class FolderSuggest extends TextInputSuggest<TFolder> {
  private onSelected: (path: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onSelected: (path: string) => void) {
    super(app, inputEl);
    this.onSelected = onSelected;
  }

  getSuggestions(input: string): TFolder[] {
    const lower = input.toLowerCase();
    const out: TFolder[] = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof TFolder && f.path.toLowerCase().includes(lower)) out.push(f);
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out.slice(0, 200);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.inputEl.value = folder.path;
    this.onSelected(folder.path);
    this.inputEl.dispatchEvent(new Event("input"));
  }
}

class MarkdownFileSuggest extends TextInputSuggest<TFile> {
  private onSelected: (path: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onSelected: (path: string) => void) {
    super(app, inputEl);
    this.onSelected = onSelected;
  }

  getSuggestions(input: string): TFile[] {
    const lower = input.toLowerCase();
    const out: TFile[] = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof TFile && f.extension === "md" && f.path.toLowerCase().includes(lower)) {
        out.push(f);
      }
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out.slice(0, 200);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.inputEl.value = file.path;
    this.onSelected(file.path);
    this.inputEl.dispatchEvent(new Event("input"));
  }
}

// ── Sidebar View ──────────────────────────────────────────────────────────────

class DailyChecklistView extends ItemView {
  plugin: DailyChecklistPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: DailyChecklistPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Daily Checklist"; }
  getIcon(): string { return "check-square"; }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    // Nothing to clean up — no intervals or external listeners owned here.
  }

  private get isTouchDevice(): boolean {
    return navigator.maxTouchPoints > 0;
  }

  refresh(): void {
    this.render();
  }

  render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("dc-root");

    if (this.plugin.settings.showChecklist) {
      this.renderChecklistSection(root);
    } else {
      root.createEl("div", {
        cls: "dc-empty-hint",
        text: "Daily Checklist is disabled. Enable it in plugin settings.",
      });
    }
  }

  private ensureChecklistResetToday(): void {
    const today = todayStr();
    if (this.plugin.settings.checklistState.date !== today) {
      this.plugin.settings.checklistState = { date: today, checked: {} };
    }
  }

  private renderChecklistSection(root: HTMLElement): void {
    this.ensureChecklistResetToday();
    const section = root.createEl("div", { cls: "dc-section" });

    const header = section.createEl("div", { cls: "dc-section-label" });
    header.createEl("span", { text: "DAILY CHECKLIST" });
    const editToggle = header.createEl("span", { cls: "dc-edit-toggle", text: "(edit)" });

    const list = section.createEl("div", { cls: "dc-checklist-list" });

    this.renderChecklistItems(list, false, editToggle);

    editToggle.onclick = () => {
      const isEditing = editToggle.getAttribute("data-editing") === "1";
      if (isEditing) {
        editToggle.textContent = "(edit)";
        editToggle.removeAttribute("data-editing");
        this.renderChecklistItems(list, false, editToggle);
      } else {
        editToggle.textContent = "(done)";
        editToggle.setAttribute("data-editing", "1");
        this.renderChecklistItems(list, true, editToggle);
      }
    };
  }

  private renderChecklistItems(container: HTMLElement, editMode: boolean, editBtn: HTMLElement): void {
    container.empty();
    const items = this.plugin.settings.checklistItems;
    const state = this.plugin.settings.checklistState;

    const dragState = { srcIdx: -1, insertIdx: -1 };
    items.forEach((item, itemIdx) => {
      const row = container.createEl("div", { cls: "dc-checklist-row" });

      if (editMode) {
        if (!this.isTouchDevice) {
          let dragHandleActive = false;
          const handle = row.createEl("span", { cls: "dc-drag-handle" });
          setIcon(handle, "grip-vertical");
          handle.addEventListener("mousedown", () => {
            dragHandleActive = true;
            document.addEventListener("mouseup", () => { dragHandleActive = false; }, { once: true });
          });

          row.setAttribute("draggable", "true");
          row.addEventListener("dragstart", (e) => {
            if (!dragHandleActive) { e.preventDefault(); return; }
            dragState.srcIdx = itemIdx;
            dragState.insertIdx = -1;
            e.dataTransfer!.effectAllowed = "move";
            row.addClass("dc-dragging");
          });
          row.addEventListener("dragover", (e) => {
            if (dragState.srcIdx === -1 || dragState.srcIdx === itemIdx) return;
            e.preventDefault();
            const rect = row.getBoundingClientRect();
            const isBottom = e.clientY > rect.top + rect.height / 2;
            dragState.insertIdx = isBottom ? itemIdx + 1 : itemIdx;
            container.querySelectorAll<HTMLElement>(".dc-drag-over, .dc-drag-over-bottom")
              .forEach(el => el.classList.remove("dc-drag-over", "dc-drag-over-bottom"));
            row.classList.add(isBottom ? "dc-drag-over-bottom" : "dc-drag-over");
          });
          row.addEventListener("dragleave", (e) => {
            if (!row.contains(e.relatedTarget as Node))
              row.classList.remove("dc-drag-over", "dc-drag-over-bottom");
          });
          row.addEventListener("drop", (e) => {
            e.preventDefault();
            row.classList.remove("dc-drag-over", "dc-drag-over-bottom");
            const src = dragState.srcIdx;
            const insertAt = dragState.insertIdx;
            if (src !== -1 && insertAt !== -1) {
              const adjustedInsert = src < insertAt ? insertAt - 1 : insertAt;
              if (adjustedInsert !== src) {
                const arr = this.plugin.settings.checklistItems;
                const [moved] = arr.splice(src, 1);
                arr.splice(adjustedInsert, 0, moved);
                this.plugin.saveSettings().then(() => {
                  this.renderChecklistItems(container, editMode, editBtn);
                  rewriteChecklistSection(this.app, this.plugin.settings).catch(console.error);
                });
              }
            }
          });
          row.addEventListener("dragend", () => {
            row.classList.remove("dc-dragging");
            dragState.srcIdx = -1;
            dragState.insertIdx = -1;
            container.querySelectorAll<HTMLElement>(".dc-drag-over, .dc-drag-over-bottom")
              .forEach(el => el.classList.remove("dc-drag-over", "dc-drag-over-bottom"));
          });
        }

        const delBtn = row.createEl("button", { cls: "dc-icon-btn dc-delete-btn", text: "✕" });
        delBtn.onclick = () => {
          this.plugin.settings.checklistItems = this.plugin.settings.checklistItems.filter(i => i !== item);
          delete this.plugin.settings.checklistState.checked[item];
          this.plugin.saveSettings().then(() => {
            this.renderChecklistItems(container, editMode, editBtn);
            rewriteChecklistSection(this.app, this.plugin.settings).catch(console.error);
          });
        };
        const label = row.createEl("input") as HTMLInputElement;
        label.type = "text";
        label.value = item;
        label.className = "dc-checklist-edit-input";
        label.onblur = () => {
          const newVal = label.value.trim();
          if (newVal && newVal !== item) {
            const idx = this.plugin.settings.checklistItems.indexOf(item);
            if (idx !== -1) {
              this.plugin.settings.checklistItems[idx] = newVal;
              if (state.checked[item] !== undefined) {
                state.checked[newVal] = state.checked[item];
                delete state.checked[item];
              }
              this.plugin.saveSettings().then(() => {
                this.renderChecklistItems(container, editMode, editBtn);
                rewriteChecklistSection(this.app, this.plugin.settings).catch(console.error);
              });
            }
          }
        };
      } else {
        const cb = row.createEl("input") as HTMLInputElement;
        cb.type = "checkbox";
        cb.checked = !!state.checked[item];
        cb.className = "dc-checklist-cb";
        cb.onchange = () => {
          state.checked[item] = cb.checked;
          const labelEl = row.querySelector(".dc-checklist-label") as HTMLElement | null;
          if (labelEl) labelEl.toggleClass("dc-checked", cb.checked);
          this.plugin.saveSettings().then(() => {
            rewriteChecklistSection(this.app, this.plugin.settings).catch(console.error);
          });
        };
        const labelEl = row.createEl("label", { cls: "dc-checklist-label", text: item });
        if (state.checked[item]) labelEl.addClass("dc-checked");
      }
    });

    if (editMode) {
      const addBtn = container.createEl("button", { cls: "dc-link-btn" });
      addBtn.createEl("span", { cls: "dc-link-plus", text: "+" });
      addBtn.createEl("span", { text: "Add item" });
      addBtn.onclick = () => {
        addBtn.remove();
        const addRow = container.createEl("div", { cls: "dc-checklist-row" });
        const input = addRow.createEl("input") as HTMLInputElement;
        input.type = "text";
        input.placeholder = "New item…";
        input.className = "dc-checklist-edit-input";
        input.focus();
        const commit = () => {
          const val = input.value.trim();
          if (val) {
            this.plugin.settings.checklistItems.push(val);
            this.plugin.saveSettings().then(() => {
              this.renderChecklistItems(container, true, editBtn);
              rewriteChecklistSection(this.app, this.plugin.settings).catch(console.error);
            });
          } else {
            this.renderChecklistItems(container, true, editBtn);
          }
        };
        input.onblur = commit;
        input.onkeydown = (e: KeyboardEvent) => {
          if (e.key === "Enter") { input.blur(); }
          if (e.key === "Escape") { input.value = ""; input.blur(); }
        };
      };
    }
  }
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

class DailyChecklistSettingTab extends PluginSettingTab {
  plugin: DailyChecklistPlugin;

  constructor(app: App, plugin: DailyChecklistPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Daily Checklist" });

    // ── Visibility ───────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Enable daily checklist")
      .setDesc("Show the Daily Checklist section in the sidebar.")
      .addToggle(t => t
        .setValue(this.plugin.settings.showChecklist)
        .onChange(async v => {
          this.plugin.settings.showChecklist = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(containerEl)
      .setName("Write checklist to daily note")
      .setDesc("Update the Daily Checklist callout in your daily note when items change.")
      .addToggle(t => t
        .setValue(this.plugin.settings.writeChecklistToDailyNote)
        .onChange(async v => { this.plugin.settings.writeChecklistToDailyNote = v; await this.plugin.saveSettings(); })
      );

    // ── Daily Notes ─────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Daily Notes" });

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc("Folder path where daily notes are stored.")
      .addText(t => {
        t.setPlaceholder("Daily Notes")
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange(async v => { this.plugin.settings.dailyNoteFolder = v; await this.plugin.saveSettings(); });
        new FolderSuggest(this.app, t.inputEl, async (path) => {
          this.plugin.settings.dailyNoteFolder = path;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Date format")
      .setDesc("Moment.js format for daily note filenames. Forward slashes create nested folders. Example: YYYY/MM-MMMM/YYYY-MM-DD - dddd [Note]")
      .addText(t => t
        .setPlaceholder("YYYY-MM-DD")
        .setValue(this.plugin.settings.dailyNoteDateFormat)
        .onChange(async v => { this.plugin.settings.dailyNoteDateFormat = v; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName("Daily note template path")
      .setDesc("Optional. Path to a template file used when creating new daily notes.")
      .addText(t => {
        t.setPlaceholder("Templates/Daily Note.md")
          .setValue(this.plugin.settings.dailyNoteTemplatePath)
          .onChange(async v => { this.plugin.settings.dailyNoteTemplatePath = v; await this.plugin.saveSettings(); });
        new MarkdownFileSuggest(this.app, t.inputEl, async (path) => {
          this.plugin.settings.dailyNoteTemplatePath = path;
          await this.plugin.saveSettings();
        });
      });

    // ── Checklist Items ─────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Checklist items" });

    const clList = containerEl.createEl("div");
    const renderClList = () => {
      clList.empty();
      const dragState = { srcIdx: -1, insertIdx: -1 };
      this.plugin.settings.checklistItems.forEach((item, idx) => {
        const setting = new Setting(clList).setName(item);

        let dragHandleActive = false;
        const grip = setting.settingEl.createEl("span", { cls: "dc-drag-handle" });
        setIcon(grip, "grip-vertical");
        setting.settingEl.prepend(grip);
        setting.settingEl.setAttribute("draggable", "true");

        grip.addEventListener("mousedown", () => {
          dragHandleActive = true;
          document.addEventListener("mouseup", () => { dragHandleActive = false; }, { once: true });
        });
        grip.addEventListener("click", e => e.stopPropagation());

        setting.settingEl.addEventListener("dragstart", e => {
          if (!dragHandleActive) { e.preventDefault(); return; }
          dragState.srcIdx = idx;
          dragState.insertIdx = -1;
          e.dataTransfer!.effectAllowed = "move";
          setting.settingEl.addClass("dc-dragging");
        });
        setting.settingEl.addEventListener("dragover", e => {
          if (dragState.srcIdx === -1 || dragState.srcIdx === idx) return;
          e.preventDefault();
          const rect = setting.settingEl.getBoundingClientRect();
          const isBottom = e.clientY > rect.top + rect.height / 2;
          dragState.insertIdx = isBottom ? idx + 1 : idx;
          clList.querySelectorAll<HTMLElement>(".dc-drag-over, .dc-drag-over-bottom")
            .forEach(el => el.classList.remove("dc-drag-over", "dc-drag-over-bottom"));
          setting.settingEl.classList.add(isBottom ? "dc-drag-over-bottom" : "dc-drag-over");
        });
        setting.settingEl.addEventListener("dragleave", e => {
          if (!setting.settingEl.contains(e.relatedTarget as Node))
            setting.settingEl.classList.remove("dc-drag-over", "dc-drag-over-bottom");
        });
        setting.settingEl.addEventListener("drop", e => {
          e.preventDefault();
          setting.settingEl.classList.remove("dc-drag-over", "dc-drag-over-bottom");
          const src = dragState.srcIdx;
          const insertAt = dragState.insertIdx;
          if (src !== -1 && insertAt !== -1) {
            const adjusted = src < insertAt ? insertAt - 1 : insertAt;
            if (adjusted !== src) {
              const arr = this.plugin.settings.checklistItems;
              const [moved] = arr.splice(src, 1);
              arr.splice(adjusted, 0, moved);
              this.plugin.saveSettings().then(() => { renderClList(); this.plugin.refreshViews(); });
            }
          }
        });
        setting.settingEl.addEventListener("dragend", () => {
          setting.settingEl.classList.remove("dc-dragging");
          dragState.srcIdx = -1;
          dragState.insertIdx = -1;
          clList.querySelectorAll<HTMLElement>(".dc-drag-over, .dc-drag-over-bottom")
            .forEach(el => el.classList.remove("dc-drag-over", "dc-drag-over-bottom"));
        });

        setting.addButton(btn => btn.setButtonText("Delete").setWarning().onClick(async () => {
          this.plugin.settings.checklistItems = this.plugin.settings.checklistItems.filter(i => i !== item);
          delete this.plugin.settings.checklistState.checked[item];
          await this.plugin.saveSettings();
          renderClList();
          this.plugin.refreshViews();
        }));
      });
    };
    renderClList();

    const addClSetting = new Setting(containerEl).addButton(btn => btn
      .setButtonText("+ Add item")
      .onClick(() => {
        const inputRow = createDiv({ cls: "dc-checklist-row" });
        const input = inputRow.createEl("input") as HTMLInputElement;
        input.type = "text";
        input.placeholder = "New item…";
        input.className = "dc-checklist-edit-input";
        addClSetting.settingEl.after(inputRow);
        input.focus();

        let done = false;
        const finish = (save: boolean) => {
          if (done) return;
          done = true;
          const val = input.value.trim();
          inputRow.remove();
          if (save && val) {
            this.plugin.settings.checklistItems.push(val);
            this.plugin.saveSettings().then(() => {
              renderClList();
              this.plugin.refreshViews();
            });
          }
        };
        input.addEventListener("blur", () => finish(true));
        input.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter")  { e.preventDefault(); finish(true); }
          if (e.key === "Escape") { finish(false); }
        });
      })
    );
    addClSetting.settingEl.addClass("dc-settings-action-row");
  }
}

// ── Main Plugin ───────────────────────────────────────────────────────────────

export default class DailyChecklistPlugin extends Plugin {
  settings!: DailyChecklistSettings;

  refreshViews(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf =>
      (leaf.view as DailyChecklistView).render()
    );
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new DailyChecklistView(leaf, this));

    this.addRibbonIcon("check-square", "Daily Checklist", async () => {
      await this.activateView();
    });

    this.addCommand({
      id: "open-daily-checklist",
      name: "Open Daily Checklist",
      callback: async () => { await this.activateView(); },
    });

    this.addSettingTab(new DailyChecklistSettingTab(this.app, this));

    // Reload state when the app returns to the foreground so two devices stay
    // in sync after the OS had backgrounded one of them. Read-only — never
    // writes to the daily note.
    const onVisibilityChange = async () => {
      if (document.hidden) return;
      await this.loadSettings();
      this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => {
        (leaf.view as DailyChecklistView).refresh();
      });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    this.register(() => document.removeEventListener("visibilitychange", onVisibilityChange));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) { workspace.revealLeaf(existing[0]); return; }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    // Defaults seed only on first run (no saved key). An empty array is a
    // user-meaningful state and is preserved.
    if (!saved?.checklistItems) this.settings.checklistItems = [...DEFAULT_CHECKLIST];
    if (!saved?.checklistState) this.settings.checklistState = { date: "", checked: {} };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
