// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import Gdk from 'gi://Gdk?version=4.0';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'copy_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async');
Gio._promisify(Gio.OutputStream.prototype, 'splice_async');
Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Gio.Mount.prototype, 'unmount_with_operation');
Gio._promisify(Gio.Mount.prototype, 'eject_with_operation');
Gio._promisify(Gio.AppInfo, 'launch_default_for_uri_async');
Gio._promisify(Gdk.Clipboard.prototype, 'read_async');
Gio._promisify(Gdk.Drop.prototype, 'read_async');

export function desktopDir() {
    const dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
    if (dir && dir !== GLib.get_home_dir())
        return Gio.File.new_for_path(dir);
    return Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), 'Desktop']));
}

export function templatesDir() {
    const dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_TEMPLATES);
    if (!dir || dir === GLib.get_home_dir())
        return null;
    return Gio.File.new_for_path(dir);
}

export function newDesktopAppInfo(path) {
    return GioUnix.DesktopAppInfo.new_from_filename(path);
}

export function launchContext() {
    return Gdk.Display.get_default().get_app_launch_context();
}

// Restituisce un nome non ancora presente in `dir` (es. "Nuova cartella 2")
export function uniqueName(dir, name) {
    if (!dir.get_child(name).query_exists(null))
        return name;
    const dot = name.lastIndexOf('.');
    const hasExt = dot > 0;
    const base = hasExt ? name.slice(0, dot) : name;
    const ext = hasExt ? name.slice(dot) : '';
    for (let i = 2; ; i++) {
        const candidate = `${base} ${i}${ext}`;
        if (!dir.get_child(candidate).query_exists(null))
            return candidate;
    }
}

export function spawn(argv, cwd = null) {
    try {
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
        if (cwd)
            launcher.set_cwd(cwd);
        launcher.spawnv(argv);
    } catch (e) {
        console.error(`DeskIcons: cannot run ${argv.join(' ')}: ${e.message}`);
    }
}

const TERMINALS = [
    ['ptyxis', ['--new-window', '--working-directory']],
    ['kgx', ['--working-directory']],
    ['gnome-terminal', ['--working-directory']],
    ['kitty', ['--directory']],
    ['alacritty', ['--working-directory']],
    ['foot', ['--working-directory']],
    ['konsole', ['--workdir']],
    ['xterm', []],
];

export function openTerminal(settings, path) {
    const custom = settings.get_string('terminal').trim();
    if (custom) {
        try {
            const [, argv] = GLib.shell_parse_argv(custom);
            spawn(argv, path);
            return;
        } catch (e) {
            console.error(`DeskIcons: invalid terminal command: ${e.message}`);
        }
    }
    for (const [bin, args] of TERMINALS) {
        const exe = GLib.find_program_in_path(bin);
        if (!exe)
            continue;
        const argv = [exe, ...args];
        if (args.length)
            argv.push(path);
        spawn(argv, path);
        return;
    }
}

export async function readStreamToString(stream) {
    const out = Gio.MemoryOutputStream.new_resizable();
    await out.splice_async(stream,
        Gio.OutputStreamSpliceFlags.CLOSE_SOURCE | Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
        GLib.PRIORITY_DEFAULT, null);
    return new TextDecoder().decode(out.steal_as_bytes().toArray());
}

export function parseUriList(text) {
    return text.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
}

function bytesProvider(mime, text) {
    return Gdk.ContentProvider.new_for_bytes(mime,
        new GLib.Bytes(new TextEncoder().encode(text)));
}

// Contenuto per drag e appunti: elenco di URI e percorsi come testo semplice,
// più eventuali formati aggiuntivi ([mime, testo])
export function uriListProvider(files, extraFormats = []) {
    const uris = files.map(f => f.get_uri());
    return Gdk.ContentProvider.new_union([
        ...extraFormats.map(([mime, text]) => bytesProvider(mime, text)),
        bytesProvider('text/uri-list', `${uris.join('\r\n')}\r\n`),
        bytesProvider('text/plain;charset=utf-8',
            files.map(f => f.get_path() ?? f.get_uri()).join('\n')),
    ]);
}
