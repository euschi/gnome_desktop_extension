// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Helper translations. It runs in a separate process from the Shell, so it
// binds the gettext domain to the extension's locale/ folder by itself (as
// ExtensionBase.initTranslations does for extension.js and prefs.js).

import GLib from 'gi://GLib';
import Gettext from 'gettext';

const DOMAIN = 'deskicons';

export function initTranslations(extensionDir) {
    Gettext.bindtextdomain(DOMAIN, GLib.build_filenamev([extensionDir, 'locale']));
}

export function _(str) {
    return Gettext.dgettext(DOMAIN, str);
}

export function ngettext(singular, plural, n) {
    return Gettext.dngettext(DOMAIN, singular, plural, n);
}
