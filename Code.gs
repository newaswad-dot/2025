/*****************************
 * إعدادات عامة + قراءة Settings
 *****************************/
const PROP_ACTIVE_SECTION = 'activeSectionRow_v1';
const PROP_CACHE_SECTION  = 'cacheSectionRow_v1';

function readSettingsSections_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Settings');
  if (!sh) {
    throw new Error('❌ لم يتم العثور على ورقة Settings. أنشئ ورقة باسم Settings وضع القيم في الصفوف المناسبة.');
  }

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { sections: [], map: {} };
  }

  const rangeWidth = Math.min(lastCol, 20);
  const rowsCount = lastRow - 1;
  const values = rowsCount > 0 ? sh.getRange(2, 1, rowsCount, rangeWidth).getValues() : [];
  const hasLabelColumn = lastCol >= 11;
  const labelDisplayValues = (rowsCount > 0 && hasLabelColumn)
    ? sh.getRange(2, 11, rowsCount, 1).getDisplayValues().map(r => (r && r.length ? r[0] : ''))
    : [];

  const sections = [];
  const map = Object.create(null);
  const rowMap = Object.create(null);
  const tz = (function(){ try { return Session.getScriptTimeZone() || 'UTC'; } catch (_) { return 'UTC'; } })();

  for (let i = 0; i < values.length; i++) {
    const row = values[i] || [];
    const rowIndex = i + 2;
    const agentSheetId = String((row[0] || '')).trim();
    const adminSheetId = String((row[2] || '')).trim();
    const hasData = agentSheetId || adminSheetId || String((row[1] || '')).trim() || String((row[3] || '')).trim();
    if (!hasData) {
      // تجاهل الصفوف الفارغة بالكامل
      continue;
    }

    const cfg = {
      AGENT_SHEET_ID:   agentSheetId,
      AGENT_SHEET_NAME: String((row[1] || '')).trim() || 'SHEET',
      ADMIN_SHEET_ID:   adminSheetId,
      ADMIN_SHEET_NAME: String((row[3] || '')).trim() || 'Sheet1',
      DATA1_ID:         String((row[4] || '')).trim(),
      DATA1_NAME:       String((row[5] || '')).trim() || 'معلومات السلطان',
      DATA2_ID:         String((row[6] || '')).trim(),
      DATA2_NAME:       String((row[7] || '')).trim() || 'معلومات الفرعيين',
      EXTERNAL_ADMIN_URL: '',
      EXTERNAL_ADMIN_SHEET: '',
      EXTERNAL_AGENT_URL: '',
      EXTERNAL_AGENT_SHEET: ''
    };

    const missing = [];
    if (!cfg.AGENT_SHEET_ID)   missing.push('AGENT_SHEET_ID');
    if (!cfg.AGENT_SHEET_NAME) missing.push('AGENT_SHEET_NAME');
    if (!cfg.ADMIN_SHEET_ID)   missing.push('ADMIN_SHEET_ID');
    if (!cfg.ADMIN_SHEET_NAME) missing.push('ADMIN_SHEET_NAME');
    if (missing.length) {
      throw new Error('⚠️ إعدادات ناقصة في Settings (الصف ' + rowIndex + '): ' + missing.join(', '));
    }

    // روابط الملفات الخارجية (الإدارة والوكيل)
    const adminUrl = normalizeSheetLink_(row[8]);
    if (adminUrl) {
      cfg.EXTERNAL_ADMIN_URL = adminUrl;
      cfg.EXTERNAL_ADMIN_SHEET = String((row[9] || '')).trim();
    }

    let agentUrlSlot = null;
    for (let c = 10; c < row.length; c++) {
      const norm = normalizeSheetLink_(row[c]);
      if (norm) {
        agentUrlSlot = { index: c, url: norm };
        break;
      }
    }
    if (agentUrlSlot) {
      cfg.EXTERNAL_AGENT_URL = agentUrlSlot.url;
      const sheetIdx = agentUrlSlot.index + 1;
      if (sheetIdx < row.length) {
        cfg.EXTERNAL_AGENT_SHEET = String((row[sheetIdx] || '')).trim();
      }
    }

    let label = '';
    const displayLabel = labelDisplayValues.length > i ? String(labelDisplayValues[i] || '').trim() : '';
    const labelCell = row[10];
    if (displayLabel) {
      label = displayLabel;
    } else if (labelCell instanceof Date) {
      try {
        label = Utilities.formatDate(labelCell, tz, 'dd/MM/yyyy');
      } catch (_) {
        label = String(labelCell);
      }
    } else {
      label = String(labelCell || '').trim();
    }
    if (!label) {
      for (let c = 10; c < row.length; c++) {
        if (agentUrlSlot && (c === agentUrlSlot.index || c === agentUrlSlot.index + 1)) {
          continue;
        }
        const raw = String((row[c] || '')).trim();
        if (!raw) continue;
        if (normalizeSheetLink_(raw)) continue;
        label = raw;
        break;
      }
    }
    if (!label) {
      label = 'قسم ' + (sections.length + 1);
    }

    const rowKey = String(rowIndex);
    let key = label ? String(label) : rowKey;
    if (!key) key = rowKey;
    if (map[key]) key = rowKey;

    const entry = {
      key: key,
      label: label,
      rowIndex: rowIndex,
      rowKey: rowKey,
      config: cfg
    };
    sections.push(entry);
    map[key] = entry;
    rowMap[rowKey] = entry;
  }

  return { sections: sections, map: map, rowMap: rowMap };
}

function resolveActiveSectionKey_(preferredKey) {
  const data = readSettingsSections_();
  if (!data.sections.length) {
    throw new Error('⚠️ لم يتم إعداد أي قسم في ورقة Settings.');
  }

  const userProps = PropertiesService.getUserProperties();
  let key = String(preferredKey || '').trim();
  if (key) {
    if (!data.map[key] && data.rowMap && data.rowMap[key]) {
      key = data.rowMap[key].key;
    }
    if (!data.map[key]) {
      key = '';
    }
  }
  if (!key && userProps) {
    const stored = String(userProps.getProperty(PROP_ACTIVE_SECTION) || '').trim();
    if (stored) {
      let resolved = stored;
      if (!data.map[resolved] && data.rowMap && data.rowMap[resolved]) {
        resolved = data.rowMap[resolved].key;
      }
      if (data.map[resolved]) {
        key = resolved;
      }
    }
  }
  if (!key || !data.map[key]) {
    key = data.sections[0].key;
  }
  if (userProps) {
    userProps.setProperty(PROP_ACTIVE_SECTION, key);
  }
  return { key: key, entry: data.map[key], listing: data.sections };
}

function getConfig_(options) {
  const preferredKey = options && options.sectionKey;
  const resolved = resolveActiveSectionKey_(preferredKey);
  if (!resolved.entry) {
    throw new Error('⚠️ لم يتم العثور على إعدادات القسم المحدد.');
  }
  const cfg = Object.assign({}, resolved.entry.config);
  cfg.sectionKey = resolved.key;
  cfg.sectionLabel = resolved.entry.label;
  return cfg;
}

function getConfigStatus() {
  try { return { ok:true, config:getConfig_() }; }
  catch(e){ return { ok:false, message:e.message }; }
}

function getAvailableSections() {
  try {
    const data = readSettingsSections_();
    if (!data.sections.length) {
      throw new Error('⚠️ لم يتم العثور على أي أقسام في ورقة Settings.');
    }
    const cfg = getConfig_();
    return {
      ok: true,
      sections: data.sections.map(s => ({ key: s.key, label: s.label })),
      activeKey: cfg.sectionKey,
      activeLabel: cfg.sectionLabel
    };
  } catch (e) {
    return { ok:false, message:e.message };
  }
}

function switchActiveSection(sectionKey) {
  try {
    const data = readSettingsSections_();
    if (!data.sections.length) {
      throw new Error('⚠️ لم يتم إعداد أي قسم في ورقة Settings.');
    }
    const key = String(sectionKey || '').trim();
    let entry = data.map[key];
    if (!entry && data.rowMap && data.rowMap[key]) {
      entry = data.rowMap[key];
    }
    if (!entry) {
      throw new Error('⚠️ القسم المحدد غير معروف.');
    }
    const userProps = PropertiesService.getUserProperties();
    if (userProps) {
      userProps.setProperty(PROP_ACTIVE_SECTION, entry.key);
    }

    const loadResult = loadDataIntoCache();
    const snapshot = getSearchSnapshotLight();
    return {
      ok: true,
      section: { key: entry.key, label: entry.label },
      loadResult: loadResult,
      snapshot: snapshot
    };
  } catch (e) {
    return { ok:false, message:e.message };
  }
}

function getExternalSheetLinksFromSettings() {
  const cfg = getConfig_();
  const admin = {
    url: cfg.EXTERNAL_ADMIN_URL || '',
    sheetName: cfg.EXTERNAL_ADMIN_SHEET || ''
  };
  const agent = {
    url: cfg.EXTERNAL_AGENT_URL || '',
    sheetName: cfg.EXTERNAL_AGENT_SHEET || ''
  };
  if (!admin.url) {
    throw new Error('⚠️ رابط ملف الإدارة الخارجي مفقود في القسم الحالي (تحقّق من الأعمدة I-J).');
  }
  return { admin: admin, agent: agent };
}

/*****************************
 * كاش + مفاتيح
 *****************************/
const CACHE_TTL_SEC       = 21600; // 6 ساعات
const KEY_AGENT_INDEX     = "agentIndex_v8";   // { [id]: { rows:[..], names:[..], salaries:[..], sum:number } } - تم التحديث
const KEY_ADMIN_IDSET     = "adminIdSet_v7";   // { [id]:1 }
const KEY_ADMIN_ROW_MAP   = "adminRowMap_v7";  // { [id]: [rowIndex,...] }
const KEY_COLORED_AGENT   = "coloredAgentIds_v7";
const KEY_COLORED_ADMIN   = "coloredAdminIds_v7";
const KEY_CORR_MAP        = "salaryCorrMap_v1"; // { "30":29, "88":82, ... }
const KEY_EXT_AGENT_INDEX     = "extAgentIndex_v2";
const KEY_EXT_ADMIN_IDSET     = "extAdminIdSet_v2";
const KEY_EXT_ADMIN_ROW_MAP   = "extAdminRowMap_v2";
const KEY_EXT_COLORED_AGENT   = "extColoredAgent_v2";
const KEY_EXT_COLORED_ADMIN   = "extColoredAdmin_v2";
// كاش معلومات الأشخاص:
const KEY_INFO_ID2GROUP   = "info_id2group_v1"; // { id: groupKey }
const KEY_INFO_GROUPS     = "info_groups_v1";   // { groupKey: {...} }

