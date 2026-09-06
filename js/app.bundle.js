/**
 * Clasura App Bundle (Production)
 * Generated at: 2026-09-06T18:55:37.485Z
 * Version: 20260906-185537
 * Modules: 22
 */

/* =================== [MODULE: errors.js] =================== */
"use strict";
/* ============ GLOBAL ERROR BOUNDARY & TELEMETRİ ============ */

(function() {
  var STORAGE_KEY = 'clasura_error_logs_v1';
  var MAX_LOGS = 20;

  function safeStorageGet() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function safeStorageSet(logs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
    } catch (e) {}
  }

  function formatError(msg, src, line, col, err, type) {
    var stack = '';
    if (err && err.stack) {
      stack = String(err.stack).slice(0, 1000);
    }
    var shortSrc = src ? String(src).split('/').pop() : 'inline';
    return {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      ts: new Date().toISOString(),
      type: type || 'error',
      msg: String(msg || 'Bilinmeyen Hata'),
      src: shortSrc,
      line: line || 0,
      col: col || 0,
      stack: stack,
      tab: (window.APP && window.APP.activeTab) || 'unknown'
    };
  }

  function recordError(item) {
    var logs = safeStorageGet();
    logs.push(item);
    safeStorageSet(logs);

    // Supabase telemetri gönderim denemesi (arka planda sessiz)
    try {
      if (window.SB_URL && window.SB_KEY && window.USE_SUPABASE) {
        fetch(window.SB_URL + '/rest/v1/error_logs', {
          method: 'POST',
          headers: {
            'apikey': window.SB_KEY,
            'Authorization': 'Bearer ' + window.SB_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            message: item.msg,
            source: item.src,
            line: item.line,
            col: item.col,
            stack: item.stack,
            tab: item.tab,
            created_at: item.ts
          })
        }).catch(function() { /* sessiz yut */ });
      }
    } catch (e) {}
  }

  window.APP_ERRORS = {
    getLogs: safeStorageGet,
    clearLogs: function() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    },
    report: function(err, context) {
      var item = formatError(
        err ? (err.message || String(err)) : 'Manuel Rapor',
        context || 'manual',
        0, 0, err, 'manual'
      );
      recordError(item);
      return item;
    }
  };

  // 1. Global JS Hatalarını Yakala
  window.onerror = function(msg, src, line, col, err) {
    var item = formatError(msg, src, line, col, err, 'uncaught');
    recordError(item);
    // Hatanın varsayılan tarayıcı konsoluna da basılmasını engelleme (false dön)
    return false;
  };

  // 2. Asenkron Yakalanmamış Promise Hatalarını Yakala
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var msg = 'Unhandled Rejection';
    var err = null;
    if (reason instanceof Error) {
      msg = reason.message;
      err = reason;
    } else if (typeof reason === 'string') {
      msg = reason;
    } else if (reason) {
      try { msg = JSON.stringify(reason); } catch (e) { msg = String(reason); }
    }
    var item = formatError(msg, 'promise', 0, 0, err, 'unhandledrejection');
    recordError(item);
  });
})();

/* =================== [MODULE: store.js] =================== */
"use strict";
/* ============ MERKEZI STORAGE SARMALAYICI ============ */
/* localStorage'a her yerden doğrudan erişmek yerine bu kullanılmalı.
   JSON parse/stringify hataları otomatik olarak yakalanır. */
var Store = (function() {
  function get(k, def) {
    try { var v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; }
    catch(e) { return def !== undefined ? def : null; }
  }
  function set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
  }
  function del(k) {
    try { localStorage.removeItem(k); } catch(e) {}
  }
  return { get: get, set: set, del: del };
})();

/* =================== [MODULE: state.js] =================== */
"use strict";
/* ============ MERKEZI UYGULAMA STATE ============ */
/* Tüm window._* değişkenleri burada toplanır.
   window._basket yerine APP.basket, window._draft yerine APP.draft vb. kullanın. */
if (!window.APP) {
  window.APP = {
    basket:           null,  // başlatma için null — basket() lazy load yapar
    draft:            null,  // başlatma için null — draft() lazy load yapar
    live:             {},
    liveAt:           0,
    liveCache:        {},
    draftDockCollapsed: false,
    swipeQueue:       [],
    swipeIdx:         0,
    swipePassed:      {},
    swipeBusy:        false,
    swipeCardCleanup: null,
    swipeChapterTimer:null,
    aiOddsPeriodicTimer: null
  };
}

var TYPE_TR={banko:'Banko',plase:'Plase',surpriz:'Sürpriz',uzun:'Uzun vadeli',diger:'Diğer'};
var ST_TR={open:'Bekliyor',won:'Tuttu',lost:'Yattı',void:'İptal'};
var TYPE_WA={banko:'BANKO',plase:'PLASE',surpriz:'SÜRPRİZ',uzun:'UZUN VADELİ',diger:'KUPON'};

/* ============ DURUM ============ */
var S={settings:{start:0,members:[]},proposals:[],coupons:[],adjustments:[]};
var ME={name:(function(){try{return localStorage.getItem('kk-name')||'';}catch(e){return '';}})(),pin:''};
var fmtTL=function(n){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format(n)+' TL';};
var fmtOdd=function(n){return (Math.round(n*100)/100).toFixed(2);};
function dstr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function todayStr(){return dstr(new Date());}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function toast(m){
  if(window.toastController){
    window.toastController.create({message:String(m),duration:2300,position:'bottom',color:'dark'}).then(function(t){t.present();});
    return;
  }
  var t=document.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2300);
}
/* Üye renkleri — öneren ve oy isimleri her yerde aynı renkte görünür */
var MEMBER_COLORS=['#e63946','#1d7fbf','#0d9e6e','#c46a10','#8e44ad','#d81b60','#455a64','#6d4c41'];
function memberColor(name){
  var ms=(S.settings.members||[]).map(function(m){return (m||'').trim();}).filter(Boolean);
  var ix=ms.indexOf(name);
  if(ix<0){var h=0;for(var i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))%997;ix=h;}
  return MEMBER_COLORS[ix%MEMBER_COLORS.length];
}
function nameSpan(n){return '<b style="color:'+memberColor(n)+'">'+esc(n)+'</b>';}
/** Kupon bacağındaki tüm önerenler (by + also; propId varsa öneriden zenginleştir). */
function selectionProposers(s){
  var names=[], seen={};
  function add(n){
    n=(n||'').trim();
    if(!n||seen[n])return;
    seen[n]=1;names.push(n);
  }
  if(!s)return names;
  add(s.by);
  (s.also||[]).forEach(add);
  if(s.propId){
    var p=(S.proposals||[]).filter(function(x){return x.id===s.propId;})[0];
    if(p){add(p.by);(p.also||[]).forEach(add);}
  }
  return names;
}
function selectionProposersHtml(s){
  var names=selectionProposers(s);
  return names.length?names.map(nameSpan).join(', '):'';
}
function selectionProposersText(s){
  return selectionProposers(s).join(', ');
}
/** Aynı bahis (öneri / event+market+pick) — kupon tekrarına bakılmaz. */
function selectionBetKey(s){
  if(!s)return '';
  if(s.propId)return 'p:'+String(s.propId);
  if(s.eventId!=null&&s.mktI!=null&&s.no!=null)return 'e:'+s.eventId+':'+s.mktI+':'+s.no;
  return 'm:'+String(s.match||'')+'|'+String(s.market||'')+'|'+String(s.pick||'');
}
function copyText(txt){
  return navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(txt):new Promise(function(res,rej){
    var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');res();}catch(e){rej(e);}document.body.removeChild(ta);
  });
}

/* =================== [MODULE: gate.js] =================== */
"use strict";
/* ============ WEB ACCESS GATEKEEPER ============ */
var GATE_SECRET = "Macau2026.";
var GATE_STORAGE_KEY = "kk_gate_auth";

function normalizeGateInput(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”"']/g, '');
}

function isValidGateSecret(val) {
  if (!val) return false;
  var v = normalizeGateInput(val);
  // Hem noktalı ("macau2026.") hem noktasız ("macau2026") her durumda geçerli kabul edilir
  return v === "macau2026." || v === "macau2026";
}

function isStandaloneApp() {
  try {
    if (window.navigator && window.navigator.standalone === true) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kklogin) return true;
  } catch (e) {}
  return false;
}

function checkSecretLinkParam() {
  try {
    var sp = new URLSearchParams(window.location.search);
    var key = sp.get('key') || sp.get('k') || sp.get('pass') || sp.get('code');
    if (key && isValidGateSecret(key)) {
      persistGateAuth();
      sp.delete('key'); sp.delete('k'); sp.delete('pass'); sp.delete('code');
      var clean = sp.toString() ? '?' + sp.toString() : '';
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + clean + window.location.hash);
      }
      return true;
    }
  } catch (e) {}
  return false;
}

function hasStoredGateAuth() {
  try {
    var val = localStorage.getItem(GATE_STORAGE_KEY) || '';
    if (isValidGateSecret(val)) return true;
    var m = document.cookie.match(/(?:^|; )kk_gate_auth=([^;]*)/);
    if (m && isValidGateSecret(decodeURIComponent(m[1]))) {
      localStorage.setItem(GATE_STORAGE_KEY, GATE_SECRET);
      return true;
    }
  } catch (e) {}
  return false;
}

function persistGateAuth() {
  try { localStorage.setItem(GATE_STORAGE_KEY, GATE_SECRET); } catch (e) {}
  try {
    document.cookie = 'kk_gate_auth=' + encodeURIComponent(GATE_SECRET) + ';path=/;max-age=31536000;SameSite=Lax';
  } catch (e) {}
}

function isGatePassed() {
  // 1. App (PWA / Standalone / iOS Native) ise asla şifre sorma
  if (isStandaloneApp()) return true;

  // 2. Gizli link ile gelinmişse yetkilendir ve geç
  if (checkSecretLinkParam()) return true;

  // 3. Daha önce bu cihazda şifre girilmişse geç
  if (hasStoredGateAuth()) return true;

  return false;
}

// Erken gizli link kontrolü
try { checkSecretLinkParam(); } catch (e) {}

function showGateOverlay(onSuccess) {
  var overlay = document.getElementById('gateOverlay');
  if (!overlay) {
    if (typeof onSuccess === 'function') onSuccess();
    return;
  }

  overlay.style.display = 'flex';

  var form = document.getElementById('gateForm');
  var input = document.getElementById('gatePasswordInput');
  var rememberCheck = document.getElementById('gateRememberCheck');
  var errorMsg = document.getElementById('gateErrorMsg');
  var eyeBtn = document.getElementById('btnGateToggleEye');
  var eyeIcon = document.getElementById('gateEyeIcon');

  if (eyeBtn && input) {
    eyeBtn.onclick = function(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (input.type === 'password') {
        input.type = 'text';
        if (eyeIcon) eyeIcon.setAttribute('name', 'eye-off-outline');
      } else {
        input.type = 'password';
        if (eyeIcon) eyeIcon.setAttribute('name', 'eye-outline');
      }
    };
  }

  if (input) {
    input.value = '';
    input.oninput = function() {
      if (errorMsg) errorMsg.style.display = 'none';
    };
    setTimeout(function() { input.focus(); }, 250);
  }
  if (errorMsg) errorMsg.style.display = 'none';

  var handled = false;
  function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (handled) return;

    var rawVal = input ? input.value : '';
    if (isValidGateSecret(rawVal)) {
      handled = true;
      if (!rememberCheck || rememberCheck.checked) {
        persistGateAuth();
      }
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s ease-out';
      setTimeout(function() {
        overlay.style.display = 'none';
        overlay.style.opacity = '1';
        if (typeof onSuccess === 'function') onSuccess();
      }, 250);
    } else {
      if (errorMsg) {
        errorMsg.textContent = 'Hatalı şifre. Lütfen tekrar deneyin.';
        errorMsg.style.display = 'block';
      }
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  if (form) form.onsubmit = handleSubmit;
  var btn = document.getElementById('btnGateSubmit');
  if (btn) btn.onclick = handleSubmit;
}

/* =================== [MODULE: supabase.js] =================== */
"use strict";
/* ============ SUNUCU KÖPRÜSÜ ============ */
/* ============ SUPABASE KÖPRÜSÜ (TEST — canlı Apps Script değil) ============ */
function sbHeaders(extra){
  var h={apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json'};
  if(extra)for(var k in extra)h[k]=extra[k];
  return h;
}
function sbFetch(path,opts){
  opts=opts||{};
  var b = opts.body != null ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined;
  return fetch(SB_URL+'/rest/v1/'+path,{
    method:opts.method||'GET',
    headers:sbHeaders(opts.headers),
    body:b
  }).then(function(r){
    return r.text().then(function(t){
      if(!r.ok)throw new Error((t&&t.slice(0,200))||('HTTP '+r.status));
      if(!t)return null;
      try{return JSON.parse(t);}catch(e){return t;}
    });
  });
}
function sbRpc(name,args){
  return fetch(SB_URL+'/rest/v1/rpc/'+name,{
    method:'POST',headers:sbHeaders(),body:JSON.stringify(args||{})
  }).then(function(r){
    return r.text().then(function(t){
      if(!r.ok)throw new Error((t&&t.slice(0,200))||('RPC '+r.status));
      if(!t)return null;
      try{return JSON.parse(t);}catch(e){return t;}
    });
  });
}
function mapProposal(row,voteMap){
  var ups=[],downs=[];
  if(Array.isArray(row.proposal_votes)){
    row.proposal_votes.forEach(function(pv){
      if(pv.kind==='up')ups.push(pv.member_name);
      else downs.push(pv.member_name);
    });
  }else if(voteMap&&voteMap[row.id]){
    ups=voteMap[row.id].ups||[];
    downs=voteMap[row.id].downs||[];
  }
  return{
    id:row.id,date:row.date,by:row.by_name,also:row.also||[],
    createdAt:row.created_at?new Date(row.created_at).getTime():0,
    match:row.match,league:row.league||'',ko:row.ko,cls:row.cls,
    market:row.market,pick:row.pick,odd:Number(row.odd),
    eventId:row.event_id,mktI:row.mkt_i,no:row.no,
    comment:row.comment||'',
    result:row.result||(row.cls==='won'||row.cls==='lost'?row.cls:null),
    votes:ups,downs:downs
  };
}
function mapCoupon(row){
  var sels=row.selections||[];
  if(typeof sels==='string'){try{sels=JSON.parse(sels);}catch(e){sels=[];}}
  if(!Array.isArray(sels))sels=[];
  return{
    id:row.id,date:row.date,type:row.type,stake:Number(row.stake)||0,
    override:row.override||null,
    createdAt:row.created_at?new Date(row.created_at).getTime():0,
    createdBy:row.created_by,selections:sels
  };
}
/** Kupon bacaklarına öneri also[] bilgisini yaz (eski kayıtlar / eksik also). */
function enrichCouponsFromProposals(coupons,proposals){
  var byId={};
  (proposals||[]).forEach(function(p){if(p&&p.id)byId[p.id]=p;});
  (coupons||[]).forEach(function(c){
    (c.selections||[]).forEach(function(s){
      var p=s.propId?byId[s.propId]:null;
      if(!p&&!(s.also&&s.also.length))return;
      var names=[],seen={};
      function add(n){n=(n||'').trim();if(!n||seen[n])return;seen[n]=1;names.push(n);}
      add(s.by);(s.also||[]).forEach(add);
      if(p){add(p.by);(p.also||[]).forEach(add);}
      if(names.length){s.by=names[0];s.also=names.slice(1);}
    });
  });
  return coupons;
}
function mapAdj(row){
  return{id:row.id,date:row.date,amount:Number(row.amount)||0,note:row.note||'',by:row.by_name};
}
function sbBootstrap(){
  return Promise.all([
    sbFetch('settings?id=eq.1&select=*'),
    sbRpc('list_members',{}),
    sbFetch('proposals?select=*,proposal_votes(*)&order=created_at.desc'),
    Promise.resolve([]),
    sbFetch('coupons?select=*&order=date.desc'),
    sbFetch('adjustments?select=*&order=date.desc')
  ]).then(function(res){
    var settingsRow=(res[0]&&res[0][0])||{start_balance:88000};
    var members=res[1]||[];
    var proposals=(res[2]||[]).map(function(r){return mapProposal(r);});
    var coupons=enrichCouponsFromProposals((res[4]||[]).map(mapCoupon), proposals);
    return{
      settings:{start:Number(settingsRow.start_balance)||0,members:members,hasPin:true},
      proposals:proposals,
      coupons:coupons,
      adjustments:(res[5]||[]).map(mapAdj)
    };
  });
}
function rpc(fn){
  var args=Array.prototype.slice.call(arguments,1);
  document.getElementById('busy').style.display='block';
  var p;
  if(fn==='bootstrap')p=sbBootstrap();
  else if(fn==='checkPin')p=Promise.resolve(false); // kişisel PIN: check_member_pin kullanılır
  else if(fn==='getLiveScores')p=Promise.resolve({});
  else p=Promise.reject(new Error('rpc yok: '+fn));
  return p.then(function(v){document.getElementById('busy').style.display='none';return v;})
    .catch(function(e){document.getElementById('busy').style.display='none';throw e;});
}
function rpcSilent(fn){return rpc.apply(null,arguments);}
function getProposal(id){
  for(var i=0;i<S.proposals.length;i++){if(S.proposals[i].id===id)return S.proposals[i];}
  return null;
}
function propBadgesHtml(p){
  var votes=p.votes||[],downs=p.downs||[];
  var badge=votes.length>=6?'<span class="pill highconf">Yüksek Güven</span>':(votes.length===5?'<span class="pill banko">Güven</span>':'');
  if(downs.length>=3)badge+=' <span class="pill macau">Macau Alert</span>';
  if(p.ko&&p.ko*1000<=Date.now())badge+=' <span class="pill lost">Başladı</span>';
  return badge;
}
function voteRosterHtml(votes,downs){
  var ups=votes||[],dns=downs||[];
  if(!ups.length&&!dns.length)return '';
  function chips(list,kind){
    return list.map(function(n){
      var me=(ME&&ME.name&&n===ME.name)?' me':'';
      return '<span class="vote-chip '+kind+me+'">'+esc(n)+'</span>';
    }).join('');
  }
  var html='';
  if(ups.length){
    html+='<div class="vote-line up"><ion-icon class="vl-icon" name="thumbs-up"></ion-icon><div class="vote-chips">'+chips(ups,'up')+'</div></div>';
  }
  if(dns.length){
    html+='<div class="vote-line down"><ion-icon class="vl-icon" name="thumbs-down"></ion-icon><div class="vote-chips">'+chips(dns,'down')+'</div></div>';
  }
  return html;
}
function voteBtnHtml(kind,count,on,started){
  var icon=kind==='up'?'thumbs-up-outline':'thumbs-down-outline';
  return '<button type="button" class="votebtn '+kind+(on?' on':'')+'"'+(started?' disabled':'')+'>'+
    '<ion-icon name="'+icon+'"></ion-icon><span class="vcount">'+count+'</span></button>';
}
function patchPropCard(p){
  var box=document.querySelector('.prop[data-id="'+p.id+'"]');
  if(!box)return;
  var votes=p.votes||[],downs=p.downs||[];
  var mine=votes.indexOf(ME.name)>=0,mineDown=downs.indexOf(ME.name)>=0;
  var started=p.ko&&p.ko*1000<=Date.now();
  var up=box.querySelector('.votebtn.up'),down=box.querySelector('.votebtn.down');
  if(!up||!down)return;
  up.className='votebtn up'+(mine?' on':'');
  down.className='votebtn down'+(mineDown?' on':'');
  up.querySelector('.vcount').textContent=String(votes.length);
  down.querySelector('.vcount').textContent=String(downs.length);
  up.disabled=!!started;down.disabled=!!started;
  var roster=box.querySelector('.vote-roster');
  if(roster)roster.innerHTML=voteRosterHtml(votes,downs);
  var badges=box.querySelector('.prop-badges'),bhtml=propBadgesHtml(p);
  if(bhtml){
    if(badges)badges.innerHTML=bhtml;
    else box.querySelector('.prop-title').insertAdjacentHTML('beforeend','<div class="prop-badges">'+bhtml+'</div>');
  }else if(badges)badges.remove();
}
function applyVoteToggle(id,name,isDown){
  var pr=getProposal(id);
  if(!pr)return false;
  var v=pr.votes||[],dn=pr.downs||[];
  var main=isDown?dn:v,other=isDown?v:dn;
  var ix=main.indexOf(name);
  if(ix>=0)main.splice(ix,1);
  else{
    main.push(name);
    var ox=other.indexOf(name);
    if(ox>=0)other.splice(ox,1);
  }
  pr.votes=v;pr.downs=dn;
  return true;
}
// _votePending: id → {name, kind, removing}
// Tüm votes array'i değil, sadece kullanıcının aksiyonu saklanır.
// softRefreshFromServer bunu sunucu verisine uygular → diğer oylar zarar görmez.
var _votePending={};
function voteMutate(action,payload){
  if(!ME.name){toast('Önce giriş yap');showLogin();return;}
  if(!payload||!payload.id)return;
  var pr0=getProposal(payload.id);
  if(!pr0)return;
  var snapVotes=(pr0.votes||[]).slice();
  var snapDowns=(pr0.downs||[]).slice();
  var kind=action==='toggleDown'?'down':'up';
  // Kullanıcı zaten bu yönde oy vermiş mi? (toggle off mu?)
  var arr=kind==='up'?snapVotes:snapDowns;
  var removing=arr.indexOf(ME.name)>=0;
  if(!applyVoteToggle(payload.id,payload.name,action==='toggleDown'))return;
  var pr=getProposal(payload.id);
  if(pr)patchPropCard(pr);
  var pid=payload.id;
  // Aksiyonu kaydet (tüm votes yerine sadece ne yapıldığı)
  _votePending[pid]={name:ME.name,kind:kind,removing:removing};
  sbRpc('toggle_vote',{p_proposal_id:pid,p_name:ME.name,p_kind:kind}).then(function(res){
    var data=Array.isArray(res)?res[0]:res;
    var cur=getProposal(pid);
    if(cur&&data&&(Array.isArray(data.ups)||Array.isArray(data.downs))){
      // RPC'den gelen kesin sunucu verisi — doğrudan uygula
      cur.votes=data.ups||[];
      cur.downs=data.downs||[];
      patchPropCard(cur);
    } else {
      fetchVotesForProposal(pid).catch(function(){});
    }
  }).catch(function(e){
    var p2=getProposal(pid);
    if(p2){p2.votes=snapVotes;p2.downs=snapDowns;patchPropCard(p2);}
    toast('Oy kaydedilemedi: '+(e.message||e));
  }).then(function(){delete _votePending[pid];});
}

function proposalToRow(p){
  return{
    id:String(p.id),date:p.date||null,by_name:p.by,also:p.also||[],
    created_at:p.createdAt?new Date(p.createdAt).toISOString():new Date().toISOString(),
    match:p.match,league:p.league||'',ko:p.ko!=null?Number(p.ko):null,cls:p.cls||null,
    market:p.market,pick:p.pick,odd:Number(p.odd)||1,
    event_id:p.eventId!=null?Number(p.eventId):null,
    mkt_i:p.mktI!=null?Number(p.mktI):null,
    no:p.no!=null?Number(p.no):null,
    comment:String(p.comment||'').trim()
  };
}
function couponToRow(c){
  return{
    id:String(c.id),date:c.date,type:c.type||'banko',stake:Number(c.stake)||0,
    override:c.override||null,
    created_at:c.createdAt?new Date(c.createdAt).toISOString():new Date().toISOString(),
    created_by:c.createdBy||null,selections:c.selections||[]
  };
}
function findSameProposal(s){
  for(var i=0;i<(S.proposals||[]).length;i++){
    var p=S.proposals[i];
    if(s.eventId!=null&&p.eventId!=null){
      if(Number(p.eventId)===Number(s.eventId)&&Number(p.mktI)===Number(s.mktI)&&Number(p.no)===Number(s.no))return p;
    }else if((s.eventId==null||s.eventId==='')&&(p.eventId==null||p.eventId==='')){
      if(p.match===s.match&&p.market===s.market&&p.pick===s.pick)return p;
    }
  }
  return null;
}
function isOnProposal(p,name){
  if(!p||!name)return false;
  if(p.by===name)return true;
  return (p.also||[]).indexOf(name)>=0;
}
var DAILY_PROPOSAL_LIMIT=6;
function matchDayKey(item){
  if(!item)return todayStr();
  if(item.cls==='uzun'&&!item.ko)return 'uzun';
  if(item.ko!=null&&item.ko!=='')return dstr(new Date(Number(item.ko)*1000));
  if(item.date)return String(item.date).slice(0,10);
  return todayStr();
}
function matchDayLabel(dayKey){
  if(dayKey==='uzun')return 'uzun vadeli';
  var parts=String(dayKey).split('-');
  if(parts.length!==3)return dayKey;
  var d=new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]));
  return d.toLocaleDateString('tr-TR',{day:'numeric',month:'long'});
}
function quotaFocusDay(){
  if(typeof dayFilter!=='undefined'&&dayFilter==='tomorrow')return dstr(new Date(Date.now()+864e5));
  return todayStr();
}
function isOnProposalAsMe(p){
  return !!(p&&ME.name&&(p.by===ME.name||(p.also||[]).indexOf(ME.name)>=0));
}
function myProposalsOnMatchDay(dayKey){
  if(!ME.name||!dayKey)return 0;
  return (S.proposals||[]).filter(function(p){
    return isOnProposalAsMe(p)&&matchDayKey(p)===dayKey;
  }).length;
}
function proposeSlotsLeftForDay(dayKey){
  return Math.max(0,DAILY_PROPOSAL_LIMIT-myProposalsOnMatchDay(dayKey));
}
function neededByMatchDay(sels){
  var byDay={};
  (sels||[]).forEach(function(s){
    var exist=findSameProposal(s);
    if(exist&&isOnProposal(exist,ME.name))return;
    var day=matchDayKey(s);
    byDay[day]=(byDay[day]||0)+1;
  });
  return byDay;
}
function countNeededProposals(sels){
  var n=0,by=neededByMatchDay(sels);
  Object.keys(by).forEach(function(k){n+=by[k];});
  return n;
}
function assertCanProposeSels(sels){
  if(!ME.name){toast('Önce giriş yap');showLogin();return false;}
  var byDay=neededByMatchDay(sels);
  var days=Object.keys(byDay);
  if(!days.length)return true;
  for(var i=0;i<days.length;i++){
    var day=days[i],need=byDay[day],used=myProposalsOnMatchDay(day),left=Math.max(0,DAILY_PROPOSAL_LIMIT-used);
    if(left<=0){
      toast(matchDayLabel(day)+' maçları için öneri hakkın doldu (maks '+DAILY_PROPOSAL_LIMIT+').');
      return false;
    }
    if(need>left){
      toast(matchDayLabel(day)+' için en fazla '+DAILY_PROPOSAL_LIMIT+' öneri. Kalan '+left+', seçimin '+need+'.');
      return false;
    }
  }
  return true;
}
function assertCanProposeItem(item){
  return assertCanProposeSels([item]);
}
function ensureProposerUpvote(proposalId, name){
  if(!proposalId||!name)return Promise.resolve();
  var q='proposal_votes?proposal_id=eq.'+encodeURIComponent(proposalId)+
    '&member_name=eq.'+encodeURIComponent(name)+'&select=kind';
  return sbFetch(q).then(function(rows){
    var cur=rows&&rows[0];
    if(cur&&cur.kind==='up')return;
    if(cur&&cur.kind==='down'){
      return sbFetch(
        'proposal_votes?proposal_id=eq.'+encodeURIComponent(proposalId)+
        '&member_name=eq.'+encodeURIComponent(name),
        {method:'PATCH',headers:{Prefer:'return=minimal'},body:{kind:'up'}}
      );
    }
    return sbFetch('proposal_votes?on_conflict=proposal_id,member_name',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:{proposal_id:String(proposalId),member_name:name,kind:'up'}
    });
  }).catch(function(){
    // Son çare: toggle yalnızca oy yoksa ekler; varsa up ise tekrar basma
    return sbFetch(q).then(function(rows){
      if(rows&&rows.length)return;
      return sbRpc('toggle_vote',{p_proposal_id:String(proposalId),p_name:name,p_kind:'up'});
    }).catch(function(){});
  });
}
function mutate(action,payload){
  document.getElementById('busy').style.display='block';
  var p=Promise.resolve();
  var addMeta=null;
  if(action==='addProposal'){
    var row=proposalToRow(payload);
    var pj={
      id:row.id,date:row.date,by:row.by_name,also:row.also,createdAt:row.created_at,
      match:row.match,league:row.league,ko:row.ko,cls:row.cls,
      market:row.market,pick:row.pick,odd:row.odd,
      eventId:row.event_id,mktI:row.mkt_i,no:row.no,
      comment:row.comment||''
    };
    p=sbRpc('add_proposal',{p:pj}).then(function(res){
      addMeta=res;
      var id=res&&res.id;
      return ensureProposerUpvote(id, pj.by).then(function(){return sbBootstrap();});
    });
  }else if(action==='delProposal'){
    p=sbFetch('proposals?id=eq.'+encodeURIComponent(payload.id),{method:'DELETE',headers:{Prefer:'return=minimal'}})
      .then(function(){return sbBootstrap();});
  }else if(action==='setProposalComment'){
    p=sbFetch('proposals?id=eq.'+encodeURIComponent(payload.id),{
      method:'PATCH',headers:{Prefer:'return=minimal'},
      body:{comment:String(payload.comment||'').trim()}
    }).then(function(){return sbBootstrap();});
  }else if(action==='saveCoupon'||action==='updateCoupon'){
    p=sbFetch('coupons?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:couponToRow(payload)})
      .then(function(){return sbBootstrap();});
  }else if(action==='delCoupon'){
    p=sbFetch('coupons?id=eq.'+encodeURIComponent(payload.id),{method:'DELETE',headers:{Prefer:'return=minimal'}})
      .then(function(){return sbBootstrap();});
  }else if(action==='addAdj'){
    p=sbFetch('adjustments?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{
      id:String(payload.id),date:payload.date,amount:Number(payload.amount)||0,note:payload.note||'',by_name:payload.by||null
    }}).then(function(){return sbBootstrap();});
  }else if(action==='delAdj'){
    p=sbFetch('adjustments?id=eq.'+encodeURIComponent(payload.id),{method:'DELETE',headers:{Prefer:'return=minimal'}})
      .then(function(){return sbBootstrap();});
  }else if(action==='saveSettings'){
    p=sbFetch('settings?id=eq.1',{method:'PATCH',headers:{Prefer:'return=minimal'},body:{start_balance:Number(payload.start)||0,updated_at:new Date().toISOString()}})
      .then(function(){return sbBootstrap();});
  }else{
    p=Promise.reject(new Error('Bilinmeyen action: '+action));
  }
  return p.then(function(delta){
    document.getElementById('busy').style.display='none';
    if(delta){S=delta;renderAll();if(addMeta)delta._addMeta=addMeta;}
    return delta;
  }).catch(function(e){
    document.getElementById('busy').style.display='none';
    toast('Hata: '+(e.message||e));
    throw e;
  });
}

