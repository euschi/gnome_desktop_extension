// Geometria della griglia di un monitor e algoritmo di posizionamento delle
// icone (posizioni salvate, nuove icone, "mantieni ordinate").

import Gio from 'gi://Gio';

const LINE_HEIGHT = 18;

export function itemSize(settings) {
    const icon = settings.get_int('icon-size');
    const lines = settings.get_int('label-lines');
    const width = Math.max(icon + 28, Math.round(icon * 1.4), 84);
    const height = icon + 12 + lines * LINE_HEIGHT + 10;
    return {width, height, icon, lines};
}

export class GridGeometry {
    constructor(width, height, settings) {
        const size = itemSize(settings);
        const spacing = settings.get_int('item-spacing');
        this.itemWidth = size.width;
        this.itemHeight = size.height;
        this.cellWidth = size.width + spacing;
        this.cellHeight = size.height + spacing;
        this.width = width;
        this.height = height;

        const mt = settings.get_int('margin-top');
        const mb = settings.get_int('margin-bottom');
        const ml = settings.get_int('margin-left');
        const mr = settings.get_int('margin-right');
        const availW = Math.max(0, width - ml - mr);
        const availH = Math.max(0, height - mt - mb);
        this.cols = Math.max(1, Math.floor(availW / this.cellWidth));
        this.rows = Math.max(1, Math.floor(availH / this.cellHeight));

        // Lo spazio avanzato va dal lato opposto all'angolo di partenza
        const corner = settings.get_string('start-corner');
        const extraW = Math.max(0, availW - this.cols * this.cellWidth);
        const extraH = Math.max(0, availH - this.rows * this.cellHeight);
        this.originX = ml + (corner.endsWith('right') ? extraW : 0) + spacing / 2;
        this.originY = mt + (corner.startsWith('bottom') ? extraH : 0) + spacing / 2;
        this.corner = corner;
        this.byColumns = settings.get_string('fill-direction') === 'columns';
    }

    cellToPixel(c, r) {
        return [
            Math.round(this.originX + c * this.cellWidth),
            Math.round(this.originY + r * this.cellHeight),
        ];
    }

    pixelToCell(x, y) {
        return [(x - this.originX) / this.cellWidth, (y - this.originY) / this.cellHeight];
    }

    clamp(c, r) {
        const maxC = Math.max(0, (this.width - this.originX - this.itemWidth) / this.cellWidth);
        const maxR = Math.max(0, (this.height - this.originY - this.itemHeight) / this.cellHeight);
        return [Math.min(Math.max(0, c), maxC), Math.min(Math.max(0, r), maxR)];
    }

    // Celle nell'ordine di riempimento definito dalle impostazioni
    *orderedCells() {
        const rightToLeft = this.corner.endsWith('right');
        const bottomToTop = this.corner.startsWith('bottom');
        const col = i => rightToLeft ? this.cols - 1 - i : i;
        const row = i => bottomToTop ? this.rows - 1 - i : i;
        if (this.byColumns) {
            for (let i = 0; i < this.cols; i++) {
                for (let j = 0; j < this.rows; j++)
                    yield [col(i), row(j)];
            }
        } else {
            for (let j = 0; j < this.rows; j++) {
                for (let i = 0; i < this.cols; i++)
                    yield [col(i), row(j)];
            }
        }
    }
}

const SPECIAL_ORDER = {home: 0, trash: 1, mount: 2};

export function sortItems(items, settings) {
    const by = settings.get_string('sort-by');
    const reverse = settings.get_boolean('sort-reverse');
    const foldersFirst = settings.get_boolean('folders-first');
    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

    const cmp = (a, b) => {
        switch (by) {
        case 'modified':
            return Number(b.mtime) - Number(a.mtime);
        case 'size':
            return Number(b.size) - Number(a.size);
        case 'type': {
            const ta = Gio.content_type_get_description(a.contentType);
            const tb = Gio.content_type_get_description(b.contentType);
            return collator.compare(ta, tb);
        }
        default:
            return 0;
        }
    };

    return [...items].sort((a, b) => {
        // Gli elementi speciali restano sempre in testa
        if (a.isSpecial || b.isSpecial) {
            if (a.isSpecial && b.isSpecial)
                return SPECIAL_ORDER[a.kind] - SPECIAL_ORDER[b.kind];
            return a.isSpecial ? -1 : 1;
        }
        if (foldersFirst && a.isDir !== b.isDir)
            return a.isDir ? -1 : 1;
        let res = cmp(a, b) || collator.compare(a.displayName, b.displayName);
        return reverse ? -res : res;
    });
}

