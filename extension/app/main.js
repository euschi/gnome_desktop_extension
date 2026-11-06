#!@GJS@ -m
// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// GTK4 helper for the desktop icons. It is launched by the extension with:
//   gjs -m main.js --extension-dir DIR --monitors JSON
// For development: gjs -m main.js --debug --extension-dir DIR

import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk?version=4.0';
import Adw from 'gi://Adw?version=1';
import System from 'system';

import {DesktopController} from './desktopController.js';
import {initTranslations} from './i18n.js';

const SCHEMA_ID = 'org.gnome.shell.extensions.deskicons';
const SIGTERM = 15;

function parseArgs(argv) {
    const args = {debug: false, extensionDir: null, monitors: null};
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
        case '--debug':
            args.debug = true;
            break;
        case '--extension-dir':
            args.extensionDir = argv[++i];
            break;
        case '--monitors':
            args.monitors = JSON.parse(argv[++i]);
            break;
        }
    }
    return args;
}

// The schema is compiled by `make schemas` or, for installations from
// extensions.gnome.org, by the Shell itself at install time
function loadSettings(extensionDir) {
    const schemaDir = GLib.build_filenamev([extensionDir, 'schemas']);
    let source = Gio.SettingsSchemaSource.get_default();
    if (GLib.file_test(GLib.build_filenamev([schemaDir, 'gschemas.compiled']), GLib.FileTest.EXISTS))
        source = Gio.SettingsSchemaSource.new_from_directory(schemaDir, source, false);
    const schema = source.lookup(SCHEMA_ID, true);
    if (!schema)
        throw new Error(`schema ${SCHEMA_ID} not found (run "make schemas")`);
    return new Gio.Settings({settings_schema: schema});
}

// In debug mode there is a single window, as large as the first monitor
function debugMonitors() {
    const geo = Gdk.Display.get_default().get_monitors().get_item(0).get_geometry();
    return [{index: 0, primary: true, width: geo.width, height: geo.height}];
}

const args = parseArgs(System.programArgs);
initTranslations(args.extensionDir);
const settings = loadSettings(args.extensionDir);

const app = new Adw.Application({
    application_id: args.debug ? 'it.eugenio.DeskIcons.Debug' : 'it.eugenio.DeskIcons',
    flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
});

let controller = null;
app.connect('startup', () => {
    // Desktop windows must never quit the application
    app.hold();
    const monitors = args.monitors ?? debugMonitors();
    controller = new DesktopController(app, settings, monitors, args.debug);
    controller.start();
});
// GApplication requires it, but the windows are already opened in 'startup'
app.connect('activate', () => {});
app.connect('shutdown', () => controller.shutdown());

// Exit cleanly on SIGTERM (extension being disabled)
GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, SIGTERM, () => {
    app.quit();
    return GLib.SOURCE_REMOVE;
});

const status = app.run([System.programInvocationName]);
System.exit(status);
