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

