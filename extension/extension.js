import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DesktopManager} from './lib/desktopManager.js';
import {DeskIconsIndicator} from './lib/indicator.js';

export default class DeskIconsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._manager = new DesktopManager(this);
        this._manager.enable();

        this._indicatorId = this._settings.connect('changed::show-indicator',
            () => this._syncIndicator());
        this._syncIndicator();
    }

    disable() {
        this._settings.disconnect(this._indicatorId);
        this._indicator?.destroy();
        this._indicator = null;
        this._manager.destroy();
        this._manager = null;
        this._settings = null;
    }

    _syncIndicator() {
        const show = this._settings.get_boolean('show-indicator');
        if (show && !this._indicator) {
            this._indicator = new DeskIconsIndicator(this, this._manager);
            Main.panel.addToStatusArea(this.uuid, this._indicator);
        } else if (!show && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
