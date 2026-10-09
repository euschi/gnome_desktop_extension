// Finestra trasparente che copre l'area di lavoro di un monitor. La Shell la
// riconosce dal titolo "@deskicons:<monitor>" e la rende finestra desktop.

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';

import {FileItem} from './fileItem.js';

const DesktopGrid = GObject.registerClass({
    Signals: {'resized': {}},
}, class DesktopGrid extends Gtk.Fixed {
    _init() {
        super._init({css_classes: ['deskicons-grid'], hexpand: true, vexpand: true});
        this._lastSize = [0, 0];
    }

    vfunc_size_allocate(width, height, baseline) {
        super.vfunc_size_allocate(width, height, baseline);
        if (width !== this._lastSize[0] || height !== this._lastSize[1]) {
            this._lastSize = [width, height];
            // Fuori dal ciclo di allocazione: il relayout sposta i figli
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this.emit('resized');
                return GLib.SOURCE_REMOVE;
            });
        }
    }
});

export const DesktopWindow = GObject.registerClass(
class DesktopWindow extends Gtk.ApplicationWindow {
    _init(app, controller, monitor, debug) {
        super._init({
            application: app,
            title: `@deskicons:${monitor.index}`,
            decorated: debug,
            resizable: true,
            default_width: debug ? Math.round(monitor.width * 0.6) : monitor.width,
            default_height: debug ? Math.round(monitor.height * 0.6) : monitor.height,
            css_classes: debug ? ['deskicons-window', 'debug'] : ['deskicons-window'],
        });
        this.monitor = monitor;
        this._controller = controller;

        this.grid = new DesktopGrid();
        this.grid.connect('resized', () => controller.relayout());
        this.set_child(this.grid);

        this._band = new Gtk.Box({css_classes: ['rubberband'], visible: false, can_target: false});
        this.grid.put(this._band, 0, 0);

        this._setupClick();
        this._setupRubberBand();
        this._setupDrop();

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_c, keyval, _code, state) =>
            controller.onKeyPressed(this, keyval, state));
        this.add_controller(keys);
    }

    get gridWidth() {
        return this.grid.get_width() || this.get_width() || this.monitor.width;
    }

    get gridHeight() {
        return this.grid.get_height() || this.get_height() || this.monitor.height;
    }

    itemAt(x, y) {
        let w = this.grid.pick(x, y, Gtk.PickFlags.DEFAULT);
        while (w && w !== this.grid) {
            if (w instanceof FileItem)
                return w;
            w = w.get_parent();
        }
        return null;
    }

    _setupClick() {
        const click = new Gtk.GestureClick({button: 0});
        click.connect('pressed', (gesture, nPress, x, y) => {
            const button = gesture.get_current_button();
            const state = gesture.get_current_event_state();
            const widget = this.itemAt(x, y);
            this.grab_focus();
            if (widget)
                this._controller.onItemPressed(this, widget, button, nPress, state, x, y);
            else
                this._controller.onBackgroundPressed(this, button, state, x, y);
        });
        click.connect('released', (gesture, nPress, x, y) => {
            const widget = this.itemAt(x, y);
            if (widget) {
                this._controller.onItemReleased(this, widget, gesture.get_current_button(),
                    nPress, gesture.get_current_event_state());
            }
        });
        this.grid.add_controller(click);
    }

    _setupRubberBand() {
        const drag = new Gtk.GestureDrag({button: Gdk.BUTTON_PRIMARY});
        let startX = 0, startY = 0;
        drag.connect('drag-begin', (gesture, x, y) => {
            if (this.itemAt(x, y)) {
                gesture.set_state(Gtk.EventSequenceState.DENIED);
                return;
            }
            startX = x;
            startY = y;
            // Il rettangolo va disegnato sopra le icone
            if (this.grid.get_last_child() !== this._band)
                this._band.insert_before(this.grid, null);
            this._controller.onRubberBandBegin(this, gesture.get_current_event_state());
        });
        drag.connect('drag-update', (_g, dx, dy) => {
            const rect = {
                x: Math.min(startX, startX + dx), y: Math.min(startY, startY + dy),
                width: Math.abs(dx), height: Math.abs(dy),
            };
            this._band.visible = true;
            this.grid.move(this._band, rect.x, rect.y);
            this._band.set_size_request(rect.width, rect.height);
            this._controller.onRubberBandUpdate(this, rect);
        });
        drag.connect('drag-end', () => {
            this._band.visible = false;
            this._band.set_size_request(0, 0);
        });
        this.grid.add_controller(drag);
    }

    _setupDrop() {
        // DropTargetAsync + text/uri-list: gjs non sa gestire Gdk.FileList nei GValue
        const target = new Gtk.DropTargetAsync({
            actions: Gdk.DragAction.COPY | Gdk.DragAction.MOVE | Gdk.DragAction.LINK,
            formats: Gdk.ContentFormats.new(['text/uri-list']),
        });
        target.connect('accept', (_t, drop) =>
            drop.get_formats().contain_mime_type('text/uri-list'));
        target.connect('drag-enter', (_t, drop, x, y) =>
            this._controller.onDropMotion(this, drop, x, y, true));
        target.connect('drag-motion', (_t, drop, x, y) =>
            this._controller.onDropMotion(this, drop, x, y, false));
        target.connect('drag-leave', () => this._controller.onDropLeave(this));
        target.connect('drop', (_t, drop, x, y) => {
            this._controller.onDrop(this, drop, x, y);
            return true;
        });
        this.grid.add_controller(target);
    }

    addItemWidget(widget, x, y) {
        if (widget.get_parent() === this.grid) {
            this.grid.move(widget, x, y);
            return;
        }
        widget.get_parent()?.remove(widget);
        this.grid.put(widget, x, y);
    }

    // Mostra un menù a comparsa nel punto indicato
    popupMenu(model, x, y) {
        const popover = Gtk.PopoverMenu.new_from_model(model);
        popover.set_has_arrow(false);
        popover.set_halign(Gtk.Align.START);
        popover.set_position(Gtk.PositionType.BOTTOM);
        popover.set_parent(this.grid);
        const rect = new Gdk.Rectangle({x: Math.round(x), y: Math.round(y), width: 1, height: 1});
        popover.set_pointing_to(rect);
        popover.connect('closed', () => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                popover.unparent();
                return GLib.SOURCE_REMOVE;
            });
        });
        popover.popup();
    }
});
