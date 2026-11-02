// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Traduzioni dell'helper. Gira in un processo separato dalla Shell, quindi
// lega da sé il dominio gettext alla cartella locale/ dell'estensione (come
// fa ExtensionBase.initTranslations per extension.js e prefs.js).

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
