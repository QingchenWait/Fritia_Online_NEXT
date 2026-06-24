const STORAGE_KEY = 'fritia_side_scroller_scores';
const MAX_RECORDS = 10;

function createEmptyScores() {
    return {
        version: 1,
        records: [],
        updatedAt: Date.now()
    };
}

export function loadSideScrollerScores() {
    try {
        return normalizeScores(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (err) {
        console.warn('[SideScrollerScores] Failed to load scores:', err);
        return createEmptyScores();
    }
}

export function saveSideScrollerScores(scores) {
    const normalized = normalizeScores(scores);
    normalized.updatedAt = Date.now();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (err) {
        console.error('[SideScrollerScores] Failed to save scores:', err);
    }
    return normalized;
}

export function addSideScrollerScoreRecord(record) {
    const current = loadSideScrollerScores();
    const normalized = normalizeScoreRecord(record);
    if (!normalized) return { ok: false, scores: current, record: null, isNewRecord: false, rank: -1 };
    const previousBest = current.records[0]?.score || 0;
    const records = [normalized, ...current.records]
        .sort((a, b) => b.score - a.score || b.completedAt - a.completedAt)
        .slice(0, MAX_RECORDS);
    const saved = saveSideScrollerScores({ version: 1, records });
    const rank = saved.records.findIndex(item => item.id === normalized.id);
    return {
        ok: true,
        scores: saved,
        record: normalized,
        isNewRecord: normalized.score > previousBest,
        rank
    };
}

export function exportSideScrollerScores() {
    return loadSideScrollerScores();
}

export function importSideScrollerScores(data) {
    const current = loadSideScrollerScores();
    const incoming = normalizeScores(data);
    const byId = new Map(current.records.map(record => [record.id, record]));
    let imported = 0;
    incoming.records.forEach(record => {
        if (!byId.has(record.id)) imported += 1;
        byId.set(record.id, record);
    });
    const records = [...byId.values()]
        .sort((a, b) => b.score - a.score || b.completedAt - a.completedAt)
        .slice(0, MAX_RECORDS);
    const saved = saveSideScrollerScores({ version: 1, records });
    return { imported, total: saved.records.length };
}

function normalizeScores(data) {
    const source = data && typeof data === 'object' ? data : {};
    const seen = new Set();
    const records = [];
    (Array.isArray(source.records) ? source.records : []).forEach(item => {
        const record = normalizeScoreRecord(item);
        if (!record || seen.has(record.id)) return;
        seen.add(record.id);
        records.push(record);
    });
    return {
        version: 1,
        records: records
            .sort((a, b) => b.score - a.score || b.completedAt - a.completedAt)
            .slice(0, MAX_RECORDS),
        updatedAt: Number(source.updatedAt) || Date.now()
    };
}

function normalizeScoreRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const score = Math.max(0, Math.round(Number(record.score) || 0));
    if (score <= 0) return null;
    const completedAt = Math.max(0, Math.round(Number(record.completedAt) || Date.now()));
    const difficulty = cleanText(record.difficulty, 16) || 'standard';
    const difficultyLabel = cleanText(record.difficultyLabel, 12) || difficulty;
    const eventsCleared = Math.max(0, Math.round(Number(record.eventsCleared) || 0));
    const kills = Math.max(0, Math.round(Number(record.kills) || 0));
    const turns = Math.max(0, Math.round(Number(record.turns) || 0));
    const id = cleanText(record.id, 80) || createScoreId({ score, completedAt, difficulty, kills });
    return { id, score, difficulty, difficultyLabel, eventsCleared, kills, turns, completedAt };
}

function createScoreId(record) {
    return `sc-score-${record.completedAt.toString(36)}-${record.score}-${record.kills}-${record.difficulty}`;
}

function cleanText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
