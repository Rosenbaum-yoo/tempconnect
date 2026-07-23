"use strict";

const API='/api';
let allSubs=[],allWrks=[],allInvs=[],subKpis={},curFilter='pending',selId=null,wrksLoaded=false;
let allLinks=[],linksLoaded=false,editingLinkId=null,asgnFilter='active',asgnQuery='',unassignedCaps=[];
let _closedDealAsgns=[],closedDealAsgnLoaded=false;
let bundlePreview=[],bundleItems=[];
let bundlePeriodMode='week';
let currentBundleDetailItems=[];
let currentBundleDetailKey='';
let openDealAssignments=[];
let staffingSuggestionsByAssignment={};
let staffingWorkerSuggestionsByAssignment={};
let staffingDetailsByAssignment={};
let staffingUiStateByAssignment={};
let staffingWorkerPrefillId='';
let subsLoaded=false,dealAsgnLoaded=false,currentTab='subs',currentMe=null;
let workerAssignmentDrawerState=createEmptyWorkerAssignmentDrawerState();
const AGENCY_SUBS_URL = `${API}/agency/submissions`;
const AGENCY_KPIS_URL = `${API}/agency/submissions/kpis`;
const AGENCY_BUNDLE_PREVIEW_URL = `${API}/agency/submissions/bundles/preview`;
const AGENCY_BUNDLES_URL = `${API}/agency/submissions/bundles`;
const TAB_ORDER=['subs','wrks','asgn'];
let pageAccess=createEmptyPageAccess();
let staffingFastTrackContext=createEmptyStaffingFastTrackContext();
let _csrfToken=null;
async function getCsrf(){
  if(_csrfToken)return _csrfToken;
  const r=await fetch(`${API}/csrf`,{credentials:'include'});
  const d=await r.json();_csrfToken=d.token;return _csrfToken;
}
function createEmptyPageAccess(){
  return {
    workerModule:false,
    permissions:{
      workerView:false,
      workerReview:false,
      workerCreate:false,
      workerManage:false,
      workerEdit:false
    },
    tabs:{
      subs:false,
      wrks:false,
      asgn:false
    }
  };
}

function createEmptyStaffingFastTrackContext(){
  return {
    mode:'',
    assignmentId:'',
    offerId:'',
    hasFastTrack:false,
    autoFocusPending:false
  };
}

function createEmptyWorkerAssignmentDrawerState(){
  return {
    workerId:'',
    loading:false,
    error:'',
    activeAssignmentId:'',
    cards:{}
  };
}

function parseStaffingFastTrackContext(){
  const params=new URLSearchParams(location.search||'');
  const mode=String(params.get('mode')||'').trim().toLowerCase();
  const assignmentId=String(params.get('assignment_id')||'').trim();
  const offerId=String(params.get('offer_id')||'').trim();
  return {
    mode,
    assignmentId,
    offerId,
    hasFastTrack:mode==='staffing_ready'&&!!assignmentId,
    autoFocusPending:mode==='staffing_ready'&&!!assignmentId
  };
}

staffingFastTrackContext=parseStaffingFastTrackContext();

function derivePageAccess(me){
  const caps=me?.capabilities||{};
  const workerModule=!!caps.worker_module;
  const permissions={
    workerView:!!caps.worker_view,
    workerReview:!!caps.worker_review,
    workerCreate:!!caps.worker_create,
    workerManage:!!caps.worker_manage,
    workerEdit:!!caps.worker_edit
  };
  return {
    workerModule,
    permissions,
    tabs:{
      subs:workerModule&&permissions.workerReview,
      wrks:workerModule&&permissions.workerView,
      asgn:workerModule&&permissions.workerView
    }
  };
}

function toggleElement(id,visible,display=''){
  const el=document.getElementById(id);
  if(!el)return;
  el.style.display=visible?display:'none';
}