/********* أدوات chunk للكاش *********/
function cachePutChunked_(keyPrefix, obj, cache) {
  const txt = JSON.stringify(obj);
  const MAX = 90000;
  const n   = Math.ceil(txt.length / MAX);
  const bag = {};
  for (let i = 0; i < n; i++) bag[`${keyPrefix}_chunk_${i}`] = txt.substring(i*MAX, (i+1)*MAX);
  bag[`${keyPrefix}_chunk_count`] = String(n);
  cache.putAll(bag, CACHE_TTL_SEC);
}
function cacheGetChunked_(keyPrefix, cache) {
  const c = cache.get(`${keyPrefix}_chunk_count`);
  if (!c) return null;
  const n = parseInt(c,10);
  const keys = Array.from({length:n},(_,i)=>`${keyPrefix}_chunk_${i}`);
  const got  = cache.getAll(keys);
  let out = "";
  for (let i=0;i<n;i++){
    const part = got[`${keyPrefix}_chunk_${i}`];
    if (!part) return null;
    out += part;
  }
  try { return JSON.parse(out); } catch(_) { return null; }
}

function normalizeSheetLink_(val) {
  const raw = String(val || "").trim();
  if (!raw) return "";
  const idMatch = raw.match(/[-\w]{25,}/);
  if (idMatch) {
    return `https://docs.google.com/spreadsheets/d/${idMatch[0]}/edit`;
  }
  if (/^https:\/\/docs\.google\.com\/spreadsheets\//i.test(raw)) {
    return raw.split('#')[0];
  }
  return "";
}

function getSheetByPreferredName_(spreadsheet, preferredName) {
  if (!spreadsheet) return null;
  if (preferredName) {
    const sh = spreadsheet.getSheetByName(preferredName);
    if (sh) return sh;
  }
  const sheets = spreadsheet.getSheets();
  return sheets && sheets.length ? sheets[0] : null;
}

/*****************************
 * بناء الفهارس (وكيل/إدارة)
 *****************************/
function buildAgentIndex_(colA, colB, colC) {
  const index = Object.create(null);
  const n = Math.max(colA.length, colB.length, colC.length);
  for (let i=0;i<n;i++){
    const id  = String(colA[i] || '').trim();
    if (!id) continue;
    const name = String(colB[i] || '').trim(); // قراءة الاسم من العمود B
    const sal = parseFloat(colC[i] || 0);
    if (!index[id]) index[id] = { rows:[], names:[], salaries:[], sum:0 };
    index[id].rows.push(i+1); // 1-based
    index[id].names.push(name); // تخزين الاسم
    const s = isNaN(sal) ? 0 : sal;
    index[id].salaries.push(s);
    index[id].sum += s;
  }
  return index;
}

function buildColoredIdSet_(ssId, sheetName) {
  const ss = SpreadsheetApp.openById(ssId);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return {};
  const lastRow = sh.getLastRow();
  if (lastRow < 1) return {};
  const colA = sh.getRange(1,1,lastRow,1).getDisplayValues().flat();
  const bgs  = sh.getRange(1,1,lastRow,1).getBackgrounds().flat();
  const set = Object.create(null);
  for (let i=0;i<colA.length;i++){
    const id = String(colA[i]||'').trim();
    if (!id) continue;
    const c = String(bgs[i]||'').toLowerCase();
    if (c && c !== '#ffffff' && c !== 'white' && c !== 'transparent') set[id] = 1;
  }
  return set;
}

function computeExternalStats_(agentIndex, adminRowMap) {
  let agentRows = 0;
  let agentUnique = 0;
  if (agentIndex && typeof agentIndex === 'object') {
    const keys = Object.keys(agentIndex);
    agentUnique = keys.length;
    for (let i = 0; i < keys.length; i++) {
      const node = agentIndex[keys[i]];
      if (node && Array.isArray(node.rows)) {
        agentRows += node.rows.length;
      }
    }
  }

  let adminRows = 0;
  if (adminRowMap && typeof adminRowMap === 'object') {
    const keys = Object.keys(adminRowMap);
    for (let i = 0; i < keys.length; i++) {
      const rows = adminRowMap[keys[i]];
      if (Array.isArray(rows)) {
        adminRows += rows.length;
      }
    }
  }

  return { agentRows: agentRows, agentUnique: agentUnique, adminRows: adminRows };
}

function fetchAndCacheExternalData_(cache, cfg) {
  const links = getExternalSheetLinksFromSettings();
  const adminInfo = links.admin || {};
  if (!adminInfo.url) {
    throw new Error('⚠️ لم يتم إعداد ملف الإدارة الخارجي.');
  }

  const adSS = SpreadsheetApp.openByUrl(adminInfo.url);
  const adSheets = adSS.getSheets();
  if (!adSheets || !adSheets.length) {
    throw new Error('⚠️ لم يتم العثور على أي ورقة في ملف الإدارة الخارجي.');
  }

  let agentIndex = {};
  let coloredAgent = {};
  const agentInfo = links.agent || {};
  if (agentInfo.url) {
    const agSS = SpreadsheetApp.openByUrl(agentInfo.url);
    const agSheets = agSS.getSheets();
    if (!agSheets || !agSheets.length) {
      throw new Error('⚠️ لم يتم العثور على أي ورقة في ملف الوكيل الخارجي.');
    }
    agentIndex = {};
    coloredAgent = {};
    for (let s = 0; s < agSheets.length; s++) {
      const agSh = agSheets[s];
      if (!agSh) continue;
      const sheetName = agSh.getName();
      const lr = agSh.getLastRow();
      if (lr <= 0) continue;
      const colA = agSh.getRange(1, 1, lr, 1).getValues().flat();
      const colB = agSh.getRange(1, 2, lr, 1).getValues().flat();
      const colC = agSh.getRange(1, 3, lr, 1).getValues().flat();
      let bgs = null;
      try {
        bgs = agSh.getRange(1, 1, lr, 1).getBackgrounds().flat();
      } catch (_) {}
      for (let i = 0; i < colA.length; i++) {
        const id = String(colA[i] || '').trim();
        if (!id) continue;
        const name = String(colB[i] || '').trim();
        const sal = parseFloat(colC[i] || 0);
        if (!agentIndex[id]) {
          agentIndex[id] = { rows: [], names: [], salaries: [], sum: 0 };
        }
        agentIndex[id].rows.push({ sheet: sheetName, row: i + 1 });
        agentIndex[id].names.push(name);
        const salaryVal = isNaN(sal) ? 0 : sal;
        agentIndex[id].salaries.push(salaryVal);
        agentIndex[id].sum += salaryVal;
        if (bgs) {
          const c = String(bgs[i] || '').toLowerCase();
          if (c && c !== '#ffffff' && c !== 'white' && c !== 'transparent') {
            coloredAgent[id] = 1;
          }
        }
      }
    }
  }

  const adminIdSet = {};
  const adminRowMap = {};
  const coloredAdmin = {};
  for (let s = 0; s < adSheets.length; s++) {
    const adSh = adSheets[s];
    if (!adSh) continue;
    const sheetName = adSh.getName();
    const adLr = adSh.getLastRow();
    if (adLr <= 0) continue;
    const colA = adSh.getRange(1, 1, adLr, 1).getValues().flat();
    let bgs = null;
    try {
      bgs = adSh.getRange(1, 1, adLr, 1).getBackgrounds().flat();
    } catch (_) {}
    for (let i = 0; i < colA.length; i++) {
      const id = String(colA[i] || '').trim();
      if (!id) continue;
      adminIdSet[id] = 1;
      if (!adminRowMap[id]) adminRowMap[id] = [];
      adminRowMap[id].push({ sheet: sheetName, row: i + 1 });
      if (bgs) {
        const c = String(bgs[i] || '').toLowerCase();
        if (c && c !== '#ffffff' && c !== 'white' && c !== 'transparent') {
          coloredAdmin[id] = 1;
        }
      }
    }
  }

  cachePutChunked_(KEY_EXT_AGENT_INDEX, agentIndex, cache);
  cachePutChunked_(KEY_EXT_ADMIN_IDSET, adminIdSet, cache);
  cachePutChunked_(KEY_EXT_ADMIN_ROW_MAP, adminRowMap, cache);
  cachePutChunked_(KEY_EXT_COLORED_AGENT, coloredAgent, cache);
  cachePutChunked_(KEY_EXT_COLORED_ADMIN, coloredAdmin, cache);

  const stats = computeExternalStats_(agentIndex, adminRowMap);

  return {
    agentIndex: agentIndex,
    adminIdSet: adminIdSet,
    adminRowMap: adminRowMap,
    coloredAgent: coloredAgent,
    coloredAdmin: coloredAdmin,
    stats: stats,
    ready: true,
    fromCache: false
  };
}

function loadExternalData_(options) {
  options = options || {};
  const cache = CacheService.getScriptCache();
  let agentIndex = cacheGetChunked_(KEY_EXT_AGENT_INDEX, cache);
  let adminIdSet = cacheGetChunked_(KEY_EXT_ADMIN_IDSET, cache);
  let adminRowMap = cacheGetChunked_(KEY_EXT_ADMIN_ROW_MAP, cache);
  let coloredAgent = cacheGetChunked_(KEY_EXT_COLORED_AGENT, cache);
  let coloredAdmin = cacheGetChunked_(KEY_EXT_COLORED_ADMIN, cache);

  const ready = !!(agentIndex && adminIdSet && adminRowMap && coloredAgent && coloredAdmin);
  if (ready && !options.forceReload) {
    return {
      agentIndex: agentIndex,
      adminIdSet: adminIdSet,
      adminRowMap: adminRowMap,
      coloredAgent: coloredAgent,
      coloredAdmin: coloredAdmin,
      stats: computeExternalStats_(agentIndex, adminRowMap),
      ready: true,
      fromCache: true
    };
  }

  if (options.fromCacheOnly) {
    return {
      agentIndex: agentIndex || {},
      adminIdSet: adminIdSet || {},
      adminRowMap: adminRowMap || {},
      coloredAgent: coloredAgent || {},
      coloredAdmin: coloredAdmin || {},
      stats: ready ? computeExternalStats_(agentIndex, adminRowMap) : { agentRows: 0, agentUnique: 0, adminRows: 0 },
      ready: ready,
      fromCache: !!ready
    };
  }

  const cfg = getConfig_();
  return fetchAndCacheExternalData_(cache, cfg);
}

/*****************************
 * ورقة "تصحيح الراتب" (اختيارية)
 * أعمدة: A=الراتب الأصلي، B=الراتب المعروض
 *****************************/
function buildSalaryCorrectionsMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("تصحيح الراتب");
  const map = Object.create(null);
  if (!sh) return map;
  const lr = sh.getLastRow();
  if (lr < 1) return map;
  const vals = sh.getRange(1,1,lr,2).getDisplayValues();
  for (let i=0;i<vals.length;i++){
    const from = Number(vals[i][0]);
    const to   = Number(vals[i][1]);
    if (!isNaN(from) && !isNaN(to)) map[String(from)] = to;
  }
  return map;
}
function applySalaryCorrection_(val, corrMap) {
  const key = String(Number(val));
  if (corrMap && Object.prototype.hasOwnProperty.call(corrMap, key)) {
    return Number(corrMap[key]);
  }
  return Number(val||0);
}

