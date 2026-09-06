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

