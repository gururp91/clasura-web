"use strict";
function applyPendingVoteToProposal(pr, pending){
  // Sunucu verisine sadece kullanıcının pending aksiyonunu uygula
  // Diğer üyelerin oylarına dokunma
  if(!pr||!pending)return;
  var ups=pr.votes||[],dns=pr.downs||[];
  var name=pending.name,kind=pending.kind;
  var target=kind==='up'?ups:dns;
  var other=kind==='up'?dns:ups;
  var ix=target.indexOf(name);
  if(pending.removing){
    if(ix>=0)target.splice(ix,1);
  }else{
    if(ix<0)target.push(name);
    var ox=other.indexOf(name);
    if(ox>=0)other.splice(ox,1);
  }
  pr.votes=ups;pr.downs=dns;
}
function refreshData(){
  var pendingAtStart={};
  Object.keys(_votePending).forEach(function(id){
    if(_votePending[id]&&typeof _votePending[id]==='object')pendingAtStart[id]=_votePending[id];
  });
  return rpc('bootstrap').then(function(b){
    S=b;
    Object.keys(pendingAtStart).forEach(function(id){
      var pr=getProposal(id);
      applyPendingVoteToProposal(pr,pendingAtStart[id]);
    });
    renderAll();
  }).catch(function(e){toast('Veri çekilemedi');});
}
function renderAll(){renderHeader();renderProps();renderBuilder();renderBasket();renderCoupons();renderSettings();
  if(document.getElementById('tab-stats').style.display!=='none')renderStats();}

document.getElementById('bDate').value=todayStr();
function bootApp(){
  if (typeof isGatePassed === 'function' && !isGatePassed()) {
    showGateOverlay(function() {
      initAppCore();
    });
    return;
  }
  initAppCore();
}

function initAppCore(){
  restoreSession();
  checkAppUpdate();
  if(ME.name)setLoginOpen(false);
  try { if (typeof loadAgentReport === 'function') loadAgentReport(); } catch(e){}
  refreshData().then(function(){
    tryAutoLogin();
    fetchEvents();
    loadAiPredictions();
    startRealtime();
  }).catch(function(){
    tryAutoLogin();
  });
}
if(window.customElements&&customElements.whenDefined){
  Promise.all([customElements.whenDefined('ion-app'),customElements.whenDefined('ion-modal')]).then(bootApp).catch(bootApp);
}else bootApp();
// Sayfa açıkken oranlar saatte bir kendiliğinden tazelenir
setInterval(function(){ if(document.visibilityState==='visible')fetchEvents(); }, 60*60*1000);

function applyVotesToProposal(proposalId,rows){
  var pr=getProposal(proposalId);
  if(!pr)return;
  var ups=[],downs=[];
  (rows||[]).forEach(function(v){
    if(v.kind==='up')ups.push(v.member_name);
    else downs.push(v.member_name);
  });
  if(_votePending[proposalId])return; // kendi optimistic oyu bitene kadar ezme
  pr.votes=ups;pr.downs=downs;
  patchPropCard(pr);
}
function fetchVotesForProposal(proposalId){
  return sbFetch('proposal_votes?proposal_id=eq.'+encodeURIComponent(proposalId)+'&select=*')
    .then(function(rows){applyVotesToProposal(proposalId,rows||[]);});
}
function softRefreshFromServer(){
  // Pending aksiyonları önceden al (sbBootstrap bitmeden silinebilir)
  var pendingAtStart={};
  Object.keys(_votePending).forEach(function(id){
    if(_votePending[id]&&typeof _votePending[id]==='object')pendingAtStart[id]=_votePending[id];
  });
  sbBootstrap().then(function(b){
    S=b;
    // Sunucu verisine SADECE kullanıcının aksiyonunu uygula
    // (tüm stale votes array'i değil — diğer oylar korunur)
    Object.keys(pendingAtStart).forEach(function(id){
      var pr=getProposal(id);
      applyPendingVoteToProposal(pr,pendingAtStart[id]);
    });
    renderHeader();renderProps();renderCoupons();
    if(document.getElementById('tab-stats').style.display!=='none')renderStats();
    // RPC bitmiş ama fetch esnasındaki pending'i koruduk — sunucudan doğrula
    Object.keys(pendingAtStart).forEach(function(id){
      if(!_votePending[id])fetchVotesForProposal(id).catch(function(){});
    });
  }).catch(function(){});
}
var _updateCheckBusy=false;
function checkAppUpdate(){
  if(_updateCheckBusy)return Promise.resolve();
  _updateCheckBusy=true;
  return fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){
    if(!r.ok)throw new Error('version');
    return r.json();
  }).then(function(d){
    var v=d&&d.v;if(!v)return;
    var cur='';
    try{cur=localStorage.getItem('kk-app-ver')||'';}catch(e){}
    if(!cur){
      try{localStorage.setItem('kk-app-ver',v);}catch(e){}
      return;
    }
    if(cur!==v){
      try{
        localStorage.setItem('kk-app-ver',v);
        localStorage.removeItem('kk-ev');
        localStorage.removeItem('kk-comps');
      }catch(e){}
      var base=location.pathname||'/';
      location.replace(base+'?v='+encodeURIComponent(v)+'&t='+Date.now());
    }
  }).catch(function(){}).finally(function(){_updateCheckBusy=false;});
}
window.kkCheckUpdate=checkAppUpdate;
var _rtPollTimer=null,_rtLive=false;
function startVotePoll(){
  if(_rtPollTimer)return;
  _rtPollTimer=setInterval(function(){
    if(document.visibilityState==='visible')softRefreshFromServer();
  },3000);
}
function stopVotePoll(){
  if(_rtPollTimer){clearInterval(_rtPollTimer);_rtPollTimer=null;}
}
function onVoteChange(payload){
  var row=(payload&&payload.new)||(payload&&payload.old)||null;
  var pid=row&&row.proposal_id;
  if(pid)fetchVotesForProposal(pid).catch(function(){softRefreshFromServer();});
  else softRefreshFromServer();
}
function startRealtime(){
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){
      checkAppUpdate();
      softRefreshFromServer();
    }
  });
  setInterval(function(){
    if(document.visibilityState==='visible')checkAppUpdate();
  },15*60*1000);
  if(!window.supabase||!SB_URL||!SB_KEY){
    startVotePoll();
    return;
  }
  try{
    var client=window.supabase.createClient(SB_URL,SB_KEY);
    client.channel('kk-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'proposal_votes'},onVoteChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'proposals'},softRefreshFromServer)
      .on('postgres_changes',{event:'*',schema:'public',table:'coupons'},softRefreshFromServer)
      .on('postgres_changes',{event:'*',schema:'public',table:'adjustments'},softRefreshFromServer)
      .subscribe(function(status){
        if(status==='SUBSCRIBED'){_rtLive=true;stopVotePoll();}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
          _rtLive=false;startVotePoll();
        }
      });
    // abone olana kadar kısa poll
    startVotePoll();
  }catch(e){
    startVotePoll();
  }
}

