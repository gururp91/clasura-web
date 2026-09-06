"use strict";
/* ============ MERKEZI STORAGE SARMALAYICI ============ */
/* localStorage'a her yerden doğrudan erişmek yerine bu kullanılmalı.
   JSON parse/stringify hataları otomatik olarak yakalanır. */
var Store = (function() {
  function get(k, def) {
    try { var v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; }
    catch(e) { return def !== undefined ? def : null; }
  }
  function set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
  }
  function del(k) {
    try { localStorage.removeItem(k); } catch(e) {}
  }
  return { get: get, set: set, del: del };
})();