/*****************************
 * أدوات “معلومات الأشخاص”
 *****************************/
function openSheetFlex_(idMaybe, nameMaybe) {
  if (idMaybe) {
    const ss = SpreadsheetApp.openById(idMaybe);
    if (nameMaybe) {
      const sh = ss.getSheetByName(nameMaybe);
      if (sh) return sh;
    }
    return ss.getSheets()[0] || null;
  } else {
    const cur = SpreadsheetApp.getActiveSpreadsheet();
    if (nameMaybe) return cur.getSheetByName(nameMaybe);
    return null;
  }
}
function readSheetAsObjectsWithSource_(sh, sourceKey) {
  if (!sh) return [];
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return [];
  const headers = sh.getRange(1,1,1,lc).getDisplayValues()[0].map(h=>String(h||'').trim());
  const vals = sh.getRange(2,1,lr-1,lc).getDisplayValues();
  return vals.map(row=>{
    const obj = {};
    for (let i=0;i<headers.length;i++){
      const key = headers[i] || ('COL_'+(i+1));
      obj[key] = row[i];
    }
    obj.__source = sourceKey; // data1 أو data2
    return obj;
  });
}
// نسخة بدون مصدر (تُستخدم في applyAdvancedAction)
function readSheetAsObjects_(sh) {
  if (!sh) return [];
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return [];
  const headers = sh.getRange(1,1,1,lc).getDisplayValues()[0].map(h=>String(h||'').trim());
  const vals = sh.getRange(2,1,lr-1,lc).getDisplayValues();
  return vals.map(row=>{
    const obj = {};
    for (let i=0;i<headers.length;i++){
      const key = headers[i] || ('COL_'+(i+1));
      obj[key] = row[i];
    }
    return obj;
  });
}

function normalizeName_(s){ return String(s||'').trim().replace(/\s+/g,' ').toLowerCase(); }
function extractNameFromRow_(row){
  if (!row) return '';
  const keys = ['full_name','الاسم','الاسم الثلاثي','name'];
  for (const k in row){
    if (keys.indexOf(String(k).toLowerCase()) !== -1){
      const v = String(row[k]||'').trim();
      if (v) return v;
    }
  }
  return '';
}
function pickField_(row, keyAliases, defVal){
  for (const k in row) {
    const kl = k.toLowerCase();
    if (keyAliases.indexOf(kl) !== -1) {
      const v = String(row[k]||'').trim();
      if (v) return v;
    }
  }
  return defVal;
}
function extractIdsFromRow_(obj) {
  const out = {};
  for (const k in obj) {
    const kl = String(k).toLowerCase();
    if (kl === 'id') {
      String(obj[k]||'').split(/[,\s]+/).forEach(function(x){
        const v = String(x||'').trim();
        if (v) out[v] = 1;
      });
    }
    if (kl === 'raw_payload_json') {
      try{
        const j = JSON.parse(obj[k]||'{}');
        const arr = j && j.user_ids;
        if (Array.isArray(arr)) arr.forEach(function(v){ const s=String(v||'').trim(); if(s) out[s]=1; });
      }catch(_){}
    }
  }
  return Object.keys(out);
}
function buildInfoGroups_(rows1, rows2){
  const groups = Object.create(null);
  const id2group = Object.create(null);
  let anonCounter = 0;

  function mergeRow(r){
    const src = r.__source || '';
    const name = extractNameFromRow_(r);
    const gk0  = normalizeName_(name);
    const gk   = gk0 || ('__anon__'+(++anonCounter));

    if (!groups[gk]){
      const phone   = pickField_(r, ['phone','الهاتف','رقم الهاتف','mobile'], '');
      const address = pickField_(r, ['address','العنوان','المحافظة','المدينة'], '');
      const agency  = pickField_(r, ['agency_name','الوكالة','الشركة','الفرع'], '');
      const noteLbl = pickField_(r, ['extra_field_label'],'');
      const noteVal = pickField_(r, ['extra_field_value'],'');
      const note    = (noteLbl && noteVal) ? (noteLbl+' : '+noteVal) : (noteVal || '');

      groups[gk] = {
        name: name || '',
        phone, address, agency, note,
        ids: [],
        sources: { data1:false, data2:false }
      };
    }

    const ids = extractIdsFromRow_(r);
    for (let i=0;i<ids.length;i++){
      const id = String(ids[i]).trim();
      if (!id) continue;
      if (!groups[gk].ids.some(x=>x.id===id)){
        groups[gk].ids.push({ id:id, source: src });
      }
      if (!id2group[id]) id2group[id] = gk;
    }
    if (src === 'data1') groups[gk].sources.data1 = true;
    if (src === 'data2') groups[gk].sources.data2 = true;

    function enrich(fieldName, val){
      if (!groups[gk][fieldName] && val) groups[gk][fieldName] = val;
    }
    enrich('phone',   pickField_(r, ['phone','الهاتف','رقم الهاتف','mobile'], ''));
    enrich('address', pickField_(r, ['address','العنوان','المحافظة','المدينة'], ''));
    enrich('agency',  pickField_(r, ['agency_name','الوكالة','الشركة','الفرع'], ''));
    if (!groups[gk].note){
      const nl = pickField_(r, ['extra_field_label'],'');
      const nv = pickField_(r, ['extra_field_value'],'');
      const nt = (nl && nv) ? (nl+' : '+nv) : (nv || '');
      if (nt) groups[gk].note = nt;
    }
  }

  (rows1||[]).forEach(mergeRow);
  (rows2||[]).forEach(mergeRow);

  return { groups, id2group };
}

/*****************************
 * تحميل البيانات إلى الكاش
 *****************************/
function loadDataIntoCache() {
  try {
    const cache = CacheService.getScriptCache();
    const cfg = getConfig_();
    const sectionLabel = cfg.sectionLabel || 'القسم الحالي';

    // الوكيل
    const agSS = SpreadsheetApp.openById(cfg.AGENT_SHEET_ID);
    const agSh = agSS.getSheetByName(cfg.AGENT_SHEET_NAME);
    if (!agSh) throw new Error('لم يتم العثور على ورقة الوكيل "'+cfg.AGENT_SHEET_NAME+'".');
    const agLastRow = agSh.getLastRow();
    let agentIndex = {};
    if (agLastRow > 0) {
      const colA = agSh.getRange(1,1,agLastRow,1).getValues().flat(); // IDs
      const colB = agSh.getRange(1,2,agLastRow,1).getValues().flat(); // الأسماء - العمود B
      const colC = agSh.getRange(1,3,agLastRow,1).getValues().flat(); // الرواتب
      agentIndex = buildAgentIndex_(colA, colB, colC); // تمرير الأعمدة الثلاثة
    }

    // الإدارة
    const adSS = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
    const adSh = adSS.getSheetByName(cfg.ADMIN_SHEET_NAME);
    if (!adSh) throw new Error('لم يتم العثور على ورقة الإدارة "'+cfg.ADMIN_SHEET_NAME+'".');
    const adLastRow = adSh.getLastRow();
    let adminIdSet = {}, adminRowMap = {};
    if (adLastRow > 0) {
      const colA = adSh.getRange(1,1,adLastRow,1).getValues().flat(); // IDs
      for (let i=0; i<colA.length; i++) {
        const id = String(colA[i]||'').trim();
        if (!id) continue;
        adminIdSet[id] = 1;
        if (!adminRowMap[id]) adminRowMap[id] = [];
        adminRowMap[id].push(i+1); // 1-based
      }
    }

    // خرائط الملوّن
    const coloredAgent = buildColoredIdSet_(cfg.AGENT_SHEET_ID, cfg.AGENT_SHEET_NAME);
    const coloredAdmin = buildColoredIdSet_(cfg.ADMIN_SHEET_ID, cfg.ADMIN_SHEET_NAME);

    // خريطة تصحيح الراتب
    const corrMap = buildSalaryCorrectionsMap_();

    // شيتات معلومات الأشخاص
    const sh1 = openSheetFlex_(cfg.DATA1_ID, cfg.DATA1_NAME); // معلومات السلطان
    const sh2 = openSheetFlex_(cfg.DATA2_ID, cfg.DATA2_NAME); // الفرعيين
    const rows1 = readSheetAsObjectsWithSource_(sh1, 'data1');
    const rows2 = readSheetAsObjectsWithSource_(sh2, 'data2');
    const infoPacked = buildInfoGroups_(rows1, rows2); // { groups, id2group }

    // اكتب في الكاش (chunked)
    cachePutChunked_(KEY_AGENT_INDEX,   agentIndex, cache);
    cachePutChunked_(KEY_ADMIN_IDSET,   adminIdSet, cache);
    cachePutChunked_(KEY_ADMIN_ROW_MAP, adminRowMap,cache);
    cachePutChunked_(KEY_COLORED_AGENT, coloredAgent, cache);
    cachePutChunked_(KEY_COLORED_ADMIN, coloredAdmin, cache);
    cachePutChunked_(KEY_CORR_MAP,      corrMap,     cache);
    cachePutChunked_(KEY_INFO_ID2GROUP, infoPacked.id2group, cache);
    cachePutChunked_(KEY_INFO_GROUPS,   infoPacked.groups,   cache);

    // إحصاء بسيط
    let agentRows = 0;
    for (const id in agentIndex) agentRows += (agentIndex[id].rows ? agentIndex[id].rows.length : 0);
    const agentUnique = Object.keys(agentIndex).length;

    let adminRows = 0;
    for (const id in adminRowMap) adminRows += (adminRowMap[id] ? adminRowMap[id].length : 0);

    let externalSummary = '';
    try {
      const ext = loadExternalData_({ forceReload: true });
      if (ext && ext.ready && ext.stats) {
        externalSummary = ' — الخارجي: الوكيل ' + ext.stats.agentRows + ' صف / ' + ext.stats.agentUnique + ' ID فريد — الإدارة: ' + ext.stats.adminRows + ' صف.';
      }
    } catch (extErr) {
      externalSummary = ' — ⚠️ فشل تحميل الخارجي: ' + (extErr && extErr.message ? extErr.message : String(extErr || ''));
    }

    try {
      const docProps = PropertiesService.getDocumentProperties();
      if (docProps && cfg.sectionKey) {
        docProps.setProperty(PROP_CACHE_SECTION, String(cfg.sectionKey));
      }
    } catch (_) {}

    return {
      success:true,
      message:'[' + sectionLabel + '] تم التحميل ✓ — الوكيل: '+agentRows+' صف / '+agentUnique+' ID فريد — الإدارة: '+adminRows+' صف.' + externalSummary
    };
  } catch (e) {
    return { success:false, message:'خطأ: ' + e.message };
  }
}

/*****************************
 * سنابشوت محلي سريع للواجهة
 *****************************/
