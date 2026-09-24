"use strict";
/* ============ HESAP VE SİSTEM KUPON MATEMATİĞİ ============ */
function mathChoose(n, k){
  if(k < 0 || k > n) return 0;
  if(k === 0 || k === n) return 1;
  if(k > n / 2) k = n - k;
  var res = 1;
  for(var i = 1; i <= k; i++){
    res = (res * (n - i + 1)) / i;
  }
  return Math.round(res);
}

function getCombinations(arr, k){
  if(k === 0) return [[]];
  if(!arr || arr.length < k) return [];
  var result = [];
  function backtrack(start, current){
    if(current.length === k){
      result.push(current.slice());
      return;
    }
    for(var i = start; i < arr.length; i++){
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

function isSystemCoupon(c){
  if(!c) return false;
  if(c.isSystem || (c.system && c.system.isSystem)) return true;
  var t = String(c.type || '');
  return t.startsWith('sistem');
}

function parseSystemConfig(c){
  if(!c) return null;
  var sels = c.selections || [];
  var bankos = sels.filter(function(s){ return !!s.banko; });
  var nonBankos = sels.filter(function(s){ return !s.banko; });
  
  var levels = [];
  var mult = 1;
  
  if(c.system && Array.isArray(c.system.levels)){
    levels = c.system.levels.map(Number).filter(function(x){ return !isNaN(x) && x > 0; });
    mult = Number(c.system.multiplier) || 1;
  } else if(String(c.type || '').startsWith('sistem')){
    var parts = String(c.type).split(':');
    if(parts[1]){
      levels = parts[1].split(',').map(Number).filter(function(x){ return !isNaN(x) && x > 0; });
    }
    if(parts[2]){
      mult = Number(parts[2]) || 1;
    }
  } else if(sels.length && sels[0]._sys){
    levels = (sels[0]._sys.levels || []).map(Number);
    mult = Number(sels[0]._sys.mult) || 1;
  }

  if(!levels.length && sels.length){
    levels = [sels.length];
  }

  return {
    levels: levels.sort(function(a,b){ return a - b; }),
    multiplier: Math.max(1, mult),
    bankos: bankos,
    nonBankos: nonBankos
  };
}

function evaluateSystemCoupon(c){
  var cfg = parseSystemConfig(c);
  if(!cfg) return null;
  
  var bankos = cfg.bankos;
  var nonBankos = cfg.nonBankos;
  var B = bankos.length;
  var mult = cfg.multiplier;
  var bankoLost = bankos.some(function(s){ return s.result === 'lost'; });
  
  var allColumns = [];
  cfg.levels.forEach(function(lvl){
    var k = lvl - B;
    if(k < 0 || k > nonBankos.length) return;
    var combs = getCombinations(nonBankos, k);
    combs.forEach(function(comb){
      allColumns.push(bankos.concat(comb));
    });
  });
  
  var totalCols = allColumns.length;
  var wonCols = 0;
  var lostCols = 0;
  var openCols = 0;
  var wonOddsSum = 0;
  
  if(bankoLost){
    lostCols = totalCols;
  } else {
    allColumns.forEach(function(col){
      var hasLost = col.some(function(s){ return s.result === 'lost'; });
      if(hasLost){
        lostCols++;
        return;
      }
      var allSettled = col.every(function(s){ return s.result === 'won' || s.result === 'void'; });
      if(allSettled){
        wonCols++;
        var colOdd = col.reduce(function(p, s){
          return p * (s.result === 'void' ? 1 : (Number(s.odd) || 1));
        }, 1);
        wonOddsSum += colOdd;
      } else {
        openCols++;
      }
    });
  }
  
  var wonPayout = wonOddsSum * mult;
  var stake = Number(c.stake) || (totalCols * mult);
  
  var status = 'open';
  if(c.override){
    status = c.override;
  } else if(bankoLost){
    status = 'lost';
  } else if(openCols === 0){
    status = wonCols > 0 ? 'won' : 'lost';
  } else {
    status = 'open';
  }
  
  return {
    totalColumns: totalCols,
    wonColumns: wonCols,
    lostColumns: lostCols,
    openColumns: openCols,
    wonOddsSum: wonOddsSum,
    wonPayout: wonPayout,
    stake: stake,
    status: status,
    multiplier: mult,
    levels: cfg.levels,
    bankoCount: B
  };
}

function couponPotentialWin(c){
  if(!isSystemCoupon(c)){
    var odds = couponOdds(c);
    var st = Number(c.stake) || 0;
    return { min: st * odds, max: st * odds, totalCols: 1 };
  }
  var cfg = parseSystemConfig(c);
  if(!cfg) return { min: 0, max: 0, totalCols: 0 };
  var bankos = cfg.bankos;
  var nonBankos = cfg.nonBankos;
  var B = bankos.length;
  var mult = cfg.multiplier;
  
  var bankoOddsProd = bankos.reduce(function(p, s){
    return p * (s.result === 'void' ? 1 : (Number(s.odd) || 1));
  }, 1);

  var minColWin = Infinity;
  var maxTotalWin = 0;
  var totalCols = 0;

  cfg.levels.forEach(function(lvl){
    var k = lvl - B;
    if(k < 0 || k > nonBankos.length) return;
    var combs = getCombinations(nonBankos, k);
    combs.forEach(function(comb){
      totalCols++;
      var colOdd = bankoOddsProd * comb.reduce(function(p, s){
        return p * (s.result === 'void' ? 1 : (Number(s.odd) || 1));
      }, 1);
      var colWin = colOdd * mult;
      maxTotalWin += colWin;
      if(colWin < minColWin) minColWin = colWin;
    });
  });

  if(totalCols === 0 || minColWin === Infinity) minColWin = 0;
  return { min: minColWin, max: maxTotalWin, totalCols: totalCols };
}

function couponOdds(c){
  if(isSystemCoupon(c)){
    var ev = evaluateSystemCoupon(c);
    if(ev){
      if(ev.wonColumns > 0) return ev.wonOddsSum;
      return 0;
    }
  }
  return c.selections.reduce(function(p,s){return p*(s.result==='void'?1:(Number(s.odd)||1));},1);
}

function couponStatus(c){
  if(c.override) return c.override;
  if(isSystemCoupon(c)){
    var ev = evaluateSystemCoupon(c);
    return ev ? ev.status : 'open';
  }
  var sels = c.selections;
  if(!sels || !sels.length) return 'open';
  if(sels.some(function(s){ return s.result === 'lost'; })) return 'lost';
  if(sels.every(function(s){ return s.result === 'void'; })) return 'void';
  if(sels.every(function(s){ return s.result === 'won' || s.result === 'void'; })) return 'won';
  return 'open';
}

function couponPnl(c){
  var st = couponStatus(c), stake = Number(c.stake) || 0;
  if(isSystemCoupon(c)){
    var ev = evaluateSystemCoupon(c);
    if(ev){
      stake = ev.stake;
      if(st === 'won') return ev.wonPayout - stake;
      if(st === 'lost') return -stake;
      if(st === 'void') return 0;
      return -stake;
    }
  }
  if(st === 'won') return stake * couponOdds(c) - stake;
  if(st === 'lost') return -stake;
  if(st === 'void') return 0;
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
      exp+=st;
      if(isSystemCoupon(c)){
        pot += couponPotentialWin(c).max;
      } else {
        pot += st*couponOdds(c);
      }
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

