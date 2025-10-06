function levenshteinDistanceLimited_(a, b, maxDistance) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  const m = s.length;
  const n = t.length;
  if (!m) return n <= maxDistance ? n : maxDistance + 1;
  if (!n) return m <= maxDistance ? m : maxDistance + 1;
  if (Math.abs(m - n) > maxDistance) return maxDistance + 1;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const sChar = s.charAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const tChar = t.charAt(j - 1);
      const cost = sChar === tChar ? 0 : 1;
      const insertion = curr[j - 1] + 1;
      const deletion = prev[j] + 1;
      const substitution = prev[j - 1] + cost;
      const val = Math.min(insertion, deletion, substitution);
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n];
}

function describeNumericDifference_(id, query, distance) {
  if (!(distance > 0)) return '';
  const lenDiff = id.length - query.length;
  if (distance === 1) {
    if (lenDiff === 0) return 'مطابقة ذكية: يختلف برقم واحد.';
    if (lenDiff > 0) return 'مطابقة ذكية: يحتوي على رقم زائد واحد.';
    return 'مطابقة ذكية: ينقصه رقم واحد.';
  }
  if (distance === 2) {
    if (lenDiff === 0) return 'مطابقة ذكية: يختلف برقمين.';
    if (lenDiff > 0) return 'مطابقة ذكية: يحتوي على رقمين زائدين.';
    return 'مطابقة ذكية: ينقصه رقمين.';
  }
  return 'مطابقة ذكية.';
}