function getSearchSnapshotLight() {
  try {
    const cache = CacheService.getScriptCache();
    const agentIndex   = cacheGetChunked_(KEY_AGENT_INDEX,   cache) || {};
    const adminIdSet   = cacheGetChunked_(KEY_ADMIN_IDSET,   cache) || {};
    const coloredAgent = cacheGetChunked_(KEY_COLORED_AGENT, cache) || {};
    const coloredAdmin = cacheGetChunked_(KEY_COLORED_ADMIN, cache) || {};

    const map = {};
    let agentRows = 0;
    for (const id in agentIndex) {
      const node = agentIndex[id] || {};
      const rowsLen = (node.rows && node.rows.length) ? node.rows.length : 0;
      agentRows += rowsLen;
      map[id] = {
        sum: Number(node.sum||0),
        salaries: (node.salaries||[]).map(Number),
        names: (node.names||[]).slice(), // نقل الأسماء
        rowsCount: rowsLen,
        inAdmin: !!adminIdSet[id],
        aCol: !!coloredAgent[id],
        dCol: !!coloredAdmin[id]
      };
    }
    return { ok:true, map:map, stats:{ agentRows:agentRows, agentUnique:Object.keys(agentIndex).length } };
  } catch(e){
    return { ok:false, message:e.message };
  }
}

/*****************************
 * بحث سريع + ملخص
 *****************************/
function searchId(id, discountPercentage) {
  try {
    if (!id) return { status:'error', message:'الرجاء إدخال ID للبحث.' };
    id = String(id).trim();

    const cache = CacheService.getScriptCache();
    const agentIndex   = cacheGetChunked_(KEY_AGENT_INDEX,   cache);
    const adminIdSet   = cacheGetChunked_(KEY_ADMIN_IDSET,   cache);
    const coloredAgent = cacheGetChunked_(KEY_COLORED_AGENT, cache);
    const coloredAdmin = cacheGetChunked_(KEY_COLORED_ADMIN, cache);

    if (!agentIndex || !adminIdSet || !coloredAgent || !coloredAdmin) {
      return { status:'error', message:'البيانات غير محمّلة. اضغط "تحميل البيانات".' };
    }

    const inAgent = !!agentIndex[id];
    const inAdmin = !!adminIdSet[id];

    // ← مهم: نعرّف total من البداية ونستخدمه لاحقًا أينما كان الفرع
    let status   = 'غير موجود';
    let salaries = [];
    let names    = [];
    let total    = 0;

    if (inAgent) {
      const node = agentIndex[id];
      salaries = (node.salaries || []).slice();
      names    = (node.names || []).slice();
      total    = Number(node.sum || 0);
      status   = inAdmin
        ? ((node.rows.length > 1) ? 'سحب وكالة - راتبين' : 'سحب وكالة')
        : ((node.rows.length > 1) ? 'راتبين' : 'وكالة');
    } else if (inAdmin) {
      status = 'ادارة';
      total  = 0; // ← حتى لو إدارة فقط يبقى total معرّف
    } else {
      // غير موجود في الاثنين
      return {
        status:'غير موجود',
        totalSalary:'0.00',
        salaries:[],
        names:[],
        name:'',
        discountAmount:'0.00',
        salaryAfterDiscount:'0.00',
        id:id,
        isDuplicate:false
      };
    }

    // مكرر؟
    let isDuplicate = false, duplicateLabel = null;
    const aCol = !!coloredAgent[id];
    const dCol = !!coloredAdmin[id];
    if (aCol && dCol)      { isDuplicate = true; duplicateLabel = 'مكرر'; }
    else if (aCol)         { isDuplicate = true; duplicateLabel = 'مكرر وكالة فقط'; }
    else if (dCol)         { isDuplicate = true; duplicateLabel = 'مكرر ادارة فقط'; }

    // اسم مختصر للواجهة
    const primaryName = (names && names.length) ? String(names[0] || '').trim() : '';

    // الخصم
    const p    = Math.max(0, Math.min(100, Number(discountPercentage) || 0));
    const disc = total * (p / 100);
    const aft  = total - disc;

    return {
      status: status,
      totalSalary: total.toFixed(2),
      salaries: salaries,
      names: names,
      name: primaryName,
      discountAmount: disc.toFixed(2),
      salaryAfterDiscount: aft.toFixed(2),
      id: id,
      isDuplicate: isDuplicate,
      duplicateLabel: duplicateLabel
    };
  } catch (e) {
    return { status:'error', message: e.toString() };
  }
}

function getLiveStatsForFooter(discountPercentage) {
  try {
    const cache = CacheService.getScriptCache();
    const agentIndex   = cacheGetChunked_(KEY_AGENT_INDEX,   cache) || {};
    const coloredAgent = cacheGetChunked_(KEY_COLORED_AGENT, cache) || {};

    let totalRowsWithIds = 0;
    let coloredRows = 0;
    let totalSalary = 0;
    let multiRows = 0;

    for (const id in agentIndex) {
      const node = agentIndex[id] || {};
      const rowsCount = (node.rows && node.rows.length) ? node.rows.length : 0;
      totalRowsWithIds += rowsCount;
      if (coloredAgent[id]) coloredRows += rowsCount;
      totalSalary += Number(node.sum || 0);
      if (rowsCount > 1) multiRows++;
    }
    const uncoloredRows = Math.max(0, totalRowsWithIds - coloredRows);

    const p = Math.max(0, Math.min(100, Number(discountPercentage)||0));
    const totalDiscount = totalSalary * (p/100);
    const afterDiscount = totalSalary - totalDiscount;

    return {
      ok: true,
      agentIdCount: Object.keys(agentIndex).length,
      coloredRows: coloredRows,
      uncoloredRows: uncoloredRows,
      multiRows: multiRows,
      totalSalary: Number(totalSalary.toFixed(2)),
      discountPercent: p,
      totalDiscount: Number(totalDiscount.toFixed(2)),
      afterDiscount: Number(afterDiscount.toFixed(2))
    };
  } catch (e) {
    return { ok:false, message: e.message || String(e) };
  }
}

/*****************************
 * بطاقة الشخص + تصحيح راتب (يحترم السويتش)
 *****************************/
function buildPersonCardFromGroup_(group, agentIndex, corrMap) {
  const props = PropertiesService.getScriptProperties();
  const useCorr = (props.getProperty('USE_SAL_CORR') === '1');

  const name    = String(group.name||'').trim() || '—';
  const phone   = String(group.phone||'').trim() || '—';
  const address = String(group.address||'').trim() || '—';
  const agency  = String(group.agency||'').trim() || '—';
  const note    = String(group.note||'').trim();

  const idLines = [];
  let total = 0;
  const ids = Array.isArray(group.ids) ? group.ids : [];
  for (let i=0;i<ids.length;i++){
    const uid = ids[i].id;
    const node = agentIndex && agentIndex[uid];
    const sumOrig = node ? Number(node.sum||0) : 0;
    const sumShown = useCorr ? applySalaryCorrection_(sumOrig, corrMap) : sumOrig;
    total += sumShown;
    idLines.push({ id: uid, amount: sumShown });
  }

  return {
    ok:true,
    name: name, phone: phone, address: address, agency: agency, note: note,
    ids: idLines,
    total: total,
    sources: {
      data1: !!(group.sources && group.sources.data1),
      data2: !!(group.sources && group.sources.data2)
    }
  };
}

function getPersonCardById(id) {
  try{
    id = String(id||'').trim();
    if (!id) return { ok:false, message:'أدخل ID' };

    const cache = CacheService.getScriptCache();
    const id2group   = cacheGetChunked_(KEY_INFO_ID2GROUP, cache) || {};
    const groups     = cacheGetChunked_(KEY_INFO_GROUPS,   cache) || {};
    const agentIndex = cacheGetChunked_(KEY_AGENT_INDEX,   cache) || {};
    const corrMap    = cacheGetChunked_(KEY_CORR_MAP,      cache) || {};
    const coloredAgent = cacheGetChunked_(KEY_COLORED_AGENT, cache) || {};
    const coloredAdmin = cacheGetChunked_(KEY_COLORED_ADMIN, cache) || {};

    if (!id2group || !groups || !agentIndex) {
      return { ok:false, message:'⚠️ البيانات غير محمّلة. اضغط "تحميل البيانات".' };
    }

    const gk = id2group[id];
    if (!gk || !groups[gk]) {
      return { ok:false, message:'لم يتم العثور على بيانات لهذا ID في شيتات المعلومات.' };
    }

    const card = buildPersonCardFromGroup_(groups[gk], agentIndex, corrMap);

    const duplicates = [];
    for (let i=0;i<card.ids.length;i++){
      const uid = card.ids[i].id;
      const aCol = !!coloredAgent[uid];
      const dCol = !!coloredAdmin[uid];
      if (aCol || dCol) {
        const label = (aCol && dCol) ? 'مكرر (وكالة + إدارة)' : (aCol ? 'مكرر وكالة' : 'مكرر إدارة');
        duplicates.push({ id: uid, label: label });
      }
    }

    return Object.assign({}, card, { duplicates: duplicates });
  }catch(e){
    return { ok:false, message: 'خطأ: ' + (e.message||String(e)) };
  }
}

/*****************************
 * أدوات مساعدة للـ applyAdvancedAction
 *****************************/
function findProfileRowById_(rows, id) {
  id = String(id||'').trim();
  if (!id || !Array.isArray(rows)) return null;
  for (let i=0;i<rows.length;i++){
    const r = rows[i];
    const ids = extractIdsFromRow_(r) || [];
    if (ids.indexOf(id) !== -1) {
      return { rowIndex: i+2, allIds: ids }; // 2 = بعد صف العناوين
    }
  }
  return null;
}

/***** === FAST RANGE COLORING (bulk contiguous runs) === *****/
function colorRowsFast_(sh, rows, bg) {
  try {
    if (!sh || !rows || !rows.length) return;
    var lastCol = sh.getLastColumn();
    var color = bg || '#ddd6fe';

    // رتّب وجمّع الصفوف المتتالية لتقليل عدد اللمسات
    rows = rows.slice().sort(function(a,b){return a-b;});
    var runs = [];
    var start = rows[0], prev = rows[0];
    for (var i=1; i<rows.length; i++){
      var r = rows[i];
      if (r === prev + 1) { prev = r; continue; }
      runs.push([start, prev]); start = prev = r;
    }
    runs.push([start, prev]);

    // لوّن كل مقطع بلمسة واحدة باستخدام setBackgrounds
    for (var k=0; k<runs.length; k++){
      var s = runs[k][0], e = runs[k][1];
      var h = e - s + 1;
      var rng = sh.getRange(s, 1, h, lastCol);
      var block = Array.from({length:h}, function(){ return Array(lastCol).fill(color); });
      rng.setBackgrounds(block);
    }
  } catch(e) {}
}

/*****************************
 * تنفيذ ذكي + نسخ/تلوين (مع منع تكرار مُحكم)
 *****************************/
