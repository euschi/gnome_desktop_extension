// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Elenco degli elementi da mostrare sul desktop: file della cartella Scrivania
// più gli elementi speciali (Home, Cestino, unità montate). Tiene tutto
// aggiornato con Gio.FileMonitor / Gio.VolumeMonitor.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {desktopDir, newDesktopAppInfo} from './utils.js';

const FILE_ATTRIBUTES = [
    'standard::name', 'standard::display-name', 'standard::type',
    'standard::icon', 'standard::is-hidden', 'standard::is-backup',
    'standard::is-symlink', 'standard::content-type', 'standard::size',
    'time::modified', 'metadata::trusted', 'access::can-execute',
    'unix::mode', 'id::filesystem', 'trash::item-count',
].join(',');

const RELOAD_DELAY_MS = 120;

export class DesktopItem {
    constructor(props) {
        Object.assign(this, props);
    }

    get uri() {
        return this.file.get_uri();
    }

    get path() {
        return this.file.get_path();
    }

    // Tipi di elementi
    get isSpecial() {
        return this.kind !== 'file';
    }

    get isDir() {
        if (this.kind !== 'file')
            return true;
        return this.info.get_file_type() === Gio.FileType.DIRECTORY;
    }

    get isLauncher() {
        return this.kind === 'file' && this.appInfo !== null;
    }

    get isTrusted() {
        if (!this.isLauncher)
            return true;
        return this.info.get_attribute_string('metadata::trusted') === 'true' &&
            this.info.get_attribute_boolean('access::can-execute');
    }

    get contentType() {
        return this.info?.get_content_type() ?? 'inode/directory';
    }

    get mtime() {
        return this.info?.get_attribute_uint64('time::modified') ?? 0;
    }

    get size() {
        return this.info?.get_size() ?? 0;
    }

    get isSymlink() {
        return this.info?.has_attribute('standard::is-symlink')
            ? this.info.get_is_symlink() : false;
    }
}

export class DesktopModel {
    constructor(settings, onChanged) {
        this._settings = settings;
        this._onChanged = onChanged;
        this.dir = desktopDir();
        this.items = new Map();
        this._reloadId = 0;
        this._loading = false;
        this._pending = false;
        this._renamed = []; // [oldName, newName]
        this.onRename = null;
    }

    start() {
        try {
            if (!this.dir.query_exists(null))
                this.dir.make_directory_with_parents(null);
        } catch (e) {
            console.error(`DeskIcons: ${e.message}`);
        }

        this._dirMonitor = this.dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._dirMonitor.connect('changed', (_m, file, other, event) => {
            if (event === Gio.FileMonitorEvent.RENAMED && other)
                this.onRename?.(file.get_basename(), other.get_basename());
            this.scheduleReload();
        });

        this._trashMonitor = Gio.File.new_for_uri('trash:///').monitor_directory(
            Gio.FileMonitorFlags.NONE, null);
        this._trashMonitor.connect('changed', () => this.scheduleReload());

        this._volumeMonitor = Gio.VolumeMonitor.get();
        this._volumeIds = ['mount-added', 'mount-removed', 'mount-changed'].map(s =>
            this._volumeMonitor.connect(s, () => this.scheduleReload()));

        this._settingsIds = ['show-home', 'show-trash', 'show-volumes',
            'show-network-volumes', 'show-hidden'].map(k =>
            this._settings.connect(`changed::${k}`, () => this.scheduleReload()));

        this.reload();
    }

    destroy() {
        if (this._reloadId)
            GLib.source_remove(this._reloadId);
        this._dirMonitor?.cancel();
        this._trashMonitor?.cancel();
        for (const id of this._volumeIds ?? [])
            this._volumeMonitor.disconnect(id);
        for (const id of this._settingsIds ?? [])
            this._settings.disconnect(id);
    }

    scheduleReload() {
        if (this._reloadId)
            return;
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RELOAD_DELAY_MS, () => {
            this._reloadId = 0;
            this.reload();
            return GLib.SOURCE_REMOVE;
        });
    }

    async reload() {
        if (this._loading) {
            this._pending = true;
            return;
        }
        this._loading = true;
        try {
            const items = new Map();
            for (const item of await this._loadSpecials())
                items.set(item.id, item);
            for (const item of await this._loadFiles())
                items.set(item.id, item);
            this.items = items;
            this._onChanged(this.items);
        } catch (e) {
            console.error(`DeskIcons: errore caricamento desktop: ${e.message}`);
        } finally {
            this._loading = false;
            if (this._pending) {
                this._pending = false;
                this.scheduleReload();
            }
        }
    }

    async _loadFiles() {
        const showHidden = this._settings.get_boolean('show-hidden');
        const result = [];
        const enumerator = await this.dir.enumerate_children_async(FILE_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const infos = await enumerator.next_files_async(100, GLib.PRIORITY_DEFAULT, null);
            if (!infos.length)
                break;
            for (const info of infos) {
                if (!showHidden && (info.get_is_hidden() || info.get_is_backup()))
                    continue;
                const name = info.get_name();
                const file = this.dir.get_child(name);
                let appInfo = null;
                if (name.endsWith('.desktop') && info.get_file_type() === Gio.FileType.REGULAR)
                    appInfo = newDesktopAppInfo(file.get_path());
                result.push(new DesktopItem({
                    id: `file:${name}`,
                    kind: 'file',
                    name,
                    file,
                    info,
                    appInfo,
                    displayName: appInfo?.get_display_name() ?? info.get_display_name(),
                    gicon: appInfo?.get_icon() ?? info.get_icon(),
                }));
            }
        }
        enumerator.close_async(GLib.PRIORITY_DEFAULT, null).catch(() => {});
        return result;
    }

    async _queryInfo(file) {
        try {
            return await file.query_info_async(FILE_ATTRIBUTES,
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
        } catch {
            return null;
        }
    }

    async _loadSpecials() {
        const result = [];

        if (this._settings.get_boolean('show-home')) {
            const file = Gio.File.new_for_path(GLib.get_home_dir());
            const info = await this._queryInfo(file);
            if (info) {
                result.push(new DesktopItem({
                    id: 'home', kind: 'home', name: 'home', file, info, appInfo: null,
                    displayName: 'Home',
                    gicon: Gio.ThemedIcon.new('user-home'),
                }));
            }
        }

        if (this._settings.get_boolean('show-trash')) {
            const file = Gio.File.new_for_uri('trash:///');
            const info = await this._queryInfo(file);
            const full = (info?.get_attribute_uint32('trash::item-count') ?? 0) > 0;
            result.push(new DesktopItem({
                id: 'trash', kind: 'trash', name: 'trash', file, info, appInfo: null,
                displayName: 'Cestino',
                gicon: Gio.ThemedIcon.new(full ? 'user-trash-full' : 'user-trash'),
                trashFull: full,
            }));
        }

        const showLocal = this._settings.get_boolean('show-volumes');
        const showNet = this._settings.get_boolean('show-network-volumes');
        if (showLocal || showNet) {
            for (const mount of this._volumeMonitor.get_mounts()) {
                if (mount.is_shadowed())
                    continue;
                const root = mount.get_root();
                const isNet = !root.is_native() ||
                    mount.get_volume()?.get_identifier('class') === 'network';
                if ((isNet && !showNet) || (!isNet && !showLocal))
                    continue;
                result.push(new DesktopItem({
                    id: `mount:${root.get_uri()}`, kind: 'mount', name: mount.get_name(),
                    file: root, info: null, appInfo: null, mount,
                    displayName: mount.get_name(),
                    gicon: mount.get_icon(),
                }));
            }
        }
        return result;
    }
}
