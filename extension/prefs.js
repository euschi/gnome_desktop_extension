// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// [valore, etichetta]
const LABEL_STYLES = [['shadow', 'Ombra'], ['background', 'Sfondo scuro'], ['none', 'Nessuno']];
const CORNERS = [['top-left', 'In alto a sinistra'], ['top-right', 'In alto a destra'],
    ['bottom-left', 'In basso a sinistra'], ['bottom-right', 'In basso a destra']];
const DIRECTIONS = [['columns', 'Prima le colonne (verticale)'], ['rows', 'Prima le righe (orizzontale)']];
const SORTS = [['name', 'Nome'], ['modified', 'Data di modifica'], ['type', 'Tipo'], ['size', 'Dimensione']];
const MONITORS = [['all', 'Tutti i monitor'], ['primary', 'Solo il monitor principale']];
const CLICKS = [['double', 'Doppio click'], ['single', 'Click singolo']];
const LAUNCHERS = [['ask', 'Chiedi conferma'], ['always', 'Avvia sempre']];

export default class DeskIconsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(640, 720);
        window.set_search_enabled(true);

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

        // Aspetto
        page('Aspetto', 'applications-graphics-symbolic', [
            group('Icone', [
                spinRow('icon-size', 'Dimensione icone', 32, 128, 8, 'In pixel'),
                spinRow('item-spacing', 'Spaziatura', 0, 48, 2, 'Spazio tra le icone in pixel'),
                switchRow('show-thumbnails', 'Mostra anteprime', 'Miniature di immagini, video e documenti'),
            ]),
            group('Etichette', [
                spinRow('label-lines', 'Righe massime', 1, 4),
                comboRow('label-style', 'Stile', LABEL_STYLES),
            ]),
        ]);

        // Disposizione
        page('Disposizione', 'view-grid-symbolic', [
            group('Nuove icone', [
                comboRow('start-corner', 'Angolo di partenza', CORNERS,
                    'Dove compaiono le nuove icone'),
                comboRow('fill-direction', 'Direzione di riempimento', DIRECTIONS),
                comboRow('monitors', 'Monitor', MONITORS),
            ]),
            group('Griglia', [
                switchRow('snap-to-grid', 'Allinea alla griglia',
                    'Se disattivato le icone restano esattamente dove le rilasci'),
                switchRow('keep-arranged', 'Mantieni ordinate',
                    'Le icone vengono sempre disposte secondo l\'ordinamento'),
                comboRow('sort-by', 'Ordina per', SORTS),
                switchRow('sort-reverse', 'Ordine inverso'),
                switchRow('folders-first', 'Cartelle prima dei file'),
            ]),
            group('Margini', [
                spinRow('margin-top', 'Superiore', 0, 400, 4),
                spinRow('margin-bottom', 'Inferiore', 0, 400, 4),
                spinRow('margin-left', 'Sinistro', 0, 400, 4),
                spinRow('margin-right', 'Destro', 0, 400, 4),
            ], 'Spazio libero ai bordi dello schermo, in pixel'),
        ]);

        // Comportamento
        const terminal = new Adw.EntryRow({title: 'Terminale (vuoto = automatico)'});
        settings.bind('terminal', terminal, 'text', Gio.SettingsBindFlags.DEFAULT);

        const reset = new Adw.ButtonRow({title: 'Ripristina impostazioni predefinite'});
        reset.add_css_class('destructive-action');
        reset.connect('activated', () => {
            for (const key of settings.settings_schema.list_keys())
                settings.reset(key);
        });

        page('Comportamento', 'preferences-system-symbolic', [
            group('Apertura', [
                comboRow('click-policy', 'Apri gli elementi con', CLICKS),
                comboRow('launcher-policy', 'Lanciatori .desktop non attendibili', LAUNCHERS),
                terminal,
            ]),
            group('Sicurezza', [
                switchRow('confirm-trash', 'Conferma prima di spostare nel cestino'),
            ]),
            group('Pannello', [
                switchRow('show-indicator', 'Mostra indicatore nel pannello'),
                switchRow('icons-visible', 'Mostra icone sul desktop'),
            ]),
            group('', [reset]),
        ]);

        // Elementi
        page('Elementi', 'folder-symbolic', [
            group('Elementi speciali', [
                switchRow('show-home', 'Cartella Home'),
                switchRow('show-trash', 'Cestino'),
                switchRow('show-volumes', 'Unità montate', 'Dischi e chiavette USB'),
                switchRow('show-network-volumes', 'Unità di rete'),
            ]),
            group('File', [
                switchRow('show-hidden', 'Mostra file nascosti'),
            ]),
        ]);
    }
}
