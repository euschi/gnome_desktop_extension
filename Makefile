UUID      := deskicons@euschi.github.io
SRC       := $(CURDIR)/extension
EXT_DIR   := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
APPS_DIR  := $(HOME)/.local/share/applications
LAUNCHER  := deskicons-settings.desktop

.PHONY: all schemas install uninstall zip clean debug lint

all: schemas

schemas:
	glib-compile-schemas $(SRC)/schemas

# Installazione di sviluppo: symlink della cartella extension/
install: schemas
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
		--extra-source=lib --extra-source=app

# Avvia l'helper in finestra normale (senza la Shell) per sviluppo
debug: schemas
	gjs -m $(SRC)/app/main.js --debug --extension-dir $(SRC)

lint:
	eslint extension

clean:
	rm -rf dist $(SRC)/schemas/gschemas.compiled
