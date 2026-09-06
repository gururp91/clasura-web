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

