// Helper GTK4 delle icone desktop. Viene avviato dall'estensione con:
//   gjs -m main.js --extension-dir DIR --monitors JSON
// Per lo sviluppo: gjs -m main.js --debug --extension-dir DIR

import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Adw from 'gi://Adw?version=1';
import System from 'system';

import {DesktopController} from './desktopController.js';

const SCHEMA_ID = 'org.gnome.shell.extensions.deskicons';

function parseArgs(argv) {
    const args = {debug: false, extensionDir: null, monitors: null, snapshot: null};
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
        case '--debug':
            args.debug = true;
            break;
        case '--extension-dir':
            args.extensionDir = argv[++i];
            break;
        case '--snapshot':
            args.snapshot = argv[++i];
            args.debug = true;
            break;
        case '--monitors':
            args.monitors = JSON.parse(argv[++i]);
            break;
        }
    }
    return args;
}

function loadSettings(extensionDir) {
    const schemaDir = extensionDir ? GLib.build_filenamev([extensionDir, 'schemas']) : null;
    let source = Gio.SettingsSchemaSource.get_default();
    if (schemaDir && GLib.file_test(GLib.build_filenamev([schemaDir, 'gschemas.compiled']),
        GLib.FileTest.EXISTS))
        source = Gio.SettingsSchemaSource.new_from_directory(schemaDir, source, false);
    const schema = source.lookup(SCHEMA_ID, true);
    if (!schema)
        throw new Error(`schema ${SCHEMA_ID} non trovato (eseguire "make schemas")`);
    return new Gio.Settings({settings_schema: schema});
}

// In modalità debug si usano i monitor reali visti da GDK
function debugMonitors() {
    const list = Gdk.Display.get_default().get_monitors();
    const result = [];
    for (let i = 0; i < list.get_n_items(); i++) {
        const geo = list.get_item(i).get_geometry();
        result.push({index: i, primary: i === 0, width: geo.width, height: geo.height});
    }
    return result.slice(0, 1);
}

// Solo sviluppo: salva un PNG della prima finestra ed esce
function saveSnapshot(path) {
    const win = controller.windows[0];
    const paintable = Gtk.WidgetPaintable.new(win);
    const snapshot = new Gtk.Snapshot();
    paintable.snapshot(snapshot, win.get_width(), win.get_height());
    const node = snapshot.to_node();
    const texture = win.get_native().get_renderer().render_texture(node, null);
    texture.save_to_png(path);
    app.quit();
    return GLib.SOURCE_REMOVE;
}

const args = parseArgs(System.programArgs);
const settings = loadSettings(args.extensionDir);

const app = new Adw.Application({
    application_id: args.debug ? 'it.eugenio.DeskIcons.Debug' : 'it.eugenio.DeskIcons',
    flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
});

let controller = null;
app.connect('startup', () => {
    // Le finestre desktop non devono mai chiudere l'applicazione
    app.hold();
    const monitors = args.monitors ?? debugMonitors();
    controller = new DesktopController(app, settings, monitors, args.debug);
    controller.start();
    if (args.snapshot)
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => saveSnapshot(args.snapshot));
});
app.connect('activate', () => {});
app.connect('shutdown', () => controller?.shutdown());

// Termina in modo pulito su SIGTERM (disabilitazione dell'estensione)
GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, 15, () => {
    app.quit();
    return GLib.SOURCE_REMOVE;
});

const status = app.run([System.programInvocationName]);
System.exit(status);
