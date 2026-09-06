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