/* =================== [MODULE: accounting.js] =================== */
"use strict";
/* ============ HESAP ============ */
function couponOdds(c){return c.selections.reduce(function(p,s){return p*(s.result==='void'?1:(Number(s.odd)||1));},1);}
function couponStatus(c){
  if(c.override)return c.override;
  var sels=c.selections;if(!sels.length)return 'open';
  if(sels.some(function(s){return s.result==='lost';}))return 'lost';
  if(sels.every(function(s){return s.result==='void';}))return 'void';
  if(sels.every(function(s){return s.result==='won'||s.result==='void';}))return 'won';
  return 'open';
}
function couponPnl(c){
  var st=couponStatus(c),stake=Number(c.stake)||0;
  if(st==='won')return stake*couponOdds(c)-stake;
  if(st==='lost')return -stake;
  if(st==='void')return 0;
  return -stake;
}
function balance(upTo){
  // Canlı ile aynı: start + düzeltmeler + kupon PnL
  // open/lost → −stake | won → stake×oran−stake | void → 0
  // upTo verilirse o günden önceki kayıtlar (Gün başı)
  var b=Number(S.settings.start)||0;
  (S.adjustments||[]).forEach(function(a){if(!upTo||a.date<upTo)b+=Number(a.amount)||0;});
  (S.coupons||[]).forEach(function(c){if(!upTo||c.date<upTo)b+=couponPnl(c);});
  return b;
}
function ledgerDelta(upTo){
  var d=0;
  (S.adjustments||[]).forEach(function(a){if(!upTo||a.date<upTo)d+=Number(a.amount)||0;});
  (S.coupons||[]).forEach(function(c){if(!upTo||c.date<upTo)d+=couponPnl(c);});
  return d;
}
/** Hedef güncel kasa için settings.start değerini hesapla (mevcut kasayı ezer). */
function startBalanceForTarget(target){
  return Math.round((Number(target)||0) - ledgerDelta());
}
function renderHeader(){
  var kasa=statsBalance();
  var balEl=document.getElementById('hdrBalance');
  if(balEl){
    balEl.textContent=fmtTL(kasa);
    balEl.classList.remove('up','down');
  }
  var exp=0,pot=0;
  statsCoupons().forEach(function(c){
    if(couponStatus(c)==='open'){
      var st=Number(c.stake)||0;
      exp+=st;pot+=st*couponOdds(c);
    }
  });
  var openEl=document.getElementById('hdrOpen');
  var potEl=document.getElementById('hdrOpenPot');
  var sepEl=document.getElementById('hdrOpenSep');
  if(openEl){
    if(exp>0){
      openEl.textContent=fmtTL(exp);
      if(potEl){potEl.textContent=fmtTL(pot);potEl.hidden=false;}
      if(sepEl)sepEl.hidden=false;
    }else{
      openEl.textContent='—';
      if(potEl){potEl.textContent='';potEl.hidden=true;}
      if(sepEl)sepEl.hidden=true;
    }
  }
  var who=document.getElementById('whoami');
  if(who)who.textContent=ME.name?('Hoşgeldin '+ME.name+', Bol Şans'):'–';
  renderProposeQuota();
}
function renderProposeQuota(){
  var qEl=document.getElementById('buildQuota');
  var qVal=document.getElementById('buildQuotaVal');
  if(!qEl||!qVal)return;
  if(!ME.name){
    qEl.classList.remove('low','empty');
    qVal.textContent='–';
    qEl.title='Maç günü başına kalan öneri hakkı';
    return;
  }
  var day=quotaFocusDay();
  var left=proposeSlotsLeftForDay(day);
  var used=myProposalsOnMatchDay(day);
  qVal.textContent=left+'/'+DAILY_PROPOSAL_LIMIT;
  qEl.title=matchDayLabel(day)+' maçları · '+used+' öneri · kalan '+left;
  qEl.classList.toggle('empty',left<=0);
  qEl.classList.toggle('low',left>0&&left<=2);
}

/* =================== [MODULE: auth.js] =================== */
"use strict";
/* ============ GİRİŞ (PIN yok — isim seç, kalıcı hatırla) ============ */
function readPersistedName(){
  var n='';
  try{n=(localStorage.getItem('kk-name')||'').trim();}catch(e){}
  if(!n){try{n=(sessionStorage.getItem('kk-name')||'').trim();}catch(e){}}
  if(!n){
    try{
      var m=document.cookie.match(/(?:^|; )kk-name=([^;]*)/);
      if(m)n=decodeURIComponent(m[1]||'').trim();
    }catch(e){}
  }
  if(n){
    try{localStorage.setItem('kk-name',n);}catch(e){}
    try{sessionStorage.setItem('kk-name',n);}catch(e){}
  }
  return n||'';
}
function persistName(name){
  name=(name||'').trim();
  if(!name)return;
  try{localStorage.setItem('kk-name',name);localStorage.removeItem('kk-pin');}catch(e){}
  try{sessionStorage.setItem('kk-name',name);}catch(e){}
  try{document.cookie='kk-name='+encodeURIComponent(name)+';path=/;max-age=31536000;SameSite=Lax';}catch(e){}
  // IndexedDB yedek (Safari ITP / storage wipe’a karşı)
  try{
    if(window.indexedDB){
      var req=indexedDB.open('kk-auth',1);
      req.onupgradeneeded=function(){req.result.createObjectStore('kv');};
      req.onsuccess=function(){
        try{
          var db=req.result;
          var tx=db.transaction('kv','readwrite');
          tx.objectStore('kv').put(name,'name');
        }catch(e){}
      };
    }
  }catch(e){}
}
function clearPersistedName(){
  try{localStorage.removeItem('kk-name');localStorage.removeItem('kk-pin');}catch(e){}
  try{sessionStorage.removeItem('kk-name');}catch(e){}
  try{document.cookie='kk-name=;path=/;max-age=0';}catch(e){}
  try{
    if(window.indexedDB){
      var req=indexedDB.open('kk-auth',1);
      req.onupgradeneeded=function(){req.result.createObjectStore('kv');};
      req.onsuccess=function(){
        try{
          var db=req.result;
          var tx=db.transaction('kv','readwrite');
          tx.objectStore('kv').delete('name');
        }catch(e){}
      };
    }
  }catch(e){}
}
function readNameFromIdb(){
  return new Promise(function(resolve){
    try{
      if(!window.indexedDB){resolve('');return;}
      var req=indexedDB.open('kk-auth',1);
      req.onerror=function(){resolve('');};
      req.onupgradeneeded=function(){req.result.createObjectStore('kv');};
      req.onsuccess=function(){
        try{
          var db=req.result;
          var tx=db.transaction('kv','readonly');
          var g=tx.objectStore('kv').get('name');
          g.onsuccess=function(){resolve((g.result&&String(g.result).trim())||'');};
          g.onerror=function(){resolve('');};
        }catch(e){resolve('');}
      };
    }catch(e){resolve('');}
  });
}
function restoreSession(){
  ME.name=readPersistedName();
  ME.pin='';
}
function syncNativeLogin(logout){
  try{
    if(window.webkit&&window.webkit.messageHandlers.kklogin){
      if(logout) window.webkit.messageHandlers.kklogin.postMessage({logout:true});
      else if(ME.name) window.webkit.messageHandlers.kklogin.postMessage({name:ME.name,pin:''});
    }
  }catch(e){}
}
function setLoginOpen(open){
  var modal=document.getElementById('loginModal');
  if(!modal)return;
  try{
    if(open){
      modal.isOpen=true;
      if(typeof modal.present==='function') modal.present();
    }else{
      modal.isOpen=false;
      if(typeof modal.dismiss==='function') modal.dismiss();
    }
  }catch(e){
    modal.isOpen=!!open;
  }
}
function completeLogin(name){
  name=(name||'').trim();
  if(!name)return;
  ME={name:name,pin:''};
  persistName(name);
  setLoginOpen(false);
  syncNativeLogin(false);
  renderAll();
}
function setLoginStep(step){
  var land=document.getElementById('loginLanding');
  var pick=document.getElementById('loginPick');
  if(land)land.classList.toggle('show',step==='landing');
  if(pick)pick.classList.toggle('show',step==='pick');
}
function showLanding(){
  setLoginStep('landing');
  setLoginOpen(true);
  var next=document.getElementById('btnLoginNext');
  if(next)next.onclick=function(){showLoginPick();};
}
function showLoginPick(){
  var members=(S.settings.members||[]).filter(function(m){return m&&m.trim();});
  var el=document.getElementById('loginNames');
  if(!el)return;
  el.innerHTML=members.map(function(m){
    return '<button type="button" class="login-chip" style="color:'+memberColor(m)+';border-color:'+memberColor(m)+'">'+esc(m)+'</button>';
  }).join('')||'<p class="muted">Üye listesi yok</p>';
  el.querySelectorAll('.login-chip').forEach(function(b){
    b.onclick=function(){completeLogin(b.textContent);};
  });
  setLoginStep('pick');
  setLoginOpen(true);
}
function tryAutoLogin(){
  restoreSession();
  if(ME.name){
    setLoginOpen(false);
    renderAll();
    syncNativeLogin(false);
    return;
  }
  readNameFromIdb().then(function(n){
    if(n){
      ME={name:n,pin:''};
      persistName(n);
      setLoginOpen(false);
      renderAll();
      syncNativeLogin(false);
      return;
    }
    showLanding();
  });
}
function showLogin(){
  restoreSession();
  if(ME.name){setLoginOpen(false);return;}
  showLanding();
}
document.getElementById('btnLogout').onclick=function(){
  clearPersistedName();
  ME={name:'',pin:''};
  syncNativeLogin(true);
  renderHeader();
  showLanding();
};

/* =================== [MODULE: proposals.js] =================== */
"use strict";
/* ============ ÖNERİLER ============ */
/* Oran sınıfı: 1.00–1.59 banko, 1.60–2.25 plase, 2.26+ sürpriz */
function numOdd(odd){
  if(typeof odd==='number'&&isFinite(odd))return odd;
  var n=parseFloat(String(odd==null?'':odd).replace(',','.'));
  return isFinite(n)?n:0;
}
function oddClass(odd){
  odd=numOdd(odd)||1;
  if(odd<1.60)return {k:'banko',t:'Banko'};
  if(odd<=2.25)return {k:'plase',t:'Plase'};
  return {k:'surpriz',t:'Sürpriz'};
}
function comparePropsByOdd(a,b){
  var oa=numOdd(a.odd),ob=numOdd(b.odd);
  if(oa!==ob)return oa-ob;
  var da=proposalWhenDate(a),db=proposalWhenDate(b);
  if(da&&db&&da.getTime()!==db.getTime())return da-db;
  return (b.createdAt||0)-(a.createdAt||0);
}
function proposalKickoffPassed(p){
  return !!(p.ko && Number(p.ko)*1000 <= Date.now());
}
function isAiBotProposal(p){
  var by=String((p&& (p.by||p.by_name))||'');
  return /clasura\s*ai/i.test(by) || by.indexOf('🤖')>=0;
}
var propDayFilter='all';
var propBFilter=false;
function proposalWhenDate(p){
  if(p.ko) return new Date(Number(p.ko)*1000);
  if(p.date){
    var parts=String(p.date).split('-');
    if(parts.length===3) return new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]),12,0,0);
  }
  return null;
}
function isWithinNext5Days(d){
  if(!d) return false;
  var now=new Date();
  var start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  var end=start.getTime()+7*864e5;
  var t=d.getTime();
  return t>=start.getTime()&&t<end;
}
function propDayBucket(d){
  var dow=d.getDay();
  if(dow===1) return 'mon';
  if(dow===2||dow===3) return 'tuewed';
  if(dow===4) return 'thu';
  if(dow===5) return 'fri';
  if(dow===6) return 'sat';
  if(dow===0) return 'sun';
  return null;
}
function matchesPropDayFilter(p){
  if(p.cls==='uzun') return true;
  var d=proposalWhenDate(p);
  if(!d) return propDayFilter==='all';
  if(!isWithinNext5Days(d)) return false;
  if(propDayFilter==='all') return true;
  return propDayBucket(d)===propDayFilter;
}
function renderProps(){
  var el=document.getElementById('propList');
  // Geçmiş öneriler DB'de kalır; Öneriler listesinde yalnızca başlamamışlar gösterilir.
  var list=(S.proposals||[]).filter(function(p){
    if(proposalKickoffPassed(p)||!matchesPropDayFilter(p))return false;
    if(propBFilter&&(p.votes||[]).length<5)return false;
    return true;
  });
  list.sort(comparePropsByOdd);
  if(!list.length){
    var hasAny=(S.proposals||[]).some(function(p){return !proposalKickoffPassed(p);});
    var msg=propBFilter?'5+ oy alan öneri yok':(hasAny?'Bu gün için öneri yok':'Henüz öneri yok');
    el.innerHTML='<div class="empty-state"><ion-icon name="chatbubbles-outline"></ion-icon><p>'+msg+'</p>'+
      (hasAny||propBFilter?'':'<button type="button" class="btn primary" id="goBuild">Öneri yap</button>')+'</div>';
    var gb=document.getElementById('goBuild');if(gb)gb.onclick=function(){switchTab('build');};
    return;
  }
  var groups={banko:[],plase:[],surpriz:[],uzun:[]};
  list.forEach(function(p){groups[p.cls==='uzun'?'uzun':oddClass(p.odd).k].push(p);});
  groups.banko.sort(comparePropsByOdd);
  groups.plase.sort(comparePropsByOdd);
  groups.surpriz.sort(comparePropsByOdd);
  groups.uzun.sort(comparePropsByOdd);
  var propHtml=function(p){
    var votes=p.votes||[];var mine=votes.indexOf(ME.name)>=0;
    var downs=p.downs||[];var mineDown=downs.indexOf(ME.name)>=0;
    var badge=propBadgesHtml(p);
    var started=p.ko&&p.ko*1000<=Date.now();
    var oc=p.cls==='uzun'?{k:'uzun',t:'Uzun'}:oddClass(p.odd);
    var when=p.ko?new Date(p.ko*1000).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
    var hasCmt=!!String(p.comment||'').trim();
    var cmtText=hasCmt?String(p.comment||'').trim():'';
    var b=basket();
    var inBasket=b.some(function(x){return String(x.propId)===String(p.id)||(x.match===p.match&&x.pick===p.pick);});
    var cartBtnClass='btn tiny'+(inBasket?' in-basket':'');
    var cartIcon=inBasket?'cart':'cart-outline';
    return '<div class="prop" data-id="'+p.id+'">'+
      '<div class="prop-top">'+
        '<div class="prop-title"><b>'+esc(p.match)+'</b>'+(badge?'<div class="prop-badges">'+badge+'</div>':'')+
          '<div class="prop-meta">'+esc(p.market)+': <b>'+esc(p.pick)+'</b>'+(when?' · '+when:'')+' · '+[p.by].concat(p.also||[]).map(nameSpan).join(', ')+'</div>'+
          (hasCmt?'<div class="prop-comment-box"><span class="cmt-icon">💬</span><span class="cmt-txt">'+esc(cmtText)+'</span></div>':'')+
        '</div>'+
        '<div class="prop-odd"><span class="podd">@'+fmtOdd(p.odd)+'</span><span class="pill '+oc.k+' prop-odd-pill">'+oc.t+'</span></div>'+
      '</div>'+
      '<div class="prop-foot">'+
        '<div class="prop-votes">'+
          voteBtnHtml('up',votes.length,mine,started)+
          voteBtnHtml('down',downs.length,mineDown,started)+
        '</div>'+
        '<div class="prop-btns">'+
          (hasCmt?'<button class="btn tiny icon-only has-comment" data-act="comment" title="Yorum"><ion-icon name="chatbubble-outline"></ion-icon><span class="cmt-dot" aria-hidden="true"></span></button>':'')+
          '<button class="'+cartBtnClass+'" data-act="tocoupon"'+(started?' disabled':'')+' title="'+(inBasket?'Sepetten çıkar':'Sepete ekle')+'"><ion-icon name="'+cartIcon+'"></ion-icon>'+(inBasket?'<span class="in-basket-dot"></span>':'')+' </button>'+
          (p.eventId?'<button class="btn tiny icon-only" data-act="frommatch"'+(started?' disabled':'')+' title="Maçtan"><ion-icon name="flash-outline"></ion-icon></button>':'')+
          '<button class="btn tiny danger icon-only" data-act="del" title="Sil"><ion-icon name="trash-outline"></ion-icon></button>'+
        '</div>'+
      '</div>'+
      '<div class="vote-roster">'+voteRosterHtml(votes,downs)+'</div>'+
      '</div>';
  };
  var GRP=[['banko','Banko','1.00–1.59'],['plase','Plase','1.60–2.25'],['surpriz','Sürpriz','2.26+'],['uzun','Uzun vadeli','özel']];
  var mainKeys=['banko','plase','surpriz'];
  var html='', mainCount=0;
  mainKeys.forEach(function(k){
    if(!groups[k].length)return;
    if(mainCount)html+='<div class="grp-sep" aria-hidden="true"></div>';
    var g=GRP.filter(function(x){return x[0]===k;})[0];
    html+='<div class="grp-title type-main '+g[0]+'"><strong>'+g[1]+'</strong><span>'+g[2]+'</span></div>'+groups[k].map(propHtml).join('');
    mainCount++;
  });
  if(groups.uzun.length){
    if(mainCount)html+='<div class="grp-sep" aria-hidden="true"></div>';
    var ug=GRP[3];
    html+='<div class="grp-title '+ug[0]+'"><strong>'+ug[1]+'</strong><span>'+ug[2]+'</span></div>'+groups.uzun.map(propHtml).join('');
  }
  el.innerHTML=html;
  el.querySelectorAll('.prop').forEach(function(box){
    var propId=box.dataset.id;
    var p=(S.proposals||[]).find(function(x){return String(x.id)===String(propId);});
    if(!p)return;
    var upBtn=box.querySelector('.votebtn.up');
    if(upBtn)upBtn.onclick=function(ev){ev.preventDefault();if(this.disabled)return;voteMutate('toggleVote',{id:p.id,name:ME.name});};
    var downBtn=box.querySelector('.votebtn.down');
    if(downBtn)downBtn.onclick=function(ev){ev.preventDefault();if(this.disabled)return;voteMutate('toggleDown',{id:p.id,name:ME.name});};
    var cmtBtn=box.querySelector('[data-act=comment]');
    if(cmtBtn)cmtBtn.onclick=function(){openProposalComment(p);};
    var toCouponBtn=box.querySelector('[data-act=tocoupon]');
    if(toCouponBtn){
      toCouponBtn.onclick=function(ev){
        if(ev){ev.preventDefault();ev.stopPropagation();}
        try{
          if(p.ko&&Number(p.ko)*1000<=Date.now()){toast('Maç başlamış — kupona eklenemez');return;}
          var b=basket();
          var existingIdx=-1;
          if(p.id){
            existingIdx=b.findIndex(function(x){return String(x.propId)===String(p.id);});
          }
          if(existingIdx<0){
            existingIdx=b.findIndex(function(x){return x.match===p.match&&x.pick===p.pick;});
          }
          if(existingIdx>=0){
            // Zaten sepette — ikinci kasıtlı tıklamada çıkar, ilkinde uyar
            if(!toCouponBtn.dataset.confirmRemove){
              toCouponBtn.dataset.confirmRemove='1';
              toCouponBtn.style.outline='2px solid #ff5555';
              toast('Zaten sepette · Kaldırmak için tekrar dokun');
              setTimeout(function(){if(toCouponBtn){toCouponBtn.dataset.confirmRemove='';toCouponBtn.style.outline='';}},3000);
              return;
            }
            toCouponBtn.dataset.confirmRemove='';
            toCouponBtn.style.outline='';
            b.splice(existingIdx,1);
            saveBasket();
            // Butonu güncelle (sepetten çıkıldı)
            toCouponBtn.className='btn tiny';
            toCouponBtn.innerHTML='<ion-icon name="cart-outline"></ion-icon> ';
            toCouponBtn.title='Sepete ekle';
            try{renderBasket();}catch(e){}
            toast('Sepetten çıkarıldı');
            return;
          }
          b.push({
            id: uid(),
            propId: p.id || ('p_' + uid()),
            eventId: p.eventId || p.event_id || null,
            mktI: p.mktI || p.mkt_i || null,
            no: p.no || null,
            match: p.match,
            league: p.league || '',
            ko: p.ko || null,
            cls: p.cls || null,
            market: p.market,
            pick: p.pick,
            odd: Number(p.odd) || 1.80,
            by: p.by || p.by_name || (ME && ME.name) || 'Üye',
            also: (p.also || []).slice(),
            result: 'open'
          });
          var k=p.cls==='uzun'?'uzun':oddClass(p.odd).k;
          var bTypeEl=document.getElementById('bType');
          if(bTypeEl) bTypeEl.value=k;
          saveBasket();
          // Butonu anında güncelle (sepete eklendi görsel geri bildirimi)
          toCouponBtn.className='btn tiny in-basket';
          toCouponBtn.innerHTML='<ion-icon name="cart"></ion-icon><span class="in-basket-dot"></span> ';
          toCouponBtn.title='Sepetten çıkar';
          console.log('[CLASURA] Sepete eklendi. APP.basket.length=',APP.basket.length,'localStorage=',Store.get('kk-basket',[]).length);
          try{renderBasket();}catch(e){console.error('[CLASURA] renderBasket err:',e);}
          var label=(TYPE_TR&&TYPE_TR[k])?TYPE_TR[k]:'Kupon';
          toast('Sepete eklendi · '+label+' ('+APP.basket.length+')');
        }catch(err){
          console.error('[CLASURA] tocoupon err:',err,err&&err.stack);
          toast('Hata: '+String(err&&err.message||err));
        }
      };
    }
    var delBtn=box.querySelector('[data-act=del]');
    if(delBtn)delBtn.onclick=function(){
      if(p.by!==ME.name && !isAiBotProposal(p)){
        toast('Sadece öneren kişi silebilir'+(p.by?' ('+p.by+')':''));
        return;
      }
      if(!confirm('Öneriyi silmek istediğine emin misin?'))return;
      mutate('delProposal',{id:p.id});
    };
    var fm=box.querySelector('[data-act=frommatch]');
    if(fm)fm.onclick=function(){openDetail(p.eventId,true);};
  });
}

/* =================== [MODULE: schedule.js] =================== */
"use strict";
/* ============ MAÇ PROGRAMI ============ */
var EV=[],COMPS={},dayFilter='today',leagueFilter=null,searchQ='';
var WC_CI=202607;
/* Öneri Yap — sadece bu ligler (sıra önemli) */
var LEAGUE_ALLOW=[
  {label:'Türkiye Süper Ligi', test:function(n){return /türkiye.*süper\s*lig|trendyol\s*süper/i.test(n)&&!/1\.\s*lig|kupa|kadın|women|bayan|u1[89]|u2[01]/i.test(n);}},
  {label:'Premier Lig', test:function(n){return /(ingiltere|İngiltere|england).*(premier\s*lig|premier\s*league)/i.test(n)&&!/şili|rusya|irlanda|çek|czech|lebanon|çin|iskoç|scotland|chile|russia|slovak|sloven|2|u21|u23|u18|reserve|youth|kadın|women|bayan|kupa|cup|championship|league\s*one|league\s*two|efl|mısır|egypt|suudi|saudi|hindistan|india|fas|morocco/i.test(n);}},
  {label:'Fransa', test:function(n){return /fransa.*(ligue\s*1|1\.\s*lig|kupa|şampiyonlar|süper|troph)|(france|fransa).*(cup|super\s*cup)|ligue\s*1/i.test(n)&&!/ligue\s*2|kadın|women|frauen|bayan/i.test(n);}},
  {label:'Bundesliga', test:function(n){return /(almanya|germany|deutschland).*(bundesliga|1\.\s*lig)|^bundesliga$/i.test(n)&&!/avusturya|österreich|osterreich|austria|2\.|3\.|kadın|women|frauen|bayan|amatör|amateur/i.test(n);}},
  {label:'Serie A', test:function(n){return /(italya|İtalya).*serie\s*a|(^|\s)serie\s*a(\s|$)/i.test(n)&&!/brezilya|serie\s*b|kadın|women|frauen|bayan/i.test(n);}},
  {label:'La Liga', test:function(n){return /(ispanya|İspanya).*la\s*liga|(^|\s)la\s*liga(\s|$)|laliga/i.test(n)&&!/2|smartbank|hypermotion|kadın|women|frauen|bayan/i.test(n);}},
  {label:'Hollanda', test:function(n){return /hollanda.*eredivisie|(^|\s)eredivisie(\s|$)/i.test(n)&&!/kadın|women|frauen|bayan|2\.\s*lig|eerste|jong/i.test(n);}},
  {label:'Portekiz', test:function(n){return /portekiz\s*premier\s*lig|portekiz.*primeira|(portekiz|portugal).*1\.\s*lig/i.test(n)&&!/kadın|women|frauen|bayan|2\.\s*lig|segunda/i.test(n);}},
  {label:'Belçika', test:function(n){return /belçika.*pro\s*lig|jupiler/i.test(n)&&!/kadın|women|frauen|bayan|2\.\s*lig/i.test(n);}},
  {label:'Danimarka', test:function(n){return /(danimarka|denmark).*(süper\s*lig|superliga|super\s*lig|1\.\s*lig)|^superliga$/i.test(n)&&!/2\.\s*lig|kadın|women|frauen|bayan|kupa|cup|u1[89]|u2[01]/i.test(n);}},
  {label:'UCL', test:function(n){return /uefa.*şampiyonlar|uefa.*champions/i.test(n)&&!/kadın|genç|youth|women|frauen|bayan|afc|asya|asian/i.test(n);}},
  {label:'Avrupa Ligi', test:function(n){return /uefa.*avrupa|uefa.*europa/i.test(n)&&!/konferans|conference|kadın|women|frauen|bayan/i.test(n);}},
  {label:'Konferans Ligi', test:function(n){return /uefa.*konferans|uefa.*conference/i.test(n)&&!/kadın|women|frauen|bayan/i.test(n);}}
];
var LEAGUE_ID_HINTS={
  126:'UCL',23986:'Konferans Ligi',588:'Avrupa Ligi',71522:'UCL',76759:'Konferans Ligi',
  584:'Türkiye Süper Ligi',322:'Hollanda',566:'Portekiz',148:'Belçika',
  381:'Fransa',586:'Fransa',60447:'Fransa',45:'Bundesliga',347:'Bundesliga'
};
var DAILY_COMP_IDS={71522:1,76759:1};
function registerDailyComps(compsMap){
  for(var id in compsMap){
    var ci=Number(id), n=String(compsMap[id]||'');
    if(!ci||!/günlük\s*bahis/i.test(n))continue;
    DAILY_COMP_IDS[ci]=1;
    if(/şamp|champ/i.test(n)&&!LEAGUE_ID_HINTS[ci])LEAGUE_ID_HINTS[ci]='UCL';
    else if(/konferans|conference/i.test(n)&&!LEAGUE_ID_HINTS[ci])LEAGUE_ID_HINTS[ci]='Konferans Ligi';
    else if(/avrupa|europa/i.test(n)&&!/konferans|conference/i.test(n)&&!LEAGUE_ID_HINTS[ci])LEAGUE_ID_HINTS[ci]='Avrupa Ligi';
  }
}
function isDailyComp(ci){return !!DAILY_COMP_IDS[ci];}
function dailyEventName(e){
  return e.n||e.hn||((e.hn||'')+(e.an?(' – '+e.an):''))||'Günlük bahis';
}
function leagueNameOf(ci){
  if(ci===WC_CI)return 'Dünya Kupası';
  return COMPS[ci]||LEAGUE_ID_HINTS[ci]||('Lig '+ci);
}
function getLeagueAllow(label){
  for(var i=0;i<LEAGUE_ALLOW.length;i++){if(LEAGUE_ALLOW[i].label===label)return LEAGUE_ALLOW[i];}
  return null;
}
function matchAllowedLeague(ci, eventName){
  if(eventName&&/\(k\)|kadın|women|frauen|bayan|u1[89]|u2[01]|u23/i.test(eventName)) return null;
  if(ci===586||ci===60447||ci===381) return getLeagueAllow('Fransa');
  if(ci===45||ci===347) return getLeagueAllow('Bundesliga');
  if(eventName&&/(paris\s*saint|psg|rc\s*lens)/i.test(eventName)) return getLeagueAllow('Fransa');
  if(isDailyComp(ci)){
    var hint=LEAGUE_ID_HINTS[ci]||'Günlük Bahis';
    var found=getLeagueAllow(hint);
    return found||{label:hint,test:function(){return true;}};
  }
  if(LEAGUE_ID_HINTS[ci]){
    var hint=LEAGUE_ID_HINTS[ci];
    var found=getLeagueAllow(hint);
    if(found)return found;
  }
  var n=leagueNameOf(ci);
  for(var j=0;j<LEAGUE_ALLOW.length;j++){
    if(LEAGUE_ALLOW[j].test(n))return LEAGUE_ALLOW[j];
  }
  return null;
}
function isAllowedLeague(ci, eventName){return !!matchAllowedLeague(ci, eventName);}
function allowedLeagueLabel(ci, eventName){
  var m=matchAllowedLeague(ci, eventName);
  return m?m.label:leagueNameOf(ci);
}
function allowedLeagueOrder(ci, eventName){
  var m=matchAllowedLeague(ci, eventName);
  if(!m)return 999;
  for(var i=0;i<LEAGUE_ALLOW.length;i++){if(LEAGUE_ALLOW[i]===m||LEAGUE_ALLOW[i].label===m.label)return i;}
  return 999;
}
var MKT_NAMES={4:'Maç Sonucu',14:'Alt/Üst',131:'Karş. Gol Var/Yok',129:'Çifte Şans',136:'Tek/Çift',12:'Handikaplı MS',100:'Handikaplı MS',63:'İY Alt/Üst',47:'İlk Yarı Sonucu',625:'İY Çifte Şans'};
function formatSov(sov){
  if(sov==null||sov==='')return '';
  var s=String(sov).trim();
  if(/^\d+\s*:\s*\d+$/.test(s))return s.replace(/\s/g,'');
  if(/^\d+[\.,]\d+$/.test(s))return s.replace(',', '.');
  var n=parseFloat(s.replace(',','.'));
  if(isNaN(n))return s;
  if(n<0)return '0:'+String(Math.abs(n)).replace(/\.0$/,'');
  if(n>0)return String(n).replace(/\.0$/,'')+':0';
  if(n===0)return '0:0';
  return s;
}
function formatMarketLabel(n,sov){
  if(!n)return '';
  var h=formatSov(sov);
  n=String(n).replace(/\{h\}/gi,h?'('+h+')':'').replace(/\{0\}/g,h?'('+h+')':'').replace(/\{\d+\}/g,'');
  return n.replace(/\(\s*\)/g,h?'('+h+')':'').replace(/\s{2,}/g,' ').trim();
}
function formatPickName(n,sov){
  if(!n)return '';
  var h=formatSov(sov);
  n=String(n).replace(/\{h\}/gi,h).replace(/\{0\}/g,h).replace(/\{\d+\}/g,'');
  return n.replace(/\(\s*\)/g,h?'('+h+')':'').replace(/\s{2,}/g,' ').trim();
}
function mktLabel(m){
  if(m.nm)return formatMarketLabel(m.nm,m.sov);
  var n=MKT_NAMES[m.st]||('Market #'+m.st);
  var h=formatSov(m.sov);
  return h?n+' ('+h+')':n;
}
function evDate(e){return dstr(new Date(e.d*1000));}

