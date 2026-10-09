// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Coordina modello, finestre, selezione, drag & drop, menù e azioni.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Adw from 'gi://Adw?version=1';

import {DesktopModel} from './desktopModel.js';
import {DesktopWindow} from './desktopWindow.js';
import {FileItem} from './fileItem.js';
import {PositionStore} from './positions.js';
import {Thumbnailer} from './thumbnails.js';
import {Clipboard} from './clipboard.js';
import {GridGeometry, computeLayout, arrangedLayout, itemSize} from './layout.js';
import * as FileOps from './fileOps.js';
import * as Menus from './menus.js';
import {_, ngettext} from './i18n.js';
import {launchContext, openTerminal, parseUriList, readStreamToString, spawn,
    uniqueName, uriListProvider} from './utils.js';

const UUID = 'deskicons@euschi.github.io';
const MENU_POINT_TTL_US = 30 * GLib.USEC_PER_SEC;

const APPEARANCE_KEYS = ['icon-size', 'label-lines', 'item-spacing', 'show-thumbnails'];
const LAYOUT_KEYS = ['start-corner', 'fill-direction', 'margin-top', 'margin-bottom',
    'margin-left', 'margin-right', 'snap-to-grid', 'keep-arranged'];
const SORT_KEYS = ['sort-by', 'sort-reverse', 'folders-first'];
const SETTINGS_ACTIONS = ['sort-by', 'sort-reverse', 'folders-first', 'keep-arranged',
    'snap-to-grid', 'show-hidden', 'icons-visible'];

const has = (state, mask) => (state & mask) !== 0;

export class DesktopController {
    constructor(app, settings, monitors, debug) {
        this.app = app;
        this.settings = settings;
        this._monitors = monitors;
        this._debug = debug;

        this.thumbnailer = new Thumbnailer();
        this._store = new PositionStore();
        this._clipboard = new Clipboard(() => this._syncCut());
        this._model = new DesktopModel(settings, items => this._onModelChanged(items));
        this._model.onRename = (oldName, newName) => this._onRenamed(oldName, newName);

        this.windows = [];
        this._widgets = new Map();   // id -> FileItem
        this._layout = new Map();    // id -> {m, c, r, x, y}
        this._hints = new Map();     // id -> {m, c, r}
        this._selection = new Set();
        this._anchor = null;
        this._pendingSingle = null;
        this._pendingRename = null;
        this._menuPoint = null;
        this._drag = null;
        this._dropHighlight = null;
        this._bandBase = null;
    }

    start() {
        this._loadCss();
        this._buildActions();

        for (const monitor of this._monitors) {
            const win = new DesktopWindow(this.app, this, monitor, this._debug);
            win.insert_action_group('desk', this._actions);
            this.windows.push(win);
            win.present();
        }
        this._syncLabelStyle();

        const on = (keys, cb) => keys.forEach(k => this.settings.connect(`changed::${k}`, cb));
        on(APPEARANCE_KEYS, () => {
            for (const w of this._widgets.values())
                w.applySettings(this.settings);
            this.relayout();
        });
        on(LAYOUT_KEYS, () => this.relayout());
        on(SORT_KEYS, () => this.settings.get_boolean('keep-arranged')
            ? this.relayout() : this.arrange());
        on(['icons-visible'], () => this.relayout());
        on(['label-style'], () => this._syncLabelStyle());

        this._model.start();
    }

    shutdown() {
        this._store.flush();
        this._model.destroy();
    }

    // ---------------------------------------------------------------- setup