function applyAdvancedAction(id, targetSheet, adminColor, withdrawColor, targetMode, expandAllProfileIds) {
  try {
    id = String(id||'').trim();
    if(!id) return {success:false,message:"❌ أدخل ID"};

    targetMode = (targetMode||'both').toLowerCase(); 
    const doAdminOps = (targetMode === 'both');     // "الإدارة + الوكيل"
    expandAllProfileIds = (expandAllProfileIds !== false); // افتراضي: يوسّع

    const cache = CacheService.getScriptCache();
    const agentIndex  = cacheGetChunked_(KEY_AGENT_INDEX,   cache) || {};
    const adminRowMap = cacheGetChunked_(KEY_ADMIN_ROW_MAP, cache) || {};
    let coloredAgent  = cacheGetChunked_(KEY_COLORED_AGENT, cache) || {};
    let coloredAdmin  = cacheGetChunked_(KEY_COLORED_ADMIN, cache) || {};

    const cfg = getConfig_();
    const adSS = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
    const adSh = adSS.getSheetByName(cfg.ADMIN_SHEET_NAME);

    let tgSh = null, targetIdSet = Object.create(null);
    if (doAdminOps) {
      tgSh = adSS.getSheetByName(targetSheet || '');
      if(!tgSh) return {success:false,message:"⚠️ اختر ورقة الهدف أولاً"};

      // IDs الموجودة مسبقًا في ورقة الهدف (لمنع التكرار)
      const lr = tgSh.getLastRow();
      if (lr > 0) {
        const colA = tgSh.getRange(1,1,lr,1).getDisplayValues();
        for (var i=0;i<lr;i++){
          const cur = (colA[i][0]||'').trim();
          if (cur) targetIdSet[cur] = 1;
        }
      }
    }

    // توسيع IDs الخاصّة بالشخص (اختياري)
    let targetIds = [id];
    if (expandAllProfileIds) {
      const sh1 = openSheetFlex_(cfg.DATA1_ID, cfg.DATA1_NAME);
      const sh2 = openSheetFlex_(cfg.DATA2_ID, cfg.DATA2_NAME);
      const rows1 = readSheetAsObjects_(sh1);
      const rows2 = readSheetAsObjects_(sh2);
      let found = findProfileRowById_(rows1, id) || findProfileRowById_(rows2, id);
      if (found && Array.isArray(found.allIds) && found.allIds.length) {
        targetIds = Array.from(new Set(found.allIds.map(String)));
      }
    }

    let copied = 0, skipped = 0, totalColored = 0;
    let lastUsedColor = null;

    const agSS = SpreadsheetApp.openById(cfg.AGENT_SHEET_ID);
    const agSh = agSS.getSheetByName(cfg.AGENT_SHEET_NAME);

    // منع تكرار نفس الـID ضمن نفس ضغطة التنفيذ
    const recentCopied = Object.create(null);

    // انسخ "صف واحد فقط" من الإدارة إلى الهدف (منع تكرار ذكي بدون منع بسبب التلوين)
function copyOneAdminRowToTarget(adRows, colorHex){
  if (!doAdminOps || !tgSh || !Array.isArray(adRows) || !adRows.length) return;

  const adLastCol = adSh.getLastColumn();

  for (let i = 0; i < adRows.length; i++){
    const r = adRows[i];
    const vals = adSh.getRange(r, 1, 1, adLastCol).getValues()[0];
    const curIdFromRow = String(vals[0] || '').trim();

    if (alreadyCopied_(curIdFromRow, tgSh)) { skipped++; continue; }
    
    // ✋ منع التكرار الحقيقي فقط:
    // - موجود مسبقًا في ورقة الهدف
    // - أو تكرر ضمن نفس ضغطة التنفيذ
    if (!curIdFromRow) { skipped++; continue; }
    if (targetIdSet[curIdFromRow]) { skipped++; continue; }
    if (recentCopied && recentCopied[curIdFromRow]) { skipped++; continue; }

    // مكان اللصق
    const startAt = tgSh.getLastRow() + 1;

    // اللصق
    tgSh.appendRow(vals);

    // تلوين الصف الملصوق
    const lastColTarget = tgSh.getLastColumn() || adLastCol;
    tgSh.getRange(startAt, 1, 1, lastColTarget).setBackground(colorHex);

    // حدّث منع التكرار
    targetIdSet[curIdFromRow] = 1;          // صار موجود بالهدف
    if (typeof recentCopied === 'object') {
      recentCopied[curIdFromRow] = 1;       // لا تكرّره ضمن نفس الضغطة
    }

    copied++;

    // (اختياري) سجل العملية
    try { logCopyOperation(tgSh.getName(), startAt, 1, colorHex, curIdFromRow); } catch(_){}

    break; // صف واحد فقط لكل ID
  }
}

    // تنفيذ لكل ID
    targetIds.forEach(function(curId){
      const node    = agentIndex[curId];
      const inAgent = !!node;
      const agRows  = (node && node.rows) || [];
      const adRows  = adminRowMap[curId] || [];
      const inAdmin = adRows.length > 0;

      if (!inAgent && !inAdmin) return;

      // تحديد الحالة
      let status;
      if (inAgent && inAdmin) status = (agRows.length>1) ? 'سحب وكالة - راتبين' : 'سحب وكالة';
      else if (inAdmin)       status = 'ادارة';
      else                    status = (agRows.length>1) ? 'راتبين' : 'وكالة';

      // === إدارة فقط ===
      if (!status.includes('سحب وكالة') && status.includes('ادارة')) {
        if (doAdminOps && adRows.length){
          const usedColor = adminColor || '#fde68a';

          // لوّن الإدارة مرة واحدة فقط لكل ID (منع إعادة التلوين)
          if (!coloredAdmin[curId]) {
            colorRowsFast_(adSh, adRows, usedColor);
            coloredAdmin[curId] = 1;
            totalColored += adRows.length;
            lastUsedColor = usedColor;
          }

          // انسخ صف واحد فقط من الإدارة إلى الهدف (مع منع التكرار)
          copyOneAdminRowToTarget(adRows, usedColor);
        }
      }

      // === "سحب وكالة" أو "وكالة/راتبين" ===
      if (status.includes('سحب وكالة') || status.includes('وكالة')) {
        const usedColor = withdrawColor || '#ddd6fe';

        // لوّن الوكيل مرة واحدة فقط لكل ID
        if (agRows.length && !coloredAgent[curId]){
          colorRowsFast_(agSh, agRows, usedColor);
          coloredAgent[curId] = 1;
          totalColored += agRows.length;
          lastUsedColor = usedColor;
        }

        // إذا "الإدارة + الوكيل": لوّن الإدارة مرة واحدة + انسخ صف واحد
        if (doAdminOps && adRows.length){
          if (!coloredAdmin[curId]) {
            colorRowsFast_(adSh, adRows, usedColor);
            coloredAdmin[curId] = 1;
            totalColored += adRows.length;
            lastUsedColor = usedColor;
          }
          copyOneAdminRowToTarget(adRows, usedColor);
        }
      }
    });

    SpreadsheetApp.flush();
    cachePutChunked_(KEY_COLORED_AGENT, coloredAgent, cache);
    cachePutChunked_(KEY_COLORED_ADMIN, coloredAdmin, cache);

    let msg = `✅ تم التنفيذ`;
    if (copied)        msg += ` — نُسخ ${copied} صف`;
    if (skipped)       msg += ` — تم تخطي ${skipped}`;
    if (totalColored)  msg += ` — تلوين ${totalColored} صف`;
    if (lastUsedColor) msg += ` — لون ${lastUsedColor}`;
    if (!doAdminOps)   msg += ` — (وضع: الوكيل فقط)`;

    return { success:true, message: msg };
  } catch(e){
    return {success:false,message:"خطأ: "+e.message};
  }
}

/*****************************
 * العرض (تم إلغاء القائمة)
 *****************************/
function getAdminSheets(){
  const cfg = getConfig_();
  const adSS = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
  return adSS.getSheets().map(function(sh){ return sh.getName(); });
}
function createAdminSheet(name){
  name = String(name||'').trim();
  if(!name) return "⚠️ اكتب اسم ورقة";
  const cfg = getConfig_();
  const adSS = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
  if(adSS.getSheetByName(name)) return "⚠️ الورقة موجودة بالفعل";
  adSS.insertSheet(name);
  return "✅ تم إنشاء الورقة: "+name;
}

function onOpen() {
  // تم إلغاء إنشاء القائمة المخصصة بناءً على الطلب،
  // لذلك نترك الدالة بدون أي تنفيذ.
}

function showSidebar() {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.MODE = 'sidebar';
  const html = t.evaluate().setTitle('أداة البحث').setWidth(460);
  SpreadsheetApp.getUi().showSidebar(html);
}

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.MODE = 'web';
  return t.evaluate()
    .setTitle('أداة البحث المتقدم')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

/***** === تشغيل/إيقاف تصحيح الراتب === *****/
function setSalaryCorrectionEnabled(enabled) {
  var v = (enabled === true || enabled === '1' || enabled === 1) ? '1' : '0';
  PropertiesService.getScriptProperties().setProperty('USE_SAL_CORR', v);
  return { ok:true, enabled: v === '1' };
}
function getSalaryCorrectionEnabled() {
  var v = PropertiesService.getScriptProperties().getProperty('USE_SAL_CORR');
  return { ok:true, enabled: v === '1' };
}

/***** === Gemini test (كما هو) ===*****/
function testGemini() {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      Logger.log("❌ ما في API Key مخزّن. ضيفه في Script Properties باسم GEMINI_API_KEY.");
      return;
    }

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + apiKey;

    const payload = {
      contents: [{
        parts: [{ text: "اكتب لي جملة ترحيب قصيرة باللهجة السورية" }]
      }]
    };

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    Logger.log(result);

    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ ما في نص بالرد";
    Logger.log("✅ رد Gemini: " + text);

  } catch (e) {
    Logger.log("⚠️ خطأ: " + e.message);
  }
}

function ping(){
  return true;
}

/* ============================================================
 *      ✦✦✦  إضافات السجل والنقل (قص-لصق)  ✦✦✦
 *  (أحدث للأقدم، نقل من/إلى أي ورقة، منع التكرار، حفظ اللون)
 * ============================================================*/

/** فحص بسيط (تستخدمه الواجهة إن احتجت) */
function lgp__ping(){ return { ok:true, ts:new Date().toISOString() }; }

/** يسجّل عملية واحدة في السجل */
function logCopyOperation(targetSheetName, startAt, rowsCount, colorHex, idMaybe) {
  try {
    var props = PropertiesService.getDocumentProperties();
    var raw   = props.getProperty('COPY_LOG_V1') || '[]';
    var log;
    try { log = JSON.parse(raw); } catch(_) { log = []; }
    log.push({
      t: Date.now(),
      target: String(targetSheetName || ''),
      start:  Number(startAt || 0),
      cnt:    Number(rowsCount || 1),
      color:  String(colorHex || ''),
      id:     String(idMaybe || '')
    });
    if (log.length > 200) log = log.slice(-200);
    props.setProperty('COPY_LOG_V1', JSON.stringify(log));
  } catch(_) {}
}

