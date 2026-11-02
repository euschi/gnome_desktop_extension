// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Operazioni sui file delegate a Nautilus (org.gnome.Nautilus.FileOperations2)
// così da avere finestre di avanzamento, gestione conflitti e annulla/ripeti
// condivisi con il file manager. Se Nautilus non è disponibile si usa Gio, tranne
// per le operazioni senza un equivalente sicuro (eliminazione definitiva, cestino
// da svuotare, annulla/ripeti).

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const NAUTILUS = ['org.gnome.Nautilus', '/org/gnome/Nautilus/FileOperations2',
    'org.gnome.Nautilus.FileOperations2'];
const FILE_MANAGER = ['org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
    'org.freedesktop.FileManager1'];

// Solo in questi casi l'operazione non è mai partita e si può ripiegare su Gio. Un
// errore dell'operazione stessa non deve farla ripetere da un'altra parte.
const NAUTILUS_UNAVAILABLE = [
    Gio.DBusError.SERVICE_UNKNOWN, Gio.DBusError.NAME_HAS_NO_OWNER,
    Gio.DBusError.UNKNOWN_METHOD, Gio.DBusError.SPAWN_EXEC_FAILED,
    Gio.DBusError.SPAWN_CHILD_EXITED,
];

function platformData() {
    return {
        'parent-handle': new GLib.Variant('s', ''),
        'timestamp': new GLib.Variant('u', 0),
        'window-position': new GLib.Variant('s', 'center'),
    };
}

function call([name, path, iface], method, params, timeout = -1) {
    return Gio.DBus.session.call(name, path, iface, method, params,
        null, Gio.DBusCallFlags.NONE, timeout, null);
}

// Senza timeout: la risposta può arrivare solo a operazione conclusa e, nel
// frattempo, Nautilus può essere in attesa di una scelta dell'utente
async function nautilus(method, signature, args, fallback = null) {
    try {
        await call(NAUTILUS, method, new GLib.Variant(signature, [...args, platformData()]),
            GLib.MAXINT32);
    } catch (e) {
        if (!NAUTILUS_UNAVAILABLE.some(code => e.matches(Gio.DBusError, code))) {
            logErr(e);
            return;
        }
        console.warn(`DeskIcons: Nautilus ${method} unavailable (${e.message})`);
        await fallback?.();
    }
}

export function copyUris(uris, destUri) {
    return nautilus('CopyURIs', '(assa{sv})', [uris, destUri],
        () => transfer(uris, destUri, false));
}

export function moveUris(uris, destUri) {
    return nautilus('MoveURIs', '(assa{sv})', [uris, destUri],
        () => transfer(uris, destUri, true));
}

export function trashUris(uris) {
    return nautilus('TrashURIs', '(asa{sv})', [uris], () => {
        for (const uri of uris)
            Gio.File.new_for_uri(uri).trash(null);
    });
}

export function deleteUris(uris) {
    return nautilus('DeleteURIs', '(asa{sv})', [uris]);
}

export function createFolder(parentUri, name) {
    return nautilus('CreateFolder', '(ssa{sv})', [parentUri, name], () =>
        Gio.File.new_for_uri(parentUri).get_child(name).make_directory(null));
}

export function renameUri(uri, newName) {
    return nautilus('RenameURI', '(ssa{sv})', [uri, newName], () =>
        Gio.File.new_for_uri(uri).set_display_name(newName, null));
}

export function emptyTrash() {
    return nautilus('EmptyTrash', '(ba{sv})', [true]);
}

export function undo() {
    return nautilus('Undo', '(a{sv})', []);
}

export function redo() {
    return nautilus('Redo', '(a{sv})', []);
}

// 0 = niente da annullare, 1 = annulla disponibile, 2 = ripeti disponibile
export function undoStatus() {
    try {
        const res = Gio.DBus.session.call_sync(NAUTILUS[0], NAUTILUS[1],
            'org.freedesktop.DBus.Properties', 'Get',
            new GLib.Variant('(ss)', [NAUTILUS[2], 'UndoStatus']),
            null, Gio.DBusCallFlags.NO_AUTO_START, 200, null);
        return res.recursiveUnpack()[0];
    } catch {
        return 0;
    }
}

export function showItems(uris) {
    return call(FILE_MANAGER, 'ShowItems', new GLib.Variant('(ass)', [uris, ''])).catch(logErr);
}

export function showFolders(uris) {
    return call(FILE_MANAGER, 'ShowFolders', new GLib.Variant('(ass)', [uris, ''])).catch(logErr);
}

export function showProperties(uris) {
    return call(FILE_MANAGER, 'ShowItemProperties', new GLib.Variant('(ass)', [uris, ''])).catch(logErr);
}

// Non passa da Nautilus: CopyURIs non permette di scegliere il nome di destinazione
export function copyTemplate(templateFile, destFile) {
    return templateFile.copy_async(destFile, Gio.FileCopyFlags.NONE,
        GLib.PRIORITY_DEFAULT, null, null);
}

function logErr(e) {
    console.error(`DeskIcons: ${e.message}`);
}

function transfer(uris, destUri, move) {
    const dest = Gio.File.new_for_uri(destUri);
    for (const uri of uris) {
        const src = Gio.File.new_for_uri(uri);
        const target = dest.get_child(src.get_basename());
        if (move)
            src.move(target, Gio.FileCopyFlags.NONE, null, null);
        else
            copyRecursive(src, target);
    }
}

function copyRecursive(src, dest) {
    const type = src.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    if (type !== Gio.FileType.DIRECTORY) {
        src.copy(dest, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS, null, null);
        return;
    }
    dest.make_directory(null);
    const en = src.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    let info;
    while ((info = en.next_file(null)))
        copyRecursive(src.get_child(info.get_name()), dest.get_child(info.get_name()));
}