function setPanelNotice(id,title,message,tone='info'){
  const el=document.getElementById(id);
  if(!el)return;
  if(!title&&!message){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  el.className=`wk-alert wk-alert-${tone}`;
  el.innerHTML=`<span>${tone==='danger'?'&#9888;':'&#9432;'}</span><span><strong>${esc(title||'')}</strong>${message?` ${esc(message)}`:''}</span>`;
  el.style.display='';
}

function renderPageAccessState(title,message){
  const el=document.getElementById('pageAccessState');
  if(!el)return;
  if(!title&&!message){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  el.innerHTML=`<div class="icon">&#128274;</div><h3>${esc(title||'Kein Zugriff')}</h3><p>${esc(message||'')}</p>`;
  el.style.display='block';
}

function setTabVisibility(tabKey,visible){
  const tab=document.getElementById('tab-'+tabKey);
  const panel=document.getElementById('panel-'+tabKey);
  if(tab){
    tab.style.display=visible?'':'none';
    tab.disabled=!visible;
  }
  if(!visible&&panel){
    panel.classList.remove('active');
  }
}

function getRequestedTab(){
  const raw=String(location.hash||'').replace(/^#/,'').toLowerCase();
  const map={
    subs:'subs','panel-subs':'subs','tab-subs':'subs',
    wrks:'wrks','panel-wrks':'wrks','tab-wrks':'wrks',
    asgn:'asgn','panel-asgn':'asgn','tab-asgn':'asgn'
  };
  if(map[raw])return map[raw];
  if(!raw&&staffingFastTrackContext.hasFastTrack)return 'asgn';
  return null;
}

function getInitialTab(){
  const requested=getRequestedTab();
  if(requested&&pageAccess.tabs[requested])return requested;
  return TAB_ORDER.find((tab)=>pageAccess.tabs[tab])||null;
}

function applyPageAccess(){
  TAB_ORDER.forEach((tabKey)=>setTabVisibility(tabKey,!!pageAccess.tabs[tabKey]));
  toggleElement('hubTabs',TAB_ORDER.some((tabKey)=>pageAccess.tabs[tabKey]));
  toggleElement('wrksInviteBtn',pageAccess.permissions.workerManage);
  toggleElement('wrksCreateBtn',pageAccess.permissions.workerCreate);
  setPanelNotice(
    'wrksManageNotice',
    pageAccess.tabs.wrks&&!pageAccess.permissions.workerManage?'Ansicht mit Teilzugriff.':'',
    pageAccess.tabs.wrks&&!pageAccess.permissions.workerManage?'Einladungen, Aktivierungen und Pflegeaktionen sind fuer Ihre aktuelle Rolle nicht freigeschaltet.':'',
    'info'
  );
  toggleElement('asgnAssignBtn',pageAccess.permissions.workerEdit);
  setPanelNotice(
    'asgnEditNotice',
    pageAccess.tabs.asgn&&!pageAccess.permissions.workerEdit?'Ansicht mit Teilzugriff.':'',
    pageAccess.tabs.asgn&&!pageAccess.permissions.workerEdit?'Sie koennen Einsatzkonfigurationen sehen, aber Staffing- und Zuweisungsaktionen sind fuer Ihre aktuelle Rolle nicht freigeschaltet.':'',
    'info'
  );
}


function setStaffingFastTrackNotice(title,message,tone='info'){
  const el=document.getElementById('staffingFastTrackNotice');
  if(!el)return;
  if(!title&&!message){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  el.className=`wk-alert wk-alert-${tone}`;
  el.innerHTML=`<span>${tone==='danger'||tone==='warning'?'&#9888;':''}</span><span><strong>${esc(title||'')}</strong>${message?` ${esc(message)}`:''}</span>`;
  el.style.display='';
}
function tonePillClass(tone){
  const map={
    brand:'pill-pnd',
    success:'pill-act',
    warning:'pill-warn',
    danger:'pill-danger',
    neutral:'pill-off',
    accent:'pill-accent'
  };
  return map[tone]||'pill-off';
}
function setToneHint(el,tone,text){
  if(!el)return;
  if(!tone||!text){
    el.style.display='none';
    el.textContent='';
    el.style.background='';
    el.style.borderLeft='';
    el.style.color='';
    return;
  }
  const toneMap={
    brand:{background:'var(--tc-tone-brand-bg)',border:'var(--hub-accent)',color:'var(--tc-tone-brand-text)'},
    success:{background:'var(--tc-tone-success-bg)',border:'var(--wk-success)',color:'var(--tc-tone-success-text)'},
    warning:{background:'var(--tc-tone-warning-bg)',border:'var(--wk-warning)',color:'var(--tc-tone-warning-text)'},
    danger:{background:'var(--tc-tone-danger-bg)',border:'var(--wk-danger)',color:'var(--tc-tone-danger-text)'}
  };
  const cfg=toneMap[tone]||toneMap.brand;
  el.style.display='block';
  el.style.background=cfg.background;
  el.style.borderLeft=`3px solid ${cfg.border}`;
  el.style.color=cfg.color;
  el.textContent=text;
}

function renderStaffingFastTrackNotice(){
  if(currentTab!=='asgn'||!staffingFastTrackContext.hasFastTrack){
    setStaffingFastTrackNotice('','');
    return;
  }
  if(!pageAccess.permissions.workerEdit){
    setStaffingFastTrackNotice(
      'Staffing-Fast-Track geöffnet.',
      'Der Deal verweist direkt auf die Einsatzbesetzung, aber Ihre aktuelle Rolle darf keine Staffing-Aktionen ausführen.',
      'info'
    );
    return;
  }
  const targetAssignment=openDealAssignments.find((assignment)=>assignment.assignment_id===staffingFastTrackContext.assignmentId);
  if(targetAssignment){
    const open=Number(targetAssignment.open_quantity||Math.max(Number(targetAssignment.requested_quantity||targetAssignment.worker_count||1)-Number(targetAssignment.filled_quantity||0)-Number(targetAssignment.reserved_quantity||0),0));
    setStaffingFastTrackNotice(
      'Staffing-Fast-Track aktiv.',
      `${open} offene Plätze sind direkt geladen. Sichere Direktzuweisung, Anfrage und manuelle Zuweisung laufen auf derselben Einsatzkarte weiter.`,
      'info'
    );
    return;
  }
  const quickAssignSummary=staffingUiStateByAssignment[staffingFastTrackContext.assignmentId]?.quickAssignResult?.summary||null;
  if(quickAssignSummary&&Number(quickAssignSummary.open_quantity_after||0)===0){
    setStaffingFastTrackNotice(
      'Deal-Einsatz bereits vollständig besetzt.',
      'Die Schnellroute hat keine offenen Plätze mehr. Bestehende Links und Verlauf bleiben weiter über diese Seite sichtbar.',
      'success'
    );
    return;
  }
  setStaffingFastTrackNotice(
    'Deal-Einsatz nicht mehr offen.',
    'Der direkte Staffing-Einstieg wurde aufgerufen, aber dieser Einsatz taucht nicht mehr in den offenen Deal-Einsätzen auf.',
    'warning'
  );
}

function scrollDealAssignmentIntoView(assignmentId){
  const card=document.getElementById(`dealAsgnCard-${assignmentId}`);
  if(card&&typeof card.scrollIntoView==='function'){
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }
}

async function openStaffingPanel(assignmentId,{forceReload=false,scrollIntoView=false}={}){
  if(!ensurePermission('workerEdit','Sie koennen Einsaetze sehen, aber keine Staffing-Details oeffnen.'))return false;
  const panel=document.getElementById('staffingPanel-'+assignmentId);
  if(!panel)return false;
  if(scrollIntoView)scrollDealAssignmentIntoView(assignmentId);
  if(panel.style.display!=='none'&&!forceReload){
    return true;
  }
  panel.style.display='block';
  panel.innerHTML='<div style="padding:14px;color:var(--wk-text-muted);font-size:12px">Lade Staffing-Details…</div>';
  try{
    const state=getStaffingUiState(assignmentId);
    await Promise.all([
      loadStaffingDetail(assignmentId),
      loadStaffingSuggestions(assignmentId,{limit:20,only_available:true,hard_only:state.hardOnly,include_blocked:true})
    ]);
    renderStaffingPanel(assignmentId);
    return true;
  }catch(e){
    panel.innerHTML=`<div style="padding:14px;color:var(--tc-tone-danger-text);font-size:12px">${esc(e.message||'Laden fehlgeschlagen')}</div>`;
    return false;
  }
}

async function maybeAutoFocusStaffingReadyAssignment(){
  if(currentTab!=='asgn'||!staffingFastTrackContext.autoFocusPending||!staffingFastTrackContext.assignmentId)return;
  staffingFastTrackContext.autoFocusPending=false;
  if(!openDealAssignments.some((assignment)=>assignment.assignment_id===staffingFastTrackContext.assignmentId))return;
  await openStaffingPanel(staffingFastTrackContext.assignmentId,{forceReload:true,scrollIntoView:true});
}

function invalidateStaffingDataCache(assignmentId=null){
  if(assignmentId){
    delete staffingSuggestionsByAssignment[assignmentId];
    delete staffingWorkerSuggestionsByAssignment[assignmentId];
    delete staffingDetailsByAssignment[assignmentId];
    return;
  }
  staffingSuggestionsByAssignment={};
  staffingWorkerSuggestionsByAssignment={};
  staffingDetailsByAssignment={};
}

function setStaffingWorkerPrefill(workerId=''){
  staffingWorkerPrefillId=String(workerId||'').trim();
}

function applyStaffingWorkerPrefill(workerId=staffingWorkerPrefillId){
  const targetWorkerId=String(workerId||'').trim();
  if(!targetWorkerId)return;
  openDealAssignments.forEach((assignment)=>{
    const sel=document.getElementById(`dealWkr-${assignment.assignment_id}`);
    if(!sel)return;
    const hasOption=Array.from(sel.options||[]).some((option)=>option.value===targetWorkerId);
    if(hasOption)sel.value=targetWorkerId;
  });
}

function getWorkerById(workerId){
  return allWrks.find((worker)=>(worker.id||worker.user_id)===workerId)||null;
}

function getAssignmentClientName(assignmentId){
  return staffingDetailsByAssignment[assignmentId]?.assignment?.client_org_name
    || staffingDetailsByAssignment[assignmentId]?.assignment?.client_name
    || openDealAssignments.find((assignment)=>assignment.assignment_id===assignmentId)?.client_org_name
    || null;
}

function resetWorkerAssignmentDrawerState(workerId=''){
  workerAssignmentDrawerState=createEmptyWorkerAssignmentDrawerState();
  workerAssignmentDrawerState.workerId=String(workerId||'').trim();
}

function getWorkerAssignmentDrawerCardState(assignmentId){
  if(!workerAssignmentDrawerState.cards[assignmentId]){
    workerAssignmentDrawerState.cards[assignmentId]={
      loading:false,
      loaded:false,
      error:'',
      detail:null,
      suggestion:null
    };
  }
  return workerAssignmentDrawerState.cards[assignmentId];
}

function isWorkerAssignmentDrawerOpen(){
  return !!document.getElementById('wrkAssignDrw')?.classList.contains('on');
}


async function loadStaffingSuggestionForWorker(assignmentId,workerUserId,{force=false}={}){
  const targetWorkerId=String(workerUserId||'').trim();
  if(!targetWorkerId)return { suggestion:null, bundle:null };
  if(!staffingWorkerSuggestionsByAssignment[assignmentId]){
    staffingWorkerSuggestionsByAssignment[assignmentId]={};
  }
  if(!force&&staffingWorkerSuggestionsByAssignment[assignmentId][targetWorkerId]){
    return staffingWorkerSuggestionsByAssignment[assignmentId][targetWorkerId];
  }
  const query=new URLSearchParams();
  query.set('limit','1');
  query.set('only_available','false');
  query.set('hard_only','false');
  query.set('include_blocked','true');
  query.set('worker_user_id',targetWorkerId);
  const bundle=await fetchJson(`${API}/staffing-assignments/${assignmentId}/suggestions?${query.toString()}`);
  const entry={
    suggestion:(bundle.suggestions||[])[0]||null,
    bundle
  };
  staffingWorkerSuggestionsByAssignment[assignmentId][targetWorkerId]=entry;
  return entry;
}

async function refreshWorkerAssignmentDrawerAfterMutation(assignmentId){
  if(!isWorkerAssignmentDrawerOpen())return;
  if(assignmentId){
    delete workerAssignmentDrawerState.cards[assignmentId];
    if(workerAssignmentDrawerState.activeAssignmentId===assignmentId&&!openDealAssignments.some((assignment)=>assignment.assignment_id===assignmentId)){
      workerAssignmentDrawerState.activeAssignmentId='';
    }
  }
  renderWorkerAssignDrw();
  if(workerAssignmentDrawerState.activeAssignmentId){
    await loadWorkerAssignmentCardContext(workerAssignmentDrawerState.activeAssignmentId,{force:true});
  }
}
class ApiError extends Error {
  constructor(message,{status=0,code=null,body=null}={}){
    super(message||'Request fehlgeschlagen');
    this.name='ApiError';
    this.status=status;
    this.code=code;
    this.body=body;
  }
}

function apiErrorCode(payload){
  if(!payload)return null;
  if(typeof payload.error==='string')return payload.error;
  if(payload.error&&typeof payload.error==='object'&&payload.error.code)return payload.error.code;
  return payload.code||null;
}

function apiErrorMessage(payload,status){
  if(payload?.error?.message)return payload.error.message;
  if(payload?.message)return payload.message;
  if(typeof payload?.error==='string')return payload.error;
  return `HTTP ${status}`;
}

// Zentraler AbortController pro aktivem Tab. Beim Tab-Wechsel wird der
// bisherige abgebrochen, damit laufende Fetches keine ERR_NETWORK_CHANGED-
// Kaskaden produzieren. Phase 12 der Welle 7.
let _currentTabController=null;
function startTabAbortScope(){
  if(_currentTabController){
    try{_currentTabController.abort();}catch{/* ignore */}
  }
  _currentTabController=(typeof AbortController!=='undefined')?new AbortController():null;
  return _currentTabController;
}
function currentTabSignal(){
  return _currentTabController?_currentTabController.signal:undefined;
}

async function fetchJson(url,options={}){
  const init={credentials:'include',...options};
  // Default: an aktive Tab-Abort-Scope binden (fuer GETs im Tab-Kontext).
  // Explizite options.signal gewinnt (z. B. beforeunload-Beacons).
  if(init.signal===undefined){
    const sig=currentTabSignal();
    if(sig) init.signal=sig;
  }
  let response;
  try{
    response=await fetch(url,init);
  }catch(networkError){
    // AbortError (Tab-Wechsel) oder TypeError (Network-Transient wie
    // ERR_NETWORK_CHANGED/Offline) duerfen keinen sichtbaren Fehler produzieren.
    const aborted=networkError?.name==='AbortError';
    throw new ApiError(aborted?'ABORTED':'NETWORK_TRANSIENT',{
      status:0,
      code:aborted?'ABORTED':'NETWORK_TRANSIENT',
      body:null
    });
  }
  let payload=null;
  try{payload=await response.json();}catch{payload=null;}
  if(response.status===401){
    location.href='enterprise.html';
    throw new ApiError('NOT_AUTHENTICATED',{status:401,code:'NOT_AUTHENTICATED',body:payload});
  }
  if(!response.ok){
    throw new ApiError(apiErrorMessage(payload,response.status),{
      status:response.status,
      code:apiErrorCode(payload),
      body:payload
    });
  }
  return payload||{};
}

function isAccessDeniedError(error){
  return error?.status===403;
}

function isTransientError(error){
  return error?.code==='ABORTED'||error?.code==='NETWORK_TRANSIENT';
}

function ensurePermission(permissionKey,message){
  if(pageAccess.permissions[permissionKey])return true;
  toast(message||'Keine Berechtigung fuer diese Aktion','error');
  return false;
}

function isCompanyContext(me){
  const orgType=String(me?.org_type||'').trim().toLowerCase();
  if(orgType) return orgType==='company';
  const legacy=String(me?.role||'').trim().toLowerCase();
  return legacy==='company';
}

async function initializePage(){
  try{
    currentMe=await fetchJson(`${API}/me`);
    pageAccess=derivePageAccess(currentMe);
  }catch(error){
    if(error?.status===401)return;
    pageAccess=createEmptyPageAccess();
    applyPageAccess();
    renderPageAccessState(
      'Seite konnte nicht initialisiert werden',
      'Der aktuelle Zugriffs- und Organisationskontext ist derzeit nicht verfuegbar.'
    );
    return;
  }

  // Welle 7 – Phase 0+1: Company-Soft-Lock. Dieser Arbeitsplatz ist der
  // operative Einsatzleitstand der Agentur. Unternehmen sehen statt des
  // vollen Reviews eine lesende Orientierungsflaeche und werden auf ihre
  // Deal-/Activity-Kanaele verwiesen (Einsatzverfolgung, nicht Einsatzsteuerung).
  if(isCompanyContext(currentMe)){
    pageAccess=createEmptyPageAccess();
    applyPageAccess();
    renderPageAccessState(
      'Einsatzverfolgung (Unternehmenssicht)',
      'Dieser Arbeitsplatz ist der operative Einsatzleitstand Ihres Personaldienstleisters. Einsatzstatus, Zeitfreigaben und Abrechnungsstand sehen Sie als Unternehmen lesend ueber Deals und Activity.'
    );
    // Audit 5: statische Dienstleister-Operator-Flaechen fuer Unternehmen ausblenden, damit die
    // "nur lesend"-Notiz nicht durch Operator-Kacheln widerlegt wird (Banner "zentral steuern",
    // Verwaltungs-Hub-Grid "an Kunden senden / Freigabe-Queue / Einsatzkraefte").
    toggleElement('pilotPriorityBanner', false);
    toggleElement('verwaltungHubSection', false);
    var _sub = document.getElementById('pageSubtitle');
    if (_sub) _sub.textContent = 'Einsatzstatus, Zeitfreigaben und Abrechnungsstand Ihres Personaldienstleisters – lesend ueber Deals und Activity.';
    return;
  }

  applyPageAccess();
  const initialTab=getInitialTab();
  if(!initialTab){
    renderPageAccessState(
      'Kein Zugriff auf diesen Bereich',
      'Fuer Ihren aktuellen Organisationskontext sind hier keine operativen Bereiche freigeschaltet.'
    );
    return;
  }
  renderPageAccessState('','');
  await switchTab(initialTab,{force:true});
}

(async()=>{ await initializePage(); })();

async function reloadAll(){
  subsLoaded=false;
  wrksLoaded=false;
  linksLoaded=false;
  dealAsgnLoaded=false;
  closedDealAsgnLoaded=false;
  if(currentTab==='subs'&&pageAccess.tabs.subs) await loadSubs();
  if(currentTab==='wrks'&&pageAccess.tabs.wrks) await loadWrks();
  if(currentTab==='asgn'&&pageAccess.tabs.asgn){
    await loadAsgn();
    if(pageAccess.permissions.workerEdit) await loadDealAsgn();
    await loadClosedDealAsgn();
  }
}

/* TABS */
async function switchTab(t,opts={}){
  if(!pageAccess.tabs[t])return;
  // Pendante Requests des Vor-Tabs abbrechen, damit ERR_NETWORK_CHANGED
  // nicht in der Konsole landet, wenn der Nutzer schnell switcht.
  startTabAbortScope();
  currentTab=t;
  document.querySelectorAll('.hub-tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.hub-tab-panel').forEach(x=>x.classList.remove('active'));
  document.getElementById('tab-'+t).classList.add('active');
  document.getElementById('panel-'+t).classList.add('active');
  try{
    if(t==='subs'&&(!subsLoaded||opts.force)) await loadSubs();
    if(t==='wrks'&&(!wrksLoaded||opts.force)) await loadWrks();
    if(t==='asgn'){
      if(!linksLoaded||opts.force) await loadAsgn();
      if(pageAccess.permissions.workerEdit&&(!dealAsgnLoaded||opts.force)) await loadDealAsgn();
      if(!pageAccess.permissions.workerEdit){
        dealAsgnLoaded=true;
        toggleElement('dealAsgnSection',false);
      }
      if(!closedDealAsgnLoaded||opts.force) await loadClosedDealAsgn();
    }
  }catch(err){
    // Transient-Errors hier nicht eskalieren — die jeweilige load*-Funktion
    // setzt bereits eine passende Panel-Notice. Andere Fehler bubble'n aber
    // durch den jeweiligen load*-catch.
    if(!isTransientError(err)) throw err;
  }
  renderStaffingFastTrackNotice();
}

/* SUBMISSIONS */
async function loadSubs(){
  if(!pageAccess.tabs.subs){
    subsLoaded=true;
    setPanelNotice(
      'subsStateNotice',
      'Kein Zugriff auf Stundenzettel & Freigaben.',
      'Der Bereich ist fuer Ihren aktuellen Organisationskontext nicht freigeschaltet.',
      'info'
    );
    toggleElement('ldSubs',false);
    toggleElement('ctSubs',false);
    return;
  }

  setPanelNotice('subsStateNotice','','');
  toggleElement('ldSubs',true,'block');
  toggleElement('ctSubs',false);

  try{
    const [subsResult,kpiResult,previewResult,bundleResult]=await Promise.allSettled([
      fetchJson(`${AGENCY_SUBS_URL}?limit=300`),
      fetchJson(`${AGENCY_KPIS_URL}`),
      fetchJson(`${AGENCY_BUNDLE_PREVIEW_URL}?period_mode=${encodeURIComponent(bundlePeriodMode)}`),
      fetchJson(`${AGENCY_BUNDLES_URL}`)
    ]);
    if(subsResult.status!=='fulfilled') throw subsResult.reason;

    allSubs=subsResult.value.items||[];
    subKpis=kpiResult.status==='fulfilled'?(kpiResult.value||{}):{};
    bundlePreview=previewResult.status==='fulfilled'?(previewResult.value.items||[]):[];
    bundleItems=bundleResult.status==='fulfilled'?(bundleResult.value.items||[]):[];

    const partialFailures=[kpiResult,previewResult,bundleResult].filter((result)=>result.status==='rejected');
    if(partialFailures.length){
      const partialAccess=partialFailures.some((result)=>isAccessDeniedError(result.reason));
      setPanelNotice(
        'subsStateNotice',
        'Teilansicht aktiv.',
        partialAccess
          ? 'Einzelne Kundenflow-Elemente sind fuer Ihren aktuellen Zugriff nicht verfuegbar.'
          : 'Einzelne Zusatzbereiche konnten nicht geladen werden. Die Freigabenliste bleibt nutzbar.',
        partialAccess?'info':'warning'
      );
    }

    setSubKpis();
    renderBundleCenter();
    toggleElement('ldSubs',false);
    toggleElement('ctSubs',true);
    const pnd=allSubs.filter((s)=>s.status==='submitted').length;
    document.getElementById('tc-subs').textContent=pnd||allSubs.length||'0';
    renderSubs();
    subsLoaded=true;
  }catch(error){
    if(isTransientError(error)){
      // Tab-Wechsel oder Netz-Transient: Zustand nicht zerstoeren, damit
      // der naechste Tab-Besuch sauber reloaden kann.
      toggleElement('ldSubs',false);
      return;
    }
    allSubs=[];
    subKpis={};
    bundlePreview=[];
    bundleItems=[];
    subsLoaded=true;
    document.getElementById('tc-subs').textContent='–';
    toggleElement('ldSubs',false);
    toggleElement('ctSubs',false);
    if(isAccessDeniedError(error)){
      setPanelNotice(
        'subsStateNotice',
        'Kein Zugriff auf Stundenzettel & Freigaben.',
        'Der Bereich ist fuer Ihren aktuellen Organisationskontext nicht freigeschaltet.',
        'info'
      );
      return;
    }
    setPanelNotice(
      'subsStateNotice',
      'Stundenzettel & Freigaben konnten nicht geladen werden.',
      error?.message||'Bitte spaeter erneut versuchen.',
      'danger'
    );
  }
}
function setSubKpis(){
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  s('k1',subKpis.pending_review||0);
  s('k2',subKpis.in_review||0);
  s('k3',subKpis.needs_correction||0);
  s('k4',subKpis.approved_internal||0);
  s('k5',subKpis.sent_to_customer||0);
  s('k6',subKpis.confirmed||0);
  s('k7',subKpis.customer_rejected||0);
  s('k8',subKpis.posted||0);

  // Kundenversand-Zentrale Card befuellen
  updateCustomerFlowCard();
}

function updateCustomerFlowCard() {
  const ready = Number(subKpis.approved_internal || 0);
  const sent = Number(subKpis.sent_to_customer || 0);
  const confirmed = Number(subKpis.confirmed || 0);
  const rejected = Number(subKpis.customer_rejected || 0);
  const posted = Number(subKpis.posted || 0);
  const openAtCustomer = sent; // sent_to_customer = beim Kunden offen

  const sv = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  sv('ck-ready', ready);
  sv('ck-sent', sent);
  sv('ck-open', openAtCustomer);
  sv('ck-confirmed', confirmed);
  sv('ck-rejected', rejected);
  sv('ck-posted', posted);

  // Hauptaktion aktivieren/deaktivieren
  const btn = document.getElementById('custBtnSend');
  if (btn) {
    btn.disabled = (ready === 0 && bundlePreview.length === 0);
    btn.textContent = ready > 0
      ? ready + ' versandbereite Positionen anzeigen'
      : 'Versandbereite Positionen anzeigen';
  }

  // Flow-Badge
  const badge = document.getElementById('custFlowBadge');
  if (badge) {
    if (rejected > 0) {
      badge.className = 'pill ' + tonePillClass('danger');
      badge.textContent = 'Handlungsbedarf';
    } else if (ready > 0) {
      badge.className = 'pill pill-pnd'; badge.textContent = ready + ' versandbereit';
    } else if (openAtCustomer > 0) {
      badge.className = 'pill ' + tonePillClass('warning');
      badge.textContent = openAtCustomer + ' offen beim Kunden';
    } else if (posted > 0 && ready === 0 && sent === 0 && rejected === 0) {
      badge.className = 'pill pill-act'; badge.textContent = 'Alles abgerechnet';
    } else {
      badge.className = 'pill pill-pnd'; badge.textContent = 'Kundenflow';
    }
  }

  // Handlungsbedarf-Hinweis
  const hint = document.getElementById('custFlowHint');
  if (hint) {
    if (rejected > 0) {
      setToneHint(hint,'danger',rejected + ' Stundenzettel wurden vom Kunden abgelehnt. Bitte pruefen und korrigieren.');
    } else if (ready > 0) {
      setToneHint(hint,'success',ready + ' intern freigegebene Positionen sind bereit fuer den Kundenversand.');
    } else if (openAtCustomer > 0) {
      setToneHint(hint,'warning',openAtCustomer + ' Positionen warten auf Kundenrueckmeldung.');
    } else if (posted > 0 && ready === 0 && sent === 0) {
      setToneHint(hint,'success','Alle Positionen sind bestaetigt oder in Abrechnung. Kein Handlungsbedarf.');
    } else {
      setToneHint(hint,'','');
    }
  }
}

function setFilter(f){
  curFilter=f;
  document.querySelectorAll('.rev-pill').forEach(b=>b.classList.remove('on'));
  const m={pending:'fp',under_review:'fu',needs_correction:'fc',approved_internal:'fai',
            sent_to_customer:'fsc',customer_confirmed:'fcc',customer_rejected:'fcr',
            posted_to_timesheet:'fpt','':'fall'};
  const b=document.getElementById(m[f]);if(b)b.classList.add('on');
  renderSubs();
}
function getFiltered(){
  if(!curFilter)return allSubs;
  if(curFilter==='pending')return allSubs.filter(s=>s.status==='submitted');
  return allSubs.filter(s=>s.status===curFilter);
}
/* Naechster operativer Schritt je Submission-Status — Inline-Guidance auf der Zeile
   ("jeder weiss was als Naechstes zu tun ist"), analog requisitions REQ_NEXT_STEP /
   deals .dm-card__nextstep. Sicht: PDL-Reviewer (Unternehmen erreichen renderSubs nicht —
   Company-Soft-Lock mit return weiter oben). */
var SUB_NEXT_STEP = {
  submitted:          'Prüfen & freigeben',
  under_review:       'Freigeben oder Korrektur anfordern',
  needs_correction:   'Wartet auf Korrektur des Mitarbeiters',
  approved_internal:  'Bereit – an Kunde senden',
  sent_to_customer:   'Beim Kunden – Bestätigung ausstehend',
  customer_confirmed: 'Bestätigt – für Abrechnung verwenden',
  customer_rejected:  'Vom Kunden abgelehnt – klären'
  // posted_to_timesheet: Endzustand (eigener "Für Abrechnung verwendet"-Pill)
};
function subNextStep(status){ return SUB_NEXT_STEP[status] || ''; }

function renderSubs(){
  const el=document.getElementById('subList'),items=getFiltered();
  if(!items.length){el.innerHTML='<div class="hub-empty"><div class="icon">??</div><h3>Alles erledigt</h3><p>Keine Einreichungen in dieser Kategorie.</p></div>';return;}
  el.innerHTML=items.map(s=>`
    <div class="rev-item${s.id===selId?' sel':''}" onclick="selSub('${s.id}')">
      <div class="rev-ihead">
        <div class="rev-iname">${esc(s.first_name||'')} ${esc(s.last_name||'')}${s.personnel_number?` <span style="font-weight:400;font-size:.74rem;color:var(--wk-text-muted)">– ${esc(s.personnel_number)}</span>`:''}
        </div>${badge(s.status)}
      </div>
      <div class="rev-isub">${fmtWeek(s.week_start,s.week_end)}${subDeadlineTag(s)}</div>
      <div class="rev-ifoot">
        <span style="font-size:.78rem;color:var(--wk-text-muted)">${esc(s.client_name||s.org_name||'')}</span>
        <span class="rev-ihours">${parseFloat(s.total_hours||0).toFixed(1)} h</span>
      </div>
      ${subNextStep(s.status)?`<div class="rev-inextstep" style="font-size:11px;color:var(--ds-brand,#4a9eff);font-weight:600;margin-top:4px">→ ${esc(subNextStep(s.status))}</div>`:''}
      ${s.status==='posted_to_timesheet'||s.timesheet_id?'<div style="margin-top:6px"><span class="pill pill-act">Für Abrechnung verwendet</span></div>':''}
    </div>`).join('');
}

function renderBundleCenter(){
  const prevEl=document.getElementById('bundlePreviewList');
  const sentEl=document.getElementById('bundleSentList');
  if(!prevEl||!sentEl)return;

  if(!bundlePreview.length){
    prevEl.innerHTML='<div class="hub-empty" style="padding:16px 10px"><p>Keine freigegebenen Positionen für Sammelversand.</p></div>';
  }else{
    prevEl.innerHTML=bundlePreview.map(b=>`
      <div class="rev-item" style="margin-bottom:8px">
        <div class="rev-ihead">
          <div class="rev-iname">${esc(b.client_name||'Kunde')} <span style="font-weight:400;color:var(--wk-text-muted)">(${esc(b.period_key||'')})</span></div>
          <span class="pill pill-pnd">${b.submission_count||0} Positionen</span>
        </div>
        <div class="rev-isub">${esc(b.earliest_week_start||'')} bis ${esc(b.latest_week_end||'')} • ${Number(b.total_hours||0).toFixed(1)} h</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="wk-btn wk-btn-primary wk-btn-sm" onclick="sendBundleByKey('${esc(b.bundle_key)}')">Sammelversand</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="previewBundleScope('${esc(b.bundle_key)}')">Vorschau</button>
        </div>
      </div>
    `).join('');
  }

  if(!bundleItems.length){
    sentEl.innerHTML='<div class="hub-empty" style="padding:16px 10px"><p>Noch kein Sammelversand durchgeführt.</p></div>';
  }else{
    sentEl.innerHTML=bundleItems.slice(0,12).map(b=>`
      <div class="rev-item" style="margin-bottom:8px">
        <div class="rev-ihead">
          <div class="rev-iname">${esc(b.client_name||'Kunde')}</div>
          ${badgeBundleStatus(b.customer_bundle_status)}
        </div>
        <div class="rev-isub">${esc(b.customer_bundle_key||'')}</div>
        <div style="font-size:.76rem;color:var(--wk-text-muted);margin-top:3px">
          Pos.: ${b.submission_count||0} • Bestätigt: ${b.customer_confirmed_count||0} • Abgerechnet: ${b.posted_count||0}
        </div>
        ${renderBundleProgressBar(b)}
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="openBundleDetail('${esc(b.customer_bundle_key)}')">Details</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="downloadBundleCsv('${esc(b.customer_bundle_key)}')">CSV</button>
          <button class="wk-btn wk-btn-success wk-btn-sm" onclick="postBundle('${esc(b.customer_bundle_key)}')">In Abrechnung</button>
        </div>
      </div>
    `).join('');
  }
}

function renderBundleProgressBar(b){
  const total=Math.max(1,Number(b.submission_count||0));
  const sent=Number(b.sent_count||0);
  const confirmed=Number(b.customer_confirmed_count||0);
  const posted=Number(b.posted_count||0);
  const pSent=Math.round((sent/total)*100);
  const pConfirmed=Math.round((confirmed/total)*100);
  const pPosted=Math.round((posted/total)*100);
  return `
    <div style="margin-top:8px">
      <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--wk-text-muted);margin-bottom:4px">
        <span>Fortschritt</span><span>${pPosted}% abgerechnet</span>
      </div>
      <div style="height:6px;border-radius:999px;background:var(--tc-progress-track);overflow:hidden;position:relative">
        <div style="position:absolute;left:0;top:0;bottom:0;width:${pSent}%;background:var(--tc-progress-brand)"></div>
        <div style="position:absolute;left:0;top:0;bottom:0;width:${pConfirmed}%;background:var(--tc-progress-success)"></div>
        <div style="position:absolute;left:0;top:0;bottom:0;width:${pPosted}%;background:var(--tc-progress-success-strong)"></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;font-size:.71rem;color:var(--wk-text-muted)">
        <span>Gesendet ${sent}/${total}</span>
        <span>Bestätigt ${confirmed}/${total}</span>
        <span>Abgerechnet ${posted}/${total}</span>
      </div>
    </div>`;
}
async function setStaffingSuggestionMode(assignmentId,hardOnly){
  if(!ensurePermission('workerEdit','Sie koennen Staffing-Vorschlaege nicht filtern.'))return;
  try{
    const state=getStaffingUiState(assignmentId);
    state.hardOnly=!!hardOnly;
    await loadStaffingSuggestions(assignmentId,{limit:20,only_available:true,hard_only:state.hardOnly,include_blocked:true});
    renderStaffingPanel(assignmentId);
  }catch(e){toast(e.message||'Filter konnte nicht geladen werden','error');}
}

function badgeBundleStatus(st){
  const m={
    sent:'<span class="pill pill-pnd">Gesendet</span>',
    confirmed:'<span class="pill pill-act">Bestätigt</span>',
    partially_confirmed:'<span class="pill pill-warn">Teilweise</span>',
    rejected:'<span class="pill pill-off">Abgelehnt</span>',
    prepared:'<span class="pill pill-off">Vorbereitet</span>'
  };
  return m[st]||`<span class="pill pill-off">${esc(st||'offen')}</span>`;
}

function parseBundleKey(key){
  const parts=String(key||'').split('|');
  const out={orgId:null,periodMode:'week',periodKey:null};
  parts.forEach(p=>{
    if(p.startsWith('org:'))out.orgId=p.slice(4);
    if(p.startsWith('mode:'))out.periodMode=p.slice(5);
    if(p.startsWith('period:'))out.periodKey=p.slice(7);
  });
  return out;
}

function onBundlePeriodModeChange(){
  const sel=document.getElementById('bundlePeriodMode');
  bundlePeriodMode=(sel&&sel.value==='month')?'month':'week';
  loadSubs().catch(()=>{});
}

async function sendBundleByKey(bundleKey){
  try{
    const meta=parseBundleKey(bundleKey);
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_BUNDLES_URL}/send`,{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({
        org_id:meta.orgId,
        period_mode:meta.periodMode,
        period_key:meta.periodKey
      })
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Sammelversand fehlgeschlagen');
    toast(`Sammelversand gestartet (${d.submission_count||0} Positionen)`,'success');
    await loadSubs();
  }catch(e){toast(e.message||'Fehler','error');}
}

function previewBundleScope(bundleKey){
  const meta=parseBundleKey(bundleKey);
  const list=allSubs.filter(s=>s.org_id===meta.orgId && s.status==='approved_internal' && String(s.week_start||'').startsWith(String(meta.periodKey||'').slice(0,7)));
  if(!list.length){toast('Keine passenden Positionen in aktueller Liste','error');return;}
  toast(`Vorschau: ${list.length} Positionen bereit für ${meta.periodKey}`,'success');
}

async function openBundleDetail(bundleKey){
  try{
    const r=await fetch(`${AGENCY_BUNDLES_URL}/${encodeURIComponent(bundleKey)}`,{credentials:'include'});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Bundle nicht gefunden');
    currentBundleDetailItems=d.items||[];
    currentBundleDetailKey=bundleKey;
    renderBundleDetailTable();
    document.getElementById('bundleModalOverlay').classList.add('on');
    document.getElementById('bundleModal').classList.add('on');
  }catch(e){toast(e.message||'Fehler','error');}
}

function renderBundleDetailTable(){
  const q=(document.getElementById('bundleDetailSearch')?.value||'').trim().toLowerCase();
  const sort=document.getElementById('bundleDetailSort')?.value||'week_desc';
  let items=currentBundleDetailItems.slice();
  if(q){
    items=items.filter(it=>{
      const worker=`${it.first_name||''} ${it.last_name||''}`.trim();
      const hay=`${worker} ${it.worker_email||''} ${it.client_name||''} ${it.status||''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if(sort==='hours_desc') items.sort((a,b)=>Number(b.total_hours||0)-Number(a.total_hours||0));
  if(sort==='hours_asc') items.sort((a,b)=>Number(a.total_hours||0)-Number(b.total_hours||0));
  if(sort==='status') items.sort((a,b)=>String(a.status||'').localeCompare(String(b.status||'')));
  if(sort==='week_asc') items.sort((a,b)=>String(a.week_start||'').localeCompare(String(b.week_start||'')));
  if(sort==='week_desc') items.sort((a,b)=>String(b.week_start||'').localeCompare(String(a.week_start||'')));

  const rows=items.map(it=>{
    const worker=`${it.first_name||''} ${it.last_name||''}`.trim()||it.worker_email||'–';
    const used=(it.status==='posted_to_timesheet'||it.timesheet_id)?'<span class="pill pill-act">Für Abrechnung verwendet</span>':'<span class="pill pill-off">Noch offen</span>';
    return `<tr>
      <td>${esc(worker)}</td>
      <td>${esc(it.client_name||'')}</td>
      <td>${esc(fmtWeek(it.week_start,it.week_end))}</td>
      <td>${Number(it.total_hours||0).toFixed(1)} h</td>
      <td>${badge(it.status)}</td>
      <td>${used}</td>
      <td><button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="openSubmissionFromBundle('${it.id}')">Öffnen</button></td>
    </tr>`;
  }).join('');

  const body=document.getElementById('bundleModalBody');
  body.innerHTML=`
    <div style="margin-bottom:10px;font-size:.85rem;color:var(--wk-text-muted)">${esc(currentBundleDetailKey)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <input id="bundleDetailSearch" class="wk-input" placeholder="Filter Mitarbeiter/Kunde/Status…" style="max-width:280px" value="${esc(document.getElementById('bundleDetailSearch')?.value||'')}" oninput="renderBundleDetailTable()">
      <select id="bundleDetailSort" class="wk-input" style="width:180px" onchange="renderBundleDetailTable()">
        <option value="week_desc"${sort==='week_desc'?' selected':''}>Zeitraum neu→alt</option>
        <option value="week_asc"${sort==='week_asc'?' selected':''}>Zeitraum alt→neu</option>
        <option value="hours_desc"${sort==='hours_desc'?' selected':''}>Stunden hoch→niedrig</option>
        <option value="hours_asc"${sort==='hours_asc'?' selected':''}>Stunden niedrig→hoch</option>
        <option value="status"${sort==='status'?' selected':''}>Status</option>
      </select>
    </div>
    <div class="wk-table-wrap">
      <table class="wk-table">
        <thead><tr><th>Mitarbeiter</th><th>Kunde</th><th>Zeitraum</th><th>Stunden</th><th>Status</th><th>Abrechnung</th><th>Aktion</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="7">Keine Positionen</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function openSubmissionFromBundle(submissionId){
  closeBundleModal();
  await selSub(submissionId);
}

function closeBundleModal(){
  document.getElementById('bundleModalOverlay').classList.remove('on');
  document.getElementById('bundleModal').classList.remove('on');
}

function downloadBundleCsv(bundleKey){
  const url=`${AGENCY_BUNDLES_URL}/${encodeURIComponent(bundleKey)}/export.csv`;
  window.open(url,'_blank','noopener');
}

async function postBundle(bundleKey){
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_BUNDLES_URL}/${encodeURIComponent(bundleKey)}/post-to-timesheet`,{
      method:'POST',credentials:'include',headers:{'x-csrf-token':csrf}
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Bundle konnte nicht gebucht werden');
    toast(`Bundle in Abrechnung überführt (${d.processed||0})`,'success');
    await loadSubs();
  }catch(e){toast(e.message||'Fehler','error');}
}
async function selSub(id){
  selId=id;renderSubs();
  document.getElementById('detEmpty').style.display='none';
  const dc=document.getElementById('detContent');
  dc.style.display='block';
  dc.innerHTML='<div style="padding:32px"><div class="skel"></div><div class="skel" style="opacity:.6"></div></div>';
  try{
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}`,{credentials:'include'});
    renderDet(await r.json());
  }catch(e){dc.innerHTML='<div class="wk-alert wk-alert-danger"><span>??</span><span>Fehler beim Laden: '+esc(e.message)+'</span></div>';}
}
function renderDet(s){
  const st=s.status;
  const dc=document.getElementById('detContent');

  // Tageseinträge-Tabelle
  const rows=(s.entries||[]).length?`
    <table class="rev-etable">
      <thead><tr><th>Tag</th><th>Datum</th><th>Reg.</th><th>Überstd.</th><th>Pause</th><th>Von</th><th>Bis</th></tr></thead>
      <tbody>${(s.entries||[]).map(e=>`<tr>
        <td style="font-weight:600">${dayN(e.work_date)}</td>
        <td>${fmtD(e.work_date)}</td>
        <td>${parseFloat(e.hours_regular||0).toFixed(1)} h</td>
        <td style="color:${e.hours_overtime>0?'var(--wk-warning)':'inherit'}">${parseFloat(e.hours_overtime||0).toFixed(1)} h</td>
        <td>${e.break_minutes||0} min</td><td>${e.shift_start||'–'}</td><td>${e.shift_end||'–'}</td>
      </tr>`).join('')}</tbody>
    </table>`:
    '<p style="font-size:.85rem;color:var(--wk-text-muted);font-style:italic">Keine Tageseintrage vorhanden.</p>';

  // Planvergleich
  let planHtml='';
  if(s.default_shift_start||s.default_hours_per_day){
    const planH=parseFloat(s.default_hours_per_day||0);
    const actH=parseFloat(s.total_hours||0);
    const diff=(actH-planH).toFixed(1);
    const diffCls=Math.abs(diff)<=0.5?'ok':'warn';
    planHtml=`<div class="rev-stitle">Plan vs. Ist</div>
    <div class="plan-vs">
      <div class="plan-vs-item"><div class="plan-vs-label">Plan</div>
        <div class="plan-vs-val">${planH>0?planH+' h/Woche':''} ${s.default_shift_start?s.default_shift_start.substring(0,5)+' – '+s.default_shift_end?.substring(0,5)+'':''}</div>
        ${s.default_break_minutes?`<div style="font-size:.72rem;color:var(--wk-text-muted)">${s.default_break_minutes} min Pause</div>`:''}
      </div>
      <div class="plan-vs-item"><div class="plan-vs-label">Ist</div>
        <div class="plan-vs-val">${actH.toFixed(1)} h</div>
        ${planH>0?`<div class="plan-vs-diff ${diffCls}">${diff>0?'+':''}${diff} h vs. Plan</div>`:''}
      </div>
    </div>`;
  }

  // Kundeninfo + Benachrichtigungsstatus
  let custHtml='';
  if(['sent_to_customer','customer_confirmed','customer_rejected','posted_to_timesheet'].includes(st)){
    custHtml=`<div class="rev-stitle">Kundenstatus</div><div class="cust-info">`;
    if(s.customer_contact_name||s.customer_contact_email)
      custHtml+=`<div style="margin-bottom:6px;font-size:.84rem"><strong>Kundenkontakt:</strong> ${esc(s.customer_contact_name||'')}${s.customer_contact_email?` \u2013 <a href="mailto:${esc(s.customer_contact_email)}" style="color:var(--tc-link-accent)">${esc(s.customer_contact_email)}</a>`:''}</div>`;
    if(s.sent_to_customer_at)
      custHtml+=`<div style="font-size:.8rem;color:var(--wk-text-muted)">Intern gesendet: ${fmtD(s.sent_to_customer_at)}</div>`;
    // Benachrichtigungsstatus aus Events ableiten
    const notifEvent = (s.events||[]).find(e => e.event_type === 'sent_to_customer' && e.meta && e.meta.notified !== undefined);
    if (notifEvent) {
      if (notifEvent.meta.notified === true) {
        custHtml += `<div style="font-size:.8rem;color:var(--tc-tone-success-text);margin-top:4px">\u2709\uFE0F Kunde per E-Mail benachrichtigt${notifEvent.meta.customer_email ? ' an ' + esc(notifEvent.meta.customer_email) : ''} \u2013 ${relT(notifEvent.created_at)}</div>`;
      } else if (notifEvent.meta.notified === false && notifEvent.meta.reason === 'no_customer_email') {
        custHtml += `<div style="font-size:.8rem;color:var(--tc-tone-warning-text);margin-top:4px">\u26A0\uFE0F Keine Kundenkontakt-E-Mail hinterlegt \u2013 Kunde wurde nicht per E-Mail benachrichtigt.</div>`;
      } else if (notifEvent.meta.notified === false && notifEvent.meta.error) {
        custHtml += `<div style="font-size:.8rem;color:var(--tc-tone-danger-text);margin-top:4px">\u274C E-Mail-Versand fehlgeschlagen: ${esc(notifEvent.meta.error)}</div>`;
      }
    } else if (!s.customer_contact_email) {
      custHtml += `<div style="font-size:.8rem;color:var(--wk-text-muted);margin-top:4px;font-style:italic">Kein Kundenkontakt hinterlegt.</div>`;
    }
    if(st==='customer_confirmed'&&s.customer_confirmed_at)
      custHtml+=`<div style="font-size:.8rem;color:var(--wk-success);margin-top:4px">\u2705 Best\u00e4tigt: ${fmtD(s.customer_confirmed_at)}${s.customer_confirmed_by?` durch ${esc(s.customer_confirmed_by)}`:''}</div>`;
    if(st==='customer_rejected'&&s.customer_rejected_at)
      custHtml+=`<div style="font-size:.8rem;color:var(--wk-warning);margin-top:4px">\u274C Abgelehnt: ${fmtD(s.customer_rejected_at)}</div>`;
    if(s.customer_note)
      custHtml+=`<div style="margin-top:8px;font-size:.83rem"><strong>Kundennotiz:</strong> ${esc(s.customer_note)}</div>`;
    custHtml+=`</div>`;
  }

  // Ereignis-Log
  const evs=(s.events||[]).slice(0,8).map(e=>`
    <div class="ev-row"><div class="ev-dot ${evClr(e.event_type)}"></div>
      <div style="flex:1"><span style="font-weight:600">${esc(e.actor_email||'System')}</span> ${evLbl(e.event_type)}</div>
      <div style="color:var(--wk-text-muted);font-size:.76rem;flex-shrink:0">${relT(e.created_at)}</div>
    </div>`).join('');

  // Aktionen je Status
  const _isOpen=['submitted','under_review','approved_internal','sent_to_customer','customer_confirmed','customer_rejected'].includes(st);
  let actHtml='';
  if(st==='submitted'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-outline" onclick="doAct('review','${s.id}')">? Prüfung starten</button>
    </div>`;
  } else if(st==='under_review'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-success" onclick="doAct('approve','${s.id}')">? Intern genehmigen</button>
      <button class="wk-btn wk-btn-ghost" onclick="togNote('corr')">? Korrektur</button>
      <button class="wk-btn wk-btn-danger" onclick="togNote('rej')" style="flex:0 0 auto">?</button>
    </div>
    <div id="nb-corr" class="rev-notebox">
      <label class="wk-label">Korrekturhinweis <span class="required">*</span></label>
      <textarea class="wk-textarea" id="nt-corr" rows="2" placeholder="Was soll der Mitarbeiter korrigieren?"></textarea>
      <button class="wk-btn wk-btn-outline wk-btn-sm" style="margin-top:8px" onclick="doAct('request-correction','${s.id}')">Korrektur anfordern</button>
    </div>
    <div id="nb-rej" class="rev-notebox">
      <label class="wk-label">Ablehnungsgrund</label>
      <textarea class="wk-textarea" id="nt-rej" rows="2" placeholder="Warum wird abgelehnt?"></textarea>
      <button class="wk-btn wk-btn-danger wk-btn-sm" style="margin-top:8px" onclick="doAct('reject','${s.id}')">Ablehnen</button>
    </div>`;
  } else if(st==='approved_internal'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-primary" onclick="togNote('send')">?? An Kunden senden</button>
      <button class="wk-btn wk-btn-success" onclick="doAct('post-to-timesheet','${s.id}')">? Direkt in Abrechnung</button>
    </div>
    <div id="nb-send" class="rev-notebox">
      <label class="wk-label">Kundenkontakt Name</label>
      <input class="wk-input" id="nt-cname" placeholder="Max Meier" style="margin-bottom:8px" value="${esc(s.customer_contact_name||'')}">
      <label class="wk-label">Kundenkontakt E-Mail</label>
      <input class="wk-input" id="nt-cemail" type="email" placeholder="kunde@firma.de" style="margin-bottom:8px" value="${esc(s.customer_contact_email||'')}">
      <label class="wk-label">Notiz (optional)</label>
      <textarea class="wk-textarea" id="nt-cnote" rows="2" placeholder="Interne Notiz…"></textarea>
      <button class="wk-btn wk-btn-primary wk-btn-sm" style="margin-top:8px" onclick="doActSend('${s.id}')">Senden</button>
    </div>`;
  } else if(st==='sent_to_customer'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-success" onclick="togNote('cconf')">? Kunde hat bestätigt</button>
      <button class="wk-btn wk-btn-ghost"   onclick="togNote('crej')">? Kunde hat abgelehnt</button>
    </div>
    <div id="nb-cconf" class="rev-notebox">
      <label class="wk-label">Bestätigt durch</label>
      <input class="wk-input" id="nt-confby" placeholder="Name Ansprechpartner" style="margin-bottom:8px">
      <label class="wk-label">Notiz (optional)</label>
      <textarea class="wk-textarea" id="nt-confnote" rows="2"></textarea>
      <button class="wk-btn wk-btn-success wk-btn-sm" style="margin-top:8px" onclick="doActConf('${s.id}')">Bestätigung erfassen</button>
    </div>
    <div id="nb-crej" class="rev-notebox">
      <label class="wk-label">Grund / Notiz</label>
      <textarea class="wk-textarea" id="nt-rejnote" rows="2" placeholder="Warum hat der Kunde abgelehnt?"></textarea>
      <button class="wk-btn wk-btn-ghost wk-btn-sm" style="margin-top:8px" onclick="doActCRej('${s.id}')">Ablehnung erfassen</button>
    </div>`;
  } else if(st==='customer_confirmed'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-success" onclick="doAct('post-to-timesheet','${s.id}')">? In Abrechnung buchen</button>
    </div>`;
  } else if(st==='customer_rejected'){
    actHtml=`<div class="rev-actions">
      <button class="wk-btn wk-btn-outline" onclick="doAct('review','${s.id}')">? Zurück zur Prüfung</button>
    </div>`;
  }

  const terminal=['rejected','accepted_into_timesheet','posted_to_timesheet','superseded'].includes(st);

  dc.innerHTML=`
    <div class="rev-dhead">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="rev-dname">${esc(s.first_name||'')} ${esc(s.last_name||'')}${s.personnel_number?` <span style="font-weight:400;font-size:.85rem;color:var(--wk-text-muted)">– ${esc(s.personnel_number)}</span>`:''}</div>
          <div class="rev-dmeta">${esc(s.worker_email||'')} – ${fmtWeek(s.week_start,s.week_end)}</div>
          ${s.client_name||s.org_name?`<div style="font-size:.8rem;color:var(--wk-text-muted);margin-top:2px">Einsatz bei: <strong>${esc(s.client_name||s.org_name)}</strong></div>`:''}
        </div>${badge(st)}
      </div>
      <div class="rev-stats">
        <div><div class="rev-stat-label">Gesamtstunden</div><div class="rev-stat-val" style="color:var(--hub-accent)">${parseFloat(s.total_hours||0).toFixed(1)} h</div></div>
        <div><div class="rev-stat-label">Überstunden</div><div class="rev-stat-val" style="color:${s.overtime_hours>0?'var(--wk-warning)':'var(--wk-text-muted)'}">${parseFloat(s.overtime_hours||0).toFixed(1)} h</div></div>
        ${s.submitted_at?`<div><div class="rev-stat-label">Eingereicht</div><div style="font-size:.85rem;margin-top:2px">${fmtD(s.submitted_at)}</div></div>`:''}
        ${s.approved_internal_at?`<div><div class="rev-stat-label">Int. Geprüft</div><div style="font-size:.85rem;margin-top:2px">${fmtD(s.approved_internal_at)}</div></div>`:''}
        ${s.posted_to_timesheet_at?`<div><div class="rev-stat-label">In Abrechnung</div><div style="font-size:.85rem;margin-top:2px">${fmtD(s.posted_to_timesheet_at)}</div></div>`:''}
      </div>
      ${s.worker_comment?`<div class="rev-cbox wkr"><strong>Arbeitnehmer:</strong> ${esc(s.worker_comment)}</div>`:''}
      ${s.reviewer_comment||s.correction_note?`<div class="rev-cbox rev"><strong>Prüfhinweis:</strong> ${esc(s.reviewer_comment||s.correction_note)}</div>`:''}
    </div>
    ${planHtml}
    <div class="rev-stitle">Tageseinträge</div>${rows}
    ${custHtml}
    ${evs?`<div class="rev-stitle">Verlauf</div>${evs}`:''}
    ${actHtml}
    ${terminal?`<div class="wk-alert wk-alert-info" style="margin-top:16px"><span>??</span><span>Abgeschlossen – ${stLbl(st)}</span></div>`:''}
    ${s.timesheet_id||s.posted_to_timesheet_at?`<div class="wk-alert wk-alert-success" style="margin-top:10px"><span>?</span><span>Stundenzettel gebucht${s.timesheet_id?` – <a href="timesheets.html" style="color:inherit;font-weight:600">In Stundenzettel-Verwaltung ?</a>`:''}</span></div>`:''}`;
}
function togNote(t){
  // Alle anderen Noteboxen schließen
  document.querySelectorAll('.rev-notebox').forEach(b=>b.classList.remove('on'));
  const b=document.getElementById('nb-'+t);if(b)b.classList.toggle('on');
}

// Generische Action: review, approve, request-correction, reject, post-to-timesheet
async function doAct(action,id){
  let body={};
  if(action==='request-correction'){const v=document.getElementById('nt-corr')?.value?.trim();if(!v){toast('Bitte Korrekturhinweis eingeben','error');return;}body={note:v};}
  if(action==='reject'){const v=document.getElementById('nt-rej')?.value?.trim();body={note:v||''};}

  // Route-Mapping: alte agency-Endpunkte
  const routeMap={
    'review':          'start-review',
    'approve':         'approve',
    'request-correction':'request-correction',
    'reject':          'reject',
    'post-to-timesheet':'post-to-timesheet'
  };
  const route=routeMap[action]||action;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}/${route}`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||d.message||'Fehler');
    const lbls={'review':'? Prüfung gestartet','approve':'? Intern genehmigt',
                 'request-correction':'? Korrektur angefordert','reject':'? Abgelehnt',
                 'post-to-timesheet':'? In Abrechnung gebucht'};
    toast(lbls[action]||'OK','success');
    await loadSubs();await selSub(id);
  }catch(e){toast(e.message||'Fehler','error');}
}

// An Kunden senden
async function doActSend(id){
  const cname=document.getElementById('nt-cname')?.value?.trim()||null;
  const cemail=document.getElementById('nt-cemail')?.value?.trim()||null;
  const cnote=document.getElementById('nt-cnote')?.value?.trim()||null;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}/send-to-customer`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({customer_contact_name:cname,customer_contact_email:cemail,note:cnote})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Fehler');
    const notifMsg = d.customer_notified ? '\u2709\uFE0F An Kunden gesendet und per E-Mail benachrichtigt' : '\u26A0\uFE0F An Kunden gesendet (keine E-Mail-Adresse hinterlegt)';
    toast(notifMsg, d.customer_notified ? 'success' : 'warning');await loadSubs();await selSub(id);
  }catch(e){toast(e.message||'Fehler','error');}
}

// Kundenbestätigung
async function doActConf(id){
  const by=document.getElementById('nt-confby')?.value?.trim()||null;
  const note=document.getElementById('nt-confnote')?.value?.trim()||null;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}/customer-confirm`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({customer_confirmed_by:by,note})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Fehler');
    toast('? Kundenbestätigung erfasst','success');await loadSubs();await selSub(id);
  }catch(e){toast(e.message||'Fehler','error');}
}

// Kundenablehnung
async function doActCRej(id){
  const note=document.getElementById('nt-rejnote')?.value?.trim()||null;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${AGENCY_SUBS_URL}/${id}/customer-reject`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({reason:note})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Fehler');
    toast('? Kundenablehnung erfasst','success');await loadSubs();await selSub(id);
  }catch(e){toast(e.message||'Fehler','error');}
}

