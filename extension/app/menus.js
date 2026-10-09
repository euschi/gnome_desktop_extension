// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Modelli dei menù contestuali. Le voci puntano alle azioni del gruppo "desk"
// registrato dal DesktopController su ogni finestra.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {_} from './i18n.js';
import {templatesDir} from './utils.js';

function item(label, action, target = null) {
    const mi = Gio.MenuItem.new(label, null);
    if (target !== null)
        mi.set_action_and_target_value(`desk.${action}`, target);
    else
        mi.set_detailed_action(`desk.${action}`);
    return mi;
}

function section(...items) {
    const menu = new Gio.Menu();
    for (const mi of items.filter(Boolean))
        menu.append_item(mi);
    return menu;
}

function templatesMenu() {
    const dir = templatesDir();
    const menu = new Gio.Menu();
    if (!dir)
        return menu;
    try {
        const en = dir.enumerate_children('standard::display-name,standard::is-hidden,standard::type',
            Gio.FileQueryInfoFlags.NONE, null);
        const entries = [];
        let info;
        while ((info = en.next_file(null))) {
            if (info.get_is_hidden() || info.get_file_type() !== Gio.FileType.REGULAR)
                continue;
            entries.push([info.get_display_name(), dir.get_child(info.get_name()).get_path()]);
        }
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        for (const [name, path] of entries) {
            const label = name.replace(/\.[^.]+$/, '');
            menu.append_item(item(label, 'new-from-template', new GLib.Variant('s', path)));
        }
    } catch {
        // cartella modelli assente o illeggibile
    }
    return menu;
}

export function backgroundMenu() {
    const menu = new Gio.Menu();

    const create = section(item(_('New Folder'), 'new-folder'));
    const templates = templatesMenu();
    if (templates.get_n_items() > 0)
        create.append_submenu(_('New Document'), templates);
    menu.append_section(null, create);

    menu.append_section(null, section(
        item(_('Paste'), 'paste'),
        item(_('Undo'), 'undo'),
        item(_('Redo'), 'redo')));

    const sort = new Gio.Menu();
    for (const [key, label] of [['name', _('Name')], ['modified', _('Modification Date')],
        ['type', _('Type')], ['size', _('Size')]])
        sort.append_item(item(label, 'sort-by', new GLib.Variant('s', key)));
    sort.append_section(null, section(
        item(_('Reverse Order'), 'sort-reverse'),
        item(_('Folders First'), 'folders-first')));

    const arrange = section(
        item(_('Select All'), 'select-all'),
        item(_('Arrange Icons'), 'arrange'),
        item(_('Keep Arranged'), 'keep-arranged'),
        item(_('Align to Grid'), 'snap-to-grid'),
        item(_('Show Hidden Files'), 'show-hidden'));
    arrange.insert_submenu(1, _('Sort By'), sort);
    menu.append_section(null, arrange);

    menu.append_section(null, section(
        item(_('Open in Terminal'), 'open-terminal-desktop'),
        item(_('Open Desktop in Files'), 'open-desktop-folder')));

    menu.append_section(null, section(
        item(_('Change Background…'), 'change-background'),
        item(_('Show Icons'), 'icons-visible'),
        item(_('Icon Settings…'), 'preferences')));
    return menu;
}

// ctx: {items, single, appsForType}
export function itemMenu(ctx) {
    const {items, single} = ctx;
    const menu = new Gio.Menu();
    const kinds = new Set(items.map(i => i.kind));
    const onlyFiles = kinds.size === 1 && kinds.has('file');

    // Elementi speciali (selezione singola)
    if (single?.kind === 'trash') {
        menu.append_section(null, section(item(_('Open'), 'open')));
        menu.append_section(null, section(item(_('Empty Trash'), 'empty-trash')));
        return menu;
    }
    if (single?.kind === 'mount') {
        menu.append_section(null, section(item(_('Open'), 'open'),
            item(_('Open in Terminal'), 'open-terminal')));
        menu.append_section(null, section(
            single.mount.can_eject() ? item(_('Eject'), 'eject') : null,
            single.mount.can_unmount() ? item(_('Unmount'), 'unmount') : null));
        return menu;
    }
    if (single?.kind === 'home') {
        menu.append_section(null, section(item(_('Open'), 'open'),
            item(_('Open in Terminal'), 'open-terminal')));
        menu.append_section(null, section(item(_('Properties'), 'properties')));
        return menu;
    }

    const open = section(
        item(single?.isLauncher ? _('Run') : _('Open'), 'open'),
        single?.isLauncher && !single.isTrusted ? item(_('Allow Launching'), 'allow-launch') : null);
    if (ctx.appsForType?.length) {
        const apps = new Gio.Menu();
        for (const app of ctx.appsForType)
            apps.append_item(item(app.get_name(), 'open-with', new GLib.Variant('s', app.get_id())));
        open.append_submenu(_('Open With'), apps);
    }
    menu.append_section(null, open);

    if (onlyFiles) {
        menu.append_section(null, section(
            item(_('Cut'), 'cut'),
            item(_('Copy'), 'copy'),
            item(_('Copy Path'), 'copy-path')));
        menu.append_section(null, section(
            single ? item(_('Rename…'), 'rename') : null,
            item(_('Move to Trash'), 'trash'),
            item(_('Delete Permanently'), 'delete')));
        menu.append_section(null, section(
            item(_('Show in Files'), 'show-in-files'),
            single?.isDir ? item(_('Open in Terminal'), 'open-terminal') : null,
            item(_('Properties'), 'properties')));
    }
    return menu;
}
