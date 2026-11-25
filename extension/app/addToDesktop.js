#!/usr/bin/env -S gjs -m
// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// "Add to Desktop" worker, shared by the application menu of the Shell and by
// the Files (Nautilus) integration. Arguments are paths or URIs; for Nautilus
// scripts the selection is also read from NAUTILUS_SCRIPT_SELECTED_URIS.
//
// - .desktop launchers are copied and marked as trusted, so they can be
//   launched from the desktop right away;
// - any other file or folder gets a symbolic link on the desktop.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import System from 'system';

import {desktopDir, uniqueName} from './utils.js';

const QUERY = 'standard::type,standard::symlink-target,unix::mode';

function selection() {
    const args = [...System.programArgs];
    const env = GLib.getenv('NAUTILUS_SCRIPT_SELECTED_URIS');
    if (env)
        args.push(...env.split('\n').filter(u => u));
    const seen = new Set();
    return args.map(a => Gio.File.new_for_commandline_arg(a))
        .filter(f => f.get_path() && !seen.has(f.get_path()) && seen.add(f.get_path()));
}

function copyLauncher(file, desktop) {
    const dest = desktop.get_child(file.get_basename());
    if (dest.query_exists(null))
        return;
    file.copy(dest, Gio.FileCopyFlags.NONE, null, null);
    const info = dest.query_info(QUERY, Gio.FileQueryInfoFlags.NONE, null);
    dest.set_attribute_uint32('unix::mode', info.get_attribute_uint32('unix::mode') | 0o111,
        Gio.FileQueryInfoFlags.NONE, null);
    dest.set_attribute_string('metadata::trusted', 'true', Gio.FileQueryInfoFlags.NONE, null);
}

function linkFile(file, desktop) {
    const target = file.get_path();
    const name = file.get_basename();
    // Already linked: do not create "name 2", "name 3"...
    try {
        const info = desktop.get_child(name).query_info(QUERY,
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        if (info.get_symlink_target() === target)
            return;
    } catch {
        // does not exist yet
    }
    desktop.get_child(uniqueName(desktop, name)).make_symbolic_link(target, null);
}

const desktop = desktopDir();
try {
    desktop.make_directory_with_parents(null);
} catch (e) {
    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
        throw e;
}

let failed = false;
for (const file of selection()) {
    // Nothing to do for the desktop itself or for what is already on it
    if (file.equal(desktop) || file.get_parent()?.equal(desktop))
        continue;
    try {
        const info = file.query_info(QUERY, Gio.FileQueryInfoFlags.NONE, null);
        if (file.get_basename().endsWith('.desktop') &&
            info.get_file_type() === Gio.FileType.REGULAR)
            copyLauncher(file, desktop);
        else
            linkFile(file, desktop);
    } catch (e) {
        failed = true;
        console.error(`DeskIcons: cannot add ${file.get_path()} to the desktop: ${e.message}`);
    }
}
System.exit(failed ? 1 : 0);
