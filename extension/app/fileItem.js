// Widget di una singola icona: immagine (icona o miniatura), emblemi ed
// etichetta. Il drag delle icone parte da qui; selezione e azioni sono
// gestite dal DesktopController.

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Pango from 'gi://Pango';

import {itemSize} from './layout.js';

export const FileItem = GObject.registerClass(
class FileItem extends Gtk.Box {
    _init(controller, item) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            css_classes: ['deskicon'],
            halign: Gtk.Align.START,
            valign: Gtk.Align.START,
        });
        this._controller = controller;
        this.item = item;
        this._thumbPath = null;

        this._overlay = new Gtk.Overlay({halign: Gtk.Align.CENTER});
        this._image = new Gtk.Image();
        this._overlay.set_child(this._image);
        this._emblem = new Gtk.Image({
            halign: Gtk.Align.END, valign: Gtk.Align.END,
            pixel_size: 16, css_classes: ['emblem'], visible: false,
        });
        this._overlay.add_overlay(this._emblem);
        this.append(this._overlay);

        this._label = new Gtk.Label({
            justify: Gtk.Justification.CENTER,
            wrap: true,
            wrap_mode: Pango.WrapMode.WORD_CHAR,
            ellipsize: Pango.EllipsizeMode.END,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.START,
        });
        this.append(this._label);

        const drag = new Gtk.DragSource({
            actions: Gdk.DragAction.COPY | Gdk.DragAction.MOVE | Gdk.DragAction.LINK,
        });
        drag.connect('prepare', (_s, x, y) => {
            this._dragX = Math.round(x);
            this._dragY = Math.round(y);
            return controller.onDragPrepare(this, x, y);
        });
        drag.connect('drag-begin', (source, gdkDrag) => {
            source.set_icon(Gtk.WidgetPaintable.new(this), this._dragX, this._dragY);
            controller.onDragBegin(this, gdkDrag);
        });
        drag.connect('drag-end', () => controller.onDragEnd(this));
        this.add_controller(drag);

        this.applySettings(controller.settings);
        this.update(item);
    }

    applySettings(settings) {
        const size = itemSize(settings);
        this._size = size;
        this.set_size_request(size.width, size.height);
        this._image.set_pixel_size(size.icon);
        this._label.set_lines(size.lines);
        // Limita la larghezza naturale dell'etichetta alla larghezza dell'icona
        this._label.set_max_width_chars(Math.max(6, Math.floor((size.width - 8) / 7)));
        this._label.set_size_request(size.width - 8, -1);
        this._showThumbs = settings.get_boolean('show-thumbnails');
        this._updateImage();
    }

    update(item) {
        this.item = item;
        this._label.set_label(item.displayName);
        this.set_tooltip_text(item.kind === 'file' ? item.displayName : null);

        let emblem = null;
        if (item.isSymlink)
            emblem = 'emblem-symbolic-link';
        else if (item.isLauncher && !item.isTrusted)
            emblem = 'emblem-unreadable';
        this._emblem.visible = !!emblem;
        if (emblem)
            this._emblem.set_from_icon_name(emblem);

        this._thumbPath = null;
        this._updateImage();
        if (this._showThumbs)
            this._loadThumbnail();
    }

    async _loadThumbnail() {
        const item = this.item;
        const path = await this._controller.thumbnailer.lookup(item);
        if (path && this.item === item) {
            this._thumbPath = path;
            this._updateImage();
        }
    }

    _updateImage() {
        if (this._showThumbs && this._thumbPath) {
            try {
                this._image.set_from_paintable(Gdk.Texture.new_from_filename(this._thumbPath));
                return;
            } catch {
                this._thumbPath = null;
            }
        }
        this._image.set_from_gicon(this.item?.gicon ?? Gio.ThemedIcon.new('text-x-generic'));
    }

    setSelected(selected) {
        if (selected)
            this.add_css_class('selected');
        else
            this.remove_css_class('selected');
    }

    setCut(cut) {
        if (cut)
            this.add_css_class('cut');
        else
            this.remove_css_class('cut');
    }

    setDropHighlight(on) {
        if (on)
            this.add_css_class('drop-target');
        else
            this.remove_css_class('drop-target');
    }

    get isDropTarget() {
        return this.item.isDir || this.item.kind === 'trash' ||
            (this.item.isLauncher && this.item.isTrusted);
    }

    // Rinomina inline con un popover
    startRename(onDone) {
        const entry = new Gtk.Entry({text: this.item.info.get_display_name(), width_chars: 24});
        const popover = new Gtk.Popover({child: entry, position: Gtk.PositionType.BOTTOM});
        popover.set_parent(this);
        let done = false;
        const finish = apply => {
            if (done)
                return;
            done = true;
            const text = entry.get_text().trim();
            popover.popdown();
            if (apply && text && text !== this.item.info.get_display_name())
                onDone(text);
        };
        entry.connect('activate', () => finish(true));
        popover.connect('closed', () => {
            finish(false);
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                popover.unparent();
                return GLib.SOURCE_REMOVE;
            });
        });
        popover.popup();
        entry.grab_focus();
        const name = entry.get_text();
        const dot = this.item.isDir ? -1 : name.lastIndexOf('.');
        entry.select_region(0, dot > 0 ? dot : -1);
    }
});

