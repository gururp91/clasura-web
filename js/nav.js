"use strict";
/* ============ NAV / INIT ============ */
function switchTab(t){
  trackEvent('tab_view', t);
  ['props','build','coupons','ai-props','stats','settings'].forEach(function(x){
    var el=document.getElementById('tab-'+x);
    if(el)el.style.display=x===t?'':'none';
  });
  document.querySelectorAll('ion-tab-button').forEach(function(b){
    if(b.tab===t)b.setAttribute('selected','true');
    else b.removeAttribute('selected');
  });
  if(t==='ai-props'){
    loadAgentReport();
  }
  if(t==='stats'){
    renderStats();
  }
  if(t==='props'){
    renderProps();
    maybeSyncProposalOdds(false);
  }
  if(t==='coupons')refreshData().then(maybeFetchLive);
  if(t==='build')loadAiPredictions();
  renderBuilder();
}
document.querySelectorAll('ion-tab-button').forEach(function(b){
  b.addEventListener('click',function(ev){ev.preventDefault();switchTab(b.tab);});
});
document.querySelectorAll('.dayf').forEach(function(b){b.onclick=function(){dayFilter=b.dataset.day;document.querySelectorAll('.dayf').forEach(function(x){x.classList.toggle('on',x===b);});renderMatches();renderProposeQuota();};});
document.querySelectorAll('.pdf').forEach(function(b){b.onclick=function(){
  propDayFilter=b.dataset.pdf||'all';
  document.querySelectorAll('.pdf').forEach(function(x){x.classList.toggle('on',x===b);});
  renderProps();
};});
(function(){
  var bBtn=document.getElementById('propBFilter');
  if(!bBtn)return;
  bBtn.onclick=function(){
    propBFilter=!propBFilter;
    bBtn.classList.toggle('on',propBFilter);
    bBtn.setAttribute('aria-pressed',propBFilter?'true':'false');
    renderProps();
  };
})();
document.getElementById('popChip').onclick=function(){popSort=!popSort;this.classList.toggle('on',popSort);if(popSort){specMode=false;document.getElementById('specChip').classList.remove('on');}renderLeagueChips();renderMatches();};
document.getElementById('specChip').onclick=function(){specMode=!specMode;this.classList.toggle('on',specMode);if(specMode){popSort=false;document.getElementById('popChip').classList.remove('on');}renderLeagueChips();renderMatches();};
document.getElementById('searchBox').oninput=function(e){searchQ=e.target.value.trim();renderMatches();};
document.getElementById('btnFetch').onclick = function() {
  fetchEvents();
  loadAiPredictions();
};
var btnAiBuild = document.getElementById('btnRefreshAiBuild');
if (btnAiBuild) btnAiBuild.onclick = function() { loadAiPredictions(); };
var btnAllAiBuild = document.getElementById('btnPostAllAiBuild');
if (btnAllAiBuild) btnAllAiBuild.onclick = function() { postAllAiPredictionsToProposals(); };
document.getElementById('btnRefresh').onclick=function(){
  refreshData().then(function(){return maybeSyncProposalOdds(true);});
};

