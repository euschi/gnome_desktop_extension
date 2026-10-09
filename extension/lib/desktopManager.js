// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Avvia il processo helper GTK4 come client Wayland "fidato" e trasforma le
// sue finestre in finestre desktop: sotto tutte le altre, su tutti i
// workspace, fuori da Alt-Tab/overview, posizionate sull'area di lavoro di
// ciascun monitor.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TITLE_RE = /^@deskicons:(\d+)$/;
const RESTART_DELAY_MS = 1000;
const MAX_CRASHES = 5;
const CRASH_WINDOW_US = 60 * GLib.USEC_PER_SEC;

export class DesktopManager {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._client = null;
        this._subprocess = null;
        this._cancellable = null;
        this._windows = new Map(); // MetaWindow -> {monitor, signals[]}
        this._monitors = [];
        this._crashes = [];
        this._restartId = 0;
        this._signals = [];
        this._destroyed = false;
    }

    enable() {
        this._connect(Main.layoutManager, 'monitors-changed', () => this.restart());
        this._connect(global.display, 'workareas-changed', () => this._placeAll());
        this._connect(global.display, 'window-created', (_d, win) => this._onWindowCreated(win));
        this._connect(this._settings, 'changed::monitors', () => this.restart());
        this._launch();
    }

    destroy() {
        this._destroyed = true;
        if (this._restartId) {
            GLib.source_remove(this._restartId);
            this._restartId = 0;
        }
        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        this._signals = [];
        this._kill();
    }

    restart() {
        this._kill();
        this._scheduleLaunch(200);
    }

    _connect(obj, signal, cb) {
        this._signals.push([obj, obj.connect(signal, cb)]);
    }

    _computeMonitors() {
        const lm = Main.layoutManager;
        const onlyPrimary = this._settings.get_string('monitors') === 'primary';
        const list = [];
        for (const m of lm.monitors) {
            if (onlyPrimary && m.index !== lm.primaryIndex)
                continue;
            const wa = lm.getWorkAreaForMonitor(m.index);
            list.push({
                index: m.index,
                primary: m.index === lm.primaryIndex,
                x: wa.x, y: wa.y, width: wa.width, height: wa.height,
            });
        }
        // Il primario per primo: è lì che vanno le nuove icone
        list.sort((a, b) => (b.primary - a.primary) || (a.x - b.x) || (a.y - b.y));
        return list;
    }

    _launch() {
        if (this._destroyed || this._client)
            return;

        const gjs = GLib.find_program_in_path('gjs');
        if (!gjs) {
            logError(new Error('gjs not found in PATH'), 'DeskIcons');
            return;
        }

        this._monitors = this._computeMonitors();
        const dir = this._extension.path;
        const argv = [
            gjs, '-m', `${dir}/app/main.js`,
            '--extension-dir', dir,
            '--monitors', JSON.stringify(this._monitors.map(m => ({
                index: m.index, primary: m.primary, width: m.width, height: m.height,
            }))),
        ];

        try {
            const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
            launcher.set_cwd(GLib.get_home_dir());
            this._client = Meta.WaylandClient.new_subprocess(global.context, launcher, argv);
        } catch (e) {
            logError(e, 'DeskIcons: cannot start the helper');
            this._client = null;
            return;
        }

        this._subprocess = this._client.get_subprocess();
        this._cancellable = new Gio.Cancellable();
        const client = this._client;
        this._subprocess.wait_async(this._cancellable, (proc, res) => {
            try {
                proc.wait_finish(res);
            } catch {
                return; // cancellato da _kill()
            }
            if (this._client !== client)
                return;
            this._client = null;
            this._subprocess = null;
            this._forgetWindows();
            if (!this._destroyed)
                this._onHelperExited(proc);
        });

        // Le finestre potrebbero già esistere (es. riavvio rapido)
        for (const actor of global.get_window_actors())
            this._onWindowCreated(actor.get_meta_window());
    }

    _onHelperExited(proc) {
        const status = proc.get_if_exited() ? proc.get_exit_status() : -1;
        if (status === 0)
            return; // uscita volontaria

        const now = GLib.get_monotonic_time();
        this._crashes = this._crashes.filter(t => now - t < CRASH_WINDOW_US);
        this._crashes.push(now);
        if (this._crashes.length > MAX_CRASHES) {
            logError(new Error('helper exited too many times, not restarting it'), 'DeskIcons');
            return;
        }
        this._scheduleLaunch(RESTART_DELAY_MS);
    }

    _scheduleLaunch(delay) {
        if (this._restartId)
            GLib.source_remove(this._restartId);
        this._restartId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._restartId = 0;
            this._launch();
            return GLib.SOURCE_REMOVE;
        });
    }

    _kill() {
        this._cancellable?.cancel();
        this._cancellable = null;
        this._subprocess?.send_signal(15);
        this._subprocess = null;
        this._client = null;
        this._forgetWindows();
    }

    _forgetWindows() {
        for (const [win, data] of this._windows) {
            for (const id of data.signals)
                win.disconnect(id);
        }
        this._windows.clear();
    }

    _onWindowCreated(win) {
        if (!win || !this._client || this._windows.has(win))
            return;
        let owned = false;
        try {
            owned = this._client.owns_window(win);
        } catch {
            owned = false;
        }
        if (!owned)
            return;

        const data = {monitor: null, signals: []};
        this._windows.set(win, data);
        data.signals.push(win.connect('notify::title', () => this._setup(win)));
        data.signals.push(win.connect('position-changed', () => this._place(win)));
        data.signals.push(win.connect('size-changed', () => this._place(win)));
        data.signals.push(win.connect('unmanaged', () => {
            for (const id of data.signals)
                win.disconnect(id);
            this._windows.delete(win);
        }));
        this._setup(win);
    }

    _setup(win) {
        const data = this._windows.get(win);
        const match = TITLE_RE.exec(win.get_title() ?? '');
        if (!data || !match)
            return;
        const index = parseInt(match[1]);
        data.monitor = this._monitors.find(m => m.index === index) ?? null;
        if (!data.monitor)
            return;

        if (win.get_window_type() !== Meta.WindowType.DESKTOP)
            win.set_type(Meta.WindowType.DESKTOP);
        if (!win.is_on_all_workspaces())
            win.stick();
        win.hide_from_window_list?.();
        this._place(win);
    }

    _placeAll() {
        // L'area di lavoro può cambiare (pannelli, dock): aggiorna geometrie
        const fresh = this._computeMonitors();
        for (const m of this._monitors) {
            const f = fresh.find(n => n.index === m.index);
            if (f)
                Object.assign(m, f);
        }
        for (const win of this._windows.keys())
            this._place(win);
    }

    _place(win) {
        const m = this._windows.get(win)?.monitor;
        if (!m)
            return;
        const r = win.get_frame_rect();
        if (r.x === m.x && r.y === m.y && r.width === m.width && r.height === m.height)
            return;
        win.move_resize_frame(false, m.x, m.y, m.width, m.height);
    }
}
