"use strict";
/* ============ GİRİŞ (PIN yok — isim seç, kalıcı hatırla) ============ */
function readPersistedName(){
  var n='';
  try{n=(localStorage.getItem('kk-name')||'').trim();}catch(e){}
  if(!n){try{n=(sessionStorage.getItem('kk-name')||'').trim();}catch(e){}}
  if(!n){
    try{
      var m=document.cookie.match(/(?:^|; )kk-name=([^;]*)/);
      if(m)n=decodeURIComponent(m[1]||'').trim();
    }catch(e){}
  }
  if(n){
    try{localStorage.setItem('kk-name',n);}catch(e){}
    try{sessionStorage.setItem('kk-name',n);}catch(e){}
  }
  return n||'';
}
function persistName(name){
  name=(name||'').trim();
  if(!name)return;
  try{localStorage.setItem('kk-name',name);localStorage.removeItem('kk-pin');}catch(e){}
  try{sessionStorage.setItem('kk-name',name);}catch(e){}
  try{document.cookie='kk-name='+encodeURIComponent(name)+';path=/;max-age=31536000;SameSite=Lax';}catch(e){}
  // IndexedDB yedek (Safari ITP / storage wipe’a karşı)
  try{
    if(window.indexedDB){
      var req=indexedDB.open('kk-auth',1);
      req.onupgradeneeded=function(){req.result.createObjectStore('kv');};
      req.onsuccess=function(){
        try{
          var db=req.result;
          var tx=db.transaction('kv','readwrite');
          tx.objectStore('kv').put(name,'name');
        }catch(e){}
      };
    }
  }catch(e){}
}
function clearPersistedName(){
  try{localStorage.removeItem('kk-name');localStorage.removeItem('kk-pin');}catch(e){}
  try{sessionStorage.removeItem('kk-name');}catch(e){}
  try{document.cookie='kk-name=;path=/;max-age=0';}catch(e){}
  try{
    if(window.indexedDB){
      var req=indexedDB.open('kk-auth',1);
      req.onupgradeneeded=function(){req.result.createObjectStore('kv');};
      req.onsuccess=function(){
        try{
          var db=req.result;
          var tx=db.transaction('kv','readwrite');
          tx.objectStore('kv').delete('name');
        }catch(e){}
      };
    }
  }catch(e){}
}
function readNameFromIdb(){
  return new Promise(function(resolve){
    try{
      if(!window.indexedDB){resolve('');return;}
      var req=indexedDB.open('kk-auth',1);
      req.onerror=function(){resolve('');};
      req.onupgradeneeded=function(){req.result.createObjectStore('kv');};
      req.onsuccess=function(){
        try{
          var db=req.result;
          var tx=db.transaction('kv','readonly');
          var g=tx.objectStore('kv').get('name');
          g.onsuccess=function(){resolve((g.result&&String(g.result).trim())||'');};
          g.onerror=function(){resolve('');};
        }catch(e){resolve('');}
      };
    }catch(e){resolve('');}
  });
}
function restoreSession(){
  ME.name=readPersistedName();
  ME.pin='';
}
function syncNativeLogin(logout){
  try{
    if(window.webkit&&window.webkit.messageHandlers.kklogin){
      if(logout) window.webkit.messageHandlers.kklogin.postMessage({logout:true});
      else if(ME.name) window.webkit.messageHandlers.kklogin.postMessage({name:ME.name,pin:''});
    }
  }catch(e){}
}
function setLoginOpen(open){
  var modal=document.getElementById('loginModal');
  if(!modal)return;
  try{
    if(open){
      modal.isOpen=true;
      if(typeof modal.present==='function') modal.present();
    }else{
      modal.isOpen=false;
      if(typeof modal.dismiss==='function') modal.dismiss();
    }
  }catch(e){
    modal.isOpen=!!open;
  }
}
function completeLogin(name){
  name=(name||'').trim();
  if(!name)return;
  ME={name:name,pin:''};
  persistName(name);
  setLoginOpen(false);
  syncNativeLogin(false);
  renderAll();
}
function setLoginStep(step){
  var land=document.getElementById('loginLanding');
  var pick=document.getElementById('loginPick');
  if(land)land.classList.toggle('show',step==='landing');
  if(pick)pick.classList.toggle('show',step==='pick');
}
function showLanding(){
  setLoginStep('landing');
  setLoginOpen(true);
  var next=document.getElementById('btnLoginNext');
  if(next)next.onclick=function(){showLoginPick();};
}
function showLoginPick(){
  var members=(S.settings.members||[]).filter(function(m){return m&&m.trim();});
  var el=document.getElementById('loginNames');
  if(!el)return;
  el.innerHTML=members.map(function(m){
    return '<button type="button" class="login-chip" style="color:'+memberColor(m)+';border-color:'+memberColor(m)+'">'+esc(m)+'</button>';
  }).join('')||'<p class="muted">Üye listesi yok</p>';
  el.querySelectorAll('.login-chip').forEach(function(b){
    b.onclick=function(){completeLogin(b.textContent);};
  });
  setLoginStep('pick');
  setLoginOpen(true);
}
function tryAutoLogin(){
  restoreSession();
  if(ME.name){
    setLoginOpen(false);
    renderAll();
    syncNativeLogin(false);
    return;
  }
  readNameFromIdb().then(function(n){
    if(n){
      ME={name:n,pin:''};
      persistName(n);
      setLoginOpen(false);
      renderAll();
      syncNativeLogin(false);
      return;
    }
    showLanding();
  });
}
function showLogin(){
  restoreSession();
  if(ME.name){setLoginOpen(false);return;}
  showLanding();
}
document.getElementById('btnLogout').onclick=function(){
  clearPersistedName();
  ME={name:'',pin:''};
  syncNativeLogin(true);
  renderHeader();
  showLanding();
};

