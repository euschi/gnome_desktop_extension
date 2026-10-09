// Indicatore nel pannello con le azioni rapide sulle icone del desktop.
// Le azioni che riguardano l'helper vengono invocate tramite le GActions che
// l'applicazione GTK esporta su D-Bus (org.gtk.Actions).

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const HELPER_BUS_NAME = 'it.eugenio.DeskIcons';
export const HELPER_OBJECT_PATH = '/it/eugenio/DeskIcons';

const SORT_OPTIONS = [
    ['name', 'Nome'],
    ['modified', 'Data di modifica'],
    ['type', 'Tipo'],
    ['size', 'Dimensione'],
];

export const DeskIconsIndicator = GObject.registerClass(
class DeskIconsIndicator extends PanelMenu.Button {
    _init(extension, manager) {
        super._init(0.0, 'Icone Desktop');
        this._extension = extension;
        this._manager = manager;
        this._settings = extension.getSettings();

        this.add_child(new St.Icon({
            icon_name: 'user-desktop-symbolic',
            style_class: 'system-status-icon',
        }));

        this._actions = Gio.DBusActionGroup.get(
            Gio.DBus.session, HELPER_BUS_NAME, HELPER_OBJECT_PATH);

        this._buildMenu();
    }

    _buildMenu() {
        const menu = this.menu;

        const visible = new PopupMenu.PopupSwitchMenuItem('Mostra icone',
            this._settings.get_boolean('icons-visible'));
        visible.connect('toggled', (_i, state) =>
            this._settings.set_boolean('icons-visible', state));
        menu.addMenuItem(visible);

        const arranged = new PopupMenu.PopupSwitchMenuItem('Mantieni ordinate',
            this._settings.get_boolean('keep-arranged'));
        arranged.connect('toggled', (_i, state) =>
            this._settings.set_boolean('keep-arranged', state));
        menu.addMenuItem(arranged);

        this._settingsIds = [
            this._settings.connect('changed::icons-visible', () =>
                visible.setToggleState(this._settings.get_boolean('icons-visible'))),
            this._settings.connect('changed::keep-arranged', () =>
                arranged.setToggleState(this._settings.get_boolean('keep-arranged'))),
        ];

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        menu.addAction('Disponi icone', () => this._activate('arrange'));

        const sort = new PopupMenu.PopupSubMenuMenuItem('Ordina per');
        const sortItems = [];
        for (const [key, label] of SORT_OPTIONS) {
            const item = sort.menu.addAction(label, () => {
                // Il cambio di impostazione riordina già le icone
                if (this._settings.get_string('sort-by') === key)
                    this._activate('arrange');
                else
                    this._settings.set_string('sort-by', key);
            });
            item._sortKey = key;
            sortItems.push(item);
        }
        const updateSort = () => {
            const current = this._settings.get_string('sort-by');
            for (const item of sortItems) {
                item.setOrnament(item._sortKey === current
                    ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            }
        };
        updateSort();
        this._settingsIds.push(this._settings.connect('changed::sort-by', updateSort));
        menu.addMenuItem(sort);

        menu.addAction('Nuova cartella', () => this._activate('new-folder'));

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        menu.addAction('Apri Scrivania in File', () => this._openDesktopFolder());
        menu.addAction('Ricarica', () => this._manager.restart());
        menu.addAction('Impostazioni…', () => this._extension.openPreferences());
    }

    _activate(name, param = null) {
        try {
            this._actions.activate_action(name, param);
        } catch (e) {
            logError(e, `DeskIcons: azione ${name}`);
        }
    }

    _openDesktopFolder() {
        const dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP) ??
            GLib.build_filenamev([GLib.get_home_dir(), 'Desktop']);
        Gio.DBus.session.call(
            'org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1', 'ShowFolders',
            new GLib.Variant('(ass)', [[Gio.File.new_for_path(dir).get_uri()], '']),
            null, Gio.DBusCallFlags.NONE, -1, null, null);
    }

    destroy() {
        for (const id of this._settingsIds ?? [])
            this._settings.disconnect(id);
        this._settingsIds = null;
        super.destroy();
    }
});
