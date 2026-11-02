// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Appunti compatibili con Nautilus: formato x-special/gnome-copied-files
// ("copy"/"cut" + URI), più text/uri-list e testo semplice.

import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';

import {parseUriList, readStreamToString, uriListProvider} from './utils.js';

const GNOME_FILES = 'x-special/gnome-copied-files';
const URI_LIST = 'text/uri-list';

export class Clipboard {
    constructor(onCutChanged) {
        this._clipboard = Gdk.Display.get_default().get_clipboard();
        this._onCutChanged = onCutChanged;
        this.cutUris = new Set();
        this._clipboard.connect('changed', () => {
            if (!this._clipboard.is_local() && this.cutUris.size) {
                this.cutUris.clear();
                this._onCutChanged();
            }
        });
    }

    set(files, cut) {
        const uris = files.map(f => f.get_uri());
        this._clipboard.set_content(uriListProvider(files,
            [[GNOME_FILES, `${cut ? 'cut' : 'copy'}\n${uris.join('\n')}`]]));
        this.cutUris = new Set(cut ? uris : []);
        this._onCutChanged();
    }

    setText(text) {
        this._clipboard.set(text);
    }

    canPaste() {
        const formats = this._clipboard.get_formats();
        return formats.contain_mime_type(GNOME_FILES) ||
            formats.contain_mime_type(URI_LIST);
    }

    async _readLines(mime) {
        const [stream] = await this._clipboard.read_async([mime], GLib.PRIORITY_DEFAULT, null);
        return parseUriList(await readStreamToString(stream));
    }

    // Restituisce {uris, cut} oppure null
    async read() {
        const formats = this._clipboard.get_formats();
        try {
            if (formats.contain_mime_type(GNOME_FILES)) {
                const lines = await this._readLines(GNOME_FILES);
                const cut = lines[0] === 'cut';
                if (lines[0] === 'cut' || lines[0] === 'copy')
                    lines.shift();
                return {uris: lines, cut};
            }
            if (formats.contain_mime_type(URI_LIST))
                return {uris: await this._readLines(URI_LIST), cut: false};
        } catch (e) {
            console.error(`DeskIcons: clipboard read failed: ${e.message}`);
        }
        return null;
    }

    clearCut() {
        if (this.cutUris.size) {
            this.cutUris.clear();
            this._onCutChanged();
        }
    }
}
