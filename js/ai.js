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

