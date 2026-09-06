"use strict";
/* ============ İDDAA — doğrudan telefondan (Apps Script proxy'si atlanır) ============ */
var IDDAA='https://sportsbookv2.iddaa.com/sportsbook';
function iddaaFetch(path){
  return fetch(IDDAA+path,{credentials:'omit'}).then(function(r){
    if(!r.ok)throw new Error('iddaa '+r.status);
    return r.json();
  });
}
function getMktCfg(){
  try{
    var c=JSON.parse(localStorage.getItem('kk-mcfg')||'null');
    if(c&&c.t&&Date.now()-c.t<21600000)return Promise.resolve(c.d);
  }catch(e){}
  return iddaaFetch('/get_market_config').then(function(j){
    var out={},m=(j.data&&j.data.m)||{};
    for(var k in m){if(m[k]&&m[k].n)out[k]=m[k].n;}
    try{localStorage.setItem('kk-mcfg',JSON.stringify({t:Date.now(),d:out}));}catch(e){}
    return out;
  });
}
function resolveMktName(cfg,t,st,sov){
  var n=cfg[t+'_'+st]||cfg['1_'+st]||cfg['2_'+st]||cfg['4_'+st];
  if(!n)return null;
  return formatMarketLabel(n,sov);
}
function buildBulletinClient(forceFresh){
  var comps={};
  try{
    var cc=JSON.parse(localStorage.getItem('kk-comps-v4')||'null');
    if(cc&&cc.t&&Date.now()-cc.t<21600000)comps=cc.d;
  }catch(e){}
  if(comps&&Object.keys(comps).length)COMPS=comps;

  if(!forceFresh){
    try{
      var hit=JSON.parse(localStorage.getItem('kk-ev-v4')||'null');
      // Boş sonucu cache'ten kullanma — tek cihazda "0 maç" kilitlenmesin
      if(hit&&hit.t&&Date.now()-hit.t<2700000&&(hit.events||[]).length){
        if(hit.comps)COMPS=hit.comps;
        /* Cache'de izin verilmeyen lig varsa yeniden çek */
        var hasStale=(hit.events||[]).some(function(e){return !isDailyComp(e.ci)&&!isAllowedLeague(e.ci, (e.hn||'')+' '+(e.an||''));});
        if(!hasStale)return Promise.resolve(hit);
      }
    }catch(e){}
  }
  return Promise.all([
    Object.keys(comps).length?Promise.resolve(comps):iddaaFetch('/competitions').then(function(cj){
      (cj.data||[]).forEach(function(c){comps[c.i]=c.n||c.sn||'';});
      try{localStorage.setItem('kk-comps-v4',JSON.stringify({t:Date.now(),d:comps}));}catch(e){}
      return comps;
    }).catch(function(){return {};}),
    iddaaFetch('/played-event-percentage?sportType=1').then(function(pj){return pj.data||{};}).catch(function(){return {};}),
    getMktCfg().catch(function(){return {};})
  ]).then(function(res){
    comps=res[0];COMPS=comps;registerDailyComps(comps);var pp=res[1],cfg=res[2],map={};
    return Promise.all(['0','1'].map(function(tp){
      return iddaaFetch('/events?st=1&type='+tp+'&version=0').then(function(j){
        ((j.data&&j.data.events)||[]).forEach(function(e){
          if(e.sid!==1)return;
          if(!isDailyComp(e.ci)&&!isAllowedLeague(e.ci, (e.hn||'')+' '+(e.an||'')))return; /* sadece izin verilen ligler */
          var ms=null,mm=null,list=e.m||[];
          for(var q=0;q<list.length;q++){
            var nm=resolveMktName(cfg,list[q].t,list[q].st,'');
            if(nm==='Maç Sonucu'&&(list[q].o||[]).length===3){mm=list[q];break;}
          }
          if(!mm)mm=list.filter(function(x){
            var o=x.o||[];
            if(o.length!==3||x.sov)return false;
            return (x.st===1||x.st===4||(o[0].n==='1'&&o[1].n==='0'&&o[2].n==='2'));
          })[0];
          if(mm)ms={i:mm.i,o:mm.o.map(function(o){return{no:o.no,odd:o.odd,n:o.n};})};
          var rec={i:e.i,hn:e.hn,an:e.an,ci:e.ci,d:e.d,ms:ms,hasM:(e.m||[]).length>0,
            pp:(pp[e.i]!=null?pp[e.i]:(pp[e.bri]!=null?pp[e.bri]:null))};
          var mKey=(e.bri&&e.bri>0)?('bri_'+e.bri):((e.hn&&e.an)?('teams_'+(e.hn||'').trim().toLowerCase()+'__'+(e.an||'').trim().toLowerCase()+'__'+Math.floor((e.d||0)/3600)):('id_'+e.i));
          var cur=map[mKey];
          if(!cur){map[mKey]=rec;return;}
          if(!cur.ms&&ms){map[mKey]=rec;return;}
          if(!cur.hasM&&rec.hasM){map[mKey]=rec;return;}
          if(cur.ms&&!ms)return;
          if(cur.hasM&&!rec.hasM)return;
          if(cur.pp==null&&rec.pp!=null)cur.pp=rec.pp;
          map[mKey]=rec;
        });
      }).catch(function(){});
    })).then(function(){
      var allEvs=Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.d-b.d;});
      var daily=[], evs=[];
      allEvs.forEach(function(e){
        if(isDailyComp(e.ci)){
          daily.push({i:e.i,n:dailyEventName(e),ci:e.ci,d:e.d,hasM:!!e.hasM});
        }else evs.push(e);
      });
      return iddaaFetch('/events?st=1&type=2&version=0').then(function(j2){
        var specials=[];
        ((j2.data&&j2.data.events)||[]).forEach(function(e){
          if(e.sid!==1)return;
          if(!isDailyComp(e.ci)&&!isAllowedLeague(e.ci, e.n||((e.hn||'')+' '+(e.an||''))))return; /* sadece izin verilen ligler */
          specials.push({i:e.i,n:e.n||((e.hn||'')+' - '+(e.an||'')),ci:e.ci,d:e.d,hasM:(e.m||[]).length>0});
        });
        var payload={t:Date.now(),events:evs,comps:comps,specials:specials,daily:daily};
        if(evs.length){try{localStorage.setItem('kk-ev-v4',JSON.stringify(payload));}catch(e){}}
        else{try{localStorage.removeItem('kk-ev-v4');}catch(e){}}
        return payload;
      }).catch(function(){
        var payload={t:Date.now(),events:evs,comps:comps,specials:[],daily:daily};
        if(evs.length){try{localStorage.setItem('kk-ev-v4',JSON.stringify(payload));}catch(e){}}
        else{try{localStorage.removeItem('kk-ev-v4');}catch(e){}}
        return payload;
      });
    });
  });
}
function fetchEventDetailClient(evId,forceFresh){
  var key='kk-evd'+evId;
  if(!forceFresh){
    try{
      var hit=JSON.parse(localStorage.getItem(key)||'null');
      if(hit&&hit.t&&Date.now()-hit.t<180000)return Promise.resolve(hit.d);
    }catch(e){}
  }
  return Promise.all([getMktCfg().catch(function(){return {};}),iddaaFetch('/event/'+Number(evId))]).then(function(res){
    var cfg=res[0],e=res[1].data||{};
    var out={i:e.i,hn:e.hn,an:e.an,n:e.n||'',d:e.d,ci:e.ci,
      m:(e.m||[]).map(function(m){
        return{i:m.i,st:m.st,sov:m.sov||'',nm:resolveMktName(cfg,m.t,m.st,m.sov),
          o:(m.o||[]).map(function(o){return{no:o.no,odd:o.odd,n:formatPickName(o.n,m.sov)};})};
      })};
    try{localStorage.setItem(key,JSON.stringify({t:Date.now(),d:out}));}catch(e){}
    return out;
  });
}
function fetchLiveScoresClient(ids){
  ids=(ids||[]).slice(0,20);
  if(!ids.length)return Promise.resolve({});
  return Promise.all(ids.map(function(id){
    return iddaaFetch('/event/'+Number(id)).then(function(j){
      var d=j.data,sc=d&&d.sc;if(!sc)return null;
      var ht=sc.ht||{},at=sc.at||{};
      return{id:id,v:{
        h:Number(ht.r)||0,a:Number(at.r)||0,
        hh:ht.ht!=null?Number(ht.ht):null,ah:at.ht!=null?Number(at.ht):null,
        he:Number(ht.et)||0,ae:Number(at.et)||0,
        min:sc.min||0,ps:Number(sc.s)||0,
        hc:Number(ht.co)||0,ac:Number(at.co)||0,
        hco:Number(ht.hco)||0,aco:Number(at.hco)||0,
        hy:Number(ht.yc)||0,ay:Number(at.yc)||0,
        hr:Number(ht.rc)||0,ar:Number(at.rc)||0
      }};
    }).catch(function(){return null;});
  })).then(function(rows){
    var out={};rows.forEach(function(r){if(r)out[r.id]=r.v;});return out;
  });
}