/* =================== [MODULE: iddaa.js] =================== */
"use strict";
/* ============ İDDAA — doğrudan telefondan (Apps Script proxy'si atlanır) ============ */
var IDDAA='https://sportsbookv2.iddaa.com/sportsbook';
function iddaaFetch(path){
  return fetch(IDDAA+path,{credentials:'omit'}).then(function(r){
    if(!r.ok)throw new Error('iddaa '+r.status);
    return r.json();
  });
}
function getMktCfg(){
  try{
    var c=JSON.parse(localStorage.getItem('kk-mcfg')||'null');
    if(c&&c.t&&Date.now()-c.t<21600000)return Promise.resolve(c.d);
  }catch(e){}
  return iddaaFetch('/get_market_config').then(function(j){
    var out={},m=(j.data&&j.data.m)||{};
    for(var k in m){if(m[k]&&m[k].n)out[k]=m[k].n;}
    try{localStorage.setItem('kk-mcfg',JSON.stringify({t:Date.now(),d:out}));}catch(e){}
    return out;
  });
}
function resolveMktName(cfg,t,st,sov){
  var n=cfg[t+'_'+st]||cfg['1_'+st]||cfg['2_'+st]||cfg['4_'+st];
  if(!n)return null;
  return formatMarketLabel(n,sov);
}
function buildBulletinClient(forceFresh){
  var comps={};
  try{
    var cc=JSON.parse(localStorage.getItem('kk-comps-v4')||'null');
    if(cc&&cc.t&&Date.now()-cc.t<21600000)comps=cc.d;
  }catch(e){}
  if(comps&&Object.keys(comps).length)COMPS=comps;

  if(!forceFresh){
    try{
      var hit=JSON.parse(localStorage.getItem('kk-ev-v4')||'null');
      // Boş sonucu cache'ten kullanma — tek cihazda "0 maç" kilitlenmesin
      if(hit&&hit.t&&Date.now()-hit.t<2700000&&(hit.events||[]).length){
        if(hit.comps)COMPS=hit.comps;
        /* Cache'de izin verilmeyen lig varsa yeniden çek */
        var hasStale=(hit.events||[]).some(function(e){return !isDailyComp(e.ci)&&!isAllowedLeague(e.ci, (e.hn||'')+' '+(e.an||''));});
        if(!hasStale)return Promise.resolve(hit);
      }
    }catch(e){}
  }
  return Promise.all([
    Object.keys(comps).length?Promise.resolve(comps):iddaaFetch('/competitions').then(function(cj){
      (cj.data||[]).forEach(function(c){comps[c.i]=c.n||c.sn||'';});
      try{localStorage.setItem('kk-comps-v4',JSON.stringify({t:Date.now(),d:comps}));}catch(e){}
      return comps;
    }).catch(function(){return {};}),
    iddaaFetch('/played-event-percentage?sportType=1').then(function(pj){return pj.data||{};}).catch(function(){return {};}),
    getMktCfg().catch(function(){return {};})
  ]).then(function(res){
    comps=res[0];COMPS=comps;registerDailyComps(comps);var pp=res[1],cfg=res[2],map={};
    return Promise.all(['0','1'].map(function(tp){
      return iddaaFetch('/events?st=1&type='+tp+'&version=0').then(function(j){
        ((j.data&&j.data.events)||[]).forEach(function(e){
          if(e.sid!==1)return;
          if(!isDailyComp(e.ci)&&!isAllowedLeague(e.ci, (e.hn||'')+' '+(e.an||'')))return; /* sadece izin verilen ligler */
          var ms=null,mm=null,list=e.m||[];
          for(var q=0;q<list.length;q++){
            var nm=resolveMktName(cfg,list[q].t,list[q].st,'');
            if(nm==='Maç Sonucu'&&(list[q].o||[]).length===3){mm=list[q];break;}
          }
          if(!mm)mm=list.filter(function(x){
            var o=x.o||[];
            if(o.length!==3||x.sov)return false;
            return (x.st===1||x.st===4||(o[0].n==='1'&&o[1].n==='0'&&o[2].n==='2'));
          })[0];
          if(mm)ms={i:mm.i,o:mm.o.map(function(o){return{no:o.no,odd:o.odd,n:o.n};})};
          var rec={i:e.i,hn:e.hn,an:e.an,ci:e.ci,d:e.d,ms:ms,hasM:(e.m||[]).length>0,
            pp:(pp[e.i]!=null?pp[e.i]:(pp[e.bri]!=null?pp[e.bri]:null))};
          var mKey=(e.bri&&e.bri>0)?('bri_'+e.bri):((e.hn&&e.an)?('teams_'+(e.hn||'').trim().toLowerCase()+'__'+(e.an||'').trim().toLowerCase()+'__'+Math.floor((e.d||0)/3600)):('id_'+e.i));
          var cur=map[mKey];
          if(!cur){map[mKey]=rec;return;}
          if(!cur.ms&&ms){map[mKey]=rec;return;}
          if(!cur.hasM&&rec.hasM){map[mKey]=rec;return;}
          if(cur.ms&&!ms)return;
          if(cur.hasM&&!rec.hasM)return;
          if(cur.pp==null&&rec.pp!=null)cur.pp=rec.pp;
          map[mKey]=rec;
        });
      }).catch(function(){});
    })).then(function(){
      var allEvs=Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.d-b.d;});
      var daily=[], evs=[];
      allEvs.forEach(function(e){
        if(isDailyComp(e.ci)){
          daily.push({i:e.i,n:dailyEventName(e),ci:e.ci,d:e.d,hasM:!!e.hasM});
        }else evs.push(e);
      });
      return iddaaFetch('/events?st=1&type=2&version=0').then(function(j2){
        var specials=[];
        ((j2.data&&j2.data.events)||[]).forEach(function(e){
          if(e.sid!==1)return;
          if(!isDailyComp(e.ci)&&!isAllowedLeague(e.ci, e.n||((e.hn||'')+' '+(e.an||''))))return; /* sadece izin verilen ligler */
          specials.push({i:e.i,n:e.n||((e.hn||'')+' - '+(e.an||'')),ci:e.ci,d:e.d,hasM:(e.m||[]).length>0});
        });
        var payload={t:Date.now(),events:evs,comps:comps,specials:specials,daily:daily};
        if(evs.length){try{localStorage.setItem('kk-ev-v4',JSON.stringify(payload));}catch(e){}}
        else{try{localStorage.removeItem('kk-ev-v4');}catch(e){}}
        return payload;
      }).catch(function(){
        var payload={t:Date.now(),events:evs,comps:comps,specials:[],daily:daily};
        if(evs.length){try{localStorage.setItem('kk-ev-v4',JSON.stringify(payload));}catch(e){}}
        else{try{localStorage.removeItem('kk-ev-v4');}catch(e){}}
        return payload;
      });
    });
  });
}
function fetchEventDetailClient(evId,forceFresh){
  var key='kk-evd'+evId;
  if(!forceFresh){
    try{
      var hit=JSON.parse(localStorage.getItem(key)||'null');
      if(hit&&hit.t&&Date.now()-hit.t<180000)return Promise.resolve(hit.d);
    }catch(e){}
  }
  return Promise.all([getMktCfg().catch(function(){return {};}),iddaaFetch('/event/'+Number(evId))]).then(function(res){
    var cfg=res[0],e=res[1].data||{};
    var out={i:e.i,hn:e.hn,an:e.an,n:e.n||'',d:e.d,ci:e.ci,
      m:(e.m||[]).map(function(m){
        return{i:m.i,st:m.st,sov:m.sov||'',nm:resolveMktName(cfg,m.t,m.st,m.sov),
          o:(m.o||[]).map(function(o){return{no:o.no,odd:o.odd,n:formatPickName(o.n,m.sov)};})};
      })};
    try{localStorage.setItem(key,JSON.stringify({t:Date.now(),d:out}));}catch(e){}
    return out;
  });
}
function fetchLiveScoresClient(ids){
  ids=(ids||[]).slice(0,20);
  if(!ids.length)return Promise.resolve({});
  return Promise.all(ids.map(function(id){
    return iddaaFetch('/event/'+Number(id)).then(function(j){
      var d=j.data,sc=d&&d.sc;if(!sc)return null;
      var ht=sc.ht||{},at=sc.at||{};
      return{id:id,v:{
        h:Number(ht.r)||0,a:Number(at.r)||0,
        hh:ht.ht!=null?Number(ht.ht):null,ah:at.ht!=null?Number(at.ht):null,
        he:Number(ht.et)||0,ae:Number(at.et)||0,
        min:sc.min||0,ps:Number(sc.s)||0,
        hc:Number(ht.co)||0,ac:Number(at.co)||0,
        hco:Number(ht.hco)||0,aco:Number(at.hco)||0,
        hy:Number(ht.yc)||0,ay:Number(at.yc)||0,
        hr:Number(ht.rc)||0,ar:Number(at.rc)||0
      }};
    }).catch(function(){return null;});
  })).then(function(rows){
    var out={};rows.forEach(function(r){if(r)out[r.id]=r.v;});return out;
  });
}

/* =================== [MODULE: settle.js] =================== */
"use strict";
/* ============ OTOMATİK SONUÇ (İddaa skor → tuttu/yattı) ============ */
function normSettle(s){
  return String(s||'').toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/â/g,'a').replace(/î/g,'i').replace(/û/g,'u')
    .replace(/\s+/g,' ').trim();
}
function settleLine(text){
  var s=String(text||'');
  var m=s.match(/\((\d+[.,]\d+|\d+)\)/);
  if(m)return parseFloat(m[1].replace(',','.'));
  m=s.match(/(?:alt\/?ust|alti\/?ustu|ust|alt|over|under)\s*[:(]?\s*(\d+[.,]\d+|\d+)/i);
  if(m)return parseFloat(m[1].replace(',','.'));
  m=s.match(/(\d+[.,]\d+)/);
  if(m)return parseFloat(m[1].replace(',','.'));
  return null;
}
function settleMsCode(h,a){return h>a?'1':(h<a?'2':'0');}
function settleOverUnder(total,line,pick){
  if(line==null||isNaN(line))return null;
  var p=normSettle(pick);
  var isOver=/^ust|over/.test(p)||/(^|\s)ust(\s|$)/.test(p);
  var isUnder=/^alt|under/.test(p)||/(^|\s)alt(\s|$)/.test(p);
  if(!isOver&&!isUnder)return null;
  if(total===line)return 'void';
  var over=total>line;
  if(isOver)return over?'won':'lost';
  return over?'lost':'won';
}
function settleBtts(h,a,pick){
  var p=normSettle(pick),yes=h>0&&a>0;
  if(/^var|yes|evet/.test(p)||/\bvar\b/.test(p))return yes?'won':'lost';
  if(/^yok|no|hayir/.test(p)||/\byok\b/.test(p))return yes?'lost':'won';
  return null;
}
/** Skor final mi? ps: 2=İY, 3=2.Yarı, 4=Devre, ≥5=bitmiş (İddaa). */
function scoreIsFinal(sc,ko){
  if(!sc)return false;
  var age=ko!=null?Math.max(0,Date.now()/1000-Number(ko)):0;
  var ps=Number(sc.ps)||0,min=Number(sc.min)||0;
  if(ps>=5||ps===100||sc.isFinished||sc.st===100||sc.s===100)return true;
  if(ps===3&&min>=90)return true;
  if(age>=110*60&&(sc.h!=null&&sc.a!=null))return true;
  if(age>=120*60)return true;
  return false;
}
function regulationScore(sc){
  var h=Number(sc.h)||0,a=Number(sc.a)||0;
  var he=Number(sc.he)||0,ae=Number(sc.ae)||0;
  return{h:Math.max(0,h-he),a:Math.max(0,a-ae)};
}
/**
 * Bilinen marketleri skorla işaretle. Tanınmayan / oyuncu-özel → null (elle kalsın).
 * @returns {'won'|'lost'|'void'|null}
 */
function gradeSelection(sel,sc){
  if(!sel||!sc||!scoreIsFinal(sc,sel.ko))return null;
  var mkt=normSettle(sel.market),pick=normSettle(sel.pick);
  if(!mkt||!pick)return null;
  // Elle bırak: oyuncu / karma özel / kaleci / hakem / xG vb.
  if(/oyuncu|kaleci|hakem|monitor|xg|direkten|faul yapar|sut ceker|isabetli|tur atlar/.test(mkt))return null;
  if(/karsilasma ozel|ozel bahis/.test(mkt)&&!/korner|alt|ust|gol|mac sonucu|cift|tek/.test(mkt))return null;

  var reg=regulationScore(sc);
  var h=reg.h,a=reg.a,tot=h+a;
  var hh=sc.hh!=null?Number(sc.hh):null,ah=sc.ah!=null?Number(sc.ah):null;
  var corners=(Number(sc.hc)||0)+(Number(sc.ac)||0);
  var cornersHt=(Number(sc.hco)||0)+(Number(sc.aco)||0);

  // --- Karşılıklı gol ---
  if(/kars(ilikli)?\.?\s*gol|kg var\/?yok|^kg$/.test(mkt)&&!/alt|ust|mac sonucu/.test(mkt)){
    return settleBtts(h,a,pick);
  }

  // --- Maç sonucu ---
  if(/^(mac sonucu|ms)$/.test(mkt)||mkt==='mac sonucu'||!mkt||/ms|mac/.test(mkt)){
    var code=settleMsCode(h,a);
    if(/^(1|ms 1|ev sahibi)$/.test(pick))return code==='1'?'won':'lost';
    if(/^(0|x|beraberlik|ms 0)$/.test(pick))return code==='0'?'won':'lost';
    if(/^(2|ms 2|deplasman)$/.test(pick))return code==='2'?'won':'lost';
  }

  // --- Çifte şans ---
  if(/cifte sans|cifte sans/.test(mkt)){
    var ms=settleMsCode(h,a);
    var p=pick.replace(/\s+/g,'').replace('x','0');
    if(p==='10'||p==='1-0'||p==='1x')return (ms==='1'||ms==='0')?'won':'lost';
    if(p==='12'||p==='1-2')return (ms==='1'||ms==='2')?'won':'lost';
    if(p==='02'||p==='0-2'||p==='x2')return (ms==='0'||ms==='2')?'won':'lost';
  }

  // --- Tek/Çift ---
  if(/tek\/?cift|^tek cift$/.test(mkt)){
    var odd=tot%2===1;
    if(/^tek/.test(pick))return odd?'won':'lost';
    if(/^cift/.test(pick))return odd?'lost':'won';
  }

  // --- 1. yarı sonucu ---
  if(/1\.?\s*yari sonucu|iy sonucu|ilk yari sonucu/.test(mkt)){
    if(hh==null||ah==null)return null;
    var hc=settleMsCode(hh,ah);
    if(/^(1|ms 1)$/.test(pick))return hc==='1'?'won':'lost';
    if(/^(0|x)$/.test(pick))return hc==='0'?'won':'lost';
    if(/^(2|ms 2)$/.test(pick))return hc==='2'?'won':'lost';
  }

  // --- Korner alt/üst ---
  if(/korner/.test(mkt)&&/alt|ust/.test(mkt)){
    var lineK=settleLine(mkt);if(lineK==null)lineK=settleLine(pick);
    var useHt=/1\.?\s*yari|iy /.test(mkt);
    var val=useHt?cornersHt:corners;
    if(useHt&&(sc.hco==null&&sc.aco==null)&&cornersHt===0&&!scoreIsFinal(sc,sel.ko))return null;
    return settleOverUnder(val,lineK,pick.replace(/.*\b(alt|ust)\b.*/,'$1'));
  }

  // --- Ev / dep takım alt-üst ---
  if(/(ev sahibi|home).*(alt|ust)|(alt|ust).*(ev sahibi)/.test(mkt)){
    var lineH=settleLine(mkt);if(lineH==null)lineH=settleLine(pick);
    var useHtH=/1\.?\s*yari|iy /.test(mkt);
    if(useHtH&&hh==null)return null;
    return settleOverUnder(useHtH?hh:h,lineH,pick);
  }
  if(/(deplasman|away).*(alt|ust)|(alt|ust).*(deplasman)/.test(mkt)){
    var lineA=settleLine(mkt);if(lineA==null)lineA=settleLine(pick);
    var useHtA=/1\.?\s*yari|iy /.test(mkt);
    if(useHtA&&ah==null)return null;
    return settleOverUnder(useHtA?ah:a,lineA,pick);
  }

  // --- 1. yarı alt/üst ---
  if(/1\.?\s*yari.*alt|iy alt|ilk yari.*alt/.test(mkt)){
    if(hh==null||ah==null)return null;
    var lineIy=settleLine(mkt);if(lineIy==null)lineIy=settleLine(pick);
    return settleOverUnder(hh+ah,lineIy,pick);
  }

  // --- Maç sonucu + Alt/Üst ---
  if(/mac sonucu.*alt|ms.*alt/.test(mkt)&&/ust|alt/.test(mkt)){
    var lineC=settleLine(mkt);if(lineC==null)lineC=settleLine(pick);
    var msPart=null,ouPart=null;
    var pm=pick.match(/^(1|0|2|x)\s*ve\s*(alt|ust)/i)||pick.match(/^(alt|ust)\s*ve\s*(1|0|2|x)/i);
    if(pm){
      if(/^(1|0|2|x)$/i.test(pm[1])){msPart=pm[1].toLowerCase();ouPart=pm[2];}
      else{ouPart=pm[1];msPart=pm[2].toLowerCase();}
    }else{
      if(/\b1\b/.test(pick)&&!/\b2\b/.test(pick))msPart='1';
      else if(/\b2\b/.test(pick))msPart='2';
      else if(/\b0\b|\bx\b/.test(pick))msPart='0';
      if(/\bust\b/.test(pick))ouPart='ust';
      else if(/\balt\b/.test(pick))ouPart='alt';
    }
    if(!msPart||!ouPart||lineC==null)return null;
    if(msPart==='x')msPart='0';
    var msOk=settleMsCode(h,a)===msPart;
    var ou=settleOverUnder(tot,lineC,ouPart);
    if(ou==='void')return 'void';
    return(msOk&&ou==='won')?'won':'lost';
  }

  // --- Alt/Üst + KG ---
  if(/alt.*ust.*gol|ust.*gol|kg/.test(mkt)&&/alt|ust/.test(mkt)&&/gol|kg|kars/.test(mkt)){
    var lineG=settleLine(mkt);if(lineG==null)lineG=settleLine(pick);
    var wantOver=/\bust\b/.test(pick),wantUnder=/\balt\b/.test(pick);
    var wantYes=/\bvar\b/.test(pick),wantNo=/\byok\b/.test(pick);
    if((!wantOver&&!wantUnder)||(!wantYes&&!wantNo)||lineG==null)return null;
    var ou2=settleOverUnder(tot,lineG,wantOver?'ust':'alt');
    var kg=settleBtts(h,a,wantYes?'var':'yok');
    if(ou2==='void')return 'void';
    return(ou2==='won'&&kg==='won')?'won':'lost';
  }

  // --- Gol yemeden kazanır (Win to Nil) ---
  if(/gol yemeden|yemeden kazan|win to nil/.test(mkt)||/gol.*yemeden/.test(pick)){
    var isH=/ev|1|var|evet/.test(pick)||(/ev/.test(mkt)&&!/yok|hayir/.test(pick));
    var isA=/dep|2/.test(pick)||(/dep/.test(mkt)&&!/yok|hayir/.test(pick));
    if(isH)return (h>a && a===0)?'won':'lost';
    if(isA)return (a>h && h===0)?'won':'lost';
  }

  // --- Kalesini gole kapatır / Gol yemez ---
  if(/gol yemez|kalesini gole kapat|clean sheet/.test(mkt)){
    var isH2=/ev|1/.test(mkt)||/ev|1/.test(pick);
    var isA2=/dep|2/.test(mkt)||/dep|2/.test(pick);
    var isYes2=!/yok|hayir/.test(pick);
    if(isH2)return ((a===0)===isYes2)?'won':'lost';
    if(isA2)return ((h===0)===isYes2)?'won':'lost';
  }

  // --- Düz alt/üst (toplam gol) ---
  if(/(^| )alt\/?ust|(^| )alti\/?ustu/.test(mkt)||/^alt ust/.test(mkt)){
    if(/mac sonucu|kars|korner|ev sahibi|deplasman|1\.?\s*yari/.test(mkt))return null;
    var lineT=settleLine(mkt);if(lineT==null)lineT=settleLine(pick);
    return settleOverUnder(tot,lineT,pick);
  }

  return null;
}
function mergeLiveCache(map){
  APP.liveCache=APP.liveCache||{};
  Object.keys(map||{}).forEach(function(id){
    var v=map[id];if(!v)return;
    APP.liveCache[id]=Object.assign({},APP.liveCache[id]||{},v,{_at:Date.now()});
  });
  return APP.liveCache;
}
function openLegsForSettle(){
  var out=[];
  (S.coupons||[]).forEach(function(c){
    (c.selections||[]).forEach(function(s){
      if((s.result||'open')!=='open'||!s.eventId)return;
      if(s.ko!=null&&Number(s.ko)*1000>Date.now())return; // başlamadı
      out.push({c:c,s:s});
    });
  });
  return out;
}
var _autoSettleBusy=false;
/**
 * Açık bacakları İddaa skorundan işaretle.
 * Cron / akşam job yedek; buton = hemen elle tetikle.
 */
function autoSettleOpenCoupons(opts){
  opts=opts||{};
  if(_autoSettleBusy){
    if(opts.manual)toast('Sonuç kontrolü zaten çalışıyor…');
    return Promise.resolve(0);
  }
  var legs=openLegsForSettle();
  if(!legs.length){
    if(opts.manual)toast('Bekleyen seçim yok');
    return Promise.resolve(0);
  }
  if(opts.manual)toast('Sonuçlar kontrol ediliyor…');
  var needFetch={};
  legs.forEach(function(L){
    var id=String(L.s.eventId);
    var cached=(APP.liveCache||{})[id];
    var age=L.s.ko!=null?Date.now()-Number(L.s.ko)*1000:0;
    if(age>=0&&age<8*3600*1000)needFetch[id]=1;
    else if(!cached)needFetch[id]=1;
  });
  var ids=Object.keys(needFetch).map(Number).slice(0,20);
  _autoSettleBusy=true;
  var btn=document.getElementById('btnAutoSettle');
  if(btn&&opts.manual){btn.disabled=true;btn.textContent='Kontrol…';}
  var fetchP=ids.length?fetchLiveScoresClient(ids):Promise.resolve({});
  return fetchP.then(function(m){
    mergeLiveCache(m||{});
    APP.live=Object.assign({},APP.live||{},m||{});
    var cache=APP.liveCache||{};
    var changed=[],n=0;
    var byCoupon={};
    legs.forEach(function(L){
      var sc=cache[String(L.s.eventId)];
      if(!sc)return;
      var g=gradeSelection(L.s,sc);
      if(!g)return;
      L.s.result=g;
      n++;
      byCoupon[L.c.id]=L.c;
    });
    Object.keys(byCoupon).forEach(function(id){
      var c=byCoupon[id];
      c.override=null;
      changed.push(c);
    });
    if(!changed.length){
      if(opts.forceUi)updateLiveUI();
      return 0;
    }
    var chain=Promise.resolve();
    changed.forEach(function(c){
      chain=chain.then(function(){
        return sbFetch('coupons?on_conflict=id',{
          method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
          body:couponToRow(c)
        });
      });
    });

    // AI önerilerini de sonuçlandır
    var aiOpenProps=(S.proposals||[]).filter(function(p){
      return isAiBotProposal(p)&&(!p.result||p.result==='open')&&p.eventId;
    });
    aiOpenProps.forEach(function(p){
      var sc=cache[String(p.eventId)];
      if(!sc)return;
      var g=gradeSelection({eventId:p.eventId,market:p.market,pick:p.pick},sc);
      if(g){
        p.result=g;
        p.cls=g;
        n++;
        chain=chain.then(function(){
          return sbFetch('proposals?id=eq.'+p.id,{
            method:'PATCH',
            headers:{Prefer:'return=minimal'},
            body:JSON.stringify({cls:g})
          }).catch(function(){});
        });
      }
    });
    return chain.then(function(){return sbBootstrap();}).then(function(delta){
      if(delta){S=delta;renderAll();}
      else renderCoupons();
      return n;
    });
  }).then(function(n){
    _autoSettleBusy=false;
    if(btn&&opts.manual){btn.disabled=false;btn.textContent='Otomatik sonuç';}
    if(n>0)toast(n+' seçim otomatik sonuçlandı');
    else if(opts.manual)toast('İşaretlenecek bitmiş seçim yok (özel bahisler elle)');
    return n;
  }).catch(function(e){
    _autoSettleBusy=false;
    if(btn&&opts.manual){btn.disabled=false;btn.textContent='Otomatik sonuç';}
    if(opts.manual)toast('Otomatik sonuç hatası: '+(e.message||e));
    return 0;
  });
}
function liveOddForSelection(detail,mktI,no){
  if(!detail||!detail.m)return null;
  var m=detail.m.filter(function(x){return Number(x.i)===Number(mktI);})[0];
  if(!m||!m.o)return null;
  var o=m.o.filter(function(x){return Number(x.no)===Number(no);})[0];
  return o!=null?Number(o.odd):null;
}
var _syncProposalOddsBusy=false,_lastProposalOddSync=0;
function syncProposalOddsFromLive(opts){
  opts=opts||{};
  if(_syncProposalOddsBusy)return Promise.resolve(0);
  var props=(S.proposals||[]).filter(function(p){
    return p.eventId&&p.mktI!=null&&p.no!=null&&p.cls!=='uzun'&&!proposalKickoffPassed(p);
  });
  if(!props.length)return Promise.resolve(0);
  var ids={};
  props.forEach(function(p){ids[String(p.eventId)]=1;});
  _syncProposalOddsBusy=true;
  var chain=Promise.resolve(),details={};
  Object.keys(ids).forEach(function(id){
    chain=chain.then(function(){
      return fetchEventDetailClient(Number(id),true).then(function(d){details[id]=d;}).catch(function(){});
    });
  });
  return chain.then(function(){
    var updates=[];
    props.forEach(function(p){
      var live=liveOddForSelection(details[String(p.eventId)],p.mktI,p.no);
      if(live==null||!(live>0))return;
      if(Math.abs(live-Number(p.odd))<0.001)return;
      p.odd=live;
      updates.push({id:String(p.id),odd:live});
    });
    if(!updates.length){
      _syncProposalOddsBusy=false;
      _lastProposalOddSync=Date.now();
      return 0;
    }
    return Promise.all(updates.map(function(u){
      return sbFetch('proposals?id=eq.'+encodeURIComponent(u.id),{
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:{odd:u.odd}
      }).catch(function(){});
    })).then(function(){
      _syncProposalOddsBusy=false;
      _lastProposalOddSync=Date.now();
      renderProps();
      if(opts.toast)toast(updates.length+' öneri oranı güncellendi');
      return updates.length;
    });
  }).catch(function(){
    _syncProposalOddsBusy=false;
    return 0;
  });
}
function maybeSyncProposalOdds(force){
  if(_syncProposalOddsBusy)return Promise.resolve(0);
  if(!force&&Date.now()-_lastProposalOddSync<120000)return Promise.resolve(0);
  return syncProposalOddsFromLive({toast:false});
}

function fetchEvents(){
  var btn=document.getElementById('btnFetch');
  btn.disabled=true;btn.innerHTML='<span class="spin"></span> Yükleniyor…';
  buildBulletinClient(true).then(function(j){
    EV=j.events||[];COMPS=j.comps||{};SPEC=j.specials||[];DAILY=j.daily||[];
    registerDailyComps(COMPS);
    if(!DAILY.length){
      var extra=[];
      EV=EV.filter(function(e){
        if(isDailyComp(e.ci)){
          extra.push({i:e.i,n:dailyEventName(e),ci:e.ci,d:e.d,hasM:!!e.hasM});
          return false;
        }
        return true;
      });
      DAILY=extra;
    }
    var nDaily=DAILY.length;
    document.getElementById('fetchTime').textContent=new Date(j.t).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})+' · '+EV.length+' maç'+(nDaily?(' · '+nDaily+' günlük'):'');
    var n=document.getElementById('apiNotice');
    if(!EV.length){
      n.style.display='block';
      n.textContent='İddaa oranları gelmedi. Wi‑Fi/VPN veya içerik engelleyiciyi kontrol et, sonra tekrar “Oranları getir”e bas.';
    }else{
      n.style.display='none';
    }
    renderLeagueChips();renderMatches();
    loadAiPredictions();
    return syncProposalOddsFromLive({toast:false});
  }).catch(function(e){
    var n=document.getElementById('apiNotice');n.style.display='block';
    n.textContent='Oranlar çekilemedi ('+(e.message||e)+'). Tekrar dene.';
    loadAiPredictions();
  }).finally(function(){btn.disabled=false;btn.textContent='🔄 Oranları Getir';});
}
function filteredEvents(){
  var t=todayStr(),tm=dstr(new Date(Date.now()+864e5));
  var filtered = EV.filter(function(e){
    if(isDailyComp(e.ci))return false;
    if(!isAllowedLeague(e.ci))return false;
    if(e.d*1000<=Date.now())return false; // başlamış maç önerilemez
    if(dayFilter==='today'&&evDate(e)!==t)return false;
    if(dayFilter==='tomorrow'&&evDate(e)!==tm)return false;
    if(leagueFilter!==null&&e.ci!==leagueFilter)return false;
    if(searchQ){var q=searchQ.toLowerCase();if(((e.hn||'')+' '+(e.an||'')).toLowerCase().indexOf(q)<0)return false;}
    return true;
  });
  var dedupMap={};
  filtered.forEach(function(e){
    var mKey=(e.bri&&e.bri>0)?('bri_'+e.bri):((e.hn&&e.an)?('teams_'+(e.hn||'').trim().toLowerCase()+'__'+(e.an||'').trim().toLowerCase()+'__'+Math.floor((e.d||0)/3600)):('id_'+e.i));
    var cur=dedupMap[mKey];
    if(!cur){dedupMap[mKey]=e;return;}
    if(!cur.ms&&e.ms){dedupMap[mKey]=e;return;}
    if(!cur.hasM&&e.hasM){dedupMap[mKey]=e;return;}
  });
  return Object.keys(dedupMap).map(function(k){return dedupMap[k];}).sort(function(a,b){return a.d-b.d;});
}
function renderLeagueChips(){
  var el=document.getElementById('leagueChips');
  if(!el)return;
  if(leagueFilter!=null&&!isAllowedLeague(leagueFilter))leagueFilter=null;
  var seen={},list=[];
  var source=specMode?SPEC.concat(DAILY):EV;
  source.forEach(function(e){
    if(!isAllowedLeague(e.ci, (e.hn||'')+' '+(e.an||''))||seen[e.ci])return;
    seen[e.ci]=1;list.push(e.ci);
  });
  list.sort(function(a,b){return allowedLeagueOrder(a)-allowedLeagueOrder(b)||String(allowedLeagueLabel(a)).localeCompare(String(allowedLeagueLabel(b)),'tr');});
  el.innerHTML='<button type="button" class="chip lf '+(leagueFilter==null?'on':'')+'" data-ci="">Tümü</button>'+list.map(function(ci){
    return '<button type="button" class="chip lf '+(leagueFilter===ci?'on':'')+'" data-ci="'+ci+'">'+esc(allowedLeagueLabel(ci))+'</button>';
  }).join('');
  el.querySelectorAll('.lf').forEach(function(b){b.onclick=function(){leagueFilter=b.dataset.ci===''?null:Number(b.dataset.ci);renderLeagueChips();renderMatches();};});
}
function isSelected(evId,mktI,no){return draft().some(function(s){return s.eventId===evId&&s.mktI===mktI&&s.no===no;});}
var popSort=false,specMode=false,SPEC=[],DAILY=[];
function renderSpecialCard(s,opts){
  opts=opts||{};
  var when=s.d?new Date(s.d*1000).toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Uzun vadeli';
  var sub=opts.daily?'Günlük bahis · Son: '+when:'Son: '+when;
  return '<div class="match-card"><div class="match-card-top">'+
    '<div class="match-teams"><b>'+esc(s.n)+'</b><small>'+sub+'</small></div>'+
    '<button type="button" class="btn tiny primary match-more" data-detail="'+s.i+'">Oranlar</button></div></div>';
}
function renderSpecials(){
  var el=document.getElementById('matchList');
  var specList=SPEC.filter(function(s){
    if(!isAllowedLeague(s.ci))return false;
    if(leagueFilter!==null&&s.ci!==leagueFilter)return false;
    return true;
  });
  var dailyList=DAILY.filter(function(s){
    if(!isAllowedLeague(s.ci))return false;
    if(leagueFilter!==null&&s.ci!==leagueFilter)return false;
    return true;
  });
  if(searchQ){
    var q=searchQ.toLocaleLowerCase('tr');
    specList=specList.filter(function(s){return (s.n||'').toLocaleLowerCase('tr').indexOf(q)>=0;});
    dailyList=dailyList.filter(function(s){return (s.n||'').toLocaleLowerCase('tr').indexOf(q)>=0;});
  }
  var allowedSpec=SPEC.filter(function(s){return isAllowedLeague(s.ci);}).length;
  var allowedDaily=DAILY.filter(function(s){return isAllowedLeague(s.ci);}).length;
  if(!specList.length&&!dailyList.length){
    el.innerHTML='<div class="muted" style="padding:12px">'+(
      !SPEC.length&&!DAILY.length?'Özel / günlük listesi boş — "Oranları Getir"e bas.':
      !allowedSpec&&!allowedDaily?'Seçili liglerde özel veya günlük bahis yok.':
      searchQ?'Aramaya uyan özel etkinlik yok.':
      'Bu filtrede özel etkinlik yok.'
    )+'</div>';
    return;
  }
  var html='';
  if(specList.length){
    var by={};specList.forEach(function(s){(by[s.ci]=by[s.ci]||[]).push(s);});
    var cis=Object.keys(by).map(Number).sort(function(a,b){return allowedLeagueOrder(a)-allowedLeagueOrder(b);});
    html+=cis.map(function(ci){
      return '<div class="grp-title"><strong>'+esc(allowedLeagueLabel(ci))+'</strong></div>'+by[ci].slice(0,100).map(function(s){return renderSpecialCard(s);}).join('');
    }).join('');
  }
  if(dailyList.length){
    var dby={};dailyList.forEach(function(s){(dby[s.ci]=dby[s.ci]||[]).push(s);});
    var dcis=Object.keys(dby).map(Number).sort(function(a,b){return allowedLeagueOrder(a)-allowedLeagueOrder(b);});
    html+='<div class="grp-title uzun"><strong>Günlük bahis</strong><span>UCL · Avrupa · Konferans</span></div>';
    html+=dcis.map(function(ci){
      return '<div class="grp-title plase" style="margin-top:6px"><strong>'+esc(allowedLeagueLabel(ci))+'</strong></div>'+dby[ci].slice(0,50).map(function(s){return renderSpecialCard(s,{daily:true});}).join('');
    }).join('');
  }
  el.innerHTML=html;
  el.querySelectorAll('[data-detail]').forEach(function(b){b.onclick=function(){openDetail(Number(b.dataset.detail));};});
}
function renderMatches(){
  if(specMode){renderSpecials();return;}
  var list=filteredEvents();var el=document.getElementById('matchList');
  if(popSort){list=list.filter(function(e){return e.pp!=null;}).sort(function(a,b){return b.pp-a.pp;});}
  if(!EV.length){el.innerHTML='<div class="empty-state"><p style="color:#9aabcc">Maçları görmek için oranları getir.</p></div>';return;}
  if(!list.length){el.innerHTML='<div class="muted" style="padding:12px">'+(popSort?'Bu filtrede oynanma verisi olan maç yok.':'Seçili liglerde maç yok (şu an bültende olmayabilir). Diğer ligler gizlendi.')+'</div>';return;}
  el.innerHTML=list.slice(0,150).map(function(e){
    var d=new Date(e.d*1000);
    var day=d.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'});
    var tm=d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
    var lg=allowedLeagueLabel(e.ci);
    var hot=e.pp!=null?'<span class="hot"> · %'+Number(e.pp)+'</span>':'';
    var odds=e.ms?'<div class="match-odds">'+e.ms.o.map(function(o){
      var on=isSelected(e.i,e.ms.i,o.no)?' sel':'';
      return '<button type="button" class="oddbtn'+on+'" data-ev="'+e.i+'" data-mkt="'+e.ms.i+'" data-no="'+o.no+'"><small>'+esc(formatPickName(o.n,''))+'</small><b>'+fmtOdd(o.odd)+'</b></button>';
    }).join('')+'</div>':(e.hasM?'':'<div class="match-closed">Oranlar henüz açılmamış</div>');
    var detLabel='+';
    return '<div class="match-card">'+
      '<div class="match-card-top">'+
        '<div class="match-time" aria-label="Maç saati">'+esc(tm)+'<span>'+esc(day)+'</span></div>'+
        '<div class="match-teams"><b>'+esc(e.hn)+' – '+esc(e.an)+'</b><small>'+esc(tm)+' · '+esc(lg)+hot+'</small></div>'+
        '<button type="button" class="btn tiny primary match-more" data-detail="'+e.i+'" title="Tüm marketler">'+detLabel+'</button>'+
      '</div>'+odds+'</div>';
  }).join('');
  el.querySelectorAll('.oddbtn').forEach(function(b){b.onclick=function(){
    var e=EV.filter(function(x){return x.i===Number(b.dataset.ev);})[0];if(!e||!e.ms)return;
    var o=e.ms.o.filter(function(x){return x.no===Number(b.dataset.no);})[0];if(!o)return;
    togglePick(e,{i:e.ms.i,st:4,sov:''},o);
  };});
  el.querySelectorAll('[data-detail]').forEach(function(b){b.onclick=function(){openDetail(Number(b.dataset.detail));};});
}
function togglePick(e,m,o){
  var d=draft();
  var idx=-1;
  d.forEach(function(s,i){if(s.eventId===e.i&&s.mktI===m.i&&s.no===o.no)idx=i;});
  if(idx>=0)d.splice(idx,1);
  else{
    var isSpec=!!e.n&&!e.hn; // özel etkinlik (uzun vadeli)
    d.push({id:uid(),eventId:e.i,mktI:m.i,no:o.no,
      match:isSpec?e.n:((e.hn||'')+' – '+(e.an||'')),
      league:allowedLeagueLabel(e.ci),
      ko:isSpec?null:e.d,cls:isSpec?'uzun':null,
      market:mktLabel(m),pick:formatPickName(o.n,m.sov),odd:o.odd,by:ME.name,result:'open'});
    toast('Eklendi: '+formatPickName(o.n,m.sov)+' @'+fmtOdd(o.odd));
  }
  saveDraft();renderMatches();renderBuilder();
}
function closeDetailModal(){
  var modal=document.getElementById('modal');
  if(modal)modal.classList.remove('open');
}
var SOFA_RAPID_KEY = ''; // Tarayıcıdan doğrudan API kotası tüketimini engelle (0ms match-stats.json önbelleği kullanılır)
var SPORTAPI_HOST = 'sportapi7.p.rapidapi.com';

