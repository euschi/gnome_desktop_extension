// Modelli dei menù contestuali. Le voci puntano alle azioni del gruppo "desk"
// registrato dal DesktopController su ogni finestra.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

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

    const create = section(item('Nuova cartella', 'new-folder'));
    const templates = templatesMenu();
    if (templates.get_n_items() > 0)
        create.append_submenu('Nuovo documento', templates);
    menu.append_section(null, create);

    menu.append_section(null, section(
        item('Incolla', 'paste'),
        item('Annulla', 'undo'),
        item('Ripeti', 'redo')));

    const sort = new Gio.Menu();
    for (const [key, label] of [['name', 'Nome'], ['modified', 'Data di modifica'],
        ['type', 'Tipo'], ['size', 'Dimensione']])
        sort.append_item(item(label, 'sort-by', new GLib.Variant('s', key)));
    sort.append_section(null, section(
        item('Ordine inverso', 'sort-reverse'),
        item('Cartelle prima', 'folders-first')));

    const arrange = section(
        item('Seleziona tutto', 'select-all'),
        item('Disponi icone', 'arrange'),
        item('Mantieni ordinate', 'keep-arranged'),
        item('Allinea alla griglia', 'snap-to-grid'),
        item('Mostra file nascosti', 'show-hidden'));
    arrange.insert_submenu(1, 'Ordina per', sort);
    menu.append_section(null, arrange);

    menu.append_section(null, section(
        item('Apri nel terminale', 'open-terminal-desktop'),
        item('Apri Scrivania in File', 'open-desktop-folder')));

    menu.append_section(null, section(
        item('Cambia sfondo…', 'change-background'),
        item('Mostra icone', 'icons-visible'),
        item('Impostazioni icone…', 'preferences')));
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
        menu.append_section(null, section(item('Apri', 'open')));
        menu.append_section(null, section(item('Svuota cestino', 'empty-trash')));
        return menu;
    }
    if (single?.kind === 'mount') {
        menu.append_section(null, section(item('Apri', 'open'),
            item('Apri nel terminale', 'open-terminal')));
        menu.append_section(null, section(
            single.mount.can_eject() ? item('Espelli', 'eject') : null,
            single.mount.can_unmount() ? item('Smonta', 'unmount') : null));
        return menu;
    }
    if (single?.kind === 'home') {
        menu.append_section(null, section(item('Apri', 'open'),
            item('Apri nel terminale', 'open-terminal')));
        menu.append_section(null, section(item('Proprietà', 'properties')));
        return menu;
    }

    const open = section(
        item(single?.isLauncher ? 'Esegui' : 'Apri', 'open'),
        single?.isLauncher && !single.isTrusted ? item('Consenti avvio', 'allow-launch') : null);
    if (ctx.appsForType?.length) {
        const apps = new Gio.Menu();
        for (const app of ctx.appsForType)
            apps.append_item(item(app.get_name(), 'open-with', new GLib.Variant('s', app.get_id())));
        open.append_submenu('Apri con', apps);
    }
    menu.append_section(null, open);

    if (onlyFiles) {
        menu.append_section(null, section(
            item('Taglia', 'cut'),
            item('Copia', 'copy'),
            item('Copia percorso', 'copy-path')));
        menu.append_section(null, section(
            single ? item('Rinomina…', 'rename') : null,
            item('Sposta nel cestino', 'trash'),
            item('Elimina definitivamente', 'delete')));
        menu.append_section(null, section(
            item('Mostra in File', 'show-in-files'),
            single?.isDir ? item('Apri nel terminale', 'open-terminal') : null,
            item('Proprietà', 'properties')));
    }
    return menu;
}