/** يرجع آخر N عناصر من السجل — ترتيب: الأحدث أولاً */
function getMoveLogLatest(limit){
  var LIM = Math.max(1, Math.min(100, Number(limit || 15)));
  var props = PropertiesService.getDocumentProperties();
  var log = [];
  try { log = JSON.parse(props.getProperty('COPY_LOG_V1') || '[]'); } catch(_){}
  var last = log.slice(-LIM).reverse();
  return last.map(function(it){
    return {
      id: it.id || '',
      target: it.target || '',
      rows: it.cnt || 1,
      color: it.color || '',
      at: new Date(it.t || Date.now()).toLocaleString('ar-SY')
    };
  });
}

/** أسماء أوراق ملف الإدارة بأمان (يستخدم getAdminSheets إن وُجد) */
function getAdminSheetsSafe(){
  try {
    var arr = (typeof getAdminSheets === 'function') ? getAdminSheets() : null;
    if (Array.isArray(arr)) return arr;
  } catch(_){}
  var cfg = getConfig_();
  var adSS = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
  return adSS.getSheets().map(function(sh){ return sh.getName(); });
}

/** مساعد: ابحث عن ID في أي ورقة داخل ملف الإدارة (عمود A) */
function findIdInAnyAdminSheet_(ss, id){
  id = String(id||'').trim();
  if (!id) return null;
  var sheets = ss.getSheets();
  for (var s=0; s<sheets.length; s++){
    var sh = sheets[s];
    var lr = sh.getLastRow();
    if (lr < 1) continue;
    var colA = sh.getRange(1,1,lr,1).getDisplayValues();
    for (var i=0; i<lr; i++){
      if (String(colA[i][0]||'').trim() === id) {
        return { sheet: sh, row: i+1 };
      }
    }
  }
  return null;
}

/**
 * نقل كامل (قص-لصق) من/إلى وبالعكس — يمنع التكرار ويحفظ اللون
 * picks: [{id, from?}]  — لو from غير موجود، نبحث في كل الأوراق
 * targetSheetName: اسم الورقة الهدف
 * overrideHex: لون مخصّص (اختياري)
 */
function moveFromLog(picks, targetSheetName, overrideHex){
  try {
    picks = Array.isArray(picks) ? picks : [];
    targetSheetName = String(targetSheetName||'').trim();
    overrideHex     = String(overrideHex||'').trim();

    if (!picks.length)    return { ok:false, message:'لا يوجد عناصر للنقل' };
    if (!targetSheetName) return { ok:false, message:'اختر ورقة الهدف' };

    var cfg  = getConfig_();
    var ss   = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
    var tgSh = ss.getSheetByName(targetSheetName);
    if (!tgSh) return { ok:false, message:'ورقة الهدف غير موجودة: '+targetSheetName };

    // IDs الموجودة مسبقًا بالهدف
    var targetIdSet = (function(){
      var set = Object.create(null);
      var lr = tgSh.getLastRow();
      if (lr > 0){
        var a = tgSh.getRange(1,1,lr,1).getDisplayValues();
        for (var i=0;i<lr;i++){ var v=(a[i][0]||'').trim(); if(v) set[v]=1; }
      }
      return set;
    })();

    var moved=0, skipped=0, skippedSameSheet=0, skippedExists=0, errors=0;

    picks.forEach(function(p){
      try{
        var id   = String((p && p.id) || '').trim();
        var from = String((p && p.from) || '').trim(); // اختياري
        if (!id) { skipped++; return; }

        var srcSh, rowIdx;

        if (from){
          srcSh = ss.getSheetByName(from);
          if (!srcSh){ skipped++; return; }
          var lr  = srcSh.getLastRow(); if (lr<1){ skipped++; return; }
          var colA = srcSh.getRange(1,1,lr,1).getDisplayValues();
          rowIdx = -1;
          for (var i=0;i<lr;i++){ if (String(colA[i][0]||'').trim()===id){ rowIdx=i+1; break; } }
          if (rowIdx === -1){ skipped++; return; }
        } else {
          var hit = findIdInAnyAdminSheet_(ss, id);
          if (!hit){ skipped++; return; }
          srcSh  = hit.sheet;
          rowIdx = hit.row;
          from   = srcSh.getName();
        }

        if (from === targetSheetName){ skippedSameSheet++; return; }
        if (targetIdSet[id]) { skippedExists++; return; }

        var lastCol = srcSh.getLastColumn();
        var rngRow  = srcSh.getRange(rowIdx,1,1,lastCol);
        var vals    = rngRow.getValues()[0];

        // لون الصف الأصلي
        var srcColor = (function(){
          try {
            var rowBgs = rngRow.getBackgrounds()[0] || [];
            for (var k=0;k<rowBgs.length;k++){
              var c = (rowBgs[k]||'').toString().toLowerCase();
              if (c && c!=='#ffffff' && c!=='#fff' && c!=='transparent') return rowBgs[k];
            }
            var ca = (srcSh.getRange(rowIdx,1,1,1).getBackground()||'').toLowerCase();
            return (ca && ca!=='transparent') ? ca : '';
          } catch(e){ return ''; }
        })();

        var useColor = overrideHex || srcColor;

        // لصق في الهدف
        var destRow = tgSh.getLastRow() + 1;
        tgSh.appendRow(vals);
        if (useColor){
          var lastColTarget = tgSh.getLastColumn();
          tgSh.getRange(destRow,1,1,lastColTarget).setBackground(useColor);
        }
        targetIdSet[id] = 1;

        // حذف من المصدر (قص فعلي)
        srcSh.deleteRow(rowIdx);

        moved++;

        // سجل العملية
        try { logCopyOperation(tgSh.getName(), destRow, 1, (useColor||''), id); } catch(_){}

      } catch(e){ errors++; }
    });

    SpreadsheetApp.flush();

    var parts=[];
    parts.push('تم النقل: '+moved);
    if (skippedExists)    parts.push('موجود مسبقًا: '+skippedExists);
    if (skippedSameSheet) parts.push('نفس الورقة: '+skippedSameSheet);
    if (skipped)          parts.push('تخطي: '+skipped);
    if (errors)           parts.push('أخطاء: '+errors);

    return { ok:true, message: parts.join(' • '), moved:moved, skipped:skipped, skippedExists:skippedExists, skippedSameSheet:skippedSameSheet, errors:errors };

  } catch(e){
    return { ok:false, message:'خطأ: '+e.message };
  }
}

/** Helper to include partial HTML files in templates */
function listSheets() {
  const cfg = getConfig_();
  const adSS = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
  return adSS.getSheets().map(sh => sh.getName());
}

function createSheetIfMissing(name) {
  name = String(name || '').trim();
  if (!name) throw new Error('⚠️ اكتب اسم ورقة');
  const cfg = getConfig_();
  const adSS = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
  let sh = adSS.getSheetByName(name);
  if (!sh) {
    sh = adSS.insertSheet(name);
  }
  return { ok:true, name: sh.getName() };
}

function getBulkSheetLists() {
  try {
    const cfg = getConfig_();
    const localSheets = listSheets();
    let externalSheets = [];
    let externalDefault = '';
    let externalFileName = '';
    let externalEnabled = false;
    let externalError = '';

    try {
      const links = getExternalSheetLinksFromSettings();
      const adminInfo = links.admin || {};
      if (adminInfo.url) {
        const extSS = SpreadsheetApp.openByUrl(adminInfo.url);
        externalSheets = extSS.getSheets().map(sh => sh.getName());
        externalDefault = String(adminInfo.sheetName || '').trim();
        externalFileName = extSS.getName();
        externalEnabled = true;
      }
    } catch (err) {
      externalError = err && err.message ? err.message : String(err || '');
    }

    return {
      ok: true,
      localSheets: localSheets,
      localDefault: cfg.ADMIN_SHEET_NAME,
      externalSheets: externalSheets,
      externalDefault: externalDefault,
      externalEnabled: externalEnabled,
      externalFileName: externalFileName,
      externalError: externalError
    };
  } catch (err) {
    return { ok:false, message: err && err.message ? err.message : String(err || '') };
  }
}

function createExternalSheetIfMissing(name) {
  name = String(name || '').trim();
  if (!name) throw new Error('⚠️ اكتب اسم ورقة');
  const links = getExternalSheetLinksFromSettings();
  const adminInfo = links.admin || {};
  if (!adminInfo.url) throw new Error('⚠️ لم يتم إعداد ملف الإدارة الخارجي.');
  const extSS = SpreadsheetApp.openByUrl(adminInfo.url);
  let sh = extSS.getSheetByName(name);
  if (!sh) {
    sh = extSS.insertSheet(name);
  }
  return { ok:true, name: sh.getName() };
}

function normalizeBulkScope_(scope) {
  const s = String(scope || '').trim().toLowerCase();
  if (s === 'agent') return 'agent';
  return 'all';
}

function buildBulkContext_(scope) {
  const cache = CacheService.getScriptCache();
  const agentIndexRaw   = cacheGetChunked_(KEY_AGENT_INDEX,   cache);
  const adminIdSetRaw   = cacheGetChunked_(KEY_ADMIN_IDSET,   cache);
  const adminRowMapRaw  = cacheGetChunked_(KEY_ADMIN_ROW_MAP, cache);
  const coloredAgentRaw = cacheGetChunked_(KEY_COLORED_AGENT, cache);
  const coloredAdminRaw = cacheGetChunked_(KEY_COLORED_ADMIN, cache);
  const corrMapRaw      = cacheGetChunked_(KEY_CORR_MAP,      cache);

  const ctx = {
    agentIndex:   agentIndexRaw   || {},
    adminIdSet:   adminIdSetRaw   || {},
    adminRowMap:  adminRowMapRaw  || {},
    coloredAgent: coloredAgentRaw || {},
    coloredAdmin: coloredAdminRaw || {},
    corrMap:      corrMapRaw      || {},
    hasCoreData:  !!(agentIndexRaw && adminIdSetRaw && coloredAgentRaw && coloredAdminRaw),
    hasExternalData: false
  };

  if (scope === 'all') {
    const ext = loadExternalData_({ fromCacheOnly: true });
    if (ext && ext.ready) {
      ctx.extAgentIndex   = ext.agentIndex   || {};
      ctx.extAdminIdSet   = ext.adminIdSet   || {};
      ctx.extAdminRowMap  = ext.adminRowMap  || {};
      ctx.extColoredAgent = ext.coloredAgent || {};
      ctx.extColoredAdmin = ext.coloredAdmin || {};
      ctx.hasExternalData = true;
    } else {
      ctx.extAgentIndex   = {};
      ctx.extAdminIdSet   = {};
      ctx.extAdminRowMap  = {};
      ctx.extColoredAgent = {};
      ctx.extColoredAdmin = {};
    }
  }

  return ctx;
}

