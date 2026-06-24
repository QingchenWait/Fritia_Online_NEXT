const STORAGE_KEY = 'fritia_side_scroller_card_archive';
const MAX_EQUIPPED = 4;
const MAX_NAME_LENGTH = 16;
const MAX_DESCRIPTION_LENGTH = 60;
const ALLOWED_CATEGORIES = new Set(['attack', 'heal', 'control', 'summon', 'buff']);
const ALLOWED_RARITIES = new Set(['blue', 'purple', 'gold']);
const ALLOWED_TARGETS = new Set(['enemy', 'self']);

function createEmptyArchive() {
    return {
        version: 1,
        cards: [],
        equippedIds: [],
        updatedAt: Date.now()
    };
}

export function loadSideScrollerArchive() {
    try {
        return normalizeArchive(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (err) {
        console.warn('[SideScrollerArchive] Failed to load archive:', err);
        return createEmptyArchive();
    }
}

export function saveSideScrollerArchive(archive) {
    const normalized = normalizeArchive(archive);
    normalized.updatedAt = Date.now();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (err) {
        console.error('[SideScrollerArchive] Failed to save archive:', err);
    }
    return normalized;
}

export function addCardToSideScrollerArchive(card) {
    const archive = loadSideScrollerArchive();
    const archivedCard = normalizeArchivedCard(card);
    if (!archivedCard) return { ok: false, archive, reason: 'invalid-card' };
    archive.cards = archive.cards.filter(item => !isSameCardSignature(item, archivedCard));
    archive.cards.unshift(archivedCard);
    return { ok: true, archive: saveSideScrollerArchive(archive), card: archivedCard };
}

export function setSideScrollerArchiveEquipped(ids) {
    const archive = loadSideScrollerArchive();
    const available = new Set(archive.cards.map(card => card.archiveId));
    archive.equippedIds = [...new Set((ids || []).map(String).filter(id => available.has(id)))].slice(0, MAX_EQUIPPED);
    return saveSideScrollerArchive(archive);
}

export function deleteSideScrollerArchiveCard(archiveId) {
    const targetId = String(archiveId || '');
    const archive = loadSideScrollerArchive();
    const nextCards = archive.cards.filter(card => card.archiveId !== targetId);
    if (nextCards.length === archive.cards.length) {
        return { ok: false, archive };
    }
    archive.cards = nextCards;
    archive.equippedIds = archive.equippedIds.filter(id => id !== targetId);
    return { ok: true, archive: saveSideScrollerArchive(archive) };
}

export function exportSideScrollerArchive() {
    return loadSideScrollerArchive();
}

export function importSideScrollerArchive(data) {
    const current = loadSideScrollerArchive();
    const incoming = normalizeArchive(data);
    const byId = new Map(current.cards.map(card => [card.archiveId, card]));
    let imported = 0;
    incoming.cards.forEach(card => {
        if (!byId.has(card.archiveId)) imported += 1;
        byId.set(card.archiveId, card);
    });
    const cards = [...byId.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const validIds = new Set(cards.map(card => card.archiveId));
    const equippedIds = [
        ...incoming.equippedIds.filter(id => validIds.has(id)),
        ...current.equippedIds.filter(id => validIds.has(id))
    ];
    const merged = saveSideScrollerArchive({
        version: 1,
        cards,
        equippedIds: [...new Set(equippedIds)].slice(0, MAX_EQUIPPED)
    });
    return { imported, total: merged.cards.length };
}

export function cloneArchivedCardForCombat(card, sourceSlot = 0) {
    const normalized = normalizeArchivedCard(card);
    if (!normalized) return null;
    return {
        ...normalized,
        id: `archive-play-${normalized.archiveId}-${Date.now().toString(36)}-${sourceSlot}`,
        slotId: `archive-${normalized.archiveId}`,
        archiveId: normalized.archiveId,
        source: 'archive',
        categoryLabel: normalized.categoryLabel,
        rarityLabel: normalized.rarityLabel,
        tags: [...(normalized.tags || [])]
    };
}

function normalizeArchive(data) {
    const source = data && typeof data === 'object' ? data : {};
    const cards = [];
    const seen = new Set();
    (Array.isArray(source.cards) ? source.cards : []).forEach(item => {
        const card = normalizeArchivedCard(item);
        if (!card || seen.has(card.archiveId)) return;
        seen.add(card.archiveId);
        cards.push(card);
    });
    const available = new Set(cards.map(card => card.archiveId));
    const equippedIds = [...new Set((Array.isArray(source.equippedIds) ? source.equippedIds : [])
        .map(String)
        .filter(id => available.has(id)))].slice(0, MAX_EQUIPPED);
    return {
        version: 1,
        cards: cards.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)),
        equippedIds,
        updatedAt: Number(source.updatedAt) || Date.now()
    };
}

function normalizeArchivedCard(card) {
    if (!card || typeof card !== 'object') return null;
    const category = ALLOWED_CATEGORIES.has(card.category) ? card.category : '';
    const rarity = ALLOWED_RARITIES.has(card.rarity) ? card.rarity : 'blue';
    const targetMode = ALLOWED_TARGETS.has(card.targetMode) ? card.targetMode : category === 'heal' ? 'self' : 'enemy';
    if (!category) return null;
    const name = cleanText(card.name, MAX_NAME_LENGTH) || '典藏战术';
    const description = cleanText(card.description, MAX_DESCRIPTION_LENGTH);
    const effectKind = cleanText(card.effectKind, 32) || category;
    const value = clampNumber(card.value, 0, 9999);
    const duration = Math.max(0, Math.min(99, Math.round(Number(card.duration) || 0)));
    const tags = Array.isArray(card.tags)
        ? [...new Set(card.tags.map(tag => cleanText(tag, 32)).filter(Boolean))].slice(0, 8)
        : [];
    const archiveId = cleanText(card.archiveId, 80) || createArchiveId({ category, rarity, name, effectKind, value, duration, tags });
    return {
        archiveId,
        name,
        description,
        rarity,
        category,
        categoryLabel: cleanText(card.categoryLabel, 12) || category,
        rarityLabel: cleanText(card.rarityLabel, 12) || rarity,
        targetMode,
        effectKind,
        value,
        duration,
        instant: false,
        tags,
        savedAt: Number(card.savedAt) || Date.now()
    };
}

function createArchiveId(card) {
    const signature = [
        card.category,
        card.rarity,
        card.name,
        card.effectKind,
        card.value,
        card.duration,
        (card.tags || []).join(',')
    ].join('|');
    let hash = 0;
    for (let i = 0; i < signature.length; i += 1) {
        hash = ((hash << 5) - hash + signature.charCodeAt(i)) | 0;
    }
    return `sc-card-${Math.abs(hash).toString(36)}-${Date.now().toString(36)}`;
}

function isSameCardSignature(a, b) {
    return a.name === b.name
        && a.category === b.category
        && a.rarity === b.rarity
        && a.effectKind === b.effectKind
        && Number(a.value) === Number(b.value)
        && Number(a.duration) === Number(b.duration)
        && (a.tags || []).join(',') === (b.tags || []).join(',');
}

function cleanText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}