/* WORKERS */
async function loadWrks(){
  if(!pageAccess.tabs.wrks){
    wrksLoaded=true;
    setPanelNotice(
      'wrksStateNotice',
      'Kein Zugriff auf Einsatzkraefte.',
      'Der Bereich ist fuer Ihren aktuellen Organisationskontext nicht freigeschaltet.',
      'info'
    );
    toggleElement('ldWrks',false);
    toggleElement('ctWrks',false);
    return;
  }

  setPanelNotice('wrksStateNotice','','');
  setPanelNotice(
    'wrksManageNotice',
    pageAccess.permissions.workerManage?'':'Ansicht mit Teilzugriff.',
    pageAccess.permissions.workerManage?'':'Einladungen und Pflegeaktionen sind fuer Ihre aktuelle Rolle nicht freigeschaltet.',
    'info'
  );
  toggleElement('ldWrks',true,'block');
  toggleElement('ctWrks',false);
  document.getElementById('wkEmpty').style.display='none';

  try{
    const workersPayload=await fetchJson(`${API}/workers`);
    let invitePayload={ items:[] };
    let inviteError=null;
    if(pageAccess.permissions.workerManage){
      try{
        invitePayload=await fetchJson(`${API}/worker-invites`);
      }catch(error){
        inviteError=error;
      }
    }

    allWrks=workersPayload.items||workersPayload.workers||[];
    allInvs=invitePayload.items||invitePayload.invites||[];
    setWrkKpis();
    toggleElement('ldWrks',false);
    toggleElement('ctWrks',true);
    renderWrks();
    renderInvs();
    wrksLoaded=true;
    document.getElementById('tc-wrks').textContent=String(allWrks.length||0);
    if(inviteError){
      setPanelNotice(
        'wrksManageNotice',
        isAccessDeniedError(inviteError)?'Ansicht mit Teilzugriff.':'Einladungen konnten nicht geladen werden.',
        isAccessDeniedError(inviteError)
          ? 'Einladungen und Pflegeaktionen sind fuer Ihre aktuelle Rolle nicht freigeschaltet.'
          : (inviteError?.message||'Bitte spaeter erneut versuchen.'),
        isAccessDeniedError(inviteError)?'info':'warning'
      );
    }
  }catch(error){
    if(isTransientError(error)){
      toggleElement('ldWrks',false);
      return;
    }
    allWrks=[];
    allInvs=[];
    wrksLoaded=true;
    document.getElementById('tc-wrks').textContent='–';
    toggleElement('ldWrks',false);
    toggleElement('ctWrks',false);
    setPanelNotice(
      'wrksStateNotice',
      isAccessDeniedError(error)?'Kein Zugriff auf Einsatzkraefte.':'Einsatzkraefte konnten nicht geladen werden.',
      isAccessDeniedError(error)
        ? 'Der Bereich ist fuer Ihren aktuellen Organisationskontext nicht freigeschaltet.'
        : (error?.message||'Bitte spaeter erneut versuchen.'),
      isAccessDeniedError(error)?'info':'danger'
    );
  }
}
function setWrkKpis(){
  const act=allWrks.filter(w=>w.is_active!==false).length;
  const off=allWrks.filter(w=>w.is_active===false).length;
  const pnd=allInvs.filter(i=>i.status==='pending').length;
  document.getElementById('kw1').textContent=act;
  document.getElementById('kw2').textContent=pageAccess.permissions.workerManage?pnd:'–';
  document.getElementById('kw3').textContent=off;
  document.getElementById('kw4').textContent=allWrks.length;
}
function filterW(){renderWrks(document.getElementById('wSearch').value.trim().toLowerCase());}
function renderWrks(q=''){
  const tb=document.getElementById('wkTbody'),emp=document.getElementById('wkEmpty');
  let list=allWrks;
  if(q)list=list.filter(w=>`${w.first_name} ${w.last_name} ${w.email||''} ${w.personnel_number||''}`.toLowerCase().includes(q));
  if(!list.length){tb.innerHTML='';emp.style.display='block';return;}
  emp.style.display='none';
  const canManage=pageAccess.permissions.workerManage;
  const canOpenAssignments=pageAccess.tabs.asgn;
  const canDirectAssign=pageAccess.permissions.workerEdit;
  tb.innerHTML=list.map(w=>{
    const ini=`${(w.first_name||'?')[0]}${(w.last_name||'?')[0]}`.toUpperCase();
    const act=w.is_active!==false;
    const actions=[];
    if(canDirectAssign&&act){
      actions.push(`<button class="wk-btn wk-btn-primary wk-btn-sm" onclick="openWorkerAssignDrw('${w.id||w.user_id}')">Einsatz zuweisen</button>`);
    }
    if(canOpenAssignments){
      actions.push(`<button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="viewWorkerLinks('${w.id||w.user_id}')">&#9881; Einsätze</button>`);
    }
    if(canManage){
      actions.push(
        act
          ? `<button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="togWrk('${w.id||w.user_id}',false)">Deaktivieren</button>`
          : `<button class="wk-btn wk-btn-outline wk-btn-sm" onclick="togWrk('${w.id||w.user_id}',true)">Aktivieren</button>`
      );
    }
    return `<tr>
      <td><div class="wk-namecell"><div class="wk-avatar" style="${aColor(w.first_name+w.last_name)}">${ini}</div>
        <div><div class="wk-nname">${esc(w.first_name||'')} ${esc(w.last_name||'')}</div>
          <div class="wk-nemail">${esc(w.email||'')}</div></div></div></td>
      <td><span style="font-size:.82rem;font-family:monospace;color:var(--wk-text-muted)">${esc(w.personnel_number||'–')}</span></td>
      <td><span class="pill ${act?'pill-act':'pill-off'}">${act?'Aktiv':'Inaktiv'}</span></td>
      <td style="font-size:.82rem;color:var(--wk-text-muted)">${w.created_at?fmtD(w.created_at):'–'}</td>
      <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
        ${actions.join('')}
      </div></td></tr>`;
  }).join('');
}
function renderInvs(){
  const sec=document.getElementById('invSection'),lst=document.getElementById('invList');
  if(!pageAccess.permissions.workerManage){
    sec.style.display='none';
    lst.innerHTML='';
    return;
  }
  const pnd=allInvs.filter(i=>i.status==='pending');
  if(!pnd.length){sec.style.display='none';return;}
  sec.style.display='block';
  lst.innerHTML=pnd.map(inv=>`
    <div class="inv-item">
      <div class="inv-ava">?</div>
      <div class="inv-info">
        <div class="inv-name">${esc(inv.first_name||'')} ${esc(inv.last_name||'')} ${inv.email?`<span style="font-weight:400;color:var(--wk-text-muted)">– ${esc(inv.email)}</span>`:''}
        </div>
        <div class="inv-meta">Eingeladen ${inv.created_at?relT(inv.created_at):''} – läuft ab ${inv.expires_at?fmtD(inv.expires_at):'–'}</div>
      </div>
      <span class="pill pill-pnd">Ausstehend</span>
      <div class="inv-acts">
        <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="resendInv('${inv.id}')">? Erneut</button>
        <button class="wk-btn wk-btn-ghost wk-btn-sm" style="color:var(--wk-danger)" onclick="revokeInv('${inv.id}')">?</button>
      </div>
    </div>`).join('');
}
async function togWrk(id,act){
  if(!ensurePermission('workerManage','Sie koennen Einsatzkraefte sehen, aber nicht aktivieren oder deaktivieren.'))return;
  try{
    const csrf=await getCsrf();
    const endpoint=act?`${API}/workers/${id}/activate`:`${API}/workers/${id}/deactivate`;
    const r=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'x-csrf-token':csrf}});
    if(!r.ok)throw new Error('Fehler');
    toast(act?'Aktiviert':'Deaktiviert','success');wrksLoaded=false;await loadWrks();
  }catch(e){toast(e.message,'error');}
}
async function resendInv(id){
  if(!ensurePermission('workerManage','Sie koennen Einladungen fuer Einsatzkraefte nicht verwalten.'))return;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/worker-invites/${id}/resend`,{method:'POST',credentials:'include',headers:{'x-csrf-token':csrf}});if(!r.ok)throw new Error('Fehler');toast('Einladung erneut gesendet ?','success');
  }catch(e){toast(e.message,'error');}
}
async function revokeInv(id){
  if(!ensurePermission('workerManage','Sie koennen Einladungen fuer Einsatzkraefte nicht verwalten.'))return;
  if(!confirm('Einladung wirklich widerrufen?'))return;
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/worker-invites/${id}/revoke`,{method:'POST',credentials:'include',headers:{'x-csrf-token':csrf}});if(!r.ok)throw new Error('Fehler');toast('Einladung widerrufen','success');wrksLoaded=false;await loadWrks();
  }catch(e){toast(e.message,'error');}
}

/* MAILPIT (dev only) */
if(['localhost','127.0.0.1'].includes(location.hostname)){
  const mp=document.getElementById('mailpitLink');
  if(mp){mp.style.display='';mp.href=location.protocol+'//'+location.hostname+':8025';}
}

