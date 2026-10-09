// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Persistenza delle posizioni delle icone in un file JSON.
// Le posizioni sono in coordinate di griglia (anche frazionarie quando
// l'allineamento alla griglia è disattivato) per restare coerenti quando
// cambia la dimensione delle icone.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const SAVE_DELAY_MS = 500;

export class PositionStore {
    constructor() {
        this._file = Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_data_dir(), 'deskicons', 'positions.json']));
        this._data = {};
        this._saveId = 0;
        this._load();
    }

    _load() {
        try {
            const [, bytes] = this._file.load_contents(null);
            this._data = JSON.parse(new TextDecoder().decode(bytes)) ?? {};
        } catch {
            this._data = {};
        }
    }

    get(id) {
        return this._data[id] ?? null;
    }

    set(id, pos) {
        this._data[id] = {m: pos.m, c: round(pos.c), r: round(pos.r)};
        this._scheduleSave();
    }

    delete(id) {
        if (id in this._data) {
            delete this._data[id];
            this._scheduleSave();
        }
    }

    rename(oldId, newId) {
        if (oldId in this._data) {
            this._data[newId] = this._data[oldId];
            delete this._data[oldId];
            this._scheduleSave();
        }
    }

    // Rimuove le posizioni di file della Scrivania che non esistono più
    prune(existingIds) {
        let changed = false;
        for (const id of Object.keys(this._data)) {
            if (id.startsWith('file:') && !existingIds.has(id)) {
                delete this._data[id];
                changed = true;
            }
        }
        if (changed)
            this._scheduleSave();
    }

    _scheduleSave() {
        if (this._saveId)
            return;
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._saveId = 0;
            this.flush();
            return GLib.SOURCE_REMOVE;
        });
    }

    flush() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
        }
        try {
            const parent = this._file.get_parent();
            if (!parent.query_exists(null))
                parent.make_directory_with_parents(null);
            this._file.replace_contents(new TextEncoder().encode(JSON.stringify(this._data)),
                null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.error(`DeskIcons: cannot save positions: ${e.message}`);
        }
    }
}

function round(v) {
    return Math.round(v * 1000) / 1000;
}
