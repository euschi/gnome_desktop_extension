# Icone Desktop — estensione GNOME Shell

Icone sul desktop per GNOME Shell 51 (Wayland), in stile DING: selezione
multipla, spostamento libero o su griglia, drag & drop anche con Nautilus,
menù contestuali, indicatore nel pannello e app di impostazioni.

## Architettura

- **`extension/extension.js` + `lib/`** (processo della Shell): avvia l'helper
  con `Meta.WaylandClient`, ne trasforma le finestre in finestre di tipo
  `DESKTOP` (sotto tutto, su tutti i workspace, fuori da Alt-Tab/overview) e le
  posiziona sull'area di lavoro di ogni monitor. Ospita l'indicatore nel
  pannello, che invoca le azioni dell'helper via D-Bus (`org.gtk.Actions`).
- **`extension/app/`** (helper GTK4/libadwaita, `gjs`): una finestra
  trasparente per monitor con griglia, selezione, drag & drop, menù e
  operazioni sui file (via `org.gnome.Nautilus.FileOperations2`, con
  annulla/ripeti condiviso con Nautilus).
- **`extension/prefs.js`**: app impostazioni, apribile anche dal menù
  applicazioni tramite `launcher/deskicons-settings.desktop`.
- Le posizioni delle icone sono salvate in
  `~/.local/share/deskicons/positions.json`.

## Installazione

```sh
make install          # compila gli schemi, symlink in ~/.local/share/gnome-shell/extensions
# Wayland: logout/login, poi
gnome-extensions enable deskicons@eugenio.schintu
```

`make uninstall` rimuove tutto, `make zip` crea il pacchetto in `dist/`.

## Uso

| Azione | Come |
| --- | --- |
| Selezione | click, Ctrl+click (aggiungi/togli), Shift+click (intervallo), trascinamento sullo sfondo (rettangolo) |
| Spostare | trascina una o più icone; rilascia su una cartella per spostarle dentro, sul Cestino per cestinarle |
| Aprire | doppio click (o singolo, da impostazioni), Invio |
| Tastiera | Ctrl+A/C/X/V, Ctrl+Z / Ctrl+Shift+Z, Canc, Shift+Canc, F2, frecce, Ctrl+Shift+N, Menu / Shift+F10 |
| Menù | tasto destro su sfondo o icone; indicatore nel pannello |

## Sviluppo

```sh
make debug                                    # helper in una finestra normale
gjs -m extension/app/main.js --snapshot out.png --extension-dir extension   # PNG della finestra
journalctl -f -o cat /usr/bin/gnome-shell     # log della Shell
```
