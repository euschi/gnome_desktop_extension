UUID      := deskicons@euschi.github.io
DOMAIN    := deskicons
SRC       := $(CURDIR)/extension
EXT_DIR   := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
APPS_DIR  := $(HOME)/.local/share/applications
LAUNCHER  := deskicons-settings.desktop

PO_FILES  := $(wildcard po/*.po)
MO_FILES  := $(patsubst po/%.po,$(SRC)/locale/%/LC_MESSAGES/$(DOMAIN).mo,$(PO_FILES))
JS_FILES  := $(SRC)/extension.js $(SRC)/prefs.js $(wildcard $(SRC)/lib/*.js) $(wildcard $(SRC)/app/*.js)
SCHEMA    := $(SRC)/schemas/org.gnome.shell.extensions.deskicons.gschema.xml

.PHONY: all schemas locale pot install uninstall zip clean debug lint

all: schemas locale

schemas:
	glib-compile-schemas $(SRC)/schemas

# Traduzioni compilate in extension/locale/ (per l'installazione con symlink;
# lo zip le compila da sé con --podir)
locale: $(MO_FILES)

$(SRC)/locale/%/LC_MESSAGES/$(DOMAIN).mo: po/%.po
	mkdir -p $(dir $@)
	msgfmt --check -o $@ $<

# Rigenera il template e aggiorna i .po esistenti con le stringhe nuove
pot:
	xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --keyword=ngettext:1,2 \
		--add-comments=Translators --package-name=$(DOMAIN) --msgid-bugs-address=https://github.com/euschi/gnome_desktop_extension/issues \
		-o po/$(DOMAIN).pot $(patsubst $(CURDIR)/%,%,$(JS_FILES))
	xgettext --from-code=UTF-8 --join-existing -o po/$(DOMAIN).pot \
		$(patsubst $(CURDIR)/%,%,$(SCHEMA))
	for po in $(PO_FILES); do msgmerge --update --backup=none $$po po/$(DOMAIN).pot; done

# Installazione di sviluppo: symlink della cartella extension/
install: schemas locale
	mkdir -p $(dir $(EXT_DIR))
	ln -sfn $(SRC) $(EXT_DIR)
	install -Dm644 launcher/$(LAUNCHER) $(APPS_DIR)/$(LAUNCHER)
	@echo "Installata. Su Wayland: logout/login, poi: gnome-extensions enable $(UUID)"

uninstall:
	-gnome-extensions disable $(UUID)
	rm -f $(EXT_DIR)
	rm -f $(APPS_DIR)/$(LAUNCHER)

zip: schemas
	mkdir -p dist
	gnome-extensions pack $(SRC) --force --out-dir=dist \
		--extra-source=lib --extra-source=app --podir=../po

# Avvia l'helper in finestra normale (senza la Shell) per sviluppo
debug: schemas locale
	gjs -m $(SRC)/app/main.js --debug --extension-dir $(SRC)

lint:
	eslint extension

clean:
	rm -rf dist $(SRC)/schemas/gschemas.compiled $(SRC)/locale
