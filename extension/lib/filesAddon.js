// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// State of the optional Files (Nautilus) add-on, shown in the preferences.
// The add-on is not part of this package: it is distributed separately (see
// the nautilus/ folder of the project) and talks to the extension over D-Bus.

import GLib from 'gi://GLib';

export const FILES_ADDON_URL =
    'https://github.com/euschi/gnome_desktop_extension#add-to-desktop-in-files';

const ADDON_NAME = 'deskicons-add-to-desktop.py';

// The folder is "extensions-4" in recent Nautilus, "extension-4" in older ones
const LIB_DIRS = ['/usr/lib', '/usr/lib64', '/usr/lib/x86_64-linux-gnu', '/usr/lib/aarch64-linux-gnu'];
const NAUTILUS_PYTHON_LIBS = LIB_DIRS.flatMap(dir => ['extensions-4', 'extension-4'].map(sub =>
    `${dir}/nautilus/${sub}/libnautilus-python.so`));

const ADDON_PATHS = [
    GLib.build_filenamev([GLib.get_user_data_dir(), 'nautilus-python', 'extensions', ADDON_NAME]),
    ...GLib.get_system_data_dirs().map(dir =>
        GLib.build_filenamev([dir, 'nautilus-python', 'extensions', ADDON_NAME])),
];

const exists = path => GLib.file_test(path, GLib.FileTest.EXISTS);

// 'installed', 'missing' (add-on not installed) or 'no-nautilus-python'
export function filesAddonStatus() {
    if (!NAUTILUS_PYTHON_LIBS.some(exists))
        return 'no-nautilus-python';
    return ADDON_PATHS.some(exists) ? 'installed' : 'missing';
}
