"use strict";
/* ============ ÖNERİLER ============ */
/* Oran sınıfı: 1.00–1.59 banko, 1.60–2.25 plase, 2.26+ sürpriz */
function numOdd(odd){
  if(typeof odd==='number'&&isFinite(odd))return odd;
  var n=parseFloat(String(odd==null?'':odd).replace(',','.'));
  return isFinite(n)?n:0;
}
function oddClass(odd){
  odd=numOdd(odd)||1;
  if(odd<1.60)return {k:'banko',t:'Banko'};
  if(odd<=2.25)return {k:'plase',t:'Plase'};
  return {k:'surpriz',t:'Sürpriz'};
}
function comparePropsByOdd(a,b){
  var oa=numOdd(a.odd),ob=numOdd(b.odd);
  if(oa!==ob)return oa-ob;
  var da=proposalWhenDate(a),db=proposalWhenDate(b);
  if(da&&db&&da.getTime()!==db.getTime())return da-db;
  return (b.createdAt||0)-(a.createdAt||0);
}
function proposalKickoffPassed(p){
  return !!(p.ko && Number(p.ko)*1000 <= Date.now());
}
function isAiBotProposal(p){
  var by=String((p&& (p.by||p.by_name))||'');
  return /clasura\s*ai/i.test(by) || by.indexOf('🤖')>=0;
}
var propDayFilter='all';
var propBFilter=false;
function proposalWhenDate(p){
  if(p.ko) return new Date(Number(p.ko)*1000);
  if(p.date){
    var parts=String(p.date).split('-');
    if(parts.length===3) return new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]),12,0,0);
  }
  return null;
}
function isWithinNext5Days(d){
  if(!d) return false;
  var now=new Date();
  var start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  var end=start.getTime()+7*864e5;
  var t=d.getTime();
  return t>=start.getTime()&&t<end;
}
function propDayBucket(d){
  var dow=d.getDay();
  if(dow===1) return 'mon';
  if(dow===2||dow===3) return 'tuewed';
  if(dow===4) return 'thu';
  if(dow===5) return 'fri';
  if(dow===6) return 'sat';
  if(dow===0) return 'sun';
  return null;
}
function matchesPropDayFilter(p){
  if(p.cls==='uzun') return true;
  var d=proposalWhenDate(p);
  if(!d) return propDayFilter==='all';
  if(!isWithinNext5Days(d)) return false;
  if(propDayFilter==='all') return true;
  return propDayBucket(d)===propDayFilter;
}
function renderProps(){
  var el=document.getElementById('propList');
  // Geçmiş öneriler DB'de kalır; Öneriler listesinde yalnızca başlamamışlar gösterilir.
  var list=(S.proposals||[]).filter(function(p){
    if(proposalKickoffPassed(p)||!matchesPropDayFilter(p))return false;
    if(propBFilter&&(p.votes||[]).length<5)return false;
    return true;
  });
  list.sort(comparePropsByOdd);
  if(!list.length){
    var hasAny=(S.proposals||[]).some(function(p){return !proposalKickoffPassed(p);});
    var msg=propBFilter?'5+ oy alan öneri yok':(hasAny?'Bu gün için öneri yok':'Henüz öneri yok');
    el.innerHTML='<div class="empty-state"><ion-icon name="chatbubbles-outline"></ion-icon><p>'+msg+'</p>'+
      (hasAny||propBFilter?'':'<button type="button" class="btn primary" id="goBuild">Öneri yap</button>')+'</div>';
    var gb=document.getElementById('goBuild');if(gb)gb.onclick=function(){switchTab('build');};
    return;
  }
  var groups={banko:[],plase:[],surpriz:[],uzun:[]};
  list.forEach(function(p){groups[p.cls==='uzun'?'uzun':oddClass(p.odd).k].push(p);});
  groups.banko.sort(comparePropsByOdd);
  groups.plase.sort(comparePropsByOdd);
  groups.surpriz.sort(comparePropsByOdd);
  groups.uzun.sort(comparePropsByOdd);
  var propHtml=function(p){
    var votes=p.votes||[];var mine=votes.indexOf(ME.name)>=0;
    var downs=p.downs||[];var mineDown=downs.indexOf(ME.name)>=0;
    var badge=propBadgesHtml(p);
    var started=p.ko&&p.ko*1000<=Date.now();
    var oc=p.cls==='uzun'?{k:'uzun',t:'Uzun'}:oddClass(p.odd);
    var when=p.ko?new Date(p.ko*1000).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
    var hasCmt=!!String(p.comment||'').trim();
    var cmtText=hasCmt?String(p.comment||'').trim():'';
    var b=basket();
    var inBasket=b.some(function(x){return String(x.propId)===String(p.id)||(x.match===p.match&&x.pick===p.pick);});
    var cartBtnClass='btn tiny'+(inBasket?' in-basket':'');
    var cartIcon=inBasket?'cart':'cart-outline';
    return '<div class="prop" data-id="'+p.id+'">'+
      '<div class="prop-top">'+
        '<div class="prop-title"><b>'+esc(p.match)+'</b>'+(badge?'<div class="prop-badges">'+badge+'</div>':'')+
          '<div class="prop-meta">'+esc(p.market)+': <b>'+esc(p.pick)+'</b>'+(when?' · '+when:'')+' · '+[p.by].concat(p.also||[]).map(nameSpan).join(', ')+'</div>'+
          (hasCmt?'<div class="prop-comment-box"><span class="cmt-icon">💬</span><span class="cmt-txt">'+esc(cmtText)+'</span></div>':'')+
        '</div>'+
        '<div class="prop-odd"><span class="podd">@'+fmtOdd(p.odd)+'</span><span class="pill '+oc.k+' prop-odd-pill">'+oc.t+'</span></div>'+
      '</div>'+
      '<div class="prop-foot">'+
        '<div class="prop-votes">'+
          voteBtnHtml('up',votes.length,mine,started)+
          voteBtnHtml('down',downs.length,mineDown,started)+
        '</div>'+
        '<div class="prop-btns">'+
          (hasCmt?'<button class="btn tiny icon-only has-comment" data-act="comment" title="Yorum"><ion-icon name="chatbubble-outline"></ion-icon><span class="cmt-dot" aria-hidden="true"></span></button>':'')+
          '<button class="'+cartBtnClass+'" data-act="tocoupon"'+(started?' disabled':'')+' title="'+(inBasket?'Sepetten çıkar':'Sepete ekle')+'"><ion-icon name="'+cartIcon+'"></ion-icon>'+(inBasket?'<span class="in-basket-dot"></span>':'')+' </button>'+
          (p.eventId?'<button class="btn tiny icon-only" data-act="frommatch"'+(started?' disabled':'')+' title="Maçtan"><ion-icon name="flash-outline"></ion-icon></button>':'')+
          '<button class="btn tiny danger icon-only" data-act="del" title="Sil"><ion-icon name="trash-outline"></ion-icon></button>'+
        '</div>'+
      '</div>'+
      '<div class="vote-roster">'+voteRosterHtml(votes,downs)+'</div>'+
      '</div>';
  };
  var GRP=[['banko','Banko','1.00–1.59'],['plase','Plase','1.60–2.25'],['surpriz','Sürpriz','2.26+'],['uzun','Uzun vadeli','özel']];
  var mainKeys=['banko','plase','surpriz'];
  var html='', mainCount=0;
  mainKeys.forEach(function(k){
    if(!groups[k].length)return;
    if(mainCount)html+='<div class="grp-sep" aria-hidden="true"></div>';
    var g=GRP.filter(function(x){return x[0]===k;})[0];
    html+='<div class="grp-title type-main '+g[0]+'"><strong>'+g[1]+'</strong><span>'+g[2]+'</span></div>'+groups[k].map(propHtml).join('');
    mainCount++;
  });
  if(groups.uzun.length){
    if(mainCount)html+='<div class="grp-sep" aria-hidden="true"></div>';
    var ug=GRP[3];
    html+='<div class="grp-title '+ug[0]+'"><strong>'+ug[1]+'</strong><span>'+ug[2]+'</span></div>'+groups.uzun.map(propHtml).join('');
  }
  el.innerHTML=html;
  el.querySelectorAll('.prop').forEach(function(box){
    var propId=box.dataset.id;
    var p=(S.proposals||[]).find(function(x){return String(x.id)===String(propId);});
    if(!p)return;
    var upBtn=box.querySelector('.votebtn.up');
    if(upBtn)upBtn.onclick=function(ev){ev.preventDefault();if(this.disabled)return;voteMutate('toggleVote',{id:p.id,name:ME.name});};
    var downBtn=box.querySelector('.votebtn.down');
    if(downBtn)downBtn.onclick=function(ev){ev.preventDefault();if(this.disabled)return;voteMutate('toggleDown',{id:p.id,name:ME.name});};
    var cmtBtn=box.querySelector('[data-act=comment]');
    if(cmtBtn)cmtBtn.onclick=function(){openProposalComment(p);};
    var toCouponBtn=box.querySelector('[data-act=tocoupon]');
    if(toCouponBtn){
      toCouponBtn.onclick=function(ev){
        if(ev){ev.preventDefault();ev.stopPropagation();}
        try{
          if(p.ko&&Number(p.ko)*1000<=Date.now()){toast('Maç başlamış — kupona eklenemez');return;}
          var b=basket();
          var existingIdx=-1;
          if(p.id){
            existingIdx=b.findIndex(function(x){return String(x.propId)===String(p.id);});
          }
          if(existingIdx<0){
            existingIdx=b.findIndex(function(x){return x.match===p.match&&x.pick===p.pick;});
          }
          if(existingIdx>=0){
            // Zaten sepette — ikinci kasıtlı tıklamada çıkar, ilkinde uyar
            if(!toCouponBtn.dataset.confirmRemove){
              toCouponBtn.dataset.confirmRemove='1';
              toCouponBtn.style.outline='2px solid #ff5555';
              toast('Zaten sepette · Kaldırmak için tekrar dokun');
              setTimeout(function(){if(toCouponBtn){toCouponBtn.dataset.confirmRemove='';toCouponBtn.style.outline='';}},3000);
              return;
            }
            toCouponBtn.dataset.confirmRemove='';
            toCouponBtn.style.outline='';
            b.splice(existingIdx,1);
            saveBasket();
            // Butonu güncelle (sepetten çıkıldı)
            toCouponBtn.className='btn tiny';
            toCouponBtn.innerHTML='<ion-icon name="cart-outline"></ion-icon> ';
            toCouponBtn.title='Sepete ekle';
            try{renderBasket();}catch(e){}
            toast('Sepetten çıkarıldı');
            return;
          }
          b.push({
            id: uid(),
            propId: p.id || ('p_' + uid()),
            eventId: p.eventId || p.event_id || null,
            mktI: p.mktI || p.mkt_i || null,
            no: p.no || null,
            match: p.match,
            league: p.league || '',
            ko: p.ko || null,
            cls: p.cls || null,
            market: p.market,
            pick: p.pick,
            odd: Number(p.odd) || 1.80,
            by: p.by || p.by_name || (ME && ME.name) || 'Üye',
            also: (p.also || []).slice(),
            result: 'open'
          });
          var k=p.cls==='uzun'?'uzun':oddClass(p.odd).k;
          var bTypeEl=document.getElementById('bType');
          if(bTypeEl) bTypeEl.value=k;
          saveBasket();
          // Butonu anında güncelle (sepete eklendi görsel geri bildirimi)
          toCouponBtn.className='btn tiny in-basket';
          toCouponBtn.innerHTML='<ion-icon name="cart"></ion-icon><span class="in-basket-dot"></span> ';
          toCouponBtn.title='Sepetten çıkar';
          console.log('[CLASURA] Sepete eklendi. APP.basket.length=',APP.basket.length,'localStorage=',Store.get('kk-basket',[]).length);
          try{renderBasket();}catch(e){console.error('[CLASURA] renderBasket err:',e);}
          var label=(TYPE_TR&&TYPE_TR[k])?TYPE_TR[k]:'Kupon';
          toast('Sepete eklendi · '+label+' ('+APP.basket.length+')');
        }catch(err){
          console.error('[CLASURA] tocoupon err:',err,err&&err.stack);
          toast('Hata: '+String(err&&err.message||err));
        }
      };
    }
    var delBtn=box.querySelector('[data-act=del]');
    if(delBtn)delBtn.onclick=function(){
      if(p.by!==ME.name && !isAiBotProposal(p)){
        toast('Sadece öneren kişi silebilir'+(p.by?' ('+p.by+')':''));
        return;
      }
      if(!confirm('Öneriyi silmek istediğine emin misin?'))return;
      mutate('delProposal',{id:p.id});
    };
    var fm=box.querySelector('[data-act=frommatch]');
    if(fm)fm.onclick=function(){openDetail(p.eventId,true);};
  });
}

