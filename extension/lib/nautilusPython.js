// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Shared by extension.js and prefs.js: whether nautilus-python is installed,
// i.e. whether "Add to Desktop" can be a top-level entry of the Files menu.

import GLib from 'gi://GLib';

// The folder is "extensions-4" in recent Nautilus, "extension-4" in older ones
const LIB_DIRS = ['/usr/lib', '/usr/lib64', '/usr/lib/x86_64-linux-gnu', '/usr/lib/aarch64-linux-gnu'];
const LIBS = LIB_DIRS.flatMap(dir => ['extensions-4', 'extension-4'].map(sub =>
    `${dir}/nautilus/${sub}/libnautilus-python.so`));

export function hasNautilusPython() {
    return LIBS.some(p => GLib.file_test(p, GLib.FileTest.EXISTS));
}
