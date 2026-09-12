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

