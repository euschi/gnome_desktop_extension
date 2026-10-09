# Icone Desktop — GNOME Shell extension

Brings **desktop icons** back to GNOME. It shows the contents of the Desktop
folder (plus Trash, Home and mounted drives) right on the wallpaper, with
everything you would expect from a "classic" desktop: multiple selection,
free icon placement, drag & drop with Nautilus, context menus, a panel
indicator and a settings app to customize every aspect.

- **UUID:** `deskicons@euschi.github.io`
- **Supported GNOME Shell:** 51 (**Wayland** session)
- **License:** GPL-2.0-or-later (see [`LICENSE`](LICENSE))
- **Repository:** <https://github.com/euschi/gnome_desktop_extension>

The user interface is in English and follows the system language when a
translation is available (currently: Italian). See [Translations](#translations).

---

## Contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [First run and verification](#first-run-and-verification)
5. [Usage](#usage)
6. [Settings](#settings)
7. [Updating and uninstalling](#updating-and-uninstalling)
8. [How it works (architecture)](#how-it-works-architecture)
9. [Project structure](#project-structure)
10. [Development and debugging](#development-and-debugging)
11. [Translations](#translations)
12. [Troubleshooting](#troubleshooting)
13. [Publishing on extensions.gnome.org](#publishing-on-extensionsgnomeorg)
14. [Known limitations](#known-limitations)

---

## Features

**Icons**
- Shows files and folders of the Desktop (`xdg-user-dir DESKTOP`, e.g. `~/Desktop`).
- Optional special items: **Trash** (full/empty icon), **Home**,
  **mounted drives** (USB sticks, disks) and **network drives**.
- **Thumbnails** of images, videos and documents (same cache as Nautilus).
- `.desktop` launchers show the application's name and icon; untrusted ones
  get an emblem and ask for confirmation before launching.
- Automatic refresh: files created, renamed or deleted by any program
  appear/disappear immediately.

**Selection and moving**
- Click, **Ctrl+click** (add/remove), **Shift+click** (range),
  **rubber-band selection** by dragging on the background.
- Drag one or more icons **anywhere**: aligned to the grid or freely
  positioned to the pixel. Positions are **remembered**.
- Drop icons **onto a folder** to move them inside, **onto the Trash** to
  trash them, onto a **launcher** to open them with that app.
- **Drag & drop with Nautilus** and other applications, in both directions
  (move on the same disk, copy across disks, like Nautilus).

**Menus**
- **Right click on the background:** new folder, new document (from the
  templates in `~/Templates`), paste, undo/redo, select all, sort by,
  arrange icons, keep arranged, align to grid, show hidden files, open in
  terminal, open Desktop in Files, change background, show icons, settings.
- **Right click on icons:** open / run, open with…, allow launching, cut,
  copy, copy path, rename, move to trash, delete permanently, show in Files,
  open in terminal, properties. Dedicated entries for Trash (empty) and
  drives (unmount / eject).
- **Panel indicator** in the top-right corner with quick actions.

**Integration**
- Copy/cut/paste compatible with Nautilus (copy in Nautilus and paste on the
  desktop, and vice versa).
- File operations performed through Nautilus: progress windows, conflict
  handling and **undo/redo shared** with the file manager.
- Multi-monitor: icons on all monitors or only on the primary one.

---

## Requirements

| Component | Tested version | Arch/EndeavourOS package |
| --- | --- | --- |
| GNOME Shell | 51 | `gnome-shell` |
| gjs | 1.90 | `gjs` |
| GTK 4 | 4.24 | `gtk4` |
| libadwaita | 1.10 | `libadwaita` |
| gnome-desktop (thumbnails) | 4.0 | `gnome-desktop-4` |
| Nautilus (recommended) | 51 | `nautilus` |
| Build tools | — | `glib2` (`glib-compile-schemas`), `gettext`, `make` |

On Arch/EndeavourOS this is enough:

```sh
sudo pacman -S --needed gnome-shell gjs gtk4 libadwaita gnome-desktop-4 nautilus glib2 gettext make git
```

Nautilus is optional but strongly recommended: without it, file operations
still work (through Gio) but without progress windows or undo/redo.

> **Important:** do not use this extension together with another desktop
> icons extension (e.g. *Desktop Icons NG (DING)* or *Gtk4 Desktop Icons NG*).
> Disable them first: `gnome-extensions disable ding@rastersoft.com`.

---

## Installation

### 1. Get the project

```sh
git clone git@github.com:euschi/gnome_desktop_extension.git
cd gnome_desktop_extension
```

(With HTTPS: `git clone https://github.com/euschi/gnome_desktop_extension.git`.)

### 2. Install

```sh
make install
```

This command:
1. compiles the settings schema (`extension/schemas/gschemas.compiled`) and
   the translations (`extension/locale/`);
2. creates the **symbolic link**
   `~/.local/share/gnome-shell/extensions/deskicons@euschi.github.io → extension/`
   (so every code change is immediately "installed");
3. copies the settings launcher to
   `~/.local/share/applications/deskicons-settings.desktop`.

### 3. Restart the session

On **Wayland** GNOME Shell cannot be restarted on the fly: to make it pick up
a new extension you have to **log out and log back in**.

### 4. Enable the extension

```sh
gnome-extensions enable deskicons@euschi.github.io
```

or from the **Extensions** app (`gnome-extensions-app`) by enabling
*Icone Desktop*.

### Alternative installation from a zip package

If you prefer a copy independent of the repository (no symlink):

```sh
make zip                                   # creates dist/deskicons@euschi.github.io.shell-extension.zip
gnome-extensions install --force dist/deskicons@euschi.github.io.shell-extension.zip
glib-compile-schemas ~/.local/share/gnome-shell/extensions/deskicons@euschi.github.io/schemas
install -Dm644 launcher/deskicons-settings.desktop ~/.local/share/applications/deskicons-settings.desktop
# log out/in, then
gnome-extensions enable deskicons@euschi.github.io
```

---

## First run and verification

Once enabled you should see:
- the Desktop icons in the top-left corner (by default);
- a screen-shaped icon in the top-right of the panel (the indicator).

To check the status:

```sh
gnome-extensions info deskicons@euschi.github.io   # should report state ACTIVE
pgrep -af deskicons                                # helper process "gjs -m …/app/main.js"
```

If something is wrong, see [Troubleshooting](#troubleshooting).

---

## Usage

### Mouse

| Action | Result |
| --- | --- |
| Click on icon | selects only that icon |
| Ctrl + click | adds/removes the icon from the selection |
| Shift + click | selects all icons in the rectangle between the last clicked one and this one |
| Drag on the background | rubber-band selection (with Ctrl/Shift it adds to the selection) |
| Click on the background | deselects everything |
| Double click (or single, see settings) | opens file/folder, runs launcher |
| Drag icons | moves the selection keeping the distances between icons |
| Drag onto folder / Trash | moves into the folder / trashes |
| Drag onto another window (e.g. Nautilus) | copies or moves the files there |
| Drag from Nautilus to the desktop | files land at the drop point |
| Right click | context menu (background or icons) |

While dragging, as in Nautilus: **Ctrl** forces copy, **Shift** forces move.

### Keyboard

Works when the desktop has focus (after clicking on it).

| Keys | Action |
| --- | --- |
| Arrows | moves the selection to the nearby icon (with Shift extends the selection) |
| Enter | open |
| F2 | rename |
| Delete | move to trash |
| Shift + Delete | delete permanently (with confirmation) |
| Ctrl + A | select all |
| Ctrl + C / Ctrl + X / Ctrl + V | copy / cut / paste |
| Ctrl + Z / Ctrl + Shift + Z (or Ctrl + Y) | undo / redo |
| Ctrl + Shift + N | new folder |
| Menu or Shift + F10 | opens the context menu |
| Esc | clears the selection and the "cut" state |

### New icons and sorting

- A new file (downloaded, created from a terminal, pasted…) is placed in the
  **first free cell** starting from the corner chosen in the settings,
  filling columns first or rows first.
- If you create/paste/drop something at a specific spot (right click → New
  folder, Paste, drag from Nautilus), the icon appears **there**.
- **Arrange icons** sorts everything once by the chosen criterion (name,
  date, type, size); afterwards you can move them by hand again.
- **Keep arranged** keeps the icons always sorted: in this mode icons cannot
  be moved by hand (but dropping onto folders still works).

### `.desktop` launchers

A `.desktop` file copied to the Desktop is not executed until it is
**trusted**. You can trust it with right click → **Allow launching**, or by
confirming the dialog on first launch. This sets the executable permission
and the `metadata::trusted` attribute (the same one used by DING). In the
settings you can choose to always launch them without asking.

### Panel indicator

The icon in the top-right offers: **Show icons** (hides/shows everything),
**Keep arranged**, **Arrange icons**, **Sort by**, **New folder**,
**Open Desktop in Files**, **Reload** (restarts the helper) and
**Settings…**. It can be hidden from the settings.

---

## Settings

Open the app in one of these ways:
- applications menu → **Desktop Icons**;
- panel indicator → **Settings…**;
- right click on the desktop → **Icon settings…**;
- `gnome-extensions prefs deskicons@euschi.github.io`.

Every change is applied **immediately**, without restarting.

| Page | Option | Default | Description |
| --- | --- | --- | --- |
| Appearance | Icon size | 64 px | from 32 to 128 |
| | Spacing | 8 px | space between cells |
| | Show thumbnails | yes | thumbnails of images/videos/documents |
| | Max lines | 2 | lines of the name below the icon (1–4) |
| | Label style | Shadow | Shadow, Dark background or None |
| Layout | Start corner | top left | where new icons appear |
| | Fill direction | columns | vertical first or horizontal first |
| | Monitors | all | all monitors or only the primary one |
| | Align to grid | yes | if off, icons stay exactly where you drop them |
| | Keep arranged | no | permanent automatic sorting |
| | Sort by / reversed / folders first | name / no / yes | criterion for "Arrange" and "Keep arranged" |
| | Margins | 12 px | free space at the four edges |
| Behaviour | Open items with | double click | or single click |
| | Untrusted launchers | ask for confirmation | or always launch |
| | Terminal | automatic | custom command, e.g. `kitty` (the folder is passed as working directory) |
| | Confirm before trashing | no | dialog before moving to trash |
| | Panel indicator | yes | shows/hides the panel icon |
| | Show icons on the desktop | yes | same as the indicator toggle |
| | Reset to defaults | — | restores all initial values |
| Items | Home, Trash, Mounted drives, Network drives | no, yes, yes, no | special items |
| | Show hidden files | no | files starting with `.` and `~` backup files |

Settings are regular GSettings and can also be managed from the terminal:

```sh
SCHEMA=org.gnome.shell.extensions.deskicons
DIR=~/.local/share/gnome-shell/extensions/deskicons@euschi.github.io/schemas
gsettings --schemadir $DIR list-recursively $SCHEMA
gsettings --schemadir $DIR set $SCHEMA icon-size 80
```

Icon positions are saved in `~/.local/share/deskicons/positions.json`
(delete it to start from scratch).

---

## Updating and uninstalling

**Updating** (installation via `make install`):

```sh
cd gnome_desktop_extension
git pull
make schemas locale
```

- Changes to the helper only (`extension/app/`): just use **Reload** from the
  indicator.
- Changes to `extension.js`, `lib/`, `prefs.js` or `metadata.json`: a log
  out/in is required.

**Uninstalling:**

```sh
make uninstall
rm -rf ~/.local/share/deskicons          # saved positions (optional)
```

---

## How it works (architecture)

GNOME on Wayland does not allow a regular app to draw "below" the windows,
so the project is split into two processes (the same approach as DING):

```
┌───────────────────────── GNOME Shell ─────────────────────────┐
│ extension.js                                                   │
│  ├─ DesktopManager (lib/desktopManager.js)                     │
│  │   • spawns the helper with Meta.WaylandClient.new_subprocess│
│  │   • recognizes its windows (owns_window + title             │
│  │     "@deskicons:<monitor>") and makes them DESKTOP type:    │
│  │     below everything, on all workspaces, out of Alt-Tab     │
│  │   • places them on the work area of each monitor            │
│  │   • restarts the helper if it exits abnormally              │
│  └─ Indicator (lib/indicator.js) ───── D-Bus org.gtk.Actions ─┐│
└────────────────────────────────────────────────────────────────┘│
                                                                  ▼
┌──────────────── GTK4 / libadwaita helper (gjs) ────────────────┐
│ app/main.js            Adw.Application "it.eugenio.DeskIcons"  │
│ app/desktopController  selection, DnD, menus, actions          │
│ app/desktopWindow      one transparent window per monitor      │
│ app/desktopModel       Desktop files + Gio monitor             │
│ app/layout, positions  grid, placement, persistence            │
│ app/fileOps            org.gnome.Nautilus.FileOperations2      │
└────────────────────────────────────────────────────────────────┘
```

- Configuration is shared through **GSettings**
  (`org.gnome.shell.extensions.deskicons`); the helper loads the schema from
  the extension folder and reacts to changes in real time.
- Drag & drop uses the standard `text/uri-list` format, so it works with any
  file manager or app that accepts files.
- The clipboard uses `x-special/gnome-copied-files` (the same as Nautilus) to
  tell copy and cut apart.
- When the extension is disabled the helper receives SIGTERM and exits; no
  orphan processes are left behind.

---

## Project structure

```
gnome_desktop_extension/
├── Makefile                   # schemas, locale, pot, install, uninstall, zip, debug
├── po/                        # translations (deskicons.pot template, <lang>.po)
├── launcher/
│   └── deskicons-settings.desktop   # "Desktop Icons" entry in the app menu
└── extension/                 # = the installed extension folder
    ├── metadata.json
    ├── extension.js           # entry point in the Shell
    ├── prefs.js               # settings app (libadwaita)
    ├── lib/
    │   ├── desktopManager.js  # helper process and window management
    │   └── indicator.js       # panel indicator
    ├── schemas/
    │   └── org.gnome.shell.extensions.deskicons.gschema.xml
    └── app/                   # GTK4 helper
        ├── main.js            # startup, arguments, GSettings
        ├── desktopController.js
        ├── desktopWindow.js
        ├── desktopModel.js
        ├── fileItem.js        # icon widget
        ├── layout.js          # grid and placement algorithms
        ├── positions.js       # position persistence
        ├── menus.js           # context menus
        ├── fileOps.js         # file operations (Nautilus / Gio)
        ├── clipboard.js       # Nautilus-compatible clipboard
        ├── thumbnails.js      # thumbnails (GnomeDesktop)
        ├── i18n.js            # gettext for the helper process
        ├── utils.js
        └── style.css
```

---

## Development and debugging

```sh
make debug
```
Runs the helper in a **regular window** (without the Shell), handy for
working on the grid, menus and interactions without logging out.

**Lint** (configuration in `eslint.config.mjs`, excluded from the zip):

```sh
npm i -g eslint @eslint/js      # once
make lint
```

**Logs:**

```sh
journalctl -f -o cat /usr/bin/gnome-shell     # Shell + helper ("DeskIcons" messages)
```

**Development loop:**
- helper code → *Reload* from the indicator (or
  `gnome-extensions disable … && gnome-extensions enable …`);
- Shell code → log out/in;
- GSettings schema changed → `make schemas`;
- translations changed → `make locale`, then *Reload* (helper) or log
  out/in (Shell side).

**Testing in an isolated Shell (no logout):** you can run a headless Shell
in a private D-Bus session, with configuration and data in a temporary
folder:

```sh
export GSETTINGS_BACKEND=keyfile XDG_CONFIG_HOME=/tmp/t/config XDG_DATA_HOME=/tmp/t/data
mkdir -p $XDG_DATA_HOME/gnome-shell/extensions
ln -s $PWD/extension $XDG_DATA_HOME/gnome-shell/extensions/deskicons@euschi.github.io
dbus-run-session -- sh -c '
  gsettings set org.gnome.shell enabled-extensions "[\"deskicons@euschi.github.io\"]"
  gnome-shell --headless --wayland --no-x11 --virtual-monitor 1600x900'
```

---

## Translations

All user-visible strings are written in English and wrapped with gettext
(`_()`), using the `deskicons` domain. The Shell side (`extension.js`,
`lib/`, `prefs.js`) uses the extension's built-in gettext; the helper process
binds the same domain to `extension/locale/` in `app/i18n.js`.

```
po/
├── LINGUAS          # list of available languages
├── deskicons.pot    # template, generated from the sources
└── it.po            # Italian
```

**Adding a language** (e.g. German):

```sh
make pot                                              # refresh the template
msginit -l de_DE.UTF-8 -i po/deskicons.pot -o po/de.po
# translate po/de.po (e.g. with Poedit or GTranslator), then:
echo de >> po/LINGUAS
make locale                                           # compile into extension/locale/
```

**After changing strings in the code**, run `make pot`: it regenerates the
template and merges the new strings into every `.po` file (new or changed
entries are marked *fuzzy* or left untranslated).

`make zip` compiles the translations into the package automatically
(`gnome-extensions pack --podir`). To test a language without changing the
system one: `LANGUAGE=it make debug`.

Pull requests with new translations are welcome.

---

## Troubleshooting

**I don't see any icons**
- `gnome-extensions info deskicons@euschi.github.io`: if the state is `ERROR`,
  read the reason with `journalctl -b -o cat /usr/bin/gnome-shell | grep -i deskicons`.
- Did you log out/in after `make install`?
- Make sure *Show icons* is not turned off (panel indicator).
- Check that no other desktop icons extension is enabled.

**`gnome-extensions enable` says the extension does not exist**
- The folder (or symlink) in `~/.local/share/gnome-shell/extensions/` must be
  named exactly like the `uuid` in `metadata.json`. Run `make install` again,
  then log out/in.

**"schema … not found"**
- Run `make schemas` (or `make install`) in the project folder.

**The helper keeps crashing**
- After 5 crashes within a minute it is no longer restarted. Run it by hand
  to see the error: `make debug`. Then *Reload* from the indicator.

**Copy/move/trash show no progress or undo**
- Nautilus is not installed or does not respond on D-Bus: the internal
  fallback (Gio) is used. Install `nautilus`.

**"Open in terminal" does nothing**
- No known terminal found (ptyxis, kgx, gnome-terminal, kitty, alacritty,
  foot, konsole, xterm). Set the command in the settings.

**Icons ended up in odd places after changing monitors**
- Right click → *Arrange icons*, or delete
  `~/.local/share/deskicons/positions.json`.

---

## Publishing on extensions.gnome.org

1. `make zip` → `dist/deskicons@euschi.github.io.shell-extension.zip`.
2. Static check recommended by EGO:
   ```sh
   python -m venv venv && . venv/bin/activate && pip install -U shexli
   shexli dist/deskicons@euschi.github.io.shell-extension.zip
   ```
   Two warnings are expected and are not real errors:
   - `EGO-P-007`: the files in `app/` are not imported by `extension.js`
     because they are the helper launched as a separate process;
   - `EGO-M-004` on `"51"`: Shexli versions that don't know GNOME 51 yet
     consider it a future version.
3. Upload the zip at <https://extensions.gnome.org/upload/>. In the notes for
   the reviewer, explain that `app/` is a GJS/GTK4 helper launched with
   `Meta.WaylandClient` (same approach as DING).

The GSettings schema is shipped as XML only: the Shell compiles it
automatically when installing the extension from extensions.gnome.org.

## Known limitations

- Only **GNOME Shell 51** on Wayland (declared in `metadata.json`); in X11
  sessions `Meta.WaylandClient` is not available.
- On Wayland, installation and updates to the Shell code require a log
  out/in.
- Renaming uses a small popover below the icon (not in-place editing of the
  label).
- With *Keep arranged* enabled, icons cannot be moved by hand.