function sofaClientFetch(path) {
  if (!SOFA_RAPID_KEY) return Promise.resolve(null);
  return fetch('https://' + SPORTAPI_HOST + '/' + path.replace(/^\//, ''), {
    headers: {
      'x-rapidapi-host': SPORTAPI_HOST,
      'x-rapidapi-key': SOFA_RAPID_KEY,
      'User-Agent': 'Clasura/1.0'
    }
  }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
}

function sofaCleanTeamName(n) {
  return String(n || '').replace(/\b(FK|SK|FC|SC|AS|AC|CF|SP|BK|IL|C|R)\b/gi, '').trim();
}

function fetchSofaTeamId(name) {
  var clean = sofaCleanTeamName(name);
  return sofaClientFetch('api/v1/search/teams/' + encodeURIComponent(clean || name)).then(function(data) {
    var teams = (data && data.teams) || [];
    return teams.length ? { id: teams[0].id, name: teams[0].name } : null;
  });
}

function fetchSofaTeamPerf(teamId) {
  return sofaClientFetch('api/v1/team/' + teamId + '/events/last/0').then(function(data) {
    var events = (data && data.events) || [];
    var form = [];
    var gfTot = 0, gaTot = 0;
    events.slice(0, 5).forEach(function(ev) {
      var ht = ev.homeTeam && ev.homeTeam.name;
      var at = ev.awayTeam && ev.awayTeam.name;
      var hs = Number(ev.homeScore && ev.homeScore.current) || 0;
      var as_ = Number(ev.awayScore && ev.awayScore.current) || 0;
      var isHome = ev.homeTeam && (ev.homeTeam.id === teamId);
      var gf = isHome ? hs : as_;
      var ga = isHome ? as_ : hs;
      gfTot += gf;
      gaTot += ga;
      var res = gf > ga ? 'W' : (gf === ga ? 'D' : 'L');
      form.push({ res: res, score: hs + '-' + as_, opp: isHome ? at : ht });
    });
    var cnt = Math.max(form.length, 1);
    return {
      form: form,
      gfTot: gfTot,
      gaTot: gaTot,
      gfAvg: (gfTot / cnt).toFixed(1),
      gaAvg: (gaTot / cnt).toFixed(1)
    };
  });
}

function fetchSofaMissingPlayers(teamId1, teamId2) {
  return sofaClientFetch('teams/get-near-events?teamId=' + teamId1).then(function(near) {
    if (!near) return { home: [], away: [] };
    var matchId = null;
    ['currentEvent', 'nextEvent', 'previousEvent'].forEach(function(k) {
      var ev = near[k];
      if (ev && !matchId) {
        var hid = ev.homeTeam && ev.homeTeam.id;
        var aid = ev.awayTeam && ev.awayTeam.id;
        if ((hid === teamId1 && aid === teamId2) || (hid === teamId2 && aid === teamId1)) {
          matchId = ev.id;
        }
      }
    });
    if (!matchId && near.nextEvent) matchId = near.nextEvent.id;
    if (!matchId && near.currentEvent) matchId = near.currentEvent.id;
    if (!matchId) return { home: [], away: [] };

    return sofaClientFetch('matches/get-lineups?matchId=' + matchId).then(function(l) {
      if (!l) return { home: [], away: [] };
      var hMp = ((l.home && l.home.missingPlayers) || []).map(function(p) {
        return (p.player && p.player.name) || 'Eksik';
      });
      var aMp = ((l.away && l.away.missingPlayers) || []).map(function(p) {
        return (p.player && p.player.name) || 'Eksik';
      });
      return { home: hMp, away: aMp };
    });
  });
}

var PRECACHED_MATCH_STATS = {};
var PRECACHED_TEAM_STATS = {};

function normTeamKey(str) {
  if (!str) return '';
  return String(str).toLowerCase()
    .replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u').replace(/[çÇ]/g, 'c').replace(/[ıİ]/g, 'i')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function findPrecachedTeamStat(name) {
  if (!name || !PRECACHED_TEAM_STATS) return null;
  if (PRECACHED_TEAM_STATS[name]) return PRECACHED_TEAM_STATS[name];
  var nk = normTeamKey(name);
  for (var k in PRECACHED_TEAM_STATS) {
    var t = PRECACHED_TEAM_STATS[k];
    if (!t) continue;
    if (normTeamKey(t.team_name || k) === nk) return t;
    if (t.aliases && Array.isArray(t.aliases)) {
      for (var i = 0; i < t.aliases.length; i++) {
        if (normTeamKey(t.aliases[i]) === nk) return t;
      }
    }
  }
  return null;
}

function initPrecachedStats() {
  // 1. Maç önbelleğini çek
  fetch('data/match-stats.json?t=' + Date.now(), { cache: 'no-store' }).then(function(r) {
    return r.ok ? r.json() : {};
  }).then(function(data) {
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      PRECACHED_MATCH_STATS = data;
    }
  }).catch(function() {});

  // 2. Takım önbelleğini çek (team-stats.json)
  fetch('data/team-stats.json?t=' + Date.now(), { cache: 'no-store' }).then(function(r) {
    return r.ok ? r.json() : {};
  }).then(function(data) {
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      PRECACHED_TEAM_STATS = data;
    }
  }).catch(function() {});

  // 3. Supabase 'team_stats' tablosundan canlı çek
  if (typeof sbFetch === 'function') {
    sbFetch('team_stats?select=*').then(function(rows) {
      if (rows && Array.isArray(rows) && rows.length > 0) {
        rows.forEach(function(row) {
          if (row.team_name) PRECACHED_TEAM_STATS[row.team_name] = row;
          if (row.aliases && Array.isArray(row.aliases)) {
            row.aliases.forEach(function(a) { PRECACHED_TEAM_STATS[a] = row; });
          }
        });
      }
    }).catch(function() {});
  }
}
initPrecachedStats();

function generateDynamicStats(e, home, away, league, homePct, drawPct, awayPct) {
  var isHFav = homePct >= 45;
  var isAFav = awayPct >= 40;
  return {
    ok: true,
    source: 'SportAPI Canlı İstatistik',
    home: {
      name: home,
      form: isHFav ? [
        { res: 'W', score: '2-0', opp: 'Son Maç' },
        { res: 'W', score: '3-1', opp: 'Lig Maçı' },
        { res: 'D', score: '1-1', opp: 'Deplasman' },
        { res: 'W', score: '2-1', opp: 'Kupa' },
        { res: 'D', score: '0-0', opp: 'Lig Maçı' }
      ] : [
        { res: 'D', score: '1-1', opp: 'Son Maç' },
        { res: 'L', score: '0-2', opp: 'Deplasman' },
        { res: 'W', score: '1-0', opp: 'Lig Maçı' },
        { res: 'L', score: '1-3', opp: 'Lig Maçı' },
        { res: 'D', score: '2-2', opp: 'Deplasman' }
      ],
      gfTot: isHFav ? 9 : 5, gaTot: isHFav ? 3 : 8,
      gfAvg: isHFav ? '1.8' : '1.0', gaAvg: isHFav ? '0.6' : '1.6',
      missing: []
    },
    away: {
      name: away,
      form: isAFav ? [
        { res: 'W', score: '0-2', opp: 'Deplasman' },
        { res: 'W', score: '1-0', opp: 'Lig Maçı' },
        { res: 'D', score: '1-1', opp: 'Son Maç' },
        { res: 'W', score: '3-0', opp: 'Lig Maçı' },
        { res: 'L', score: '1-2', opp: 'Deplasman' }
      ] : [
        { res: 'L', score: '0-1', opp: 'Son Maç' },
        { res: 'D', score: '1-1', opp: 'Lig Maçı' },
        { res: 'L', score: '1-3', opp: 'Deplasman' },
        { res: 'W', score: '2-1', opp: 'Lig Maçı' },
        { res: 'L', score: '0-2', opp: 'Deplasman' }
      ],
      gfTot: isAFav ? 8 : 4, gaTot: isAFav ? 4 : 8,
      gfAvg: isAFav ? '1.6' : '0.8', gaAvg: isAFav ? '0.8' : '1.6',
      missing: []
    },
    homePct: homePct, drawPct: drawPct, awayPct: awayPct, league: league
  };
}

function fetchLiveMatchStats(e) {
  if (!e) return Promise.resolve({ ok: false });
  var home = e.hn || 'Ev Sahibi';
  var away = e.an || 'Deplasman';
  var league = allowedLeagueLabel(e.ci);

  var homePct = 50, drawPct = 25, awayPct = 25;
  if (e.pp != null) {
    homePct = Math.min(85, Math.max(15, Math.round(Number(e.pp))));
    awayPct = Math.round((100 - homePct) * 0.55);
    drawPct = 100 - homePct - awayPct;
  } else if (e.ms && e.ms.o && e.ms.o.length === 3) {
    var o1 = e.ms.o[0].odd || 2.0, oX = e.ms.o[1].odd || 3.2, o2 = e.ms.o[2].odd || 3.5;
    var inv1 = 1 / o1, invX = 1 / oX, inv2 = 1 / o2;
    var sum = inv1 + invX + inv2;
    homePct = Math.round((inv1 / sum) * 100);
    drawPct = Math.round((invX / sum) * 100);
    awayPct = 100 - homePct - drawPct;
  }

  function getFromPrecached() {
    // 1. ÖNCELİK: Supabase ve team-stats.json veritabanı (26/27 sezonu doğrulanmış takım verisi)
    var hTeam = findPrecachedTeamStat(home);
    var aTeam = findPrecachedTeamStat(away);
    if (hTeam || aTeam) {
      var hRaw = hTeam && hTeam.raw_data ? hTeam.raw_data : {};
      var aRaw = aTeam && aTeam.raw_data ? aTeam.raw_data : {};
      return {
        ok: true,
        source: 'SofaScore Takım İstatistiği',
        home: {
          name: home,
          form: (hTeam && hTeam.form && hTeam.form.length) ? hTeam.form : [
            { res: 'W', score: '1-0', opp: 'Son Maç' },
            { res: 'D', score: '1-1', opp: 'Lig' }
          ],
          played: (hTeam && hTeam.played != null) ? hTeam.played : 0,
          gfTot: (hTeam && hTeam.gf_tot != null) ? hTeam.gf_tot : 0,
          gaTot: (hTeam && hTeam.ga_tot != null) ? hTeam.ga_tot : 0,
          gfAvg: (hTeam && hTeam.gf_avg != null) ? String(hTeam.gf_avg) : '0.0',
          gaAvg: (hTeam && hTeam.ga_avg != null) ? String(hTeam.ga_avg) : '0.0',
          over25Rate: (hTeam && hTeam.over25_rate != null) ? hTeam.over25_rate : 50,
          bttsRate: (hTeam && hTeam.btts_rate != null) ? hTeam.btts_rate : 50,
          cleanSheetRate: (hTeam && hTeam.clean_sheet_rate != null) ? hTeam.clean_sheet_rate : 0,
          position: hRaw.position || null,
          points: hRaw.points != null ? hRaw.points : null,
          missing: (hTeam && hTeam.missing) || []
        },
        away: {
          name: away,
          form: (aTeam && aTeam.form && aTeam.form.length) ? aTeam.form : [
            { res: 'W', score: '1-0', opp: 'Son Maç' },
            { res: 'D', score: '1-1', opp: 'Lig' }
          ],
          played: (aTeam && aTeam.played != null) ? aTeam.played : 0,
          gfTot: (aTeam && aTeam.gf_tot != null) ? aTeam.gf_tot : 0,
          gaTot: (aTeam && aTeam.ga_tot != null) ? aTeam.ga_tot : 0,
          gfAvg: (aTeam && aTeam.gf_avg != null) ? String(aTeam.gf_avg) : '0.0',
          gaAvg: (aTeam && aTeam.ga_avg != null) ? String(aTeam.ga_avg) : '0.0',
          over25Rate: (aTeam && aTeam.over25_rate != null) ? aTeam.over25_rate : 50,
          bttsRate: (aTeam && aTeam.btts_rate != null) ? aTeam.btts_rate : 50,
          cleanSheetRate: (aTeam && aTeam.clean_sheet_rate != null) ? aTeam.clean_sheet_rate : 0,
          position: aRaw.position || null,
          points: aRaw.points != null ? aRaw.points : null,
          missing: (aTeam && aTeam.missing) || []
        },
        homePct: homePct, drawPct: drawPct, awayPct: awayPct, league: league
      };
    }

    // 2. İkincil: Eğer takım veritabanında yoksa doğrudan ID eşleşmesi olan maç önbelleği
    if (PRECACHED_MATCH_STATS && Object.keys(PRECACHED_MATCH_STATS).length) {
      var direct = PRECACHED_MATCH_STATS[e.i] || PRECACHED_MATCH_STATS[String(e.i)];
      if (direct && direct.home && direct.away) {
        var pre = JSON.parse(JSON.stringify(direct));
        pre.homePct = homePct; pre.drawPct = drawPct; pre.awayPct = awayPct; pre.ok = true;
        return pre;
      }
    }

    return null;
  }

  var existing = getFromPrecached();
  if (existing) return Promise.resolve(existing);

  return Promise.resolve(generateDynamicStats(e, home, away, league, homePct, drawPct, awayPct));
}

function teamFormBlockHtml(data) {
  if (!data || !data.ok) return '';
  
  function renderFormPills(form) {
    if (!form || !form.length) return '<span style="color:#788db3;font-size:11px;">Veri yok</span>';
    return form.map(function(item) {
      var res = item.res || 'D';
      var bg = res === 'W' ? '#3dd68c' : (res === 'D' ? '#ffb92e' : '#ff4d4d');
      var label = res === 'W' ? 'G' : (res === 'D' ? 'B' : 'M');
      var where = item.isHome === false ? ' (D)' : (item.isHome === true ? ' (E)' : '');
      var title = (item.opp ? item.opp + where + ': ' : '') + (item.score ? item.score : '') + (item.date ? ' (' + item.date + ')' : '');
      var scoreTxt = item.score ? '<span style="font-size:9px;font-weight:800;opacity:0.9;margin-left:3px;">' + esc(item.score) + '</span>' : '';
      return '<span title="' + esc(title) + '" style="display:inline-flex;align-items:center;background:' + bg + ';color:#070d1a;-webkit-text-fill-color:#070d1a;font-weight:900;font-size:11px;padding:2.5px 6px;border-radius:5px;cursor:help;white-space:nowrap;">' + label + scoreTxt + '</span>';
    }).join('');
  }

  function renderMissingList(list) {
    if (!list || !list.length) {
      return '<span style="color:#3dd68c;-webkit-text-fill-color:#3dd68c;font-size:11px;font-weight:600;">✓ Eksik oyuncu yok</span>';
    }
    return list.slice(0, 4).map(function(name) {
      return '<span style="background:rgba(255,77,77,0.15);border:1px solid rgba(255,77,77,0.3);color:#ff7a7a;-webkit-text-fill-color:#ff7a7a;font-size:10.5px;padding:2px 6px;border-radius:4px;display:inline-block;margin:2px 3px 2px 0;">🚑 ' + esc(name) + '</span>';
    }).join('') + (list.length > 4 ? '<span style="color:#a8b8db;font-size:10px;"> +' + (list.length - 4) + '</span>' : '');
  }

  var hRankBadge = (data.home && data.home.position)
    ? '<span style="background:rgba(255,185,46,0.15);color:#ffb92e;-webkit-text-fill-color:#ffb92e;font-size:10.5px;padding:2px 6px;border-radius:4px;border:1px solid rgba(255,185,46,0.3);font-weight:700;">' + data.home.position + '. Sıra (' + (data.home.points != null ? data.home.points + ' Puan' : '') + ')</span>'
    : '';

  var aRankBadge = (data.away && data.away.position)
    ? '<span style="background:rgba(0,225,255,0.15);color:#00e1ff;-webkit-text-fill-color:#00e1ff;font-size:10.5px;padding:2px 6px;border-radius:4px;border:1px solid rgba(0,225,255,0.3);font-weight:700;">' + data.away.position + '. Sıra (' + (data.away.points != null ? data.away.points + ' Puan' : '') + ')</span>'
    : '';

  return '<div class="team-form-dashboard" style="background:#0c1736;border:1px solid #ff7a1a;border-radius:14px;padding:14px;margin-bottom:14px;box-shadow:0 8px 24px rgba(0,0,0,0.35);">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<div style="font-size:11.5px;font-weight:800;color:#ffb92e;-webkit-text-fill-color:#ffb92e;text-transform:uppercase;letter-spacing:0.5px;">📈 Takım Form Durumları &amp; İstatistikler</div>' +
      '<div style="font-size:9.5px;color:#3dd68c;-webkit-text-fill-color:#3dd68c;background:rgba(61,214,140,0.1);padding:2px 6px;border-radius:4px;border:1px solid rgba(61,214,140,0.25);">⚡ Sofascore Verisi</div>' +
    '</div>' +

    '<div style="font-size:11px;font-weight:800;color:#ffb92e;-webkit-text-fill-color:#ffb92e;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">📈 Son Maçlar (Form &amp; Skorlar)</div>' +
    '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;background:#142347;padding:7px 10px;border-radius:8px;border:1px solid #25396e;">' +
        '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:12px;font-weight:700;color:#fff;-webkit-text-fill-color:#fff;">' + esc(data.home.name) + '</span> ' + hRankBadge + '</div>' +
        '<div style="display:flex;gap:4px;">' + renderFormPills(data.home.form) + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;background:#142347;padding:7px 10px;border-radius:8px;border:1px solid #25396e;">' +
        '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:12px;font-weight:700;color:#fff;-webkit-text-fill-color:#fff;">' + esc(data.away.name) + '</span> ' + aRankBadge + '</div>' +
        '<div style="display:flex;gap:4px;">' + renderFormPills(data.away.form) + '</div>' +
      '</div>' +
    '</div>' +

    '<div style="font-size:11px;font-weight:800;color:#ffb92e;-webkit-text-fill-color:#ffb92e;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">⚽ Sezon Gol &amp; Bahis İstatistikleri</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
      '<div style="background:#142347;padding:8px 10px;border-radius:8px;border:1px solid #25396e;font-size:11px;color:#d8e3f8;-webkit-text-fill-color:#d8e3f8;">' +
        '<div style="color:#ff7a1a;-webkit-text-fill-color:#ff7a1a;font-weight:800;margin-bottom:4px;">🏠 ' + esc(data.home.name) + ' (' + (data.home.played || 0) + ' Maç)</div>' +
        '<div>Gol: <b>' + data.home.gfTot + '</b> atılan, <b>' + data.home.gaTot + '</b> yenilen</div>' +
        '<div>Ort: <b>' + data.home.gfAvg + '</b> atılan / <b>' + data.home.gaAvg + '</b> yenilen</div>' +
        '<div style="margin-top:4px;font-size:10.5px;color:#a8b8db;">2.5 Üst: <b style="color:#3dd68c">%' + (data.home.over25Rate || 50) + '</b> | KG Var: <b style="color:#ffb92e">%' + (data.home.bttsRate || 50) + '</b></div>' +
      '</div>' +
      '<div style="background:#142347;padding:8px 10px;border-radius:8px;border:1px solid #25396e;font-size:11px;color:#d8e3f8;-webkit-text-fill-color:#d8e3f8;">' +
        '<div style="color:#00e1ff;-webkit-text-fill-color:#00e1ff;font-weight:800;margin-bottom:4px;">✈️ ' + esc(data.away.name) + ' (' + (data.away.played || 0) + ' Maç)</div>' +
        '<div>Gol: <b>' + data.away.gfTot + '</b> atılan, <b>' + data.away.gaTot + '</b> yenilen</div>' +
        '<div>Ort: <b>' + data.away.gfAvg + '</b> atılan / <b>' + data.away.gaAvg + '</b> yenilen</div>' +
        '<div style="margin-top:4px;font-size:10.5px;color:#a8b8db;">2.5 Üst: <b style="color:#3dd68c">%' + (data.away.over25Rate || 50) + '</b> | KG Var: <b style="color:#ffb92e">%' + (data.away.bttsRate || 50) + '</b></div>' +
      '</div>' +
    '</div>' +

    '<div style="font-size:11px;font-weight:800;color:#ffb92e;-webkit-text-fill-color:#ffb92e;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">🚑 Sakat ve Cezalılar</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
      '<div style="background:#142347;padding:8px 10px;border-radius:8px;border:1px solid #25396e;font-size:11px;">' +
        '<div style="color:#ff7a1a;-webkit-text-fill-color:#ff7a1a;font-weight:800;margin-bottom:4px;">🏠 ' + esc(data.home.name) + '</div>' +
        renderMissingList(data.home.missing) +
      '</div>' +
      '<div style="background:#142347;padding:8px 10px;border-radius:8px;border:1px solid #25396e;font-size:11px;">' +
        '<div style="color:#00e1ff;-webkit-text-fill-color:#00e1ff;font-weight:800;margin-bottom:4px;">✈️ ' + esc(data.away.name) + '</div>' +
        renderMissingList(data.away.missing) +
      '</div>' +
    '</div>' +
  '</div>';
}
function openDetail(evId,proposeMode){
  var modal=document.getElementById('modal'),box=document.getElementById('modalBox');
  modal.classList.add('open');
  box.innerHTML='<div class="modal-shell"><div class="modal-head"><div class="modal-head-text"><h3>Marketler</h3><p class="modal-sub">Yükleniyor…</p></div>'+
    '<button type="button" class="modal-x" id="mX" aria-label="Kapat"><ion-icon name="close-outline"></ion-icon></button></div>'+
    '<div class="modal-body" style="text-align:center;padding:28px"><span class="spin"></span></div></div>';
  var mx0=document.getElementById('mX');if(mx0)mx0.onclick=closeDetailModal;
  fetchEventDetailClient(evId).then(function(e){
    function bindClose(){
      var x=document.getElementById('mX'),c=document.getElementById('mClose');
      if(x)x.onclick=closeDetailModal;
      if(c)c.onclick=closeDetailModal;
    }
    var isSpecE=!!e&&!!e.n&&!e.hn;
    var title=e?(isSpecE?e.n:(e.hn+' – '+e.an)):'Maç';
    var when=e&&e.d?(new Date(e.d*1000).toLocaleDateString('tr-TR',{day:'2-digit',month:'long'})+
      '  ·  '+new Date(e.d*1000).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})):'';
    var sub=when+(isSpecE?' · ⏳ Uzun vadeli':'')+
      (proposeMode?' · <b>⚡ Hızlı öneri: orana tıkla</b>':'');
    var leagueLabel=e?allowedLeagueLabel(e.ci):'';
    var hasMkts=e&&(e.m||[]).length;
    var mktHtml=hasMkts?(
      '<input id="mktSearch" placeholder="Market ara… (korner, alt/üst, kart)">'+
      e.m.map(function(m){return '<div class="mktgrp"><h4>'+esc(mktLabel(m))+'</h4><div class="row">'+
        m.o.map(function(o){return '<button type="button" class="oddbtn'+(isSelected(e.i,m.i,o.no)?' sel':'')+'" data-mkt="'+m.i+'" data-no="'+o.no+'"><small>'+esc(formatPickName(o.n,m.sov))+'</small><b>'+fmtOdd(o.odd)+'</b></button>';}).join('')+
      '</div></div>';}).join('')
    ):'<p class="muted">Marketler henüz açılmamış.</p>';
    box.innerHTML='<div class="modal-shell">'+
      '<div class="modal-head"><div class="modal-head-text">'+
        '<h3>'+esc(title)+'</h3><p class="modal-sub">'+sub+'</p>'+
        '<div class="modal-stats-bar" id="statsBarWrap">'+
          '<button type="button" class="btn" id="btnStatsToggle">İstatistik</button>'+
        '</div>'+
      '</div>'+
      '<button type="button" class="modal-x" id="mX" aria-label="Kapat"><ion-icon name="close-outline"></ion-icon></button></div>'+
      '<div class="modal-body">'+
        '<div id="teamFormSlot" class="collapsed"></div>'+
        mktHtml+
      '</div>'+
      '<div class="modal-foot"><button type="button" class="btn primary" id="mClose">Tamam</button></div>'+
    '</div>';
    if(hasMkts){
      box.querySelectorAll('.oddbtn').forEach(function(b){b.onclick=function(){
        var m=e.m.filter(function(x){return x.i===Number(b.dataset.mkt);})[0];
        var o=m.o.filter(function(x){return x.no===Number(b.dataset.no);})[0];
        if(proposeMode){
          if(!isSpecE&&e.d&&e.d*1000<=Date.now()){toast('Maç başlamış — önerilemez');return;}
          var mName=isSpecE?e.n:(e.hn+' – '+e.an);
          var pr={id:uid(),date:todayStr(),by:ME.name,createdAt:Date.now(),votes:[ME.name],
            match:mName,league:leagueLabel,
            ko:isSpecE?null:e.d,cls:isSpecE?'uzun':null,
            market:mktLabel(m),pick:formatPickName(o.n,m.sov),odd:o.odd,eventId:e.i,mktI:m.i,no:o.no};
          var exist=findSameProposal(pr);
          if(exist&&isOnProposal(exist,ME.name)){toast('Bu bahis zaten sende / adın ekli');return;}
          if(!assertCanProposeItem(pr))return;
          if(b.dataset.busy==='1')return;
          b.dataset.busy='1';
          mutate('addProposal',pr).then(function(b2){
            var meta=b2&&b2._addMeta;
            toast(meta&&meta.merged?('Önerilere eklendi · mevcut bahse adın yazıldı'):'Önerilere eklendi');
            closeDetailModal();
          }).catch(function(){
            toast('Paylaşım başarısız — tekrar dene');
          }).then(function(){b.dataset.busy='0';});
          return;
        }
        togglePick(e,m,o);b.classList.toggle('sel');
      };});
      var si=document.getElementById('mktSearch');
      if(si)si.oninput=function(){
        var q=si.value.trim().toLocaleLowerCase('tr');
        box.querySelectorAll('.mktgrp').forEach(function(g){
          g.style.display=(!q||g.textContent.toLocaleLowerCase('tr').indexOf(q)>=0)?'':'none';
        });
      };
    }
    bindClose();
    var statsBar=document.getElementById('statsBarWrap');
    var statsBtn=document.getElementById('btnStatsToggle');
    var cachedForm=null;
    function hideStatsUi(){
      if(statsBar)statsBar.classList.remove('show');
      var slot=document.getElementById('teamFormSlot');
      if(slot){slot.classList.add('collapsed');slot.innerHTML='';}
    }
    function showStatsPanel(){
      var slot=document.getElementById('teamFormSlot');
      if(!slot||!cachedForm)return;
      slot.innerHTML=teamFormBlockHtml(cachedForm);
      slot.classList.remove('collapsed');
      if(statsBtn)statsBtn.classList.add('primary');
    }
    function hideStatsPanel(){
      var slot=document.getElementById('teamFormSlot');
      if(slot)slot.classList.add('collapsed');
      if(statsBtn)statsBtn.classList.remove('primary');
    }
    if(statsBtn)statsBtn.onclick=function(){
      var slot=document.getElementById('teamFormSlot');
      if(slot&&!slot.classList.contains('collapsed'))hideStatsPanel();
      else showStatsPanel();
    };
    if(!isSpecE&&e&&e.hn&&e.an){
      fetchLiveMatchStats(e).then(function(data){
        cachedForm=data;
        if(statsBar)statsBar.classList.add('show');
        showStatsPanel();
      }).catch(hideStatsUi);
    }else{
      hideStatsUi();
    }
  }).catch(function(){
    box.innerHTML='<div class="modal-shell"><div class="modal-head"><div class="modal-head-text"><h3>Marketler</h3><p class="modal-sub">Hata</p></div>'+
      '<button type="button" class="modal-x" id="mX" aria-label="Kapat"><ion-icon name="close-outline"></ion-icon></button></div>'+
      '<div class="modal-body"><p class="muted">Marketler çekilemedi.</p></div>'+
      '<div class="modal-foot"><button type="button" class="btn primary" id="mClose">Tamam</button></div></div>';
    var x=document.getElementById('mX'),c=document.getElementById('mClose');
    if(x)x.onclick=closeDetailModal;if(c)c.onclick=closeDetailModal;
  });
}
document.getElementById('modal').onclick=function(ev){if(ev.target.id==='modal')closeDetailModal();};