// Calcola la posizione di ogni elemento.
//  grids: [{monitor, geometry}] nell'ordine di preferenza (primario per primo)
//  items: DesktopItem[] (ordine di arrivo)
//  store: PositionStore
//  hints: Map id -> {m, c, r} posizioni richieste per nuovi elementi
// Restituisce Map id -> {m, c, r, x, y}
export function computeLayout(grids, items, store, settings, hints) {
    const result = new Map();
    if (!grids.length)
        return result;

    const snap = settings.get_boolean('snap-to-grid');
    const arranged = settings.get_boolean('keep-arranged');
    const occupied = new Map(grids.map(g => [g.monitor, new Set()]));
    const gridOf = m => grids.find(g => g.monitor === m);
    const key = (c, r) => `${Math.round(c)},${Math.round(r)}`;

    const place = (item, m, c, r, save) => {
        const g = gridOf(m);
        [c, r] = g.geometry.clamp(c, r);
        if (snap || arranged) {
            c = Math.round(c);
            r = Math.round(r);
        }
        occupied.get(m).add(key(c, r));
        const [x, y] = g.geometry.cellToPixel(c, r);
        result.set(item.id, {m, c, r, x, y});
        if (save)
            store.set(item.id, {m, c, r});
    };

    const firstFree = () => {
        for (const g of grids) {
            const occ = occupied.get(g.monitor);
            for (const [c, r] of g.geometry.orderedCells()) {
                if (!occ.has(key(c, r)))
                    return [g.monitor, c, r];
            }
        }
        // Desktop pieno: sovrapponi sull'ultima cella del primario
        const g = grids[0];
        const cells = [...g.geometry.orderedCells()];
        const [c, r] = cells[cells.length - 1];
        return [g.monitor, c, r];
    };

    if (arranged)
        return arrangedLayout(grids, items, settings);

    const pending = [];
    // 1) suggerimenti espliciti (drop, nuova cartella nel punto cliccato):
    //    hanno la precedenza sulle celle occupate
    // 2) posizioni salvate
    const ordered = [
        ...items.filter(i => hints.has(i.id)),
        ...items.filter(i => !hints.has(i.id)),
    ];
    for (const item of ordered) {
        const hint = hints.get(item.id);
        const pos = hint ?? store.get(item.id);
        if (!pos || !gridOf(pos.m)) {
            pending.push(item);
            continue;
        }
        const [c, r] = gridOf(pos.m).geometry.clamp(pos.c, pos.r);
        if (snap && occupied.get(pos.m).has(key(c, r))) {
            pending.push(item);
            continue;
        }
        place(item, pos.m, pos.c, pos.r, !!hint);
        if (hint)
            hints.delete(item.id);
    }

    // 3) nuovi elementi nella prima cella libera; le posizioni salvate
    //    riferite a monitor assenti non vengono sovrascritte
    for (const item of pending) {
        const [m, c, r] = nearestFree(hints.get(item.id) ?? store.get(item.id));
        hints.delete(item.id);
        place(item, m, c, r, !store.get(item.id) || gridOf(store.get(item.id).m) !== undefined);
    }
    return result;

    function nearestFree(hint) {
        if (!hint || !gridOf(hint.m))
            return firstFree();
        const g = gridOf(hint.m);
        const occ = occupied.get(hint.m);
        let best = null;
        for (const [c, r] of g.geometry.orderedCells()) {
            if (occ.has(key(c, r)))
                continue;
            const d = (c - hint.c) ** 2 + (r - hint.r) ** 2;
            if (!best || d < best[0])
                best = [d, c, r];
        }
        return best ? [hint.m, best[1], best[2]] : firstFree();
    }
}

// Disposizione ordinata: celle consecutive secondo l'ordinamento scelto,
// partendo dal monitor primario
export function arrangedLayout(grids, items, settings) {
    const result = new Map();
    const cells = [];
    for (const g of grids) {
        for (const [c, r] of g.geometry.orderedCells())
            cells.push([g, c, r]);
    }
    if (!cells.length)
        return result;
    sortItems(items, settings).forEach((item, i) => {
        const [g, c, r] = cells[Math.min(i, cells.length - 1)];
        const [x, y] = g.geometry.cellToPixel(c, r);
        result.set(item.id, {m: g.monitor, c, r, x, y});
    });
    return result;
}
