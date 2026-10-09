# Icone Desktop — estensione per GNOME Shell

Riporta le **icone sul desktop** in GNOME. Mostra il contenuto della cartella
Scrivania (più Cestino, Home e unità montate) direttamente sullo sfondo, con
tutto quello che ci si aspetta da un desktop "classico": selezione multipla,
spostamento libero delle icone, drag & drop con Nautilus, menù contestuali,
un indicatore nel pannello e un'app per personalizzare ogni aspetto.

- **UUID:** `deskicons@euschi.github.io`
- **GNOME Shell supportata:** 51 (sessione **Wayland**)
- **Licenza:** GPL-2.0-or-later (vedi [`LICENSE`](LICENSE))
- **Repository:** <https://github.com/euschi/gnome_desktop_extension>

---

## Indice

1. [Funzionalità](#funzionalità)
2. [Requisiti](#requisiti)
3. [Installazione](#installazione)
4. [Primo avvio e verifica](#primo-avvio-e-verifica)
5. [Guida all'uso](#guida-alluso)
6. [Impostazioni](#impostazioni)
7. [Aggiornamento e disinstallazione](#aggiornamento-e-disinstallazione)
8. [Come funziona (architettura)](#come-funziona-architettura)
9. [Struttura del progetto](#struttura-del-progetto)
10. [Sviluppo e debug](#sviluppo-e-debug)
11. [Risoluzione dei problemi](#risoluzione-dei-problemi)
12. [Pubblicazione su extensions.gnome.org](#pubblicazione-su-extensionsgnomeorg)
13. [Limitazioni note](#limitazioni-note)

---

## Funzionalità

**Icone**
- Mostra file e cartelle della Scrivania (`xdg-user-dir DESKTOP`, es. `~/Scrivania`).
- Elementi speciali opzionali: **Cestino** (icona piena/vuota), **Home**,
  **unità montate** (chiavette, dischi) e **unità di rete**.
- **Anteprime** di immagini, video e documenti (stessa cache di Nautilus).
- I lanciatori `.desktop` mostrano nome e icona dell'applicazione; quelli non
  attendibili hanno un emblema e chiedono conferma prima dell'avvio.
- Aggiornamento automatico: file creati, rinominati o cancellati da qualunque
  programma compaiono/spariscono subito.

**Selezione e spostamento**
- Click, **Ctrl+click** (aggiungi/togli), **Shift+click** (intervallo),
  **rettangolo di selezione** trascinando sullo sfondo.
- Trascina una o più icone **dove vuoi**: con allineamento alla griglia o in
  posizione libera al pixel. Le posizioni vengono **ricordate**.
- Rilascia le icone **su una cartella** per spostarle dentro, **sul Cestino**
  per cestinarle, su un **lanciatore** per aprirle con quell'app.
- **Drag & drop con Nautilus** e altre applicazioni, in entrambe le direzioni
  (sposta sullo stesso disco, copia tra dischi diversi, come Nautilus).

**Menù**
- **Tasto destro sullo sfondo:** nuova cartella, nuovo documento (dai modelli
  in `~/Modelli`), incolla, annulla/ripeti, seleziona tutto, ordina per,
  disponi icone, mantieni ordinate, allinea alla griglia, mostra file
  nascosti, apri nel terminale, apri Scrivania in File, cambia sfondo,
  mostra icone, impostazioni.
- **Tasto destro su icone:** apri / esegui, apri con…, consenti avvio,
  taglia, copia, copia percorso, rinomina, sposta nel cestino, elimina
  definitivamente, mostra in File, apri nel terminale, proprietà.
  Voci dedicate per Cestino (svuota) e unità (smonta / espelli).
- **Indicatore nel pannello** in alto a destra con le azioni rapide.

**Integrazione**
- Copia/taglia/incolla compatibili con Nautilus (puoi copiare in Nautilus e
  incollare sul desktop e viceversa).
- Operazioni sui file eseguite tramite Nautilus: finestre di avanzamento,
  gestione dei conflitti e **annulla/ripeti condiviso** con il file manager.
- Multi-monitor: icone su tutti i monitor o solo sul principale.

---

## Requisiti

| Componente | Versione testata | Pacchetto Arch/EndeavourOS |
| --- | --- | --- |
| GNOME Shell | 51 | `gnome-shell` |
| gjs | 1.90 | `gjs` |
| GTK 4 | 4.24 | `gtk4` |
| libadwaita | 1.10 | `libadwaita` |
| gnome-desktop (miniature) | 4.0 | `gnome-desktop-4` |
| Nautilus (consigliato) | 51 | `nautilus` |
| Strumenti di build | — | `glib2` (`glib-compile-schemas`), `make` |

Su Arch/EndeavourOS è sufficiente:

```sh
sudo pacman -S --needed gnome-shell gjs gtk4 libadwaita gnome-desktop-4 nautilus glib2 make git
```

Nautilus è opzionale ma fortemente consigliato: senza, le operazioni sui file
funzionano comunque (tramite Gio) ma senza finestre di avanzamento né
annulla/ripeti.

> **Importante:** non usare questa estensione insieme a un'altra estensione di
> icone desktop (es. *Desktop Icons NG (DING)* o *Gtk4 Desktop Icons NG*).
> Disattivale prima: `gnome-extensions disable ding@rastersoft.com`.

---

## Installazione

### 1. Scarica il progetto

```sh
mkdir -p ~/Documenti/my_code
cd ~/Documenti/my_code
git clone git@github.com:euschi/gnome_desktop_extension.git estensione_desktop
cd estensione_desktop
```

(Con HTTPS: `git clone https://github.com/euschi/gnome_desktop_extension.git estensione_desktop`.)

### 2. Installa

```sh
make install
```

Il comando:
1. compila lo schema delle impostazioni (`extension/schemas/gschemas.compiled`);
2. crea il **collegamento simbolico**
   `~/.local/share/gnome-shell/extensions/deskicons@euschi.github.io → extension/`
   (così ogni modifica al codice è subito "installata");
3. copia il lanciatore delle impostazioni in
   `~/.local/share/applications/deskicons-settings.desktop`.

### 3. Riavvia la sessione

Su **Wayland** GNOME Shell non può essere riavviata a caldo: per far
riconoscere una nuova estensione bisogna **uscire e rientrare** (logout/login).

### 4. Attiva l'estensione

```sh
gnome-extensions enable deskicons@euschi.github.io
```

oppure dall'app **Estensioni** (`gnome-extensions-app`) attivando
*Icone Desktop*.

### Installazione alternativa da pacchetto zip

Se preferisci una copia indipendente dal repository (niente symlink):

```sh
make zip                                   # crea dist/deskicons@euschi.github.io.shell-extension.zip
gnome-extensions install --force dist/deskicons@euschi.github.io.shell-extension.zip
glib-compile-schemas ~/.local/share/gnome-shell/extensions/deskicons@euschi.github.io/schemas
install -Dm644 launcher/deskicons-settings.desktop ~/.local/share/applications/deskicons-settings.desktop
# logout/login, poi
gnome-extensions enable deskicons@euschi.github.io
```

---

## Primo avvio e verifica

Dopo l'attivazione dovresti vedere:
- le icone della Scrivania nell'angolo in alto a sinistra (di default);
- un'icona a forma di schermo nel pannello in alto a destra (l'indicatore).

Per controllare lo stato:

```sh
gnome-extensions info deskicons@euschi.github.io   # deve dire "Stato: ACTIVE"
pgrep -af deskicons                                # processo helper "gjs -m …/app/main.js"
```

Se qualcosa non va, guarda la sezione
[Risoluzione dei problemi](#risoluzione-dei-problemi).

---

## Guida all'uso

### Mouse

| Azione | Risultato |
| --- | --- |
| Click su icona | seleziona solo quell'icona |
| Ctrl + click | aggiunge/toglie l'icona dalla selezione |
| Shift + click | seleziona tutte le icone nel rettangolo tra l'ultima cliccata e questa |
| Trascina sullo sfondo | rettangolo di selezione (con Ctrl/Shift si aggiunge alla selezione) |
| Click sullo sfondo | deseleziona tutto |
| Doppio click (o singolo, vedi impostazioni) | apre file/cartella, avvia lanciatore |
| Trascina icone | sposta la selezione mantenendo le distanze tra le icone |
| Trascina su cartella / Cestino | sposta dentro la cartella / cestina |
| Trascina su un'altra finestra (es. Nautilus) | copia o sposta lì i file |
| Trascina da Nautilus al desktop | i file arrivano nel punto di rilascio |
| Tasto destro | menù contestuale (sfondo o icone) |

Durante il trascinamento, come in Nautilus: **Ctrl** forza la copia,
**Shift** forza lo spostamento.

### Tastiera

Funziona quando il desktop ha il focus (dopo averci cliccato).

| Tasti | Azione |
| --- | --- |
| Frecce | sposta la selezione all'icona vicina (con Shift estende la selezione) |
| Invio | apri |
| F2 | rinomina |
| Canc | sposta nel cestino |
| Shift + Canc | elimina definitivamente (con conferma) |
| Ctrl + A | seleziona tutto |
| Ctrl + C / Ctrl + X / Ctrl + V | copia / taglia / incolla |
| Ctrl + Z / Ctrl + Shift + Z (o Ctrl + Y) | annulla / ripeti |
| Ctrl + Shift + N | nuova cartella |
| Menu oppure Shift + F10 | apre il menù contestuale |
| Esc | annulla la selezione e lo stato "taglia" |

### Nuove icone e ordinamento

- Un file nuovo (scaricato, creato da terminale, incollato…) viene messo nella
  **prima cella libera** partendo dall'angolo scelto nelle impostazioni,
  riempiendo prima le colonne o prima le righe.
- Se crei/incolli/rilasci qualcosa in un punto preciso (tasto destro → Nuova
  cartella, Incolla, drag da Nautilus), l'icona compare **lì**.
- **Disponi icone** riordina tutto una volta secondo il criterio scelto
  (nome, data, tipo, dimensione); poi puoi di nuovo spostarle a mano.
- **Mantieni ordinate** tiene le icone sempre ordinate: in questa modalità le
  icone non si possono spostare a mano (ma il drop su cartelle funziona).

### Lanciatori `.desktop`

Un file `.desktop` copiato sulla Scrivania non viene eseguito finché non è
**attendibile**. Puoi renderlo tale con tasto destro → **Consenti avvio**,
oppure al primo avvio confermando il dialogo. Questo imposta il permesso di
esecuzione e il metadato `metadata::trusted` (lo stesso usato da DING).
Nelle impostazioni puoi scegliere di avviarli sempre senza chiedere.

### Indicatore nel pannello

L'icona in alto a destra offre: **Mostra icone** (nasconde/mostra tutto),
**Mantieni ordinate**, **Disponi icone**, **Ordina per**, **Nuova cartella**,
**Apri Scrivania in File**, **Ricarica** (riavvia l'helper) e
**Impostazioni…**. Si può nascondere dalle impostazioni.

---

## Impostazioni

Apri l'app in uno di questi modi:
- menù applicazioni → **Icone Desktop**;
- indicatore nel pannello → **Impostazioni…**;
- tasto destro sul desktop → **Impostazioni icone…**;
- `gnome-extensions prefs deskicons@euschi.github.io`.

Ogni modifica si applica **subito**, senza riavvii.

| Pagina | Opzione | Default | Descrizione |
| --- | --- | --- | --- |
| Aspetto | Dimensione icone | 64 px | da 32 a 128 |
| | Spaziatura | 8 px | spazio tra una cella e l'altra |
| | Mostra anteprime | sì | miniature di immagini/video/documenti |
| | Righe massime | 2 | righe del nome sotto l'icona (1–4) |
| | Stile etichette | Ombra | Ombra, Sfondo scuro o Nessuno |
| Disposizione | Angolo di partenza | in alto a sinistra | dove compaiono le nuove icone |
| | Direzione di riempimento | colonne | prima in verticale o in orizzontale |
| | Monitor | tutti | tutti i monitor o solo il principale |
| | Allinea alla griglia | sì | se no, le icone restano esattamente dove le rilasci |
| | Mantieni ordinate | no | ordinamento automatico permanente |
| | Ordina per / inverso / cartelle prima | nome / no / sì | criterio per "Disponi" e "Mantieni ordinate" |
| | Margini | 12 px | spazio libero ai quattro bordi |
| Comportamento | Apri gli elementi con | doppio click | oppure click singolo |
| | Lanciatori non attendibili | chiedi conferma | oppure avvia sempre |
| | Terminale | automatico | comando personalizzato, es. `kitty` (la cartella è passata come directory di lavoro) |
| | Conferma prima del cestino | no | dialogo prima di cestinare |
| | Indicatore nel pannello | sì | mostra/nasconde l'icona nel pannello |
| | Mostra icone sul desktop | sì | come il toggle dell'indicatore |
| | Ripristina predefiniti | — | riporta tutto ai valori iniziali |
| Elementi | Home, Cestino, Unità montate, Unità di rete | no, sì, sì, no | elementi speciali |
| | Mostra file nascosti | no | file che iniziano con `.` e file di backup `~` |

Le impostazioni sono normali GSettings e si possono gestire anche da terminale:

```sh
SCHEMA=org.gnome.shell.extensions.deskicons
DIR=~/.local/share/gnome-shell/extensions/deskicons@euschi.github.io/schemas
gsettings --schemadir $DIR list-recursively $SCHEMA
gsettings --schemadir $DIR set $SCHEMA icon-size 80
```

Le posizioni delle icone sono salvate in
`~/.local/share/deskicons/positions.json` (cancellalo per ripartire da zero).

---

## Aggiornamento e disinstallazione

**Aggiornare** (installazione con `make install`):

```sh
cd ~/Documenti/my_code/estensione_desktop
git pull
make schemas
```

- Modifiche al solo helper (`extension/app/`): basta **Ricarica**
  dall'indicatore.
- Modifiche a `extension.js`, `lib/`, `prefs.js` o `metadata.json`: serve un
  logout/login.

**Disinstallare:**

```sh
make uninstall
rm -rf ~/.local/share/deskicons          # posizioni salvate (opzionale)
```

---

## Come funziona (architettura)

GNOME su Wayland non permette a un'app normale di disegnare "sotto" le
finestre, quindi il progetto è diviso in due processi (lo stesso approccio di
DING):

```
┌───────────────────────── GNOME Shell ─────────────────────────┐
│ extension.js                                                   │
│  ├─ DesktopManager (lib/desktopManager.js)                     │
│  │   • avvia l'helper con Meta.WaylandClient.new_subprocess    │
│  │   • riconosce le sue finestre (owns_window + titolo         │
│  │     "@deskicons:<monitor>") e le rende tipo DESKTOP:        │
│  │     sotto tutto, su tutti i workspace, fuori da Alt-Tab     │
│  │   • le posiziona sull'area di lavoro di ogni monitor        │
│  │   • riavvia l'helper se termina in modo anomalo             │
│  └─ Indicatore (lib/indicator.js) ──── D-Bus org.gtk.Actions ─┐│
└────────────────────────────────────────────────────────────────┘│
                                                                  ▼
┌──────────────── Helper GTK4 / libadwaita (gjs) ────────────────┐
│ app/main.js            Adw.Application "it.eugenio.DeskIcons"  │
│ app/desktopController  selezione, DnD, menù, azioni            │
│ app/desktopWindow      una finestra trasparente per monitor    │
│ app/desktopModel       file della Scrivania + Gio monitor      │
│ app/layout, positions  griglia, posizionamento, persistenza    │
│ app/fileOps            org.gnome.Nautilus.FileOperations2      │
└────────────────────────────────────────────────────────────────┘
```

- La configurazione è condivisa tramite **GSettings**
  (`org.gnome.shell.extensions.deskicons`); l'helper carica lo schema dalla
  cartella dell'estensione e reagisce ai cambiamenti in tempo reale.
- Il drag & drop usa il formato standard `text/uri-list`, quindi funziona con
  qualunque file manager o app che accetti file.
- Gli appunti usano `x-special/gnome-copied-files` (lo stesso di Nautilus) per
  distinguere copia e taglia.
- Disattivando l'estensione l'helper riceve SIGTERM e termina; non restano
  processi orfani.

---

## Struttura del progetto

```
estensione_desktop/
├── Makefile                   # schemas, install, uninstall, zip, debug
├── launcher/
│   └── deskicons-settings.desktop   # voce "Icone Desktop" nel menù app
└── extension/                 # = cartella installata dell'estensione
    ├── metadata.json
    ├── extension.js           # entry point nella Shell
    ├── prefs.js               # app impostazioni (libadwaita)
    ├── lib/
    │   ├── desktopManager.js  # gestione processo helper e finestre
    │   └── indicator.js       # indicatore nel pannello
    ├── schemas/
    │   └── org.gnome.shell.extensions.deskicons.gschema.xml
    └── app/                   # helper GTK4
        ├── main.js            # avvio, argomenti, GSettings
        ├── desktopController.js
        ├── desktopWindow.js
        ├── desktopModel.js
        ├── fileItem.js        # widget dell'icona
        ├── layout.js          # griglia e algoritmi di posizionamento
        ├── positions.js       # salvataggio posizioni
        ├── menus.js           # menù contestuali
        ├── fileOps.js         # operazioni file (Nautilus / Gio)
        ├── clipboard.js       # appunti compatibili Nautilus
        ├── thumbnails.js      # anteprime (GnomeDesktop)
        ├── utils.js
        └── style.css
```

---

## Sviluppo e debug

```sh
make debug
```
Avvia l'helper in una **finestra normale** (senza la Shell), utile per
lavorare su griglia, menù e interazioni senza fare logout.

**Lint** (configurazione in `eslint.config.mjs`, esclusa dallo zip):

```sh
npm i -g eslint @eslint/js      # una tantum
make lint
```

**Log:**

```sh
journalctl -f -o cat /usr/bin/gnome-shell     # Shell + helper (messaggi "DeskIcons")
```

**Ciclo di sviluppo:**
- codice dell'helper → *Ricarica* dall'indicatore (oppure
  `gnome-extensions disable … && gnome-extensions enable …`);
- codice della Shell → logout/login;
- schema GSettings modificato → `make schemas`.

**Test in una Shell isolata (senza logout):** si può avviare una Shell
headless in una sessione D-Bus privata, con configurazione e dati in una
cartella temporanea:

```sh
export GSETTINGS_BACKEND=keyfile XDG_CONFIG_HOME=/tmp/t/config XDG_DATA_HOME=/tmp/t/data
mkdir -p $XDG_DATA_HOME/gnome-shell/extensions
ln -s $PWD/extension $XDG_DATA_HOME/gnome-shell/extensions/deskicons@euschi.github.io
dbus-run-session -- sh -c '
  gsettings set org.gnome.shell enabled-extensions "[\"deskicons@euschi.github.io\"]"
  gnome-shell --headless --wayland --no-x11 --virtual-monitor 1600x900'
```

---

## Risoluzione dei problemi

**Non vedo nessuna icona**
- `gnome-extensions info deskicons@euschi.github.io`: se lo stato è `ERROR`,
  leggi il motivo con `journalctl -b -o cat /usr/bin/gnome-shell | grep -i deskicons`.
- Hai fatto logout/login dopo `make install`?
- Controlla di non avere *Mostra icone* disattivato (indicatore nel pannello).
- Verifica che un'altra estensione di icone desktop non sia attiva.

**"schema … non trovato"**
- Esegui `make schemas` (o `make install`) nella cartella del progetto.

**L'helper si chiude continuamente**
- Dopo 5 crash in un minuto non viene più riavviato. Avvialo a mano per
  vedere l'errore: `make debug`. Poi *Ricarica* dall'indicatore.

**Copia/sposta/cestino non mostrano avanzamento né annulla**
- Nautilus non è installato o non risponde su D-Bus: viene usato il ripiego
  interno (Gio). Installa `nautilus`.

**"Apri nel terminale" non fa nulla**
- Nessun terminale riconosciuto (ptyxis, kgx, gnome-terminal, kitty,
  alacritty, foot, konsole, xterm). Imposta il comando nelle impostazioni.

**Le icone sono finite in posizioni strane dopo aver cambiato monitor**
- Tasto destro → *Disponi icone*, oppure cancella
  `~/.local/share/deskicons/positions.json`.

---

## Pubblicazione su extensions.gnome.org

1. `make zip` → `dist/deskicons@euschi.github.io.shell-extension.zip`.
2. Controllo statico consigliato da EGO:
   ```sh
   python -m venv venv && . venv/bin/activate && pip install -U shexli
   shexli dist/deskicons@euschi.github.io.shell-extension.zip
   ```
   Due segnalazioni sono attese e non sono errori reali:
   - `EGO-P-007`: i file in `app/` non sono importati da `extension.js`
     perché sono l'helper avviato come processo separato;
   - `EGO-M-004` su `"51"`: le versioni di Shexli che non conoscono ancora
     GNOME 51 la considerano una versione futura.
3. Carica lo zip su <https://extensions.gnome.org/upload/>. Nelle note per il
   revisore conviene spiegare che `app/` è un helper GJS/GTK4 avviato con
   `Meta.WaylandClient` (stesso approccio di DING).

Lo schema GSettings viene distribuito solo come XML: la Shell lo compila
automaticamente quando installa l'estensione da extensions.gnome.org.

## Limitazioni note

- Solo **GNOME Shell 51** su Wayland (dichiarato in `metadata.json`); in
  sessioni X11 `Meta.WaylandClient` non è disponibile.
- Su Wayland l'installazione e gli aggiornamenti del codice della Shell
  richiedono logout/login.
- La rinomina usa un piccolo popover sotto l'icona (non la modifica
  direttamente nell'etichetta).
- Con *Mantieni ordinate* attivo le icone non si spostano a mano.