/* DRAWER: Einladen */
function openDrw(){
  if(!ensurePermission('workerManage','Sie koennen Einsatzkraefte sehen, aber keine Einladungen versenden.'))return;
  document.getElementById('drwOvl').classList.add('on');
  document.getElementById('drw').classList.add('on');
  document.getElementById('invErr').style.display='none';
  ['ifn','iln','iem','ipn','iph'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  setTimeout(()=>document.getElementById('ifn').focus(),250);
}
function closeDrw(){document.getElementById('drwOvl').classList.remove('on');document.getElementById('drw').classList.remove('on');}
async function sendInv(){
  if(!ensurePermission('workerManage','Sie koennen Einsatzkraefte sehen, aber keine Einladungen versenden.'))return;
  const fn=document.getElementById('ifn').value.trim();
  const ln=document.getElementById('iln').value.trim();
  const em=document.getElementById('iem').value.trim();
  const pn=document.getElementById('ipn').value.trim();
  const ph=document.getElementById('iph').value.trim();
  const err=document.getElementById('invErr');
  if(!fn||!ln||!em){err.textContent='Bitte Vorname, Nachname und E-Mail ausfüllen.';err.style.display='block';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){err.textContent='Bitte eine gültige E-Mail-Adresse eingeben.';err.style.display='block';return;}
  const btn=document.getElementById('invBtn');btn.disabled=true;btn.textContent='Wird gesendet…';err.style.display='none';
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/worker-invites`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify({first_name:fn,last_name:ln,email:em,personnel_number:pn||undefined,phone:ph||undefined})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||d.message||'Fehler');
    toast(`Einladung an ${fn} ${ln} gesendet ?`,'success');closeDrw();wrksLoaded=false;await loadWrks();
  }catch(e){err.textContent=e.message;err.style.display='block';}
  finally{btn.disabled=false;btn.textContent='Einladung senden ?';}
}


/* CREATE WORKER DRAWER */
function openCreateDrw(){
  if(!ensurePermission('workerCreate','Sie koennen Einsatzkraefte nicht neu anlegen.'))return;
  document.getElementById('crtDrwOvl').classList.add('on');
  document.getElementById('crtDrw').classList.add('on');
  document.getElementById('crtErr').style.display='none';
  ['cfn','cln','cem','cpw','cpn','cph','cst','cplz','cci'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  setTimeout(()=>document.getElementById('cfn').focus(),250);
}
function closeCreateDrw(){document.getElementById('crtDrwOvl').classList.remove('on');document.getElementById('crtDrw').classList.remove('on');}
async function submitCreate(){
  if(!ensurePermission('workerCreate','Sie koennen Einsatzkraefte nicht neu anlegen.'))return;
  const fn=document.getElementById('cfn').value.trim();
  const ln=document.getElementById('cln').value.trim();
  const em=document.getElementById('cem').value.trim();
  const pw=document.getElementById('cpw').value;
  const err=document.getElementById('crtErr');
  if(!fn||!ln||!em||!pw){err.textContent='Bitte Vorname, Nachname, E-Mail und Passwort ausfüllen.';err.style.display='block';return;}
  if(pw.length<8){err.textContent='Passwort muss mindestens 8 Zeichen haben.';err.style.display='block';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){err.textContent='Bitte eine gültige E-Mail-Adresse eingeben.';err.style.display='block';return;}
  const btn=document.getElementById('crtBtn');btn.disabled=true;btn.textContent='Wird angelegt…';err.style.display='none';
  try{
    const csrf=await getCsrf();
    const body={first_name:fn,last_name:ln,email:em,password:pw};
    const pn=document.getElementById('cpn').value.trim();if(pn)body.personnel_number=pn;
    const ph=document.getElementById('cph').value.trim();if(ph)body.phone=ph;
    const st=document.getElementById('cst').value.trim();if(st)body.street=st;
    const plz=document.getElementById('cplz').value.trim();if(plz)body.postal_code=plz;
    const ci=document.getElementById('cci').value.trim();if(ci)body.city=ci;
    const r=await fetch(`${API}/workers`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){const eMsg=d.error==='EMAIL_EXISTS'?'Diese E-Mail-Adresse existiert bereits.':(typeof d.error==='string'?d.error:d.error?.message||d.message||'Fehler');throw new Error(eMsg);}
    toast(`Mitarbeiter ${fn} ${ln} angelegt ?`,'success');closeCreateDrw();wrksLoaded=false;await loadWrks();
  }catch(e){err.textContent=e.message;err.style.display='block';}
  finally{btn.disabled=false;btn.textContent='Mitarbeiter anlegen ?';}
}

/* WORKER DIRECT ASSIGNMENT DRAWER */
function renderWorkerAssignWorkerSummary(worker){
  const metrics=[
    { label:'Aktive Einsätze', value:Number(worker?.active_assignments||0) },
    { label:'Skills', value:Number(worker?.skill_count||0) },
    { label:'Qualifikationen', value:Number(worker?.qualification_count||0) },
    { label:'Dokumente', value:Number(worker?.document_count||0) }
  ];
  const metricHtml=metrics.map((item)=>`
    <div style="padding:10px 12px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <div style="font-size:11px;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">${esc(item.label)}</div>
      <div style="font-size:18px;font-weight:800;margin-top:4px">${esc(String(item.value))}</div>
    </div>
  `).join('');
  const expiredDocs=Number(worker?.expired_document_count||0);
  const expiringSoon=Number(worker?.expiring_soon_document_count||0);
  return `
    <div style="padding:12px 14px;border:1px solid var(--tc-tone-neutral-border);border-radius:12px;background:var(--tc-surface-emphasis);margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="min-width:0">
          <div style="font-size:15px;font-weight:800">${esc(`${worker?.first_name||''} ${worker?.last_name||''}`.trim()||worker?.email||'Worker')}</div>
          <div style="font-size:12px;color:var(--wk-text-muted);margin-top:4px">
            ${esc(worker?.email||'Keine E-Mail hinterlegt')}${worker?.personnel_number?` · ${esc(worker.personnel_number)}`:''}
          </div>
        </div>
        <span class="pill ${worker?.is_active!==false?'pill-act':'pill-off'}">${worker?.is_active!==false?'Aktiv':'Inaktiv'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:12px">
        ${metricHtml}
      </div>
      ${worker?.availability_note?`<div style="font-size:12px;color:var(--wk-text-muted);margin-top:12px"><strong style="color:var(--wk-text)">Verfügbarkeitsnotiz:</strong> ${esc(worker.availability_note)}</div>`:''}
      ${(expiredDocs>0||expiringSoon>0||worker?.next_document_expiry)?`
        <div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:${expiredDocs>0?'var(--tc-tone-warning-bg-strong)':'var(--tc-tone-brand-bg)'};color:${expiredDocs>0?'var(--tc-tone-warning-strong-text)':'var(--tc-tone-brand-text)'}">
          ${expiredDocs>0
            ? `<strong>${expiredDocs} Dokument${expiredDocs===1?'':'e'} abgelaufen.</strong>`
            : `<strong>Dokumentenlage im Blick behalten.</strong>`}
          ${expiringSoon>0?` ${expiringSoon} Nachweis${expiringSoon===1?'':'e'} laufen bald ab.`:''}
          ${worker?.next_document_expiry?` Nächster Ablauf: ${esc(fmtD(worker.next_document_expiry))}.`:''}
        </div>
      `:''}
    </div>
  `;
}

function workerAssignmentDecisionConfig(suggestion){
  if(!suggestion){
    return { cls:'pill-off', label:'Kontext fehlt' };
  }
  if(suggestion.quick_assign_eligible){
    return { cls:'pill-act', label:'Safe Case' };
  }
  if(suggestion.is_selectable){
    return { cls:'pill-warn', label:'Manuelle Prüfung' };
  }
  return { cls:'pill-danger', label:'Blockiert' };
}

function workerAssignmentPeopleText(items,fallbackText){
  const people=(Array.isArray(items)?items:[])
    .map((entry)=>`${entry?.first_name||''} ${entry?.last_name||''}`.trim()||entry?.worker_email||entry?.worker_user_id||'Worker')
    .filter(Boolean);
  if(!people.length)return fallbackText;
  const visible=people.slice(0,3).map((name)=>esc(name)).join(', ');
  return people.length>3?`${visible} +${people.length-3}`:visible;
}

function buildWorkerAssignmentManualConfirmMessage(worker,assignment,suggestion,choiceSets){
  const lines=[
    `Worker: ${(`${worker?.first_name||''} ${worker?.last_name||''}`).trim()||worker?.email||'Worker'}`,
    `Einsatz: ${assignment?.worker_description||assignment?.request_title||'Deal-Einsatz'}`
  ];
  const warnings=[];
  const blockerText=staffingCriteriaText(suggestion?.quick_assign_blockers);
  const missingText=staffingCriteriaText(suggestion?.missing_requirements);
  const hardFailText=staffingCriteriaText(suggestion?.hard_failures);
  if(blockerText)warnings.push(`Hinweise: ${blockerText}`);
  if(missingText)warnings.push(`Fehlende Anforderungen: ${missingText}`);
  if(hardFailText)warnings.push(`Blocker: ${hardFailText}`);
  if(choiceSets.length){
    warnings.push(`Aktive Auswahlphase: ${choiceSets.map((choiceSet)=>`${choiceSet.title||'Auswahlphase'} (${staffingChoiceSetStatusLabel(choiceSet.status)})`).join(', ')}`);
  }
  if(suggestion?.has_open_invite)warnings.push('Für diesen Einsatz läuft bereits eine offene Staffing-Anfrage.');
  if(suggestion?.already_contacted)warnings.push('Der Worker wurde für diesen Einsatz bereits kontaktiert.');
  return `${lines.join('\n')}${warnings.length?`\n\nBitte prüfen:\n- ${warnings.join('\n- ')}\n\nJetzt manuell zuweisen?`:'\n\nJetzt manuell zuweisen?'}`;
}

function renderWorkerAssignCardBody(assignment,cardState){
  if(cardState.loading){
    return '<div style="margin-top:12px;padding:12px;color:var(--wk-text-muted);font-size:12px;border-top:1px solid var(--tc-tone-neutral-border)">Lade Einsatz-, Konflikt- und Staffing-Kontext…</div>';
  }
  if(cardState.error){
    return `
      <div style="margin-top:12px;border-top:1px solid var(--tc-tone-neutral-border);padding-top:12px">
        <div class="wk-alert wk-alert-danger"><span>&#9888;</span><span>${esc(cardState.error)}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="refreshWorkerAssignmentCardContext('${assignment.assignment_id}')">Erneut laden</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="openWorkerAssignmentInStaffingTab('${assignment.assignment_id}')">Zur Einsatzkarte</button>
        </div>
      </div>
    `;
  }
  const detail=cardState.detail||{};
  const detailAssignment=detail.assignment||assignment;
  const requirements=detail.requirements||{};
  const suggestion=cardState.suggestion;
  const choiceSets=(detail.choice_sets||[]).filter((choiceSet)=>choiceSet.worker_user_id===workerAssignmentDrawerState.workerId);
  const requested=Number(detailAssignment.requested_quantity||detailAssignment.worker_count||assignment.requested_quantity||assignment.worker_count||1);
  const filled=Number(detailAssignment.filled_quantity||assignment.filled_quantity||0);
  const reserved=Number(detailAssignment.reserved_quantity||assignment.reserved_quantity||0);
  const open=Number(detailAssignment.open_quantity||assignment.open_quantity||Math.max(requested-filled-reserved,0));
  const fitText=staffingFactorText(suggestion?.factor_scores)||staffingReasonText(suggestion?.match_reasons);
  const hardFailText=staffingCriteriaText(suggestion?.hard_failures);
  const missingText=staffingCriteriaText(suggestion?.missing_requirements);
  const blockerText=staffingCriteriaText(suggestion?.quick_assign_blockers);
  const signals=[];
  if(Number(suggestion?.conflict_count||0)>0)signals.push(`${Number(suggestion.conflict_count)} Einsatzkonflikt${Number(suggestion.conflict_count)===1?'':'e'}`);
  if(Number(suggestion?.reservation_conflict_count||0)>0)signals.push(`${Number(suggestion.reservation_conflict_count)} Reservierungskonflikt${Number(suggestion.reservation_conflict_count)===1?'':'e'}`);
  if(Number(suggestion?.current_reservation_count||0)>0)signals.push(`${Number(suggestion.current_reservation_count)} aktive Reservierung${Number(suggestion.current_reservation_count)===1?'':'en'} auf diesem Einsatz`);
  if(suggestion?.has_open_invite)signals.push('Offene Staffing-Anfrage läuft bereits');
  if(suggestion?.already_contacted)signals.push('Worker wurde hier bereits kontaktiert');
  if(Number(suggestion?.same_client_assignment_count||0)>0)signals.push(`${Number(suggestion.same_client_assignment_count)} frühere Einsätze beim selben Kunden`);
  if(choiceSets.length)signals.push(`${choiceSets.length} aktive Auswahlphase${choiceSets.length===1?'':'n'} für diesen Worker`);
  const canQuickAssign=!!(suggestion&&suggestion.quick_assign_eligible&&open>0);
  const canManualAssign=!!(suggestion&&suggestion.is_selectable&&open>0);
  return `
    <div style="margin-top:12px;border-top:1px solid var(--tc-tone-neutral-border);padding-top:12px;display:grid;gap:12px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
        <div style="padding:10px 12px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
          <div style="font-size:11px;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">Einsatzkontext</div>
          <div style="display:grid;gap:6px;margin-top:8px;font-size:12px">
            <div><strong>Rolle:</strong> ${esc(requirements.role||detailAssignment.worker_description||assignment.request_title||'Deal-Einsatz')}</div>
            <div><strong>Kunde:</strong> ${esc(detailAssignment.client_org_name||assignment.client_org_name||'Nicht angegeben')}</div>
            <div><strong>Zeitraum:</strong> ${esc(detailAssignment.start_date?`${fmtD(detailAssignment.start_date)}${detailAssignment.planned_end_date?` – ${fmtD(detailAssignment.planned_end_date)}`:' – offen'}`:'Nicht angegeben')}</div>
            <div><strong>Ort:</strong> ${esc(requirements.location_city||assignment.demand_location_city||'Nicht angegeben')}</div>
            <div><strong>Schicht:</strong> ${esc(requirements.shift_model||'Nicht angegeben')}</div>
            <div><strong>Slots:</strong> ${filled} besetzt · ${reserved} reserviert · ${open} offen von ${requested}</div>
          </div>
        </div>
        <div style="padding:10px 12px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
          <div style="font-size:11px;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">Worker-Prüfung</div>
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
            <div style="font-size:13px;font-weight:700">${esc(suggestion?`Score ${Number(suggestion.total_score||suggestion.score||0)}`:'Noch kein Match-Kontext')}</div>
            <span class="pill ${workerAssignmentDecisionConfig(suggestion).cls}">${esc(workerAssignmentDecisionConfig(suggestion).label)}</span>
          </div>
          <div style="font-size:12px;color:var(--wk-text-muted);margin-top:8px">${esc(fitText||'Der Worker-Kontext wird nur für diese konkrete Einsatzoption bewertet.')}</div>
          ${signals.length?`<div style="font-size:11px;color:var(--wk-text-muted);margin-top:8px"><strong style="color:var(--wk-text)">Operative Signale:</strong> ${esc(signals.join(' · '))}</div>`:''}
          ${hardFailText?`<div style="font-size:11px;color:var(--tc-tone-danger-text);margin-top:8px"><strong>Blocker:</strong> ${esc(hardFailText)}</div>`:''}
          ${missingText?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:6px"><strong>Fehlende Anforderungen:</strong> ${esc(missingText)}</div>`:''}
          ${blockerText&&!hardFailText?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:6px"><strong>Safe-Case-Hinweise:</strong> ${esc(blockerText)}</div>`:''}
        </div>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
        <div style="font-size:11px;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">Laufender Staffing-Status</div>
        <div style="display:grid;gap:6px;margin-top:8px;font-size:12px">
          <div><strong>Bereits zugewiesen:</strong> ${workerAssignmentPeopleText(detail.current_workers,'Noch niemand final zugewiesen')}</div>
          <div><strong>Reserviert:</strong> ${workerAssignmentPeopleText((detail.reservations||[]).filter((entry)=>entry.status==='reserved'),'Keine aktiven Reservierungen')}</div>
          <div><strong>Auswahlphasen für diesen Worker:</strong> ${choiceSets.length?esc(choiceSets.map((choiceSet)=>`${choiceSet.title||'Auswahlphase'} (${staffingChoiceSetStatusLabel(choiceSet.status)})`).join(' · ')):'Keine aktive Auswahlphase'}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="refreshWorkerAssignmentCardContext('${assignment.assignment_id}')">Aktualisieren</button>
        ${canQuickAssign?`<button class="wk-btn wk-btn-success wk-btn-sm" onclick="quickAssignWorkerFromDrawer('${assignment.assignment_id}')">Sicher direkt zuweisen</button>`:''}
        <button class="wk-btn ${(canQuickAssign||!canManualAssign)?'wk-btn-ghost':'wk-btn-primary'} wk-btn-sm" ${canManualAssign?'':'disabled'} onclick="manualAssignWorkerFromDrawer('${assignment.assignment_id}')">${canQuickAssign?'Manuell zuweisen':(canManualAssign?'Trotz Hinweis manuell zuweisen':'Manuell nicht möglich')}</button>
        <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="openWorkerAssignmentInStaffingTab('${assignment.assignment_id}')">Zur Einsatzkarte</button>
      </div>
    </div>
  `;
}

function renderWorkerAssignCard(assignment,worker){
  const cardState=getWorkerAssignmentDrawerCardState(assignment.assignment_id);
  const expanded=workerAssignmentDrawerState.activeAssignmentId===assignment.assignment_id;
  const requested=Number(assignment.requested_quantity||assignment.worker_count||1);
  const filled=Number(assignment.filled_quantity||0);
  const reserved=Number(assignment.reserved_quantity||0);
  const open=Number(assignment.open_quantity||Math.max(requested-filled-reserved,0));
  const start=assignment.start_date?fmtD(assignment.start_date):'Start offen';
  const end=assignment.planned_end_date?fmtD(assignment.planned_end_date):'offen';
  const summaryBadges=[];
  summaryBadges.push(`<span class="pill pill-pnd">${open} offen</span>`);
  if(cardState.loaded){
    const decision=workerAssignmentDecisionConfig(cardState.suggestion);
    summaryBadges.push(`<span class="pill ${decision.cls}">${esc(decision.label)}</span>`);
  }
  return `
    <div style="border:1px solid var(--tc-tone-neutral-border);border-radius:12px;background:var(--tc-surface-emphasis);padding:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <div style="font-size:14px;font-weight:800">${esc(assignment.worker_description||assignment.request_title||'Deal-Einsatz')}</div>
          <div style="font-size:12px;color:var(--wk-text-muted);margin-top:4px">
            ${esc([assignment.client_org_name||'',`${start} – ${end}`,assignment.demand_location_city||''].filter(Boolean).join(' · ')||'Kontext wird nachgeladen')}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          ${summaryBadges.join('')}
          <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="toggleWorkerAssignAssignment('${assignment.assignment_id}')">${expanded?'Kontext schließen':'Kontext prüfen'}</button>
        </div>
      </div>
      ${expanded?renderWorkerAssignCardBody(assignment,cardState):''}
    </div>
  `;
}

function renderWorkerAssignDrw(){
  const worker=getWorkerById(workerAssignmentDrawerState.workerId);
  const titleEl=document.getElementById('wrkAssignTitle');
  const subEl=document.getElementById('wrkAssignSubtitle');
  const summaryEl=document.getElementById('wrkAssignWorkerSummary');
  const loadingEl=document.getElementById('wrkAssignLoading');
  const emptyEl=document.getElementById('wrkAssignEmpty');
  const errEl=document.getElementById('wrkAssignErr');
  const listEl=document.getElementById('wrkAssignList');
  if(titleEl)titleEl.textContent='Einsatz direkt zuweisen';
  if(subEl)subEl.textContent=worker?`${(`${worker.first_name||''} ${worker.last_name||''}`).trim()||worker.email||'Worker'} – bestehende Assignment-Logik mit vollständigem Worker-Kontext nutzen`:'Worker-Kontext wird geladen';
  if(summaryEl)summaryEl.innerHTML=worker?renderWorkerAssignWorkerSummary(worker):'';
  if(loadingEl)loadingEl.style.display=workerAssignmentDrawerState.loading?'block':'none';
  if(errEl){
    if(workerAssignmentDrawerState.error){
      errEl.textContent=workerAssignmentDrawerState.error;
      errEl.style.display='block';
    }else{
      errEl.style.display='none';
      errEl.textContent='';
    }
  }
  if(!worker||workerAssignmentDrawerState.loading){
    if(emptyEl)emptyEl.style.display='none';
    if(listEl)listEl.innerHTML='';
    return;
  }
  if(!openDealAssignments.length){
    if(emptyEl)emptyEl.style.display='block';
    if(listEl)listEl.innerHTML='';
    return;
  }
  if(emptyEl)emptyEl.style.display='none';
  if(listEl)listEl.innerHTML=openDealAssignments.map((assignment)=>renderWorkerAssignCard(assignment,worker)).join('');
}

async function openWorkerAssignDrw(workerId){
  if(!ensurePermission('workerEdit','Sie koennen keine direkte Einsatzzuweisung aus dem Worker-Bereich ausführen.'))return;
  const worker=getWorkerById(workerId);
  if(!worker){toast('Worker konnte nicht geladen werden','error');return;}
  resetWorkerAssignmentDrawerState(workerId);
  setStaffingWorkerPrefill(workerId);
  document.getElementById('wrkAssignDrwOvl').classList.add('on');
  document.getElementById('wrkAssignDrw').classList.add('on');
  workerAssignmentDrawerState.loading=true;
  workerAssignmentDrawerState.error='';
  renderWorkerAssignDrw();
  try{
    await loadDealAsgn();
    applyStaffingWorkerPrefill(workerId);
  }catch(error){
    workerAssignmentDrawerState.error=error?.message||'Offene Deal-Einsätze konnten nicht geladen werden.';
  }finally{
    workerAssignmentDrawerState.loading=false;
    renderWorkerAssignDrw();
  }
}

function closeWorkerAssignDrw(){
  document.getElementById('wrkAssignDrwOvl').classList.remove('on');
  document.getElementById('wrkAssignDrw').classList.remove('on');
  resetWorkerAssignmentDrawerState();
}

async function loadWorkerAssignmentCardContext(assignmentId,{force=false}={}){
  const workerId=workerAssignmentDrawerState.workerId;
  if(!workerId)return;
  const cardState=getWorkerAssignmentDrawerCardState(assignmentId);
  if(cardState.loading)return;
  if(cardState.loaded&&!force){
    renderWorkerAssignDrw();
    return;
  }
  cardState.loading=true;
  cardState.error='';
  renderWorkerAssignDrw();
  try{
    const detailPromise=(!force&&staffingDetailsByAssignment[assignmentId])
      ? Promise.resolve(staffingDetailsByAssignment[assignmentId])
      : loadStaffingDetail(assignmentId);
    const suggestionPromise=loadStaffingSuggestionForWorker(assignmentId,workerId,{force});
    const [detail,suggestionEntry]=await Promise.all([detailPromise,suggestionPromise]);
    cardState.detail=detail||null;
    cardState.suggestion=suggestionEntry?.suggestion||null;
    cardState.loaded=true;
  }catch(error){
    cardState.error=error?.message||'Kontext konnte nicht geladen werden.';
    cardState.loaded=false;
  }finally{
    cardState.loading=false;
    renderWorkerAssignDrw();
  }
}

async function refreshWorkerAssignmentCardContext(assignmentId){
  return loadWorkerAssignmentCardContext(assignmentId,{force:true});
}

async function toggleWorkerAssignAssignment(assignmentId){
  if(workerAssignmentDrawerState.activeAssignmentId===assignmentId){
    workerAssignmentDrawerState.activeAssignmentId='';
    renderWorkerAssignDrw();
    return;
  }
  workerAssignmentDrawerState.activeAssignmentId=assignmentId;
  renderWorkerAssignDrw();
  await loadWorkerAssignmentCardContext(assignmentId);
}

async function quickAssignWorkerFromDrawer(assignmentId){
  const workerId=workerAssignmentDrawerState.workerId;
  if(!workerId){
    toast('Kein Worker für die Direktzuweisung ausgewählt','error');
    return;
  }
  await runStaffingQuickAssign(assignmentId,[workerId]);
}

async function manualAssignWorkerFromDrawer(assignmentId){
  const worker=getWorkerById(workerAssignmentDrawerState.workerId);
  const assignment=openDealAssignments.find((entry)=>entry.assignment_id===assignmentId);
  const cardState=getWorkerAssignmentDrawerCardState(assignmentId);
  const suggestion=cardState.suggestion;
  const choiceSets=(cardState.detail?.choice_sets||[]).filter((choiceSet)=>choiceSet.worker_user_id===workerAssignmentDrawerState.workerId);
  if(!worker||!assignment||!suggestion||!suggestion.is_selectable){
    toast('Dieser Worker ist für eine manuelle Zuweisung aktuell nicht freigegeben.','error');
    return;
  }
  const confirmMessage=buildWorkerAssignmentManualConfirmMessage(worker,assignment,suggestion,choiceSets);
  await assignDealWorkerRequest(assignmentId,workerAssignmentDrawerState.workerId,{
    clientName:getAssignmentClientName(assignmentId),
    confirmMessage,
    successMessage:'Worker manuell dem Deal-Einsatz zugewiesen'
  });
}

async function openWorkerAssignmentInStaffingTab(assignmentId){
  if(!pageAccess.tabs.asgn){
    toast('Die Einsatzkarte ist fuer Ihre aktuelle Rolle nicht freigeschaltet.','error');
    return;
  }
  const workerId=workerAssignmentDrawerState.workerId;
  setStaffingWorkerPrefill(workerId);
  closeWorkerAssignDrw();
  await switchTab('asgn');
  applyStaffingWorkerPrefill(workerId);
  if(pageAccess.permissions.workerEdit){
    await openStaffingPanel(assignmentId,{forceReload:true,scrollIntoView:true});
  }
}

/* ASSIGN CAPACITY DRAWER */
function openAssignDrw(){
  if(!ensurePermission('workerEdit','Sie koennen Einsaetze sehen, aber keine Staffing- oder Zuweisungsaktionen ausfuehren.'))return;
  document.getElementById('asgDrwOvl').classList.add('on');
  document.getElementById('asgDrw').classList.add('on');
  document.getElementById('asgErr').style.display='none';
  document.getElementById('asgLoading').style.display='block';
  document.getElementById('asgContent').style.display='none';
  document.getElementById('asgEmpty').style.display='none';
  loadAssignData();
}
function closeAssignDrw(){document.getElementById('asgDrwOvl').classList.remove('on');document.getElementById('asgDrw').classList.remove('on');}
async function loadAssignData(){
  if(!pageAccess.permissions.workerEdit){
    document.getElementById('asgLoading').style.display='none';
    document.getElementById('asgContent').style.display='none';
    document.getElementById('asgEmpty').style.display='none';
    const err=document.getElementById('asgErr');
    err.textContent='Staffing- und Zuweisungsaktionen sind fuer Ihre aktuelle Rolle nicht freigeschaltet.';
    err.style.display='block';
    return;
  }
  try{
    // Unified Dispatcher-Drawer: lade proaktive Personalangebote UND offene
    // Deal-Einsaetze aus dem Aggregator /assignable-sources. Jeder Eintrag
    // kommt mit `source` (capacity | deal_assignment) – die Dispatch-Logik
    // in submitAssign waehlt anhand dessen das richtige Backend-Ziel.
    const dC=await fetchJson(`${API}/assignable-sources`);
    unassignedCaps=dC.items||[];
    if(!wrksLoaded){
      const dW=await fetchJson(`${API}/workers`);
      allWrks=dW.items||dW.workers||[];
      wrksLoaded=true;
    }
    document.getElementById('asgLoading').style.display='none';
    if(!unassignedCaps.length){
      document.getElementById('asgEmpty').style.display='block';return;
    }
    document.getElementById('asgContent').style.display='block';
    // Populate capacity select (gruppiert nach Quelle)
    const sel=document.getElementById('asgCap');
    const capGroup=unassignedCaps.filter((c)=>c.source==='capacity');
    const dealGroup=unassignedCaps.filter((c)=>c.source==='deal_assignment');
    const renderOption=(c)=>{
      // value traegt source-Marker, damit onCapSelect + submitAssign wissen,
      // welcher Backend-Pfad zu benutzen ist.
      const value=`${c.source}:${c.id}`;
      const titleText=esc(c.title||c.role||(c.source==='deal_assignment'?'Deal-Einsatz':'Personal'));
      const locationText=c.location_city?' \u2013 '+esc(c.location_city):'';
      const dateText=c.availability_from?' \u2013 '+fmtD(c.availability_from):'';
      const remainText=(c.source==='deal_assignment'&&Number.isFinite(Number(c.remaining)))
        ?' \u2013 '+Number(c.remaining)+' offen von '+Number(c.headcount||c.remaining)
        :(c.headcount?' \u2013 '+Number(c.headcount)+' Plaetze':'');
      const clientText=c.client_org_name?' \u2013 '+esc(c.client_org_name):'';
      return `<option value="${value}">${titleText}${locationText}${dateText}${remainText}${clientText}</option>`;
    };
    let html='<option value="">\u2013 Bitte waehlen \u2013</option>';
    if(capGroup.length){
      html+='<optgroup label="Verfügbares Personal">'+capGroup.map(renderOption).join('')+'</optgroup>';
    }
    if(dealGroup.length){
      html+='<optgroup label="Deal-Einsaetze mit offenen Plaetzen">'+dealGroup.map(renderOption).join('')+'</optgroup>';
    }
    sel.innerHTML=html;
    // Populate worker select (active only)
    const wSel=document.getElementById('asgWkr');
    const activeW=allWrks.filter(w=>w.is_active!==false);
    wSel.innerHTML='<option value="">\u2013 Bitte waehlen \u2013</option>'+activeW.map(w=>
      `<option value="${w.id||w.user_id}">${esc(w.first_name||'')} ${esc(w.last_name||'')}${w.personnel_number?' ('+esc(w.personnel_number)+')':''}</option>`
    ).join('');
  }catch(e){
    document.getElementById('asgLoading').style.display='none';
    document.getElementById('asgContent').style.display='none';
    document.getElementById('asgEmpty').style.display='none';
    const err=document.getElementById('asgErr');
    const code=e && e.code ? ` (${String(e.code)})` : '';
    err.innerHTML=
      '<div style="font-weight:700;margin-bottom:4px">Verfügbares Personal konnte derzeit nicht geladen werden.</div>'
      +'<div style="opacity:.9">Bitte erneut versuchen.'+code+'</div>'
      +'<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'
        +'<button class="wk-btn wk-btn-outline wk-btn-sm" onclick="retryLoadAssignData()">Erneut laden</button>'
      +'</div>'
      +'<details style="margin-top:10px;opacity:.9"><summary style="cursor:pointer">Technische Details</summary>'
        +'<div style="margin-top:6px;font-family:monospace;font-size:.78rem;white-space:pre-wrap">unassigned-capacity-posts: '
          +esc((e && e.message) ? e.message : 'error')
        +'</div>'
      +'</details>';
    err.style.display='block';
  }
}

async function retryLoadAssignData(){
  document.getElementById('asgErr').style.display='none';
  document.getElementById('asgLoading').style.display='block';
  document.getElementById('asgContent').style.display='none';
  document.getElementById('asgEmpty').style.display='none';
  return loadAssignData();
}
function parseAssignableSelection(raw){
  if(!raw)return null;
  const idx=raw.indexOf(':');
  if(idx<=0)return { source:'capacity', id:raw };
  return { source:raw.slice(0,idx), id:raw.slice(idx+1) };
}
function rebuildWorkerSelect(blockedWorkerUserIds){
  const wSel=document.getElementById('asgWkr');
  if(!wSel)return;
  const prev=wSel.value;
  const activeW=allWrks.filter((w)=>w.is_active!==false);
  const blocked=new Set((blockedWorkerUserIds||[]).map(String));
  const available=activeW.filter((w)=>!blocked.has(String(w.id||w.user_id)));
  const hidden=activeW.length-available.length;
  const hiddenLabel=hidden>0?` (${hidden} ausgeblendet: bereits zugewiesen)`:'';
  wSel.innerHTML='<option value="">\u2013 Bitte waehlen\u2013'+hiddenLabel+'</option>'
    +available.map((w)=>`<option value="${w.id||w.user_id}">${esc(w.first_name||'')} ${esc(w.last_name||'')}${w.personnel_number?' ('+esc(w.personnel_number)+')':''}</option>`).join('');
  // Bisherige Auswahl nur beibehalten wenn nicht geblockt
  if(prev && !blocked.has(String(prev))) wSel.value=prev;
}
function onCapSelect(){
  const raw=document.getElementById('asgCap').value;
  const info=document.getElementById('asgCapInfo');
  const sel=parseAssignableSelection(raw);
  if(!sel){
    info.style.display='none';
    rebuildWorkerSelect([]);
    return;
  }
  const c=unassignedCaps.find((x)=>x.source===sel.source && String(x.id)===String(sel.id))
    ||unassignedCaps.find((x)=>String(x.id)===String(sel.id));
  if(!c){
    info.style.display='none';
    rebuildWorkerSelect([]);
    return;
  }
  // Bereits verknuepfte Worker aus dem Dropdown filtern (krankgemeldete /
  // abgelehnte sind serverseitig bereits ausgeschlossen).
  rebuildWorkerSelect(Array.isArray(c.assigned_worker_user_ids)?c.assigned_worker_user_ids:[]);
  info.style.display='block';
  const sourceBadge=c.source==='deal_assignment'
    ? '<span class="pill pill-pnd" style="margin-left:6px">Aus Deal</span>'
    : '<span class="pill pill-act" style="margin-left:6px">Proaktiv</span>';
  const remain=(c.source==='deal_assignment'&&Number.isFinite(Number(c.remaining)))
    ? Number(c.remaining)+' offen von '+Number(c.headcount||c.remaining)
    : (c.headcount?Number(c.headcount)+' Plaetze':'');
  info.innerHTML=`<strong>${esc(c.title||c.role||'')}</strong>${sourceBadge}`
    +(c.role&&c.role!==c.title?`<br><span style="color:var(--wk-text-muted);font-size:.78rem">Rolle: ${esc(c.role)}</span>`:'')
    +(c.client_org_name?`<br>Kunde: <strong>${esc(c.client_org_name)}</strong>`:'')
    +(c.location_city?`<br>Ort: ${esc(c.location_city)}`:'')
    +(c.availability_from?`<br>Zeitraum: ${fmtD(c.availability_from)}${c.availability_to?' \u2013 '+fmtD(c.availability_to):''}`:'')
    +(c.shift_model?`<br>Schichtmodell: ${esc(c.shift_model)}`:'')
    +(remain?`<br>Personal: ${esc(remain)}`:'');
  // Pre-fill Start/End aus der Quelle (capacity.availability_* bzw. deal_assignment.start_date/planned_end_date)
  if(c.availability_from) document.getElementById('asgStart').value=String(c.availability_from).substring(0,10);
  if(c.availability_to)   document.getElementById('asgEnd').value=String(c.availability_to).substring(0,10);
  // Pre-fill Kundenname bei Deal-Einsatz (leer lassen bei proaktivem Personalangebot)
  const clientEl=document.getElementById('asgClient');
  if(clientEl){
    if(c.source==='deal_assignment'&&c.client_org_name){ clientEl.value=c.client_org_name; }
    else if(c.source==='capacity'){ /* Kundenname bleibt frei – proaktives Personalangebot hat noch keinen Kunden */ }
  }
}
async function submitAssign(){
  if(!ensurePermission('workerEdit','Sie koennen Einsaetze sehen, aber keine Staffing- oder Zuweisungsaktionen ausfuehren.'))return;
  const raw=document.getElementById('asgCap').value;
  const wkrId=document.getElementById('asgWkr').value;
  const start=document.getElementById('asgStart').value;
  const err=document.getElementById('asgErr');
  const sel=parseAssignableSelection(raw);
  if(!sel||!wkrId||!start){
    err.textContent='Bitte Personal/Einsatz, Mitarbeiter und Startdatum auswaehlen.';
    err.style.display='block';
    return;
  }
  err.style.display='none';
  const btn=document.getElementById('asgBtn');btn.disabled=true;btn.textContent='Wird zugewiesen\u2026';
  try{
    const csrf=await getCsrf();
    const commonBody={
      worker_user_id:wkrId,
      start_date:start,
      end_date:document.getElementById('asgEnd').value||null,
      default_hours_per_day:parseFloat(document.getElementById('asgHpd').value)||8,
      default_break_minutes:parseInt(document.getElementById('asgBrk').value)||30,
      default_shift_start:document.getElementById('asgShStart').value||null,
      default_shift_end:document.getElementById('asgShEnd').value||null,
      client_name:document.getElementById('asgClient').value.trim()||null,
      notes:document.getElementById('asgNotes').value.trim()||null
    };
    let url;
    let body;
    if(sel.source==='deal_assignment'){
      url=`${API}/assign-deal-to-worker`;
      body={ ...commonBody, assignment_id:sel.id };
    }else{
      url=`${API}/assign-capacity-to-worker`;
      body={ ...commonBody, capacity_post_id:sel.id };
    }
    const r=await fetch(url,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){
      const msgs={
        CAPACITY_NOT_FOUND:'Personalangebot nicht gefunden.',
        CAPACITY_NOT_ASSIGNABLE:'Personalangebot nicht zuweisbar.',
        ASSIGNMENT_NOT_FOUND:'Deal-Einsatz nicht gefunden.',
        ASSIGNMENT_NOT_ASSIGNABLE:'Deal-Einsatz nicht zuweisbar.',
        ASSIGNMENT_FILLED:'Deal-Einsatz ist bereits voll besetzt.',
        WORKER_ALREADY_LINKED:'Worker ist diesem Einsatz bereits zugeordnet.',
        WORKER_NOT_FOUND:'Mitarbeiter nicht gefunden.',
        WORKER_INACTIVE:'Mitarbeiter ist inaktiv.',
        SCHEDULE_CONFLICT:'Zeitraum-Konflikt mit bestehendem Einsatz.'
      };
      throw new Error(msgs[d.error]||d.message||d.error||'Fehler');
    }
    const toastMsg=sel.source==='deal_assignment'
      ? 'Deal-Einsatz zugewiesen \u2013 Worker wird benachrichtigt'
      : 'Personal zugewiesen \u2013 Worker wird benachrichtigt';
    toast(toastMsg,'success');
    closeAssignDrw();
    linksLoaded=false;
    dealAsgnLoaded=false;
    closedDealAsgnLoaded=false;
    await loadAsgn();
    if(pageAccess.permissions.workerEdit) await loadDealAsgn();
    await loadClosedDealAsgn();
  }catch(e){
    err.textContent=(e && e.message) ? e.message : 'Fehler';
    err.style.display='block';
  }
  finally{btn.disabled=false;btn.textContent='Zuweisen & benachrichtigen';}
}

/* DEAL ASSIGNMENTS – offene Einsätze aus Deals */
async function loadDealAsgn(){
  const sec=document.getElementById('dealAsgnSection');
  if(!pageAccess.permissions.workerEdit){
    openDealAssignments=[];
    dealAsgnLoaded=true;
    if(sec)sec.style.display='none';
    renderStaffingFastTrackNotice();
    return;
  }
  try{
    const d=await fetchJson(`${API}/open-deal-assignments`);
    const items=d.items||[];
    openDealAssignments=items;
    if(!items.length){
      dealAsgnLoaded=true;
      if(sec)sec.style.display='none';
      renderStaffingFastTrackNotice();
      return;
    }
    sec.style.display='block';
    const grid=document.getElementById('dealAsgnGrid');
    grid.innerHTML=items.map(a=>{
      const start=a.start_date?a.start_date.substring(0,10):'–';
      const end=a.planned_end_date?a.planned_end_date.substring(0,10):'offen';
      const requested=Number(a.requested_quantity||a.worker_count||1);
      const filled=Number(a.filled_quantity||0);
      const reserved=Number(a.reserved_quantity||0);
      const open=Number(a.open_quantity||Math.max(requested-filled-reserved,0));
      const inviteCount=Math.min(Math.max(open*3,open||1),20);
      const isFastTrackTarget=staffingFastTrackContext.assignmentId===a.assignment_id;
      return `<div class="asgn-card" id="dealAsgnCard-${a.assignment_id}" style="border-left:3px solid ${isFastTrackTarget?'var(--wk-success)':'var(--hub-accent)'}">
        <div class="asgn-card-header">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <div class="asgn-card-title">${esc(a.worker_description||a.request_title||'Deal-Einsatz')}</div>
            ${isFastTrackTarget?'<span class="pill pill-act">Fast-Track</span>':''}
          </div>
          <span class="asgn-badge asgn-badge--planned">${staffingBadgeLabel(a.staffing_status||'open')}</span>
        </div>
        <div class="asgn-card-meta">
          ${a.client_org_name?'<span>&#128188; '+esc(a.client_org_name)+'</span>':''}
          <span>&#128197; ${start} – ${end}</span>
        </div>
        ${isFastTrackTarget?'<div style="margin-top:8px;font-size:12px;color:var(--tc-tone-success-text)">Direkt aus dem staffing-bereiten Deal geöffnet.</div>':''}
        <div style="margin-top:8px;font-size:12px;color:var(--wk-text-muted);line-height:1.5">
          <strong style="color:var(--wk-text)">Besetzungsstand:</strong>
          ${filled} besetzt · ${reserved} reserviert · ${open} offen von ${requested}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          <button class="wk-btn wk-btn-primary wk-btn-sm" onclick="inviteTopWorkers('${a.assignment_id}',${inviteCount})">Beste ${inviteCount} anfragen</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="toggleStaffingPanel('${a.assignment_id}')">Vorschläge & Live-Status</button>
        </div>
        <div style="margin-top:8px">
          <select class="wk-select" id="dealWkr-${a.assignment_id}" style="font-size:12px;padding:4px 8px;max-width:200px">
            <option value="">Worker wählen…</option>
          </select>
          <button class="wk-btn wk-btn-primary wk-btn-sm" id="dealAssignBtn-${a.assignment_id}" style="margin-left:6px" onclick="assignDealWorker('${a.assignment_id}')">Zuweisen</button>
        </div>
        <div id="staffingPanel-${a.assignment_id}" style="display:none;margin-top:12px"></div>
      </div>`;
    }).join('');
    let workerError=null;
    if(!wrksLoaded){
      try{
        const dW=await fetchJson(`${API}/workers`);
        allWrks=dW.items||dW.workers||[];
        wrksLoaded=true;
      }catch(error){
        if(isTransientError(error)) return;
        workerError=error;
      }
    }
    const activeW=allWrks.filter(w=>w.is_active!==false);
    items.forEach(a=>{
      const sel=document.getElementById('dealWkr-'+a.assignment_id);
      const btn=document.getElementById('dealAssignBtn-'+a.assignment_id);
      if(sel){
        sel.innerHTML='<option value="">Worker wählen…</option>'+activeW.map(w=>`<option value="${w.id||w.user_id}">${esc(w.first_name||'')} ${esc(w.last_name||'')}${w.personnel_number?' ('+esc(w.personnel_number)+')':''}</option>`).join('');
        sel.disabled=!activeW.length;
      }
      if(btn)btn.disabled=!activeW.length;
    });
    applyStaffingWorkerPrefill();
    const choiceBtn=document.getElementById('dealChoiceSetBtn');
    if(choiceBtn)choiceBtn.disabled=items.length<2||!activeW.length;
    dealAsgnLoaded=true;
    if(workerError){
      setPanelNotice(
        'asgnEditNotice',
        isAccessDeniedError(workerError)?'Manuelle Zuweisung eingeschraenkt.':'Worker-Auswahl konnte nicht geladen werden.',
        isAccessDeniedError(workerError)
          ? 'Die Worker-Auswahl ist fuer Ihren aktuellen Organisationskontext nicht verfuegbar.'
          : (workerError?.message||'Bitte spaeter erneut versuchen.'),
        isAccessDeniedError(workerError)?'info':'warning'
      );
    }else{
      setPanelNotice('asgnEditNotice','','');
    }
    renderStaffingFastTrackNotice();
    await maybeAutoFocusStaffingReadyAssignment();
  }catch(error){
    if(isTransientError(error)) return;
    openDealAssignments=[];
    dealAsgnLoaded=true;
    if(sec)sec.style.display='none';
    setPanelNotice(
      'asgnEditNotice',
      isAccessDeniedError(error)?'Keine Staffing-Rechte.':'Offene Deal-Einsaetze konnten nicht geladen werden.',
      isAccessDeniedError(error)
        ? 'Staffing- und Zuweisungsaktionen sind fuer Ihre aktuelle Rolle nicht freigeschaltet.'
        : (error?.message||'Bitte spaeter erneut versuchen.'),
      isAccessDeniedError(error)?'info':'warning'
    );
    renderStaffingFastTrackNotice();
  }
}

/**
 * Welle 7 – Phase 3+4: Abgeschlossene Deals hart verfuegbar.
 *
 * Laedt agency-seitig alle Deal-Assignments, die vollstaendig besetzt,
 * planmaessig beendet oder storniert sind. Sichtflaeche only – keine
 * Staffing-Mutationen. Transient-Errors beenden still.
 */
async function loadClosedDealAsgn(){
  const sec=document.getElementById('closedDealAsgnSection');
  const grid=document.getElementById('closedDealAsgnGrid');
  const countEl=document.getElementById('closedDealAsgnCount');
  if(!sec||!grid){
    closedDealAsgnLoaded=true;
    return;
  }
  try{
    const d=await fetchJson(`${API}/closed-deal-assignments?limit=100`);
    const items=d.items||[];
    _closedDealAsgns=items;
    closedDealAsgnLoaded=true;
    if(!items.length){
      sec.style.display='none';
      grid.innerHTML='';
      if(countEl) countEl.textContent='';
      return;
    }
    sec.style.display='block';
    if(countEl) countEl.textContent='('+items.length+')';
    grid.innerHTML=items.map(renderClosedDealCard).join('');
  }catch(error){
    if(isTransientError(error)) return;
    _closedDealAsgns=[];
    closedDealAsgnLoaded=true;
    sec.style.display='none';
    grid.innerHTML='';
    if(countEl) countEl.textContent='';
    // 403 ist kein Fehler – lesender Zugriff kann fuer Rolle fehlen; still.
    if(isAccessDeniedError(error)) return;
    // Andere Fehler als Info in Panel-Notice, nicht blockierend.
    setPanelNotice(
      'asgnStateNotice',
      'Abgeschlossene Deals konnten nicht geladen werden.',
      error?.message||'Bitte spaeter erneut versuchen.',
      'warning'
    );
  }
}

function renderClosedDealCard(a){
  const start=a.start_date?fmtD(a.start_date):'–';
  const end=a.planned_end_date?fmtD(a.planned_end_date):'offen';
  const requested=Number(a.requested_quantity||a.worker_count||1);
  const filled=Number(a.filled_quantity||0);
  const linkActive=Number(a.link_active_count||0);
  const linkTotal=Number(a.link_total_count||0);
  const statusMap={
    completed:{cls:'pill-off',label:'Beendet'},
    cancelled:{cls:'pill-off',label:'Storniert'},
    active:{cls:'pill-act',label:'Voll besetzt'},
    planned:{cls:'pill-act',label:'Voll besetzt'},
    extended:{cls:'pill-act',label:'Verlaengert'}
  };
  const statusCfg=statusMap[a.status]||{cls:'pill-off',label:a.status||'–'};
  const agreementRef=a.offer_agreement_ref?esc(a.offer_agreement_ref):'';
  const detailHref=a.offer_id?'/public/offer_detail.html?id='+encodeURIComponent(a.offer_id):'';
  return '<div class="asgn-card" style="border-left:3px solid var(--wk-text-muted)">'
    +'<div class="asgn-card-header">'
    +'<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
    +'<div class="asgn-card-title">'+esc(a.worker_description||a.request_title||'Deal-Einsatz')+'</div>'
    +(agreementRef?'<span class="pill pill-off" style="font-family:monospace">'+agreementRef+'</span>':'')
    +'</div>'
    +'<span class="pill '+statusCfg.cls+'">'+esc(statusCfg.label)+'</span>'
    +'</div>'
    +'<div class="asgn-card-meta">'
    +(a.client_org_name?'<span>&#128188; '+esc(a.client_org_name)+'</span>':'')
    +'<span>&#128197; '+esc(start)+' – '+esc(end)+'</span>'
    +'</div>'
    +'<div style="margin-top:8px;font-size:12px;color:var(--wk-text-muted);line-height:1.5">'
    +'<strong style="color:var(--wk-text)">Besetzung:</strong> '
    +filled+' von '+requested+' besetzt'
    +(linkTotal?' · '+linkActive+' aktive Verknuepfung'+(linkActive===1?'':'en')+' / '+linkTotal+' gesamt':'')
    +'</div>'
    +(detailHref?'<div style="margin-top:10px"><a class="wk-btn wk-btn-ghost wk-btn-sm" href="'+detailHref+'">Dealakte oeffnen</a></div>':'')
    +'</div>';
}

function staffingBadgeLabel(status){
  const labels={open:'Offen',sourcing:'Sourcing',partially_filled:'Teilbesetzt',filled:'Besetzt',closed:'Geschlossen',cancelled:'Storniert'};
  return labels[status]||'Offen';
}
function getStaffingUiState(assignmentId){
  if(!staffingUiStateByAssignment[assignmentId]){
    staffingUiStateByAssignment[assignmentId]={hardOnly:true,quickAssignPending:false,quickAssignResult:null};
  }
  return staffingUiStateByAssignment[assignmentId];
}
function staffingReasonText(reasons){
  if(!Array.isArray(reasons)||!reasons.length)return 'Noch keine Match-Begründung';
  return reasons.map(r=>r.label||r.reason||'').filter(Boolean).slice(0,3).join(' · ');
}
function staffingFactorLabel(factor){
  const labels={
    availabilityMatch:'Verfügbarkeit',
    skillMatch:'Skills',
    distanceScore:'Distanz',
    qualificationScore:'Nachweise',
    reliabilityScore:'Zuverlässigkeit',
    preferenceScore:'Kundenfit',
    experienceScore:'Erfahrung'
  };
  return labels[factor]||factor||'Faktor';
}
function staffingFactorText(factorScores){
  if(!Array.isArray(factorScores)||!factorScores.length)return '';
  return factorScores
    .filter(f=>f&&f.applicable!==false)
    .sort((a,b)=>(Number(b.points||0)-Number(a.points||0))||(Number(b.max||0)-Number(a.max||0)))
    .slice(0,3)
    .map(f=>`${staffingFactorLabel(f.factor)} ${Number(f.points||0)}/${Number(f.max||0)}`)
    .join(' · ');
}
function staffingCriteriaText(items){
  if(!Array.isArray(items)||!items.length)return '';
  return items.map(item=>item.label||item.reason||'').filter(Boolean).slice(0,3).join(' · ');
}
function staffingWorkerLabel(worker){
  return `${worker?.first_name||''} ${worker?.last_name||''}`.trim()||worker?.personnel_number||worker?.worker_user_id||'Worker';
}
function staffingQuickAssignStatusLabel(status){
  const labels={
    assigned:'Direkt zugewiesen',
    skipped_not_safe:'Nicht safe',
    skipped_already_linked:'Bereits verknüpft',
    skipped_assignment_filled:'Einsatz bereits voll',
    failed_conflict:'Konflikt',
    failed_worker_not_found:'Worker fehlt',
    failed_worker_inactive:'Worker inaktiv',
    failed_assignment_not_assignable:'Nicht zuweisbar',
    failed_unknown:'Fehlgeschlagen'
  };
  return labels[status]||status||'Ergebnis';
}
function staffingQuickAssignTone(status){
  if(status==='assigned')return 'pill-act';
  if(String(status||'').startsWith('skipped_'))return 'pill-warn';
  return 'pill-danger';
}
function staffingQuickAssignReason(entry){
  if(entry?.reason_label)return entry.reason_label;
  if(Array.isArray(entry?.quick_assign_blockers)&&entry.quick_assign_blockers.length){
    return staffingCriteriaText(entry.quick_assign_blockers);
  }
  if(entry?.status==='assigned'&&Number.isFinite(Number(entry.open_quantity_after))){
    return `Noch ${Number(entry.open_quantity_after)} offene Plätze nach der Direktzuweisung.`;
  }
  return '';
}
function renderStaffingQuickAssignResult(assignmentId){
  const result=getStaffingUiState(assignmentId).quickAssignResult;
  if(!result||!Array.isArray(result.results)||!result.results.length)return '';
  const summary=result.summary||{};
  const rows=result.results.map((entry)=>`
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <div style="min-width:0;flex:1">
        <div style="font-size:12px;font-weight:600">${esc(staffingWorkerLabel(entry))}</div>
        ${staffingQuickAssignReason(entry)?`<div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(staffingQuickAssignReason(entry))}</div>`:''}
      </div>
      <span class="pill ${staffingQuickAssignTone(entry.status)}">${esc(staffingQuickAssignStatusLabel(entry.status))}</span>
    </div>`).join('');
  return `<div style="border:1px solid var(--tc-tone-neutral-border);border-radius:12px;padding:10px;background:var(--tc-surface-emphasis);margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;margin-bottom:8px">
      <strong>Schnellzuweisung Ergebnis</strong>
      <span style="color:var(--wk-text-muted)">${Number(summary.assigned_count||0)} direkt zugewiesen · ${Number(summary.skipped_count||0)} nicht ausgeführt · offen danach ${Number(summary.open_quantity_after||0)}</span>
    </div>
    <div style="display:grid;gap:8px">
      ${rows}
    </div>
  </div>`;
}
function staffingSuggestionBadge(suggestion){
  if((suggestion&&suggestion.suggestion_status)==='blocked'){
    return '<span class="pill pill-danger">Blockiert</span>';
  }
  if(suggestion&&suggestion.hard_match){
    return '<span class="pill pill-act">Harter Treffer</span>';
  }
  return '<span class="pill pill-accent">Weicher Fit</span>';
}
function staffingWaitlistStatusLabel(status){
  const labels={queued:'Waitlist',invited:'Angefragt',reserved:'Reserviert',assigned:'Zugeordnet',removed:'Abgeschlossen'};
  return labels[status]||status||'Status';
}
function staffingParseJson(value){
  if(!value)return null;
  if(typeof value==='object')return value;
  try{return JSON.parse(value);}catch{return null;}
}
function staffingFmtDateTime(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function staffingInviteStatusLabel(status){
  const labels={sent:'Offen',viewed:'Gesehen',interested:'Rückfrage',accepted:'Angenommen',declined:'Abgelehnt',expired:'Abgelaufen',cancelled:'Geschlossen'};
  return labels[status]||status||'Offen';
}
function staffingDeliveryLabel(status){
  const labels={pending:'Pending',queued:'Queued',delivered:'Zugestellt',failed:'Fehlgeschlagen'};
  return labels[status]||status||'–';
}
function staffingInviteInteractionText(invite){
  if(invite.latest_message_type==='question'){
    return `Frage: ${invite.latest_body||'ohne Text'}`;
  }
  if(invite.latest_message_type==='reminder_request'){
    return `Reminder-Wunsch: ${invite.latest_body||'ohne Zusatztext'}`;
  }
  if(invite.latest_message_type==='reminder_sent'){
    return `Letzte Erinnerung gesendet ${invite.latest_message_at?`(${staffingFmtDateTime(invite.latest_message_at)})`:''}`.trim();
  }
  return '';
}
function staffingChoiceSetModeLabel(mode){
  const labels={
    preference_only:'Nur Präferenz',
    ranked_choice:'Priorisierte Auswahl',
    free_choice:'Freie Wahl'
  };
  return labels[mode]||'Auswahl';
}
function staffingChoiceSetStatusLabel(status){
  const labels={
    options_presented:'Offen',
    preference_submitted:'Präferenz gesendet',
    preference_ranked:'Ranking gesendet',
    manual_override:'Manuell entschieden',
    assigned:'Final zugewiesen',
    declined:'Abgelehnt',
    expired:'Abgelaufen',
    cancelled:'Geschlossen'
  };
  return labels[status]||status||'Offen';
}
function staffingChoiceOptionStateLabel(option){
  if(option?.promoted_link_id||option?.live_state==='assigned')return 'Final zugewiesen';
  if(option?.reservation_status==='reserved')return 'Reserviert';
  if(option?.worker_response==='selected')return 'Vom Worker gewählt';
  if(option?.worker_response==='preferred')return 'Worker-Favorit';
  if(Number.isFinite(Number(option?.worker_rank)))return `Rang ${Number(option.worker_rank)}`;
  if(option?.worker_response==='acceptable')return 'Auch möglich';
  if(option?.live_state==='declined'||option?.worker_response==='declined')return 'Abgelehnt';
  if(option?.live_state==='expired')return 'Abgelaufen';
  if(option?.live_state==='cancelled')return 'Geschlossen';
  return 'Offen';
}
function staffingChoiceOptionStateTone(option){
  if(option?.promoted_link_id||option?.live_state==='assigned'||option?.reservation_status==='reserved'||option?.worker_response==='selected')return 'pill-act';
  if(option?.worker_response==='preferred'||Number.isFinite(Number(option?.worker_rank)))return 'pill-accent';
  if(option?.live_state==='declined'||option?.worker_response==='declined'||option?.live_state==='expired'||option?.live_state==='cancelled')return 'pill-off';
  return 'pill-pnd';
}
function staffingChoiceOptionCanAssign(choiceSet,option){
  if(!choiceSet||!option)return false;
  if(choiceSet.is_terminal)return false;
  if(['assigned','declined','expired','cancelled'].includes(choiceSet.status))return false;
  if(option.promoted_link_id||option.live_state==='assigned')return false;
  return !['declined','expired','cancelled'].includes(option.live_state);
}
function staffingChoiceWorkerSummary(choiceSet){
  if(choiceSet?.summary?.dispatcher_summary)return choiceSet.summary.dispatcher_summary;
  if(choiceSet?.worker_note)return choiceSet.worker_note;
  return '';
}
function formatDateTimeLocalInput(value){
  const date=value?new Date(value):new Date(Date.now()+(72*60*60*1000));
  if(Number.isNaN(date.getTime()))return '';
  const pad=(part)=>String(part).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
async function ensureChoiceSetWorkersLoaded(){
  if(wrksLoaded&&Array.isArray(allWrks)&&allWrks.length)return allWrks;
  const payload=await fetchJson(`${API}/workers`);
  allWrks=payload.items||payload.workers||[];
  wrksLoaded=true;
  return allWrks;
}
function renderChoiceSetAssignments(selectedIds=[]){
  const host=document.getElementById('choiceSetAssignments');
  if(!host)return;
  const selected=new Set(Array.isArray(selectedIds)?selectedIds.filter(Boolean):[]);
  if(!openDealAssignments.length){
    host.innerHTML='<div class="hub-empty" style="padding:16px 10px"><p>Keine offenen Deal-Einsätze verfügbar.</p></div>';
    return;
  }
  host.innerHTML=openDealAssignments.map((assignment)=>{
    const requested=Number(assignment.requested_quantity||assignment.worker_count||1);
    const filled=Number(assignment.filled_quantity||0);
    const reserved=Number(assignment.reserved_quantity||0);
    const open=Number(assignment.open_quantity||Math.max(requested-filled-reserved,0));
    const meta=[
      assignment.client_org_name||'',
      assignment.start_date?assignment.start_date.substring(0,10):'',
      assignment.planned_end_date?assignment.planned_end_date.substring(0,10):'offen',
      `${open} offen`
    ].filter(Boolean).join(' · ');
    return `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
-subtle)">
      <input type="checkbox" value="${assignment.assignment_id}" id="choiceSetAssignment-${assignment.assignment_id}" ${selected.has(assignment.assignment_id)?'checked':''} style="margin-top:3px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
          <strong>${esc(assignment.worker_description||assignment.request_title||'Deal-Einsatz')}</strong>
          <span class="pill pill-pnd">${staffingBadgeLabel(assignment.staffing_status||'open')}</span>
        </div>
        <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(meta)}</div>
      </div>
    </label>`;
  }).join('');
}
async function openChoiceSetDrw(preselectedAssignmentIds=[]){
  if(!ensurePermission('workerEdit','Sie koennen keine Auswahlphase fuer Worker anlegen.'))return;
  if(openDealAssignments.length<2){
    toast('Für eine Auswahlphase werden mindestens zwei offene Einsatzoptionen benötigt.','error');
    return;
  }
  try{
    await ensureChoiceSetWorkersLoaded();
    const activeWorkers=allWrks.filter(worker=>worker.is_active!==false);
    if(!activeWorkers.length){
      toast('Keine aktiven Worker für eine Auswahlphase verfügbar.','error');
      return;
    }
    const workerSelect=document.getElementById('choiceSetWorker');
    if(workerSelect){
      workerSelect.innerHTML='<option value="">– Bitte wählen –</option>'+activeWorkers.map(worker=>`<option value="${worker.id||worker.user_id}">${esc(worker.first_name||'')} ${esc(worker.last_name||'')}${worker.personnel_number?' ('+esc(worker.personnel_number)+')':''}</option>`).join('');
    }
    document.getElementById('choiceSetMode').value='preference_only';
    document.getElementById('choiceSetDeadline').value=formatDateTimeLocalInput();
    document.getElementById('choiceSetTitle').value='';
    document.getElementById('choiceSetMessage').value='';
    const err=document.getElementById('choiceSetErr');
    if(err){err.style.display='none';err.textContent='';}
    renderChoiceSetAssignments(preselectedAssignmentIds);
    document.getElementById('choiceSetDrwOvl').classList.add('on');
    document.getElementById('choiceSetDrw').classList.add('on');
  }catch(error){
    toast(error?.message||'Auswahlphase konnte nicht vorbereitet werden','error');
  }
}
function closeChoiceSetDrw(){
  document.getElementById('choiceSetDrwOvl').classList.remove('on');
  document.getElementById('choiceSetDrw').classList.remove('on');
}
async function submitChoiceSet(){
  if(!ensurePermission('workerEdit','Sie koennen keine Auswahlphase fuer Worker anlegen.'))return;
  const workerUserId=document.getElementById('choiceSetWorker')?.value||'';
  const choiceMode=document.getElementById('choiceSetMode')?.value||'preference_only';
  const title=document.getElementById('choiceSetTitle')?.value?.trim()||'';
  const message=document.getElementById('choiceSetMessage')?.value?.trim()||'';
  const deadlineRaw=document.getElementById('choiceSetDeadline')?.value||'';
  const assignmentIds=openDealAssignments
    .filter((assignment)=>document.getElementById(`choiceSetAssignment-${assignment.assignment_id}`)?.checked)
    .map((assignment)=>assignment.assignment_id);
  const err=document.getElementById('choiceSetErr');
  if(!workerUserId){
    if(err){err.textContent='Bitte einen Worker auswählen.';err.style.display='block';}
    return;
  }
  if(assignmentIds.length<2){
    if(err){err.textContent='Bitte mindestens zwei Einsatzoptionen freigeben.';err.style.display='block';}
    return;
  }
  const btn=document.getElementById('choiceSetBtn');
  if(err){err.style.display='none';err.textContent='';}
  if(btn){btn.disabled=true;btn.textContent='Wird angelegt…';}
  try{
    const csrf=await getCsrf();
    const body={
      worker_user_id:workerUserId,
      assignment_ids:assignmentIds,
      choice_mode:choiceMode,
      title:title||undefined,
      message:message||undefined,
      response_deadline_at:deadlineRaw?new Date(deadlineRaw).toISOString():undefined
    };
    const response=await fetch(`${API}/staffing-choice-sets`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify(body)
    });
    const payload=await response.json();
    if(!response.ok){
      const messages={
        WORKER_NOT_FOUND:'Worker nicht gefunden.',
        WORKER_INACTIVE:'Der gewählte Worker ist inaktiv.',
        INSUFFICIENT_OPTIONS:'Bitte mindestens zwei Einsatzoptionen freigeben.',
        INVALID_CHOICE_MODE:'Ungültiger Auswahlmodus.',
        INVALID_RESPONSE_DEADLINE:'Die Antwortfrist ist ungültig.',
        ASSIGNMENT_NOT_FOUND:'Mindestens ein Einsatz wurde nicht gefunden.',
        ASSIGNMENT_NOT_ASSIGNABLE:'Mindestens ein Einsatz ist nicht zuweisbar.',
        ASSIGNMENT_FILLED:'Mindestens ein Einsatz ist bereits vollständig besetzt.',
        NO_ELIGIBLE_WORKERS:'Für mindestens einen Einsatz konnte kein Staffing-Invite erzeugt werden.',
        CHOICE_SET_OPTION_ALREADY_ACTIVE:'Für diesen Worker ist mindestens eine der gewählten Optionen bereits in einer aktiven Auswahlphase enthalten.',
        INVITE_CREATION_FAILED:'Die Auswahlphase konnte nicht vollständig vorbereitet werden.'
      };
      throw new Error(messages[payload.error]||payload.error||'Auswahlphase konnte nicht angelegt werden');
    }
    toast(`Auswahlphase für ${assignmentIds.length} Optionen angelegt`,'success');
    closeChoiceSetDrw();
    staffingDetailsByAssignment={};
    staffingSuggestionsByAssignment={};
    await loadDealAsgn();
  }catch(error){
    if(err){err.textContent=error?.message||'Auswahlphase konnte nicht angelegt werden';err.style.display='block';}
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Auswahlphase anlegen';}
  }
}
async function assignStaffingChoiceOption(assignmentId,choiceSetId,choiceOptionId){
  if(!ensurePermission('workerEdit','Sie koennen keine finale Zuweisung aus einer Auswahlphase auslösen.'))return;
  const detail=staffingDetailsByAssignment[assignmentId];
  const choiceSet=(detail?.choice_sets||[]).find((entry)=>entry.id===choiceSetId);
  const option=(choiceSet?.options||[]).find((entry)=>entry.id===choiceOptionId);
  if(!choiceSet||!option){
    toast('Auswahlphase konnte nicht mehr aufgelöst werden. Bitte aktualisieren.','error');
    return;
  }
  const workerName=choiceSet.worker?`${choiceSet.worker.first_name||''} ${choiceSet.worker.last_name||''}`.trim():'Worker';
  const optionLabel=option.request_context?.title||option.request_context?.role||'Einsatzoption';
  const isOverride=!!choiceSet.summary?.primary_option_id&&choiceSet.summary.primary_option_id!==choiceOptionId;
  const confirmText=isOverride
    ? `${workerName||'Der Worker'} hat eine andere Präferenz signalisiert. Diese Option trotzdem final zuweisen?\n\n${optionLabel}`
    : `Diesen Einsatz jetzt final zuweisen?\n\n${optionLabel}`;
  if(!confirm(confirmText))return;
  let notes='';
  if(isOverride){
    const promptValue=window.prompt('Optionale Override-Notiz für Audit und Nachvollziehbarkeit:',choiceSet.manual_override_note||'');
    if(promptValue===null)return;
    notes=String(promptValue||'').trim();
  }
  try{
    const csrf=await getCsrf();
    const response=await fetch(`${API}/staffing-choice-sets/${choiceSetId}/assign`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({
        choice_option_id:choiceOptionId,
        client_name:option.request_context?.client_org_name||undefined,
        notes:notes||undefined
      })
    });
    const payload=await response.json();
    if(!response.ok){
      const messages={
        CHOICE_SET_NOT_FOUND:'Auswahlphase nicht gefunden.',
        CHOICE_OPTION_NOT_FOUND:'Auswahloption nicht gefunden.',
        CHOICE_SET_ALREADY_ASSIGNED:'Die Auswahlphase ist bereits final zugewiesen.',
        CHOICE_SET_ALREADY_DECLINED:'Die Auswahlphase wurde bereits abgelehnt.',
        CHOICE_SET_EXPIRED:'Die Auswahlphase ist abgelaufen.',
        CHOICE_SET_CANCELLED:'Die Auswahlphase wurde geschlossen.',
        RESERVATION_NOT_FOUND:'Die Reservierung wurde nicht gefunden.',
        ASSIGNMENT_NOT_FOUND:'Der Einsatz wurde nicht gefunden.',
        ASSIGNMENT_NOT_ASSIGNABLE:'Der Einsatz ist nicht zuweisbar.',
        RESERVATION_NOT_ACTIVE:'Die Reservierung ist nicht mehr aktiv.',
        RESERVATION_EXPIRED:'Die Reservierung ist abgelaufen.',
        ASSIGNMENT_FILLED:'Der Einsatz ist bereits vollständig besetzt.',
        ALREADY_ASSIGNED:'Der Worker ist dort bereits zugewiesen.',
        WORKER_ALREADY_LINKED:'Der Worker hat bereits einen aktiven Link für diesen Einsatz.',
        WORKER_NOT_FOUND:'Worker nicht gefunden.',
        WORKER_INACTIVE:'Der Worker ist inaktiv.',
        SCHEDULE_CONFLICT:'Die finale Zuweisung kollidiert mit einem bestehenden Zeitraum.'
      };
      throw new Error(messages[payload.error]||payload.error||'Finale Zuweisung fehlgeschlagen');
    }
    toast('Auswahlphase final zugewiesen','success');
    staffingDetailsByAssignment={};
    staffingSuggestionsByAssignment={};
    await loadDealAsgn();
    await loadAsgn();
  }catch(error){
    toast(error?.message||'Finale Zuweisung fehlgeschlagen','error');
  }
}
async function loadStaffingDetail(assignmentId){
  const d=await fetchJson(`${API}/staffing-assignments/${assignmentId}`);
  staffingDetailsByAssignment[assignmentId]=d;
  return d;
}
async function loadStaffingSuggestions(assignmentId,opts={}){
  const state=getStaffingUiState(assignmentId);
  const q=new URLSearchParams();
  q.set('limit',String(opts.limit||20));
  if(opts.only_available!==false)q.set('only_available','true');
  const hardOnly=opts.hard_only!==undefined?!!opts.hard_only:!!state.hardOnly;
  state.hardOnly=hardOnly;
  q.set('hard_only',hardOnly?'true':'false');
  q.set('include_blocked',opts.include_blocked===false?'false':'true');
  const d=await fetchJson(`${API}/staffing-assignments/${assignmentId}/suggestions?${q.toString()}`);
  staffingSuggestionsByAssignment[assignmentId]=d;
  return d;
}
function renderStaffingPanel(assignmentId){
  const panel=document.getElementById('staffingPanel-'+assignmentId);
  const detail=staffingDetailsByAssignment[assignmentId];
  const suggestionBundle=staffingSuggestionsByAssignment[assignmentId];
  if(!panel||!detail)return;
  const state=getStaffingUiState(assignmentId);
  const asg=detail.assignment||{};
  const campaigns=Array.isArray(detail.campaigns)?detail.campaigns:[];
  const autoBackfillCampaign=campaigns.find(c=>c.auto_backfill_enabled);
  const suggested=(suggestionBundle&&suggestionBundle.suggestions)||[];
  const suggestionSummary=(suggestionBundle&&suggestionBundle.summary)||{};
  const currentWorkers=(detail.current_workers||[]).filter(w=>w.is_active!==false);
  const reservations=(detail.reservations||[]).filter(r=>r.status==='reserved');
  const invites=(detail.recent_invites||[]).slice(0,8);
  const waitlist=(detail.waitlist||[]).slice(0,8);
  const waitlistSummary=detail.waitlist_summary||suggestionBundle?.waitlist_summary||{};
  const choiceSets=(detail.choice_sets||[]).slice(0,8);
  const defaultSelected=Math.min(Math.max(Number(asg.open_quantity||0)*3,1),10);
  const selectableSuggestions=suggested.filter(s=>s&&s.can_invite);
  const quickAssignableSuggestions=suggested.filter(s=>s&&s.quick_assign_eligible);
  const preferredSuggestions=selectableSuggestions.filter(s=>state.hardOnly?s.hard_match:true);
  const defaultSelectionSource=quickAssignableSuggestions.length?quickAssignableSuggestions:(preferredSuggestions.length?preferredSuggestions:selectableSuggestions);
  const defaultSelectedIds=new Set(defaultSelectionSource.slice(0,defaultSelected).map(s=>s.worker_user_id));
  const quickAssignResultHtml=renderStaffingQuickAssignResult(assignmentId);
  const quickAssignActionLabel=state.quickAssignPending?'Direktzuweisung läuft…':'Sichere Auswahl direkt zuweisen';
  const suggestionHtml=suggested.length?suggested.map((s)=>{
    const factors=staffingFactorText(s.factor_scores);
    const missing=staffingCriteriaText(s.missing_requirements);
    const hardFails=staffingCriteriaText(s.hard_failures);
    const quickAssignBlockers=staffingCriteriaText(s.quick_assign_blockers);
    const secondaryMeta=[
      s.city||'',
      s.personnel_number||'',
      s.already_contacted?'bereits kontaktiert':'',
      s.has_open_invite?'offene Anfrage':''
    ].filter(Boolean).join(' · ');
    return `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <input type="checkbox" id="staffingPick-${assignmentId}-${s.worker_user_id}" ${defaultSelectedIds.has(s.worker_user_id)?'checked':''} ${s.can_invite?'':'disabled'} style="margin-top:2px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <strong>${esc(staffingWorkerLabel(s))}</strong>
            ${staffingSuggestionBadge(s)}
            ${s.quick_assign_eligible?'<span class="pill pill-act">Direkt sicher</span>':''}
          </div>
          <span>Score ${Number(s.total_score||s.score||0)}</span>
        </div>
        <div style="font-size:12px;color:var(--wk-text-muted);margin-top:4px">${esc(factors||staffingReasonText(s.match_reasons))}</div>
        ${missing?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:4px"><strong>Fehlt:</strong> ${esc(missing)}</div>`:''}
        ${hardFails?`<div style="font-size:11px;color:var(--tc-tone-danger-text);margin-top:4px"><strong>Hard-Fail:</strong> ${esc(hardFails)}</div>`:''}
        <div style="font-size:11px;color:${s.quick_assign_eligible?'var(--tc-tone-success-text)':'var(--tc-tone-warning-text)'};margin-top:4px"><strong>Direktzuweisung:</strong> ${esc(s.quick_assign_eligible?'Safe Case laut Guardrails':(quickAssignBlockers||'Nur Anfrage oder Waitlist sinnvoll'))}</div>
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <div style="font-size:11px;color:var(--wk-text-muted)">${esc(secondaryMeta||'Noch keine Zusatzsignale')}</div>
          ${s.quick_assign_eligible?`<button class="wk-btn wk-btn-success wk-btn-sm" ${state.quickAssignPending?'disabled':''} onclick="quickAssignSingleStaffingWorker('${assignmentId}','${s.worker_user_id}')">${state.quickAssignPending?'Läuft…':'Direkt zuweisen'}</button>`:''}
        </div>
      </div>
    </label>`;
  }).join(''):`<div style="font-size:12px;color:var(--wk-text-muted)">Keine geeigneten Worker-Vorschläge gefunden.</div>`;
  const waitlistHtml=waitlist.length?waitlist.map((entry)=>`
    <div style="padding:8px 10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
        <strong>${esc(`${entry.first_name||''} ${entry.last_name||''}`.trim()||entry.worker_user_id||'Worker')}</strong>
        <span>${esc(staffingWaitlistStatusLabel(entry.status))}${entry.queue_rank?` · #${Number(entry.queue_rank)}`:''}</span>
      </div>
      <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(staffingReasonText(entry.match_reasons)||entry.removal_reason||'')}</div>
    </div>`).join(''):`<div style="font-size:12px;color:var(--wk-text-muted)">Noch keine Waitlist-Einträge vorhanden.</div>`;
  const inviteActivityHtml=invites.length?invites.map((invite)=>{
    const snapshot=staffingParseJson(invite.request_snapshot)||{};
    const interactionText=staffingInviteInteractionText(invite);
    const deadline=snapshot.response_deadline_label||staffingFmtDateTime(invite.expires_at);
    const reminderText=invite.remind_after
      ? `Reminder geplant: ${staffingFmtDateTime(invite.remind_after)}`
      : (Number(invite.reminder_request_count||0)>0 ? 'Reminder-Wunsch vorhanden' : '');
    const deliveryText=`Delivery: ${staffingDeliveryLabel(invite.delivery_status)}${invite.delivery_last_error?` · ${invite.delivery_last_error}`:''}`;
    return `<div style="padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <strong>${esc(`${invite.first_name||''} ${invite.last_name||''}`.trim()||invite.worker_user_id||'Worker')}</strong>
          <span class="pill ${invite.status==='accepted'?'pill-act':'pill-pnd'}">${esc(staffingInviteStatusLabel(invite.status))}</span>
        </div>
        <span style="color:var(--wk-text-muted)">${esc(deliveryText)}</span>
      </div>
      <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">
        ${esc(snapshot.title||asg.worker_description||'Einsatzanfrage')}${deadline?` · Frist ${esc(deadline)}`:''}
      </div>
      ${interactionText?`<div style="font-size:11px;color:var(--tc-tone-brand-text);margin-top:6px">${esc(interactionText)}</div>`:''}
      ${reminderText?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:4px">${esc(reminderText)}</div>`:''}
    </div>`;
  }).join(''):`<div style="font-size:12px;color:var(--wk-text-muted)">Noch keine aktiven Request-Interaktionen vorhanden.</div>`;
  const choiceSetsHtml=choiceSets.length?choiceSets.map((choiceSet)=>{
    const workerName=choiceSet.worker?`${choiceSet.worker.first_name||''} ${choiceSet.worker.last_name||''}`.trim():'';
    const summary=staffingChoiceWorkerSummary(choiceSet);
    const optionHtml=(choiceSet.options||[]).map((option)=>{
      const ctx=option.request_context||{};
      const meta=[
        ctx.client_org_name||'',
        ctx.location_label||ctx.location_city||'',
        ctx.duration_label||'',
        ctx.pay_label||''
      ].filter(Boolean).join(' · ');
      const canAssign=staffingChoiceOptionCanAssign(choiceSet,option);
      const isPrimary=choiceSet.summary?.primary_option_id===option.id;
      const isCurrent=option.assignment_id===assignmentId;
      return `<div style="padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:10px;background:var(--tc-surface-subtle)">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
          <div style="min-width:0;flex:1">
            <div style="font-weight:600">${esc(ctx.title||ctx.role||'Einsatzoption')}</div>
            <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(meta||'Details folgen')}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            ${isCurrent?'<span class="pill pill-pnd">Diese Stelle</span>':''}
            ${isPrimary?'<span class="pill pill-accent">Worker-Favorit</span>':''}
            <span class="pill ${staffingChoiceOptionStateTone(option)}">${esc(staffingChoiceOptionStateLabel(option))}</span>
          </div>
        </div>
        ${(option.worker_note||option.dispatcher_note)?`<div style="font-size:11px;color:var(--wk-text-muted);margin-top:6px">${esc(option.worker_note||option.dispatcher_note)}</div>`:''}
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <div style="font-size:11px;color:var(--wk-text-muted)">
            ${option.worker_responded_at?`Worker-Aktion ${esc(staffingFmtDateTime(option.worker_responded_at))}`:(option.dispatcher_updated_at?`Dispatcher-Aktion ${esc(staffingFmtDateTime(option.dispatcher_updated_at))}`:'Noch keine Rückmeldung')}
          </div>
          ${canAssign?`<button class="wk-btn wk-btn-success wk-btn-sm" onclick="assignStaffingChoiceOption('${assignmentId}','${choiceSet.id}','${option.id}')">Final zuweisen</button>`:''}
        </div>
      </div>`;
    }).join('');
    return `<div style="padding:10px;border:1px solid var(--tc-tone-neutral-border);border-radius:12px;background:var(--tc-surface-muted)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px">
        <div>
          <div style="font-weight:700">${esc(choiceSet.title||'Worker-Auswahlphase')}</div>
          <div style="font-size:11px;color:var(--wk-text-muted);margin-top:4px">${esc(workerName||choiceSet.worker?.email||choiceSet.worker_user_id||'Worker')} · ${esc(staffingChoiceSetModeLabel(choiceSet.choice_mode))}${choiceSet.response_deadline_at?` · Frist ${esc(staffingFmtDateTime(choiceSet.response_deadline_at))}`:''}</div>
        </div>
        <span class="pill ${choiceSet.status==='assigned'?'pill-act':(choiceSet.status==='declined'||choiceSet.status==='expired'||choiceSet.status==='cancelled'?'pill-off':'pill-pnd')}">${esc(staffingChoiceSetStatusLabel(choiceSet.status))}</span>
      </div>
      ${summary?`<div style="font-size:11px;color:var(--tc-tone-brand-text);margin-top:6px">${esc(summary)}</div>`:''}
      ${choiceSet.manual_override_note?`<div style="font-size:11px;color:var(--tc-tone-warning-text);margin-top:6px"><strong>Override:</strong> ${esc(choiceSet.manual_override_note)}</div>`:''}
      <div style="display:grid;gap:8px;margin-top:10px">${optionHtml}</div>
    </div>`;
  }).join(''):`<div style="font-size:12px;color:var(--wk-text-muted)">Noch keine aktiven Worker-Auswahlphasen für diesen Einsatz.</div>`;
  panel.innerHTML=`
    <div style="padding:12px;border:1px solid var(--tc-tone-neutral-border);border-radius:12px;background:var(--tc-surface-emphasis)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-size:12px;line-height:1.5">
          <strong>Live-Stand:</strong> ${Number(asg.filled_quantity||0)} besetzt · ${Number(asg.reserved_quantity||0)} reserviert · ${Number(asg.open_quantity||0)} offen
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="wk-btn wk-btn-outline wk-btn-sm" onclick="refreshStaffingPanel('${assignmentId}')">Aktualisieren</button>
          <button class="wk-btn wk-btn-success wk-btn-sm" ${state.quickAssignPending||Number(asg.open_quantity||0)<=0?'disabled':''} onclick="quickAssignSelectedStaffingWorkers('${assignmentId}')">${quickAssignActionLabel}</button>
          <button class="wk-btn wk-btn-primary wk-btn-sm" onclick="sendSelectedStaffingInvites('${assignmentId}')">Auswahl anfragen</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="queueSelectedStaffingWorkers('${assignmentId}')">Auswahl auf Waitlist</button>
          <button class="wk-btn wk-btn-ghost wk-btn-sm" onclick="sendNextWaitlistWave('${assignmentId}')">Nächste Welle</button>
        </div>
      </div>
      <div style="display:grid;gap:8px;margin-bottom:10px">
        ${currentWorkers.length?`<div style="font-size:12px;color:var(--wk-text-muted)"><strong style="color:var(--wk-text)">Aktive Worker:</strong> ${currentWorkers.map(w=>esc(`${w.first_name||''} ${w.last_name||''}`.trim()||w.worker_email||'Worker')).join(', ')}</div>`:''}
        ${reservations.length?`<div style="font-size:12px;color:var(--wk-text-muted)"><strong style="color:var(--wk-text)">Reserviert:</strong> ${reservations.map(r=>esc(`${r.first_name||''} ${r.last_name||''}`.trim())).join(', ')}</div>`:''}
        ${autoBackfillCampaign?`<div style="font-size:12px;color:var(--tc-tone-brand-text)"><strong style="color:var(--tc-tone-brand-strong-text)">Auto-Backfill aktiv:</strong> Nachsteuerung läuft über die letzte Bulk-Kampagne.</div>`:''}
        <div style="font-size:11px;color:var(--wk-text-muted)">Direktzuweisung nutzt dieselben Guardrails wie die manuelle Zuweisung und führt pro Worker ein deterministisches Ergebnis zurück.</div>
      </div>
      ${quickAssignResultHtml}
      <div style="border-top:1px solid var(--tc-tone-neutral-border);padding-top:10px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px">
          <strong>Worker-Auswahlphase / Präferenzen</strong>
          <span style="color:var(--wk-text-muted)">${choiceSets.length} Auswahlgruppe${choiceSets.length===1?'':'n'} sichtbar</span>
        </div>
        <div style="display:grid;gap:8px">
          ${choiceSetsHtml}
        </div>
      </div>
      <div style="border-top:1px solid var(--tc-tone-neutral-border);padding-top:10px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px">
          <strong>Request-Status / Worker-Kommunikation</strong>
          <span style="color:var(--wk-text-muted)">Offene Fragen ${invites.reduce((sum,i)=>sum+Number(i.question_count||0),0)} · Reminder-Wünsche ${invites.reduce((sum,i)=>sum+Number(i.reminder_request_count||0),0)}</span>
        </div>
        <div style="display:grid;gap:8px">
          ${inviteActivityHtml}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="wk-btn ${state.hardOnly?'wk-btn-primary':'wk-btn-ghost'} wk-btn-sm" onclick="setStaffingSuggestionMode('${assignmentId}',true)">Nur harte Treffer</button>
          <button class="wk-btn ${state.hardOnly?'wk-btn-ghost':'wk-btn-primary'} wk-btn-sm" onclick="setStaffingSuggestionMode('${assignmentId}',false)">Auch weiche Treffer</button>
        </div>
        <div style="font-size:12px;color:var(--wk-text-muted)">
          ${Number(suggestionSummary.hard_match_count||0)} harte Treffer · ${Number(suggestionSummary.soft_match_count||0)} weiche Fits · ${Number(suggestionSummary.blocked_count||0)} blockiert · Waitlist ${Number(waitlistSummary.queued_count||0)}
        </div>
      </div>
      <div style="display:grid;gap:8px;margin-bottom:12px">
        ${suggestionHtml}
      </div>
      <div style="border-top:1px solid var(--tc-tone-neutral-border);padding-top:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px">
          <strong>Waitlist / Nachrücker</strong>
          <span style="color:var(--wk-text-muted)">Queued ${Number(waitlistSummary.queued_count||0)} · Angefragt ${Number(waitlistSummary.invited_count||0)} · Reserviert ${Number(waitlistSummary.reserved_count||0)}</span>
        </div>
        <div style="display:grid;gap:8px">
          ${waitlistHtml}
        </div>
      </div>
    </div>`;
}
async function toggleStaffingPanel(assignmentId){
  const panel=document.getElementById('staffingPanel-'+assignmentId);
  if(!panel)return;
  if(panel.style.display==='none'){
    await openStaffingPanel(assignmentId);
    return;
  }
  panel.style.display='none';
}
async function refreshStaffingPanel(assignmentId){
  if(!ensurePermission('workerEdit','Sie koennen Einsaetze sehen, aber keine Staffing-Details aktualisieren.'))return;
  try{
    const state=getStaffingUiState(assignmentId);
    await Promise.all([loadStaffingDetail(assignmentId),loadStaffingSuggestions(assignmentId,{limit:20,only_available:true,hard_only:state.hardOnly,include_blocked:true})]);
    renderStaffingPanel(assignmentId);
  }catch(e){toast(e.message||'Aktualisierung fehlgeschlagen','error');}
}
function getSelectedStaffingWorkerIds(assignmentId){
  const suggestionBundle=staffingSuggestionsByAssignment[assignmentId];
  const suggested=(suggestionBundle&&suggestionBundle.suggestions)||[];
  return suggested.filter(s=>{
    const el=document.getElementById(`staffingPick-${assignmentId}-${s.worker_user_id}`);
    return !!el&&el.checked&&!el.disabled;
  }).map(s=>s.worker_user_id);
}
async function runStaffingQuickAssign(assignmentId,workerIds){
  if(!ensurePermission('workerEdit','Sie koennen keine sichere Direktzuweisung ausführen.'))return;
  const uniqueWorkerIds=[...new Set((Array.isArray(workerIds)?workerIds:[]).filter(Boolean))];
  if(!uniqueWorkerIds.length){
    toast('Bitte mindestens einen Worker auswählen','error');
    return;
  }
  const state=getStaffingUiState(assignmentId);
  const detail=staffingDetailsByAssignment[assignmentId]||await loadStaffingDetail(assignmentId);
  state.quickAssignPending=true;
  renderStaffingPanel(assignmentId);
  try{
    const csrf=await getCsrf();
    const response=await fetch(`${API}/staffing-assignments/${assignmentId}/quick-assign`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({
        worker_user_ids:uniqueWorkerIds,
        client_name:detail?.assignment?.client_org_name||detail?.assignment?.client_name||undefined
      })
    });
    const payload=await response.json();
    if(!response.ok){
      const messages={
        ASSIGNMENT_NOT_FOUND:'Der Einsatz wurde nicht gefunden.',
        ASSIGNMENT_NOT_ASSIGNABLE:'Der Einsatz ist aktuell nicht zuweisbar.',
        ASSIGNMENT_FILLED:'Der Einsatz ist bereits vollständig besetzt.',
        NO_WORKERS_SELECTED:'Bitte mindestens einen Worker auswählen.'
      };
      throw new Error(messages[payload.error]||payload.error||'Direktzuweisung fehlgeschlagen');
    }
    state.quickAssignResult=payload;
    toast(`${Number(payload.summary?.assigned_count||0)} Worker direkt zugewiesen`,'success');
    invalidateStaffingDataCache(assignmentId);
    await loadDealAsgn();
    await loadAsgn();
    await refreshWorkerAssignmentDrawerAfterMutation(assignmentId);
    if(document.getElementById(`staffingPanel-${assignmentId}`)){
      await openStaffingPanel(assignmentId,{forceReload:true,scrollIntoView:true});
    }else{
      renderStaffingFastTrackNotice();
    }
  }catch(error){
    toast(error?.message||'Direktzuweisung fehlgeschlagen','error');
  }finally{
    state.quickAssignPending=false;
    if(document.getElementById(`staffingPanel-${assignmentId}`)?.style.display!=='none'){
      renderStaffingPanel(assignmentId);
    }
  }
}
async function quickAssignSelectedStaffingWorkers(assignmentId){
  return runStaffingQuickAssign(assignmentId,getSelectedStaffingWorkerIds(assignmentId));
}
async function quickAssignSingleStaffingWorker(assignmentId,workerUserId){
  return runStaffingQuickAssign(assignmentId,[workerUserId]);
}
async function sendSelectedStaffingInvites(assignmentId){
  if(!ensurePermission('workerEdit','Sie koennen keine Staffing-Anfragen versenden.'))return;
  const workerIds=getSelectedStaffingWorkerIds(assignmentId);
  if(!workerIds.length){toast('Bitte mindestens einen Worker auswählen','error');return;}
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/staffing-assignments/${assignmentId}/campaigns`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({worker_user_ids:workerIds,promotion_mode:'auto_finalize',auto_backfill_enabled:false})
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Bulk-Anfrage fehlgeschlagen');
    toast(`${workerIds.length} Worker angefragt`,'success');
    await refreshStaffingPanel(assignmentId);
  }catch(e){toast(e.message||'Bulk-Anfrage fehlgeschlagen','error');}
}
async function queueSelectedStaffingWorkers(assignmentId){
  if(!ensurePermission('workerEdit','Sie koennen keine Worker auf die Waitlist setzen.'))return;
  const workerIds=getSelectedStaffingWorkerIds(assignmentId);
  if(!workerIds.length){toast('Bitte mindestens einen Worker auswählen','error');return;}
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/staffing-assignments/${assignmentId}/waitlist`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({worker_user_ids:workerIds})
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Waitlist konnte nicht aktualisiert werden');
    toast(`${workerIds.length} Worker auf Waitlist gesetzt`,'success');
    await refreshStaffingPanel(assignmentId);
  }catch(e){toast(e.message||'Waitlist konnte nicht aktualisiert werden','error');}
}
async function sendNextWaitlistWave(assignmentId){
  if(!ensurePermission('workerEdit','Sie koennen keine weitere Waitlist-Welle ausloesen.'))return;
  try{
    const detail=staffingDetailsByAssignment[assignmentId]||await loadStaffingDetail(assignmentId);
    const openQty=Number((detail.assignment||{}).open_quantity||1);
    const csrf=await getCsrf();
    const r=await fetch(`${API}/staffing-assignments/${assignmentId}/waitlist/next-wave`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({limit:Math.min(Math.max(openQty*3,1),20),auto_backfill_enabled:!!(detail.campaigns||[]).find(c=>c.auto_backfill_enabled)})
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Waitlist-Welle konnte nicht gesendet werden');
    toast(`${Number((d.invites||[]).length||0)} Waitlist-Kandidaten angefragt`,'success');
    await refreshStaffingPanel(assignmentId);
  }catch(e){toast(e.message||'Waitlist-Welle konnte nicht gesendet werden','error');}
}
async function inviteTopWorkers(assignmentId,count){
  if(!ensurePermission('workerEdit','Sie koennen keine Staffing-Anfragen versenden.'))return;
  try{
    const state=getStaffingUiState(assignmentId);
    const suggestionBundle=await loadStaffingSuggestions(assignmentId,{limit:Math.max(count||20,20),only_available:true,hard_only:state.hardOnly,include_blocked:false});
    const detail=staffingDetailsByAssignment[assignmentId]||await loadStaffingDetail(assignmentId);
    const suggested=(suggestionBundle.suggestions||[]).filter(s=>s.can_invite&&(state.hardOnly?s.hard_match:true));
    const targetCount=Math.min(count||20,suggested.length);
    const workerIds=suggested.slice(0,targetCount).map(s=>s.worker_user_id);
    if(!workerIds.length){toast('Keine freien Top-Kandidaten verfügbar','error');return;}
    const csrf=await getCsrf();
    const r=await fetch(`${API}/staffing-assignments/${assignmentId}/campaigns`,{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({
        worker_user_ids:workerIds,
        promotion_mode:'auto_finalize',
        auto_backfill_enabled:true,
        message:`Automatische Sammelanfrage – noch offen: ${Number((detail.assignment||{}).open_quantity||0)}`
      })
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Top-Kandidaten konnten nicht angefragt werden');
    toast(`${workerIds.length} Top-Kandidaten angefragt`,'success');
    await refreshStaffingPanel(assignmentId);
  }catch(e){toast(e.message||'Top-Kandidaten konnten nicht angefragt werden','error');}
}
async function assignDealWorkerRequest(assignmentId,workerUserId,{clientName=null,confirmMessage='',successMessage='Worker dem Deal-Einsatz zugewiesen ?'}={}){
  if(confirmMessage&&!confirm(confirmMessage))return false;
  try{
    const csrf=await getCsrf();
    const body={assignment_id:assignmentId,worker_user_id:workerUserId};
    if(clientName)body.client_name=clientName;
    const r=await fetch(`${API}/assign-deal-to-worker`,{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){
      const messages={
        ASSIGNMENT_NOT_FOUND:'Einsatz nicht gefunden.',
        ASSIGNMENT_NOT_ASSIGNABLE:'Einsatz ist aktuell nicht zuweisbar.',
        ASSIGNMENT_FILLED:'Einsatz ist bereits vollständig besetzt.',
        ALREADY_ASSIGNED:'Worker ist diesem Einsatz bereits zugeordnet.',
        WORKER_ALREADY_LINKED:'Worker hat bereits einen aktiven Link für diesen Einsatz.',
        WORKER_NOT_FOUND:'Worker nicht gefunden.',
        WORKER_INACTIVE:'Worker ist inaktiv.',
        SCHEDULE_CONFLICT:'Zeitraum-Konflikt mit bestehendem Einsatz oder Reservierung.'
      };
      throw new Error(messages[d.error]||d.error||'Fehler');
    }
    toast(successMessage,'success');
    invalidateStaffingDataCache(assignmentId);
    await loadDealAsgn();
    await loadAsgn();
    await refreshWorkerAssignmentDrawerAfterMutation(assignmentId);
    return true;
  }catch(error){
    toast(error?.message||'Fehler bei Zuweisung','error');
    return false;
  }
}
async function assignDealWorker(assignmentId){
  if(!ensurePermission('workerEdit','Sie koennen Deal-Einsaetze nicht zuweisen.'))return;
  const sel=document.getElementById('dealWkr-'+assignmentId);
  const wkrId=sel?sel.value:'';
  if(!wkrId){toast('Bitte Worker auswählen','error');return;}
  await assignDealWorkerRequest(assignmentId,wkrId,{
    clientName:getAssignmentClientName(assignmentId),
    successMessage:'Worker dem Deal-Einsatz zugewiesen ?'
  });
}
window.toggleStaffingPanel=toggleStaffingPanel;
window.refreshStaffingPanel=refreshStaffingPanel;
window.setStaffingSuggestionMode=setStaffingSuggestionMode;
window.quickAssignSelectedStaffingWorkers=quickAssignSelectedStaffingWorkers;
window.quickAssignSingleStaffingWorker=quickAssignSingleStaffingWorker;
window.sendSelectedStaffingInvites=sendSelectedStaffingInvites;
window.queueSelectedStaffingWorkers=queueSelectedStaffingWorkers;
window.sendNextWaitlistWave=sendNextWaitlistWave;
window.inviteTopWorkers=inviteTopWorkers;
window.openChoiceSetDrw=openChoiceSetDrw;
window.closeChoiceSetDrw=closeChoiceSetDrw;
window.submitChoiceSet=submitChoiceSet;
window.assignStaffingChoiceOption=assignStaffingChoiceOption;
window.assignDealWorker=assignDealWorker;

/* ASSIGNMENT LINKS */
// Welle 7 – Phase 10+11: Europe/Berlin-Heute als YYYY-MM-DD, timezone-safe.
// new Date().toISOString() liefert UTC; bei z.B. 23:30 Berlin-Zeit wuerde
// dadurch "heute" bereits als "morgen" interpretiert und aktive Einsaetze
// in Archiv rutschen. Intl.DateTimeFormat kapselt DST + CET/CEST korrekt.
const _BERLIN_DATE_FMT=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
});
function todayBerlinIso(){
  return _BERLIN_DATE_FMT.format(new Date());
}
function assignmentLifecycleState(link){
  if(link&&typeof link.assignment_lifecycle_state==='string'&&link.assignment_lifecycle_state)return link.assignment_lifecycle_state;
  if(link&&link.assignment_status==='completed')return 'completed';
  if(link&&link.assignment_status==='cancelled')return 'cancelled';
  if(link&&link.is_active===false)return 'archived';
  const today=todayBerlinIso();
  const end=link&&(
    link.assignment_effective_end_date
    || link.end_date
    || link.asg_end
    || null
  );
  const endDate=end?String(end).slice(0,10):null;
  if(endDate&&endDate<today)return 'expired';
  if(endDate&&endDate===today)return 'ends_today';
  return 'active';
}
function assignmentLifecycleBucket(link){
  if(link&&link.assignment_lifecycle_bucket==='active')return 'active';
  if(link&&link.assignment_lifecycle_bucket==='history')return 'history';
  const state=assignmentLifecycleState(link);
  return (state==='active'||state==='ends_today')?'active':'history';
}
function isCurrentAssignmentLink(link){
  if(link&&typeof link.assignment_is_current==='boolean')return link.assignment_is_current;
  return assignmentLifecycleBucket(link)==='active';
}
function assignmentLifecyclePill(link){
  const state=assignmentLifecycleState(link);
  const map={
    active:{cls:'pill-act',label:'Aktiv'},
    ends_today:{cls:'pill-pend',label:'Endet heute'},
    expired:{cls:'pill-off',label:'Abgelaufen'},
    completed:{cls:'pill-off',label:'Beendet'},
    cancelled:{cls:'pill-off',label:'Storniert'},
    archived:{cls:'pill-off',label:'Archiv'}
  };
  const cfg=map[state]||map.active;
  return '<span class="pill '+cfg.cls+'">'+cfg.label+'</span>';
}
async function loadAsgn(){
  if(!pageAccess.tabs.asgn){
    linksLoaded=true;
    setPanelNotice(
      'asgnStateNotice',
      'Kein Zugriff auf Einsaetze.',
      'Der Bereich ist fuer Ihren aktuellen Organisationskontext nicht freigeschaltet.',
      'info'
    );
    toggleElement('ldAsgn',false);
    toggleElement('ctAsgn',false);
    toggleElement('dealAsgnSection',false);
    return;
  }
  setPanelNotice('asgnStateNotice','','');
  if(pageAccess.permissions.workerEdit){
    setPanelNotice('asgnEditNotice','','');
  }
  document.getElementById('ldAsgn').style.display='block';
  document.getElementById('ctAsgn').style.display='none';
  try{
    const d=await fetchJson(`${API}/supplier/assignment-links`);
    allLinks=d.items||[];
    setAsgnKpis();
    linksLoaded=true;
    document.getElementById('tc-asgn').textContent=allLinks.filter(isCurrentAssignmentLink).length||'0';
    document.getElementById('ldAsgn').style.display='none';
    document.getElementById('ctAsgn').style.display='block';
    if(!pageAccess.permissions.workerEdit)toggleElement('dealAsgnSection',false);
    renderAsgns();
  }catch(error){
    if(isTransientError(error)){
      document.getElementById('ldAsgn').style.display='none';
      return;
    }
    allLinks=[];
    linksLoaded=true;
    document.getElementById('tc-asgn').textContent='–';
    document.getElementById('ldAsgn').style.display='none';
    document.getElementById('ctAsgn').style.display='none';
    toggleElement('dealAsgnSection',false);
    setPanelNotice(
      'asgnStateNotice',
      isAccessDeniedError(error)?'Kein Zugriff auf Einsaetze.':'Einsaetze konnten nicht geladen werden.',
      isAccessDeniedError(error)
        ? 'Der Bereich ist fuer Ihren aktuellen Organisationskontext nicht freigeschaltet.'
        : (error?.message||'Bitte spaeter erneut versuchen.'),
      isAccessDeniedError(error)?'info':'danger'
    );
  }
}
function setAsgnKpis(){
  const act=allLinks.filter(isCurrentAssignmentLink).length;
  const cfg=allLinks.filter(l=>isCurrentAssignmentLink(l)&&(l.client_name||l.location_address)).length;
  const noI=allLinks.filter(l=>isCurrentAssignmentLink(l)&&!l.instructions).length;
  const wkrs=new Set(allLinks.filter(isCurrentAssignmentLink).map(l=>l.worker_user_id)).size;
  document.getElementById('ka1').textContent=act;
  document.getElementById('ka2').textContent=cfg;
  document.getElementById('ka3').textContent=noI;
  document.getElementById('ka4').textContent=wkrs;
}
function setAsgnFilter(f,btn){
  asgnFilter=f;
  document.querySelectorAll('.asgn-status-btns .rev-pill').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  renderAsgns();
}
function filterAsgn(){
  asgnQuery=(document.getElementById('aSearch')?.value||'').trim().toLowerCase();
  renderAsgns();
}
function renderAsgns(){
  const grid=document.getElementById('asgnGrid'),emp=document.getElementById('asgnEmpty');
  if(!grid)return;
  if(asgnViewMode==='planung'){ renderPlanungView(); return; }
  let list=allLinks;
  // Welle 7 – Phase 10+11: Aktiv / Archiv / Alle. Archiv zeigt alle Nicht-
  // aktiven Links (expired/completed/cancelled/archived) timezone-sicher.
  if(asgnFilter==='active')list=list.filter(isCurrentAssignmentLink);
  else if(asgnFilter==='archived')list=list.filter((l)=>!isCurrentAssignmentLink(l));
  if(asgnQuery)list=list.filter(l=>
    ((l.first_name||'')+' '+(l.last_name||'')+' '+(l.worker_email||'')+' '+(l.client_name||'')+' '+(l.location_address||''))
    .toLowerCase().includes(asgnQuery));
  if(!list.length){grid.innerHTML='';emp.style.display='block';return;}
  emp.style.display='none';
  grid.innerHTML=list.map(renderAsgnCard).join('');
}
function renderAsgnCard(l){
  const ini=((l.first_name||'?')[0]+(l.last_name||'?')[0]).toUpperCase();
  const tf=x=>x?String(x).substring(0,5):null;
  const fv=(val,em)=>val
    ?('<span class="asgn-field-val">'+esc(String(val))+'</span>')
    :('<span class="asgn-field-val empty">'+(em||'Nicht angegeben')+'</span>');
  const row=(ic,lb,val,em)=>'<div class="asgn-field-row"><span class="asgn-field-icon">'+ic+'</span><span class="asgn-field-label">'+lb+'</span>'+fv(val,em)+'</div>';
  const dr=l.start_date?(fmtD(l.start_date)+(l.end_date?' \u2013 '+fmtD(l.end_date):' (offen)')):null;
  const st=(l.default_shift_start&&l.default_shift_end)
    ?(tf(l.default_shift_start)+' \u2013 '+tf(l.default_shift_end)+' Uhr')
    :(l.default_hours_per_day?l.default_hours_per_day+' h/Tag':null);
  const ct=l.contact_name||(l.contact_phone||null);
  const ctFull=ct?(l.contact_name&&l.contact_phone?(l.contact_name+' / '+l.contact_phone):ct):null;
  const filled=[l.location_address,l.client_name,l.instructions,ct,l.default_shift_start].filter(Boolean).length;
  const pct=Math.round((filled/5)*100);
  const pc=pct>=80?'var(--wk-success)':pct>=40?'var(--wk-warning)':'var(--wk-danger)';
  const editAction=pageAccess.permissions.workerEdit
    ? '<button class="wk-btn wk-btn-primary wk-btn-sm" onclick="openLnkDrwById(\''+l.id+'\')">&#9998; Konfigurieren</button>'
    : '';
  // P1.1: Ersatz bei Krankheit/Ausfall — nur auf aktiven Einsaetzen + mit Edit-Recht
  const replaceAction=(pageAccess.permissions.workerEdit&&isCurrentAssignmentLink(l))
    ? '<button class="wk-btn wk-btn-sm" style="background:var(--tc-tone-danger-bg,#fef1f1);color:var(--tc-tone-danger-text,#b42318);border:1px solid var(--wk-danger,#e5484d)" onclick="openReplaceModal(\''+l.id+'\')" title="Bei Krankheit/Ausfall: Ersatz ab Wirk-Datum zuweisen, Ausfallenden freistellen">&#8644; Ersatz zuweisen</button>'
    : '';
  return '<div class="asgn-card">'
    +'<div class="asgn-card-head">'
    +'<div class="wk-avatar" style="'+aColor((l.first_name||'')+(l.last_name||''))+'">'+ini+'</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div class="asgn-card-name">'+esc(l.first_name||'')+' '+esc(l.last_name||'')+'</div>'
    +'<div class="asgn-card-sub">'+esc(l.worker_email||'')+(l.personnel_number?' &middot; '+esc(l.personnel_number):'')+'</div>'
    +'</div>'
    +assignmentLifecyclePill(l)
    +(l.worker_confirmation_status&&l.worker_confirmation_status!=='auto_confirmed'?confBadge(l.worker_confirmation_status):'')
    +'</div>'
    +'<div class="asgn-fields">'
    +row('&#127970;','Kunde',l.client_name,'Kein Kundenname')
    +row('&#128205;','Einsatzort',l.location_address,null)
    +row('&#128197;','Zeitraum',dr,'Kein Datum gesetzt')
    +row('&#128336;','Schichtzeit',st,'Keine Arbeitszeit')
    +row('&#128203;','Anweisungen',l.instructions?l.instructions.substring(0,60)+(l.instructions.length>60?'...':''):null,'Keine Anweisungen')
    +(ctFull?row('&#128100;','Ansprechp.',ctFull,null):'')
    +'</div>'
    +'<div style="margin:0 0 14px">'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:5px">'
    +'<span style="font-size:.71rem;color:var(--wk-text-muted);text-transform:uppercase;letter-spacing:.05em">Vollst&auml;ndigkeit</span>'
    +'<span style="font-size:.74rem;font-weight:700;color:'+pc+'">'+pct+'%</span>'
    +'</div>'
    +'<div style="height:3px;border-radius:2px;background:var(--tc-progress-track)">'
    +'<div style="height:100%;width:'+pct+'%;background:'+pc+';border-radius:2px;transition:width .4s ease"></div>'
    +'</div>'
    +'</div>'
    +'<div class="asgn-card-foot">'
    +editAction
    +replaceAction
    +'</div>'
    +'</div>';
}
function openLnkDrwById(id){
  if(!ensurePermission('workerEdit','Sie koennen Einsatzkonfigurationen sehen, aber nicht bearbeiten.'))return;
  var l=allLinks.find(function(x){return x.id===id;});if(l)openLnkDrw(l);
}
function openLnkDrw(l){
  if(!ensurePermission('workerEdit','Sie koennen Einsatzkonfigurationen sehen, aber nicht bearbeiten.'))return;
  editingLinkId=l.id;
  document.getElementById('lnkDrwTitle').textContent='Einsatz konfigurieren';
  document.getElementById('lnkDrwSub').textContent=(l.first_name||'')+' '+(l.last_name||'')+(l.client_name?' \u00b7 '+l.client_name:'');
  const h=x=>esc(x||'');
  const dv=x=>x?String(x).substring(0,10):'';
  const tv=x=>x?String(x).substring(0,5):'';
  const nv=x=>(x!=null&&x!=='')?String(x):'';
  document.getElementById('lnkDrwBody').innerHTML=''
    +'<div class="wk-alert wk-alert-info" style="margin-bottom:20px;font-size:.83rem;line-height:1.5">'
    +'<span>&#128161;</span><span>Diese Felder sind f&uuml;r <strong>'+h(l.first_name)+'</strong> im Arbeitnehmer-Portal sichtbar.</span>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">Einsatzdetails</div>'
    +'<div class="wk-form-group"><label class="wk-label">Kundenname</label>'
    +'<input type="text" class="wk-input" id="le-client_name" value="'+h(l.client_name)+'" placeholder="z.B. BMW AG M&uuml;nchen"></div>'
    +'<div class="wk-form-group"><label class="wk-label">Einsatzort / Adresse</label>'
    +'<input type="text" class="wk-input" id="le-location_address" value="'+h(l.location_address)+'" placeholder="z.B. Lerchenauer Str. 31, 80809 M&uuml;nchen"></div>'
    +'<div class="wk-form-group"><label class="wk-label">Treffpunkt</label>'
    +'<input type="text" class="wk-input" id="le-meeting_point" value="'+h(l.meeting_point)+'" placeholder="z.B. Haupteingang, Pforte A"></div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">Startdatum <span class="required">*</span></label>'
    +'<input type="date" class="wk-input" id="le-start_date" value="'+dv(l.start_date)+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">Enddatum</label>'
    +'<input type="date" class="wk-input" id="le-end_date" value="'+dv(l.end_date)+'"></div>'
    +'</div>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">Arbeitszeiten</div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">Schichtbeginn</label>'
    +'<input type="time" class="wk-input" id="le-default_shift_start" value="'+tv(l.default_shift_start)+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">Schichtende</label>'
    +'<input type="time" class="wk-input" id="le-default_shift_end" value="'+tv(l.default_shift_end)+'"></div>'
    +'</div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">Stunden / Tag</label>'
    +'<input type="number" class="wk-input" id="le-default_hours_per_day" value="'+nv(l.default_hours_per_day)+'" min="0.5" max="24" step="0.5" placeholder="8"></div>'
    +'<div class="wk-form-group"><label class="wk-label">Pause (Minuten)</label>'
    +'<input type="number" class="wk-input" id="le-default_break_minutes" value="'+nv(l.default_break_minutes)+'" min="0" max="120" step="5" placeholder="30"></div>'
    +'</div>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">Einsatzanweisungen</div>'
    +'<div class="wk-form-group"><label class="wk-label">Anweisungen</label>'
    +'<textarea class="wk-textarea" id="le-instructions" rows="3" placeholder="Sicherheitseinweisungen, Zugangscodes, besondere Hinweise&hellip;">'+h(l.instructions)+'</textarea></div>'
    +'<div class="wk-form-group"><label class="wk-label">Kleidung / Ausr&uuml;stung</label>'
    +'<input type="text" class="wk-input" id="le-dress_code" value="'+h(l.dress_code)+'" placeholder="z.B. Sicherheitsschuhe und Warnweste erforderlich"></div>'
    +'<div class="wk-form-group"><label class="wk-label">Interne Notizen <span style="font-weight:400;color:var(--wk-text-muted)">(nicht f&uuml;r Arbeitnehmer)</span></label>'
    +'<textarea class="wk-textarea" id="le-notes" rows="2" placeholder="Interne Hinweise&hellip;">'+h(l.notes)+'</textarea></div>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">Ansprechpartner vor Ort</div>'
    +'<div class="wk-form-group"><label class="wk-label">Name</label>'
    +'<input type="text" class="wk-input" id="le-contact_name" value="'+h(l.contact_name)+'" placeholder="z.B. Max Meier"></div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">Telefon</label>'
    +'<input type="tel" class="wk-input" id="le-contact_phone" value="'+h(l.contact_phone)+'" placeholder="+49 89 &hellip;"></div>'
    +'<div class="wk-form-group"><label class="wk-label">E-Mail</label>'
    +'<input type="email" class="wk-input" id="le-contact_email" value="'+h(l.contact_email)+'" placeholder="kontakt@firma.de"></div>'
    +'</div>'
    +'</div>'
    +'<div class="drw-section">'
    +'<div class="drw-section-title">Disponent / Interner Ansprechpartner</div>'
    +'<div class="wk-form-group"><label class="wk-label">Name</label>'
    +'<input type="text" class="wk-input" id="le-dispatcher_name" value="'+h(l.dispatcher_name)+'" placeholder="z.B. Sabine Huber"></div>'
    +'<div class="drw-grid-2">'
    +'<div class="wk-form-group"><label class="wk-label">Telefon</label>'
    +'<input type="tel" class="wk-input" id="le-dispatcher_phone" value="'+h(l.dispatcher_phone)+'" placeholder="+49 170 &hellip;"></div>'
    +'<div class="wk-form-group"><label class="wk-label">E-Mail</label>'
    +'<input type="email" class="wk-input" id="le-dispatcher_email" value="'+h(l.dispatcher_email)+'" placeholder="disponent@agentur.de"></div>'
    +'</div>'
    +'</div>'
    +'<div id="lnkErr" style="display:none;padding:10px 12px;background:var(--tc-tone-danger-bg);border-radius:8px;font-size:.83rem;color:var(--tc-tone-danger-text);border-left:3px solid var(--wk-danger);margin-top:4px"></div>';
  document.getElementById('lnkDrwOvl').classList.add('on');
  document.getElementById('lnkDrw').classList.add('on');
  requestAnimationFrame(function(){document.getElementById('lnkDrwBody').scrollTop=0;});
}
function closeLnkDrw(){
  document.getElementById('lnkDrwOvl').classList.remove('on');
  document.getElementById('lnkDrw').classList.remove('on');
  editingLinkId=null;
}
async function saveLnkEdit(){
  if(!ensurePermission('workerEdit','Sie koennen Einsatzkonfigurationen nicht speichern.'))return;
  if(!editingLinkId)return;
  const gs=id=>{const e=document.getElementById('le-'+id);return e?e.value.trim()||null:undefined;};
  const body={};
  ['client_name','location_address','meeting_point','instructions','dress_code',
   'contact_name','contact_phone','contact_email','dispatcher_name','dispatcher_phone','dispatcher_email','notes'
  ].forEach(f=>{const v=gs(f);if(v!==undefined)body[f]=v;});
  const sd=document.getElementById('le-start_date')?.value?.trim();
  if(sd)body.start_date=sd;
  body.end_date=document.getElementById('le-end_date')?.value?.trim()||null;
  body.default_shift_start=document.getElementById('le-default_shift_start')?.value?.trim()||null;
  body.default_shift_end=document.getElementById('le-default_shift_end')?.value?.trim()||null;
  const hp=document.getElementById('le-default_hours_per_day')?.value?.trim();
  if(hp)body.default_hours_per_day=parseFloat(hp);
  const bm=document.getElementById('le-default_break_minutes')?.value?.trim();
  if(bm)body.default_break_minutes=parseInt(bm,10);
  const err=document.getElementById('lnkErr');
  if(!sd){err.textContent='Startdatum ist erforderlich.';err.style.display='block';return;}
  err.style.display='none';
  const btn=document.getElementById('lnkSaveBtn');
  btn.disabled=true;btn.textContent='Wird gespeichert\u2026';
  try{
    const csrf=await getCsrf();
    const r=await fetch(`${API}/worker-assignment-links/${editingLinkId}`,{
      method:'PATCH',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify(body)
    });
    const d=await r.json();
    if(!r.ok){
      let msg=d.error||d.message||'Fehler';
      if(d.error==='VALIDATION'&&d.details?.[0])msg='Ung\u00fcltige Eingabe: '+(d.details[0].message||d.details[0].path?.join('.')||'');
      throw new Error(msg);
    }
    const idx=allLinks.findIndex(l=>l.id===editingLinkId);
    if(idx>=0)allLinks[idx]=Object.assign({},allLinks[idx],d);
    toast('Einsatz-Konfiguration gespeichert \u2713','success');
    closeLnkDrw();renderAsgns();setAsgnKpis();
  }catch(e){err.textContent=e.message||'Fehler beim Speichern';err.style.display='block';}
  finally{btn.disabled=false;btn.textContent='\u00c4nderungen speichern';}
}
async function viewWorkerLinks(workerId){
  if(!pageAccess.tabs.asgn){
    toast('Einsatzverknuepfungen sind fuer Ihre aktuelle Rolle nicht freigeschaltet.','error');
    return;
  }
  const w=allWrks.find(x=>(x.id||x.user_id)===workerId);
  if(!w)return;
  setStaffingWorkerPrefill(workerId);
  const name=((w.first_name||'')+' '+(w.last_name||'')).trim();
  asgnQuery=name.toLowerCase();
  asgnFilter='all';
  const inp=document.getElementById('aSearch');
  if(inp)inp.value=name;
  document.querySelectorAll('.asgn-status-btns .rev-pill').forEach(function(b,i){b.classList.toggle('on',i===1);});
  await switchTab('asgn');
  applyStaffingWorkerPrefill(workerId);
  if(linksLoaded)renderAsgns();
}
/* ── P1.1: Ersatz bei Krankheit/Ausfall (Chef weist Ersatz ab Wirk-Datum zu) ──── */
let replacingLinkId=null;
function openReplaceModal(id){
  if(!ensurePermission('workerEdit','Sie koennen Einsaetze sehen, aber nicht bearbeiten.'))return;
  var l=allLinks.find(function(x){return x.id===id;});
  if(!l){toast('Einsatz nicht gefunden.','error');return;}
  replacingLinkId=id;
  var ailingId=l.worker_user_id;
  var wname=function(w){return ((w.first_name||'')+' '+(w.last_name||'')).trim()||w.email||w.worker_email||w.personnel_number||'Arbeiter';};
  var cands=(allWrks||[]).filter(function(w){var uid=w.user_id||w.id;return w.is_active!==false&&uid&&uid!==ailingId;})
    .sort(function(a,b){return wname(a).localeCompare(wname(b),'de');});
  var opts=cands.map(function(w){var uid=w.user_id||w.id;return '<option value="'+esc(String(uid))+'">'+esc(wname(w))+(w.personnel_number?' ('+esc(String(w.personnel_number))+')':'')+'</option>';}).join('');
  var todayIso=(function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
  var ailingName=esc(((l.first_name||'')+' '+(l.last_name||'')).trim()||'Arbeiter');
  var client=l.client_name?(' · '+esc(String(l.client_name))):'';
  var endInfo=l.end_date?('Der Ersatz übernimmt bis zum Original-Enddatum ('+esc(fmtD(l.end_date))+').'):'Der Ersatz übernimmt den offenen Einsatz.';
  var body=''
    +'<div class="wk-alert wk-alert-info" style="margin-bottom:18px;font-size:.83rem;line-height:1.5">'
    +'<span>&#8644;</span><span><strong>'+ailingName+'</strong>'+client+' wird ab dem Wirk-Datum aus dem Einsatz herausgenommen und freigestellt. '+endInfo+' Bereits geleistete Tage bleiben abrechenbar.</span>'
    +'</div>'
    +'<div class="wk-form-group"><label class="wk-label">Wirk-Datum (ab wann Ersatz) <span class="required">*</span></label>'
    +'<input type="date" class="wk-input" id="rep-date" value="'+todayIso+'"></div>'
    +'<div class="wk-form-group"><label class="wk-label">Ersatz-Arbeiter <span class="required">*</span></label>'
    +(cands.length?('<select class="wk-input" id="rep-worker"><option value="">– Bitte wählen –</option>'+opts+'</select>')
      :('<div class="wk-alert wk-alert-warning" style="font-size:.82rem">Keine weiteren aktiven Arbeiter in Ihrer Organisation verfügbar.</div>'))
    +'</div>'
    +'<div class="wk-form-group"><label class="wk-label">Grund <span class="required">*</span></label>'
    +'<textarea class="wk-textarea" id="rep-reason" rows="2" placeholder="z.B. Krankmeldung, Ausfall, Kundenwunsch…"></textarea></div>'
    +'<div id="repErr" style="display:none;padding:10px 12px;background:var(--tc-tone-danger-bg,#fef1f1);border-radius:8px;font-size:.83rem;color:var(--tc-tone-danger-text,#b42318);border-left:3px solid var(--wk-danger,#e5484d);margin-top:4px"></div>';
  var ovl=document.getElementById('repModalOvl');
  if(!ovl){
    ovl=document.createElement('div');ovl.id='repModalOvl';
    ovl.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px';
    ovl.addEventListener('click',function(e){if(e.target===ovl)closeReplaceModal();});
    var box=document.createElement('div');box.id='repModalBox';
    box.style.cssText='background:var(--wk-surface,#fff);border-radius:14px;max-width:460px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35)';
    ovl.appendChild(box);document.body.appendChild(ovl);
  }
  document.getElementById('repModalBox').innerHTML=''
    +'<div style="padding:20px 22px 0"><div style="font-size:1.05rem;font-weight:700;color:var(--wk-text,#0f172a)">Ersatz zuweisen</div>'
    +'<div style="font-size:.82rem;color:var(--wk-text-muted,#64748b);margin-top:2px">Krankheit / Ausfall – zeitgenau ab Wirk-Datum</div></div>'
    +'<div style="padding:18px 22px">'+body+'</div>'
    +'<div style="display:flex;gap:10px;justify-content:flex-end;padding:0 22px 20px">'
    +'<button class="wk-btn wk-btn-sm" style="background:var(--wk-surface-2,#f1f5f9);color:var(--wk-text,#0f172a)" onclick="closeReplaceModal()">Abbrechen</button>'
    +'<button class="wk-btn wk-btn-sm" id="repSubmitBtn" style="background:var(--wk-danger,#e5484d);color:#fff" '+(cands.length?'':'disabled')+' onclick="submitReplace()">&#8644; Ersatz zuweisen</button>'
    +'</div>';
  ovl.style.display='flex';
}
function closeReplaceModal(){
  var ovl=document.getElementById('repModalOvl');
  if(ovl)ovl.style.display='none';
  replacingLinkId=null;
}
async function submitReplace(){
  if(!ensurePermission('workerEdit','Sie koennen keinen Ersatz zuweisen.'))return;
  if(!replacingLinkId)return;
  var err=document.getElementById('repErr');
  var showErr=function(m){if(err){err.textContent=m;err.style.display='block';}};
  var date=(document.getElementById('rep-date')&&document.getElementById('rep-date').value||'').trim();
  var worker=(document.getElementById('rep-worker')&&document.getElementById('rep-worker').value||'').trim();
  var reason=(document.getElementById('rep-reason')&&document.getElementById('rep-reason').value||'').trim();
  if(!date){showErr('Bitte ein Wirk-Datum wählen.');return;}
  if(!worker){showErr('Bitte einen Ersatz-Arbeiter wählen.');return;}
  if(reason.length<3){showErr('Bitte einen Grund angeben (mind. 3 Zeichen).');return;}
  showErr('');err.style.display='none';
  var btn=document.getElementById('repSubmitBtn');
  if(btn){btn.disabled=true;btn.textContent='Wird zugewiesen…';}
  try{
    var csrf=await getCsrf();
    var r=await fetch(`${API}/worker-assignment-links/${replacingLinkId}/replace`,{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({replacement_worker_user_id:worker,effective_date:date,reason:reason})
    });
    var d=await r.json().catch(function(){return {};});
    if(!r.ok){
      var msg=d.error||d.message||'Fehler';
      var map={NOT_FOUND:'Einsatz nicht gefunden.',LINK_NOT_ACTIVE:'Dieser Einsatz ist nicht aktiv.',SAME_WORKER:'Ersatz und Ausfallender dürfen nicht identisch sein.',REPLACEMENT_NOT_IN_ORG:'Der gewählte Arbeiter gehört nicht zu Ihrer Organisation.',REPLACEMENT_INACTIVE:'Der gewählte Arbeiter ist inaktiv.',SCHEDULE_CONFLICT:'Der gewählte Ersatz ist im Zeitraum bereits in einem anderen Einsatz gebucht. Bitte anderen Arbeiter oder Wirk-Datum wählen.'};
      if(d.error==='VALIDATION'&&d.details&&d.details[0])msg='Ungültige Eingabe: '+(d.details[0].message||'');
      else if(map[d.error])msg=map[d.error];
      throw new Error(msg);
    }
    toast('Ersatz zugewiesen ✓ Ausfallender ab '+fmtD(date)+' freigestellt.','success');
    closeReplaceModal();
    await loadAsgn();
  }catch(e){showErr(e.message||'Fehler bei der Ersatz-Zuweisung');}
  finally{if(btn){btn.disabled=false;btn.innerHTML='&#8644; Ersatz zuweisen';}}
}
/* ── P1.4: Vorausplanung — Timeline je Arbeiter (clientseitig aus allLinks) ────── */
var asgnViewMode='cards';
var planMonth=null; // Date am 1. des angezeigten Monats
function setAsgnView(mode,btn){
  asgnViewMode=mode;
  document.querySelectorAll('#asgnViewToggle .rev-pill').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  var cards=mode==='cards';
  var grid=document.getElementById('asgnGrid');
  var plan=document.getElementById('planungView');
  var statusBtns=document.getElementById('asgnStatusBtns');
  if(grid)grid.style.display=cards?'':'none';
  if(plan)plan.style.display=cards?'none':'block';
  if(statusBtns)statusBtns.style.display=cards?'':'none';
  if(cards){ renderAsgns(); }
  else{ if(!planMonth){var n=new Date();planMonth=new Date(n.getFullYear(),n.getMonth(),1);} renderPlanungView(); }
}
function planShiftMonth(delta){
  if(!planMonth){var n=new Date();planMonth=new Date(n.getFullYear(),n.getMonth(),1);}
  planMonth=new Date(planMonth.getFullYear(),planMonth.getMonth()+delta,1);
  renderPlanungView();
}
function planToday(){ var n=new Date();planMonth=new Date(n.getFullYear(),n.getMonth(),1);renderPlanungView(); }
function renderPlanungView(){
  var host=document.getElementById('planungView');
  if(!host)return;
  if(!planMonth){var n0=new Date();planMonth=new Date(n0.getFullYear(),n0.getMonth(),1);}
  var y=planMonth.getFullYear(), m=planMonth.getMonth();
  var monthStart=new Date(y,m,1), monthEnd=new Date(y,m+1,0);
  var daysInMonth=monthEnd.getDate();
  var monthLabel=planMonth.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
  var pad=function(n){return String(n).padStart(2,'0');};
  var iso=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
  var monthStartIso=iso(monthStart), monthEndIso=iso(monthEnd);
  var td=new Date(); var todayIso=iso(new Date(td.getFullYear(),td.getMonth(),td.getDate()));
  var parseD=function(s){return s?String(s).substring(0,10):null;};
  var wname=function(l){return ((l.first_name||'')+' '+(l.last_name||'')).trim()||l.worker_email||'Arbeiter';};
  var esc2=function(s){return esc(String(s==null?'':s));};
  var dayPct=100/daysInMonth;
  var colFor=function(d){return (d-1)*dayPct;};

  // Links, die den Monat berühren (Datumsfenster-Überschneidung)
  var linksInMonth=(allLinks||[]).filter(function(l){
    var s=parseD(l.start_date); if(!s)return false;
    var e=parseD(l.end_date)||'9999-12-31';
    return s<=monthEndIso && e>=monthStartIso;
  });
  var byWorker=new Map();
  linksInMonth.forEach(function(l){
    var k=l.worker_user_id||l.id;
    if(!byWorker.has(k))byWorker.set(k,{name:wname(l),id:k,links:[]});
    byWorker.get(k).links.push(l);
  });
  var workers=Array.from(byWorker.values()).sort(function(a,b){return a.name.localeCompare(b.name,'de');});

  // Tagesraster (Hintergrund) + Wochen-Ticks
  var gridCols='', tickRow='';
  for(var d=1; d<=daysInMonth; d++){
    var dt=new Date(y,m,d); var we=(dt.getDay()===0||dt.getDay()===6);
    gridCols+='<div class="plan-daycol'+(we?' we':'')+'" style="left:'+colFor(d)+'%;width:'+dayPct+'%"></div>';
    if(dt.getDay()===1||d===1){ tickRow+='<div class="plan-tick" style="left:'+(colFor(d)+dayPct/2)+'%">'+d+'</div>'; }
  }
  var todayMarker='';
  if(todayIso>=monthStartIso && todayIso<=monthEndIso){
    todayMarker='<div class="plan-today" style="left:'+(colFor(td.getDate())+dayPct/2)+'%" title="Heute"></div>';
  }
  var blockClass=function(l){
    if(l.worker_confirmation_status==='worker_unavailable')return 'pb-unavail';
    var s=parseD(l.start_date), e=parseD(l.end_date)||'9999-12-31';
    if(e<todayIso)return 'pb-past';
    if(l.assignment_lifecycle_state==='ends_today'||e===todayIso)return 'pb-ends';
    if(s>todayIso)return 'pb-planned';
    return 'pb-active';
  };
  var rowFor=function(w){
    var blocks=w.links.map(function(l){
      var s=parseD(l.start_date), e=parseD(l.end_date)||monthEndIso;
      var cs=s<monthStartIso?1:parseInt(s.substring(8,10),10);
      var ce=e>monthEndIso?daysInMonth:parseInt(e.substring(8,10),10);
      if(ce<cs)ce=cs;
      var left=colFor(cs);
      var width=Math.max(dayPct*0.6,(ce-cs+1)*dayPct);
      var label=l.client_name||l.location_address||l.worker_description||'Einsatz';
      var range=(l.start_date?fmtD(l.start_date):'?')+(l.end_date?(' – '+fmtD(l.end_date)):' (offen)');
      var contL=(s<monthStartIso?'‹ ':''), contR=(e>monthEndIso?' ›':'');
      return '<div class="plan-block '+blockClass(l)+'" style="left:'+left+'%;width:'+width+'%" '
        +'title="'+esc2(label)+' · '+esc2(range)+'" onclick="openLnkDrwById(\''+esc2(l.id)+'\')">'
        +esc2(contL+label+contR)+'</div>';
    }).join('');
    var planBtn=pageAccess.permissions.workerEdit
      ? '<button class="wk-btn wk-btn-sm wk-btn-outline plan-plusbtn" title="Einsatz für diesen Arbeiter planen" onclick="planBlockForWorker(\''+esc2(w.id)+'\')">+ Block</button>'
      : '<span class="plan-plusbtn" style="width:74px"></span>';
    return '<div class="plan-row">'
      +'<div class="plan-name">'+esc2(w.name)+'<small>'+w.links.length+' Einsatz'+(w.links.length===1?'':'e')+' im Monat</small></div>'
      +'<div class="plan-track">'+gridCols+todayMarker+blocks+'</div>'
      +planBtn+'</div>';
  };
  var legend='<div class="plan-legend">'
    +'<span><i style="background:var(--wk-success,#12a150)"></i>Aktiv</span>'
    +'<span><i style="background:var(--hub-accent,#3b82f6)"></i>Geplant</span>'
    +'<span><i style="background:var(--wk-warning,#d97706)"></i>Endet</span>'
    +'<span><i style="background:var(--wk-text-muted,#94a3b8)"></i>Vergangen</span>'
    +'<span><i style="background:var(--wk-danger,#e5484d)"></i>Freigestellt</span></div>';
  var nav='<div class="plan-nav">'
    +'<button class="wk-btn wk-btn-sm wk-btn-outline" onclick="planShiftMonth(-1)" title="Vormonat">&#8249;</button>'
    +'<div class="plan-month">'+esc2(monthLabel)+'</div>'
    +'<button class="wk-btn wk-btn-sm wk-btn-outline" onclick="planShiftMonth(1)" title="Folgemonat">&#8250;</button>'
    +'<button class="wk-btn wk-btn-sm" onclick="planToday()">Heute</button>'
    +'<button class="wk-btn wk-btn-sm wk-btn-outline" onclick="planDownloadPdf()" title="Monats-Einsatzplan als PDF herunterladen (abrechnungsrelevant)">&#8681; PDF</button>'
    +legend+'</div>';
  if(!workers.length){
    host.innerHTML=nav+'<div class="hub-empty" style="display:block"><h3>Keine Einsätze in '+esc2(monthLabel)+'</h3><p>Für diesen Monat sind keine Einsätze geplant. Wechsle den Monat oder plane einen Block.</p></div>';
    return;
  }
  var axisHead='<div class="plan-head"><div class="plan-name"></div><div class="plan-track plan-axis">'+gridCols+tickRow+todayMarker+'</div><span class="plan-plusbtn" style="width:74px"></span></div>';
  host.innerHTML=nav+'<div class="plan-grid">'+axisHead+workers.map(rowFor).join('')+'</div>';
}
function planDownloadPdf(){
  if(!planMonth){var n=new Date();planMonth=new Date(n.getFullYear(),n.getMonth(),1);}
  var y=planMonth.getFullYear(), mo=planMonth.getMonth()+1;
  window.open(API+'/supplier/plan/monthly.pdf?year='+y+'&month='+mo,'_blank');
}
function planBlockForWorker(workerId){
  if(!ensurePermission('workerEdit','Sie können keine Einsätze planen.'))return;
  if(typeof setStaffingWorkerPrefill==='function')setStaffingWorkerPrefill(workerId);
  if(typeof openAssignDrw==='function'){
    openAssignDrw();
    if(typeof applyStaffingWorkerPrefill==='function')applyStaffingWorkerPrefill(workerId);
  }
}
/* UTILS */
function confBadge(s){
  const m={
    pending_confirmation:'<span class="pill pill-warn" style="margin-left:6px">? Bestätigung offen</span>',
    worker_confirmed:'<span class="pill pill-act" style="margin-left:6px">? Bestätigt</span>',
    worker_declined:'<span class="pill pill-danger" style="margin-left:6px">? Abgelehnt</span>'
  };
  return m[s]||'';
}
// P2.1: Einreichfrist-Indikator — überfällig (offen + Frist verstrichen) / verspätet (nach Frist abgegeben) / Frist-Hinweis.
function subDeadlineTag(s){
  if(!s)return'';
  if(s.is_overdue) return ' <span class="wk-badge" style="background:var(--wk-danger,#e5484d);color:#fff" title="Einreichfrist verstrichen, noch nicht eingereicht">Überfällig</span>';
  if(s.submitted_late) return ' <span class="wk-badge" style="background:var(--wk-warning,#d97706);color:#fff" title="Nach der Einreichfrist abgegeben">Verspätet</span>';
  if((s.status==='draft'||s.status==='needs_correction') && s.submission_deadline)
    return ' <span style="font-size:.72rem;color:var(--wk-text-muted)" title="Einreichfrist">· Frist '+esc(fmtD(s.submission_deadline))+'</span>';
  return '';
}
function badge(s){
  const m={
    draft:                  '<span class="wk-badge wk-badge-draft">Entwurf</span>',
    submitted:              '<span class="wk-badge wk-badge-submitted">Eingereicht</span>',
    under_review:           '<span class="wk-badge wk-badge-under-review">In Pr\u00fcfung</span>',
    needs_correction:       '<span class="wk-badge wk-badge-needs-correction">Korrektur</span>',
    approved_internal:      '<span class="wk-badge wk-badge-approved-internal">Intern gepr\u00fcft</span>',
    sent_to_customer:       '<span class="wk-badge wk-badge-sent-to-customer">Beim Kunden</span>',
    customer_confirmed:     '<span class="wk-badge wk-badge-cust-confirmed">\u2713 Vom Kunden best\u00e4tigt</span>',
    customer_rejected:      '<span class="wk-badge wk-badge-cust-rejected">\u26a0 Vom Kunden abgelehnt</span>',
    posted_to_timesheet:    '<span class="wk-badge wk-badge-posted">\u2713 In Abrechnung</span>',
    accepted_into_timesheet:'<span class="wk-badge wk-badge-accepted">\u2713 Angenommen</span>',
    rejected:               '<span class="wk-badge wk-badge-rejected">Abgelehnt</span>'
  };
  return m[s]||`<span class="wk-badge wk-badge-draft">${esc(s)}</span>`;
}
function stLbl(s){
  const m={
    submitted:'Eingereicht',under_review:'In Pr\u00fcfung',needs_correction:'Korrektur ausstehend',
    approved_internal:'Intern gepr\u00fcft',sent_to_customer:'Beim Kunden',
    customer_confirmed:'Vom Kunden best\u00e4tigt',customer_rejected:'Vom Kunden abgelehnt',
    posted_to_timesheet:'In Abrechnung',accepted_into_timesheet:'\u00dcbertragen',
    rejected:'Abgelehnt',draft:'Entwurf'
  };
  return m[s]||s;
}
function evLbl(t){
  const m={created:'erstellt',submitted:'eingereicht',review_started:'Pr\u00fcfung gestartet',
    correction_requested:'Korrektur angefordert',corrected:'korrigiert',
    approved_internal:'intern genehmigt',sent_to_customer:'an Kunden gesendet',
    customer_confirmed:'vom Kunden best\u00e4tigt',customer_rejected:'vom Kunden abgelehnt',
    posted_to_timesheet:'in Abrechnung gebucht',
    accepted:'ins Timesheet \u00fcbernommen',rejected:'abgelehnt',comment_added:'kommentiert'
  };
  return m[t]||t;
}
function evClr(t){
  if(['accepted','approved_internal','customer_confirmed','posted_to_timesheet'].includes(t))return 'g';
  if(['review_started','sent_to_customer'].includes(t))return 'b';
  if(['correction_requested','customer_rejected'].includes(t))return 'o';
  if(t==='rejected')return 'r';
  return '';
}
function fmtWeek(st,en){if(!st)return'';const s=new Date(st),e=new Date(en||st);const fmt=d=>d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});return `KW ${kw(s)} – ${fmt(s)} – ${fmt(e)}`;}
function fmtD(d){return new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});}
function dayN(d){return['So','Mo','Di','Mi','Do','Fr','Sa'][new Date(d).getDay()];}
function kw(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=t.getUTCFullYear();return Math.floor((t-new Date(Date.UTC(y,0,1)))/604800000)+1;}
function relT(d){const s=(Date.now()-new Date(d).getTime())/1000;if(s<60)return'gerade eben';if(s<3600)return`vor ${Math.floor(s/60)} Min.`;if(s<86400)return`vor ${Math.floor(s/3600)} Std.`;return`vor ${Math.floor(s/86400)} Tagen`;}
function aColor(n){const c=['background:linear-gradient(135deg,var(--ds-brand),var(--ds-accent))','background:linear-gradient(135deg,var(--ds-success),var(--ds-brand-hover))','background:linear-gradient(135deg,var(--ds-warning),var(--ds-danger))','background:linear-gradient(135deg,var(--ds-accent),var(--ds-brand-hover))','background:linear-gradient(135deg,var(--ds-brand-hover),var(--ds-success))'];let h=0;for(let i=0;i<(n||'').length;i++)h=(h*31+(n||'').charCodeAt(i))&0xffffffff;return c[Math.abs(h)%c.length];}
function esc(s){return String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]||c));}
function toast(msg,type=''){const t=document.getElementById('wk-toast');t.textContent=msg;t.className=type?`show ${type}`:'show';setTimeout(()=>t.className='',3500);}

/* ── Expose functions called from HTML onclick handlers ────── */
window.reloadAll = reloadAll;
window.setFilter = setFilter;
window.selSub = selSub;
window.switchTab = switchTab;
window.togNote = togNote;
window.doAct = doAct;
window.doActSend = doActSend;
window.doActConf = doActConf;
window.doActCRej = doActCRej;
window.sendBundleByKey = sendBundleByKey;
window.previewBundleScope = previewBundleScope;
window.openBundleDetail = openBundleDetail;
window.downloadBundleCsv = downloadBundleCsv;
window.postBundle = postBundle;
window.onBundlePeriodModeChange = onBundlePeriodModeChange;
window.renderBundleDetailTable = renderBundleDetailTable;
window.openSubmissionFromBundle = openSubmissionFromBundle;
window.closeBundleModal = closeBundleModal;
window.filterW = filterW;
window.togWrk = togWrk;
window.resendInv = resendInv;
window.revokeInv = revokeInv;
window.openWorkerAssignDrw = openWorkerAssignDrw;
window.closeWorkerAssignDrw = closeWorkerAssignDrw;
window.toggleWorkerAssignAssignment = toggleWorkerAssignAssignment;
window.refreshWorkerAssignmentCardContext = refreshWorkerAssignmentCardContext;
window.quickAssignWorkerFromDrawer = quickAssignWorkerFromDrawer;
window.manualAssignWorkerFromDrawer = manualAssignWorkerFromDrawer;
window.openWorkerAssignmentInStaffingTab = openWorkerAssignmentInStaffingTab;
window.openDrw = openDrw;
window.closeDrw = closeDrw;
window.sendInv = sendInv;
window.openCreateDrw = openCreateDrw;
window.closeCreateDrw = closeCreateDrw;
window.submitCreate = submitCreate;
window.openAssignDrw = openAssignDrw;
window.closeAssignDrw = closeAssignDrw;
window.onCapSelect = onCapSelect;
window.submitAssign = submitAssign;
window.retryLoadAssignData = retryLoadAssignData;
window.assignDealWorker = assignDealWorker;
window.setAsgnFilter = setAsgnFilter;
window.filterAsgn = filterAsgn;
window.openLnkDrwById = openLnkDrwById;
window.closeLnkDrw = closeLnkDrw;
window.saveLnkEdit = saveLnkEdit;
window.viewWorkerLinks = viewWorkerLinks;
window.openReplaceModal = openReplaceModal;
window.closeReplaceModal = closeReplaceModal;
window.submitReplace = submitReplace;
window.setAsgnView = setAsgnView;
window.planShiftMonth = planShiftMonth;
window.planToday = planToday;
window.planDownloadPdf = planDownloadPdf;
window.planBlockForWorker = planBlockForWorker;
