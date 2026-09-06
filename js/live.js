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

