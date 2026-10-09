// Miniature dei file tramite GnomeDesktop (stessa cache di Nautilus).

import Gio from 'gi://Gio';
import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';

Gio._promisify(GnomeDesktop.DesktopThumbnailFactory.prototype, 'generate_thumbnail_async');
Gio._promisify(GnomeDesktop.DesktopThumbnailFactory.prototype, 'save_thumbnail_async');
Gio._promisify(GnomeDesktop.DesktopThumbnailFactory.prototype, 'create_failed_thumbnail_async');

export class Thumbnailer {
    constructor() {
        this._factory = GnomeDesktop.DesktopThumbnailFactory.new(
            GnomeDesktop.DesktopThumbnailSize.LARGE);
        this._queue = [];
        this._running = false;
        this._waiting = new Map(); // uri -> [resolve]
    }

    // Restituisce il percorso della miniatura (o null) — non lancia eccezioni
    async lookup(item) {
        if (item.kind !== 'file' || item.isDir || item.isLauncher)
            return null;
        const uri = item.uri;
        const mtime = Number(item.mtime);
        const mime = item.contentType;
        try {
            const path = this._factory.lookup(uri, mtime);
            if (path)
                return path;
            if (this._factory.has_valid_failed_thumbnail(uri, mtime))
                return null;
            if (!this._factory.can_thumbnail(uri, mime, mtime))
                return null;
        } catch {
            return null;
        }
        return new Promise(resolve => {
            const key = `${uri}@${mtime}`;
            if (this._waiting.has(key)) {
                this._waiting.get(key).push(resolve);
                return;
            }
            this._waiting.set(key, [resolve]);
            this._queue.push({key, uri, mtime, mime});
            this._run();
        });
    }

    async _run() {
        if (this._running)
            return;
        this._running = true;
        while (this._queue.length) {
            const job = this._queue.shift();
            let path = null;
            try {
                // eslint-disable-next-line no-await-in-loop
                const pixbuf = await this._factory.generate_thumbnail_async(job.uri, job.mime, null);
                // eslint-disable-next-line no-await-in-loop
                await this._factory.save_thumbnail_async(pixbuf, job.uri, job.mtime, null);
                path = this._factory.lookup(job.uri, job.mtime);
            } catch {
                this._factory.create_failed_thumbnail_async(job.uri, job.mtime, null)
                    .catch(() => {});
            }
            for (const resolve of this._waiting.get(job.key) ?? [])
                resolve(path);
            this._waiting.delete(job.key);
        }
        this._running = false;
    }
}