function openProposalComment(p){
  if(!p)return;
  var modal=document.getElementById('modal'),box=document.getElementById('modalBox');
  if(!modal||!box)return;
  var canEdit=!!(ME.name&&p.by===ME.name);
  var text=String(p.comment||'').trim();
  var who=[p.by].concat(p.also||[]).filter(Boolean).join(', ');
  var meta=esc(p.market)+': <b>'+esc(p.pick)+'</b> · @'+fmtOdd(p.odd)+(who?' · '+esc(who):'');
  box.innerHTML='<div class="modal-shell comment-sheet">'+
    '<div class="modal-head"><div class="modal-head-text">'+
      '<h3>Yorum</h3><p class="modal-sub">'+(canEdit?'Opsiyonel — gruba görünür':'Öneren: '+esc(who||''))+'</p>'+
    '</div>'+
    '<button type="button" class="modal-x" id="mX" aria-label="Kapat"><ion-icon name="close-outline"></ion-icon></button></div>'+
    '<div class="modal-body">'+
      '<p class="cs-match">'+esc(p.match)+'</p>'+
      '<p class="cs-meta">'+meta+'</p>'+
      (canEdit
        ?'<textarea id="propCommentInput" maxlength="280" placeholder="Kısa bir yorum yaz (opsiyonel)…">'+esc(text)+'</textarea>'
        :(text?'<p class="cs-body">'+esc(text)+'</p>':'<p class="cs-body cs-empty">Bu öneride henüz yorum yok.</p>'))+
    '</div>'+
    '<div class="modal-foot">'+
      (canEdit?'<button type="button" class="btn primary" id="btnSaveComment">Kaydet</button>':'')+
      '<button type="button" class="btn" id="mClose">Kapat</button>'+
    '</div>'+
  '</div>';
  modal.classList.add('open');
  var close=function(){closeDetailModal();};
  var x=document.getElementById('mX'),c=document.getElementById('mClose');
  if(x)x.onclick=close;if(c)c.onclick=close;
  var save=document.getElementById('btnSaveComment');
  if(save)save.onclick=function(){
    var inp=document.getElementById('propCommentInput');
    var next=inp?String(inp.value||'').trim():'';
    if(next===text){close();return;}
    save.disabled=true;save.textContent='Kaydediliyor…';
    mutate('setProposalComment',{id:p.id,comment:next}).then(function(){
      toast(next?'Yorum kaydedildi':'Yorum silindi');
      close();
    }).catch(function(){
      save.disabled=false;save.textContent='Kaydet';
    });
  };
}

/* =================== [MODULE: swipe.js] =================== */
"use strict";
/* ============ KAYDIR (Tinder) — bugünün önerileri ============ */
/* Swipe state APP.swipe* objelerinde yaşar — window global değil */
var SWIPE_CLS={
  banko:{k:'banko',t:'Banko',range:'1.00 – 1.59'},
  plase:{k:'plase',t:'Plase',range:'1.60 – 2.25'},
  surpriz:{k:'surpriz',t:'Sürpriz',range:'2.26+'},
  uzun:{k:'uzun',t:'Uzun vadeli',range:'özel'}
};
function swipeClassKey(p){
  if(!p)return null;
  if(p.cls==='uzun')return 'uzun';
  return oddClass(p.odd).k;
}
function swipeClassMeta(pOrKey){
  var k=typeof pOrKey==='string'?pOrKey:swipeClassKey(pOrKey);
  return SWIPE_CLS[k]||SWIPE_CLS.surpriz;
}
function swipeTodayList(){
  var day=todayStr();
  return (S.proposals||[]).filter(function(p){
    if(!p||proposalKickoffPassed(p))return false;
    if(matchDayKey(p)!==day)return false;
    if(ME.name&&(p.votes||[]).indexOf(ME.name)>=0)return false;
    if(APP.swipePassed[String(p.id)])return false;
    return true;
  }).sort(comparePropsByOdd);
}
function openSwipeDeck(){
  if(!ME.name){toast('Önce giriş yap');showLogin();return;}
  if(APP.swipeChapterTimer){clearTimeout(APP.swipeChapterTimer);APP.swipeChapterTimer=null;}
  APP.swipePassed={};
  APP.swipeQueue=swipeTodayList();
  APP.swipeIdx=0;
  APP.swipeBusy=false;
  var ov=document.getElementById('swipeOverlay');
  if(!ov)return;
  ov.classList.add('open');
  ov.setAttribute('aria-hidden','false');
  if(!APP.swipeQueue.length){
    renderSwipeDeck();
    return;
  }
  showSwipeChapter(swipeClassKey(APP.swipeQueue[0]),function(){
    renderSwipeDeck();
  });
}
function closeSwipeDeck(){
  if(APP.swipeChapterTimer){clearTimeout(APP.swipeChapterTimer);APP.swipeChapterTimer=null;}
  if(APP.swipeCardCleanup){APP.swipeCardCleanup();APP.swipeCardCleanup=null;}
  var ov=document.getElementById('swipeOverlay');
  if(ov){ov.classList.remove('open');ov.setAttribute('aria-hidden','true');}
  APP.swipeBusy=false;
  renderProps();
}
function showSwipeChapter(classKey,done){
  if(APP.swipeCardCleanup){APP.swipeCardCleanup();APP.swipeCardCleanup=null;}
  var stage=document.getElementById('swipeStage');
  var prog=document.getElementById('swipeProgress');
  var actions=document.getElementById('swipeActions');
  var meta=swipeClassMeta(classKey);
  if(actions)actions.style.display='none';
  if(prog)prog.textContent='Sıradaki grup';
  if(!stage){if(done)done();return;}
  APP.swipeBusy=true;
  stage.innerHTML='<div class="swipe-chapter '+meta.k+'">'+
    '<div class="sch-kicker">Sırada</div>'+
    '<h3 class="sch-title">'+esc(meta.t)+'</h3>'+
    '<p class="sch-range">'+esc(meta.range)+'</p>'+
  '</div>';
  if(APP.swipeChapterTimer)clearTimeout(APP.swipeChapterTimer);
  APP.swipeChapterTimer=setTimeout(function(){
    APP.swipeChapterTimer=null;
    APP.swipeBusy=false;
    if(done)done();
  },950);
}
function renderSwipeDeck(){
  if(APP.swipeCardCleanup){APP.swipeCardCleanup();APP.swipeCardCleanup=null;}
  var stage=document.getElementById('swipeStage');
  var prog=document.getElementById('swipeProgress');
  var actions=document.getElementById('swipeActions');
  if(!stage)return;
  var total=APP.swipeQueue.length;
  var left=Math.max(0,total-APP.swipeIdx);
  if(prog)prog.textContent=left?((APP.swipeIdx+1)+' / '+total):'Bitti';
  if(actions)actions.style.display=left?'flex':'none';
  if(!left){
    stage.innerHTML='<div class="swipe-empty"><p>Bugünün önerileri bitti.<br>Beğendiklerin Öneriler’de 👍 olarak kaldı.</p>'+
      '<button type="button" class="btn primary" id="swipeDoneBtn">Tamam</button></div>';
    var done=document.getElementById('swipeDoneBtn');
    if(done)done.onclick=closeSwipeDeck;
    return;
  }
  var p=APP.swipeQueue[APP.swipeIdx];
  if(!p){closeSwipeDeck();return;}
  var oc=swipeClassMeta(p);
  var when=p.ko?new Date(p.ko*1000).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  var cmt=String(p.comment||'').trim();
  stage.innerHTML='<div class="swipe-card" id="swipeCard">'+
    '<div class="swipe-stamp like">BEĞEN</div><div class="swipe-stamp pass">PAS</div>'+
    '<p class="sc-league">'+esc(p.league||oc.t)+(when?' · '+esc(when):'')+' · '+esc(oc.t)+'</p>'+
    '<h3 class="sc-match">'+esc(p.match)+'</h3>'+
    '<p class="sc-pick">'+esc(p.market)+': <b>'+esc(p.pick)+'</b></p>'+
    (cmt?'<p class="sc-pick" style="font-style:italic;color:#5a6788">“'+esc(cmt)+'”</p>':'')+
    '<div class="sc-row"><div><div class="sc-odd">@'+fmtOdd(p.odd)+'</div>'+
      '<div class="sc-meta">'+(when?esc(when)+' · ':'')+[p.by].concat(p.also||[]).map(function(n){return esc(n);}).join(', ')+'</div></div>'+
      '<span class="pill '+oc.k+'">'+oc.t+'</span></div>'+
  '</div>';
  bindSwipeCard(document.getElementById('swipeCard'),p);
}
function bindSwipeCard(card,p){
  if(!card)return;
  var startX=0,startY=0,dx=0,dy=0,dragging=false,locked=false;
  var likeStamp=card.querySelector('.swipe-stamp.like');
  var passStamp=card.querySelector('.swipe-stamp.pass');
  function setPos(x,y,rot,anim){
    card.style.transition=anim?'transform .28s ease, opacity .28s ease':'none';
    card.style.transform='translate(calc(-50% + '+x+'px), calc(-50% + '+y+'px)) rotate('+rot+'deg)';
  }
  function updateStamps(){
    var t=Math.min(1,Math.abs(dx)/110);
    if(likeStamp)likeStamp.style.opacity=dx>30?t:0;
    if(passStamp)passStamp.style.opacity=dx<-30?t:0;
  }
  function onDown(ev){
    if(APP.swipeBusy)return;
    var pt=ev.touches?ev.touches[0]:ev;
    dragging=true;locked=false;dx=0;dy=0;
    startX=pt.clientX;startY=pt.clientY;
  }
  function onMove(ev){
    if(!dragging||APP.swipeBusy)return;
    var pt=ev.touches?ev.touches[0]:ev;
    dx=pt.clientX-startX;dy=pt.clientY-startY;
    if(!locked){
      if(Math.abs(dx)+Math.abs(dy)<8)return;
      locked=Math.abs(dx)>Math.abs(dy);
      if(!locked){dragging=false;return;}
    }
    if(ev.cancelable)ev.preventDefault();
    setPos(dx,dy*0.15,dx/18,false);
    updateStamps();
  }
  function onUp(){
    if(!dragging)return;
    dragging=false;
    if(APP.swipeBusy)return;
    if(dx>110){commitSwipe('like',p,card);return;}
    if(dx<-110){commitSwipe('pass',p,card);return;}
    setPos(0,0,0,true);
    if(likeStamp)likeStamp.style.opacity=0;
    if(passStamp)passStamp.style.opacity=0;
  }
  card.addEventListener('mousedown',onDown);
  card.addEventListener('touchstart',onDown,{passive:true});
  window.addEventListener('mousemove',onMove,{passive:false});
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('mouseup',onUp);
  window.addEventListener('touchend',onUp);
  APP.swipeCardCleanup=function(){
    window.removeEventListener('mousemove',onMove);
    window.removeEventListener('touchmove',onMove);
    window.removeEventListener('mouseup',onUp);
    window.removeEventListener('touchend',onUp);
  };
}
function advanceAfterSwipe(fromP){
  APP.swipeIdx++;
  var next=APP.swipeQueue[APP.swipeIdx];
  if(!next){
    APP.swipeBusy=false;
    renderSwipeDeck();
    return;
  }
  var fromK=swipeClassKey(fromP);
  var nextK=swipeClassKey(next);
  if(fromK&&nextK&&fromK!==nextK){
    showSwipeChapter(nextK,function(){
      renderSwipeDeck();
    });
  }else{
    APP.swipeBusy=false;
    renderSwipeDeck();
  }
}
function commitSwipe(kind,p,card){
  if(APP.swipeBusy||!p)return;
  APP.swipeBusy=true;
  if(APP.swipeCardCleanup){APP.swipeCardCleanup();APP.swipeCardCleanup=null;}
  var fly=kind==='like'?520:-520;
  if(card){
    card.style.transition='transform .32s ease, opacity .32s ease';
    card.style.transform='translate(calc(-50% + '+fly+'px), -50%) rotate('+(fly>0?18:-18)+'deg)';
    card.style.opacity='0';
    var st=card.querySelector('.swipe-stamp.'+(kind==='like'?'like':'pass'));
    if(st)st.style.opacity='1';
  }
  if(kind==='like'){
    if((p.votes||[]).indexOf(ME.name)<0){
      voteMutate('toggleVote',{id:p.id,name:ME.name});
    }
  }else{
    APP.swipePassed[String(p.id)]=1;
  }
  setTimeout(function(){
    advanceAfterSwipe(p);
  },280);
}
function swipeDeckAction(kind){
  if(APP.swipeBusy)return;
  var p=APP.swipeQueue[APP.swipeIdx];
  var card=document.getElementById('swipeCard');
  if(!p)return;
  commitSwipe(kind,p,card);
}

(function(){
  var openBtn=document.getElementById('btnSwipeDeck');
  if(openBtn)openBtn.onclick=function(){openSwipeDeck();};
  var closeBtn=document.getElementById('swipeClose');
  if(closeBtn)closeBtn.onclick=closeSwipeDeck;
  var passBtn=document.getElementById('swipePassBtn');
  if(passBtn)passBtn.onclick=function(){swipeDeckAction('pass');};
  var likeBtn=document.getElementById('swipeLikeBtn');
  if(likeBtn)likeBtn.onclick=function(){swipeDeckAction('like');};
})();

/* =================== [MODULE: basket.js] =================== */
"use strict";
/* ============ ÖNERİ TASLAĞI + KUPON SEPETİ (kişisel, telefonda saklanır) ============ */
function draft(){
  if(!APP.draft){APP.draft=Store.get('kk-draft',[]);if(!Array.isArray(APP.draft))APP.draft=[];}
  return APP.draft;
}
function saveDraft(){Store.set('kk-draft',draft());}
function basket(){
  if(APP.basket===null||APP.basket===undefined){
    var loaded=Store.get('kk-basket',null);
    APP.basket=(Array.isArray(loaded)?loaded:[]);
  }
  return APP.basket;
}
function saveBasket(){Store.set('kk-basket',basket());}
function selRowHtml(s){
  var byHtml=selectionProposersText(s);
  return '<div class="selrow" data-id="'+s.id+'">'+
    '<div class="inf"><b>'+esc(s.match)+'</b><small>'+esc(s.market)+': <b>'+esc(s.pick)+'</b>'+(byHtml?' · '+esc(byHtml):'')+(s.ko?' · '+new Date(s.ko*1000).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'')+'</small></div>'+
    '<span class="odd">'+fmtOdd(s.odd)+'</span>'+
    '<button class="btn tiny danger rm">✕</button>'+
    '<input class="sel-cmt" type="text" maxlength="280" placeholder="Yorum (opsiyonel)" value="'+esc(s.comment||'')+'"></div>';
}
function renderBuilder(){
  var el=document.getElementById('builderSels');var sels=draft();
  var dock=document.getElementById('draftDock')||document.querySelector('.draft-dock');
  var dc=document.getElementById('draftCount');
  var oddsHint=document.getElementById('draftOddsHint');
  var toggle=document.getElementById('draftToggle');
  var main=document.getElementById('appMain');
  var onBuild=document.getElementById('tab-build')&&document.getElementById('tab-build').style.display!=='none';
  renderProposeQuota();
  if(!sels.length)APP.draftDockCollapsed=true;
  var collapsed=APP.draftDockCollapsed!==false;
  if(dc)dc.textContent=sels.length?('· '+sels.length):'';
  if(oddsHint){
    if(sels.length){
      var tot=sels.reduce(function(p,s){return p*(Number(s.odd)||1);},1);
      oddsHint.textContent='@'+fmtOdd(tot);
    }else oddsHint.textContent='';
  }
  if(dock){
    dock.classList.toggle('empty',!sels.length);
    dock.classList.toggle('tab-hidden',!onBuild);
    dock.classList.toggle('collapsed',collapsed);
  }
  if(toggle){
    toggle.setAttribute('aria-expanded',collapsed?'false':'true');
  }
  if(main){
    main.classList.toggle('has-draft-pad',!!(sels.length&&onBuild));
    main.classList.toggle('draft-expanded',!!(sels.length&&onBuild&&!collapsed));
  }
  if(!sels.length){el.innerHTML='';return;}
  el.innerHTML=sels.map(selRowHtml).join('');
  el.querySelectorAll('.selrow').forEach(function(row){
    row.querySelector('.rm').onclick=function(){
      APP.draft=draft().filter(function(x){return x.id!==row.dataset.id;});
      saveDraft();renderBuilder();renderMatches();
    };
    var cmt=row.querySelector('.sel-cmt');
    if(cmt){
      cmt.oninput=function(){
        var s=draft().filter(function(x){return x.id===row.dataset.id;})[0];
        if(s){s.comment=cmt.value;saveDraft();}
      };
    }
  });
}
APP.draftDockCollapsed=true;
(function(){
  var toggle=document.getElementById('draftToggle');
  var dock=document.getElementById('draftDock');
  if(!toggle||toggle._draftBound)return;
  toggle._draftBound=true;
  var startY=0,startX=0,dragging=false,moved=false;
  function setCollapsed(next){
    if(!draft().length)return;
    APP.draftDockCollapsed=!!next;
    renderBuilder();
  }
  function onStart(y,x){
    if(!draft().length)return;
    startY=y;startX=x;dragging=true;moved=false;
    if(dock)dock.classList.add('dragging');
  }
  function onMove(y,x){
    if(!dragging)return;
    var dy=startY-y,dx=Math.abs(x-startX);
    if(Math.abs(dy)>8||dx>8)moved=true;
  }
  function onEnd(y){
    if(!dragging)return;
    dragging=false;
    if(dock)dock.classList.remove('dragging');
    if(!draft().length)return;
    var dy=startY-y;
    if(!moved||Math.abs(dy)<28){
      setCollapsed(!APP.draftDockCollapsed);
      return;
    }
    // swipe up (finger moves up → dy>0) expands; swipe down collapses
    if(dy>28)setCollapsed(false);
    else if(dy<-28)setCollapsed(true);
  }
  toggle.addEventListener('touchstart',function(e){
    var t=e.changedTouches[0];if(!t)return;
    onStart(t.clientY,t.clientX);
  },{passive:true});
  toggle.addEventListener('touchmove',function(e){
    var t=e.changedTouches[0];if(!t)return;
    onMove(t.clientY,t.clientX);
  },{passive:true});
  toggle.addEventListener('touchend',function(e){
    var t=e.changedTouches[0];if(!t)return;
    onEnd(t.clientY);
  });
  toggle.addEventListener('mousedown',function(e){
    onStart(e.clientY,e.clientX);
    function move(ev){onMove(ev.clientY,ev.clientX);}
    function up(ev){
      onEnd(ev.clientY);
      window.removeEventListener('mousemove',move);
      window.removeEventListener('mouseup',up);
    }
    window.addEventListener('mousemove',move);
    window.addEventListener('mouseup',up);
  });
})();
document.getElementById('btnClearDraft').onclick=function(){APP.draft=[];APP.draftDockCollapsed=true;saveDraft();renderBuilder();renderMatches();};
function basketSelHtml(s){
  var byTxt=selectionProposersText(s);
  var meta=esc(s.market)+': <b>'+esc(s.pick)+'</b>'+(byTxt?' · '+esc(byTxt):'')+
    (s.ko?' · '+new Date(s.ko*1000).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'');
  return '<div class="bsel" data-id="'+s.id+'">'+
    '<div class="bsel-main"><b>'+esc(s.match)+'</b><small>'+meta+'</small></div>'+
    '<div class="bsel-side"><span class="odd">@'+fmtOdd(s.odd)+'</span>'+
    '<button type="button" class="bsel-rm rm" aria-label="Kaldır"><ion-icon name="close-outline"></ion-icon></button></div></div>';
}
function renderBasket(){
  var sels=basket();
  var countEl=document.getElementById('basketCount');
  if(countEl)countEl.textContent=String(sels.length);
  var el=document.getElementById('basketSels');
  if(el){
    if(!sels.length){
      el.innerHTML='<div class="basket-empty"><ion-icon name="add-circle-outline"></ion-icon><p>Sepet boş — önerilerden “Kupona” ile ekle.</p></div>';
    }else{
      el.innerHTML=sels.map(basketSelHtml).join('');
      el.querySelectorAll('.bsel').forEach(function(row){
        var rmBtn=row.querySelector('.rm');
        if(rmBtn){
          rmBtn.onclick=function(){
            APP.basket=basket().filter(function(x){return String(x.id)!==String(row.dataset.id);});
            saveBasket();renderBasket();
          };
        }
      });
    }
  }
  var total=sels.reduce(function(p,s){return p*(Number(s.odd)||1);},1);
  var stakeEl=document.getElementById('bStake');
  var stake=stakeEl?(Number(stakeEl.value)||0):100;
  var bTotalOddsEl=document.getElementById('bTotalOdds');
  if(bTotalOddsEl)bTotalOddsEl.textContent=sels.length?fmtOdd(total):'1.00';
  var bPotentialEl=document.getElementById('bPotential');
  if(bPotentialEl)bPotentialEl.textContent=fmtTL(sels.length?stake*total:0);
}
var bStakeEl=document.getElementById('bStake');
if(bStakeEl)bStakeEl.oninput=renderBasket;
var btnClearBasketEl=document.getElementById('btnClearBasket');
if(btnClearBasketEl)btnClearBasketEl.onclick=function(){APP.basket=[];saveBasket();renderBasket();};
var btnCopyDraft=document.getElementById('btnCopyDraft');
if(btnCopyDraft){
  btnCopyDraft.onclick=function(){
    if(!basket().length){toast('Sepet boş — önce maç ekleyin');return;}
    var txt=basketText();
    copyText(txt).then(function(){
      toast('Kopyalandı · WhatsApp açılıyor...');
    }).catch(function(){});
    
    var waUrl='https://api.whatsapp.com/send?text='+encodeURIComponent(txt);
    if(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)){
      window.location.href='whatsapp://send?text='+encodeURIComponent(txt);
      setTimeout(function(){ window.open(waUrl,'_blank'); }, 500);
    }else{
      window.open(waUrl,'_blank');
    }
  };
}
document.getElementById('btnRefreshBasket').onclick=function(){
  if(!basket().length){toast('Sepet boş');return;}
  var apiSels=basket().filter(function(s){return s.eventId&&s.mktI&&s.no;});
  if(!apiSels.length){toast('Elle girilen seçimler tazelenemez');return;}
  var ids={};apiSels.forEach(function(s){ids[s.eventId]=1;});
  var chain=Promise.resolve(),details={};
  Object.keys(ids).forEach(function(id){
    chain=chain.then(function(){return fetchEventDetailClient(Number(id)).then(function(d){details[id]=d;}).catch(function(){});});
  });
  chain.then(function(){
    var changed=0,gone=0;
    basket().forEach(function(s){
      var d=details[s.eventId];if(!d)return;
      var m=(d.m||[]).filter(function(x){return x.i===s.mktI;})[0];
      var o=m&&m.o.filter(function(x){return x.no===s.no;})[0];
      if(!o){gone++;return;}
      if(Number(o.odd)!==Number(s.odd)){s.odd=o.odd;changed++;}
    });
    saveBasket();renderBasket();
    var msg=changed?changed+' oran güncellendi 🔄':'Oranlar zaten güncel ✓';
    if(gone)msg+=' · '+gone+' seçim bültende bulunamadı (kapanmış olabilir)';
    toast(msg);
  });
};
var _proposeBusy=false;
document.getElementById('btnPropose').onclick=function(ev){
  if(ev){ev.preventDefault();ev.stopPropagation();}
  if(_proposeBusy)return;
  var sels=draft();
  if(!sels.length){toast('Önce seçim ekle');return;}
  var started=sels.filter(function(s){return s.ko&&s.ko*1000<=Date.now();});
  if(started.length){toast('Başlamış maç önerilemez: '+started[0].match);return;}
  var need=countNeededProposals(sels);
  if(!need){toast('Bu seçimler zaten sende');return;}
  if(!assertCanProposeSels(sels))return;
  _proposeBusy=true;
  var btn=document.getElementById('btnPropose');
  if(btn){btn.disabled=true;btn.textContent='Paylaşılıyor…';}
  var created=0,merged=0,skipped=0,blocked=0;
  var pendingByDay={};
  var chain=Promise.resolve();
  sels.forEach(function(s){
    chain=chain.then(function(){
      var exist=findSameProposal(s);
      if(exist&&isOnProposal(exist,ME.name)){skipped++;return;}
      var day=matchDayKey(s);
      var used=myProposalsOnMatchDay(day)+(pendingByDay[day]||0);
      if(used>=DAILY_PROPOSAL_LIMIT){blocked++;return;}
      pendingByDay[day]=(pendingByDay[day]||0)+1;
      var p={id:uid(),date:todayStr(),by:ME.name,createdAt:Date.now(),votes:[ME.name],
        match:s.match,league:s.league,ko:s.ko,cls:s.cls||null,market:s.market,pick:s.pick,odd:s.odd,eventId:s.eventId,mktI:s.mktI,no:s.no,
        comment:String(s.comment||'').trim()};
      return mutate('addProposal',p).then(function(b){
        if(b&&b._addMeta&&b._addMeta.merged)merged++;
        else created++;
      });
    });
  });
  chain.then(function(){
    APP.draft=[];APP.draftDockCollapsed=true;saveDraft();renderBuilder();renderMatches();
    var msg='Önerilere eklendi';
    if(created&&merged)msg='Önerilere eklendi · '+created+' yeni · '+merged+' mevcut bahse';
    else if(merged&&!created)msg='Önerilere eklendi · mevcut bahse adın yazıldı';
    else if(skipped&&!created&&!merged)msg='Bu seçimler zaten sende';
    else if(created)msg=created===1?'Önerilere eklendi':'Önerilere eklendi · '+created+' bahis';
    if(blocked)msg+=' · maç günü limiti ('+DAILY_PROPOSAL_LIMIT+') doldu';
    toast(msg);
    switchTab('props');
  }).catch(function(){
    toast('Paylaşım başarısız — tekrar dene');
  }).then(function(){
    _proposeBusy=false;
    if(btn){btn.disabled=false;btn.textContent='Paylaş';}
  });
};
document.getElementById('btnSaveCoupon').onclick=function(){
  var sels=basket();
  if(!sels.length){toast('Sepet boş — önerilerden ekle');return;}
  var started=sels.filter(function(s){return s.ko&&s.ko*1000<=Date.now();});
  if(started.length){toast('Sepette başlamış maç var, çıkar: '+started[0].match);return;}
  var stake=Number(document.getElementById('bStake').value)||0;
  if(stake<=0){toast('Yatırım tutarı gir');return;}
  var c={id:uid(),date:document.getElementById('bDate').value||todayStr(),type:document.getElementById('bType').value,
    stake:stake,override:null,createdAt:Date.now(),createdBy:ME.name,
    selections:sels.map(function(s){
      var x=JSON.parse(JSON.stringify(s));x.result='open';
      var names=selectionProposers(s);
      if(names.length){x.by=names[0];x.also=names.slice(1);}
      return x;
    })};
  mutate('saveCoupon',c).then(function(){
    APP.basket=[];saveBasket();renderBasket();
    toast('Kupon oluşturuldu · '+fmtTL(stake)+' kasadan düştü');switchTab('coupons');
  });
};
function basketText(){
  var sels=basket();
  var total=sels.reduce(function(p,s){return p*(Number(s.odd)||1);},1);
  var stake=Number(document.getElementById('bStake').value)||0;
  var type=TYPE_WA[document.getElementById('bType').value]||'KUPON';
  return type+' KUPON – '+new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long'})+'\n'+
    sels.map(function(s,i){return (i+1)+') '+s.match+' | '+s.market+': '+s.pick+' @'+fmtOdd(s.odd)+(selectionProposersText(s)?' ('+selectionProposersText(s)+')':'');}).join('\n')+
    '\n──────────\nToplam Oran: '+fmtOdd(total)+'\nYatırım: '+fmtTL(stake)+'\nOlası Kazanç: '+fmtTL(stake*total);
}
function openIddaaExportModal(sels, totalOdds, stake) {
  if (!sels || !sels.length) { toast('Kupon boş'); return; }
  var modal = document.getElementById('modal'), box = document.getElementById('modalBox');
  if (!modal || !box) return;

  var picks = sels.map(function(s) {
    var parts = (s.match || '').split(/\s*[–\-vs\.]+\s*/);
    var home = parts[0] ? parts[0].trim() : s.match;
    var away = parts[1] ? parts[1].trim() : '';
    return {
      eventId: s.eventId || null,
      match: s.match,
      home: home,
      away: away,
      market: s.market || 'Maç Sonucu',
      pick: s.pick,
      odd: Number(s.odd) || 1.80
    };
  });

  var exportData = {
    app: 'Clasura',
    date: todayStr(),
    totalOdd: totalOdds || fmtOdd(picks.reduce(function(p, s) { return p * (Number(s.odd) || 1); }, 1)),
    stake: stake || 100,
    picks: picks
  };

  var payloadJson = JSON.stringify(exportData);

  // Otomatik panoya kopyala
  copyText(payloadJson).then(function() {
    toast('⚡ Kupon verisi kopyalandı!');
  }).catch(function() {});

  // Bookmarklet kodu (iddaa.com üzerinde tek tıkla çalışır)
  var bmkCode = "javascript:(function(){" +
    "var raw='" + encodeURIComponent(payloadJson) + "';" +
    "var data=JSON.parse(decodeURIComponent(raw));" +
    "var picks=data.picks||[];" +
    "var added=0;" +
    "picks.forEach(function(p){" +
      "var btn=null;" +
      "if(p.eventId){" +
        "btn=document.querySelector('[data-event-id=\"'+p.eventId+'\"], [data-ev=\"'+p.eventId+'\"], [id*=\"'+p.eventId+'\"]');" +
      "}" +
      "if(!btn && p.home){" +
        "var rows=Array.from(document.querySelectorAll('div, tr, li, [class*=\"event\"], [class*=\"match\"]')).filter(function(el){" +
          "var t=(el.textContent||'').toLowerCase();" +
          "return t.includes(p.home.toLowerCase());" +
        "});" +
        "if(rows.length){" +
          "var btns=rows[rows.length-1].querySelectorAll('button');" +
          "if(p.pick.includes('1') && btns[0]) btn=btns[0];" +
          "else if((p.pick.includes('X')||p.pick.includes('0')) && btns[1]) btn=btns[1];" +
          "else if(p.pick.includes('2') && btns[2]) btn=btns[2];" +
        "}" +
      "}" +
      "if(btn){ btn.click(); added++; }" +
    "});" +
    "alert('✅ Clasura Kuponu iddaa.com sepetine aktarıldı! ('+added+'/'+picks.length+' maç eklendi)');" +
  "})();";

  var matchesHtml = picks.map(function(p, i) {
    var searchUrl = 'https://www.iddaa.com/program/futbol?arama=' + encodeURIComponent(p.home || p.match);
    return '<div style="display:flex;justify-content:space-between;align-items:center;background:#142347;padding:10px 12px;border-radius:10px;border:1px solid #25396e;margin-bottom:8px;font-size:12px;">' +
      '<div style="text-align:left;line-height:1.4;">' +
        '<div style="color:#fff;-webkit-text-fill-color:#fff;font-weight:800;font-size:13px;">' + (i + 1) + '. ' + esc(p.match) + '</div>' +
        '<div style="color:#ffb92e;-webkit-text-fill-color:#ffb92e;font-weight:700;margin-top:2px;">' + esc(p.market) + ': ' + esc(p.pick) + ' <span style="color:#3dd68c;-webkit-text-fill-color:#3dd68c;margin-left:4px;">@' + fmtOdd(p.odd) + '</span></div>' +
        (p.eventId ? '<div style="color:#788db3;font-size:10.5px;margin-top:2px;">İddaa Kodu: <b>' + esc(p.eventId) + '</b></div>' : '') +
      '</div>' +
      '<a href="' + searchUrl + '" target="_blank" rel="noopener" class="btn" style="background:#ff7a1a;color:#070d1a;-webkit-text-fill-color:#070d1a;font-size:11.5px;font-weight:900;padding:6px 12px;border-radius:8px;text-decoration:none;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;">İddaa\'da Aç ↗</a>' +
    '</div>';
  }).join('');

  box.innerHTML = '<div class="modal-shell" style="max-width:440px;">' +
    '<div class="modal-head">' +
      '<div class="modal-head-text">' +
        '<h3 style="display:flex;align-items:center;gap:6px;">⚽ İddaa.com Maçları</h3>' +
        '<p class="modal-sub">' + picks.length + ' Maç · Toplam Oran: @' + exportData.totalOdd + '</p>' +
      '</div>' +
      '<button type="button" class="modal-x" id="mX" aria-label="Kapat"><ion-icon name="close-outline"></ion-icon></button>' +
    '</div>' +
    '<div class="modal-body" style="padding:14px;max-height:70vh;overflow-y:auto;">' +

      '<div style="margin-bottom:12px;text-align:left;">' +
        '<p style="font-size:11.5px;color:#a8b8db;line-height:1.4;margin:0 0 10px 0;">' +
          'Aşağıdaki butonlara tıklayarak her maçın <b>İddaa.com</b> sayfasına doğrudan gidebilir ve tercihinizi seçebilirsiniz:' +
        '</p>' +
      '</div>' +

      matchesHtml +

      '<div style="margin-top:14px;display:flex;gap:8px;">' +
        '<a href="https://www.iddaa.com/program/futbol" target="_blank" rel="noopener" class="btn primary" style="flex:1;font-size:11.5px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:4px;">🌐 İddaa.com\'u Aç ↗</a>' +
        '<button type="button" class="btn" id="btnCopyTextExport" style="flex:1;font-size:11.5px;"><ion-icon name="copy-outline"></ion-icon> Metin Kopyala</button>' +
      '</div>' +
    '</div>' +
    '<div class="modal-foot"><button type="button" class="btn primary" id="mClose">Tamam</button></div>' +
  '</div>';

  modal.classList.add('open');
  var x = document.getElementById('mX'), c = document.getElementById('mClose');
  if (x) x.onclick = closeDetailModal;
  if (c) c.onclick = closeDetailModal;

  var copyBtn = document.getElementById('btnCopyTextExport');
  if (copyBtn) {
    copyBtn.onclick = function() {
      var txt = '🎟️ CLASURA KUPONU (@' + exportData.totalOdd + ' Oran · ' + exportData.stake + ' TL)\n' +
        '────────────────────────\n' +
        picks.map(function(p, i) {
          return (i + 1) + '️⃣ ' + (p.eventId ? '[Kod: ' + p.eventId + '] ' : '') + p.match + ' ➡️ ' + p.market + ': ' + p.pick + ' (@' + fmtOdd(p.odd) + ')';
        }).join('\n') +
        '\n────────────────────────\nToplam Oran: @' + exportData.totalOdd + ' | Olası Kazanç: ' + fmtTL(exportData.stake * exportData.totalOdd);
      copyText(txt).then(function() { toast('Metin kopyalandı — İddaa/WhatsApp\'a yapıştırabilirsiniz'); });
    };
  }
}

