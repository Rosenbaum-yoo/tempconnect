/**
 * vendorPool.js — Page-spezifische Logik fuer vendor_pool.html
 *
 * Stand April 2026:
 * Vollständige Page-Logik wurde aus vendor_pool.html ausgelagert.
 *
 * Datenquellen:
 *   GET /api/vendor-pool?client_org_id=&tier=
 *   GET /api/vendor-pool/stats?client_org_id=
 *   GET /api/vendor-pool/supplier-lookup?q=
 *   PATCH /api/vendor-pool/:id/tier
 *   PATCH /api/vendor-pool/:id/status
 *   POST /api/vendor-pool
 *
 * Beziehungen zu anderen Seiten:
 *   -> supplier_scorecard.html?agencyId=&agencyName= (Deep-Link pro Supplier)
 *   -> rate-cards.html (Konditionsbasis)
 *   -> requisitions.html (offene Angebote)
 *   -> spend-analytics.html (Ausgaben je Vendor)
 *   <- executive_dashboard.html (Hub-Einstieg)
 */

'use strict';
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function pct(v){return v==null||v===''?'–':Number(v).toFixed(1)+'%';}
function fmtDate(v){if(!v)return '–';try{return new Date(v).toLocaleDateString('de-DE');}catch(e){return v;}}
function renderPageState(id,tone,title,text){
  var el=document.getElementById(id);
  if(!el)return;
  if(!title&&!text){
    el.className='page-state';
    el.innerHTML='';
    el.style.display='none';
    return;
  }
  el.className='page-state page-state--'+(tone||'info');
  el.innerHTML='<div class="page-state__title">'+esc(title||'')+'</div><div class="page-state__text">'+esc(text||'')+'</div>';
  el.style.display='';
}
function applyVendorPoolDomLocks(root){
  if(window.TC&&window.TC.entitlements&&typeof window.TC.entitlements.applyDomLocks==='function'){
    window.TC.entitlements.applyDomLocks(root||document).catch(function(){});
  }
}
function showPoolState(tone,title,text){renderPageState('poolState',tone,title,text);}
function clearPoolState(){renderPageState('poolState');}
function sectionNote(text){return '<div class="section-note">'+esc(text)+'</div>';}
function setPoolEmptyState(title,text){
  document.getElementById('poolEmptyTitle').textContent=title;
  document.getElementById('poolEmptyText').textContent=text;
  document.getElementById('emptyMsg').style.display='';
}
function hidePoolEmptyState(){document.getElementById('emptyMsg').style.display='none';}
function parseApiError(result,fallback){
  if(!result)return fallback;
  if(typeof result.error==='string'&&result.error)return result.error;
  if(Array.isArray(result.details)&&result.details.length)return result.details.join(', ');
  if(typeof result.details==='string'&&result.details)return result.details;
  return fallback;
}
function readStoredPoolFilters(){
  try{
    var raw=sessionStorage.getItem(POOL_FILTER_STORAGE_KEY);
    if(!raw)return {};
    var parsed=JSON.parse(raw);
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch(e){return {};}
}
function writeStoredPoolFilters(filters){
  try{sessionStorage.setItem(POOL_FILTER_STORAGE_KEY,JSON.stringify(filters||{}));}
  catch(e){/* Session-Storage kann lokal blockiert sein. */}
}
function resolvePoolDefaults(){
  var hasDrilldown=!!(poolView.statusGroup||poolView.activityScope);
  var stored=(!hasDrilldown&&!poolView.tier)?readStoredPoolFilters():{};
  return { tier:poolView.tier||stored.tier||'', hasDrilldown:hasDrilldown };
}
function applyPoolFilterDefaults(){
  var defaults=resolvePoolDefaults();
  var tierEl=document.getElementById('fTier');
  if(tierEl)tierEl.value=defaults.tier||'';
  return defaults;
}
var poolQuery=new URLSearchParams(window.location.search||'');
var poolView={
  statusGroup:poolQuery.get('status_group')||'',
  tier:poolQuery.get('tier')||'',
  activityScope:poolQuery.get('activity_scope')||''
};
var POOL_FILTER_STORAGE_KEY='tc.vendorPool.filters.v1';
var currentMe=null;
var vendorPoolAccess={ allowed:false, canRead:false, canWrite:false, mode:'hidden', reason:'' };
var spendAnalyticsAccess={ allowed:false, canRead:false, canWrite:false, mode:'hidden', reason:'' };
var rateCardAccess={ canRead:false, reason:'' };
var RATE_CARD_READ_ROLES={
  platform_admin:true,
  owner:true,
  admin:true,
  program_manager:true,
  hiring_manager:true,
  supplier_manager:true,
  finance:true,
  viewer:true
};
if(!poolView.activityScope&&poolView.statusGroup==='activity_30d')poolView.activityScope='buyer_activity_30d';
if(!poolView.statusGroup&&poolView.activityScope==='buyer_activity_30d')poolView.statusGroup='activity_30d';
function normalizePlan(plan){
  var p=String(plan||'DEMO').toUpperCase();
  if(p==='FREE')return 'DEMO';
  if(p==='ENTERPRISE'||p==='INDIVIDUAL')return 'INDIVIDUELL';
  return p;
}
function resolveSurfaceAccess(me,key){
  if(window.TC&&window.TC.surfaceAccess&&typeof window.TC.surfaceAccess.resolve==='function'){
    return window.TC.surfaceAccess.resolve(me,key)||{ allowed:false, canRead:false, canWrite:false, mode:'hidden', reason:'' };
  }
  if(key==='rate_cards'){
    return resolveRateCardAccess(me);
  }
  return { allowed:false, canRead:false, canWrite:false, mode:'hidden', reason:'' };
}
function resolveRateCardAccess(me){
  var roleType=String(me&&me.role||'').toLowerCase();
  var plan=normalizePlan(me&&me.plan);
  var orgRole=String(me&&me.org_role||'').trim();
  if(!me)return { canRead:false, reason:'Preisrahmen sind derzeit nicht verifizierbar.' };
  if(plan!=='PRO'&&plan!=='INDIVIDUELL')return { canRead:false, reason:'Preisrahmen bleiben fuer berechtigte PRO-/Individuell-Zugaenge reserviert.' };
  if(roleType==='agency')return { canRead:false, reason:'Preisrahmen bleiben in dieser Lieferantensteuerung buyer-seitig fuer Unternehmensorganisationen reserviert.' };
  if(!RATE_CARD_READ_ROLES[orgRole])return { canRead:false, reason:'Preisrahmen sind nur fuer leseberechtigte Procurement-/Steuerungsrollen sichtbar.' };
  return { canRead:true, reason:'' };
}
function applyRateCardLinkVisibility(){
  var link=document.getElementById('vendorPoolRateCardLink');
  if(!link)return;
  link.style.display=rateCardAccess.canRead?'':'none';
}
function applySpendLinkVisibility(){
  var link=document.getElementById('vendorPoolSpendLink');
  if(!link)return;
  link.style.display=spendAnalyticsAccess.canRead?'':'none';
}
function describeVendorPoolAccessState(access){
  if(!access||access.canRead)return '';
  if(access.mode==='read_only')return 'Der Vendor Pool ist fuer diese Rolle derzeit nur eingeschraenkt freigegeben.';
  if(access.reason)return access.reason;
  return 'Der Vendor Pool ist fuer diese Rolle nicht freigeschaltet.';
}
function syncVendorPoolReadState(){
  var addButton=document.getElementById('vendorPoolAddButton');
  if(addButton){
    addButton.style.display=vendorPoolAccess.canWrite?'':'none';
    addButton.disabled=!vendorPoolAccess.canWrite;
  }
  var addForm=document.getElementById('addForm');
  if(addForm){
    Array.prototype.forEach.call(addForm.querySelectorAll('input,select,textarea,button'),function(el){
      if(el.id==='addCloseBtn')return;
      el.disabled=!vendorPoolAccess.canWrite;
    });
  }
}
function applyVendorPoolAccessState(){
  syncVendorPoolReadState();
  applyRateCardLinkVisibility();
  applySpendLinkVisibility();
  applyVendorPoolDomLocks(document);
}
function ensureVendorPoolWrite(actionLabel){
  if(vendorPoolAccess.canWrite)return true;
  showPoolState('info','Vendor Pool ist schreibgeschuetzt',(actionLabel||'Diese Aktion')+' ist fuer diese Rolle nicht freigegeben.');
  return false;
}
function isActivity30dDrilldown(){return poolView.activityScope==='buyer_activity_30d';}
function renderPoolContext(title,text){
  var el=document.getElementById('poolContext');
  if(!el)return;
  if(!title&&!text){
    el.innerHTML='';
    el.style.display='none';
    return;
  }
  var html='';
  if(title)html+='<strong>'+esc(title)+'</strong>';
  if(text)html+='<div class="table-meta" style="margin-top:6px">'+esc(text)+'</div>';
  el.innerHTML=html;
  el.style.display='';
}
function buildTierStats(items){
  var stats={PREFERRED:0,SECONDARY:0,TRIAL:0,RESTRICTED:0,BLOCKED:0,total:(items||[]).length};
  (items||[]).forEach(function(item){
    if(item&&stats[item.tier]!=null)stats[item.tier]+=1;
  });
  return stats;
}
function renderTierStats(stats,totalLabel){
  document.getElementById('statsRow').innerHTML=
    ['PREFERRED','SECONDARY','TRIAL','RESTRICTED','BLOCKED'].map(function(t){
      return '<div class="stat-tile"><b>'+(stats[t]||0)+'</b><span class="tier-badge tb-'+t+'">'+t+'</span></div>';
    }).join('')+'<div class="stat-tile"><b>'+(stats.total||0)+'</b><span>'+esc(totalLabel||'Gesamt')+'</span></div>';
}
function averageMetric(items,key){
  var values=(items||[]).map(function(item){return Number(item&&item[key]);}).filter(function(value){return Number.isFinite(value);});
  if(!values.length)return null;
  return values.reduce(function(sum,value){return sum+value;},0)/values.length;
}
var csrfToken='';
function getLocHeader(){
  try{return(window.TC&&TC.api&&typeof TC.api.getActiveLocationId==='function')?TC.api.getActiveLocationId():null;}catch(_e){return null;}
}
function getLocLabel(){
  try{return sessionStorage.getItem('tc.activeLocationName')||null;}catch(_e){return null;}
}
async function apiGet(p){
  try{
    var headers={};
    var locId=getLocHeader();
    if(locId)headers['X-Location-Id']=locId;
    var r=await fetch('/api'+p,{credentials:'include',headers:headers});
    if(r.status===401){location.href='/';return null;}
    if(!r.ok)return null;
    return await r.json();
  }catch(e){return null;}
}
async function apiMut(method,p,b){
  try{
    var r=await fetch('/api'+p,{method:method,credentials:'include',headers:{'Content-Type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(b)});
    if(r.status===401){location.href='/';return null;}
    var text=await r.text();
    var data={};
    if(text){try{data=JSON.parse(text);}catch(err){data={};}}
    if(r.ok)return data;
    if(!data.error)data.error='HTTP '+r.status;
    return data;
  }catch(e){return { error:'Netzwerkfehler oder Server nicht erreichbar.' };}
}

async function init(){
  showPoolState('info','Lieferantenpool wird geladen','Organisationskontext und Management-KPIs werden vorbereitet.');
  currentMe=await apiGet('/me');
  vendorPoolAccess=resolveSurfaceAccess(currentMe,'vendor_pool');
  spendAnalyticsAccess=resolveSurfaceAccess(currentMe,'spend_analytics');
  rateCardAccess=resolveSurfaceAccess(currentMe,'rate_cards');
  applyVendorPoolAccessState();
  if(!vendorPoolAccess.canWrite){
    if(!vendorPoolAccess.canRead){
      showPoolState('info','Vendor Pool ausgeblendet',describeVendorPoolAccessState(vendorPoolAccess));
    }
    return;
  }
  try{
    var csrf=await fetch('/api/csrf',{credentials:'include'});
    if(csrf.ok){var d=await csrf.json();csrfToken=d.token||d.csrfToken||'';}
  }catch(e){
    showPoolState('warn','Initialisierung teilweise eingeschränkt','Das Sicherheitstoken konnte nicht geladen werden. Der Lieferantenpool bleibt lesbar, schreibende Aktionen koennen voruebergehend fehlschlagen.');
  }
}
function buildScoreUrl(v){
  return '/public/supplier_scorecard.html?agencyId='+encodeURIComponent(v.supplier_org_id||'')+'&agencyName='+encodeURIComponent(v.supplier_org_name||v.supplier_org_id||'');
}
function buildRateCardUrl(v){
  if(!rateCardAccess.canRead)return '';
  return '/public/rate-cards.html?supplier_org_id='+encodeURIComponent(v.supplier_org_id||'')+'&supplier_name='+encodeURIComponent(v.supplier_org_name||v.supplier_org_id||'');
}
function buildSpendUrl(v){
  if(!spendAnalyticsAccess.canRead)return '';
  return '/public/spend-analytics.html?vendor_id='+encodeURIComponent(v.supplier_org_id||'')+'&supplier='+encodeURIComponent(v.supplier_org_name||v.supplier_org_id||'');
}

function renderManagement(dashboard){
  var row=document.getElementById('managementRow');
  var topBox=document.getElementById('topPerformersBox');
  var changesBox=document.getElementById('recentChangesBox');
  var topTitle=document.getElementById('topPerformersTitle');
  var changesTitle=document.getElementById('recentChangesTitle');
  if(topTitle)topTitle.textContent='Top-Lieferanten im Pool';
  if(changesTitle)changesTitle.textContent='Letzte Änderungen';
  if(!dashboard){
    row.innerHTML='';
    topBox.textContent='Management-KPIs derzeit nicht verfügbar.';
    changesBox.textContent='Änderungsverlauf derzeit nicht verfügbar.';
    return;
  }
  var kpi=dashboard.kpis||{};
  var status=dashboard.status_composition||{};
  row.innerHTML=[
    {label:'Ø Reputation',val:kpi.avg_reputation!=null?kpi.avg_reputation:'–',color:'var(--brand)'},
    {label:'Ø Sterne',val:kpi.avg_stars!=null?kpi.avg_stars:'–',color:'var(--text)'},
    {label:'Ø Deal Success',val:kpi.avg_deal_success!=null?kpi.avg_deal_success+'%':'–',color:'var(--good)'},
    {label:'Top Grades',val:kpi.top_grade_count||0,color:'#7c5cff'},
    {label:'Aktiv',val:status.active||0,color:'var(--good)'},
    {label:'Suspendiert',val:status.suspended||0,color:'var(--warn)'}
  ].map(function(t){
    return '<div class="management-tile"><b style="color:'+t.color+'">'+esc(String(t.val))+'</b><span>'+esc(t.label)+'</span></div>';
  }).join('');

  var topItems=dashboard.top_performers||[];
  topBox.innerHTML=topItems.length?'<div class="insight-list">'+topItems.map(function(item){
    return '<div class="insight-item">'
      + '<div><strong>'+esc(item.supplier_name||'Supplier')+'</strong><div class="table-meta">'+esc(item.tier||'–')+' · '+esc(item.grade||'keine Grade')+'</div></div>'
      + '<div style="text-align:right"><strong>'+(item.reputation_score!=null?esc(String(item.reputation_score)):'–')+'</strong><div class="table-meta">'+(item.avg_stars!=null?esc(String(item.avg_stars))+' ★':'keine Sterne')+'</div></div>'
      + '</div>';
  }).join('')+'</div>':'<div class="empty-mini">Noch keine Performancedaten im Pool.</div>';

  var changes=dashboard.recent_changes||[];
  changesBox.innerHTML=changes.length?'<div class="insight-list">'+changes.map(function(item){
    return '<div class="insight-item">'
      + '<div><strong>'+esc(item.supplier_name||'Supplier')+'</strong><div class="table-meta">'+esc(item.field_changed||'Änderung')+': '+esc(item.old_value||'–')+' → '+esc(item.new_value||'–')+'</div></div>'
      + '<div style="text-align:right"><strong>'+fmtDate(item.created_at)+'</strong><div class="table-meta">'+esc(item.changed_by_name||'System')+'</div></div>'
      + '</div>';
  }).join('')+'</div>':'<div class="empty-mini">Noch keine dokumentierten Änderungen.</div>';
}
function renderActivityDrilldownManagement(items,tier){
  var row=document.getElementById('managementRow');
  var topBox=document.getElementById('topPerformersBox');
  var changesBox=document.getElementById('recentChangesBox');
  var topTitle=document.getElementById('topPerformersTitle');
  var changesTitle=document.getElementById('recentChangesTitle');
  var avgReputation=averageMetric(items,'reputation_score');
  var avgFillRate=averageMetric(items,'fill_rate_pct');
  var preferredCount=(items||[]).filter(function(item){return item&&item.tier==='PREFERRED';}).length;
  if(topTitle)topTitle.textContent='Aktive Supplier im 30-Tage-Fenster';
  if(changesTitle)changesTitle.textContent='Drilldown-Semantik';
  row.innerHTML=[
    {label:'Aktive Vendoren 30T',val:(items||[]).length,color:'var(--brand)'},
    {label:'Preferred im Fenster',val:preferredCount,color:'var(--good)'},
    {label:'Ø Reputation',val:avgReputation!=null?avgReputation.toFixed(1):'–',color:'#7c5cff'},
    {label:'Ø Fill Rate',val:avgFillRate!=null?avgFillRate.toFixed(1)+'%':'–',color:'var(--text)'}
  ].map(function(t){
    return '<div class="management-tile"><b style="color:'+t.color+'">'+esc(String(t.val))+'</b><span>'+esc(t.label)+'</span></div>';
  }).join('');
  var topItems=(items||[]).slice().sort(function(a,b){
    return (Number(b&&b.reputation_score)||-1)-(Number(a&&a.reputation_score)||-1)
      || String((a&&a.supplier_org_name)||'').localeCompare(String((b&&b.supplier_org_name)||''),'de');
  }).slice(0,5);
  topBox.innerHTML=topItems.length?'<div class="insight-list">'+topItems.map(function(item){
    return '<div class="insight-item">'
      + '<div><strong>'+esc(item.supplier_org_name||'Supplier')+'</strong><div class="table-meta">'+esc(item.tier||'–')+' · Fill '+pct(item.fill_rate_pct)+'</div></div>'
      + '<div style="text-align:right"><strong>'+(item.reputation_score!=null?esc(String(item.reputation_score)):'–')+'</strong><div class="table-meta">Deal Success '+pct(item.deal_success_rate)+'</div></div>'
      + '</div>';
  }).join('')+'</div>':'<div class="empty-mini">Keine aktiven Pool-Vendoren im aktuellen 30-Tage-Fenster.</div>';
  var tierHint=tier?'Zusätzlicher Tier-Filter: '+tier+'.':'Kein zusätzlicher Tier-Filter aktiv.';
  changesBox.innerHTML='<div class="insight-list">'
    + '<div class="insight-item"><div><strong>Einbezogen</strong><div class="table-meta">Aktive Pool-Vendoren mit Kandidateneinreichung, Assignment-Aktivität oder freigegebenen Timesheets der letzten 30 Tage.</div></div></div>'
    + '<div class="insight-item"><div><strong>Zählweise</strong><div class="table-meta">Mehrfach gepflegte Pool-Einträge werden auf eine führende Supplier-Zuordnung verdichtet, damit die Liste der Executive-KPI entspricht.</div></div></div>'
    + '<div class="insight-item"><div><strong>Filter</strong><div class="table-meta">'+esc(tierHint)+'</div></div></div>'
    + '</div>';
}

async function loadPool(persist){
  var shouldPersist=persist!==false;
  var clientOrg=document.getElementById('fClientOrg').value.trim();
  var activityDrilldown=isActivity30dDrilldown();
  var allowPersist=shouldPersist&&!poolView.statusGroup&&!poolView.activityScope;
  syncVendorPoolReadState();
  if(!vendorPoolAccess.canRead){
    renderPoolContext('','');
    document.getElementById('statsRow').innerHTML=sectionNote('Der Vendor Pool ist fuer die aktuelle Rolle nicht freigegeben.');
    renderManagement(null);
    document.getElementById('poolBody').innerHTML='';
    setPoolEmptyState('Vendor Pool nicht verfuegbar',describeVendorPoolAccessState(vendorPoolAccess));
    showPoolState('info','Vendor Pool ausgeblendet',describeVendorPoolAccessState(vendorPoolAccess));
    return;
  }
  var poolLocId=getLocHeader();var poolLocLbl=getLocLabel();
  renderPoolContext(
    activityDrilldown?'Executive-Drilldown: Aktive Vendoren (30 Tage)':(poolLocId?'Standort: '+(poolLocLbl||poolLocId):''),
    activityDrilldown?'Die Liste zeigt aktive Pool-Vendoren mit echter buyer-seitiger Aktivität im aktuellen 30-Tage-Fenster und verdichtet Mehrfachzuordnungen pro Supplier.':(poolLocId?'Der Lieferantenpool zeigt alle Lieferanten der Organisation. Pool-Einträge können einem Standort zugeordnet sein – der aktive Standortfilter „'+(poolLocLbl||poolLocId)+'“ ist als Kontext sichtbar.':'')
  );
  if(!clientOrg){
    document.getElementById('statsRow').innerHTML=sectionNote('Ohne Client-Organisation kann der Lieferantenpool nicht geladen werden.');
    renderManagement(null);
    document.getElementById('poolBody').innerHTML='';
    setPoolEmptyState('Lieferantenpool nicht initialisiert','Dem aktuellen Nutzer ist noch keine Client-Organisation zugeordnet.');
    showPoolState('warn','Organisationskontext fehlt','Der Lieferantenpool benötigt eine Client-Organisation im Nutzerkontext.');
    return;
  }
  showPoolState(
    'info',
    activityDrilldown?'Aktive Vendoren werden geladen':'Lieferantenpool wird geladen',
    activityDrilldown?'Die 30-Tage-Drilldown-Liste und ihre Management-Zusammenfassung werden aktualisiert.':'Lieferantenbeziehungen, KPI-Karten und Steuerungsdaten werden aktualisiert.'
  );
  var tier=document.getElementById('fTier').value;
  if(allowPersist){writeStoredPoolFilters({tier:tier||''});}
  var qsParts=[];
  if(tier)qsParts.push('tier='+encodeURIComponent(tier));
  if(activityDrilldown)qsParts.push('activity_scope=buyer_activity_30d');
  qsParts.push('limit=100');
  var qs='?'+qsParts.join('&');
  var partialIssues=[];

  if(activityDrilldown){
    document.getElementById('statsRow').innerHTML=sectionNote('30-Tage-Drilldown wird vorbereitet…');
    document.getElementById('managementRow').innerHTML='';
    document.getElementById('topPerformersTitle').textContent='Aktive Supplier im 30-Tage-Fenster';
    document.getElementById('recentChangesTitle').textContent='Drilldown-Semantik';
    document.getElementById('topPerformersBox').textContent='Lade aktive Supplier…';
    document.getElementById('recentChangesBox').textContent='Lade Drilldown-Hinweise…';
  }else{
    var stats=await apiGet('/vendor-pool/stats?client_org_id='+encodeURIComponent(clientOrg));
    if(stats){
      renderTierStats(stats,'Gesamt');
    }else{
      partialIssues.push('Pool-KPIs');
      document.getElementById('statsRow').innerHTML=sectionNote('Pool-KPIs konnten derzeit nicht geladen werden.');
    }

    var dashboard=await apiGet('/suppliers/dashboard');
    if(!dashboard) partialIssues.push('Management-KPIs');
    renderManagement(dashboard);
  }

  var data=await apiGet('/suppliers/enriched'+qs);
  if(!data){
    document.getElementById('poolBody').innerHTML='';
    if(activityDrilldown){
      renderTierStats(buildTierStats([]),'Aktiv 30 Tage');
      renderActivityDrilldownManagement([],tier);
    }
    setPoolEmptyState('Lieferantenpool konnte nicht geladen werden','Die Lieferantenbeziehungen sind derzeit nicht verfügbar. Bitte später erneut versuchen.');
    showPoolState('bad','Liste derzeit nicht verfügbar','Die Lieferantenbeziehungen konnten nicht geladen werden.');
    return;
  }
  var items=data.items||[];
  var tbody=document.getElementById('poolBody');
  if(!items.length){
    tbody.innerHTML='';
    if(activityDrilldown){
      renderTierStats(buildTierStats([]),'Aktiv 30 Tage');
      renderActivityDrilldownManagement([],tier);
      setPoolEmptyState(
        tier ? 'Keine aktiven Vendoren für diesen Tier' : 'Keine aktiven Pool-Vendoren im 30-Tage-Fenster',
        tier ? 'Im aktuellen 30-Tage-Fenster gibt es für den gewählten Tier keine buyer-seitige Aktivität.' : 'Es gibt derzeit keine aktiven Pool-Vendoren mit Kandidateneinreichung, Assignment-Aktivität oder freigegebenen Timesheets in den letzten 30 Tagen.'
      );
    }else{
      var locLbl=getLocLabel();
      setPoolEmptyState(
        tier ? 'Keine Lieferanten für diesen Tier' : (locLbl ? 'Keine Lieferanten im Pool für Standort '+locLbl : 'Keine Lieferanten im Pool'),
        tier ? 'Passen Sie den Tier-Filter an oder fügen Sie einen weiteren Lieferanten hinzu.' : 'Noch keine Lieferantenbeziehung vorhanden. Fuegen Sie jetzt einen Lieferanten hinzu.'
      );
    }
    if(partialIssues.length){
      showPoolState('warn','Teilweise Daten fehlen',partialIssues.join(' und ')+' konnten nicht geladen werden. Der Pool bleibt dennoch bedienbar.');
    }else{
      clearPoolState();
    }
    return;
  }
  hidePoolEmptyState();
  if(activityDrilldown){
    renderTierStats(buildTierStats(items),'Aktiv 30 Tage');
    renderActivityDrilldownManagement(items,tier);
    if(vendorPoolAccess.canWrite){
      clearPoolState();
    }else{
      showPoolState('info','Vendor Pool read-only','Lieferantenbeziehungen sind sichtbar, Aenderungen bleiben fuer diese Rolle gesperrt.');
    }
  }else if(partialIssues.length){
    showPoolState('warn','Teilweise Daten fehlen',partialIssues.join(' und ')+' konnten nicht geladen werden. Der Pool bleibt dennoch bedienbar.');
  }else if(!vendorPoolAccess.canWrite){
    showPoolState('info','Vendor Pool read-only','Lieferantenbeziehungen sind sichtbar, Aenderungen bleiben fuer diese Rolle gesperrt.');
  }else{
    clearPoolState();
  }
  tbody.innerHTML=items.map(function(v){
    var repClass=(v.reputation_score||0)>=80?'good':(v.reputation_score||0)>=60?'warn':'bad';
    var breachClass=v.sla_breach_rate_pct==null?'':(Number(v.sla_breach_rate_pct)<=10?'good':Number(v.sla_breach_rate_pct)<=25?'warn':'bad');
    var rateCardLink=rateCardAccess.canRead
      ? '<a class="btn" data-feature-key="rate_card_management" href="'+buildRateCardUrl(v)+'" style="padding:4px 10px;font-size:11px" title="Lieferantenspezifische Preisrahmen">Preisrahmen &#8594;</a>'
      : '';
    var spendLink=spendAnalyticsAccess.canRead
      ? '<a class="btn" data-feature-key="spend_analytics" href="'+buildSpendUrl(v)+'" style="padding:4px 10px;font-size:11px" title="Spend fuer diesen Lieferanten">Kosten &#8594;</a>'
      : '';
    var actionHtml=vendorPoolAccess.canWrite
      ? '<select data-feature-key="supplier_management" onchange="changeTier(\''+v.id+'\',this.value)" style="width:auto;margin:0;padding:4px 8px;font-size:12px">'
          + ['PREFERRED','SECONDARY','TRIAL','RESTRICTED','BLOCKED'].map(function(t){
              return '<option'+(t===v.tier?' selected':'')+'>'+t+'</option>';
            }).join('')
          + '</select>'
          + (v.status==='active'
              ? '<button class="btn bad" data-feature-key="supplier_management" style="padding:4px 8px;font-size:11px" onclick="suspendEntry(\''+v.id+'\')">Sperren</button>'
              : '<button class="btn good" data-feature-key="supplier_management" style="padding:4px 8px;font-size:11px" onclick="activateEntry(\''+v.id+'\')">Aktivieren</button>')
      : '<span class="table-meta">Read-only</span>';
    return '<tr class="vp-row">'+
      '<td><strong>'+esc(v.supplier_org_name||v.supplier_org_id)+'</strong><div class="table-meta">'+esc(v.supplier_org_type||'Lieferant')+(v.location_name?' · '+esc(v.location_name):'')+'</div></td>'+
      '<td><span class="tier-badge tb-'+v.tier+'">'+esc(v.tier)+'</span></td>'+
      '<td>'+esc(v.category||'–')+'</td>'+
      '<td>'+esc(v.status)+'<div class="table-meta">Gueltig bis '+(v.valid_until?esc(v.valid_until):'–')+'</div></td>'+
      '<td><div class="metric-stack">'
        + '<span class="metric-chip '+repClass+'">Rep ' + (v.reputation_score!=null?esc(String(v.reputation_score)):'–') + ' / ' + esc(v.reputation_grade||'n/a') + '</span>'
        + '<span class="metric-chip">Fill ' + pct(v.fill_rate_pct) + '</span>'
        + '<span class="metric-chip '+breachClass+'">SLA Breach ' + pct(v.sla_breach_rate_pct) + '</span>'
      + '</div></td>'+
      '<td><div class="quick-links">'
        + '<a class="btn" data-feature-key="supplier_ratings" href="'+buildScoreUrl(v)+'" style="padding:4px 10px;font-size:11px" title="Lieferantenbewertung">Bewertung &#8594;</a>'
        + rateCardLink
        + spendLink
      + '</div><div class="table-meta">Deal Success '+pct(v.deal_success_rate)+' · Activity '+(v.activity_score!=null?esc(String(v.activity_score)):'–')+'</div></td>'+
      '<td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+actionHtml+'</td></tr>';
  }).join('');
  applyVendorPoolDomLocks(tbody);
}

async function changeTier(id,tier){
  if(!ensureVendorPoolWrite('Tier-Aenderungen'))return;
  var reason=prompt('Grund fuer Tier-Aenderung (optional):');
  var result=await apiMut('PATCH','/vendor-pool/'+id+'/tier',{tier:tier,reason:reason||null});
  if(result&&!result.error){
    showPoolState('good','Tier aktualisiert','Die Lieferantenstufe wurde erfolgreich geändert.');
    loadPool();
  }else{
    showPoolState('bad','Tier-Änderung fehlgeschlagen',parseApiError(result,'Die Lieferantenstufe konnte nicht geändert werden.'));
  }
}
async function suspendEntry(id){
  if(!ensureVendorPoolWrite('Sperrungen'))return;
  var result=await apiMut('PATCH','/vendor-pool/'+id+'/status',{status:'suspended',reason:'Manuell gesperrt'});
  if(result&&!result.error){
    showPoolState('good','Lieferant gesperrt','Der Lieferant wurde erfolgreich auf suspendiert gesetzt.');
    loadPool();
  }else{
    showPoolState('bad','Sperrung fehlgeschlagen',parseApiError(result,'Der Lieferant konnte nicht gesperrt werden.'));
  }
}
async function activateEntry(id){
  if(!ensureVendorPoolWrite('Aktivierungen'))return;
  var result=await apiMut('PATCH','/vendor-pool/'+id+'/status',{status:'active'});
  if(result&&!result.error){
    showPoolState('good','Lieferant aktiviert','Der Lieferant wurde wieder aktiviert.');
    loadPool();
  }else{
    showPoolState('bad','Aktivierung fehlgeschlagen',parseApiError(result,'Der Lieferant konnte nicht aktiviert werden.'));
  }
}

function showAdd(){
  if(!ensureVendorPoolWrite('Das Hinzufuegen von Lieferanten'))return;
  document.getElementById('aClientOrg').value = document.getElementById('fClientOrg').value || '';
  if(!document.getElementById('aClientOrg').value){
    showPoolState('warn','Organisation fehlt','Ohne Client-Organisation kann kein Lieferant dem Pool hinzugefügt werden.');
    return;
  }
  document.getElementById('supplierLookupResults').innerHTML = '';
  document.getElementById('addModal').classList.add('show');
}
async function lookupSuppliers() {
  if(!ensureVendorPoolWrite('Die Lieferantensuche im Vendor Pool'))return;
  var q = (document.getElementById('aSupplierSearch').value || '').trim();
  var box = document.getElementById('supplierLookupResults');
  if (q.length < 2) { box.innerHTML = '<div style="font-size:12px;color:var(--muted)">Mindestens 2 Zeichen eingeben.</div>'; return; }
  var data = await apiGet('/vendor-pool/supplier-lookup?q=' + encodeURIComponent(q));
  if (!data) { box.innerHTML = sectionNote('Lieferantensuche derzeit nicht verfügbar.'); return; }
  var items = (data && data.items) || [];
  if (!items.length) { box.innerHTML = '<div style="font-size:12px;color:var(--muted)">Keine passenden Organisationen gefunden.</div>'; return; }
  box.innerHTML = items.map(function(it) {
    return '<button type="button" class="btn" data-feature-key="supplier_management" style="margin:2px 4px 2px 0;padding:4px 8px;font-size:12px" data-id="' + esc(it.id) + '" onclick="pickSupplier(this.dataset.id)">' +
      esc(it.name || it.id) + ' <span style="opacity:.7">(' + esc(it.org_type || 'org') + ')</span></button>';
  }).join('');
  applyVendorPoolDomLocks(box);
}

function pickSupplier(id) {
  document.getElementById('aSupplierOrg').value = id;
}

function closeAdd(){document.getElementById('addModal').classList.remove('show');}

async function submitAdd(e){
  e.preventDefault();
  if(!ensureVendorPoolWrite('Das Anlegen von Lieferantenbeziehungen'))return;
  var body={
    client_org_id:document.getElementById('aClientOrg').value.trim(),
    supplier_org_id:document.getElementById('aSupplierOrg').value.trim(),
    tier:document.getElementById('aTier').value,
    category:document.getElementById('aCategory').value||null,
    valid_from:document.getElementById('aFrom').value||null,
    valid_until:document.getElementById('aUntil').value||null,
    reason:document.getElementById('aReason').value||null
  };
  var result=await apiMut('POST','/vendor-pool',body);
  if(result&&result.id){
    closeAdd();document.getElementById('addForm').reset();
    document.getElementById('fClientOrg').value=body.client_org_id;
    showPoolState('good','Lieferant hinzugefügt','Die Lieferantenbeziehung wurde erfolgreich angelegt.');
    loadPool();
  }else{
    showPoolState('bad','Anlage fehlgeschlagen',parseApiError(result,'Die Lieferantenbeziehung konnte nicht angelegt werden.'));
  }
}
window.loadPool = loadPool;
window.changeTier = changeTier;
window.suspendEntry = suspendEntry;
window.activateEntry = activateEntry;
window.showAdd = showAdd;
window.closeAdd = closeAdd;
window.submitAdd = submitAdd;
window.lookupSuppliers = lookupSuppliers;
window.pickSupplier = pickSupplier;

init().then(function(){
  if (!currentMe || !currentMe.org_id) {
      document.getElementById('statsRow').innerHTML=sectionNote('Der Organisationskontext konnte nicht automatisch geladen werden.');
      renderManagement(null);
      setPoolEmptyState('Lieferantenpool nicht initialisiert','Bitte Organisation und Benutzerkontext prüfen, bevor der Pool geladen wird.');
      showPoolState('warn','Kontext nicht verfügbar','Der Nutzerkontext liefert derzeit keine Client-Organisation.');
      return;
  }
  document.getElementById('fClientOrg').value = currentMe.org_id;
  document.getElementById('aClientOrg').value = currentMe.org_id;
  applyPoolFilterDefaults();
  loadPool(false);
});