    _loadCss() {
        const provider = new Gtk.CssProvider();
        const [file] = GLib.filename_from_uri(import.meta.url);
        const dir = GLib.path_get_dirname(file);
        provider.load_from_path(GLib.build_filenamev([dir, 'style.css']));
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    _syncLabelStyle() {
        const style = this.settings.get_string('label-style');
        for (const win of this.windows) {
            for (const s of ['shadow', 'background', 'none'])
                win.remove_css_class(`label-${s}`);
            win.add_css_class(`label-${style}`);
        }
    }

    _buildActions() {
        this._actions = new Gio.SimpleActionGroup();
        const add = (name, cb, paramType = null) => {
            const action = new Gio.SimpleAction({
                name,
                parameter_type: paramType ? new GLib.VariantType(paramType) : null,
            });
            action.connect('activate', (_a, param) => {
                Promise.resolve(cb(param?.unpack())).catch(e =>
                    console.error(`DeskIcons: action ${name}: ${e.message}`));
            });
            this._actions.add_action(action);
            return action;
        };

        // Elementi selezionati
        add('open', () => this._openSelection());
        add('open-with', id => this._openWith(id), 's');
        add('allow-launch', () => this._selectedItems().forEach(i => this._setTrusted(i)));
        add('cut', () => this._copySelection(true));
        add('copy', () => this._copySelection(false));
        add('copy-path', () => this._clipboard.setText(
            this._selectedFiles().map(i => i.path ?? i.uri).join('\n')));
        add('rename', () => this._renameSelection());
        add('trash', () => this._trashSelection());
        add('delete', () => FileOps.deleteUris(this._selectedFiles().map(i => i.uri)));
        add('show-in-files', () => FileOps.showItems(this._selectedFiles().map(i => i.uri)));
        add('open-terminal', () => {
            const path = this._selectedItems()[0]?.path;
            if (path)
                openTerminal(this.settings, path);
        });
        add('properties', () => FileOps.showProperties(
            this._selectedItems().filter(i => i.kind !== 'trash').map(i => i.uri)));
        add('empty-trash', () => FileOps.emptyTrash());
        add('eject', () => this._unmount(true));
        add('unmount', () => this._unmount(false));

        // Sfondo
        add('new-folder', () => this.newFolder());
        add('new-from-template', path => this._newFromTemplate(path), 's');
        add('paste', () => this._paste());
        add('undo', () => FileOps.undo());
        add('redo', () => FileOps.redo());
        add('select-all', () => this._setSelection(this._layout.keys()));
        add('arrange', () => this.arrange());
        add('open-terminal-desktop', () => openTerminal(this.settings, this._model.dir.get_path()));
        add('open-desktop-folder', () => FileOps.showFolders([this._model.dir.get_uri()]));
        add('change-background', () => spawn(['gnome-control-center', 'background']));
        add('preferences', () => spawn(['gnome-extensions', 'prefs', UUID]));

        for (const key of SETTINGS_ACTIONS)
            this._actions.add_action(this.settings.create_action(key));

        // Esposte anche a livello di applicazione per l'indicatore della Shell
        for (const name of ['arrange', 'new-folder', 'select-all', 'paste'])
            this.app.add_action(this._actions.lookup_action(name));
        const refresh = new Gio.SimpleAction({name: 'refresh'});
        refresh.connect('activate', () => this._model.reload());
        this.app.add_action(refresh);
    }

    _enable(name, enabled) {
        const action = this._actions.lookup_action(name);
        if (action instanceof Gio.SimpleAction)
            action.set_enabled(enabled);
    }

    // --------------------------------------------------------------- modello

    _onModelChanged(items) {
        this._store.prune(new Set([...items.keys()].filter(id => id.startsWith('file:'))));

        for (const [id, widget] of this._widgets) {
            if (!items.has(id)) {
                widget.get_parent()?.remove(widget);
                this._widgets.delete(id);
                this._selection.delete(id);
            }
        }
        for (const [id, item] of items) {
            const widget = this._widgets.get(id);
            if (!widget) {
                this._widgets.set(id, new FileItem(this, item));
            } else if (signature(widget.item) !== signature(item)) {
                widget.update(item);
            } else {
                widget.item = item;
            }
        }
        this.relayout();
        this._syncSelection();
        this._syncCut();

        if (this._pendingRename && this._widgets.has(this._pendingRename)) {
            const id = this._pendingRename;
            this._pendingRename = null;
            this._setSelection([id]);
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._startRename(this._widgets.get(id));
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _onRenamed(oldName, newName) {
        const oldId = `file:${oldName}`, newId = `file:${newName}`;
        this._store.rename(oldId, newId);
        if (this._selection.delete(oldId))
            this._selection.add(newId);
        if (this._anchor === oldId)
            this._anchor = newId;
    }

    _grids() {
        return this.windows.map(win => ({
            monitor: win.monitor.index,
            window: win,
            geometry: new GridGeometry(win.gridWidth, win.gridHeight, this.settings),
        }));
    }

    _windowFor(monitorIndex) {
        return this.windows.find(w => w.monitor.index === monitorIndex) ?? null;
    }

    relayout() {
        if (!this.windows.length)
            return;
        const grids = this._grids();
        const items = [...this._model.items.values()];
        this._layout = computeLayout(grids, items, this._store, this.settings, this._hints);
        const visible = this.settings.get_boolean('icons-visible');
        for (const [id, pos] of this._layout) {
            const widget = this._widgets.get(id);
            const win = this._windowFor(pos.m);
            if (!widget || !win)
                continue;
            win.addItemWidget(widget, pos.x, pos.y);
            widget.visible = visible;
        }
    }

    // "Disponi icone": ordina e salva le nuove posizioni
    arrange() {
        const layout = arrangedLayout(this._grids(), [...this._model.items.values()], this.settings);
        for (const [id, pos] of layout)
            this._store.set(id, pos);
        this.relayout();
    }

    // ------------------------------------------------------------ selezione

    _setSelection(ids) {
        this._selection = new Set(ids);
        this._syncSelection();
    }

    _syncSelection() {
        for (const [id, w] of this._widgets)
            w.setSelected(this._selection.has(id));
    }

    _syncCut() {
        for (const w of this._widgets.values())
            w.setCut(this._clipboard.cutUris.has(w.item.uri));
    }

    _selectedItems() {
        return [...this._selection].map(id => this._model.items.get(id)).filter(Boolean);
    }

    _selectedFiles() {
        return this._selectedItems().filter(i => i.kind === 'file');
    }

    _itemRect(id) {
        const pos = this._layout.get(id);
        const widget = this._widgets.get(id);
        if (!pos || !widget)
            return null;
        const size = itemSize(this.settings);
        return {
            m: pos.m, x: pos.x, y: pos.y,
            width: widget.get_width() || size.width,
            height: widget.get_height() || size.height,
        };
    }

    _idsInRect(monitor, rect) {
        const ids = [];
        for (const id of this._layout.keys()) {
            const r = this._itemRect(id);
            if (r && r.m === monitor && intersects(r, rect))
                ids.push(id);
        }
        return ids;
    }

    onItemPressed(win, widget, button, nPress, state, x, y) {
        const id = widget.item.id;
        const ctrl = has(state, Gdk.ModifierType.CONTROL_MASK);
        const shift = has(state, Gdk.ModifierType.SHIFT_MASK);
        this._pendingSingle = null;

        if (button === Gdk.BUTTON_PRIMARY) {
            if (nPress === 2 && !ctrl && !shift &&
                this.settings.get_string('click-policy') === 'double') {
                this._openSelection();
                return;
            }
            if (ctrl) {
                if (!this._selection.delete(id))
                    this._selection.add(id);
                this._anchor = id;
                this._syncSelection();
            } else if (shift && this._anchor && this._layout.has(this._anchor)) {
                this._selectRange(this._anchor, id);
            } else if (!this._selection.has(id)) {
                this._setSelection([id]);
                this._anchor = id;
            } else {
                // Potrebbe essere l'inizio di un drag della selezione multipla:
                // la riduzione alla singola icona avviene al rilascio
                this._pendingSingle = id;
                this._anchor = id;
            }
        } else if (button === Gdk.BUTTON_SECONDARY) {
            if (!this._selection.has(id)) {
                this._setSelection([id]);
                this._anchor = id;
            }
            this._showItemMenu(win, x, y);
        }
    }

    onItemReleased(win, widget, button, nPress, state) {
        if (button !== Gdk.BUTTON_PRIMARY)
            return;
        const id = widget.item.id;
        const plain = !has(state, Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.SHIFT_MASK);
        if (this._pendingSingle === id && plain)
            this._setSelection([id]);
        this._pendingSingle = null;
        if (plain && nPress === 1 && this.settings.get_string('click-policy') === 'single')
            this._openSelection();
    }

    _selectRange(fromId, toId) {
        const a = this._itemRect(fromId), b = this._itemRect(toId);
        if (!a || !b || a.m !== b.m) {
            this._selection.add(toId);
        } else {
            const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
            const x2 = Math.max(a.x + a.width, b.x + b.width);
            const y2 = Math.max(a.y + a.height, b.y + b.height);
            this._selection = new Set(this._idsInRect(a.m,
                {x: x1, y: y1, width: x2 - x1, height: y2 - y1}));
        }
        this._syncSelection();
    }

    onBackgroundPressed(win, button, state, x, y) {
        const modifiers = has(state, Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.SHIFT_MASK);
        if (button === Gdk.BUTTON_PRIMARY) {
            this._menuPoint = null;
            if (!modifiers)
                this._setSelection([]);
        } else if (button === Gdk.BUTTON_SECONDARY) {
            this._setSelection([]);
            this._menuPoint = {win, x, y, time: GLib.get_monotonic_time()};
            this._showBackgroundMenu(win, x, y);
        }
    }

    onRubberBandBegin(win, state) {
        const additive = has(state, Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.SHIFT_MASK);
        this._bandBase = additive ? new Set(this._selection) : new Set();
        this._bandToggle = has(state, Gdk.ModifierType.CONTROL_MASK);
    }

    onRubberBandUpdate(win, rect) {
        const sel = new Set(this._bandBase);
        for (const id of this._idsInRect(win.monitor.index, rect)) {
            if (this._bandToggle && this._bandBase.has(id))
                sel.delete(id);
            else
                sel.add(id);
        }
        this._setSelection(sel);
    }

    // ---------------------------------------------------------------- menù

    _showBackgroundMenu(win, x, y) {
        this._enable('paste', this._clipboard.canPaste());
        const undo = FileOps.undoStatus();
        this._enable('undo', undo === 1);
        this._enable('redo', undo === 2);
        win.popupMenu(Menus.backgroundMenu(), x, y);
    }

    _showItemMenu(win, x, y) {
        const items = this._selectedItems();
        if (!items.length)
            return;
        const single = items.length === 1 ? items[0] : null;
        let appsForType = [];
        const files = items.filter(i => i.kind === 'file');
        const types = new Set(files.map(i => i.contentType));
        if (files.length === items.length && types.size === 1 && !single?.isLauncher)
            appsForType = Gio.AppInfo.get_all_for_type([...types][0]).slice(0, 12);
        win.popupMenu(Menus.itemMenu({items, single, appsForType}), x, y);
    }

    // ------------------------------------------------------------- tastiera

    onKeyPressed(win, keyval, state) {
        const ctrl = has(state, Gdk.ModifierType.CONTROL_MASK);
        const shift = has(state, Gdk.ModifierType.SHIFT_MASK);
        const key = Gdk.keyval_to_lower(keyval);
        const act = name => {
            this._actions.activate_action(name, null);
            return true;
        };
        const hasSel = this._selection.size > 0;

        if (ctrl) {
            switch (key) {
            case Gdk.KEY_a: return act('select-all');
            case Gdk.KEY_c: return hasSel && act('copy');
            case Gdk.KEY_x: return hasSel && act('cut');
            case Gdk.KEY_v: return act('paste');
            case Gdk.KEY_z: return act(shift ? 'redo' : 'undo');
            case Gdk.KEY_y: return act('redo');
            case Gdk.KEY_n: return shift && act('new-folder');
            }
            return false;
        }
        switch (keyval) {
        case Gdk.KEY_Delete:
        case Gdk.KEY_KP_Delete:
            return hasSel && act(shift ? 'delete' : 'trash');
        case Gdk.KEY_F2:
            return hasSel && act('rename');
        case Gdk.KEY_Return:
        case Gdk.KEY_KP_Enter:
            return hasSel && act('open');
        case Gdk.KEY_Escape:
            this._setSelection([]);
            this._clipboard.clearCut();
            return true;
        case Gdk.KEY_Menu:
            return this._keyboardMenu(win);
        case Gdk.KEY_F10:
            return shift && this._keyboardMenu(win);
        case Gdk.KEY_Left: return this._moveFocus(win, -1, 0, shift);
        case Gdk.KEY_Right: return this._moveFocus(win, 1, 0, shift);
        case Gdk.KEY_Up: return this._moveFocus(win, 0, -1, shift);
        case Gdk.KEY_Down: return this._moveFocus(win, 0, 1, shift);
        }
        return false;
    }

    _keyboardMenu(win) {
        const rect = this._anchor && this._selection.has(this._anchor)
            ? this._itemRect(this._anchor) : null;
        if (rect)
            this._showItemMenu(this._windowFor(rect.m) ?? win, rect.x + rect.width / 2, rect.y + rect.height / 2);
        else
            this._showBackgroundMenu(win, win.gridWidth / 2, win.gridHeight / 2);
        return true;
    }

    _moveFocus(win, dx, dy, extend) {
        const current = this._anchor && this._layout.has(this._anchor) ? this._anchor : null;
        if (!current) {
            const first = [...this._layout.keys()][0];
            if (first) {
                this._anchor = first;
                this._setSelection([first]);
            }
            return true;
        }
        const from = this._itemRect(current);
        let best = null;
        for (const id of this._layout.keys()) {
            const r = this._itemRect(id);
            if (id === current || r.m !== from.m)
                continue;
            const ddx = r.x - from.x, ddy = r.y - from.y;
            const along = dx ? ddx * dx : ddy * dy;
            const across = Math.abs(dx ? ddy : ddx);
            if (along <= 0)
                continue;
            const score = along + across * 3;
            if (!best || score < best[0])
                best = [score, id];
        }
        if (best) {
            this._anchor = best[1];
            if (extend) {
                this._selection.add(best[1]);
                this._syncSelection();
            } else {
                this._setSelection([best[1]]);
            }
        }
        return true;
    }

    // --------------------------------------------------------- drag & drop

    onDragPrepare(widget, x, y) {
        const id = widget.item.id;
        if (!this._selection.has(id)) {
            this._setSelection([id]);
            this._anchor = id;
        }
        this._pendingSingle = null;
        const files = this._selectedItems().filter(i => i.kind !== 'trash').map(i => i.file);
        this._drag = {primary: id, offsetX: x, offsetY: y, ids: [...this._selection], files};
        return uriListProvider(files);
    }

    onDragEnd() {
        // Il drop (se interno) è già stato gestito
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._drag = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _isInternal(drop) {
        return !!(drop?.get_drag() && this._drag);
    }

    // File trasportati da un drop: noti subito se il drag è nostro,
    // altrimenti letti (una volta per drop) dal formato text/uri-list
    _dropFiles(drop) {
        if (this._isInternal(drop))
            return this._drag.files;
        return this._incoming?.drop === drop ? this._incoming.files : null;
    }

    async _readDropFiles(drop) {
        const [stream] = await drop.read_async(['text/uri-list'], GLib.PRIORITY_DEFAULT, null);
        return parseUriList(await readStreamToString(stream)).map(u => Gio.File.new_for_uri(u));
    }

    // Elemento su cui si può rilasciare (cartella, cestino, lanciatore)
    _dropTargetAt(win, drop, x, y) {
        const widget = win.itemAt(x, y);
        if (!widget || !widget.isDropTarget)
            return null;
        if (this._isInternal(drop) && this._drag.ids.includes(widget.item.id))
            return null;
        return widget;
    }

    _setDropHighlight(widget) {
        if (this._dropHighlight === widget)
            return;
        this._dropHighlight?.setDropHighlight(false);
        this._dropHighlight = widget;
        widget?.setDropHighlight(true);
    }

    // Azione predefinita come Nautilus: spostamento sullo stesso filesystem,
    // copia altrimenti (Ctrl/Shift sono gestiti dalla sorgente del drag)
    _defaultAction(files, destFile) {
        if (!files?.length)
            return Gdk.DragAction.COPY;
        try {
            const attr = 'id::filesystem';
            const a = files[0].query_info(attr, Gio.FileQueryInfoFlags.NONE, null).get_attribute_string(attr);
            const b = destFile.query_info(attr, Gio.FileQueryInfoFlags.NONE, null).get_attribute_string(attr);
            return a === b ? Gdk.DragAction.MOVE : Gdk.DragAction.COPY;
        } catch {
            return Gdk.DragAction.COPY;
        }
    }

    _pickAction(drop, preferred) {
        const allowed = drop.get_actions();
        if (allowed & preferred)
            return preferred;
        for (const a of [Gdk.DragAction.MOVE, Gdk.DragAction.COPY, Gdk.DragAction.LINK]) {
            if (allowed & a)
                return a;
        }
        return 0;
    }

    onDropMotion(win, drop, x, y, enter) {
        if (enter && !this._isInternal(drop) && this._incoming?.drop !== drop) {
            this._incoming = {drop, files: null};
            this._readDropFiles(drop).then(files => {
                if (this._incoming?.drop === drop)
                    this._incoming.files = files;
            }).catch(() => {});
        }
        const files = this._dropFiles(drop);
        const target = this._dropTargetAt(win, drop, x, y);
        this._setDropHighlight(target);
        let action;
        if (target?.item.kind === 'trash')
            action = this._pickAction(drop, Gdk.DragAction.MOVE);
        else if (target?.item.isLauncher)
            action = this._pickAction(drop, Gdk.DragAction.COPY);
        else if (target)
            action = this._pickAction(drop, this._defaultAction(files, target.item.file));
        else if (this._isInternal(drop))
            action = this._pickAction(drop, Gdk.DragAction.MOVE);
        else
            action = this._pickAction(drop, this._defaultAction(files, this._model.dir));
        this._lastDropAction = action;
        return action;
    }

    onDropLeave() {
        this._setDropHighlight(null);
    }

    async onDrop(win, drop, x, y) {
        this._setDropHighlight(null);
        let action = drop.get_actions();
        if (!Gdk.drag_action_is_unique(action))
            action = this._lastDropAction ?? Gdk.DragAction.COPY;
        try {
            const handled = await this._handleDrop(win, drop, x, y, action);
            drop.finish(handled ? action : 0);
        } catch (e) {
            console.error(`DeskIcons: drop failed: ${e.message}`);
            drop.finish(0);
        }
        this._incoming = null;
    }

    async _handleDrop(win, drop, x, y, action) {
        const target = this._dropTargetAt(win, drop, x, y);
        const internal = this._isInternal(drop);

        if (internal && !target) {
            this._moveDragged(win, x, y);
            return true;
        }

        const files = this._dropFiles(drop) ?? await this._readDropFiles(drop);
        const uris = files.map(f => f.get_uri());

        if (target) {
            const item = target.item;
            const sources = uris.filter(u => u !== item.uri);
            if (!sources.length)
                return false;
            if (item.kind === 'trash')
                await FileOps.trashUris(sources);
            else if (item.isLauncher)
                item.appInfo.launch_uris(sources, launchContext());
            else if (action & Gdk.DragAction.MOVE)
                await FileOps.moveUris(sources, item.uri);
            else
                await FileOps.copyUris(sources, item.uri);
            return true;
        }

        // File provenienti da un'altra applicazione
        const desktopUri = this._model.dir.get_uri();
        const incoming = files.filter(f => f.get_parent()?.get_uri() !== desktopUri);
        if (!incoming.length)
            return false;
        this._hintAt(win, x, y, incoming.map(f => `file:${f.get_basename()}`));
        if (action & Gdk.DragAction.MOVE)
            await FileOps.moveUris(incoming.map(f => f.get_uri()), desktopUri);
        else
            await FileOps.copyUris(incoming.map(f => f.get_uri()), desktopUri);
        return true;
    }

    _moveDragged(win, x, y) {
        const drag = this._drag;
        if (!drag || this.settings.get_boolean('keep-arranged'))
            return;
        const origin = this._layout.get(drag.primary);
        if (!origin)
            return;
        const geometry = new GridGeometry(win.gridWidth, win.gridHeight, this.settings);
        const baseX = x - drag.offsetX, baseY = y - drag.offsetY;
        let stray = 0;
        for (const id of drag.ids) {
            const pos = this._layout.get(id);
            if (!pos)
                continue;
            let dx = pos.x - origin.x, dy = pos.y - origin.y;
            if (pos.m !== origin.m) {
                // Elementi selezionati su un altro monitor: accodali
                stray++;
                dx = stray * geometry.cellWidth;
                dy = 0;
            }
            const [c, r] = geometry.pixelToCell(baseX + dx, baseY + dy);
            this._hints.set(id, {m: win.monitor.index, c, r});
        }
        this.relayout();
    }

    _hintAt(win, x, y, ids) {
        if (!win)
            return;
        const geometry = new GridGeometry(win.gridWidth, win.gridHeight, this.settings);
        const [c, r] = geometry.pixelToCell(x - geometry.itemWidth / 2, y - geometry.itemHeight / 3);
        ids.forEach((id, i) => {
            const offset = geometry.byColumns ? [0, i] : [i, 0];
            this._hints.set(id, {m: win.monitor.index, c: c + offset[0], r: r + offset[1]});
        });
    }

    _consumeMenuPoint() {
        const p = this._menuPoint;
        this._menuPoint = null;
        if (!p || GLib.get_monotonic_time() - p.time > MENU_POINT_TTL_US)
            return null;
        return p;
    }

    // ------------------------------------------------------------- azioni

    async _openItem(item) {
        const ctx = launchContext();
        if (item.isLauncher) {
            await this._launch(item);
            return;
        }
        if (item.kind === 'file' && !item.isDir) {
            await Gio.AppInfo.launch_default_for_uri_async(item.uri, ctx, null);
            return;
        }
        // Cartelle, Home, Cestino, unità
        await FileOps.showFolders([item.uri]);
    }

    _openSelection() {
        for (const item of this._selectedItems()) {
            this._openItem(item).catch(e =>
                console.error(`DeskIcons: opening ${item.displayName}: ${e.message}`));
        }
    }

    _openWith(appId) {
        const app = GioUnix.DesktopAppInfo.new(appId);
        app?.launch_uris(this._selectedFiles().map(i => i.uri), launchContext());
    }

    async _launch(item) {
        if (!item.isTrusted) {
            if (this.settings.get_string('launcher-policy') !== 'always') {
                const ok = await this._confirm(_('Untrusted Launcher'),
                    // Translators: %s is the name of the launcher
                    _('“%s” is not marked as trusted. Only launch it if you know where it comes from.')
                        .replace('%s', item.displayName),
                    _('Allow and Launch'), Adw.ResponseAppearance.SUGGESTED);
                if (!ok)
                    return;
            }
            this._setTrusted(item);
        }
        item.appInfo.launch([], launchContext());
    }

    _setTrusted(item) {
        if (!item.isLauncher)
            return;
        try {
            const mode = item.info.get_attribute_uint32('unix::mode');
            item.file.set_attribute_uint32('unix::mode', mode | 0o111,
                Gio.FileQueryInfoFlags.NONE, null);
            item.file.set_attribute_string('metadata::trusted', 'true',
                Gio.FileQueryInfoFlags.NONE, null);
        } catch (e) {
            console.error(`DeskIcons: cannot mark as trusted: ${e.message}`);
        }
        this._model.scheduleReload();
    }

    _copySelection(cut) {
        const files = this._selectedFiles();
        if (files.length)
            this._clipboard.set(files.map(i => i.file), cut);
    }

    async _paste() {
        const data = await this._clipboard.read();
        if (!data?.uris.length)
            return;
        const desktopUri = this._model.dir.get_uri();
        const point = this._consumeMenuPoint();
        if (point) {
            const names = data.uris.map(u => `file:${Gio.File.new_for_uri(u).get_basename()}`);
            this._hintAt(point.win, point.x, point.y, names);
        }
        if (data.cut) {
            await FileOps.moveUris(data.uris, desktopUri);
            this._clipboard.clearCut();
        } else {
            await FileOps.copyUris(data.uris, desktopUri);
        }
    }

    _startRename(widget) {
        if (!widget || widget.item.kind !== 'file')
            return;
        widget.startRename(name => FileOps.renameUri(widget.item.uri, name));
    }

    _renameSelection() {
        const items = this._selectedFiles();
        if (items.length === 1)
            this._startRename(this._widgets.get(items[0].id));
    }

    async _trashSelection() {
        const uris = this._selectedFiles().map(i => i.uri);
        if (!uris.length)
            return;
        if (this.settings.get_boolean('confirm-trash')) {
            const ok = await this._confirm(_('Move to Trash?'),
                // Translators: %d is the number of selected items
                ngettext('The selected item will be moved to the trash.',
                    '%d items will be moved to the trash.', uris.length)
                    .replace('%d', uris.length),
                _('Move to Trash'), Adw.ResponseAppearance.DESTRUCTIVE);
            if (!ok)
                return;
        }
        await FileOps.trashUris(uris);
    }

    async _unmount(eject) {
        const item = this._selectedItems().find(i => i.kind === 'mount');
        if (!item)
            return;
        const op = new Gtk.MountOperation({parent: this.windows[0]});
        try {
            if (eject)
                await item.mount.eject_with_operation(Gio.MountUnmountFlags.NONE, op, null);
            else
                await item.mount.unmount_with_operation(Gio.MountUnmountFlags.NONE, op, null);
        } catch (e) {
            await this._confirm(eject ? _('Unable to Eject') : _('Unable to Unmount'),
                e.message, null);
        }
    }

    _placeNew(id) {
        const point = this._consumeMenuPoint();
        if (point)
            this._hintAt(point.win, point.x, point.y, [id]);
    }

    async newFolder() {
        const name = uniqueName(this._model.dir, _('New Folder'));
        const id = `file:${name}`;
        this._placeNew(id);
        this._pendingRename = id;
        await FileOps.createFolder(this._model.dir.get_uri(), name);
    }

    async _newFromTemplate(path) {
        const template = Gio.File.new_for_path(path);
        const name = uniqueName(this._model.dir, template.get_basename());
        const id = `file:${name}`;
        this._placeNew(id);
        this._pendingRename = id;
        await FileOps.copyTemplate(template, this._model.dir.get_child(name));
    }

    // Dialogo di conferma; con `okLabel` null è solo informativo
    _confirm(heading, body, okLabel, appearance = Adw.ResponseAppearance.DEFAULT) {
        return new Promise(resolve => {
            const dialog = new Adw.AlertDialog({heading, body});
            if (okLabel) {
                dialog.add_response('cancel', _('Cancel'));
                dialog.add_response('ok', okLabel);
                dialog.set_response_appearance('ok', appearance);
                dialog.set_default_response('ok');
            } else {
                dialog.add_response('ok', _('OK'));
            }
            dialog.set_close_response('cancel');
            dialog.connect('response', (_d, response) => resolve(okLabel ? response === 'ok' : true));
            const win = this.windows.find(w => w.is_active()) ?? this.windows[0];
            dialog.present(win);
        });
    }
}

function intersects(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height;
}

function signature(item) {
    return [item.displayName, item.mtime, item.gicon?.to_string(), item.isTrusted,
        item.isSymlink, item.trashFull].join('|');
}
