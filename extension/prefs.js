// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DeskIconsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(640, 720);
        window.set_search_enabled(true);

        // [valore, etichetta]
        const LABEL_STYLES = [['shadow', _('Shadow')], ['background', _('Dark Background')],
            ['none', _('None')]];
        const CORNERS = [['top-left', _('Top Left')], ['top-right', _('Top Right')],
            ['bottom-left', _('Bottom Left')], ['bottom-right', _('Bottom Right')]];
        const DIRECTIONS = [['columns', _('Columns First (vertical)')],
            ['rows', _('Rows First (horizontal)')]];
        const SORTS = [['name', _('Name')], ['modified', _('Modification Date')],
            ['type', _('Type')], ['size', _('Size')]];
        const MONITORS = [['all', _('All Monitors')], ['primary', _('Primary Monitor Only')]];
        const CLICKS = [['double', _('Double Click')], ['single', _('Single Click')]];
        const LAUNCHERS = [['ask', _('Ask for Confirmation')], ['always', _('Always Launch')]];

        const switchRow = (key, title, subtitle = null) => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };

        const spinRow = (key, title, min, max, step = 1, subtitle = null) => {
            const row = new Adw.SpinRow({
                title, subtitle,
                adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: step}),
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };

        const comboRow = (key, title, options, subtitle = null) => {
            const row = new Adw.ComboRow({
                title, subtitle,
                model: Gtk.StringList.new(options.map(o => o[1])),
            });
            const sync = () => {
                const i = options.findIndex(o => o[0] === settings.get_string(key));
                if (i >= 0 && row.selected !== i)
                    row.selected = i;
            };
            sync();
            row.connect('notify::selected', () => {
                const value = options[row.selected]?.[0];
                if (value && value !== settings.get_string(key))
                    settings.set_string(key, value);
            });
            settings.connect(`changed::${key}`, sync);
            return row;
        };

        const group = (title, rows, description = null) => {
            const g = new Adw.PreferencesGroup({title, description});
            rows.forEach(r => g.add(r));
            return g;
        };

        const page = (title, icon, groups) => {
            const p = new Adw.PreferencesPage({title, icon_name: icon});
            groups.forEach(g => p.add(g));
            window.add(p);
            return p;
        };

        page(_('Appearance'), 'applications-graphics-symbolic', [
            group(_('Icons'), [
                spinRow('icon-size', _('Icon Size'), 32, 128, 8, _('In pixels')),
                spinRow('item-spacing', _('Spacing'), 0, 48, 2, _('Space between icons in pixels')),
                switchRow('show-thumbnails', _('Show Thumbnails'), _('Previews of images, videos and documents')),
            ]),
            group(_('Labels'), [
                spinRow('label-lines', _('Maximum Lines'), 1, 4),
                comboRow('label-style', _('Style'), LABEL_STYLES),
            ]),
        ]);

        page(_('Layout'), 'view-grid-symbolic', [
            group(_('New Icons'), [
                comboRow('start-corner', _('Start Corner'), CORNERS,
                    _('Where new icons appear')),
                comboRow('fill-direction', _('Fill Direction'), DIRECTIONS),
                comboRow('monitors', _('Monitors'), MONITORS),
            ]),
            group(_('Grid'), [
                switchRow('snap-to-grid', _('Align to Grid'),
                    _('When off, icons stay exactly where you drop them')),
                switchRow('keep-arranged', _('Keep Arranged'),
                    _('Icons are always laid out according to the sort order')),
                comboRow('sort-by', _('Sort By'), SORTS),
                switchRow('sort-reverse', _('Reverse Order')),
                switchRow('folders-first', _('Folders Before Files')),
            ]),
            group(_('Margins'), [
                spinRow('margin-top', _('Top'), 0, 400, 4),
                spinRow('margin-bottom', _('Bottom'), 0, 400, 4),
                spinRow('margin-left', _('Left'), 0, 400, 4),
                spinRow('margin-right', _('Right'), 0, 400, 4),
            ], _('Free space at the screen edges, in pixels')),
        ]);

                const terminal = new Adw.EntryRow({title: _('Terminal (empty = automatic)')});
        settings.bind('terminal', terminal, 'text', Gio.SettingsBindFlags.DEFAULT);

        const reset = new Adw.ButtonRow({title: _('Reset to Defaults')});
        reset.add_css_class('destructive-action');
        reset.connect('activated', () => {
            for (const key of settings.settings_schema.list_keys())
                settings.reset(key);
        });

        page(_('Behavior'), 'preferences-system-symbolic', [
            group(_('Opening'), [
                comboRow('click-policy', _('Open Items With'), CLICKS),
                comboRow('launcher-policy', _('Untrusted .desktop Launchers'), LAUNCHERS),
                terminal,
            ]),
            group(_('Safety'), [
                switchRow('confirm-trash', _('Confirm Before Moving to Trash')),
            ]),
            group(_('Panel'), [
                switchRow('show-indicator', _('Show Panel Indicator')),
                switchRow('icons-visible', _('Show Icons on the Desktop')),
            ]),
            group('', [reset]),
        ]);

        page(_('Items'), 'folder-symbolic', [
            group(_('Special Items'), [
                switchRow('show-home', _('Home Folder')),
                switchRow('show-trash', _('Trash')),
                switchRow('show-volumes', _('Mounted Drives'), _('Disks and USB sticks')),
                switchRow('show-network-volumes', _('Network Drives')),
            ]),
            group(_('Files'), [
                switchRow('show-hidden', _('Show Hidden Files')),
            ]),
        ]);
    }
}