function classifyBulkId_(id, ctx, scope) {
  const out = {
    id: String(id || '').trim(),
    status: 'غير موجود',
    total: 0,
    names: [],
    rowsCount: 0,
    inAgent: false,
    inAdmin: false,
    coloredAgent: false,
    coloredAdmin: false,
    duplicateLabel: null,
    source: 'none'
  };

  if (!out.id) return out;

  const localAgent = ctx.agentIndex[out.id];
  const extAgent   = (scope === 'all' && ctx.extAgentIndex) ? ctx.extAgentIndex[out.id] : null;
  const agentNode  = localAgent || extAgent || null;
  out.rowsCount    = agentNode && Array.isArray(agentNode.rows) ? agentNode.rows.length : 0;
  out.names        = agentNode && Array.isArray(agentNode.names) ? agentNode.names.slice() : [];
  out.total        = Number(agentNode && agentNode.sum ? agentNode.sum : 0);
  out.inAgent      = !!agentNode;
  if (localAgent) out.source = 'local-agent';
  else if (extAgent) out.source = 'external-agent';

  let adminRows = ctx.adminRowMap[out.id] || [];
  if (!adminRows.length && scope === 'all' && ctx.extAdminRowMap) {
    adminRows = ctx.extAdminRowMap[out.id] || [];
    if (adminRows.length && out.source === 'none') out.source = 'external-admin';
  } else if (adminRows.length && out.source === 'none') {
    out.source = 'local-admin';
  }

  out.inAdmin = adminRows.length > 0;

  if (out.inAgent) {
    if (out.inAdmin) {
      out.status = (out.rowsCount > 1) ? 'سحب وكالة - راتبين' : 'سحب وكالة';
    } else {
      out.status = (out.rowsCount > 1) ? 'راتبين' : 'وكالة';
    }
  } else if (out.inAdmin) {
    out.status = 'ادارة';
  }

  out.coloredAgent = !!(ctx.coloredAgent[out.id] || (scope === 'all' && ctx.extColoredAgent && ctx.extColoredAgent[out.id]));
  out.coloredAdmin = !!(ctx.coloredAdmin[out.id] || (scope === 'all' && ctx.extColoredAdmin && ctx.extColoredAdmin[out.id]));

  if (out.coloredAgent && out.coloredAdmin) {
    out.duplicateLabel = 'مكرر';
  } else if (out.coloredAgent) {
    out.duplicateLabel = 'مكرر وكالة فقط';
  } else if (out.coloredAdmin) {
    out.duplicateLabel = 'مكرر ادارة فقط';
  }

  return out;
}

function queueColorRows_(bucket, colorHex, rows) {
  if (!bucket || !Array.isArray(rows) || !rows.length) return;
  const key = String(colorHex || '#ddd6fe');
  if (!bucket[key]) bucket[key] = [];
  Array.prototype.push.apply(bucket[key], rows);
}

function groupRowObjectsBySheet_(rows) {
  const grouped = Object.create(null);
  if (!Array.isArray(rows)) return grouped;
  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i];
    if (!entry) continue;
    const sheetName = String(entry.sheet || entry.sheetName || '').trim();
    const rowNumber = Number(entry.row || entry.rowIndex || 0);
    if (!sheetName || !rowNumber) continue;
    if (!grouped[sheetName]) grouped[sheetName] = [];
    grouped[sheetName].push(rowNumber);
  }
  return grouped;
}

function queueExternalRows_(bucketBySheet, colorHex, rowObjects) {
  if (!bucketBySheet || !Array.isArray(rowObjects) || !rowObjects.length) return;
  const grouped = groupRowObjectsBySheet_(rowObjects);
  const sheets = Object.keys(grouped);
  for (let i = 0; i < sheets.length; i++) {
    const sheetName = sheets[i];
    if (!bucketBySheet[sheetName]) bucketBySheet[sheetName] = Object.create(null);
    queueColorRows_(bucketBySheet[sheetName], colorHex, grouped[sheetName]);
  }
}

function copyAdminRowOnce_(adSh, adRows, tgSh, colorHex, targetIdSet, recentCopied) {
  if (!tgSh || !adSh || !Array.isArray(adRows) || !adRows.length) {
    return { copied:0, skipped:0 };
  }
  const res = { copied:0, skipped:0 };
  const adLastCol = adSh.getLastColumn();
  for (let i = 0; i < adRows.length; i++) {
    const rowIdx = adRows[i];
    const vals = adSh.getRange(rowIdx, 1, 1, adLastCol).getValues()[0];
    const curIdFromRow = String(vals[0] || '').trim();
    if (!curIdFromRow) { res.skipped++; continue; }
    if (alreadyCopied_(curIdFromRow, tgSh)) { res.skipped++; continue; }
    if (targetIdSet && targetIdSet[curIdFromRow]) { res.skipped++; continue; }
    if (recentCopied && recentCopied[curIdFromRow]) { res.skipped++; continue; }

    const destRow = tgSh.getLastRow() + 1;
    tgSh.appendRow(vals);
    const lastColTarget = tgSh.getLastColumn() || adLastCol;
    if (colorHex) {
      tgSh.getRange(destRow, 1, 1, lastColTarget).setBackground(colorHex);
    }

    if (targetIdSet) targetIdSet[curIdFromRow] = 1;
    if (recentCopied) recentCopied[curIdFromRow] = 1;

    try { logCopyOperation(tgSh.getName(), destRow, 1, colorHex || '', curIdFromRow); } catch(_) {}

    res.copied = 1;
    break;
  }
  return res;
}

function bulkSearchExact(ids, discount, scope) {
  try {
    if (!Array.isArray(ids)) throw new Error('⚠️ صيغة القائمة غير صحيحة.');
    const list = ids.map(v => String(v || '').trim()).filter(Boolean);
    if (!list.length) throw new Error('⚠️ لا يوجد IDs للبحث.');

    const p = Math.max(0, Math.min(100, Number(discount) || 0));
    scope = normalizeBulkScope_(scope);
    const ctx = buildBulkContext_(scope);
    if (!ctx.hasCoreData) {
      throw new Error('⚠️ حمّل البيانات أولًا من زر "تحميل البيانات".');
    }
    if (scope === 'all' && !ctx.hasExternalData) {
      throw new Error('⚠️ حمّل البيانات الخارجية أولًا من زر "تحميل البيانات".');
    }

    const results = [];
    for (let i = 0; i < list.length; i++) {
      const info = classifyBulkId_(list[i], ctx, scope);
      const disc = info.total * (p / 100);
      const aft  = info.total - disc;
      results.push({
        id: info.id,
        salary: Number(info.total || 0),
        salaryAfterDiscount: Number(aft || 0),
        discountAmount: Number(disc || 0),
        state: info.status,
        duplicateLabel: info.duplicateLabel,
        colored: !!(info.coloredAgent || info.coloredAdmin),
        coloredAgent: !!info.coloredAgent,
        coloredAdmin: !!info.coloredAdmin,
        inAgent: !!info.inAgent,
        inAdmin: !!info.inAdmin,
        rowsCount: Number(info.rowsCount || 0),
        names: info.names || [],
        source: info.source || 'none'
      });
    }

    return { ok:true, results: results };
  } catch (e) {
    return { ok:false, message: e.message };
  }
}