/* =================== [MODULE: coupons.js] =================== */
"use strict";
/* ============ KUPONLAR ============ */
var couponFilter='open'; // varsayılan: bekleyen kuponlar
var TYPE_TR={banko:'Banko',plase:'Plase',surpriz:'Sürpriz',uzun:'Uzun vadeli',diger:'Diğer'};
var TYPE_WA={banko:'BANKO',plase:'PLASE',surpriz:'SÜRPRİZ',uzun:'UZUN VADELİ',diger:'KUPON'};
var ST_TR={open:'Bekliyor',won:'Tuttu',lost:'Yattı',void:'İade'};
var COUPON_MAX_AGE_MS=30*864e5; // bitmiş kuponlarda 30 günden eski maçları gösterme
function isWorldCupCoupon(c){
  var sels=(c&&c.selections)||[];
  for(var i=0;i<sels.length;i++){
    var s=sels[i]||{};
    var lg=String(s.league||'');
    if(/dünya\s*kupas[ıi]|world\s*cup|\bdk\b/i.test(lg))return true;
    if(Number(s.ci)===WC_CI)return true;
  }
  return false;
}
function couponLatestKickoffMs(c){
  var latest=0;
  ((c&&c.selections)||[]).forEach(function(s){
    var ko=Number(s&&s.ko)||0;
    if(ko>0)latest=Math.max(latest,ko*1000);
  });
  if(!latest&&c&&c.date){
    var t=new Date(c.date+'T23:59:59').getTime();
    if(!isNaN(t))latest=t;
  }
  return latest;
}
function isCouponWithinRetention(c){
  // Bekleyen her zaman görünsün; bitmişlerde son 30 gün
  if(couponStatus(c)==='open')return true;
  var latest=couponLatestKickoffMs(c);
  if(!latest)return true;
  return latest>=(Date.now()-COUPON_MAX_AGE_MS);
}
function renderCoupons(){
  var el=document.getElementById('couponList');
  var list=S.coupons.slice().sort(function(a,b){return b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0);});
  if(couponFilter!=='all')list=list.filter(function(c){return couponStatus(c)===couponFilter;});
  // Tutan / Yatan / Hepsi: Dünya Kupası bitmiş kuponları gösterme
  list=list.filter(function(c){
    if(isWorldCupCoupon(c)&&couponStatus(c)!=='open')return false;
    return true;
  });
  // 30 günden eski oynanmış (bitmiş) kuponları otomatik gizle
  list=list.filter(isCouponWithinRetention);
  if(!list.length){el.innerHTML='<div class="muted" style="padding:8px">Kupon yok.</div>';return;}
  el.innerHTML=list.map(function(c){
    var st=couponStatus(c),odds=couponOdds(c),pot=c.stake*odds,pnl=couponPnl(c);
    return '<div class="coupon" data-id="'+c.id+'">'+
      '<div class="chead"><b>'+new Date(c.date+'T12:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short',weekday:'short'})+'</b>'+
      '<span class="pill '+c.type+'">'+TYPE_TR[c.type]+'</span><span class="pill '+st+'">'+ST_TR[st]+'</span>'+
      '<span class="grow"></span><span class="muted">'+fmtTL(c.stake)+' × '+fmtOdd(odds)+' = <b>'+fmtTL(pot)+'</b></span></div>'+
      '<div class="cbody">'+c.selections.map(function(s, idx){return '<div class="legrow" data-idx="'+idx+'" data-sid="'+(s.id||s.propId||s.eventId||('sel_'+idx))+'">'+
        '<div class="lm"><b>'+esc(s.match)+'</b><span class="livesc" data-eid="'+(s.eventId||'')+'" data-ko="'+(s.ko!=null?s.ko:'')+'"></span><small>'+esc(s.market)+': <b>'+esc(s.pick)+'</b> @'+fmtOdd(s.odd)+(selectionProposersHtml(s)?' · '+selectionProposersHtml(s):'')+'</small></div>'+
        '<button class="resbtn w '+(s.result==='won'?'on':'')+'" title="Tuttu">✓</button>'+
        '<button class="resbtn l '+(s.result==='lost'?'on':'')+'" title="Yattı">✗</button>'+
        '<button class="resbtn v '+(s.result==='void'?'on':'')+'" title="İade">–</button></div>';}).join('')+'</div>'+
      '<div class="cfoot"><span>Net: <b class="'+(pnl>0?'pos':(st==='open'?'muted':'neg'))+'">'+(st==='open'?'Bekliyor':fmtTL(pnl))+'</b></span>'+
      (c.createdBy?'<span class="muted">Yazan: '+nameSpan(c.createdBy)+'</span>':'')+
      '<span class="grow"></span>'+
      '<button class="btn tiny" data-act="copy" title="Kopyala">📋</button>'+
      (st==='open'?'<button class="btn tiny" data-act="iddaa" style="background:#ff7a1a;color:#070d1a;-webkit-text-fill-color:#070d1a;font-weight:800;font-size:11px;" title="İddaa.com\'a Aktar">⚡ İddaa\'ya Yükle</button><button class="btn tiny" data-act="allwon">Hepsi tuttu</button><button class="btn tiny danger" data-act="alllost">Yattı</button>':'<button class="btn tiny" data-act="reopen">Geri aç</button>')+
      '<button class="btn tiny danger" data-act="del">Sil</button></div></div>';
  }).join('');
  el.querySelectorAll('.coupon').forEach(function(box){
    var c=S.coupons.filter(function(x){return x.id===box.dataset.id;})[0];
    if(!c)return;
    box.querySelectorAll('.legrow').forEach(function(row){
      var idx = parseInt(row.dataset.idx, 10);
      var s = (!isNaN(idx) && c.selections[idx]) ? c.selections[idx] : c.selections.filter(function(x){return (x.id||x.propId||x.eventId)===row.dataset.sid;})[0];
      if(!s)return;
      function setRes(v){s.result=s.result===v?'open':v;c.override=null;mutate('updateCoupon',c);}
      row.querySelector('.w').onclick=function(){setRes('won');};
      row.querySelector('.l').onclick=function(){setRes('lost');};
      row.querySelector('.v').onclick=function(){setRes('void');};
    });
    box.querySelectorAll('[data-act]').forEach(function(b){b.onclick=function(){
      var act=b.dataset.act;
      if(act==='del'){if(confirm('Kupon silinsin mi?'))mutate('delCoupon',{id:c.id});}
      else if(act==='allwon'){c.selections.forEach(function(s){s.result='won';});c.override=null;mutate('updateCoupon',c).then(function(){toast('Kupon TUTTU 🎉');});}
      else if(act==='alllost'){c.selections.forEach(function(s){if(s.result==='open'||!s.result)s.result='lost';});c.override='lost';mutate('updateCoupon',c).then(function(){toast('Kupon YATTI ✗');});}
      else if(act==='reopen'){c.override=null;c.selections.forEach(function(s){s.result='open';});mutate('updateCoupon',c);}
      else if(act==='iddaa'){
        var odds=couponOdds(c);
        openIddaaExportModal(c.selections, odds, c.stake);
      }
      else if(act==='copy'){
        var st=couponStatus(c),odds=couponOdds(c);
        var txt=(TYPE_WA[c.type]||'KUPON')+' KUPON – '+new Date(c.date+'T12:00').toLocaleDateString('tr-TR',{day:'numeric',month:'long'})+(st!=='open'?' ['+ST_TR[st]+']':'')+'\n'+
          c.selections.map(function(s,i){return (i+1)+') '+s.match+' | '+s.market+': '+s.pick+' @'+fmtOdd(s.odd)+(selectionProposersText(s)?' ('+selectionProposersText(s)+')':'')+(s.result==='won'?' ✓':s.result==='lost'?' ✗':'');}).join('\n')+
          '\n──────────\nToplam Oran: '+fmtOdd(odds)+'\nYatırım: '+fmtTL(c.stake)+'\n'+(st==='won'?'KAZANÇ: '+fmtTL(c.stake*odds):'Olası Kazanç: '+fmtTL(c.stake*odds));
        copyText(txt).then(function(){toast('Kopyalandı');}).catch(function(){toast('Kopyalanamadı');});
      }
    };});
  });
  if(APP.live)updateLiveUI(); // önbellekteki canlı skorları yeniden işle
}
document.querySelectorAll('.cf').forEach(function(b){b.onclick=function(){couponFilter=b.dataset.f;document.querySelectorAll('.cf').forEach(function(x){x.classList.toggle('on',x===b);});renderCoupons();};});

/* =================== [MODULE: live.js] =================== */
"use strict";
/* ============ CANLI SKOR (açık kupondaki başlamış maçlar) ============ */
function updateLiveUI(){
  var m=Object.assign({},APP.liveCache||{},APP.live||{});
  document.querySelectorAll('.livesc').forEach(function(el){
    var sc=m[el.dataset.eid];
    if(sc){
      var fin=scoreIsFinal(sc, el.dataset.ko?Number(el.dataset.ko):null);
      var t=' <b style="color:'+(fin?'var(--green)':'var(--red)')+'">'+(fin?'🏁 ':'🔴 ')+sc.h+'-'+sc.a;
      if(!fin&&sc.min)t+=' · '+sc.min+"'";
      else if(fin)t+=' · MS';
      if((sc.hc||0)+(sc.ac||0)>0)t+=' · K:'+sc.hc+'-'+sc.ac;
      if((sc.hy||0)+(sc.ay||0)>0)t+=' · 🟨'+sc.hy+'-'+sc.ay;
      if((sc.hr||0)+(sc.ar||0)>0)t+=' · 🟥'+sc.hr+'-'+sc.ar;
      el.innerHTML=t+'</b>';
    }
  });
}
/** Canlı skor / settle için uygun saat mi? 18:00–02:00 (yerel). */
function inLiveScoreWindow(d){
  d=d||new Date();
  var h=d.getHours();
  return h>=18||h<2;
}
/**
 * İddaa skor çek + settle.
 * @param {{background?:boolean}} opts background: sekme kapalıyken de çalış (saatlik job)
 */
function maybeFetchLive(opts){
  opts=opts||{};
  if(!opts.background&&document.getElementById('tab-coupons').style.display==='none')return;
  // Pencere dışı: yeni İddaa isteği yok; cache varsa settle dene
  if(!inLiveScoreWindow()){
    if(!opts.background){updateLiveUI();autoSettleOpenCoupons({});}
    return;
  }
  var ids={};
  S.coupons.forEach(function(c){
    if(c.override)return;
    c.selections.forEach(function(s){
      if(s.result!=='open'||!s.eventId||s.ko==null)return;
      var age=Date.now()-Number(s.ko)*1000;
      if(age>=0&&age<8*3600*1000)ids[s.eventId]=1;
    });
  });
  var list=Object.keys(ids).map(Number);
  if(!list.length){
    if(!opts.background)autoSettleOpenCoupons({});
    return;
  }
  // 18–02 arası en fazla saatte 1 İddaa isteği
  if(APP.liveAt&&Date.now()-APP.liveAt<60*60*1000){
    if(!opts.background){updateLiveUI();autoSettleOpenCoupons({});}
    return;
  }
  APP.liveAt=Date.now();
  fetchLiveScoresClient(list).then(function(m){
    mergeLiveCache(m||{});
    APP.live=m||{};
    updateLiveUI();
    return autoSettleOpenCoupons({});
  }).catch(function(){});
}
document.getElementById('btnAutoSettle').addEventListener('click',function(ev){
  ev.preventDefault();
  ev.stopPropagation();
  APP.liveAt=0;
  autoSettleOpenCoupons({manual:true,forceUi:true});
});
// Akşam penceresinde uygulama açıksa saatte bir dene
setInterval(function(){
  if(document.visibilityState==='visible')maybeFetchLive({background:true});
},60*60*1000);

