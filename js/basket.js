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

