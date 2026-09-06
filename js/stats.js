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

