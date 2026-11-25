// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// "Add to Desktop" everywhere:
// - AppMenuIntegration adds the entry to the right-click menu of applications
//   (app grid, dash and any other AppMenu of the Shell);
// - FilesIntegration adds it to the right-click menu of Files (Nautilus): a
//   nautilus-python extension when nautilus-python is installed, otherwise a
//   Nautilus script (shown under "Scripts"). The generated files are removed
//   when the extension is disabled or the option is turned off.
// The actual work is done by app/addToDesktop.js in a separate process.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {InjectionManager, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {hasNautilusPython} from './nautilusPython.js';

Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'trash_async');
Gio._promisify(Gio.File.prototype, 'delete_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'set_attributes_async');

const PYTHON_EXTENSION_NAME = 'deskicons-add-to-desktop.py';

function desktopDir() {
    const dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
    if (dir && dir !== GLib.get_home_dir())
        return Gio.File.new_for_path(dir);
    return Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), 'Desktop']));
}

async function exists(file) {
    try {
        await file.query_info_async('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT, null);
        return true;
    } catch {
        return false;
    }
}

async function deleteIfExists(file) {
    try {
        await file.delete_async(GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw e;
    }
}

async function writeFile(file, text, mode) {
    try {
        file.get_parent().make_directory_with_parents(null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
    await file.replace_contents_bytes_async(new GLib.Bytes(new TextEncoder().encode(text)),
        null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const info = new Gio.FileInfo();
    info.set_attribute_uint32('unix::mode', mode);
    await file.set_attributes_async(info, Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT, null);
}

function runWorker(extensionPath, args) {
    const gjs = GLib.find_program_in_path('gjs');
    if (!gjs)
        return;
    try {
        Gio.Subprocess.new([gjs, '-m', `${extensionPath}/app/addToDesktop.js`, ...args],
            Gio.SubprocessFlags.NONE);
    } catch (e) {
        logError(e, 'DeskIcons: cannot add to the desktop');
    }
}

export class AppMenuIntegration {
    constructor(extensionPath) {
        this._extensionPath = extensionPath;
        this._injections = new InjectionManager();
        this._items = new Map(); // AppMenu -> PopupMenuItem
    }

    enable() {
        const self = this;
        this._injections.overrideMethod(AppMenu.AppMenu.prototype, 'open', original =>
            function (...args) {
                self._sync(this);
                return original.apply(this, args);
            });
    }

    destroy() {
        this._injections.clear();
        for (const item of this._items.values())
            item.destroy();
        this._items.clear();
    }

    _sync(menu) {
        const path = menu._app?.app_info?.get_filename?.() ?? null;
        let item = this._items.get(menu);
        if (!item) {
            if (!path)
                return;
            item = new PopupMenu.PopupMenuItem(_('Add to Desktop'));
            item.connect('activate', () => this._toggle(item));
            item.connect('destroy', () => this._items.delete(menu));
            // Right after "Pin to Dash", where available
            const items = menu._getMenuItems();
            const anchor = items.indexOf(menu._toggleFavoriteItem);
            menu.addMenuItem(item, anchor >= 0 ? anchor + 1 : undefined);
            this._items.set(menu, item);
        }

        item.visible = path !== null;
        if (!path)
            return;
        item._source = path;
        item._onDesktop = false;
        item.label.text = _('Add to Desktop');
        const launcher = desktopDir().get_child(GLib.path_get_basename(path));
        exists(launcher).then(found => {
            if (item._source !== path)
                return;
            item._onDesktop = found;
            item.label.text = found ? _('Remove from Desktop') : _('Add to Desktop');
        });
    }

    _toggle(item) {
        const name = GLib.path_get_basename(item._source);
        if (!item._onDesktop) {
            runWorker(this._extensionPath, [item._source]);
            return;
        }
        desktopDir().get_child(name).trash_async(GLib.PRIORITY_DEFAULT, null)
            .catch(e => logError(e, 'DeskIcons: cannot remove the launcher from the desktop'));
    }
}

export class FilesIntegration {
    constructor(extensionPath, settings) {
        this._extensionPath = extensionPath;
        this._settings = settings;
        // Operations run one after the other, so that a removal requested by
        // disable() cannot be overtaken by an installation still in progress
        this._queue = Promise.resolve();

        const data = GLib.get_user_data_dir();
        this._pythonFile = Gio.File.new_for_path(GLib.build_filenamev(
            [data, 'nautilus-python', 'extensions', PYTHON_EXTENSION_NAME]));
        this._scriptsDir = Gio.File.new_for_path(GLib.build_filenamev(
            [data, 'nautilus', 'scripts']));
    }

    enable() {
        this._settings.connectObject('changed::files-integration', () => this._sync(), this);
        this._sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._enqueue(() => this._uninstall());
    }

    _enqueue(task) {
        this._queue = this._queue.then(task).catch(e =>
            logError(e, 'DeskIcons: Files integration'));
    }

    _sync() {
        const wanted = this._settings.get_boolean('files-integration') &&
            GLib.find_program_in_path('nautilus') !== null;
        this._enqueue(() => wanted ? this._install() : this._uninstall());
    }

    async _install() {
        const gjs = GLib.find_program_in_path('gjs');
        if (!gjs)
            return;
        const worker = `${this._extensionPath}/app/addToDesktop.js`;
        const label = _('Add to Desktop');

        if (hasNautilusPython()) {
            await this._removeScript();
            await writeFile(this._pythonFile,
                pythonExtension(gjs, worker, label, _('Show the selected items on the desktop')),
                0o644);
            return;
        }

        await deleteIfExists(this._pythonFile);
        // The script name is the label of the menu entry: it follows the language
        const old = this._settings.get_string('nautilus-script-name');
        if (old && old !== label)
            await this._removeScript();
        await writeFile(this._scriptsDir.get_child(label), nautilusScript(gjs, worker), 0o755);
        this._settings.set_string('nautilus-script-name', label);
    }

    async _uninstall() {
        await deleteIfExists(this._pythonFile);
        await this._removeScript();
    }

    async _removeScript() {
        const name = this._settings.get_string('nautilus-script-name');
        if (!name)
            return;
        await deleteIfExists(this._scriptsDir.get_child(name));
        this._settings.set_string('nautilus-script-name', '');
    }
}

function nautilusScript(gjs, worker) {
    return `#!/bin/sh
# Generated by the Desktop Icons GNOME Shell extension (deskicons@euschi.github.io):
# adds the selected items to the desktop. Removed when the extension is disabled.
exec ${GLib.shell_quote(gjs)} -m ${GLib.shell_quote(worker)} "$@"
`;
}

function pythonExtension(gjs, worker, label, tip) {
    // JSON string literals are valid Python string literals
    const str = JSON.stringify;
    return `# Generated by the Desktop Icons GNOME Shell extension (deskicons@euschi.github.io):
# adds "Add to Desktop" to the context menu of Files. Removed when the extension is disabled.
import os

# No gi.require_version(): nautilus-python has already loaded the Nautilus
# API in the version of the running Nautilus (4.0, 4.1...)
from gi.repository import GLib, GObject, Gio, Nautilus

GJS = ${str(gjs)}
WORKER = ${str(worker)}
LABEL = ${str(label)}
TIP = ${str(tip)}


def desktop_dir():
    home = GLib.get_home_dir()
    path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP)
    if not path or path == home:
        path = os.path.join(home, 'Desktop')
    return os.path.realpath(path)


class DeskIconsAddToDesktop(GObject.GObject, Nautilus.MenuProvider):
    def get_file_items(self, files):
        desktop = desktop_dir()
        uris = []
        for f in files:
            location = f.get_location()
            path = location.get_path() if location else None
            if not path or path == desktop or os.path.dirname(path) == desktop:
                continue
            uris.append(f.get_uri())
        if not uris or not os.path.exists(WORKER):
            return []
        item = Nautilus.MenuItem(name='DeskIcons::AddToDesktop', label=LABEL, tip=TIP)
        item.connect('activate', self._activate, uris)
        return [item]

    def _activate(self, _item, uris):
        Gio.Subprocess.new([GJS, '-m', WORKER] + uris, Gio.SubprocessFlags.NONE)
`;
}
