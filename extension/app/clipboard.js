// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Appunti compatibili con Nautilus: formato x-special/gnome-copied-files
// ("copy"/"cut" + URI), più text/uri-list e testo semplice.

import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';

import {parseUriList, readStreamToString} from './utils.js';

const GNOME_FILES = 'x-special/gnome-copied-files';
const URI_LIST = 'text/uri-list';

function bytesProvider(mime, text) {
    return Gdk.ContentProvider.new_for_bytes(mime,
        new GLib.Bytes(new TextEncoder().encode(text)));
}

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
        const paths = files.map(f => f.get_path() ?? f.get_uri());
        const provider = Gdk.ContentProvider.new_union([
            bytesProvider(GNOME_FILES, `${cut ? 'cut' : 'copy'}\n${uris.join('\n')}`),
            bytesProvider(URI_LIST, `${uris.join('\r\n')}\r\n`),
            bytesProvider('text/plain;charset=utf-8', paths.join('\n')),
        ]);
        this._clipboard.set_content(provider);
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

    // Restituisce {uris, cut} oppure null
    async read() {
        const formats = this._clipboard.get_formats();
        try {
            if (formats.contain_mime_type(GNOME_FILES)) {
                const [stream] = await this._clipboard.read_async([GNOME_FILES],
                    GLib.PRIORITY_DEFAULT, null);
                const lines = parseUriList(await readStreamToString(stream));
                const cut = lines[0] === 'cut';
                if (lines[0] === 'cut' || lines[0] === 'copy')
                    lines.shift();
                return {uris: lines, cut};
            }
            if (formats.contain_mime_type(URI_LIST)) {
                const [stream] = await this._clipboard.read_async([URI_LIST],
                    GLib.PRIORITY_DEFAULT, null);
                return {uris: parseUriList(await readStreamToString(stream)), cut: false};
            }
        } catch (e) {
            console.error(`DeskIcons: lettura appunti fallita: ${e.message}`);
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
