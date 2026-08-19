const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
        'Supabase env vars are missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).'
    );
}

const REST_BASE = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : '';

function buildUrl(table, params = {}) {
    const url = new URL(`${REST_BASE}/${table}`);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
        }
    }
    return url;
}

function buildFilterParams(filters = {}) {
    const params = {};
    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null) continue;
        params[key] = `eq.${value}`;
    }
    return params;
}

function headers(extra = {}) {
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...extra,
    };
}

async function supabaseRequest(table, options = {}) {
    const {
        method = 'GET',
        params = {},
        body,
        prefer,
        allowEmpty = false,
    } = options;

    if (!REST_BASE || !SUPABASE_KEY) {
        throw new Error('Supabase configuration is missing.');
    }

    const url = buildUrl(table, params);
    const res = await fetch(url, {
        method,
        headers: headers(prefer ? { Prefer: prefer } : {}),
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
        throw new Error(text || `Supabase request failed with ${res.status}`);
    }

    if (!text) return allowEmpty ? null : [];

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function selectRows(table, options = {}) {
    const {
        columns = '*',
        filters = {},
        order,
        limit,
    } = options;
    const params = {
        select: columns,
        ...buildFilterParams(filters),
    };
    if (order) params.order = order;
    if (limit) params.limit = String(limit);
    const rows = await supabaseRequest(table, { method: 'GET', params, allowEmpty: true });
    return Array.isArray(rows) ? rows : rows ? [rows] : [];
}

async function selectOneRow(table, options = {}) {
    const rows = await selectRows(table, { ...options, limit: 1 });
    return rows[0] || null;
}

async function insertRow(table, row, options = {}) {
    return supabaseRequest(table, {
        method: 'POST',
        params: options.onConflict ? { on_conflict: options.onConflict } : {},
        body: row,
    });
}

async function upsertRow(table, row, onConflict = 'id') {
    return supabaseRequest(table, {
        method: 'POST',
        params: { on_conflict: onConflict },
        prefer: 'resolution=merge-duplicates,return=representation',
        body: row,
    });
}

async function updateRows(table, filters, data) {
    return supabaseRequest(table, {
        method: 'PATCH',
        params: buildFilterParams(filters),
        body: data,
    });
}

async function deleteRows(table, filters) {
    return supabaseRequest(table, {
        method: 'DELETE',
        params: buildFilterParams(filters),
        allowEmpty: true,
    });
}

module.exports = {
    selectRows,
    selectOneRow,
    insertRow,
    upsertRow,
    updateRows,
    deleteRows,
};
