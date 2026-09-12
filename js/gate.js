"use strict";
/* ============ WEB ACCESS GATEKEEPER ============ */
var GATE_SECRET = "Macau2026.";
var GATE_STORAGE_KEY = "kk_gate_auth";

function normalizeGateInput(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”"']/g, '');
}

function isValidGateSecret(val) {
  if (!val) return false;
  var v = normalizeGateInput(val);
  // Hem noktalı ("macau2026.") hem noktasız ("macau2026") her durumda geçerli kabul edilir
  return v === "macau2026." || v === "macau2026";
}

function isStandaloneApp() {
  try {
    if (window.navigator && window.navigator.standalone === true) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kklogin) return true;
  } catch (e) {}
  return false;
}

function checkSecretLinkParam() {
  try {
    var sp = new URLSearchParams(window.location.search);
    var key = sp.get('key') || sp.get('k') || sp.get('pass') || sp.get('code');
    if (key && isValidGateSecret(key)) {
      persistGateAuth();
      sp.delete('key'); sp.delete('k'); sp.delete('pass'); sp.delete('code');
      var clean = sp.toString() ? '?' + sp.toString() : '';
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + clean + window.location.hash);
      }
      return true;
    }
  } catch (e) {}
  return false;
}

function hasStoredGateAuth() {
  try {
    var val = localStorage.getItem(GATE_STORAGE_KEY) || '';
    if (isValidGateSecret(val)) return true;
    var m = document.cookie.match(/(?:^|; )kk_gate_auth=([^;]*)/);
    if (m && isValidGateSecret(decodeURIComponent(m[1]))) {
      localStorage.setItem(GATE_STORAGE_KEY, GATE_SECRET);
      return true;
    }
  } catch (e) {}
  return false;
}

function persistGateAuth() {
  try { localStorage.setItem(GATE_STORAGE_KEY, GATE_SECRET); } catch (e) {}
  try {
    document.cookie = 'kk_gate_auth=' + encodeURIComponent(GATE_SECRET) + ';path=/;max-age=31536000;SameSite=Lax';
  } catch (e) {}
}

function isGatePassed() {
  // 1. App (PWA / Standalone / iOS Native) ise asla şifre sorma
  if (isStandaloneApp()) return true;

  // 2. Gizli link ile gelinmişse yetkilendir ve geç
  if (checkSecretLinkParam()) return true;

  // 3. Daha önce bu cihazda şifre girilmişse geç
  if (hasStoredGateAuth()) return true;

  return false;
}

// Erken gizli link kontrolü
try { checkSecretLinkParam(); } catch (e) {}

function showGateOverlay(onSuccess) {
  var overlay = document.getElementById('gateOverlay');
  if (!overlay) {
    if (typeof onSuccess === 'function') onSuccess();
    return;
  }

  overlay.style.display = 'flex';

  var form = document.getElementById('gateForm');
  var input = document.getElementById('gatePasswordInput');
  var rememberCheck = document.getElementById('gateRememberCheck');
  var errorMsg = document.getElementById('gateErrorMsg');
  var eyeBtn = document.getElementById('btnGateToggleEye');
  var eyeIcon = document.getElementById('gateEyeIcon');

  if (eyeBtn && input) {
    eyeBtn.onclick = function(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (input.type === 'password') {
        input.type = 'text';
        if (eyeIcon) eyeIcon.setAttribute('name', 'eye-off-outline');
      } else {
        input.type = 'password';
        if (eyeIcon) eyeIcon.setAttribute('name', 'eye-outline');
      }
    };
  }

  if (input) {
    input.value = '';
    input.oninput = function() {
      if (errorMsg) errorMsg.style.display = 'none';
    };
    setTimeout(function() { input.focus(); }, 250);
  }
  if (errorMsg) errorMsg.style.display = 'none';

  var handled = false;
  function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (handled) return;

    var rawVal = input ? input.value : '';
    if (isValidGateSecret(rawVal)) {
      handled = true;
      if (!rememberCheck || rememberCheck.checked) {
        persistGateAuth();
      }
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s ease-out';
      setTimeout(function() {
        overlay.style.display = 'none';
        overlay.style.opacity = '1';
        if (typeof onSuccess === 'function') onSuccess();
      }, 250);
    } else {
      if (errorMsg) {
        errorMsg.textContent = 'Hatalı şifre. Lütfen tekrar deneyin.';
        errorMsg.style.display = 'block';
      }
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  if (form) form.onsubmit = handleSubmit;
  var btn = document.getElementById('btnGateSubmit');
  if (btn) btn.onclick = handleSubmit;
}
