"use strict";
/* ============ AYARLAR ============ */
function renderSettings(){
  // Alanda mevcut kasayı göster (38.707 döneminden); kayınca bu tutar güncel kasayı ezer
  var elStart=document.getElementById('setStart');
  if(elStart)elStart.value=Math.round(statsBalance());
  var el=document.getElementById('memberInputs');
  if(el)el.innerHTML=(S.settings.members||[]).map(function(m,i){return '<input data-mi="'+i+'" value="'+esc(m)+'" placeholder="'+(i+1)+'. kişi">';}).join('');

  // Sistem Teşhis & Hata Günlüğü
  var sumEl = document.getElementById('diagErrorSummary');
  var listEl = document.getElementById('diagErrorList');
  if (sumEl && window.APP_ERRORS) {
    var logs = window.APP_ERRORS.getLogs();
    if (!logs || !logs.length) {
      sumEl.textContent = 'Kayıtlı hata yok (Sistem sağlıklı).';
      if (listEl) listEl.style.display = 'none';
    } else {
      sumEl.textContent = 'Son ' + logs.length + ' adet hata/uyarı kaydı:';
      if (listEl) {
        listEl.style.display = 'block';
        listEl.textContent = logs.map(function(l) {
          return '[' + l.ts.slice(11,19) + '] (' + l.src + ':' + l.line + ') ' + l.msg;
        }).join('\n');
      }
    }
  }
}

var btnSaveSettings = document.getElementById('btnSaveSettings');
if (btnSaveSettings) {
  btnSaveSettings.onclick=function(){
    var members=[];
    document.querySelectorAll('#memberInputs input').forEach(function(inp){members[Number(inp.dataset.mi)]=inp.value;});
    var target=Number(document.getElementById('setStart').value);
    if(isNaN(target)){toast('Geçerli bir kasa tutarı gir');return;}
    var newStart=startBalanceForTarget(target);
    mutate('saveSettings',{start:newStart,members:members,pin:null}).then(function(){
      STATS_START_BAL=target;
      saveStatsStartBal(target);
      toast('Kasa '+fmtTL(target)+' olarak ayarlandı');
      renderHeader();
      if(document.getElementById('tab-stats').style.display!=='none')renderStats();
    });
  };
}

var btnCopyDiag = document.getElementById('btnCopyDiagLogs');
if (btnCopyDiag) {
  btnCopyDiag.onclick = function() {
    if (!window.APP_ERRORS) return;
    var logs = window.APP_ERRORS.getLogs();
    if (!logs || !logs.length) {
      toast('Kopyalanacak hata kaydı yok');
      return;
    }
    var text = JSON.stringify(logs, null, 2);
    if (typeof copyText === 'function') {
      copyText(text);
      toast('Hata logları panoya kopyalandı');
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        toast('Hata logları panoya kopyalandı');
      });
    }
  };
}

var btnClearDiag = document.getElementById('btnClearDiagLogs');
if (btnClearDiag) {
  btnClearDiag.onclick = function() {
    if (!window.APP_ERRORS) return;
    window.APP_ERRORS.clearLogs();
    toast('Hata logları temizlendi');
    renderSettings();
  };
}


