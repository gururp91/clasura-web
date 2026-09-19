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
    comment: '🤖 Clasura AI (' + seritLabel + ' · ' + kararLabel + '): ' + (b.gerekce || '') +
      (b.tempo ? ' [Tempo: ' + b.tempo + ']' : '') +
      (b.ev_sahasi ? ' [Ev Sahası: ' + b.ev_sahasi + ']' : '') +
      (b.zayif_yani ? ' [Risk: ' + b.zayif_yani + ']' : '')
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

function renderAgentCardHtml(b, isKasa, isOrtak) {
  var betKey = getAgentBetKey(b);
  AGENT_BETS_MAP[betKey] = b;

  var decisionCls = (b.karar === 'oyna' || b.karar === 'kesin oyna') ? 'karar-oyna' : 'karar-dikkat';
  var sinifCls = (b.sinif || '').toLowerCase();
  var oddVal = (b.oran === null || b.oran === undefined || isNaN(b.oran)) ? '—' : Number(b.oran).toFixed(2);
  var alreadyInProps = isBetInProposals(b);

  var badgesHtml = '';
  if (isOrtak) {
    badgesHtml += '<span class="agent-badge ortak-badge"><ion-icon name="people"></ion-icon> İKİ AGENT ORTAK</span>';
  }
  badgesHtml += '<span class="agent-badge sinif-' + sinifCls + '">' + esc(b.sinif || 'ÖNERİ') + '</span>';
  /* Rozet: ilk ölçümde SADECE puan; sonraki turlarda ilk öneriye göre hız etiketi
     ("hızlandı" / "geri çekildi" / "sabit"). Eski "düşen" kelimesi KALKTI (KURALLAR §C5, 17 Eyl 2026 gece). */
  if (b.puan !== undefined && b.puan !== null) {
    var pStr = '+' + Number(b.puan).toFixed(1).replace('.', ',') + 'p';
    var bandStr = b.band ? ' · ' + esc(b.band) : '';
    var olcumSuffix = b.olcum ? ' · ölçüm ' + esc(b.olcum) : '';
    var hizPrefix = b.hiz ? esc(b.hiz) + ' ' : '';
    var isGeri = (b.hiz === 'geri çekildi');
    badgesHtml += '<span class="agent-badge puan' + (isGeri ? ' puan-geri' : '') + '">' +
      hizPrefix + pStr + bandStr + olcumSuffix + '</span>';
  }
  if (b.karar) {
    badgesHtml += '<span class="agent-badge ' + decisionCls + '">' + esc(b.karar) + '</span>';
  }
  if (b.tur === 'oyuncu') {
    badgesHtml += '<span class="agent-badge oyuncu">🏃 OYUNCU</span>';
  }
  if (b.kasa === 'evet' || isKasa) {
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

  var subInfoHtml = '';
  if (b.xgot) {
    subInfoHtml += '<div class="agent-card-subinfo xgot">' +
      '<div class="subinfo-label"><ion-icon name="football-outline"></ion-icon> Şut Kalitesi (xGOT)</div>' +
      '<p>' + esc(b.xgot) + '</p>' +
      '</div>';
  }
  if (b.tempo) {
    subInfoHtml += '<div class="agent-card-subinfo tempo">' +
      '<div class="subinfo-label"><ion-icon name="speedometer-outline"></ion-icon> Tempo</div>' +
      '<p>' + esc(b.tempo) + '</p>' +
      '</div>';
  }
  if (b.ev_sahasi) {
    subInfoHtml += '<div class="agent-card-subinfo ev_sahasi">' +
      '<div class="subinfo-label"><ion-icon name="home-outline"></ion-icon> Ev Sahası Gücü</div>' +
      '<p>' + esc(b.ev_sahasi) + '</p>' +
      '</div>';
  }
  /* Oneri sonrasi oran kontrolu — yalniz Agent Macau (Engin karari, 17 Eyl 2026, KURALLAR §C4) */
  if (b.kontrol && b.kontrol.durum) {
    var c = b.kontrol;
    var kDurum = String(c.durum || '').trim();
    var kCls = (kDurum === 'geri döndü') ? 'geri' : (kDurum === 'tutuyor' || kDurum === 'hızlandı') ? 'iyi' : 'notr';
    var kIcon = (kDurum === 'geri döndü') ? 'arrow-undo-outline' : (kDurum === 'hızlandı') ? 'flash-outline' : (kDurum === 'tutuyor' ? 'checkmark-circle-outline' : 'time-outline');
    var kMsg = '';
    if (b.ilk && b.ilk.oran != null) {
      kMsg += 'Son durum: <b>' + esc(kDurum) + '</b>';
      if (c.oran != null) {
        kMsg += ' (güncel @' + Number(c.oran).toFixed(2) + (c.puan != null ? ' · ' + (c.puan >= 0 ? '+' : '') + Number(c.puan).toFixed(1).replace('.', ',') + 'p' : '') + ')';
      }
      kMsg += ' · <span class="kontrol-ilk-txt">İlk öneri (' + esc(b.ilk.olcum || '') + '): <b>@' + Number(b.ilk.oran).toFixed(2) + '</b>' + (b.ilk.puan != null ? ' · +' + Number(b.ilk.puan).toFixed(1).replace('.', ',') + 'p' : '') + '</span>';
    } else {
      if (c.oran !== null && c.oran !== undefined && !isNaN(c.oran)) {
        kMsg += 'Oran <b>' + Number(c.oran).toFixed(2) + '</b>';
        if (c.puan !== null && c.puan !== undefined) {
          var pVal = Number(c.puan);
          kMsg += ' · ' + (pVal >= 0 ? '+' : '') + pVal.toFixed(1).replace('.', ',') + 'p';
        }
        kMsg += ' — ';
      }
      kMsg += '<span class="kontrol-durum-txt">' + esc(kDurum) + '</span>';
    }

    subInfoHtml += '<div class="agent-card-subinfo kontrol kontrol-' + kCls + '">' +
      '<div class="subinfo-label"><ion-icon name="' + kIcon + '"></ion-icon> Son Kontrol ' + esc(c.saat || '') + '</div>' +
      '<p>' + kMsg + '</p>' +
      '</div>';
  }
  /* Iki bacak ayni macta TERS yondeyse tek cumle (Engin karari, 12 Eyl 2026) */
  if (b.ters_bacak) {
    subInfoHtml += '<div class="agent-card-subinfo ters">' +
      '<div class="subinfo-label"><ion-icon name="swap-horizontal-outline"></ion-icon> Diğer Bacak</div>' +
      '<p>' + esc(b.ters_bacak) + '</p>' +
      '</div>';
  }
  /* Ortak oneri durumunda para hareketi gerekcesi */
  if (b.gerekce_hareket) {
    subInfoHtml += '<div class="agent-card-subinfo hareket">' +
      '<div class="subinfo-label"><ion-icon name="trending-down-outline"></ion-icon> Para Hareketi Gerekçesi</div>' +
      '<p>' + esc(b.gerekce_hareket) + '</p>' +
      '</div>';
  }

  var postButtonHtml = alreadyInProps
    ? '<button type="button" class="btn tiny secondary agent-posted-btn" disabled>' +
        '<ion-icon name="checkmark-done-outline"></ion-icon> Önerilerde Yayında' +
      '</button>'
    : '<button type="button" class="btn tiny primary agent-share-btn" data-key="' + betKey + '">' +
        '<ion-icon name="sparkles"></ion-icon> Önerilere Ekle (AI)' +
      '</button>';

  var cardClasses = 'agent-card' + (isKasa ? ' is-kasa' : '') + (isOrtak ? ' is-ortak' : '');

  return '<div class="' + cardClasses + '">' +
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
    subInfoHtml +
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
  var timeStr = (d.uretim_zamani ? d.uretim_zamani.slice(11, 16) : '') || (d.veri_damgasi && d.veri_damgasi.oran_fotografi_saat) || (d.hareket_tablo && d.hareket_tablo.son) || '';
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
      (timeStr ? '<span><ion-icon name="time-outline"></ion-icon> Son Ölçüm: ' + esc(timeStr) + '</span>' : '') +
    '</div>';

  // 1b. Günün Analiz Özeti (varsa)
  if (d.ozet) {
    html += '<div class="agent-summary-card">' +
      '<div class="asc-head"><ion-icon name="analytics-outline"></ion-icon> Günün Analiz Özeti</div>' +
      '<p class="asc-body">' + esc(d.ozet) + '</p>' +
    '</div>';
  }

  html += '</div>';

  // 2. İki Agent'ın Ortak Önerdiği Bahisler — Vitrin (Engin kararı, 17 Eyl 2026 gece & 18 Eyl 13:15 turu)
  // Bölüm HER ZAMAN görünür: boşsa "yok" der. Kart değil satır (Günün En İyi Hareketi gibi dikkat çeken kompakt satır).
  var ort = (d.ortak && d.ortak.length) ? d.ortak : (d.kesisim && d.kesisim.secimler && d.kesisim.secimler.length ? d.kesisim.secimler : []);
  var isOrtakBos = (!ort || ort.length === 0);

  html += '<div class="agent-vitrin' + (isOrtakBos ? ' is-empty' : '') + '">' +
    '<div class="av-head">' +
      '<div class="av-title"><span class="av-star">✦</span> <b>İki Agent\'ın Ortak Önerdiği Bahisler</b></div>' +
      (isOrtakBos ? '' : '<span class="av-count-badge">' + ort.length + ' BAHİS</span>') +
    '</div>' +
    '<div class="av-sub">Meşin Yuvarlak ve Agent Macau aynı maç, aynı market, aynı seçimde buluştu.</div>';

  if (isOrtakBos) {
    html += '<div class="av-empty-msg"><ion-icon name="information-circle-outline"></ion-icon> Yok — bugün iki agent aynı seçimde buluşmadı.</div>';
  } else {
    html += '<div class="av-rows">';
    ort.forEach(function(b) {
      var betKey = getAgentBetKey(b);
      AGENT_BETS_MAP[betKey] = b;

      var oddStr = (b.oran === null || b.oran === undefined || isNaN(b.oran)) ? '—' : '@' + Number(b.oran).toFixed(2);
      var altParts = [(b.kisa || b.secim) + ' <b>' + oddStr + '</b>'];
      if (b.puan != null) {
        var pStr = '+' + Number(b.puan).toFixed(1).replace('.', ',') + 'p';
        if (b.hiz) pStr += ' ' + esc(b.hiz);
        altParts.push(pStr);
      }
      if (b.karar_hareket || b.karar) {
        altParts.push(esc(b.karar_hareket || b.karar));
      }
      if (b.olcum) {
        altParts.push('ölçüm ' + esc(b.olcum));
      }

      html += '<div class="av-row-item">' +
        '<div class="av-row-info">' +
          '<div class="av-row-match"><b>' + esc(b.mac) + '</b>' + (b.lig ? '<span class="av-row-league"> · ' + esc(b.lig) + '</span>' : '') + '</div>' +
          '<div class="av-row-sub">' + altParts.join(' · ') + '</div>' +
        '</div>' +
        '<div class="av-row-actions">' +
          '<button type="button" class="btn tiny secondary agent-cart-btn" data-key="' + betKey + '" title="Kupon Sepetine Ekle">' +
            '<ion-icon name="cart-outline"></ion-icon> Sepete' +
          '</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // 3. Bacak Önerileri (Meşin Yuvarlak & Agent Macau)
  var ALT_LEG_MAP = {
    futbol: "Sadece Futbol",
    hareket: "Para Hareketi",
    1: "Value Betting",
    2: "Sadece Futbol",
    3: "Macau Hareketi"
  };

  html += '<div class="agent-section">' +
    '<div class="agent-section-head">' +
      '<h3><ion-icon name="layers-outline"></ion-icon> Bacak Önerileri</h3>' +
      '<span class="sec-sub">İzlenen ve ölçümlenen güncel adaylar</span>' +
    '</div>';

  (d.bacaklar || []).forEach(function(bc) {
    var subLabel = ALT_LEG_MAP[bc.kod] || ALT_LEG_MAP[bc.no] || bc.alt_baslik || '';
    var bacakHeader = bc.no ? ('Bacak ' + bc.no + ' · ' + bc.ad) : bc.ad;
    var timeTag = bc.kontrol_saati
      ? '<span class="bacak-time-tag"><ion-icon name="time-outline"></ion-icon> Kontrol ' + esc(bc.kontrol_saati) + '</span>'
      : '';

    html += '<div class="agent-bacak-group">' +
      '<div class="agent-bacak-title">' +
        '<div class="bacak-title-left">' +
          '<h4>' + (bc.ikon || '📌') + ' ' + esc(bacakHeader) + '</h4>' +
          (subLabel ? '<span class="bacak-sub">' + esc(subLabel) + '</span>' : '') +
        '</div>' +
        timeTag +
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
      if (bc.bos_siniflar && bc.bos_siniflar.length) {
        html += '<div class="agent-empty-leg" style="margin-top:8px;"><ion-icon name="remove-circle-outline"></ion-icon> ' +
          esc(bc.bos_siniflar.join(' ve ') + ' sınıfında savunulabilir aday yok — boş bırakıldı.') + '</div>';
      }
    } else {
      var emptyMsg = (bc.bos_siniflar && bc.bos_siniflar.length)
        ? (bc.bos_siniflar.join(' ve ') + ' sınıfında savunulabilir aday yok — boş bırakıldı.')
        : 'Bu bacakta bugün eşleşen aday bulunamadı.';
      html += '<div class="agent-empty-leg"><ion-icon name="remove-circle-outline"></ion-icon> ' + esc(emptyMsg) + '</div>';
    }

    // Futbol Bacağı için: Oyuncu notu & Göstergeler Sözlüğü
    if (bc.kod === 'futbol' || bc.no === 2) {
      if (bc.oyuncu_notu) {
        html += '<div class="agent-empty-leg" style="margin-top:6px;"><ion-icon name="person-outline"></ion-icon> Oyuncu bahsi: ' + esc(bc.oyuncu_notu) + '</div>';
      }

      html += '<details class="agent-sozluk">' +
        '<summary><ion-icon name="help-circle-outline"></ion-icon> Göstergeler ne demek?</summary>' +
        '<ul>' +
          '<li><b>Tempo:</b> DataGaffer\'ın maç hızı puanı: iki takımın atak, şut ve pozisyon üretimi. Yüksek tempo, çok gollü maç demek.</li>' +
          '<li><b>Şut kalitesi (xGOT):</b> Kaleyi bulan şutların gol değeri. DataGaffer\'a göre golün en güçlü göstergesi; toplamı yüksek maçlar çok gollü bitiyor.</li>' +
          '<li><b>Gol beklentisi (xG):</b> Pozisyonların kalitesinden hesaplanan beklenen gol sayısı; şutun kaleyi bulup bulmadığına bakmaz.</li>' +
          '<li><b>Net pozisyon:</b> Gole çok yakın, büyük pozisyon sayısı (DataGaffer \'big chance\').</li>' +
          '<li><b>İsabetli şut:</b> Kaleyi bulan şut. Bir maçta toplamı yüksekse gol de yüksek geliyor.</li>' +
          '<li><b>Ev sahası gücü:</b> Takımın kendi sahasında ve deplasmanda ne kadar farklı oynadığı (DataGaffer venue puanı).</li>' +
        '</ul>' +
      '</details>';
    }

    // Hareket Bacağı için: Gecikme Notu, Oranı Düşenler / Yükselenler Tabloları & Yorumu
    if (bc.kod === 'hareket' || bc.no === 3) {
      html += '<div class="agent-delay-note">' +
        '<ion-icon name="information-circle-outline"></ion-icon>' +
        '<span>Oranlar iddaa\'nın kendi verisinden, her öneride ölçüm dakikasıyla; oynamadan önce güncel oranı yine kontrol et.</span>' +
      '</div>';

      var HT = d.hareket_tablo;
      if (HT && ((HT.dusenler && HT.dusenler.length) || (HT.yukselenler && HT.yukselenler.length))) {
        // Özet sayaç barı
        html += '<div class="hareket-ozet">' +
          '<div class="ho-item d"><span class="v">' + (HT.dusen_toplam || (HT.dusenler ? HT.dusenler.length : 0)) + '</span><span class="k">Düşen</span></div>' +
          '<div class="ho-item y"><span class="v">' + (HT.yukselen_toplam || (HT.yukselenler ? HT.yukselenler.length : 0)) + '</span><span class="k">Yükselen</span></div>' +
          (HT.esik ? '<div class="ho-item"><span class="v">%' + HT.esik + '</span><span class="k">Eşik</span></div>' : '') +
          (HT.son ? '<div class="ho-item"><span class="v">' + esc(HT.son) + '</span><span class="k">Ölçüm</span></div>' : '') +
        '</div>';

        // Oranı Düşenler Tablosu
        if (HT.dusenler && HT.dusenler.length > 0) {
          html += '<div class="tbl-baslik d"><span class="tbl-dot"></span> ORANI DÜŞENLER <span class="tbl-cnt">(' + HT.dusenler.length + ')</span></div>' +
            '<div class="agent-table-wrap">' +
              '<table class="agent-table table-movement">' +
                '<thead>' +
                  '<tr>' +
                    '<th>Maç</th>' +
                    '<th>Saat</th>' +
                    '<th>Seçim</th>' +
                    '<th>Açılış → Şimdi</th>' +
                    '<th style="text-align:center">%</th>' +
                    '<th>Gün Zirvesi</th>' +
                    '<th>Sınıf</th>' +
                    '<th style="text-align:right">Durum</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody>';
          HT.dusenler.forEach(function(x) {
            var degVal = Number(x.degisim || 0);
            var degStr = (degVal > 0 ? '+' : '') + degVal.toFixed(1).replace('.', ',') + '%';
            var z = x.zirve_ayri
              ? ((x.zirve > 0 ? '+' : '') + Number(x.zirve).toFixed(1).replace('.', ',') + '% @' + x.zirve_saat)
              : 'zirve = şimdi';
            var stCls = (x.durum || '').toLowerCase().replace(/\s+/g, '-');
            var snCls = (x.sinif || '').toLowerCase();
            html += '<tr>' +
              '<td class="team-col"><b>' + esc(x.mac) + '</b></td>' +
              '<td class="num-col mono-text">' + esc(x.kickoff || '') + '</td>' +
              '<td class="pick-col"><b>' + esc(x.secim) + '</b></td>' +
              '<td class="num-col mono-text">' + esc(x.acilis || '—') + ' → <b>' + esc(x.simdi || '—') + '</b></td>' +
              '<td class="pct-col" style="text-align:center"><span class="pct-badge d">' + degStr + '</span></td>' +
              '<td class="num-col mono-text" style="font-size:11px;color:#8fa2c7;">' + esc(z) + '</td>' +
              '<td><span class="agent-badge sinif-' + snCls + '">' + esc(x.sinif || '') + '</span></td>' +
              '<td style="text-align:right"><span class="status-pill ' + stCls + '">' + esc(x.durum || '') + '</span></td>' +
            '</tr>';
          });
          html += '</tbody></table></div>';
        }

        // Oranı Yükselenler Tablosu
        if (HT.yukselenler && HT.yukselenler.length > 0) {
          html += '<div class="tbl-baslik y"><span class="tbl-dot"></span> ORANI YÜKSELENLER <span class="tbl-cnt">(' + HT.yukselenler.length + ')</span></div>' +
            '<div class="agent-table-wrap">' +
              '<table class="agent-table table-movement">' +
                '<thead>' +
                  '<tr>' +
                    '<th>Maç</th>' +
                    '<th>Saat</th>' +
                    '<th>Seçim</th>' +
                    '<th>Açılış → Şimdi</th>' +
                    '<th style="text-align:center">%</th>' +
                    '<th>Gün Zirvesi</th>' +
                    '<th>Sınıf</th>' +
                    '<th style="text-align:right">Durum</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody>';
          HT.yukselenler.forEach(function(x) {
            var degVal = Number(x.degisim || 0);
            var degStr = (degVal > 0 ? '+' : '') + degVal.toFixed(1).replace('.', ',') + '%';
            var z = x.zirve_ayri
              ? ((x.zirve > 0 ? '+' : '') + Number(x.zirve).toFixed(1).replace('.', ',') + '% @' + x.zirve_saat)
              : 'zirve = şimdi';
            var stCls = (x.durum || '').toLowerCase().replace(/\s+/g, '-');
            var snCls = (x.sinif || '').toLowerCase();
            html += '<tr>' +
              '<td class="team-col"><b>' + esc(x.mac) + '</b></td>' +
              '<td class="num-col mono-text">' + esc(x.kickoff || '') + '</td>' +
              '<td class="pick-col"><b>' + esc(x.secim) + '</b></td>' +
              '<td class="num-col mono-text">' + esc(x.acilis || '—') + ' → <b>' + esc(x.simdi || '—') + '</b></td>' +
              '<td class="pct-col" style="text-align:center"><span class="pct-badge y">' + degStr + '</span></td>' +
              '<td class="num-col mono-text" style="font-size:11px;color:#8fa2c7;">' + esc(z) + '</td>' +
              '<td><span class="agent-badge sinif-' + snCls + '">' + esc(x.sinif || '') + '</span></td>' +
              '<td style="text-align:right"><span class="status-pill ' + stCls + '">' + esc(x.durum || '') + '</span></td>' +
            '</tr>';
          });
          html += '</tbody></table></div>';
        }
      }

      // Günün En İyi / İkinci Hareketi (Engin kararı, 17 Eyl 2026)
      var adayKaynak = (bc.oneriler && bc.oneriler.some(function(x) { return x.puan != null; }))
        ? bc.oneriler
        : ((d.hareket_tablo && d.hareket_tablo.adaylar && d.hareket_tablo.adaylar.length)
            ? d.hareket_tablo.adaylar
            : ((d.hareket_tablo && d.hareket_tablo.dusenler) ? d.hareket_tablo.dusenler : []));
      var acikHareket = adayKaynak.filter(function(x) { return x.puan != null; }).slice().sort(function(x, y) { return Number(y.puan) - Number(x.puan); });
      if (acikHareket.length > 0) {
        html += '<div class="agent-top-movements">';
        var topRanks = [
          { title: "Günün En İyi Hareketi", rankClass: "rank-1", icon: "trophy", item: acikHareket[0] },
          { title: "Günün En İyi İkinci Hareketi", rankClass: "rank-2", icon: "medal", item: acikHareket[1] }
        ];
        topRanks.forEach(function(r) {
          var x = r.item;
          if (!x) return;
          var rawOdd = (x.oran !== null && x.oran !== undefined && !isNaN(x.oran)) ? x.oran : x.simdi;
          var oddFormatted = (rawOdd !== null && rawOdd !== undefined && !isNaN(rawOdd)) ? '@' + Number(rawOdd).toFixed(2) : '';
          var pFormatted = '+' + Number(x.puan).toFixed(1).replace('.', ',') + 'p';
          var olcumVal = x.olcum || x.cekim;
          var olcumFormatted = olcumVal ? ' · ölçüm ' + esc(olcumVal) : '';
          var hizText = x.hiz ? ' ' + esc(x.hiz) : '';
          html += '<div class="atm-item ' + r.rankClass + '">' +
            '<div class="atm-badge"><ion-icon name="' + r.icon + '"></ion-icon> ' + esc(r.title) + '</div>' +
            '<div class="atm-row">' +
              '<span class="atm-match"><b>' + esc(x.mac) + '</b></span>' +
              '<span class="atm-pick">' + esc(x.kisa || x.secim) + ' <b>' + oddFormatted + '</b></span>' +
              '<span class="atm-puan">' + pFormatted + hizText + olcumFormatted + '</span>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      }

      // Hareket Yorumu
      if (d.hareket_yorum) {
        var hy = d.hareket_yorum;
        html += '<div class="agent-movement-box">' +
          '<div class="amb-head"><ion-icon name="trending-down-outline"></ion-icon> Piyasa Hareketleri Değerlendirmesi</div>';

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
    }

    html += '</div>';
  });
  html += '</div>';

  // 4. DataGaffer %100 Tablosu
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
        '<td class="pick-col">' + esc(r.secim || r.market || '') + '</td>' +
        '<td class="pct-col" style="text-align:center"><span class="dg-pct-badge">' + (typeof r.yuzde === 'number' ? r.yuzde + '%' : String(r.yuzde || '—')) + '</span></td>' +
        '<td class="sample-col mono-text" style="text-align:center">' + esc(r.orneklem || r.count || '') + '</td>' +
        '<td class="league-col" style="text-align:right">' +
          (r.bizim_ligimizde ? '<span class="tag-yes">EVET</span>' : '<span class="tag-no">—</span>') +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div></div>';
  }

  // 5. DG Top Picks Tablosu (varsa)
  if (d.dg_top_picks && d.dg_top_picks.kayitlar && d.dg_top_picks.kayitlar.length > 0) {
    var TP = d.dg_top_picks;
    html += '<div class="agent-section">' +
      '<div class="agent-section-head">' +
        '<h3><ion-icon name="star-outline"></ion-icon> DG Top Picks</h3>' +
        '<span class="sec-sub">Model olasılık & fiyat avantajı (edge)</span>' +
      '</div>';
    html += '<div class="agent-table-wrap">' +
      '<table class="agent-table table-dg-picks">' +
        '<thead>' +
          '<tr>' +
            '<th>Maç</th>' +
            '<th>DG Seçimi</th>' +
            '<th style="text-align:center">DG Olasılığı</th>' +
            '<th style="text-align:center">Fiyat Farkı</th>' +
            '<th style="text-align:right">Elit</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>';
    TP.kayitlar.forEach(function(k) {
      var edgeVal = Number(k.edge || 0);
      var edgeStr = (edgeVal > 0 ? '+' : '') + edgeVal + '%';
      html += '<tr class="' + (k.elit ? 'is-elite-pick' : '') + '">' +
        '<td class="team-col"><b>' + esc(k.mac) + '</b></td>' +
        '<td class="pick-col"><b>' + esc(k.secim) + '</b></td>' +
        '<td class="pct-col mono-text" style="text-align:center">%' + esc(k.sim) + '</td>' +
        '<td class="num-col mono-text" style="text-align:center"><span class="edge-badge ' + (edgeVal > 0 ? 'pos' : '') + '">' + edgeStr + '</span></td>' +
        '<td style="text-align:right">' +
          (k.elit ? '<span class="elite-star" title="Elit Aday">★ ELİT</span>' : '<span class="tag-no">—</span>') +
        '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    if (TP['not']) {
      html += '<div class="agent-empty-leg" style="margin-top:6px;">ℹ️ ' + esc(TP['not']) + '</div>';
    }
    html += '</div>';
  }

  // 6. Başarı Karnesi (Sınıf kırılımlarıyla birlikte)
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

      var nameIcon = '';
      if (s.ad.indexOf('Oyuncu') !== -1) {
        nameIcon = '<ion-icon name="person-outline" class="ak-icon-player"></ion-icon> ';
      } else if (s.ad.indexOf('Meşin') !== -1) {
        nameIcon = '<ion-icon name="football-outline" class="ak-icon-ball"></ion-icon> ';
      } else if (s.ad.indexOf('Macau') !== -1) {
        nameIcon = '<ion-icon name="trending-down-outline" class="ak-icon-macau"></ion-icon> ';
      } else if (s.ad.indexOf('DataGaffer') !== -1) {
        nameIcon = '<ion-icon name="stats-chart-outline" class="ak-icon-dg"></ion-icon> ';
      }

      var classesBreakdownHtml = '';
      if (s.siniflar) {
        var parca = Object.keys(s.siniflar).map(function(sn) {
          var obj = s.siniflar[sn] || {};
          return esc(sn) + ' ' + (obj.tuttu || 0) + '/' + (obj.kapanan || 0);
        });
        if (parca.length) {
          classesBreakdownHtml = '<div class="ak-row-classes">' + parca.join('  ·  ') + '</div>';
        }
      }

      var isPlayerRow = s.ad.indexOf('Oyuncu') !== -1;
      html += '<div class="agent-karne-row' + (isPlayerRow ? ' is-player-row' : '') + '">' +
        '<div class="ak-row-top">' +
          '<span class="ak-name">' + nameIcon + esc(s.ad) + '</span>' +
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
        classesBreakdownHtml +
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

  // 7. Açık Sorular (varsa)
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

  // 8. Alt Bilgi
  html += '<div class="agent-footer-note">' +
    '<span>Veri kaynağı: <code>agent-onerileri/kasa.json</code> · Sürüm ' + esc(d.surum || '2.0') + '</span>' +
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

  // "Kupona/Sepete Ekle" butonları
  container.querySelectorAll('.agent-basket-btn, .agent-cart-btn').forEach(function(btn) {
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
