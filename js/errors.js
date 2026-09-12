"use strict";
/* ============ GLOBAL ERROR BOUNDARY & TELEMETRİ ============ */

(function() {
  var STORAGE_KEY = 'clasura_error_logs_v1';
  var MAX_LOGS = 20;

  function safeStorageGet() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function safeStorageSet(logs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
    } catch (e) {}
  }

  function formatError(msg, src, line, col, err, type) {
    var stack = '';
    if (err && err.stack) {
      stack = String(err.stack).slice(0, 1000);
    }
    var shortSrc = src ? String(src).split('/').pop() : 'inline';
    return {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      ts: new Date().toISOString(),
      type: type || 'error',
      msg: String(msg || 'Bilinmeyen Hata'),
      src: shortSrc,
      line: line || 0,
      col: col || 0,
      stack: stack,
      tab: (window.APP && window.APP.activeTab) || 'unknown'
    };
  }

  function recordError(item) {
    var logs = safeStorageGet();
    logs.push(item);
    safeStorageSet(logs);

    // Supabase telemetri gönderim denemesi (arka planda sessiz)
    try {
      if (window.SB_URL && window.SB_KEY && window.USE_SUPABASE) {
        fetch(window.SB_URL + '/rest/v1/error_logs', {
          method: 'POST',
          headers: {
            'apikey': window.SB_KEY,
            'Authorization': 'Bearer ' + window.SB_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            message: item.msg,
            source: item.src,
            line: item.line,
            col: item.col,
            stack: item.stack,
            tab: item.tab,
            created_at: item.ts
          })
        }).catch(function() { /* sessiz yut */ });
      }
    } catch (e) {}
  }

  window.APP_ERRORS = {
    getLogs: safeStorageGet,
    clearLogs: function() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    },
    report: function(err, context) {
      var item = formatError(
        err ? (err.message || String(err)) : 'Manuel Rapor',
        context || 'manual',
        0, 0, err, 'manual'
      );
      recordError(item);
      return item;
    }
  };

  // 1. Global JS Hatalarını Yakala
  window.onerror = function(msg, src, line, col, err) {
    var item = formatError(msg, src, line, col, err, 'uncaught');
    recordError(item);
    // Hatanın varsayılan tarayıcı konsoluna da basılmasını engelleme (false dön)
    return false;
  };

  // 2. Asenkron Yakalanmamış Promise Hatalarını Yakala
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var msg = 'Unhandled Rejection';
    var err = null;
    if (reason instanceof Error) {
      msg = reason.message;
      err = reason;
    } else if (typeof reason === 'string') {
      msg = reason;
    } else if (reason) {
      try { msg = JSON.stringify(reason); } catch (e) { msg = String(reason); }
    }
    var item = formatError(msg, 'promise', 0, 0, err, 'unhandledrejection');
    recordError(item);
  });
})();