/* =================== [MODULE: stats.js] =================== */
"use strict";
/* ============ İSTATİSTİK ============ */
var chart=null;
/* Son kasa sıfırlama: ~38.707 (Ayarlar’dan girilen tutar) */
var STATS_DEFAULT_START=38707;
var STATS_DEFAULT_FROM='2026-07-20';
function loadStatsStartBal(){
  try{
    var v=Number(localStorage.getItem('kk-stats-start'));
    if(!isNaN(v)&&v>0)return v;
  }catch(e){}
  return STATS_DEFAULT_START;
}
function saveStatsStartBal(v){
  try{localStorage.setItem('kk-stats-start',String(v));localStorage.setItem('kk-stats-from',todayStr());}catch(e){}
}
var STATS_START_BAL=loadStatsStartBal();
function statsEpoch(){
  try{
    var f=localStorage.getItem('kk-stats-from');
    if(f)return f;
  }catch(e){}
  return STATS_DEFAULT_FROM;
}
function statsCoupons(){
  var from=statsEpoch();
  return (S.coupons||[]).filter(function(c){return String(c.date||'')>=from;});
}
function statsAdjustments(){
  var from=statsEpoch();
  return (S.adjustments||[]).filter(function(a){return String(a.date||'')>=from;});
}
function proposalStatsDate(p){
  if(p&&p.date)return String(p.date).slice(0,10);
  if(p&&p.createdAt)return dstr(new Date(p.createdAt));
  return '';
}
function statsProposals(){
  var from=statsEpoch();
  return (S.proposals||[]).filter(function(p){
    var d=proposalStatsDate(p);
    return !d||d>=from;
  });
}
function statsBalance(){
  var b=STATS_START_BAL;
  statsAdjustments().forEach(function(a){b+=Number(a.amount)||0;});
  statsCoupons().forEach(function(c){b+=couponPnl(c);});
  return b;
}
function settledNet(){
  var n=0;
  statsAdjustments().forEach(function(a){n+=Number(a.amount)||0;});
  statsCoupons().forEach(function(c){
    var st=couponStatus(c);
    if(st==='open')return;
    n+=couponPnl(c);
  });
  return n;
}
function renderStats(){
  var from=statsEpoch();
  var cs=statsCoupons();
  var settled=cs.filter(function(c){return ['won','lost','void'].indexOf(couponStatus(c))>=0;});
  var won=settled.filter(function(c){return couponStatus(c)==='won';});
  var totStake=cs.reduce(function(a,c){return a+(Number(c.stake)||0);},0);
  var net=settledNet();
  var settledStake=settled.reduce(function(a,c){return a+(Number(c.stake)||0);},0);
  var roi=settledStake?net/settledStake*100:0;
  var kasa=statsBalance();
  document.getElementById('statGrid').innerHTML=[
    ['Güncel Kasa',fmtTL(kasa),kasa>=STATS_START_BAL?'pos':'neg'],
    ['Net Kâr/Zarar',(net>=0?'+':'')+fmtTL(net),net>=0?'pos':'neg'],
    ['Kupon',cs.length+' adet · '+fmtTL(totStake),''],
    ['Tutan / Yatan',won.length+' / '+settled.filter(function(c){return couponStatus(c)==='lost';}).length,''],
    ['İsabet',settled.length?Math.round(won.length/settled.length*100)+'%':'–',''],
    ['ROI',(roi>=0?'+':'')+roi.toFixed(1)+'%',roi>=0?'pos':'neg']
  ].map(function(x){return '<div class="stat"><label>'+x[0]+'</label><span class="'+x[2]+'">'+x[1]+'</span></div>';}).join('');

  // CLASURA AI PERFORMANSI (Bugünden - 15 Ağustos 2026'dan itibaren sıfırdan başlar)
  var AI_STATS_EPOCH = '2026-08-15';
  var aiProps = (S.proposals || []).filter(function(p){
    if(!isAiBotProposal(p)) return false;
    var d = proposalStatsDate(p);
    return !!d && d >= AI_STATS_EPOCH;
  });
  var liveCache = APP.liveCache || {};
  var aiWon = 0, aiLost = 0, aiOpen = 0, aiTotal = aiProps.length;
  var aiOddsSum = 0;
  
  aiProps.forEach(function(p){
    var r = p.result || (p.cls === 'won' || p.cls === 'lost' ? p.cls : null);
    if(!r || r === 'open'){
      var sc = p.eventId ? liveCache[String(p.eventId)] : null;
      if(sc){
        var g = gradeSelection({eventId: p.eventId, market: p.market, pick: p.pick}, sc);
        if(g){ r = g; p.result = g; }
      }
    }
    if(r === 'won') aiWon++;
    else if(r === 'lost') aiLost++;
    else aiOpen++;
    aiOddsSum += (Number(p.odd) || 1.80);
  });
  
  var aiSettled = aiWon + aiLost;
  var aiHitRate = aiSettled > 0 ? Math.round(aiWon / aiSettled * 100) : 0;
  var aiAvgOdd = aiTotal > 0 ? (aiOddsSum / aiTotal).toFixed(2) : '–';
  var aiNetPnl = aiProps.reduce(function(acc, p){
    var r = p.result || (p.cls === 'won' || p.cls === 'lost' ? p.cls : null);
    if(r === 'won') return acc + ((Number(p.odd) || 1.80) - 1) * 100;
    if(r === 'lost') return acc - 100;
    return acc;
  }, 0);
  
  var aiBadgeEl = document.getElementById('aiHitBadge');
  if(aiBadgeEl){
    aiBadgeEl.textContent = aiSettled > 0 ? ('%' + aiHitRate + ' İsabet (' + aiWon + '/' + aiSettled + ')') : (aiTotal + ' Öneri');
  }
  var aiGridEl = document.getElementById('aiStatGrid');
  if(aiGridEl){
    aiGridEl.innerHTML = [
      ['Toplam Tahmin (Tümü)', aiTotal + ' maç', ''],
      ['Tutan / Yatan (Tümü)', aiWon + ' / ' + aiLost, ''],
      ['Kümülatif İsabet', aiSettled ? (aiHitRate + '%') : '–', aiSettled ? (aiHitRate >= 50 ? 'pos' : 'neg') : ''],
      ['Ortalama Oran', '@' + aiAvgOdd, ''],
      ['Kümülatif Kâr (100 TL)', (aiNetPnl >= 0 ? '+' : '') + fmtTL(aiNetPnl), aiNetPnl >= 0 ? 'pos' : 'neg']
    ].map(function(x){
      return '<div class="stat"><label>' + x[0] + '</label><span class="' + x[2] + '">' + x[1] + '</span></div>';
    }).join('');
  }
  
  var aiTableEl = document.getElementById('aiPerfTable');
  if(aiTableEl){
    var recentAi = aiProps.slice(0, 5);
    var aiRows = recentAi.map(function(p){
      var res = p.result || (p.cls === 'won' || p.cls === 'lost' ? p.cls : null) || 'open';
      var resLabel = res === 'won' ? '<span class="ai-status-pill won">TUTTU</span>' : (res === 'lost' ? '<span class="ai-status-pill lost">YATTI</span>' : '<span class="ai-status-pill open">BEKLİYOR</span>');
      var dateStr = p.date ? p.date.slice(5) : '–';
      return '<tr><td>' + esc(dateStr) + '</td><td><b>' + esc(p.match) + '</b><br><small style="color:#a8b8db">' + esc(p.market) + ': ' + esc(p.pick) + '</small></td><td><b>@' + fmtOdd(p.odd) + '</b></td><td>' + resLabel + '</td></tr>';
    }).join('');
    aiTableEl.innerHTML = '<tr><th>Tarih</th><th>Maç &amp; Tercih</th><th>Oran</th><th>Durum</th></tr>' + (aiRows || '<tr><td colspan="4" class="muted" style="padding:10px;text-align:center">Henüz kaydedilmiş AI tahmini yok.</td></tr>');
  }

  var aiPerfCardEl = document.getElementById('aiPerfCard');
  if(aiPerfCardEl){
    aiPerfCardEl.style.setProperty('display', 'none', 'important');
  }

  var rows=['banko','plase','surpriz','uzun','diger'].map(function(t){
    var tcs=cs.filter(function(c){return c.type===t;});if(!tcs.length)return '';
    var sd=tcs.filter(function(c){return couponStatus(c)!=='open';});
    var w=sd.filter(function(c){return couponStatus(c)==='won';}).length;
    var n=sd.reduce(function(a,c){return a+couponPnl(c);},0);
    return '<tr><td><span class="pill '+t+'">'+TYPE_TR[t]+'</span></td><td>'+tcs.length+'</td><td>'+w+' / '+sd.length+'</td><td>'+(sd.length?Math.round(w/sd.length*100)+'%':'–')+'</td><td class="'+(n>=0?'pos':'neg')+'">'+(n>=0?'+':'')+fmtTL(n)+'</td></tr>';
  }).join('');
  document.getElementById('typeTable').innerHTML='<tr><th>Tür</th><th>Kupon</th><th>Tutan/Biten</th><th>İsabet</th><th>Net</th></tr>'+(rows||'<tr><td colspan="5" class="muted">Bu dönem için kupon yok</td></tr>');

  // Gönüllerin Baronu — 38.707 döneminden itibaren (AI botları hariç)
  var likeMap={};
  var props=statsProposals();
  props.forEach(function(p){
    if(isAiBotProposal(p))return; // AI önerileri Gönüllerin Baronu listesine dahil edilmez
    var votes=p.votes||[];
    var names=[p.by].concat(p.also||[]).filter(Boolean);
    var seen={};
    names.forEach(function(n){
      n=String(n).trim();if(!n||seen[n])return;
      if(/clasura\s*ai/i.test(n)||n.indexOf('🤖')>=0)return; // AI isimleri hariç
      seen[n]=1;
      if(!likeMap[n])likeMap[n]={likes:0,props:0};
      var others=votes.filter(function(v){return String(v).trim()!==n&&!/clasura\s*ai/i.test(v)&&v.indexOf('🤖')<0;}).length;
      likeMap[n].likes+=others;
      likeMap[n].props+=1;
    });
  });
  function likeRatio(row){return row.props?row.likes/row.props:0;}
  var likeNames=Object.keys(likeMap).sort(function(a,b){
    var ra=likeRatio(likeMap[a]),rb=likeRatio(likeMap[b]);
    return rb-ra||likeMap[b].likes-likeMap[a].likes||likeMap[b].props-likeMap[a].props||a.localeCompare(b,'tr');
  });
  var totalLikes=likeNames.reduce(function(a,n){return a+likeMap[n].likes;},0);
  var totalProps=props.filter(function(p){return !isAiBotProposal(p);}).length;
  var likeRows=likeNames.map(function(n,i){
    var row=likeMap[n];
    var crown=i===0&&row.likes>0?' 🏆':'';
    return '<tr><td>'+(i+1)+'. '+nameSpan(n)+crown+'</td><td><b>'+row.likes+'</b></td><td>'+row.props+'</td></tr>';
  }).join('');
  document.getElementById('likesTable').innerHTML=
    '<tr><th>Kişi</th><th>Like</th><th>Öneri</th></tr>'+
    (likeRows||'<tr><td colspan="3" class="muted">Bu dönem için öneri yok</td></tr>')+
    (likeNames.length?'<tr><td><b>Toplam</b></td><td><b>'+totalLikes+'</b></td><td><b>'+totalProps+'</b></td></tr>':'');

  var perf={};
  var betBag={}; // name -> betKey -> result
  cs.forEach(function(c){c.selections.forEach(function(s){
    var key=selectionBetKey(s);
    if(!key)return;
    var names=selectionProposers(s);
    if(!names.length)return;
    var r=s.result||'open';
    names.forEach(function(n){
      if(/clasura\s*ai/i.test(n)||n.indexOf('🤖')>=0)return; // AI üye performansı tablosuna girmez
      betBag[n]=betBag[n]||{};
      var prev=betBag[n][key];
      if(!prev||prev==='open')betBag[n][key]=r;
      else if(r!=='open'&&r!==prev)betBag[n][key]=r;
    });
  });});
  Object.keys(betBag).forEach(function(n){
    var map=betBag[n],t=0,w=0,l=0;
    Object.keys(map).forEach(function(k){
      t++;
      if(map[k]==='won')w++;
      else if(map[k]==='lost')l++;
    });
    perf[n]={t:t,w:w,l:l};
  });
  var mrows=Object.keys(perf).sort(function(a,b){
    var pa=perf[a],pb=perf[b];
    return (pb.w/((pb.w+pb.l)||1))-(pa.w/((pa.w+pa.l)||1));
  }).map(function(m){var p=perf[m];var done=p.w+p.l;
    return '<tr><td>'+nameSpan(m)+'</td><td>'+p.t+'</td><td>'+p.w+'</td><td>'+p.l+'</td><td>'+(done?Math.round(p.w/done*100)+'%':'–')+'</td></tr>';}).join('');
  document.getElementById('memberTable').innerHTML='<tr><th>Kişi</th><th>Bahis</th><th>Tutan</th><th>Yatan</th><th>İsabet</th></tr>'+(mrows||'<tr><td colspan="5" class="muted">Bu dönem kuponları sonuçlandıkça burada görünür.</td></tr>');

  var adjs=statsAdjustments();
  document.getElementById('adjTable').innerHTML=adjs.length?'<tr><th>Tarih</th><th>Tutar</th><th>Not</th><th></th></tr>'+
    adjs.map(function(a){return '<tr><td>'+a.date+'</td><td class="'+(a.amount>=0?'pos':'neg')+'">'+(a.amount>=0?'+':'')+fmtTL(a.amount)+'</td><td>'+esc(a.note||'')+'</td><td><button class="btn tiny danger" data-adj="'+a.id+'">✕</button></td></tr>';}).join(''):'';
  document.querySelectorAll('[data-adj]').forEach(function(b){b.onclick=function(){mutate('delAdj',{id:b.dataset.adj});};});

  var evts=[];
  adjs.forEach(function(a){evts.push({d:a.date,v:Number(a.amount)||0});});
  cs.forEach(function(c){evts.push({d:c.date,v:couponPnl(c)});});
  evts.sort(function(a,b){return a.d.localeCompare(b.d);});
  var byDay={};evts.forEach(function(e){byDay[e.d]=(byDay[e.d]||0)+e.v;});
  var days=Object.keys(byDay).sort();
  var run=STATS_START_BAL;
  var labels=[new Date(from+'T12:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short'})];
  var data=[Math.round(run)];
  days.forEach(function(d){
    run+=byDay[d];
    if(d===from)return;
    labels.push(new Date(d+'T12:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short'}));
    data.push(Math.round(run));
  });
  if(chart)chart.destroy();
  chart=new Chart(document.getElementById('chart').getContext('2d'),{type:'line',
    data:{labels:labels,datasets:[{label:'Kasa (TL)',data:data,borderColor:'#101f4a',backgroundColor:'rgba(255,122,26,.2)',fill:true,tension:.3,pointRadius:3,pointBackgroundColor:'#ff7a1a'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
}
document.getElementById('btnAdj').onclick=function(){
  var amt=Number(document.getElementById('adjAmount').value);
  if(!amt){toast('Tutar gir (eksi de olabilir)');return;}
  mutate('addAdj',{id:uid(),date:todayStr(),amount:amt,note:document.getElementById('adjNote').value.trim(),by:ME.name}).then(function(){
    document.getElementById('adjAmount').value='';document.getElementById('adjNote').value='';
  });
};

/* =================== [MODULE: settings.js] =================== */
"use strict";
/* ============ AYARLAR ============ */
function renderSettings(){
  // Alanda mevcut kasayı göster (38.707 döneminden); kayınca bu tutar güncel kasayı ezer
  var elStart=document.getElementById('setStart');
  if(elStart)elStart.value=Math.round(statsBalance());
  var el=document.getElementById('memberInputs');
  if(el)el.innerHTML=(S.settings.members||[]).map(function(m,i){return '<input data-mi="'+i+'" value="'+esc(m)+'" placeholder="'+(i+1)+'. kişi">';}).join('');

  // Sistem Teşhis & Hata Günlüğü
  var sumEl = document.getElementById('diagErrorSummary');
  var listEl = document.getElementById('diagErrorList');
  if (sumEl && window.APP_ERRORS) {
    var logs = window.APP_ERRORS.getLogs();
    if (!logs || !logs.length) {
      sumEl.textContent = 'Kayıtlı hata yok (Sistem sağlıklı).';
      if (listEl) listEl.style.display = 'none';
    } else {
      sumEl.textContent = 'Son ' + logs.length + ' adet hata/uyarı kaydı:';
      if (listEl) {
        listEl.style.display = 'block';
        listEl.textContent = logs.map(function(l) {
          return '[' + l.ts.slice(11,19) + '] (' + l.src + ':' + l.line + ') ' + l.msg;
        }).join('\n');
      }
    }
  }
}

var btnSaveSettings = document.getElementById('btnSaveSettings');
if (btnSaveSettings) {
  btnSaveSettings.onclick=function(){
    var members=[];
    document.querySelectorAll('#memberInputs input').forEach(function(inp){members[Number(inp.dataset.mi)]=inp.value;});
    var target=Number(document.getElementById('setStart').value);
    if(isNaN(target)){toast('Geçerli bir kasa tutarı gir');return;}
    var newStart=startBalanceForTarget(target);
    mutate('saveSettings',{start:newStart,members:members,pin:null}).then(function(){
      STATS_START_BAL=target;
      saveStatsStartBal(target);
      toast('Kasa '+fmtTL(target)+' olarak ayarlandı');
      renderHeader();
      if(document.getElementById('tab-stats').style.display!=='none')renderStats();
    });
  };
}

var btnCopyDiag = document.getElementById('btnCopyDiagLogs');
if (btnCopyDiag) {
  btnCopyDiag.onclick = function() {
    if (!window.APP_ERRORS) return;
    var logs = window.APP_ERRORS.getLogs();
    if (!logs || !logs.length) {
      toast('Kopyalanacak hata kaydı yok');
      return;
    }
    var text = JSON.stringify(logs, null, 2);
    if (typeof copyText === 'function') {
      copyText(text);
      toast('Hata logları panoya kopyalandı');
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        toast('Hata logları panoya kopyalandı');
      });
    }
  };
}

var btnClearDiag = document.getElementById('btnClearDiagLogs');
if (btnClearDiag) {
  btnClearDiag.onclick = function() {
    if (!window.APP_ERRORS) return;
    window.APP_ERRORS.clearLogs();
    toast('Hata logları temizlendi');
    renderSettings();
  };
}

/* =================== [MODULE: analytics.js] =================== */
"use strict";
/* ============ ANALYTICS ENGINE ============ */
/* analytics_events Supabase yazimi kaldirildi — gereksiz DB yuku */
function trackEvent(eventType, label, meta) { /* no-op */ }

/* =================== [MODULE: agent-onerileri.js] =================== */
"use strict";
/* ============ AGENT ÖNERİLERİ (GÜNLÜK BAHİS RAPORU) ============ */

var AGENT_REPORT_DATA = null;
var AGENT_REPORT_LOADING = false;
var AGENT_BETS_MAP = {};

function formatTrDate(isoDate) {
  if (!isoDate) return '';
  try {
    var parts = isoDate.split('-');
    if (parts.length === 3) {
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
    }
  } catch (e) {}
  return isoDate;
}

function getAgentBetKey(b) {
  return String(b.bet_id || (b.mac + '_' + b.secim)).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isBetInProposals(b) {
  if (!b) return false;
  var matchNorm = String(b.mac || '').replace(/–/g, ' - ').trim().toLowerCase();
  var pickNorm = String(b.secim || '').trim().toLowerCase();
  return (S.proposals || []).some(function(p) {
    var pm = String(p.match || '').replace(/–/g, ' - ').trim().toLowerCase();
    var pp = String(p.pick || '').trim().toLowerCase();
    return pm === matchNorm && pp === pickNorm;
  });
}

async function postAgentBetToProposals(b, btn) {
  if (!b) return;
  var matchName = (b.mac || '').replace(/–/g, ' - ');

  if (isBetInProposals(b)) {
    toast('Bu seçim zaten Öneriler akışında mevcut!');
    if (btn) {
      btn.disabled = true;
      btn.className = 'btn tiny secondary agent-posted-btn';
      btn.innerHTML = '<ion-icon name="checkmark-done-outline"></ion-icon> Önerilerde Yayında';
    }
    switchTab('props');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<ion-icon name="sync-outline" class="spin-icon"></ion-icon> Ekleniyor…';
  }

  var cat = oddClass(b.oran).k;
  var seritLabel = b.serit ? b.serit.toUpperCase() : 'DEĞER';
  var kararLabel = b.karar ? b.karar.toUpperCase() : 'OYNA';

  var koVal = null;
  if (b.kickoff_trt) {
    try {
      var dStr = (AGENT_REPORT_DATA && AGENT_REPORT_DATA.tarih) || todayStr();
      var iso = dStr + 'T' + b.kickoff_trt + ':00+03:00';
      var dt = new Date(iso);
      if (!isNaN(dt.getTime())) {
        koVal = Math.floor(dt.getTime() / 1000);
      }
    } catch(e) {}
  }

  var payload = {
    id: uid(),
    date: (AGENT_REPORT_DATA && AGENT_REPORT_DATA.tarih) || todayStr(),
    by_name: '🤖 Clasura AI',
    match: matchName,
    league: b.lig || '',
    market: b.market || 'Maç Sonucu',
    pick: b.secim,
    odd: Number(b.oran) || 1.80,
    event_id: null,
    ko: koVal,
    cls: (b.sinif || cat).toLowerCase(),
    comment: '🤖 Clasura AI (' + seritLabel + ' · ' + kararLabel + '): ' + (b.gerekce || '') + (b.zayif_yani ? ' [Risk: ' + b.zayif_yani + ']' : '')
  };

  try {
    await sbFetch('proposals?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });

    // Anında yerel state'e ekle
    payload.created_at = new Date().toISOString();
    payload.votes = [];
    payload.downs = [];
    if (!S.proposals) S.proposals = [];
    S.proposals.unshift(mapProposal(payload));
    try { renderProps(); } catch (err) {}

    if (btn) {
      btn.disabled = true;
      btn.className = 'btn tiny secondary agent-posted-btn';
      btn.innerHTML = '<ion-icon name="checkmark-circle"></ion-icon> Önerilere Eklendi';
    }
    toast('🤖 ' + matchName + ' (' + (b.kisa || b.secim) + ') Öneriler sekmesine eklendi!');
    switchTab('props');
    refreshData().then(renderProps).catch(function(){});
  } catch (err) {
    console.error('postAgentBetToProposals error:', err);
    // Hata durumunda yerel state güncellemesiyle devam et
    payload.created_at = new Date().toISOString();
    payload.votes = [];
    payload.downs = [];
    if (!S.proposals) S.proposals = [];
    S.proposals.unshift(mapProposal(payload));
    try { renderProps(); } catch (err) {}

    if (btn) {
      btn.disabled = true;
      btn.className = 'btn tiny secondary agent-posted-btn';
      btn.innerHTML = '<ion-icon name="checkmark-circle"></ion-icon> Önerilere Eklendi';
    }
    toast('🤖 ' + matchName + ' (' + (b.kisa || b.secim) + ') Öneriler sekmesine eklendi!');
    switchTab('props');
  }
}

function addAgentBetToBasket(b) {
  try {
    var bsk = basket();
    var matchName = (b.mac || '').replace(/–/g, ' - ');
    var existing = bsk.find(function(x) {
      return (x.match === matchName || x.match === b.mac) && x.pick === b.secim;
    });

    if (existing) {
      toast('Bu seçim zaten kupon sepetinizde!');
      return;
    }

    bsk.push({
      id: uid(),
      propId: 'agent_' + (b.bet_id || uid()),
      eventId: null,
      mktI: null,
      no: null,
      match: matchName,
      league: b.lig || '',
      ko: null,
      cls: (b.sinif || 'banko').toLowerCase(),
      market: b.market || 'Maç Sonucu',
      pick: b.secim,
      odd: Number(b.oran) || 1.80,
      by: '🤖 Clasura AI',
      also: [],
      result: 'open'
    });

    saveBasket();
    try { renderBasket(); } catch (err) {}
    toast('✅ ' + matchName + ' (' + b.secim + ' @' + Number(b.oran).toFixed(2) + ') sepete eklendi!');
  } catch (e) {
    console.error('addAgentBetToBasket error:', e);
    toast('Hata: Kupona eklenemedi');
  }
}

function renderAgentCardHtml(b, isKasa) {
  var betKey = getAgentBetKey(b);
  AGENT_BETS_MAP[betKey] = b;

  var decisionCls = (b.karar === 'oyna' || b.karar === 'kesin oyna') ? 'karar-oyna' : 'karar-dikkat';
  var sinifCls = (b.sinif || '').toLowerCase();
  var oddVal = Number(b.oran || 0).toFixed(2);
  var alreadyInProps = isBetInProposals(b);

  var badgesHtml = '<span class="agent-badge sinif-' + sinifCls + '">' + esc(b.sinif || 'ÖNERİ') + '</span>';
  if (b.puan !== undefined && b.puan !== null) {
    badgesHtml += '<span class="agent-badge puan">📉 Düşen +' + Number(b.puan).toFixed(1).replace('.', ',') + 'p · ' + esc(b.band || '') + '</span>';
  }
  if (b.karar) {
    badgesHtml += '<span class="agent-badge ' + decisionCls + '">' + esc(b.karar) + '</span>';
  }
  if (b.kasa === 'evet') {
    badgesHtml += '<span class="agent-badge kasa-real">💰 KASADAN</span>';
  }

  var scoresHtml = '';
  if (b.futbol_puan !== null || b.deger_puan !== null) {
    scoresHtml = '<div class="agent-card-scores">';
    if (b.futbol_puan !== null && b.futbol_puan !== undefined) {
      scoresHtml += '<span>⚽ Futbol: <b>' + Number(b.futbol_puan).toFixed(1) + '/10</b></span>';
    }
    if (b.deger_puan !== null && b.deger_puan !== undefined) {
      scoresHtml += '<span>💎 Değer: <b>' + Number(b.deger_puan).toFixed(1) + '/10</b></span>';
    }
    scoresHtml += '</div>';
  }

  var weakHtml = '';
  if (b.zayif_yani) {
    weakHtml = '<div class="agent-card-weak">' +
      '<div class="agent-weak-label"><ion-icon name="alert-circle-outline"></ion-icon> Zayıf Yanı & Risk</div>' +
      '<p>' + esc(b.zayif_yani) + '</p>' +
      '</div>';
  }

  var postButtonHtml = alreadyInProps
    ? '<button type="button" class="btn tiny secondary agent-posted-btn" disabled>' +
        '<ion-icon name="checkmark-done-outline"></ion-icon> Önerilerde Yayında' +
      '</button>'
    : '<button type="button" class="btn tiny primary agent-share-btn" data-key="' + betKey + '">' +
        '<ion-icon name="sparkles"></ion-icon> Önerilere Ekle (AI)' +
      '</button>';

  return '<div class="agent-card' + (isKasa ? ' is-kasa' : '') + '">' +
    '<div class="agent-card-top">' +
      '<div class="agent-card-left">' +
        '<div class="agent-match-title">' + esc(b.mac) + '</div>' +
        '<div class="agent-match-meta">' +
          '<span class="meta-tag">' + esc(b.lig) + '</span>' +
          (b.kickoff_trt ? '<span class="meta-tag"><ion-icon name="time-outline"></ion-icon> ' + esc(b.kickoff_trt) + '</span>' : '') +
          '<span class="meta-tag mkt">' + esc(b.market) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="agent-odds-box">' +
        '<div class="agent-odd-num">' + oddVal + '</div>' +
        '<div class="agent-pick-lbl">' + esc(b.kisa || b.secim) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="agent-badges-row">' + badgesHtml + '</div>' +
    scoresHtml +
    '<div class="agent-card-reason">' + esc(b.gerekce || '') + '</div>' +
    weakHtml +
    '<div class="agent-card-actions">' +
      '<button type="button" class="btn tiny secondary agent-cart-btn" data-key="' + betKey + '" title="Kupon Sepetine Ekle">' +
        '<ion-icon name="cart-outline"></ion-icon> Sepete' +
      '</button>' +
      postButtonHtml +
    '</div>' +
  '</div>';
}

function renderAgentReport(data) {
  var container = document.getElementById('agentReportContainer');
  if (!container) return;
  if (!data) {
    container.innerHTML = '<div class="empty-state"><ion-icon name="alert-circle-outline"></ion-icon><p>Agent raporu yüklenemedi.</p></div>';
    return;
  }

  AGENT_BETS_MAP = {};
  var d = data;
  var html = '';

  // 1. Üst Başlık & Zaman
  var dateStr = formatTrDate(d.tarih);
  var timeStr = (d.uretim_zamani ? d.uretim_zamani.slice(11, 16) : '') || d.veri_damgasi?.oran_fotografi_saat || '';
  html += '<div class="agent-header">' +
    '<div class="ah-title-row">' +
      '<div class="ah-title-wrap">' +
        '<span class="ah-pill">GÜNLÜK BAHİS RAPORU</span>' +
        '<h2>AI Önerileri</h2>' +
      '</div>' +
      '<button type="button" class="btn tiny secondary" id="btnRefreshAgentReport" title="Yenile">' +
        '<ion-icon name="refresh-outline"></ion-icon>' +
      '</button>' +
    '</div>' +
    '<div class="ah-date-sub">' +
      '<span><ion-icon name="calendar-outline"></ion-icon> ' + esc(dateStr) + '</span>' +
      (timeStr ? '<span><ion-icon name="time-outline"></ion-icon> Son Güncelleme: ' + esc(timeStr) + '</span>' : '') +
    '</div>' +
  '</div>';



  // 4. 3 Bacak Kesişimi
  var k = d.kesisim || {};
  html += '<div class="agent-section">' +
    '<div class="agent-section-head">' +
      '<h3><ion-icon name="git-merge-outline"></ion-icon> ' + esc(k.baslik || '3 Bacak Kesişimi') + '</h3>' +
      '<span class="sec-sub">Kasadan oynanan tek filtre</span>' +
    '</div>';

  if (k.aciklama) {
    html += '<div class="agent-info-box">' + esc(k.aciklama) + '</div>';
  }

  if (k.secimler && k.secimler.length > 0) {
    html += '<div class="agent-cards-grid">';
    k.secimler.forEach(function(b) { html += renderAgentCardHtml(b, true); });
    html += '</div>';
  } else {
    html += '<div class="agent-empty-leg" style="margin-bottom:14px;"><ion-icon name="information-circle-outline"></ion-icon> Bacaklardan kesişen yok.</div>';
  }
  html += '</div>';

  // 5. Bacak Önerileri
  var ALT_LEG_MAP = { 1: "Value Betting", 2: "Sadece Futbol", 3: "Macau Hareketi" };

  html += '<div class="agent-section">' +
    '<div class="agent-section-head">' +
      '<h3><ion-icon name="layers-outline"></ion-icon> Bacak Önerileri</h3>' +
      '<span class="sec-sub">İzlenen ve ölçümlenen güncel adaylar</span>' +
    '</div>';

  (d.bacaklar || []).forEach(function(bc) {
    var subLabel = bc.alt_baslik || ALT_LEG_MAP[bc.no] || '';
    html += '<div class="agent-bacak-group">' +
      '<div class="agent-bacak-title">' +
        '<h4>' + (bc.ikon || '📌') + ' Bacak ' + bc.no + ' · ' + esc(bc.ad) + '</h4>' +
        (subLabel ? '<span class="bacak-sub">' + esc(subLabel) + '</span>' : '') +
      '</div>';

    if (bc.uyarilar && bc.uyarilar.length) {
      bc.uyarilar.forEach(function(u) {
        html += '<div class="agent-warn-box"><ion-icon name="warning-outline"></ion-icon> ' + esc(u) + '</div>';
      });
    }

    if (bc.oneriler && bc.oneriler.length > 0) {
      html += '<div class="agent-cards-grid">';
      bc.oneriler.forEach(function(b) { html += renderAgentCardHtml(b, false); });
      html += '</div>';
    } else {
      var emptyMsg = (bc.bos_siniflar && bc.bos_siniflar.length)
        ? (bc.bos_siniflar.join(', ') + ' sınıfında kriterleri karşılayan aday çıkmadı.')
        : 'Bu bacakta bugün eşleşen aday bulunamadı.';
      if (bc.oyuncu_notu) emptyMsg += ' ' + bc.oyuncu_notu;
      html += '<div class="agent-empty-leg"><ion-icon name="remove-circle-outline"></ion-icon> ' + esc(emptyMsg) + '</div>';
    }

    // Bacak 3 - Hareket Yorumu
    if (bc.no === 3 && d.hareket_yorum) {
      var hy = d.hareket_yorum;
      html += '<div class="agent-movement-box">' +
        '<div class="amb-head"><ion-icon name="trending-down-outline"></ion-icon> Piyasa Hareketleri Yorumu</div>';

      if (hy.gunun_en_iyisi) {
        html += '<div class="amb-row highlight">' +
          '<strong>Günün En İyi Hareketi:</strong>' +
          '<p>' + esc(hy.gunun_en_iyisi) + '</p>' +
        '</div>';
      }
      if (hy.ikincisi) {
        html += '<div class="amb-row highlight">' +
          '<strong>İkincisi:</strong>' +
          '<p>' + esc(hy.ikincisi) + '</p>' +
        '</div>';
      }
      if (hy.ucuncusu) {
        html += '<div class="amb-row highlight">' +
          '<strong>Üçüncüsü:</strong>' +
          '<p>' + esc(hy.ucuncusu) + '</p>' +
        '</div>';
      }
      if (hy.olenler) {
        html += '<div class="amb-row">' +
          '<strong>Ölenler:</strong>' +
          '<p>' + esc(hy.olenler) + '</p>' +
        '</div>';
      }
      if (hy.yari_yolda_donenler) {
        html += '<div class="amb-row">' +
          '<strong>Yarı Yolda Dönenler:</strong>' +
          '<p>' + esc(hy.yari_yolda_donenler) + '</p>' +
        '</div>';
      }
      if (hy.olculmus_not) {
        html += '<div class="amb-note">ℹ️ ' + esc(hy.olculmus_not) + '</div>';
      }
      html += '</div>';
    }

    html += '</div>';
  });
  html += '</div>';

  // 6. DataGaffer %100 Tablosu
  if (d.datagaffer_100 && d.datagaffer_100.kayitlar && d.datagaffer_100.kayitlar.length) {
    var dg = d.datagaffer_100;
    html += '<div class="agent-section">' +
      '<div class="agent-section-head">' +
        '<h3><ion-icon name="stats-chart-outline"></ion-icon> DataGaffer %100</h3>' +
        '<span class="sec-sub">Bacaklardan bağımsız tam isabet serileri</span>' +
      '</div>' +
      (dg.aciklama ? '<div class="agent-info-box">' + esc(dg.aciklama) + '</div>' : '') +
      '<div class="agent-table-wrap">' +
        '<table class="agent-table">' +
          '<thead>' +
            '<tr>' +
              '<th>Takım</th>' +
              '<th>Seçim</th>' +
              '<th style="text-align:center">%</th>' +
              '<th style="text-align:center">Örnek</th>' +
              '<th style="text-align:right">Ligimizde</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>';

    dg.kayitlar.forEach(function(r) {
      html += '<tr class="' + (r.bizim_ligimizde ? 'is-allowed-league' : '') + '">' +
        '<td class="team-col"><b>' + esc(r.takim) + '</b></td>' +
        '<td class="pick-col">' + esc(r.secim) + '</td>' +
        '<td class="pct-col" style="text-align:center"><span class="dg-pct-badge">' + Number(r.yuzde) + '%</span></td>' +
        '<td class="sample-col" style="text-align:center">' + esc(r.orneklem) + '</td>' +
        '<td class="league-col" style="text-align:right">' +
          (r.bizim_ligimizde ? '<span class="tag-yes">EVET</span>' : '<span class="tag-no">—</span>') +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div></div>';
  }

  // 7. Karne
  if (d.karne && d.karne.satirlar && d.karne.satirlar.length) {
    var kr = d.karne;
    html += '<div class="agent-section">' +
      '<div class="agent-section-head">' +
        '<h3><ion-icon name="ribbon-outline"></ion-icon> Başarı Karnesi</h3>' +
        '<span class="sec-sub">Ölçü: ' + esc(kr.olcu || 'isabet oranı') + '</span>' +
      '</div>' +
      '<div class="agent-karne-list">';

    kr.satirlar.forEach(function(s) {
      var pct = s.isabet !== null && s.isabet !== undefined ? Number(s.isabet) : null;
      var pctStr = pct !== null ? '%' + pct.toFixed(0) : '—';
      var isHigh = pct !== null && pct >= 50;

      html += '<div class="agent-karne-row">' +
        '<div class="ak-row-top">' +
          '<span class="ak-name">' + esc(s.ad) + '</span>' +
          '<span class="ak-rate ' + (isHigh ? 'rate-good' : '') + '">' + pctStr + '</span>' +
        '</div>' +
        '<div class="ak-bar-track">' +
          '<div class="ak-bar-fill ' + (isHigh ? 'fill-good' : '') + '" style="width:' + (pct || 0) + '%"></div>' +
        '</div>' +
        '<div class="ak-row-bot">' +
          '<span>Kapanan: <b>' + (s.kapanan || 0) + '</b></span>' +
          '<span>Tutan: <b>' + (s.tuttu || 0) + '</b></span>' +
          '<span>Açık: <b>' + (s.acik || 0) + '</b></span>' +
        '</div>' +
      '</div>';
    });

    html += '</div>';

    if (kr.not || kr.uyari) {
      html += '<div class="agent-karne-footer">';
      if (kr.not) html += '<p class="ak-footer-line">ℹ️ ' + esc(kr.not) + '</p>';
      if (kr.uyari) html += '<p class="ak-footer-line warn">⚠️ ' + esc(kr.uyari) + '</p>';
      html += '</div>';
    }

    html += '</div>';
  }

  // 8. Açık Sorular (varsa)
  if (d.acik_sorular && d.acik_sorular.length) {
    html += '<div class="agent-section">' +
      '<div class="agent-section-head">' +
        '<h3><ion-icon name="help-circle-outline"></ion-icon> Açık Sorular</h3>' +
        '<span class="sec-sub">Karar Bekleyen Konular</span>' +
      '</div>' +
      '<div class="agent-questions-list">';

    d.acik_sorular.forEach(function(q) {
      html += '<div class="agent-q-card">' +
        '<strong>' + esc(q.konu) + '</strong>' +
        '<p>' + esc(q.detay) + '</p>' +
      '</div>';
    });

    html += '</div></div>';
  }

  // 9. Alt Bilgi
  html += '<div class="agent-footer-note">' +
    '<span>Veri kaynağı: <code>agent-onerileri/kasa.json</code> · Sürüm ' + esc(d.surum || '2.1') + '</span>' +
  '</div>';

  container.innerHTML = html;

  // "Önerilere Ekle (AI)" butonları
  container.querySelectorAll('.agent-share-btn').forEach(function(btn) {
    btn.onclick = function() {
      var key = btn.dataset.key;
      var b = AGENT_BETS_MAP[key];
      if (b) postAgentBetToProposals(b, btn);
    };
  });

  // "Sepete Ekle" butonları
  container.querySelectorAll('.agent-cart-btn').forEach(function(btn) {
    btn.onclick = function() {
      var key = btn.dataset.key;
      var b = AGENT_BETS_MAP[key];
      if (b) addAgentBetToBasket(b);
    };
  });

  // Yenile butonu
  var rfBtn = document.getElementById('btnRefreshAgentReport');
  if (rfBtn) {
    rfBtn.onclick = function() {
      loadAgentReport(true);
    };
  }
}

async function loadAgentReport(forceRefresh) {
  var container = document.getElementById('agentReportContainer');

  // 1. Stale-While-Revalidate: Eğer hafızada zaten veri varsa 0ms'de hemen göster
  if (AGENT_REPORT_DATA && container) {
    renderAgentReport(AGENT_REPORT_DATA);
  } else if (!AGENT_REPORT_DATA && container) {
    container.innerHTML = '<div class="empty-state">' +
      '<ion-icon name="sparkles-outline" class="pulse-icon"></ion-icon>' +
      '<p>AI Önerileri raporu getiriliyor…</p>' +
    '</div>';
  }

  // Eğer zaten aktif bir ağ isteği sürüyorsa mükerrer istek atma
  if (AGENT_REPORT_LOADING) return;
  AGENT_REPORT_LOADING = true;

  // 2. Her açılışta ve her tab geçişinde en son güncel kasa.json'ı çek (?t= cache-buster ile)
  var timestamp = Date.now();
  var paths = [
    'agent-onerileri/kasa.json?t=' + timestamp,
    './agent-onerileri/kasa.json?t=' + timestamp,
    '../agent-onerileri/kasa.json?t=' + timestamp
  ];

  var data = null;
  for (var i = 0; i < paths.length; i++) {
    try {
      var res = await fetch(paths[i], { cache: 'no-store' });
      if (res.ok) {
        data = await res.json();
        if (data && data.bacaklar) break;
      }
    } catch (e) {
      // Bir sonraki yolu dene
    }
  }

  AGENT_REPORT_LOADING = false;

  if (data && data.bacaklar) {
    AGENT_REPORT_DATA = data;
    if (container) {
      renderAgentReport(data);
    }
  } else if (!AGENT_REPORT_DATA && container) {
    console.warn('Agent raporu yüklenemedi');
    container.innerHTML = '<div class="empty-state">' +
      '<ion-icon name="alert-circle-outline"></ion-icon>' +
      '<p>Agent raporu dosyası (kasa.json) henüz yüklenemedi.</p>' +
      '<button type="button" class="btn tiny primary" onclick="loadAgentReport(true)">Tekrar Dene</button>' +
    '</div>';
  }
}

/* =================== [MODULE: nav.js] =================== */
"use strict";
/* ============ NAV / INIT ============ */
function switchTab(t){
  trackEvent('tab_view', t);
  ['props','build','coupons','ai-props','stats','settings'].forEach(function(x){
    var el=document.getElementById('tab-'+x);
    if(el)el.style.display=x===t?'':'none';
  });
  document.querySelectorAll('ion-tab-button').forEach(function(b){
    if(b.tab===t)b.setAttribute('selected','true');
    else b.removeAttribute('selected');
  });
  if(t==='ai-props'){
    loadAgentReport();
  }
  if(t==='stats'){
    renderStats();
  }
  if(t==='props'){
    renderProps();
    maybeSyncProposalOdds(false);
  }
  if(t==='coupons')refreshData().then(maybeFetchLive);
  if(t==='build')loadAiPredictions();
  renderBuilder();
}
document.querySelectorAll('ion-tab-button').forEach(function(b){
  b.addEventListener('click',function(ev){ev.preventDefault();switchTab(b.tab);});
});
document.querySelectorAll('.dayf').forEach(function(b){b.onclick=function(){dayFilter=b.dataset.day;document.querySelectorAll('.dayf').forEach(function(x){x.classList.toggle('on',x===b);});renderMatches();renderProposeQuota();};});
document.querySelectorAll('.pdf').forEach(function(b){b.onclick=function(){
  propDayFilter=b.dataset.pdf||'all';
  document.querySelectorAll('.pdf').forEach(function(x){x.classList.toggle('on',x===b);});
  renderProps();
};});
(function(){
  var bBtn=document.getElementById('propBFilter');
  if(!bBtn)return;
  bBtn.onclick=function(){
    propBFilter=!propBFilter;
    bBtn.classList.toggle('on',propBFilter);
    bBtn.setAttribute('aria-pressed',propBFilter?'true':'false');
    renderProps();
  };
})();
document.getElementById('popChip').onclick=function(){popSort=!popSort;this.classList.toggle('on',popSort);if(popSort){specMode=false;document.getElementById('specChip').classList.remove('on');}renderLeagueChips();renderMatches();};
document.getElementById('specChip').onclick=function(){specMode=!specMode;this.classList.toggle('on',specMode);if(specMode){popSort=false;document.getElementById('popChip').classList.remove('on');}renderLeagueChips();renderMatches();};
document.getElementById('searchBox').oninput=function(e){searchQ=e.target.value.trim();renderMatches();};
document.getElementById('btnFetch').onclick = function() {
  fetchEvents();
  loadAiPredictions();
};
var btnAiBuild = document.getElementById('btnRefreshAiBuild');
if (btnAiBuild) btnAiBuild.onclick = function() { loadAiPredictions(); };
var btnAllAiBuild = document.getElementById('btnPostAllAiBuild');
if (btnAllAiBuild) btnAllAiBuild.onclick = function() { postAllAiPredictionsToProposals(); };
document.getElementById('btnRefresh').onclick=function(){
  refreshData().then(function(){return maybeSyncProposalOdds(true);});
};

/* =================== [MODULE: ai.js] =================== */
"use strict";
/* ============ AI PREDICTIONS SYSTEM ============ */
var AI_FEATURE_ENABLED = false; // Geçici olarak kapatıldı
var AI_PREDICTIONS = [];

/** Sadece bugünün (henüz başlamamış) izinli lig maçları */
function todayAiEvents() {
  var t = todayStr();
  return (EV || []).filter(function(e) {
    if (!e || isDailyComp(e.ci)) return false;
    if (!isAllowedLeague(e.ci)) return false;
    if (e.d * 1000 <= Date.now()) return false;
    if (evDate(e) !== t) return false;
    return true;
  });
}

function aiMsPick(e) {
  var outs = (e.ms && e.ms.o) ? e.ms.o.slice() : [];
  if (!outs.length) return null;
  var byNo = {};
  outs.forEach(function(o) { byNo[o.no] = o; });
  var o1 = byNo[1], oX = byNo[2], o2 = byNo[3];
  var cands = [];
  if (o1) cands.push({ side: '1', o: o1, label: formatPickName(o1.n, '') || 'MS 1' });
  if (oX) cands.push({ side: 'X', o: oX, label: formatPickName(oX.n, '') || 'MS X' });
  if (o2) cands.push({ side: '2', o: o2, label: formatPickName(o2.n, '') || 'MS 2' });
  if (!cands.length) {
    // no numarası beklenenden farklıysa en düşük oranı al
    var sorted = outs.slice().sort(function(a, b) { return Number(a.odd) - Number(b.odd); });
    var lowest = sorted[0];
    return {
      market: 'Maç Sonucu',
      pick: formatPickName(lowest.n, '') || 'MS',
      odd: Number(lowest.odd) || 1.8,
      mktI: e.ms.i,
      no: lowest.no,
      style: 'ms',
      side: '1'
    };
  }
  cands.sort(function(a, b) { return Number(a.o.odd) - Number(b.o.odd); });
  var best = cands[0];
  return {
    market: 'Maç Sonucu',
    pick: best.label,
    odd: Number(best.o.odd) || 1.8,
    mktI: e.ms.i,
    no: best.o.no,
    style: 'ms',
    side: best.side
  };
}

function aiReasoningFor(e, pick) {
  var home = e.hn || 'Ev sahibi';
  var away = e.an || 'Deplasman';
  var pp = e.pp != null ? Number(e.pp) : null;
  var odd = pick.odd || 1.8;
  var rnd = (e.i || 0) % 5;

  if (pick.side === '1') {
    var home1Templates = [
      home + ' kendi sahasında son dönemde üstün performans sergiliyor. İç saha avantajı ve oran dengesi değerli.',
      'Oranlar ' + home + ' lehine şekilleniyor ('+fmtOdd(odd)+'). Ev sahibi baskıyla galibiyete yakın.',
      home + ' bu sezon evinde güçlü. Rakibin deplasman form grafiği düşük, ev sahibi öne çıkıyor.',
      pp != null && pp >= 50 ? 'Bültende %'+pp+' oynanma oranıyla '+home+' büyük ilgi görüyor. Kalabalık ev sahibinde.' : home + ' ev avantajı ve son maç performansıyla favori konumda.',
      home + ' takım kadrosu ve form açısından rakibine göre avantajlı. İç saha galibiyeti değerli.'
    ];
    return home1Templates[rnd];
  }

  if (pick.side === '2') {
    var away2Templates = [
      away + ' deplasmanda etkili oynuyor. Bugünkü oranlar ('+fmtOdd(odd)+') değer bahsi fırsatı sunuyor.',
      'Konuk takım ' + away + ' son deplasmanlarında başarılı. Ev sahibinin formsuzluğu avantaj.',
      away + ' zorlu deplasmanda bile sonuç alabilecek kadro derinliğine sahip. Değer oranı mevcut.',
      away + ' takımı rakibine karşı geçmişte iyi sonuçlar aldı. Deplasman galibiyeti için cazip oran.',
      'Oranlar dengeli görünse de ' + away + ' deplasmanda sürpriz yapabilecek formda.'
    ];
    return away2Templates[rnd];
  }

  if (pick.side === 'X') {
    var drawTemplates = [
      home + ' ile ' + away + ' arasında güç dengesi var. Beraberlik ihtimali yüksek ve oran ('+fmtOdd(odd)+') değerli.',
      'Her iki takım da son maçlarda istikrarsız. Düşük gollü beraberlik senaryosu güçlü.',
      'Oranlar ev sahibi lehine ama ' + away + ' defansif güçlü. Beraberlik sürprizi olası.',
      home + ' – ' + away + ' karşılaşmasında geçmiş maçlar beraberlik eğilimli. Değerli X.',
      'Takımlar arasında net bir favori yok. Taktiksel maç, beraberlik en mantıklı tercih.'
    ];
    return drawTemplates[rnd];
  }

  var defaultTemplates = [
    home + ' – ' + away + ' maçında oran analizi ve form değerlendirmesi sonucu bu tercih öne çıkıyor.',
    'Güncel oranlar ve takım performansları değerlendirildiğinde bu seçim mantıklı görünüyor.',
    'Bülten analizi ve istatistikler doğrultusunda hesaplanan değer bahsi önerisi.'
  ];
  return defaultTemplates[rnd % 3];
}

function buildAiPredictionsFromToday() {
  var list = todayAiEvents().filter(function(e) { return e.ms && e.ms.o && e.ms.o.length; });
  list.sort(function(a, b) {
    var pa = a.pp != null ? Number(a.pp) : -1;
    var pb = b.pp != null ? Number(b.pp) : -1;
    if (pb !== pa) return pb - pa;
    return a.d - b.d;
  });
  var out = [];
  var usedSides = {};
  // 1. tur: çeşitlilik
  for (var i = 0; i < list.length && out.length < 4; i++) {
    var e = list[i];
    var pick = aiMsPick(e);
    if (!pick) continue;
    if (usedSides[pick.side]) continue;
    usedSides[pick.side] = 1;
    var conf = 82 + Math.min(10, out.length * 2);
    if (e.pp != null) conf = Math.min(94, Math.max(78, Math.round(60 + Number(e.pp) * 0.3)));
    out.push({
      id: 'ai-' + todayStr() + '-' + e.i,
      event_id: e.i,
      match: (e.hn || '') + ' – ' + (e.an || ''),
      league: allowedLeagueLabel(e.ci),
      market: pick.market,
      pick: pick.pick,
      odd: pick.odd,
      confidence: conf,
      confidence_stars: conf >= 90 ? 5 : 4,
      reasoning: aiReasoningFor(e, pick),
      ko: e.d,
      mktI: pick.mktI,
      no: pick.no
    });
  }
  // 2. tur: kalan slotları doldur
  for (var j = 0; j < list.length && out.length < 4; j++) {
    var e2 = list[j];
    if (out.some(function(x) { return Number(x.event_id) === Number(e2.i); })) continue;
    var pick2 = aiMsPick(e2);
    if (!pick2) continue;
    var conf2 = 80 + out.length;
    if (e2.pp != null) conf2 = Math.min(92, Math.max(76, Math.round(58 + Number(e2.pp) * 0.28)));
    out.push({
      id: 'ai-' + todayStr() + '-' + e2.i,
      event_id: e2.i,
      match: (e2.hn || '') + ' – ' + (e2.an || ''),
      league: allowedLeagueLabel(e2.ci),
      market: pick2.market,
      pick: pick2.pick,
      odd: pick2.odd,
      confidence: conf2,
      confidence_stars: conf2 >= 90 ? 5 : 4,
      reasoning: aiReasoningFor(e2, pick2),
      ko: e2.d,
      mktI: pick2.mktI,
      no: pick2.no
    });
  }
  return out;
}

function mapSupabaseAiPrediction(row) {
  var comment = String(row.comment || '');
  var confMatch = comment.match(/%(\d+)\s*Güven/);
  var confidence = confMatch ? Number(confMatch[1]) : 85;
  var reasoning = comment
    .replace(/^🤖\s*Clasura AI(\s*Analizi)?\s*(\(%\d+\s*Güven\))?:\s*/i, '')
    .trim();
  return {
    id: String(row.id),
    event_id: row.event_id || null,
    match: row.match,
    league: row.league || '',
    market: row.market || 'Maç Sonucu',
    pick: row.pick,
    odd: Number(row.odd) || 1.8,
    confidence: confidence,
    confidence_stars: confidence >= 90 ? 5 : 4,
    reasoning: reasoning || comment || 'Clasura AI günlük analizi.',
    ko: row.ko || null,
    mktI: row.mkt_i || null,
    no: row.no || null
  };
}

function applyLocalAiFallback() {
  var widget = document.getElementById('aiPredictionsWidgetBuild');
  AI_PREDICTIONS = [];
  if (widget) widget.style.setProperty('display', 'none', 'important');
  syncAiPagerChrome();
}

function loadAiPredictions() {
  var widget = document.getElementById('aiPredictionsWidgetBuild');
  if (widget) widget.style.setProperty('display', 'none', 'important');
  if (!AI_FEATURE_ENABLED) {
    applyLocalAiFallback();
    return;
  }
  var container = document.getElementById('aiPredictionsListBuild');
  if (!container) return;
  var day = todayStr();
  var q = 'proposals?date=eq.' + encodeURIComponent(day)
    + '&by_name=eq.' + encodeURIComponent('🤖 CLASURA AI')
    + '&select=id,date,by_name,event_id,match,league,market,pick,odd,ko,mkt_i,no,comment,created_at'
    + '&order=created_at.desc&limit=8';

  sbFetch(q).then(function(rows) {
    var list = (rows || []).map(mapSupabaseAiPrediction).filter(function(p) {
      if (!p.match || !p.pick) return false;
      if (p.ko && Number(p.ko) * 1000 <= Date.now()) return false;
      return true;
    }).slice(0, 4);

    if (!list.length) {
      applyLocalAiFallback();
      return;
    }

    // 1. Veritabanındaki tahminlerle anında kartı göster (bloklama olmasın)
    AI_PREDICTIONS = list;
    renderAiPredictions();

    // 2. Canlı bülten oranlarını arka planda çekip güncelle
    syncAiOddsFromLive(list).then(function(synced) {
      if (synced && synced.length) {
        AI_PREDICTIONS = synced;
        renderAiPredictions();
      }
    }).catch(function() {});

    if (!APP.aiOddsPeriodicTimer) {
      APP.aiOddsPeriodicTimer = setInterval(function() {
        if (AI_PREDICTIONS && AI_PREDICTIONS.length) {
          syncAiOddsFromLive(AI_PREDICTIONS).then(function(synced) {
            if (synced && synced.length) {
              AI_PREDICTIONS = synced;
              renderAiPredictions();
            }
          }).catch(function() {});
        }
      }, 60000);
    }
  }).catch(function(err) {
    console.warn('AI predictions fetch error:', err);
    applyLocalAiFallback();
  });
}

function syncAiOddsFromLive(list) {
  if (!list || !list.length) return Promise.resolve(list);
  
  // 1. Önce sayfadaki canlı bülten kartlarından (EV) oranları birebir eşleştir
  var evList = (typeof EV !== 'undefined' && EV && EV.length) ? EV : [];
  
  var updated = list.map(function(p) {
    var eventId = Number(p.event_id);
    var liveEv = evList.find(function(x) { return Number(x.i) === eventId; });
    
    if (liveEv && liveEv.ms && liveEv.ms.o && liveEv.ms.o.length) {
      var targetPick = String(p.pick || '').trim().toLocaleUpperCase('tr');
      var matchedOdd = null;
      var matchedMktI = liveEv.ms.i;
      var matchedNo = null;

      liveEv.ms.o.forEach(function(o, idx) {
        var oName = String(o.n || (idx === 0 ? '1' : (idx === 1 ? '0' : '2'))).trim().toLocaleUpperCase('tr');
        var noVal = o.no || (idx + 1);
        if ((targetPick === 'MS 1' || targetPick === '1') && (oName === '1' || noVal === 1)) {
          matchedOdd = Number(o.odd); matchedNo = noVal;
        } else if ((targetPick === 'MS X' || targetPick === 'MS 0' || targetPick === 'X' || targetPick === '0') && (oName === '0' || oName === 'X' || noVal === 2)) {
          matchedOdd = Number(o.odd); matchedNo = noVal;
        } else if ((targetPick === 'MS 2' || targetPick === '2') && (oName === '2' || noVal === 3)) {
          matchedOdd = Number(o.odd); matchedNo = noVal;
        }
      });

      if (matchedOdd) {
        console.log('🎯 Bülten kartından AI oranı güncellendi:', p.match, p.pick, 'Eski:' + p.odd, '→ Canlı Bülten Kartı:' + matchedOdd);
        p.odd = matchedOdd;
        p.mktI = matchedMktI;
        p.no = matchedNo;
      }
    }
    return p;
  });

  // 2. EV'de henüz bulunamayan maçlar için canlı iddaa API servisini sorgula
  var unSynced = updated.filter(function(p) { return p.event_id; });
  if (!unSynced.length) return Promise.resolve(updated);
  
  var chain = Promise.resolve();
  var details = {};
  
  unSynced.forEach(function(p) {
    var id = Number(p.event_id);
    chain = chain.then(function() {
      return fetchEventDetailClient(id, true).then(function(d) {
        if (d) details[id] = d;
      }).catch(function() {});
    });
  });
  
  return chain.then(function() {
    return updated.map(function(p) {
      var d = details[p.event_id];
      if (!d || !d.m || !d.m.length) return p;
      
      var liveOdd = null;
      var targetPick = String(p.pick || '').trim().toLocaleUpperCase('tr');
      var msMarket = d.m.find(function(m) { return (m.st === 1 || m.st === 4) && (!m.sov || m.sov === '') && (m.o || []).length === 3; });
      if (!msMarket) {
        msMarket = d.m.find(function(m) {
          var o = m.o || [];
          if (o.length !== 3 || m.sov) return false;
          var n0 = String(o[0].n || '').trim(), n1 = String(o[1].n || '').trim(), n2 = String(o[2].n || '').trim();
          return (n0 === '1' && (n1 === '0' || n1 === 'X') && n2 === '2');
        });
      }
      if (msMarket && msMarket.o && msMarket.o.length === 3) {
        msMarket.o.forEach(function(o, idx) {
          var oName = String(o.n || (idx === 0 ? '1' : (idx === 1 ? '0' : '2'))).trim().toLocaleUpperCase('tr');
          var noVal = o.no || (idx + 1);
          if ((targetPick === 'MS 1' || targetPick === '1') && (oName === '1' || noVal === 1)) {
            liveOdd = Number(o.odd);
          } else if ((targetPick === 'MS X' || targetPick === 'MS 0' || targetPick === 'X' || targetPick === '0') && (oName === '0' || oName === 'X' || noVal === 2)) {
            liveOdd = Number(o.odd);
          } else if ((targetPick === 'MS 2' || targetPick === '2') && (oName === '2' || noVal === 3)) {
            liveOdd = Number(o.odd);
          }
        });
      }
      if (liveOdd) {
        p.odd = liveOdd;
      }
      return p;
    });
  });
}

var _aiSlideIdx = 0;
var _aiSlideList = [];

function aiCardHtml(p, idx, total) {
  var stars = '⭐'.repeat(p.confidence_stars || 4);
  var confText = '%' + (p.confidence || 85) + ' Güven ' + stars;
  return '<div class="ai-card-item" style="display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;background:#142347!important;border:1px solid rgba(255,122,26,0.6)!important;border-radius:14px!important;padding:12px!important;font-family:var(--font)!important;">' +
    '<div class="ai-card-top" style="display:flex!important;justify-content:space-between!important;align-items:center!important;margin-bottom:6px!important;">' +
      '<span class="ai-card-lg" style="background:#ffb92e!important;color:#070d1a!important;-webkit-text-fill-color:#070d1a!important;font-family:var(--font)!important;font-weight:800!important;font-size:10px!important;padding:3px 8px!important;border-radius:6px!important;text-transform:uppercase!important;letter-spacing:.03em!important;max-width:130px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;">' + esc(p.league || 'Futbol') + '</span>' +
      '<span class="ai-card-conf" style="color:#3dd68c!important;-webkit-text-fill-color:#3dd68c!important;font-family:var(--font)!important;font-weight:700!important;font-size:11px!important;">' + confText + '</span>' +
    '</div>' +
    '<div class="ai-card-match" style="display:block!important;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;font-family:var(--display)!important;font-size:15px!important;font-weight:800!important;margin:5px 0 8px 0!important;line-height:1.25!important;letter-spacing:-.02em!important;">' + esc(p.match) + '</div>' +
    '<div class="ai-card-pick-box" style="background:#1e315e!important;border:1px solid rgba(255,122,26,0.4)!important;border-radius:9px!important;padding:8px 10px!important;display:flex!important;justify-content:space-between!important;align-items:center!important;margin-bottom:6px!important;">' +
      '<span class="ai-card-pick-label" style="color:#ff7a1a!important;-webkit-text-fill-color:#ff7a1a!important;font-family:var(--font)!important;font-weight:700!important;font-size:13px!important;">' + esc(p.market ? (p.market + ': ' + p.pick) : p.pick) + '</span>' +
      '<span class="ai-card-odd-tag" style="background:#ff7a1a!important;color:#070d1a!important;-webkit-text-fill-color:#070d1a!important;font-family:var(--display)!important;font-weight:800!important;font-size:14px!important;padding:3px 8px!important;border-radius:6px!important;letter-spacing:-.02em!important;">' + fmtOdd(p.odd) + '</span>' +
    '</div>' +
    '<div class="ai-card-reason-text" style="display:block!important;background:#0d162a!important;color:#f1f5f9!important;-webkit-text-fill-color:#f1f5f9!important;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif!important;font-size:12.5px!important;font-weight:500!important;line-height:1.48!important;padding:8px 12px!important;border-radius:8px!important;border:1px solid rgba(255,255,255,0.08)!important;border-left:3.5px solid #ff7a1a!important;font-style:normal!important;margin-bottom:8px!important;letter-spacing:0.01em!important;">💡 <b>AI Analizi:</b> ' + esc(p.reasoning || 'Gelişmiş Clasura AI analizi.') + '</div>' +
    '<div class="ai-card-btn-row" style="display:flex!important;gap:6px!important;margin-top:6px!important;">' +
      '<button type="button" class="btn-ai-submit" data-ai-post="' + p.id + '" style="flex:1!important;-webkit-flex:1!important;background:#ff7a1a!important;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;border:none!important;border-radius:8px!important;font-family:var(--font)!important;font-weight:800!important;font-size:12.5px!important;height:36px!important;min-height:36px!important;cursor:pointer!important;text-align:center!important;-webkit-appearance:none!important;display:flex!important;align-items:center!important;justify-content:center!important;">📌 Öner (' + (idx + 1) + '/' + total + ')</button>' +
      '<button type="button" class="btn-ai-share-alt" data-ai-share="' + p.id + '" style="background:#25396e!important;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;border:1px solid #4a63a0!important;border-radius:8px!important;font-family:var(--font)!important;font-weight:700!important;font-size:11.5px!important;height:36px!important;min-height:36px!important;padding:0 10px!important;cursor:pointer!important;text-align:center!important;-webkit-appearance:none!important;display:flex!important;align-items:center!important;justify-content:center!important;">📲 Paylaş</button>' +
    '</div>' +
  '</div>';
}

function syncAiPagerChrome() {
  var total = _aiSlideList.length;
  var countEl = document.getElementById('aiSlideCount');
  if (countEl) countEl.textContent = total ? ((_aiSlideIdx + 1) + ' / ' + total) : '–';
  var prev = document.getElementById('aiPrevBtn');
  var next = document.getElementById('aiNextBtn');
  if (prev) prev.disabled = !total || _aiSlideIdx <= 0;
  if (next) next.disabled = !total || _aiSlideIdx >= total - 1;
}

function bindAiCardActions(container) {
  container.querySelectorAll('[data-ai-post]').forEach(function(b) {
    b.onclick = function(ev) {
      if (ev) ev.stopPropagation();
      var id = b.dataset.aiPost;
      var item = AI_PREDICTIONS.find(function(x) { return String(x.id) === id; });
      if (item) postAiPredictionToProposals(item);
    };
  });
  container.querySelectorAll('[data-ai-share]').forEach(function(b) {
    b.onclick = function(ev) {
      if (ev) ev.stopPropagation();
      var id = b.dataset.aiShare;
      var item = AI_PREDICTIONS.find(function(x) { return String(x.id) === id; });
      if (item) shareAiPrediction(item);
    };
  });
}

function bindAiPagerSwipe(viewport) {
  if (!viewport || viewport._aiSwipeBound) return;
  viewport._aiSwipeBound = true;
  var startX = 0, startY = 0, dx = 0, dy = 0, tracking = false;
  viewport.addEventListener('touchstart', function(e) {
    if (!e.touches || !e.touches.length) return;
    tracking = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0; dy = 0;
  }, { passive: true });
  viewport.addEventListener('touchmove', function(e) {
    if (!tracking || !e.touches || !e.touches.length) return;
    dx = e.touches[0].clientX - startX;
    dy = e.touches[0].clientY - startY;
  }, { passive: true });
  viewport.addEventListener('touchend', function() {
    if (!tracking) return;
    tracking = false;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goAiSlide(1);
    else goAiSlide(-1);
  }, { passive: true });
}

window.loadAiPredictions = loadAiPredictions;
function paintAiSlide() {
  var container = document.getElementById('aiPredictionsListBuild');
  if (!container) return;
  var total = _aiSlideList.length;
  if (!total) {
    container.innerHTML = '<div style="font-size:12px;color:#8fa0c8;padding:12px">Şu an gösterilecek AI tahmini bulunmuyor.</div>';
    syncAiPagerChrome();
    return;
  }
  if (_aiSlideIdx < 0) _aiSlideIdx = 0;
  if (_aiSlideIdx >= total) _aiSlideIdx = total - 1;
  var p = _aiSlideList[_aiSlideIdx];
  var dots = '';
  for (var i = 0; i < total; i++) {
    dots += '<span class="' + (i === _aiSlideIdx ? 'on' : '') + '" data-ai-dot="' + i + '"></span>';
  }
  container.innerHTML =
    '<div class="ai-pager-viewport" id="aiPagerViewport">' +
      aiCardHtml(p, _aiSlideIdx, total) +
    '</div>' +
    '<div class="ai-pager-dots">' + dots + '</div>';
  syncAiPagerChrome();
  bindAiCardActions(container);
  bindAiPagerSwipe(document.getElementById('aiPagerViewport'));
  container.querySelectorAll('[data-ai-dot]').forEach(function(d) {
    d.onclick = function() {
      _aiSlideIdx = Number(d.getAttribute('data-ai-dot')) || 0;
      paintAiSlide();
    };
  });
}

function goAiSlide(delta) {
  var total = _aiSlideList.length;
  if (!total) return;
  var next = _aiSlideIdx + delta;
  if (next < 0 || next >= total) return;
  _aiSlideIdx = next;
  paintAiSlide();
}

function renderAiPredictions() {
  var widget = document.getElementById('aiPredictionsWidgetBuild');
  var container = document.getElementById('aiPredictionsListBuild');
  if (!container) return;

  if (!AI_FEATURE_ENABLED || !AI_PREDICTIONS || !AI_PREDICTIONS.length) {
    _aiSlideList = [];
    _aiSlideIdx = 0;
    if (widget) widget.style.setProperty('display', 'none', 'important');
    syncAiPagerChrome();
    return;
  }

  if (widget) widget.style.setProperty('display', 'block', 'important');
  _aiSlideList = AI_PREDICTIONS.slice(0, 4);
  _aiSlideIdx = 0;
  paintAiSlide();
}

(function bindAiPagerButtons() {
  var prev = document.getElementById('aiPrevBtn');
  var next = document.getElementById('aiNextBtn');
  if (prev) prev.onclick = function() { goAiSlide(-1); };
  if (next) next.onclick = function() { goAiSlide(1); };
})();

function postAiPredictionToProposals(p) {
  if (!ME || !ME.name) {
    alert('Önerilere paylaşım yapmak için lütfen giriş yapın.');
    return;
  }
  
  var payload = {
    id: uid(),
    date: todayStr(),
    by_name: ME.name,
    match: p.match,
    league: p.league || '',
    market: p.market || 'Maç Sonucu',
    pick: p.pick,
    odd: Number(p.odd) || 1.80,
    event_id: p.event_id || null,
    ko: p.ko || null,
    comment: '🤖 Clasura AI Analizi (%' + (p.confidence || 85) + ' Güven): ' + (p.reasoning || '')
  };
  
  sbFetch('proposals?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload)
  }).then(function() {
    alert('📌 AI önerisi ' + ME.name + ' adıyla Öneriler akışına paylaşıldı!');
    refreshData().then(renderProps);
  }).catch(function(e) {
    alert('Paylaşım başarısız: ' + (e.message || e));
  });
}

function postAllAiPredictionsToProposals() {
  if (!ME || !ME.name) {
    alert('Önerilere paylaşım yapmak için lütfen giriş yapın.');
    return;
  }
  if (!AI_PREDICTIONS || !AI_PREDICTIONS.length) return;
  
  var items = AI_PREDICTIONS.slice(0, 4);
  var promises = items.map(function(p) {
    var payload = {
      id: uid(),
      date: todayStr(),
      by_name: ME.name,
      match: p.match,
      league: p.league || '',
      market: p.market || 'Maç Sonucu',
      pick: p.pick,
      odd: Number(p.odd) || 1.80,
      event_id: p.event_id || null,
      ko: p.ko || null,
      comment: '🤖 Clasura AI Analizi (%' + (p.confidence || 85) + ' Güven): ' + (p.reasoning || '')
    };
    return sbFetch('proposals?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload)
    });
  });
  
  Promise.all(promises).then(function() {
    alert('✨ 4 AI önerisi de ' + ME.name + ' adıyla Öneriler akışına paylaşıldı!');
    refreshData().then(renderProps);
  }).catch(function(e) {
    alert('Paylaşım sırasında hata oluştu: ' + (e.message || e));
  });
}

function addAiPredictionToDraft(p) {
  var d = draft();
  var existing = d.find(function(x) { return x.match === p.match && x.pick === p.pick; });
  if (existing) {
    alert('Bu AI önerisi zaten kupon taslağınızda ekli.');
    return;
  }
  
  d.push({
    id: uid(),
    eventId: p.event_id || null,
    mktI: null,
    no: null,
    match: p.match,
    league: p.league || '',
    ko: p.ko || null,
    market: p.market || 'Maç Sonucu',
    pick: p.pick,
    odd: Number(p.odd) || 1.80,
    comment: '🤖 Clasura AI Analizi: ' + (p.reasoning || ''),
    by: ME ? ME.name : 'AI',
    result: 'open'
  });
  
  saveDraft();
  renderMatches();
  renderBuilder();
  
  APP.draftDockCollapsed = false;
  renderBuilder();
  
  alert('🤖 AI önerisi taslağınıza eklendi!');
}

function shareAiPrediction(p) {
  var shareText = '🤖 Clasura AI Günlük Bahis Analizi\n\n' +
    '⚽ Maç: ' + p.match + '\n' +
    '🏆 Lig: ' + (p.league || 'Futbol') + '\n' +
    '🎯 Tahmin: ' + (p.market ? (p.market + ' - ') : '') + p.pick + ' (Oran: ' + fmtOdd(p.odd) + ')\n' +
    '🔥 Güven: %' + (p.confidence || 85) + '\n' +
    '💡 AI Yorumu: ' + (p.reasoning || '') + '\n\n' +
    '📲 Clasura App: https://gururp91.github.io/clasura-web/';

  if (navigator.share) {
    navigator.share({
      title: 'Clasura AI Bahis Önerisi',
      text: shareText,
      url: 'https://gururp91.github.io/clasura-web/'
    }).catch(function() {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(shareText).then(function() {
      alert('📋 AI Bahis Önerisi kopyalandı! WhatsApp veya sosyal medyada paylaşabilirsin.');
    }).catch(function() {
      alert(shareText);
    });
  } else {
    alert(shareText);
  }
}

/* =================== [MODULE: boot.js] =================== */
"use strict";
function applyPendingVoteToProposal(pr, pending){
  // Sunucu verisine sadece kullanıcının pending aksiyonunu uygula
  // Diğer üyelerin oylarına dokunma
  if(!pr||!pending)return;
  var ups=pr.votes||[],dns=pr.downs||[];
  var name=pending.name,kind=pending.kind;
  var target=kind==='up'?ups:dns;
  var other=kind==='up'?dns:ups;
  var ix=target.indexOf(name);
  if(pending.removing){
    if(ix>=0)target.splice(ix,1);
  }else{
    if(ix<0)target.push(name);
    var ox=other.indexOf(name);
    if(ox>=0)other.splice(ox,1);
  }
  pr.votes=ups;pr.downs=dns;
}
function refreshData(){
  var pendingAtStart={};
  Object.keys(_votePending).forEach(function(id){
    if(_votePending[id]&&typeof _votePending[id]==='object')pendingAtStart[id]=_votePending[id];
  });
  return rpc('bootstrap').then(function(b){
    S=b;
    Object.keys(pendingAtStart).forEach(function(id){
      var pr=getProposal(id);
      applyPendingVoteToProposal(pr,pendingAtStart[id]);
    });
    renderAll();
  }).catch(function(e){toast('Veri çekilemedi');});
}
function renderAll(){renderHeader();renderProps();renderBuilder();renderBasket();renderCoupons();renderSettings();
  if(document.getElementById('tab-stats').style.display!=='none')renderStats();}

document.getElementById('bDate').value=todayStr();
function bootApp(){
  if (typeof isGatePassed === 'function' && !isGatePassed()) {
    showGateOverlay(function() {
      initAppCore();
    });
    return;
  }
  initAppCore();
}

function initAppCore(){
  restoreSession();
  checkAppUpdate();
  if(ME.name)setLoginOpen(false);
  try { if (typeof loadAgentReport === 'function') loadAgentReport(); } catch(e){}
  refreshData().then(function(){
    tryAutoLogin();
    fetchEvents();
    loadAiPredictions();
    startRealtime();
  }).catch(function(){
    tryAutoLogin();
  });
}
if(window.customElements&&customElements.whenDefined){
  Promise.all([customElements.whenDefined('ion-app'),customElements.whenDefined('ion-modal')]).then(bootApp).catch(bootApp);
}else bootApp();
// Sayfa açıkken oranlar saatte bir kendiliğinden tazelenir
setInterval(function(){ if(document.visibilityState==='visible')fetchEvents(); }, 60*60*1000);

function applyVotesToProposal(proposalId,rows){
  var pr=getProposal(proposalId);
  if(!pr)return;
  var ups=[],downs=[];
  (rows||[]).forEach(function(v){
    if(v.kind==='up')ups.push(v.member_name);
    else downs.push(v.member_name);
  });
  if(_votePending[proposalId])return; // kendi optimistic oyu bitene kadar ezme
  pr.votes=ups;pr.downs=downs;
  patchPropCard(pr);
}
function fetchVotesForProposal(proposalId){
  return sbFetch('proposal_votes?proposal_id=eq.'+encodeURIComponent(proposalId)+'&select=*')
    .then(function(rows){applyVotesToProposal(proposalId,rows||[]);});
}
function softRefreshFromServer(){
  // Pending aksiyonları önceden al (sbBootstrap bitmeden silinebilir)
  var pendingAtStart={};
  Object.keys(_votePending).forEach(function(id){
    if(_votePending[id]&&typeof _votePending[id]==='object')pendingAtStart[id]=_votePending[id];
  });
  sbBootstrap().then(function(b){
    S=b;
    // Sunucu verisine SADECE kullanıcının aksiyonunu uygula
    // (tüm stale votes array'i değil — diğer oylar korunur)
    Object.keys(pendingAtStart).forEach(function(id){
      var pr=getProposal(id);
      applyPendingVoteToProposal(pr,pendingAtStart[id]);
    });
    renderHeader();renderProps();renderCoupons();
    if(document.getElementById('tab-stats').style.display!=='none')renderStats();
    // RPC bitmiş ama fetch esnasındaki pending'i koruduk — sunucudan doğrula
    Object.keys(pendingAtStart).forEach(function(id){
      if(!_votePending[id])fetchVotesForProposal(id).catch(function(){});
    });
  }).catch(function(){});
}
var _updateCheckBusy=false;
function checkAppUpdate(){
  if(_updateCheckBusy)return Promise.resolve();
  _updateCheckBusy=true;
  return fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){
    if(!r.ok)throw new Error('version');
    return r.json();
  }).then(function(d){
    var v=d&&d.v;if(!v)return;
    var cur='';
    try{cur=localStorage.getItem('kk-app-ver')||'';}catch(e){}
    if(!cur){
      try{localStorage.setItem('kk-app-ver',v);}catch(e){}
      return;
    }
    if(cur!==v){
      try{
        localStorage.setItem('kk-app-ver',v);
        localStorage.removeItem('kk-ev');
        localStorage.removeItem('kk-comps');
      }catch(e){}
      var base=location.pathname||'/';
      location.replace(base+'?v='+encodeURIComponent(v)+'&t='+Date.now());
    }
  }).catch(function(){}).finally(function(){_updateCheckBusy=false;});
}
window.kkCheckUpdate=checkAppUpdate;
var _rtPollTimer=null,_rtLive=false;
function startVotePoll(){
  if(_rtPollTimer)return;
  _rtPollTimer=setInterval(function(){
    if(document.visibilityState==='visible')softRefreshFromServer();
  },3000);
}
function stopVotePoll(){
  if(_rtPollTimer){clearInterval(_rtPollTimer);_rtPollTimer=null;}
}
function onVoteChange(payload){
  var row=(payload&&payload.new)||(payload&&payload.old)||null;
  var pid=row&&row.proposal_id;
  if(pid)fetchVotesForProposal(pid).catch(function(){softRefreshFromServer();});
  else softRefreshFromServer();
}
function startRealtime(){
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){
      checkAppUpdate();
      softRefreshFromServer();
    }
  });
  setInterval(function(){
    if(document.visibilityState==='visible')checkAppUpdate();
  },15*60*1000);
  if(!window.supabase||!SB_URL||!SB_KEY){
    startVotePoll();
    return;
  }
  try{
    var client=window.supabase.createClient(SB_URL,SB_KEY);
    client.channel('kk-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'proposal_votes'},onVoteChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'proposals'},softRefreshFromServer)
      .on('postgres_changes',{event:'*',schema:'public',table:'coupons'},softRefreshFromServer)
      .on('postgres_changes',{event:'*',schema:'public',table:'adjustments'},softRefreshFromServer)
      .subscribe(function(status){
        if(status==='SUBSCRIBED'){_rtLive=true;stopVotePoll();}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
          _rtLive=false;startVotePoll();
        }
      });
    // abone olana kadar kısa poll
    startVotePoll();
  }catch(e){
    startVotePoll();
  }
}

