// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// "Add to Desktop":
// - AppMenuIntegration adds the entry to the right-click menu of applications
//   (app grid, dash and any other AppMenu of the Shell);
// - DesktopService exports the same action on the session bus, so that other
//   programs (e.g. the optional Files add-on in the nautilus/ folder of the
//   project, distributed separately) can use it.
//
// .desktop launchers are copied and marked as trusted, so they can be launched
// from the desktop right away; any other file or folder gets a symbolic link.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {InjectionManager, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'trash_async');
Gio._promisify(Gio.File.prototype, 'copy_async');
Gio._promisify(Gio.File.prototype, 'make_directory_async');
Gio._promisify(Gio.File.prototype, 'make_symbolic_link_async');
Gio._promisify(Gio.File.prototype, 'set_attributes_async');

const BUS_NAME = 'io.github.euschi.DeskIcons';
const OBJECT_PATH = '/io/github/euschi/DeskIcons';
const INTERFACE_XML = `
<node>
  <interface name="io.github.euschi.DeskIcons.Desktop1">
    <method name="AddFiles">
      <arg type="as" name="uris" direction="in"/>
    </method>
    <property name="Label" type="s" access="read"/>
    <property name="Tooltip" type="s" access="read"/>
    <property name="DesktopPath" type="s" access="read"/>
  </interface>
</node>`;

const QUERY = 'standard::type,standard::symlink-target,unix::mode';

function desktopDir() {
    const dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
    if (dir && dir !== GLib.get_home_dir())
        return Gio.File.new_for_path(dir);
    return Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), 'Desktop']));
}

// Info of the file itself (symlinks not followed), or null if it does not exist
async function queryInfo(file) {
    try {
        return await file.query_info_async(QUERY, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw e;
    }
}

// Returns a child of `dir` not yet present (e.g. "Notes 2.txt")
async function uniqueChild(dir, name) {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 1; ; i++) {
        const child = dir.get_child(i === 1 ? name : `${base} ${i}${ext}`);
        // eslint-disable-next-line no-await-in-loop
        if (!await queryInfo(child))
            return child;
    }
}

async function copyLauncher(file, desktop) {
    const dest = desktop.get_child(file.get_basename());
    if (await queryInfo(dest))
        return;
    await file.copy_async(dest, Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, null, null);
    const mode = (await queryInfo(dest)).get_attribute_uint32('unix::mode');
    const info = new Gio.FileInfo();
    info.set_attribute_uint32('unix::mode', mode | 0o111);
    info.set_attribute_string('metadata::trusted', 'true');
    await dest.set_attributes_async(info, Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT, null);
}

async function linkFile(file, desktop) {
    const target = file.get_path();
    // Already linked: do not create "name 2", "name 3"...
    const existing = await queryInfo(desktop.get_child(file.get_basename()));
    if (existing?.get_symlink_target() === target)
        return;
    const dest = await uniqueChild(desktop, file.get_basename());
    await dest.make_symbolic_link_async(target, GLib.PRIORITY_DEFAULT, null);
}

export async function addToDesktop(files) {
    const desktop = desktopDir();
    try {
        await desktop.make_directory_async(GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }

    for (const file of files) {
        // Only local files; nothing to do for the desktop itself or its contents
        if (!file.get_path() || file.equal(desktop) || file.get_parent()?.equal(desktop))
            continue;
        try {
            /* eslint-disable no-await-in-loop */
            const info = await file.query_info_async(QUERY, Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT, null);
            if (file.get_basename().endsWith('.desktop') &&
                info.get_file_type() === Gio.FileType.REGULAR)
                await copyLauncher(file, desktop);
            else
                await linkFile(file, desktop);
            /* eslint-enable no-await-in-loop */
        } catch (e) {
            logError(e, `DeskIcons: cannot add ${file.get_path()} to the desktop`);
        }
    }
}

export class AppMenuIntegration {
    constructor() {
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
            const anchor = menu._getMenuItems().indexOf(menu._toggleFavoriteItem);
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
        queryInfo(launcher).catch(() => null).then(info => {
            if (item._source !== path)
                return;
            item._onDesktop = info !== null;
            item.label.text = item._onDesktop ? _('Remove from Desktop') : _('Add to Desktop');
        });
    }

    _toggle(item) {
        const source = Gio.File.new_for_path(item._source);
        if (!item._onDesktop) {
            addToDesktop([source]).catch(e => logError(e, 'DeskIcons: Add to Desktop'));
            return;
        }
        desktopDir().get_child(source.get_basename()).trash_async(GLib.PRIORITY_DEFAULT, null)
            .catch(e => logError(e, 'DeskIcons: cannot remove the launcher from the desktop'));
    }
}

// D-Bus interface io.github.euschi.DeskIcons.Desktop1 on the session bus
export class DesktopService {
    constructor() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(INTERFACE_XML, this);
        this._ownerId = 0;
    }

    enable() {
        this._dbus.export(Gio.DBus.session, OBJECT_PATH);
        this._ownerId = Gio.bus_own_name_on_connection(Gio.DBus.session, BUS_NAME,
            Gio.BusNameOwnerFlags.NONE, null, null);
    }

    destroy() {
        if (this._ownerId) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }
        this._dbus.unexport();
    }

    // Label of the menu entry, in the language of the session
    get Label() {
        return _('Add to Desktop');
    }

    get Tooltip() {
        return _('Show the selected items on the desktop');
    }

    get DesktopPath() {
        return desktopDir().get_path();
    }

    AddFiles(uris) {
        const files = uris.filter(u => u.startsWith('file://')).map(u => Gio.File.new_for_uri(u));
        addToDesktop(files).catch(e => logError(e, 'DeskIcons: AddFiles'));
    }
}
