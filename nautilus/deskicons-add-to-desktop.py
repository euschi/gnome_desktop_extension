# SPDX-License-Identifier: GPL-2.0-or-later
# SPDX-FileCopyrightText: 2026 Eugenio Schintu
#
# Files (Nautilus) add-on for the "Icone Desktop" GNOME Shell extension
# (deskicons@euschi.github.io): adds "Add to Desktop" to the right-click menu
# of files and folders. Requires nautilus-python.
#
# The work is done by the extension: this add-on only calls its D-Bus service
# (io.github.euschi.DeskIcons). The label comes from the extension, in the
# language of the session; the entry is hidden while the extension is off.
#
# Install: copy this file to ~/.local/share/nautilus-python/extensions/
# and restart Files (nautilus -q).

import os

# No gi.require_version(): nautilus-python has already loaded the Nautilus
# API in the version of the running Nautilus (4.0, 4.1...)
from gi.repository import GLib, GObject, Gio, Nautilus

BUS_NAME = 'io.github.euschi.DeskIcons'
OBJECT_PATH = '/io/github/euschi/DeskIcons'
INTERFACE = 'io.github.euschi.DeskIcons.Desktop1'


class DeskIconsAddToDesktop(GObject.GObject, Nautilus.MenuProvider):
    def __init__(self):
        super().__init__()
        self._proxy = None
        try:
            # The proxy follows the extension: properties are loaded when the
            # name appears and dropped when it goes away
            self._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION, Gio.DBusProxyFlags.DO_NOT_AUTO_START, None,
                BUS_NAME, OBJECT_PATH, INTERFACE, None)
        except GLib.Error as e:
            print(f'DeskIcons: cannot connect to the session bus: {e.message}')

    def _property(self, name):
        value = self._proxy.get_cached_property(name) if self._proxy else None
        return value.unpack() if value is not None else None

    def get_file_items(self, *args):
        # Nautilus 4.x passes (files); older versions (window, files)
        files = args[-1]
        if not self._proxy or self._proxy.get_name_owner() is None:
            return []
        label = self._property('Label')
        desktop = self._property('DesktopPath')
        if not label or not desktop:
            return []
        desktop = os.path.realpath(desktop)

        uris = []
        for f in files:
            location = f.get_location()
            path = location.get_path() if location else None
            if not path:
                continue
            # Symlinks on the desktop are on the desktop: resolve only the folder
            parent = os.path.realpath(os.path.dirname(path))
            if parent == desktop or os.path.realpath(path) == desktop:
                continue
            uris.append(f.get_uri())
        if not uris:
            return []

        item = Nautilus.MenuItem(name='DeskIcons::AddToDesktop', label=label,
                                 tip=self._property('Tooltip') or '')
        item.connect('activate', self._activate, uris)
        return [item]

    def _activate(self, _item, uris):
        self._proxy.call('AddFiles', GLib.Variant('(as)', (uris,)),
                         Gio.DBusCallFlags.NONE, -1, None, None, None)
