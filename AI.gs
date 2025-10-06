/***** === AI Local Helpers (No external APIs) === *****/

// تطبيع ID: أرقام عربية -> لاتينية + حذف محارف مخفية + trim
function aiNormalizeId(v){
  var s = String(v == null ? '' : v);
  var arabic = '٠١٢٣٤٥٦٧٨٩';
  var out = '';
  for (var i=0;i<s.length;i++){
    var ch = s[i], idx = arabic.indexOf(ch);
    out += (idx >= 0) ? String(idx) : ch;
  }
  return out.replace(/\u200B|\u200C|\u200D|\uFEFF/g,'').trim();
}

// مسافة Levenshtein (سريعة ومبسطة للأرقام)
function aiLev(a, b){
  a = String(a||''); b = String(b||'');
  var m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  var dp = new Array(n+1);
  for (var j=0;j<=n;j++) dp[j]=j;
  for (var i=1;i<=m;i++){
    var prev=i-1, cur= i;
    var ai=a.charCodeAt(i-1);
    for (var j=1;j<=n;j++){
      var tmp = dp[j];
      var cost = (ai===b.charCodeAt(j-1)) ? 0 : 1;
      dp[j] = Math.min(
        dp[j]+1,     // حذف من b
        cur+1,       // إضافة لـ b
        prev+cost    // استبدال
      );
      prev = tmp; cur = dp[j];
    }
  }
  return dp[n];
}

// نبني فهرس IDs من الكاش الحالي (وكيل + إدارة)
function aiBuildIndex_(){
  var cache = CacheService.getScriptCache();
  var agentIndex  = cacheGetChunked_(KEY_AGENT_INDEX,   cache) || {};
  var adminRowMap = cacheGetChunked_(KEY_ADMIN_ROW_MAP, cache) || {};

  var map = {}; // id -> {inAgent, inAdmin}
  Object.keys(agentIndex).forEach(function(id){ map[id] = { inAgent:true, inAdmin:false }; });
  Object.keys(adminRowMap).forEach(function(id){
    if (!map[id]) map[id] = { inAgent:false, inAdmin:true };
    else map[id].inAdmin = true;
  });
  return map;
}

/**
 * اقتراح أقرب IDs
 * @param {string} query  الإدخال الخام
 * @param {number} k      عدد الاقتراحات (افتراضي 5)
 * @return {Object} { ok, items:[{id, score, source}] }
 */
function aiSuggestIds(query, k){
  try{
    k = Math.max(1, Math.min(10, Number(k||5)));
    var q = aiNormalizeId(query);
    if (!q) return { ok:true, items: [] };

    var index = aiBuildIndex_();
    var ids = Object.keys(index);
    // مرشّح أولي سريع: نفس الطول ±1، أو يبدأ/ينتهي بـ q
    var cand = [];
    for (var i=0;i<ids.length;i++){
      var id = ids[i];
      var n  = id.length, m = q.length;
      if (Math.abs(n - m) <= 1 || id.indexOf(q) === 0 || q.indexOf(id) === 0) cand.push(id);
    }
    if (cand.length === 0) cand = ids; // fallback

    // احسب مسافة التشابه ودرّب نقاط أبسط: score أصغر أفضل
    var scored = cand.slice(0, 8000).map(function(id){
      var d = aiLev(q, id);
      var src = index[id];
      // خصم بسيط إذا تطابق الطول/البادئة
      if (id.length === q.length) d -= 0.2;
      if (id.indexOf(q) === 0)   d -= 0.3;
      return { id:id, dist:d, src: src };
    }).sort(function(a,b){ return a.dist - b.dist; });

    var items = [];
    for (var j=0; j<scored.length && items.length<k; j++){
      var it = scored[j];
      var label = it.src.inAgent && it.src.inAdmin ? 'الوكيل + الإدارة' :
                  it.src.inAgent ? 'الوكيل' : 'الإدارة';
      items.push({ id: it.id, score: Math.max(0, it.dist), source: label });
    }
    return { ok:true, items: items };
  }catch(e){
    return { ok:false, message: e.message || String(e) };
  }
}
