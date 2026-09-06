"use strict";
/* ============ SUNUCU KÖPRÜSÜ ============ */
/* ============ SUPABASE KÖPRÜSÜ (TEST — canlı Apps Script değil) ============ */
function sbHeaders(extra){
  var h={apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json'};
  if(extra)for(var k in extra)h[k]=extra[k];
  return h;
}
function sbFetch(path,opts){
  opts=opts||{};
  var b = opts.body != null ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined;
  return fetch(SB_URL+'/rest/v1/'+path,{
    method:opts.method||'GET',
    headers:sbHeaders(opts.headers),
    body:b
  }).then(function(r){
    return r.text().then(function(t){
      if(!r.ok)throw new Error((t&&t.slice(0,200))||('HTTP '+r.status));
      if(!t)return null;
      try{return JSON.parse(t);}catch(e){return t;}
    });
  });
}
function sbRpc(name,args){
  return fetch(SB_URL+'/rest/v1/rpc/'+name,{
    method:'POST',headers:sbHeaders(),body:JSON.stringify(args||{})
  }).then(function(r){
    return r.text().then(function(t){
      if(!r.ok)throw new Error((t&&t.slice(0,200))||('RPC '+r.status));
      if(!t)return null;
      try{return JSON.parse(t);}catch(e){return t;}
    });
  });
}
function mapProposal(row,voteMap){
  var ups=[],downs=[];
  if(Array.isArray(row.proposal_votes)){
    row.proposal_votes.forEach(function(pv){
      if(pv.kind==='up')ups.push(pv.member_name);
      else downs.push(pv.member_name);
    });
  }else if(voteMap&&voteMap[row.id]){
    ups=voteMap[row.id].ups||[];
    downs=voteMap[row.id].downs||[];
  }
  return{
    id:row.id,date:row.date,by:row.by_name,also:row.also||[],
    createdAt:row.created_at?new Date(row.created_at).getTime():0,
    match:row.match,league:row.league||'',ko:row.ko,cls:row.cls,
    market:row.market,pick:row.pick,odd:Number(row.odd),
    eventId:row.event_id,mktI:row.mkt_i,no:row.no,
    comment:row.comment||'',
    result:row.result||(row.cls==='won'||row.cls==='lost'?row.cls:null),
    votes:ups,downs:downs
  };
}
function mapCoupon(row){
  var sels=row.selections||[];
  if(typeof sels==='string'){try{sels=JSON.parse(sels);}catch(e){sels=[];}}
  if(!Array.isArray(sels))sels=[];
  return{
    id:row.id,date:row.date,type:row.type,stake:Number(row.stake)||0,
    override:row.override||null,
    createdAt:row.created_at?new Date(row.created_at).getTime():0,
    createdBy:row.created_by,selections:sels
  };
}
/** Kupon bacaklarına öneri also[] bilgisini yaz (eski kayıtlar / eksik also). */
function enrichCouponsFromProposals(coupons,proposals){
  var byId={};
  (proposals||[]).forEach(function(p){if(p&&p.id)byId[p.id]=p;});
  (coupons||[]).forEach(function(c){
    (c.selections||[]).forEach(function(s){
      var p=s.propId?byId[s.propId]:null;
      if(!p&&!(s.also&&s.also.length))return;
      var names=[],seen={};
      function add(n){n=(n||'').trim();if(!n||seen[n])return;seen[n]=1;names.push(n);}
      add(s.by);(s.also||[]).forEach(add);
      if(p){add(p.by);(p.also||[]).forEach(add);}
      if(names.length){s.by=names[0];s.also=names.slice(1);}
    });
  });
  return coupons;
}
function mapAdj(row){
  return{id:row.id,date:row.date,amount:Number(row.amount)||0,note:row.note||'',by:row.by_name};
}
function sbBootstrap(){
  return Promise.all([
    sbFetch('settings?id=eq.1&select=*'),
    sbRpc('list_members',{}),
    sbFetch('proposals?select=*,proposal_votes(*)&order=created_at.desc'),
    Promise.resolve([]),
    sbFetch('coupons?select=*&order=date.desc'),
    sbFetch('adjustments?select=*&order=date.desc')
  ]).then(function(res){
    var settingsRow=(res[0]&&res[0][0])||{start_balance:88000};
    var members=res[1]||[];
    var proposals=(res[2]||[]).map(function(r){return mapProposal(r);});
    var coupons=enrichCouponsFromProposals((res[4]||[]).map(mapCoupon), proposals);
    return{
      settings:{start:Number(settingsRow.start_balance)||0,members:members,hasPin:true},
      proposals:proposals,
      coupons:coupons,
      adjustments:(res[5]||[]).map(mapAdj)
    };
  });
}
function rpc(fn){
  var args=Array.prototype.slice.call(arguments,1);
  document.getElementById('busy').style.display='block';
  var p;
  if(fn==='bootstrap')p=sbBootstrap();
  else if(fn==='checkPin')p=Promise.resolve(false); // kişisel PIN: check_member_pin kullanılır
  else if(fn==='getLiveScores')p=Promise.resolve({});
  else p=Promise.reject(new Error('rpc yok: '+fn));
  return p.then(function(v){document.getElementById('busy').style.display='none';return v;})
    .catch(function(e){document.getElementById('busy').style.display='none';throw e;});
}
function rpcSilent(fn){return rpc.apply(null,arguments);}
function getProposal(id){
  for(var i=0;i<S.proposals.length;i++){if(S.proposals[i].id===id)return S.proposals[i];}
  return null;
}
function propBadgesHtml(p){
  var votes=p.votes||[],downs=p.downs||[];
  var badge=votes.length>=6?'<span class="pill highconf">Yüksek Güven</span>':(votes.length===5?'<span class="pill banko">Güven</span>':'');
  if(downs.length>=3)badge+=' <span class="pill macau">Macau Alert</span>';
  if(p.ko&&p.ko*1000<=Date.now())badge+=' <span class="pill lost">Başladı</span>';
  return badge;
}
function voteRosterHtml(votes,downs){
  var ups=votes||[],dns=downs||[];
  if(!ups.length&&!dns.length)return '';
  function chips(list,kind){
    return list.map(function(n){
      var me=(ME&&ME.name&&n===ME.name)?' me':'';
      return '<span class="vote-chip '+kind+me+'">'+esc(n)+'</span>';
    }).join('');
  }
  var html='';
  if(ups.length){
    html+='<div class="vote-line up"><ion-icon class="vl-icon" name="thumbs-up"></ion-icon><div class="vote-chips">'+chips(ups,'up')+'</div></div>';
  }
  if(dns.length){
    html+='<div class="vote-line down"><ion-icon class="vl-icon" name="thumbs-down"></ion-icon><div class="vote-chips">'+chips(dns,'down')+'</div></div>';
  }
  return html;
}
function voteBtnHtml(kind,count,on,started){
  var icon=kind==='up'?'thumbs-up-outline':'thumbs-down-outline';
  return '<button type="button" class="votebtn '+kind+(on?' on':'')+'"'+(started?' disabled':'')+'>'+
    '<ion-icon name="'+icon+'"></ion-icon><span class="vcount">'+count+'</span></button>';
}
function patchPropCard(p){
  var box=document.querySelector('.prop[data-id="'+p.id+'"]');
  if(!box)return;
  var votes=p.votes||[],downs=p.downs||[];
  var mine=votes.indexOf(ME.name)>=0,mineDown=downs.indexOf(ME.name)>=0;
  var started=p.ko&&p.ko*1000<=Date.now();
  var up=box.querySelector('.votebtn.up'),down=box.querySelector('.votebtn.down');
  if(!up||!down)return;
  up.className='votebtn up'+(mine?' on':'');
  down.className='votebtn down'+(mineDown?' on':'');
  up.querySelector('.vcount').textContent=String(votes.length);
  down.querySelector('.vcount').textContent=String(downs.length);
  up.disabled=!!started;down.disabled=!!started;
  var roster=box.querySelector('.vote-roster');
  if(roster)roster.innerHTML=voteRosterHtml(votes,downs);
  var badges=box.querySelector('.prop-badges'),bhtml=propBadgesHtml(p);
  if(bhtml){
    if(badges)badges.innerHTML=bhtml;
    else box.querySelector('.prop-title').insertAdjacentHTML('beforeend','<div class="prop-badges">'+bhtml+'</div>');
  }else if(badges)badges.remove();
}
function applyVoteToggle(id,name,isDown){
  var pr=getProposal(id);
  if(!pr)return false;
  var v=pr.votes||[],dn=pr.downs||[];
  var main=isDown?dn:v,other=isDown?v:dn;
  var ix=main.indexOf(name);
  if(ix>=0)main.splice(ix,1);
  else{
    main.push(name);
    var ox=other.indexOf(name);
    if(ox>=0)other.splice(ox,1);
  }
  pr.votes=v;pr.downs=dn;
  return true;
}
// _votePending: id → {name, kind, removing}
// Tüm votes array'i değil, sadece kullanıcının aksiyonu saklanır.
// softRefreshFromServer bunu sunucu verisine uygular → diğer oylar zarar görmez.
var _votePending={};
function voteMutate(action,payload){
  if(!ME.name){toast('Önce giriş yap');showLogin();return;}
  if(!payload||!payload.id)return;
  var pr0=getProposal(payload.id);
  if(!pr0)return;
  var snapVotes=(pr0.votes||[]).slice();
  var snapDowns=(pr0.downs||[]).slice();
  var kind=action==='toggleDown'?'down':'up';
  // Kullanıcı zaten bu yönde oy vermiş mi? (toggle off mu?)
  var arr=kind==='up'?snapVotes:snapDowns;
  var removing=arr.indexOf(ME.name)>=0;
  if(!applyVoteToggle(payload.id,payload.name,action==='toggleDown'))return;
  var pr=getProposal(payload.id);
  if(pr)patchPropCard(pr);
  var pid=payload.id;
  // Aksiyonu kaydet (tüm votes yerine sadece ne yapıldığı)
  _votePending[pid]={name:ME.name,kind:kind,removing:removing};
  sbRpc('toggle_vote',{p_proposal_id:pid,p_name:ME.name,p_kind:kind}).then(function(res){
    var data=Array.isArray(res)?res[0]:res;
    var cur=getProposal(pid);
    if(cur&&data&&(Array.isArray(data.ups)||Array.isArray(data.downs))){
      // RPC'den gelen kesin sunucu verisi — doğrudan uygula
      cur.votes=data.ups||[];
      cur.downs=data.downs||[];
      patchPropCard(cur);
    } else {
      fetchVotesForProposal(pid).catch(function(){});
    }
  }).catch(function(e){
    var p2=getProposal(pid);
    if(p2){p2.votes=snapVotes;p2.downs=snapDowns;patchPropCard(p2);}
    toast('Oy kaydedilemedi: '+(e.message||e));
  }).then(function(){delete _votePending[pid];});
}

function proposalToRow(p){
  return{
    id:String(p.id),date:p.date||null,by_name:p.by,also:p.also||[],
    created_at:p.createdAt?new Date(p.createdAt).toISOString():new Date().toISOString(),
    match:p.match,league:p.league||'',ko:p.ko!=null?Number(p.ko):null,cls:p.cls||null,
    market:p.market,pick:p.pick,odd:Number(p.odd)||1,
    event_id:p.eventId!=null?Number(p.eventId):null,
    mkt_i:p.mktI!=null?Number(p.mktI):null,
    no:p.no!=null?Number(p.no):null,
    comment:String(p.comment||'').trim()
  };
}
function couponToRow(c){
  return{
    id:String(c.id),date:c.date,type:c.type||'banko',stake:Number(c.stake)||0,
    override:c.override||null,
    created_at:c.createdAt?new Date(c.createdAt).toISOString():new Date().toISOString(),
    created_by:c.createdBy||null,selections:c.selections||[]
  };
}
function findSameProposal(s){
  for(var i=0;i<(S.proposals||[]).length;i++){
    var p=S.proposals[i];
    if(s.eventId!=null&&p.eventId!=null){
      if(Number(p.eventId)===Number(s.eventId)&&Number(p.mktI)===Number(s.mktI)&&Number(p.no)===Number(s.no))return p;
    }else if((s.eventId==null||s.eventId==='')&&(p.eventId==null||p.eventId==='')){
      if(p.match===s.match&&p.market===s.market&&p.pick===s.pick)return p;
    }
  }
  return null;
}
function isOnProposal(p,name){
  if(!p||!name)return false;
  if(p.by===name)return true;
  return (p.also||[]).indexOf(name)>=0;
}
var DAILY_PROPOSAL_LIMIT=6;
function matchDayKey(item){
  if(!item)return todayStr();
  if(item.cls==='uzun'&&!item.ko)return 'uzun';
  if(item.ko!=null&&item.ko!=='')return dstr(new Date(Number(item.ko)*1000));
  if(item.date)return String(item.date).slice(0,10);
  return todayStr();
}
function matchDayLabel(dayKey){
  if(dayKey==='uzun')return 'uzun vadeli';
  var parts=String(dayKey).split('-');
  if(parts.length!==3)return dayKey;
  var d=new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]));
  return d.toLocaleDateString('tr-TR',{day:'numeric',month:'long'});
}
function quotaFocusDay(){
  if(typeof dayFilter!=='undefined'&&dayFilter==='tomorrow')return dstr(new Date(Date.now()+864e5));
  return todayStr();
}
function isOnProposalAsMe(p){
  return !!(p&&ME.name&&(p.by===ME.name||(p.also||[]).indexOf(ME.name)>=0));
}
function myProposalsOnMatchDay(dayKey){
  if(!ME.name||!dayKey)return 0;
  return (S.proposals||[]).filter(function(p){
    return isOnProposalAsMe(p)&&matchDayKey(p)===dayKey;
  }).length;
}
function proposeSlotsLeftForDay(dayKey){
  return Math.max(0,DAILY_PROPOSAL_LIMIT-myProposalsOnMatchDay(dayKey));
}
function neededByMatchDay(sels){
  var byDay={};
  (sels||[]).forEach(function(s){
    var exist=findSameProposal(s);
    if(exist&&isOnProposal(exist,ME.name))return;
    var day=matchDayKey(s);
    byDay[day]=(byDay[day]||0)+1;
  });
  return byDay;
}
function countNeededProposals(sels){
  var n=0,by=neededByMatchDay(sels);
  Object.keys(by).forEach(function(k){n+=by[k];});
  return n;
}
function assertCanProposeSels(sels){
  if(!ME.name){toast('Önce giriş yap');showLogin();return false;}
  var byDay=neededByMatchDay(sels);
  var days=Object.keys(byDay);
  if(!days.length)return true;
  for(var i=0;i<days.length;i++){
    var day=days[i],need=byDay[day],used=myProposalsOnMatchDay(day),left=Math.max(0,DAILY_PROPOSAL_LIMIT-used);
    if(left<=0){
      toast(matchDayLabel(day)+' maçları için öneri hakkın doldu (maks '+DAILY_PROPOSAL_LIMIT+').');
      return false;
    }
    if(need>left){
      toast(matchDayLabel(day)+' için en fazla '+DAILY_PROPOSAL_LIMIT+' öneri. Kalan '+left+', seçimin '+need+'.');
      return false;
    }
  }
  return true;
}
function assertCanProposeItem(item){
  return assertCanProposeSels([item]);
}
function ensureProposerUpvote(proposalId, name){
  if(!proposalId||!name)return Promise.resolve();
  var q='proposal_votes?proposal_id=eq.'+encodeURIComponent(proposalId)+
    '&member_name=eq.'+encodeURIComponent(name)+'&select=kind';
  return sbFetch(q).then(function(rows){
    var cur=rows&&rows[0];
    if(cur&&cur.kind==='up')return;
    if(cur&&cur.kind==='down'){
      return sbFetch(
        'proposal_votes?proposal_id=eq.'+encodeURIComponent(proposalId)+
        '&member_name=eq.'+encodeURIComponent(name),
        {method:'PATCH',headers:{Prefer:'return=minimal'},body:{kind:'up'}}
      );
    }
    return sbFetch('proposal_votes?on_conflict=proposal_id,member_name',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:{proposal_id:String(proposalId),member_name:name,kind:'up'}
    });
  }).catch(function(){
    // Son çare: toggle yalnızca oy yoksa ekler; varsa up ise tekrar basma
    return sbFetch(q).then(function(rows){
      if(rows&&rows.length)return;
      return sbRpc('toggle_vote',{p_proposal_id:String(proposalId),p_name:name,p_kind:'up'});
    }).catch(function(){});
  });
}
function mutate(action,payload){
  document.getElementById('busy').style.display='block';
  var p=Promise.resolve();
  var addMeta=null;
  if(action==='addProposal'){
    var row=proposalToRow(payload);
    var pj={
      id:row.id,date:row.date,by:row.by_name,also:row.also,createdAt:row.created_at,
      match:row.match,league:row.league,ko:row.ko,cls:row.cls,
      market:row.market,pick:row.pick,odd:row.odd,
      eventId:row.event_id,mktI:row.mkt_i,no:row.no,
      comment:row.comment||''
    };
    p=sbRpc('add_proposal',{p:pj}).then(function(res){
      addMeta=res;
      var id=res&&res.id;
      return ensureProposerUpvote(id, pj.by).then(function(){return sbBootstrap();});
    });
  }else if(action==='delProposal'){
    p=sbFetch('proposals?id=eq.'+encodeURIComponent(payload.id),{method:'DELETE',headers:{Prefer:'return=minimal'}})
      .then(function(){return sbBootstrap();});
  }else if(action==='setProposalComment'){
    p=sbFetch('proposals?id=eq.'+encodeURIComponent(payload.id),{
      method:'PATCH',headers:{Prefer:'return=minimal'},
      body:{comment:String(payload.comment||'').trim()}
    }).then(function(){return sbBootstrap();});
  }else if(action==='saveCoupon'||action==='updateCoupon'){
    p=sbFetch('coupons?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:couponToRow(payload)})
      .then(function(){return sbBootstrap();});
  }else if(action==='delCoupon'){
    p=sbFetch('coupons?id=eq.'+encodeURIComponent(payload.id),{method:'DELETE',headers:{Prefer:'return=minimal'}})
      .then(function(){return sbBootstrap();});
  }else if(action==='addAdj'){
    p=sbFetch('adjustments?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{
      id:String(payload.id),date:payload.date,amount:Number(payload.amount)||0,note:payload.note||'',by_name:payload.by||null
    }}).then(function(){return sbBootstrap();});
  }else if(action==='delAdj'){
    p=sbFetch('adjustments?id=eq.'+encodeURIComponent(payload.id),{method:'DELETE',headers:{Prefer:'return=minimal'}})
      .then(function(){return sbBootstrap();});
  }else if(action==='saveSettings'){
    p=sbFetch('settings?id=eq.1',{method:'PATCH',headers:{Prefer:'return=minimal'},body:{start_balance:Number(payload.start)||0,updated_at:new Date().toISOString()}})
      .then(function(){return sbBootstrap();});
  }else{
    p=Promise.reject(new Error('Bilinmeyen action: '+action));
  }
  return p.then(function(delta){
    document.getElementById('busy').style.display='none';
    if(delta){S=delta;renderAll();if(addMeta)delta._addMeta=addMeta;}
    return delta;
  }).catch(function(e){
    document.getElementById('busy').style.display='none';
    toast('Hata: '+(e.message||e));
    throw e;
  });
}
