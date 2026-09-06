"use strict";
/* ============ KAYDIR (Tinder) — bugünün önerileri ============ */
/* Swipe state APP.swipe* objelerinde yaşar — window global değil */
var SWIPE_CLS={
  banko:{k:'banko',t:'Banko',range:'1.00 – 1.59'},
  plase:{k:'plase',t:'Plase',range:'1.60 – 2.25'},
  surpriz:{k:'surpriz',t:'Sürpriz',range:'2.26+'},
  uzun:{k:'uzun',t:'Uzun vadeli',range:'özel'}
};
function swipeClassKey(p){
  if(!p)return null;
  if(p.cls==='uzun')return 'uzun';
  return oddClass(p.odd).k;
}
function swipeClassMeta(pOrKey){
  var k=typeof pOrKey==='string'?pOrKey:swipeClassKey(pOrKey);
  return SWIPE_CLS[k]||SWIPE_CLS.surpriz;
}
function swipeTodayList(){
  var day=todayStr();
  return (S.proposals||[]).filter(function(p){
    if(!p||proposalKickoffPassed(p))return false;
    if(matchDayKey(p)!==day)return false;
    if(ME.name&&(p.votes||[]).indexOf(ME.name)>=0)return false;
    if(APP.swipePassed[String(p.id)])return false;
    return true;
  }).sort(comparePropsByOdd);
}
function openSwipeDeck(){
  if(!ME.name){toast('Önce giriş yap');showLogin();return;}
  if(APP.swipeChapterTimer){clearTimeout(APP.swipeChapterTimer);APP.swipeChapterTimer=null;}
  APP.swipePassed={};
  APP.swipeQueue=swipeTodayList();
  APP.swipeIdx=0;
  APP.swipeBusy=false;
  var ov=document.getElementById('swipeOverlay');
  if(!ov)return;
  ov.classList.add('open');
  ov.setAttribute('aria-hidden','false');
  if(!APP.swipeQueue.length){
    renderSwipeDeck();
    return;
  }
  showSwipeChapter(swipeClassKey(APP.swipeQueue[0]),function(){
    renderSwipeDeck();
  });
}
function closeSwipeDeck(){
  if(APP.swipeChapterTimer){clearTimeout(APP.swipeChapterTimer);APP.swipeChapterTimer=null;}
  if(APP.swipeCardCleanup){APP.swipeCardCleanup();APP.swipeCardCleanup=null;}
  var ov=document.getElementById('swipeOverlay');
  if(ov){ov.classList.remove('open');ov.setAttribute('aria-hidden','true');}
  APP.swipeBusy=false;
  renderProps();
}
function showSwipeChapter(classKey,done){
  if(APP.swipeCardCleanup){APP.swipeCardCleanup();APP.swipeCardCleanup=null;}
  var stage=document.getElementById('swipeStage');
  var prog=document.getElementById('swipeProgress');
  var actions=document.getElementById('swipeActions');
  var meta=swipeClassMeta(classKey);
  if(actions)actions.style.display='none';
  if(prog)prog.textContent='Sıradaki grup';
  if(!stage){if(done)done();return;}
  APP.swipeBusy=true;
  stage.innerHTML='<div class="swipe-chapter '+meta.k+'">'+
    '<div class="sch-kicker">Sırada</div>'+
    '<h3 class="sch-title">'+esc(meta.t)+'</h3>'+
    '<p class="sch-range">'+esc(meta.range)+'</p>'+
  '</div>';
  if(APP.swipeChapterTimer)clearTimeout(APP.swipeChapterTimer);
  APP.swipeChapterTimer=setTimeout(function(){
    APP.swipeChapterTimer=null;
    APP.swipeBusy=false;
    if(done)done();
  },950);
}
function renderSwipeDeck(){
  if(APP.swipeCardCleanup){APP.swipeCardCleanup();APP.swipeCardCleanup=null;}
  var stage=document.getElementById('swipeStage');
  var prog=document.getElementById('swipeProgress');
  var actions=document.getElementById('swipeActions');
  if(!stage)return;
  var total=APP.swipeQueue.length;
  var left=Math.max(0,total-APP.swipeIdx);
  if(prog)prog.textContent=left?((APP.swipeIdx+1)+' / '+total):'Bitti';
  if(actions)actions.style.display=left?'flex':'none';
  if(!left){
    stage.innerHTML='<div class="swipe-empty"><p>Bugünün önerileri bitti.<br>Beğendiklerin Öneriler’de 👍 olarak kaldı.</p>'+
      '<button type="button" class="btn primary" id="swipeDoneBtn">Tamam</button></div>';
    var done=document.getElementById('swipeDoneBtn');
    if(done)done.onclick=closeSwipeDeck;
    return;
  }
  var p=APP.swipeQueue[APP.swipeIdx];
  if(!p){closeSwipeDeck();return;}
  var oc=swipeClassMeta(p);
  var when=p.ko?new Date(p.ko*1000).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  var cmt=String(p.comment||'').trim();
  stage.innerHTML='<div class="swipe-card" id="swipeCard">'+
    '<div class="swipe-stamp like">BEĞEN</div><div class="swipe-stamp pass">PAS</div>'+
    '<p class="sc-league">'+esc(p.league||oc.t)+(when?' · '+esc(when):'')+' · '+esc(oc.t)+'</p>'+
    '<h3 class="sc-match">'+esc(p.match)+'</h3>'+
    '<p class="sc-pick">'+esc(p.market)+': <b>'+esc(p.pick)+'</b></p>'+
    (cmt?'<p class="sc-pick" style="font-style:italic;color:#5a6788">“'+esc(cmt)+'”</p>':'')+
    '<div class="sc-row"><div><div class="sc-odd">@'+fmtOdd(p.odd)+'</div>'+
      '<div class="sc-meta">'+(when?esc(when)+' · ':'')+[p.by].concat(p.also||[]).map(function(n){return esc(n);}).join(', ')+'</div></div>'+
      '<span class="pill '+oc.k+'">'+oc.t+'</span></div>'+
  '</div>';
  bindSwipeCard(document.getElementById('swipeCard'),p);
}
function bindSwipeCard(card,p){
  if(!card)return;
  var startX=0,startY=0,dx=0,dy=0,dragging=false,locked=false;
  var likeStamp=card.querySelector('.swipe-stamp.like');
  var passStamp=card.querySelector('.swipe-stamp.pass');
  function setPos(x,y,rot,anim){
    card.style.transition=anim?'transform .28s ease, opacity .28s ease':'none';
    card.style.transform='translate(calc(-50% + '+x+'px), calc(-50% + '+y+'px)) rotate('+rot+'deg)';
  }
  function updateStamps(){
    var t=Math.min(1,Math.abs(dx)/110);
    if(likeStamp)likeStamp.style.opacity=dx>30?t:0;
    if(passStamp)passStamp.style.opacity=dx<-30?t:0;
  }
  function onDown(ev){
    if(APP.swipeBusy)return;
    var pt=ev.touches?ev.touches[0]:ev;
    dragging=true;locked=false;dx=0;dy=0;
    startX=pt.clientX;startY=pt.clientY;
  }
  function onMove(ev){
    if(!dragging||APP.swipeBusy)return;
    var pt=ev.touches?ev.touches[0]:ev;
    dx=pt.clientX-startX;dy=pt.clientY-startY;
    if(!locked){
      if(Math.abs(dx)+Math.abs(dy)<8)return;
      locked=Math.abs(dx)>Math.abs(dy);
      if(!locked){dragging=false;return;}
    }
    if(ev.cancelable)ev.preventDefault();
    setPos(dx,dy*0.15,dx/18,false);
    updateStamps();
  }
  function onUp(){
    if(!dragging)return;
    dragging=false;
    if(APP.swipeBusy)return;
    if(dx>110){commitSwipe('like',p,card);return;}
    if(dx<-110){commitSwipe('pass',p,card);return;}
    setPos(0,0,0,true);
    if(likeStamp)likeStamp.style.opacity=0;
    if(passStamp)passStamp.style.opacity=0;
  }
  card.addEventListener('mousedown',onDown);
  card.addEventListener('touchstart',onDown,{passive:true});
  window.addEventListener('mousemove',onMove,{passive:false});
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('mouseup',onUp);
  window.addEventListener('touchend',onUp);
  APP.swipeCardCleanup=function(){
    window.removeEventListener('mousemove',onMove);
    window.removeEventListener('touchmove',onMove);
    window.removeEventListener('mouseup',onUp);
    window.removeEventListener('touchend',onUp);
  };
}
function advanceAfterSwipe(fromP){
  APP.swipeIdx++;
  var next=APP.swipeQueue[APP.swipeIdx];
  if(!next){
    APP.swipeBusy=false;
    renderSwipeDeck();
    return;
  }
  var fromK=swipeClassKey(fromP);
  var nextK=swipeClassKey(next);
  if(fromK&&nextK&&fromK!==nextK){
    showSwipeChapter(nextK,function(){
      renderSwipeDeck();
    });
  }else{
    APP.swipeBusy=false;
    renderSwipeDeck();
  }
}
function commitSwipe(kind,p,card){
  if(APP.swipeBusy||!p)return;
  APP.swipeBusy=true;
  if(APP.swipeCardCleanup){APP.swipeCardCleanup();APP.swipeCardCleanup=null;}
  var fly=kind==='like'?520:-520;
  if(card){
    card.style.transition='transform .32s ease, opacity .32s ease';
    card.style.transform='translate(calc(-50% + '+fly+'px), -50%) rotate('+(fly>0?18:-18)+'deg)';
    card.style.opacity='0';
    var st=card.querySelector('.swipe-stamp.'+(kind==='like'?'like':'pass'));
    if(st)st.style.opacity='1';
  }
  if(kind==='like'){
    if((p.votes||[]).indexOf(ME.name)<0){
      voteMutate('toggleVote',{id:p.id,name:ME.name});
    }
  }else{
    APP.swipePassed[String(p.id)]=1;
  }
  setTimeout(function(){
    advanceAfterSwipe(p);
  },280);
}
function swipeDeckAction(kind){
  if(APP.swipeBusy)return;
  var p=APP.swipeQueue[APP.swipeIdx];
  var card=document.getElementById('swipeCard');
  if(!p)return;
  commitSwipe(kind,p,card);
}

(function(){
  var openBtn=document.getElementById('btnSwipeDeck');
  if(openBtn)openBtn.onclick=function(){openSwipeDeck();};
  var closeBtn=document.getElementById('swipeClose');
  if(closeBtn)closeBtn.onclick=closeSwipeDeck;
  var passBtn=document.getElementById('swipePassBtn');
  if(passBtn)passBtn.onclick=function(){swipeDeckAction('pass');};
  var likeBtn=document.getElementById('swipeLikeBtn');
  if(likeBtn)likeBtn.onclick=function(){swipeDeckAction('like');};
})();