function aiSuggestIds(query, limit) {
  try {
    const rawQuery = String(query || '').trim();
    const limitNum = Math.max(1, Math.min(30, Number(limit) || 12));
    if (!rawQuery) {
      return { ok: true, items: [], meta: { total: 0 } };
    }

    const cfg = getConfig_();
    const sectionKey = getEffectiveSectionKey_(cfg) || 'default';
    const cache = CacheService.getScriptCache();

    const agentIndex = cacheGetChunked_(qualifySectionCacheKey_(KEY_AGENT_INDEX, sectionKey), cache) || {};
    const adminIdSet = cacheGetChunked_(qualifySectionCacheKey_(KEY_ADMIN_IDSET, sectionKey), cache) || {};
    const coloredAgent = cacheGetChunked_(qualifySectionCacheKey_(KEY_COLORED_AGENT, sectionKey), cache) || {};
    const coloredAdmin = cacheGetChunked_(qualifySectionCacheKey_(KEY_COLORED_ADMIN, sectionKey), cache) || {};
    const infoGroups = cacheGetChunked_(qualifySectionCacheKey_(KEY_INFO_GROUPS, sectionKey), cache) || {};
    const infoId2Group = cacheGetChunked_(qualifySectionCacheKey_(KEY_INFO_ID2GROUP, sectionKey), cache) || {};

    const agentKeys = Object.keys(agentIndex);
    const adminKeys = Object.keys(adminIdSet);
    if (!agentKeys.length && !adminKeys.length) {
      return { ok: false, message: 'البيانات غير محمّلة. اضغط «تحميل البيانات» ثم أعد المحاولة.' };
    }

    const numericQuery = /^\d+$/.test(rawQuery);
    const loweredQuery = rawQuery.toLowerCase();
    const suggestions = new Map();

    function addCandidate(id, node, meta) {
      const key = String(id || '').trim();
      if (!key) return;
      const matchKind = meta && meta.matchKind ? meta.matchKind : (numericQuery ? 'id' : 'name');
      const score = Number(meta && meta.score);
      const matchValue = String(meta && meta.matchValue ? meta.matchValue : '');
      const matchNote = String(meta && meta.matchNote ? meta.matchNote : '');
      const existing = suggestions.get(key);
      if (existing) {
        if (isFinite(score) && score < existing.score) {
          existing.score = score;
          existing.matchKind = matchKind;
          existing.matchValue = matchValue;
          existing.matchNote = matchNote;
        }
        if (!existing.node && node) existing.node = node;
        return;
      }
      suggestions.set(key, {
        id: key,
        node: node || null,
        score: isFinite(score) ? score : 9999,
        matchKind: matchKind,
        matchValue: matchValue,
        matchNote: matchNote,
        adminOnly: !!(meta && meta.adminOnly)
      });
    }

    // ابحث داخل فهرس الوكيل (حسب الـID أو الاسم)
    for (let i = 0; i < agentKeys.length; i++) {
      const id = agentKeys[i];
      const node = agentIndex[id] || {};
      if (numericQuery) {
        const idx = id.indexOf(rawQuery);
        if (idx === -1) continue;
        const score = (idx === 0 ? 0 : 2) + Math.abs(id.length - rawQuery.length) * 0.01 + i * 0.0001;
        addCandidate(id, node, { score, matchKind: 'id', matchValue: id });
        continue;
      }

      const names = Array.isArray(node.names) ? node.names : [];
      let bestScore = Infinity;
      let bestName = '';
      for (let j = 0; j < names.length; j++) {
        const name = String(names[j] || '');
        if (!name) continue;
        const lower = name.toLowerCase();
        const idx = lower.indexOf(loweredQuery);
        if (idx === -1) continue;
        const candidateScore = (idx === 0 ? 0 : 1.5) + lower.length * 0.002 + j * 0.05 + i * 0.0001;
        if (candidateScore < bestScore) {
          bestScore = candidateScore;
          bestName = name;
        }
      }
      if (bestName) {
        addCandidate(id, node, { score: bestScore, matchKind: 'name', matchValue: bestName });
      }
    }

    if (numericQuery) {
      for (let i = 0; i < adminKeys.length; i++) {
        const id = adminKeys[i];
        const idx = id.indexOf(rawQuery);
        if (idx === -1) continue;
        const score = (idx === 0 ? 1 : 3) + Math.abs(id.length - rawQuery.length) * 0.02 + i * 0.0001;
        addCandidate(id, agentIndex[id] || null, { score, matchKind: 'id', matchValue: id, adminOnly: !agentIndex[id] });
      }
      const fuzzyIds = new Set(agentKeys.concat(adminKeys));
      let fuzzyIndex = 0;
      fuzzyIds.forEach(id => {
        if (!id || suggestions.has(id)) {
          fuzzyIndex++;
          return;
        }
        const distance = levenshteinDistanceLimited_(id, rawQuery, 2);
        if (distance > 2) {
          fuzzyIndex++;
          return;
        }
        const lenDiff = Math.abs(id.length - rawQuery.length);
        const score = 6 + distance * 1.5 + lenDiff * 0.4 + fuzzyIndex * 0.0002;
        const note = describeNumericDifference_(id, rawQuery, distance);
        addCandidate(id, agentIndex[id] || null, {
          score: score,
          matchKind: 'id-fuzzy',
          matchValue: rawQuery,
          matchNote: note,
          adminOnly: !agentIndex[id] && !!adminIdSet[id]
        });
        fuzzyIndex++;
      });
    } else {
      const groupKeys = Object.keys(infoGroups || {});
      for (let i = 0; i < groupKeys.length; i++) {
        const group = infoGroups[groupKeys[i]];
        if (!group) continue;
        const name = String(group.name || '').trim();
        if (!name) continue;
        const lower = name.toLowerCase();
        const idx = lower.indexOf(loweredQuery);
        if (idx === -1) continue;
        const baseScore = (idx === 0 ? 0.6 : 1.8) + lower.length * 0.001 + i * 0.0001;
        const ids = Array.isArray(group.ids) ? group.ids : [];
        for (let j = 0; j < ids.length; j++) {
          const id = String((ids[j] && ids[j].id) || '').trim();
          if (!id) continue;
          addCandidate(id, agentIndex[id] || null, { score: baseScore + j * 0.05, matchKind: 'name', matchValue: name });
        }
      }
    }

    if (!suggestions.size) {
      return { ok: true, items: [], meta: { total: 0 } };
    }

    const items = [];
    suggestions.forEach((entry, id) => {
      const node = entry.node || agentIndex[id] || null;
      const inAgent = !!node;
      const inAdmin = !!adminIdSet[id];

      let status = 'غير موجود';
      let total = 0;
      let rowsCount = 0;
      let primaryName = '';

      if (inAgent) {
        const rows = Array.isArray(node.rows) ? node.rows : [];
        rowsCount = rows.length;
        total = Number(node.sum || 0);
        const names = Array.isArray(node.names) ? node.names : [];
        if (names.length) {
          primaryName = String(names[0] || '').trim();
        }
        if (rowsCount > 0) {
          status = inAdmin
            ? (rowsCount > 1 ? 'سحب وكالة - راتبين' : 'سحب وكالة')
            : (rowsCount > 1 ? 'راتبين' : 'وكالة');
        } else if (inAdmin) {
          status = 'ادارة';
        }
      } else if (inAdmin) {
        status = 'ادارة';
      }

      if (!primaryName && entry.matchKind === 'name' && entry.matchValue) {
        primaryName = String(entry.matchValue).trim();
      }
      if (!primaryName && infoId2Group && infoId2Group[id]) {
        const gk = infoId2Group[id];
        if (gk && infoGroups && infoGroups[gk] && infoGroups[gk].name) {
          primaryName = String(infoGroups[gk].name || '').trim();
        }
      }

      const isColoredAgent = !!coloredAgent[id];
      const isColoredAdmin = !!coloredAdmin[id];
      const colored = isColoredAgent || isColoredAdmin;

      let duplicateLabel = '';
      if (isColoredAgent && isColoredAdmin) duplicateLabel = 'مكرر';
      else if (isColoredAgent) duplicateLabel = 'مكرر وكالة فقط';
      else if (isColoredAdmin) duplicateLabel = 'مكرر ادارة فقط';

      const totalFixed = Number.isFinite(total) ? Number(total.toFixed(2)) : 0;

      items.push({
        id: id,
        status: status,
        totalSalary: totalFixed,
        colored: colored,
        duplicateLabel: duplicateLabel,
        rowsCount: rowsCount,
        matchKind: entry.matchKind,
        matchValue: entry.matchValue || '',
        matchNote: entry.matchNote || '',
        primaryName: primaryName,
        inAgent: inAgent,
        inAdmin: inAdmin,
        score: entry.score
      });
    });

    const matchOrder = { 'id': 0, 'id-fuzzy': 1, 'name': 2 };
    items.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const aOrder = matchOrder.hasOwnProperty(a.matchKind) ? matchOrder[a.matchKind] : 3;
      const bOrder = matchOrder.hasOwnProperty(b.matchKind) ? matchOrder[b.matchKind] : 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.rowsCount !== b.rowsCount) return b.rowsCount - a.rowsCount;
      return a.id.localeCompare(b.id, 'ar');
    });

    const limited = items.slice(0, limitNum);
    return { ok: true, items: limited, meta: { total: items.length } };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err || '') };
  }
}
