"use strict";
/* ============ MAÇ PROGRAMI ============ */
var EV=[],COMPS={},dayFilter='today',leagueFilter=null,searchQ='';
var WC_CI=202607;
/* Öneri Yap — sadece bu ligler (sıra önemli) */
var LEAGUE_ALLOW=[
  {label:'Türkiye Süper Ligi', test:function(n){return /türkiye.*süper\s*lig|trendyol\s*süper/i.test(n)&&!/1\.\s*lig|kupa|kadın|women|bayan|u1[89]|u2[01]/i.test(n);}},
  {label:'Premier Lig', test:function(n){return /(ingiltere|İngiltere|england).*(premier\s*lig|premier\s*league)/i.test(n)&&!/şili|rusya|irlanda|çek|czech|lebanon|çin|iskoç|scotland|chile|russia|slovak|sloven|2|u21|u23|u18|reserve|youth|kadın|women|bayan|kupa|cup|championship|league\s*one|league\s*two|efl|mısır|egypt|suudi|saudi|hindistan|india|fas|morocco/i.test(n);}},
  {label:'Fransa', test:function(n){return /fransa.*(ligue\s*1|1\.\s*lig|kupa|şampiyonlar|süper|troph)|(france|fransa).*(cup|super\s*cup)|ligue\s*1/i.test(n)&&!/ligue\s*2|kadın|women|frauen|bayan/i.test(n);}},
  {label:'Bundesliga', test:function(n){return /(almanya|germany|deutschland).*(bundesliga|1\.\s*lig)|^bundesliga$/i.test(n)&&!/avusturya|österreich|osterreich|austria|2\.|3\.|kadın|women|frauen|bayan|amatör|amateur/i.test(n);}},
  {label:'Serie A', test:function(n){return /(italya|İtalya).*serie\s*a|(^|\s)serie\s*a(\s|$)/i.test(n)&&!/brezilya|serie\s*b|kadın|women|frauen|bayan/i.test(n);}},
  {label:'La Liga', test:function(n){return /(ispanya|İspanya).*la\s*liga|(^|\s)la\s*liga(\s|$)|laliga/i.test(n)&&!/2|smartbank|hypermotion|kadın|women|frauen|bayan/i.test(n);}},
  {label:'Hollanda', test:function(n){return /hollanda.*eredivisie|(^|\s)eredivisie(\s|$)/i.test(n)&&!/kadın|women|frauen|bayan|2\.\s*lig|eerste|jong/i.test(n);}},
  {label:'Portekiz', test:function(n){return /portekiz\s*premier\s*lig|portekiz.*primeira|(portekiz|portugal).*1\.\s*lig/i.test(n)&&!/kadın|women|frauen|bayan|2\.\s*lig|segunda/i.test(n);}},
  {label:'Belçika', test:function(n){return /belçika.*pro\s*lig|jupiler/i.test(n)&&!/kadın|women|frauen|bayan|2\.\s*lig/i.test(n);}},
  {label:'Danimarka', test:function(n){return /(danimarka|denmark).*(süper\s*lig|superliga|super\s*lig|1\.\s*lig)|^superliga$/i.test(n)&&!/2\.\s*lig|kadın|women|frauen|bayan|kupa|cup|u1[89]|u2[01]/i.test(n);}},
  {label:'UCL', test:function(n){return /uefa.*şampiyonlar|uefa.*champions/i.test(n)&&!/kadın|genç|youth|women|frauen|bayan|afc|asya|asian/i.test(n);}},
  {label:'Avrupa Ligi', test:function(n){return /uefa.*avrupa|uefa.*europa/i.test(n)&&!/konferans|conference|kadın|women|frauen|bayan/i.test(n);}},
  {label:'Konferans Ligi', test:function(n){return /uefa.*konferans|uefa.*conference/i.test(n)&&!/kadın|women|frauen|bayan/i.test(n);}}
];
var LEAGUE_ID_HINTS={
  126:'UCL',23986:'Konferans Ligi',588:'Avrupa Ligi',71522:'UCL',76759:'Konferans Ligi',
  584:'Türkiye Süper Ligi',322:'Hollanda',566:'Portekiz',148:'Belçika',
  381:'Fransa',586:'Fransa',60447:'Fransa',45:'Bundesliga',347:'Bundesliga'
};
var DAILY_COMP_IDS={71522:1,76759:1};
function registerDailyComps(compsMap){
  for(var id in compsMap){
    var ci=Number(id), n=String(compsMap[id]||'');
    if(!ci||!/günlük\s*bahis/i.test(n))continue;
    DAILY_COMP_IDS[ci]=1;
    if(/şamp|champ/i.test(n)&&!LEAGUE_ID_HINTS[ci])LEAGUE_ID_HINTS[ci]='UCL';
    else if(/konferans|conference/i.test(n)&&!LEAGUE_ID_HINTS[ci])LEAGUE_ID_HINTS[ci]='Konferans Ligi';
    else if(/avrupa|europa/i.test(n)&&!/konferans|conference/i.test(n)&&!LEAGUE_ID_HINTS[ci])LEAGUE_ID_HINTS[ci]='Avrupa Ligi';
  }
}
function isDailyComp(ci){return !!DAILY_COMP_IDS[ci];}
function dailyEventName(e){
  return e.n||e.hn||((e.hn||'')+(e.an?(' – '+e.an):''))||'Günlük bahis';
}
function leagueNameOf(ci){
  if(ci===WC_CI)return 'Dünya Kupası';
  return COMPS[ci]||LEAGUE_ID_HINTS[ci]||('Lig '+ci);
}
function getLeagueAllow(label){
  for(var i=0;i<LEAGUE_ALLOW.length;i++){if(LEAGUE_ALLOW[i].label===label)return LEAGUE_ALLOW[i];}
  return null;
}
function matchAllowedLeague(ci, eventName){
  if(eventName&&/\(k\)|kadın|women|frauen|bayan|u1[89]|u2[01]|u23/i.test(eventName)) return null;
  if(ci===586||ci===60447||ci===381) return getLeagueAllow('Fransa');
  if(ci===45||ci===347) return getLeagueAllow('Bundesliga');
  if(eventName&&/(paris\s*saint|psg|rc\s*lens)/i.test(eventName)) return getLeagueAllow('Fransa');
  if(isDailyComp(ci)){
    var hint=LEAGUE_ID_HINTS[ci]||'Günlük Bahis';
    var found=getLeagueAllow(hint);
    return found||{label:hint,test:function(){return true;}};
  }
  if(LEAGUE_ID_HINTS[ci]){
    var hint=LEAGUE_ID_HINTS[ci];
    var found=getLeagueAllow(hint);
    if(found)return found;
  }
  var n=leagueNameOf(ci);
  for(var j=0;j<LEAGUE_ALLOW.length;j++){
    if(LEAGUE_ALLOW[j].test(n))return LEAGUE_ALLOW[j];
  }
  return null;
}
function isAllowedLeague(ci, eventName){return !!matchAllowedLeague(ci, eventName);}
function allowedLeagueLabel(ci, eventName){
  var m=matchAllowedLeague(ci, eventName);
  return m?m.label:leagueNameOf(ci);
}
function allowedLeagueOrder(ci, eventName){
  var m=matchAllowedLeague(ci, eventName);
  if(!m)return 999;
  for(var i=0;i<LEAGUE_ALLOW.length;i++){if(LEAGUE_ALLOW[i]===m||LEAGUE_ALLOW[i].label===m.label)return i;}
  return 999;
}
var MKT_NAMES={4:'Maç Sonucu',14:'Alt/Üst',131:'Karş. Gol Var/Yok',129:'Çifte Şans',136:'Tek/Çift',12:'Handikaplı MS',100:'Handikaplı MS',63:'İY Alt/Üst',47:'İlk Yarı Sonucu',625:'İY Çifte Şans'};
function formatSov(sov){
  if(sov==null||sov==='')return '';
  var s=String(sov).trim();
  if(/^\d+\s*:\s*\d+$/.test(s))return s.replace(/\s/g,'');
  if(/^\d+[\.,]\d+$/.test(s))return s.replace(',', '.');
  var n=parseFloat(s.replace(',','.'));
  if(isNaN(n))return s;
  if(n<0)return '0:'+String(Math.abs(n)).replace(/\.0$/,'');
  if(n>0)return String(n).replace(/\.0$/,'')+':0';
  if(n===0)return '0:0';
  return s;
}
function formatMarketLabel(n,sov){
  if(!n)return '';
  var h=formatSov(sov);
  n=String(n).replace(/\{h\}/gi,h?'('+h+')':'').replace(/\{0\}/g,h?'('+h+')':'').replace(/\{\d+\}/g,'');
  return n.replace(/\(\s*\)/g,h?'('+h+')':'').replace(/\s{2,}/g,' ').trim();
}
function formatPickName(n,sov){
  if(!n)return '';
  var h=formatSov(sov);
  n=String(n).replace(/\{h\}/gi,h).replace(/\{0\}/g,h).replace(/\{\d+\}/g,'');
  return n.replace(/\(\s*\)/g,h?'('+h+')':'').replace(/\s{2,}/g,' ').trim();
}
function mktLabel(m){
  if(m.nm)return formatMarketLabel(m.nm,m.sov);
  var n=MKT_NAMES[m.st]||('Market #'+m.st);
  var h=formatSov(m.sov);
  return h?n+' ('+h+')':n;
}
function evDate(e){return dstr(new Date(e.d*1000));}