function bulkExecuteExact(ids, config) {
  try {
    if (!Array.isArray(ids)) throw new Error('⚠️ لا يوجد IDs للتنفيذ.');
    const list = ids.map(v => String(v || '').trim()).filter(Boolean);
    if (!list.length) throw new Error('⚠️ لا يوجد IDs صالحة للتنفيذ.');

    config = config || {};
    const scope = normalizeBulkScope_(config.scope);
    const includeExternal = scope === 'all';
    const targetMode = String(config.targetMode || (scope === 'agent' ? 'agent' : 'both')).toLowerCase();
    const doAdminOps = targetMode !== 'agent';
    const externalSheetName = includeExternal ? String(config.externalSheetName || '').trim() : '';

    const cache = CacheService.getScriptCache();
    const ctx = buildBulkContext_(includeExternal ? 'all' : 'both');
    if (!ctx.hasCoreData) {
      throw new Error('⚠️ حمّل البيانات أولًا من زر "تحميل البيانات".');
    }
    if (includeExternal && !ctx.hasExternalData) {
      throw new Error('⚠️ حمّل البيانات الخارجية أولًا من زر "تحميل البيانات".');
    }
    const cfg = getConfig_();

    const agSS = SpreadsheetApp.openById(cfg.AGENT_SHEET_ID);
    const agSh = agSS.getSheetByName(cfg.AGENT_SHEET_NAME);
    if (!agSh) throw new Error('⚠️ لم يتم العثور على ورقة الوكيل.');
    const adSS = SpreadsheetApp.openById(cfg.ADMIN_SHEET_ID);
    const adSh = adSS.getSheetByName(cfg.ADMIN_SHEET_NAME);
    if (!adSh) throw new Error('⚠️ لم يتم العثور على ورقة الإدارة.');

    let tgSh = null;
    const targetIdSet = Object.create(null);
    if (doAdminOps) {
      const sheetName = String(config.sheetName || '').trim();
      if (!sheetName) throw new Error('⚠️ اختر ورقة الهدف أولاً');
      tgSh = adSS.getSheetByName(sheetName) || adSS.insertSheet(sheetName);
      const lr = tgSh.getLastRow();
      if (lr > 0) {
        const colA = tgSh.getRange(1, 1, lr, 1).getDisplayValues();
        for (let i = 0; i < lr; i++) {
          const val = String(colA[i][0] || '').trim();
          if (val) targetIdSet[val] = 1;
        }
      }
    }

    const withdrawColor = String(config.withdrawColor || config.color || '#ddd6fe');
    const adminColor    = String(config.adminColor    || config.color || '#fde68a');

    const coloredAgent = cacheGetChunked_(KEY_COLORED_AGENT, cache) || {};
    const coloredAdmin = cacheGetChunked_(KEY_COLORED_ADMIN, cache) || {};

    const agentColorBucket = Object.create(null);
    const adminColorBucket = Object.create(null);
    const coloredSet = new Set();
    const recentCopied = Object.create(null);
    let copiedLocal = 0;
    let skippedLocal = 0;

    let extAdSS = null;
    let extAdSheets = null;
    let extAgSheets = null;
    let extTargetSh = null;
    let extAdminColorBucket = null;
    let extAgentColorBucket = null;
    let extTargetColorBucket = null;
    const extTargetIdRows = Object.create(null);
    let extColoredAdmin = {};
    let extColoredAgent = {};
    let copiedExternal = 0;
    let skippedExternal = 0;

    if (includeExternal) {
      const links = getExternalSheetLinksFromSettings();
      const adminInfo = links.admin || {};
      if (!adminInfo.url) throw new Error('⚠️ لم يتم إعداد ملف الإدارة الخارجي.');
      extAdSS = SpreadsheetApp.openByUrl(adminInfo.url);
      const extAdSheetsList = extAdSS.getSheets();
      if (!extAdSheetsList || !extAdSheetsList.length) {
        throw new Error('⚠️ لم يتم العثور على أي ورقة في الملف الخارجي للإدارة.');
      }
      extAdSheets = Object.create(null);
      for (let i = 0; i < extAdSheetsList.length; i++) {
        const sh = extAdSheetsList[i];
        if (sh) extAdSheets[sh.getName()] = sh;
      }
      extAdminColorBucket = Object.create(null);
      extColoredAdmin = cacheGetChunked_(KEY_EXT_COLORED_ADMIN, cache) || {};

      const agentInfo = links.agent || {};
      if (agentInfo.url) {
        const extAgSSObj = SpreadsheetApp.openByUrl(agentInfo.url);
        const extAgSheetsList = extAgSSObj.getSheets();
        if (!extAgSheetsList || !extAgSheetsList.length) {
          throw new Error('⚠️ لم يتم العثور على أي ورقة في الملف الخارجي للوكيل.');
        }
        extAgSheets = Object.create(null);
        for (let i = 0; i < extAgSheetsList.length; i++) {
          const sh = extAgSheetsList[i];
          if (sh) extAgSheets[sh.getName()] = sh;
        }
        extAgentColorBucket = Object.create(null);
        extColoredAgent = cacheGetChunked_(KEY_EXT_COLORED_AGENT, cache) || {};
      } else {
        extColoredAgent = cacheGetChunked_(KEY_EXT_COLORED_AGENT, cache) || {};
      }

      if (externalSheetName) {
        extTargetSh = extAdSS.getSheetByName(externalSheetName) || extAdSS.insertSheet(externalSheetName);
        extTargetColorBucket = Object.create(null);
        const lr = extTargetSh.getLastRow();
        if (lr > 0) {
          const colA = extTargetSh.getRange(1, 1, lr, 1).getDisplayValues();
          for (let i = 0; i < lr; i++) {
            const val = String(colA[i][0] || '').trim();
            if (!val) continue;
            if (!extTargetIdRows[val]) extTargetIdRows[val] = [];
            extTargetIdRows[val].push(i + 1);
          }
        }
      }
    }

    const copyToLocalTarget = (colorHex, localRows, externalRows) => {
      const result = { localCopied: 0, localSkipped: 0, externalCopied: 0, externalSkipped: 0 };
      if (!doAdminOps || !tgSh) return result;

      if (localRows.length) {
        const localRes = copyAdminRowOnce_(adSh, localRows, tgSh, colorHex, targetIdSet, recentCopied);
        result.localCopied += localRes.copied;
        result.localSkipped += localRes.skipped;
      }

      if (!result.localCopied && includeExternal && externalRows.length) {
        const grouped = groupRowObjectsBySheet_(externalRows);
        const sheetNames = Object.keys(grouped);
        for (let i = 0; i < sheetNames.length; i++) {
          if (result.externalCopied) break;
          const sheetName = sheetNames[i];
          const sheet = extAdSheets ? extAdSheets[sheetName] : null;
          if (!sheet) continue;
          const extRes = copyAdminRowOnce_(sheet, grouped[sheetName], tgSh, colorHex, targetIdSet, recentCopied);
          result.externalCopied += extRes.copied;
          result.externalSkipped += extRes.skipped;
        }
      }

      return result;
    };

    const colorExternalTarget = (colorHex, id) => {
      if (!includeExternal || !extTargetSh || !colorHex) return false;
      const rows = extTargetIdRows[id];
      if (!rows || !rows.length) return false;
      queueColorRows_(extTargetColorBucket, colorHex, rows);
      return true;
    };

    list.forEach(id => {
      const localAgent = ctx.agentIndex[id];
      const extAgent   = includeExternal && ctx.extAgentIndex ? ctx.extAgentIndex[id] : null;
      const agRowsLocal = (localAgent && localAgent.rows) || [];
      const agRowsExt   = (extAgent && extAgent.rows) || [];

      const adRowsLocal = ctx.adminRowMap[id] || [];
      const adRowsExt   = includeExternal && ctx.extAdminRowMap ? (ctx.extAdminRowMap[id] || []) : [];

      const hasAgent = agRowsLocal.length || agRowsExt.length;
      const hasAdmin = adRowsLocal.length || adRowsExt.length;
      if (!hasAgent && !hasAdmin) return;

      const totalAgentRows = agRowsLocal.length + agRowsExt.length;
      let status;
      if (hasAgent) {
        status = hasAdmin ? (totalAgentRows > 1 ? 'سحب وكالة - راتبين' : 'سحب وكالة')
                          : (totalAgentRows > 1 ? 'راتبين' : 'وكالة');
      } else {
        status = 'ادارة';
      }

      const markColored = () => coloredSet.add(id);

      if (status.indexOf('ادارة') !== -1 && status.indexOf('سحب وكالة') === -1) {
        if (doAdminOps) {
          if (adRowsLocal.length && !coloredAdmin[id]) {
            queueColorRows_(adminColorBucket, adminColor, adRowsLocal);
            coloredAdmin[id] = 1;
            markColored();
          }
          if (includeExternal && adRowsExt.length && extAdminColorBucket && !extColoredAdmin[id]) {
            queueExternalRows_(extAdminColorBucket, adminColor, adRowsExt);
            extColoredAdmin[id] = 1;
            markColored();
          }

          const resLocal = copyToLocalTarget(adminColor, adRowsLocal, adRowsExt);
          const totalCopied = resLocal.localCopied + resLocal.externalCopied;
          if (totalCopied) markColored();
          copiedLocal += resLocal.localCopied;
          skippedLocal += resLocal.localSkipped;
          copiedExternal += resLocal.externalCopied;
          skippedExternal += resLocal.externalSkipped;

          if (includeExternal) {
            if (colorExternalTarget(adminColor, id)) {
              markColored();
            }
          }
        }
      }

      if (status.indexOf('سحب وكالة') !== -1 || status.indexOf('وكالة') !== -1) {
        if (agRowsLocal.length && !coloredAgent[id]) {
          queueColorRows_(agentColorBucket, withdrawColor, agRowsLocal);
          coloredAgent[id] = 1;
          markColored();
        }
        if (includeExternal && agRowsExt.length && extAgentColorBucket && !extColoredAgent[id]) {
          queueExternalRows_(extAgentColorBucket, withdrawColor, agRowsExt);
          extColoredAgent[id] = 1;
          markColored();
        }

        if (doAdminOps) {
          if (adRowsLocal.length && !coloredAdmin[id]) {
            queueColorRows_(adminColorBucket, withdrawColor, adRowsLocal);
            coloredAdmin[id] = 1;
            markColored();
          }
          if (includeExternal && adRowsExt.length && extAdminColorBucket && !extColoredAdmin[id]) {
            queueExternalRows_(extAdminColorBucket, withdrawColor, adRowsExt);
            extColoredAdmin[id] = 1;
            markColored();
          }

          const resLocal = copyToLocalTarget(withdrawColor, adRowsLocal, adRowsExt);
          const totalCopied = resLocal.localCopied + resLocal.externalCopied;
          if (totalCopied) markColored();
          copiedLocal += resLocal.localCopied;
          skippedLocal += resLocal.localSkipped;
          copiedExternal += resLocal.externalCopied;
          skippedExternal += resLocal.externalSkipped;

          if (includeExternal) {
            if (colorExternalTarget(withdrawColor, id)) {
              markColored();
            }
          }
        }
      }
    });

    for (const color in agentColorBucket) {
      colorRowsFast_(agSh, agentColorBucket[color], color);
    }
    for (const color in adminColorBucket) {
      colorRowsFast_(adSh, adminColorBucket[color], color);
    }

    if (includeExternal) {
      if (extAgentColorBucket && extAgSheets) {
        for (const sheetName in extAgentColorBucket) {
          if (!Object.prototype.hasOwnProperty.call(extAgentColorBucket, sheetName)) continue;
          const sheet = extAgSheets[sheetName];
          if (!sheet) continue;
          const colorsMap = extAgentColorBucket[sheetName];
          for (const color in colorsMap) {
            colorRowsFast_(sheet, colorsMap[color], color);
          }
        }
      }
      if (extAdminColorBucket && extAdSheets) {
        for (const sheetName in extAdminColorBucket) {
          if (!Object.prototype.hasOwnProperty.call(extAdminColorBucket, sheetName)) continue;
          const sheet = extAdSheets[sheetName];
          if (!sheet) continue;
          const colorsMap = extAdminColorBucket[sheetName];
          for (const color in colorsMap) {
            colorRowsFast_(sheet, colorsMap[color], color);
          }
        }
      }
      if (extTargetColorBucket && extTargetSh) {
        for (const color in extTargetColorBucket) {
          colorRowsFast_(extTargetSh, extTargetColorBucket[color], color);
        }
      }
      if (extTargetColorBucket && extTargetSh) {
        for (const color in extTargetColorBucket) {
          colorRowsFast_(extTargetSh, extTargetColorBucket[color], color);
        }
      }
    }

    SpreadsheetApp.flush();

    cachePutChunked_(KEY_COLORED_AGENT, coloredAgent, cache);
    cachePutChunked_(KEY_COLORED_ADMIN, coloredAdmin, cache);
    if (includeExternal) {
      cachePutChunked_(KEY_EXT_COLORED_AGENT, extColoredAgent, cache);
      cachePutChunked_(KEY_EXT_COLORED_ADMIN, extColoredAdmin, cache);
    }

    return {
      ok: true,
      coloredIds: Array.from(coloredSet),
      copied: copiedLocal + copiedExternal,
      skipped: skippedLocal + skippedExternal,
      copiedExternal: copiedExternal,
      skippedExternal: skippedExternal
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function include(name){
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}


/** Open the UI inside Sheets sidebar */
function openSidebar(){
  var ui = SpreadsheetApp.getUi();
  var html = HtmlService.createTemplateFromFile('Sidebar').evaluate()
    .setTitle('أداة البحث');
  ui.showSidebar(html);
}/** 🔒 حارس يمنع نسخ صف مكرر:
 *   - يتحقق من وجود الـID أصلاً في ورقة الهدف
 *   - يمنع نسخ نفس الـID أكثر من مرة
 */
function alreadyCopied_(id, tgSh) {
  try {
    if (!id || !tgSh) return true; // لا تتابع إذا مافي ID أو ورقة
    id = String(id).trim();
    if (!id) return true;

    // اقرأ العمود A كله كـقيم
    const lr = tgSh.getLastRow();
    if (lr < 1) return false;

    const colA = tgSh.getRange(1,1,lr,1).getDisplayValues();
    for (let i=0; i<lr; i++){
      if ((colA[i][0]||'').trim() === id){
        return true; // ✅ موجود بالفعل
      }
    }
    return false; // مش موجود → ممكن نسخه
  } catch(e){
    return true; // أي خطأ = اعتبره موجود لتجنّب التكرار
  }
}
