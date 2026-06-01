"use strict";

  (function(){
    "use strict";
    var API = "/api/company-profile";
    var data = null;
    var csrfToken = "";

    function esc(s){ var d=document.createElement("div"); d.textContent=s||""; return d.innerHTML; }
    function $(id){ return document.getElementById(id); }
    function toast(msg, ok){
      var t=$("ep-toast"); t.textContent=msg;
      t.style.background=ok===false?"var(--ds-danger)":"var(--ds-success)";
      t.classList.add("show"); setTimeout(function(){ t.classList.remove("show"); },2600);
    }
    async function api(path, opts){
      if(!opts) opts={};
      opts.credentials="include";
      if(!opts.headers) opts.headers={};
      if(csrfToken) opts.headers["x-csrf-token"]=csrfToken;
      if(opts.body && typeof opts.body==="object" && !(opts.body instanceof FormData)){
        opts.headers["Content-Type"]="application/json";
        opts.body=JSON.stringify(opts.body);
      }
      var r=await fetch(path, opts);
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.json();
    }
    function fieldVal(obj, key){
      var v=(obj&&obj[key])||"";
      if(Array.isArray(v)) return v.join(", ");
      return String(v).trim();
    }

    async function fetchCsrf(){
      try{ var r=await fetch("/api/csrf",{credentials:"include"}); var d=await r.json(); csrfToken=d.csrfToken||d.token||""; }catch(e){ /* non-critical: CSRF fetch may fail on first load */ }
    }

    async function load(){
      try{
        await fetchCsrf();
        var res=await api(API);
        data=res.data||res;
        $("ep-loading").style.display="none";
        $("ep-main").style.display="grid";
        $("preview-btn").style.display="inline-flex";
        renderAll();
      }catch(e){
        $("ep-loading").innerHTML="<p style='color:var(--ds-danger)'>Profil konnte nicht geladen werden. Bitte einloggen.</p>";
      }
    }

    function renderAll(){
      renderCompleteness();
      renderOverview();
      renderBasic();
      renderCapabilities();
      renderLocations();
      renderCerts();
      renderContacts();
      renderScorecard();
      renderCompliance();
    }

    /* -- COMPLETENESS ------------------------------ */
    function renderCompleteness(){
      var c=data.completeness||{percentage:0,sections:[]};
      var pct=c.percentage||0;
      var circ=2*Math.PI*16;
      var offset=circ-(pct/100)*circ;
      $("ring-fg").setAttribute("stroke-dashoffset", offset);
      $("ring-pct").textContent=pct+"%";
      var nav=$("ep-nav");
      var html="";
      var secMap={overview:"sec-overview",capabilities:"sec-capabilities",locations:"sec-locations",certifications:"sec-certifications",contacts:"sec-contacts"};
      (c.sections||[]).forEach(function(s){
        var done=s.complete?"done":"";
        var target=secMap[s.key]||"";
        html+="<button class='ep-nav-item "+done+"' onclick=\"document.getElementById('"+target+"').scrollIntoView({behavior:'smooth',block:'start'})\">";
        html+="<span class='ep-nav-check'>"+(s.complete?"&#10003;":"")+"</span>";
        html+=esc(s.label)+"</button>";
      });
      nav.innerHTML=html;
    }

    /* -- OVERVIEW ---------------------------------- */
    var overviewFields=[
      {key:"legal_name",label:"Rechtlicher Name",full:false},
      {key:"website",label:"Website",full:false},
      {key:"company_description",label:"Beschreibung",full:true,type:"textarea"},
      {key:"year_founded",label:"Gruendungsjahr",full:false},
      {key:"company_size",label:"Unternehmensgroesse",full:false,type:"select",options:["","1-10","11-50","51-200","201-500","501-1000","1001-5000","5000+"]},
      {key:"industry_focus",label:"Branchenfokus",full:false},
      {key:"headquarters_city",label:"Hauptsitz Stadt",full:false},
      {key:"headquarters_country",label:"Hauptsitz Land",full:false},
      {key:"linkedin_url",label:"LinkedIn",full:false},
      {key:"contact_email",label:"Kontakt-Email",full:false},
      {key:"contact_phone",label:"Kontakt-Telefon",full:false},
      {key:"logo_url",label:"Logo URL",full:false}
    ];
    function renderOverview(){
      var p=data.profile||{};
      var html="<div class='ep-form'>";
      overviewFields.forEach(function(f){
        var v=fieldVal(p,f.key)||fieldVal(data.user,f.key);
        html+="<div class='ep-field "+(f.full?"full":"")+"'><label>"+esc(f.label)+"</label><div class='val'>"+(v?esc(v):"<span style='color:var(--ds-text-tertiary)'>–</span>")+"</div></div>";
      });
      html+="</div>";
      $("overview-view").innerHTML=html;
    }
    function renderOverviewEdit(){
      var p=data.profile||{};
      var html="<div class='ep-form'>";
      overviewFields.forEach(function(f){
        var v=fieldVal(p,f.key)||fieldVal(data.user,f.key);
        html+="<div class='ep-field "+(f.full?"full":"")+"'><label>"+esc(f.label)+"</label>";
        if(f.type==="textarea") html+="<textarea id='ov-"+f.key+"'>"+esc(v)+"</textarea>";
        else if(f.type==="select"){
          html+="<select id='ov-"+f.key+"'>";
          (f.options||[]).forEach(function(o){ html+="<option value='"+esc(o)+"'"+(o===v?" selected":"")+">"+esc(o||"Bitte waehlen")+"</option>"; });
          html+="</select>";
        } else html+="<input id='ov-"+f.key+"' value='"+esc(v)+"'/>";
        html+="</div>";
      });
      html+="</div><div class='ep-actions'><button class='ep-btn' onclick='EP.toggleEdit(\"overview\")'>Abbrechen</button><button class='ep-btn ep-btn--primary' onclick='EP.saveOverview()'>Speichern</button></div>";
      $("overview-edit").innerHTML=html;
    }

    /* -- BASIC -------------------------------------- */
    var basicFields=[
      {key:"company_name",label:"Firmenname"},
      {key:"contact_person",label:"Ansprechpartner"},
      {key:"phone",label:"Telefon"},
      {key:"street",label:"Strasse"},
      {key:"postal_code",label:"PLZ"},
      {key:"city",label:"Ort"},
      {key:"vat_id",label:"USt-IdNr"},
      {key:"handelsregister_number",label:"Handelsregister-Nr."}
    ];
    function renderBasic(){
      var u=data.user||{};
      var html="<div class='ep-form'>";
      basicFields.forEach(function(f){
        var v=fieldVal(u,f.key);
        html+="<div class='ep-field'><label>"+esc(f.label)+"</label><div class='val'>"+(v?esc(v):"<span style='color:var(--ds-text-tertiary)'>–</span>")+"</div></div>";
      });
      html+="</div>";
      $("basic-view").innerHTML=html;
    }
    function renderBasicEdit(){
      var u=data.user||{};
      var html="<div class='ep-form'>";
      basicFields.forEach(function(f){
        var v=fieldVal(u,f.key);
        html+="<div class='ep-field'><label>"+esc(f.label)+"</label><input id='ba-"+f.key+"' value='"+esc(v)+"'/></div>";
      });
      html+="</div><div class='ep-actions'><button class='ep-btn' onclick='EP.toggleEdit(\"basic\")'>Abbrechen</button><button class='ep-btn ep-btn--primary' onclick='EP.saveBasic()'>Speichern</button></div>";
      $("basic-edit").innerHTML=html;
    }

    /* -- CAPABILITIES ------------------------------ */
    var capFields=[
      {key:"staff_categories",label:"Personalkategorien"},
      {key:"industries_served",label:"Branchen"},
      {key:"typical_roles",label:"Typische Rollen"},
      {key:"availability_regions",label:"Verfuegbarkeitsregionen"},
      {key:"languages",label:"Sprachen"},
      {key:"specializations",label:"Spezialisierungen"}
    ];
    function renderCapabilities(){
      var c=data.capabilities||{};
      var html="<div class='ep-form'>";
      capFields.forEach(function(f){
        var arr=c[f.key]||[];
        html+="<div class='ep-field'><label>"+esc(f.label)+"</label>";
        if(arr.length){
          html+="<div class='ep-tags'>";
          arr.forEach(function(t){ html+="<span class='ep-tag'>"+esc(t)+"</span>"; });
          html+="</div>";
        } else { html+="<div class='val'><span style='color:var(--ds-text-tertiary)'>–</span></div>"; }
        html+="</div>";
      });
      html+="</div>";
      $("capabilities-view").innerHTML=html;
    }
    var _capDraft={};
    function initCapDraft(){
      var c=data.capabilities||{};
      _capDraft={};
      capFields.forEach(function(f){ _capDraft[f.key]=(c[f.key]||[]).slice(); });
    }
    function renderCapabilitiesEdit(){
      var html="<div class='ep-form'>";
      capFields.forEach(function(f){
        var arr=_capDraft[f.key]||[];
        html+="<div class='ep-field'><label>"+esc(f.label)+" <span style='font-weight:400;text-transform:none;letter-spacing:0'>(Enter zum Hinzufuegen)</span></label>";
        html+="<div class='ep-tags' id='tags-"+f.key+"'>";
        arr.forEach(function(t,i){ html+="<span class='ep-tag'>"+esc(t)+"<span class='x' data-field='"+f.key+"' data-idx='"+i+"'>&times;</span></span>"; });
        html+="<input class='ep-tag-input' data-field='"+f.key+"' placeholder='+' onkeydown='EP.tagKey(event)'/>";
        html+="</div></div>";
      });
      html+="</div><div class='ep-actions'><button class='ep-btn' onclick='EP.toggleEdit(\"capabilities\")'>Abbrechen</button><button class='ep-btn ep-btn--primary' onclick='EP.saveCapabilities()'>Speichern</button></div>";
      $("capabilities-edit").innerHTML=html;
      $("capabilities-edit").querySelectorAll(".x").forEach(function(el){
        el.onclick=function(){ _removeTag(el.dataset.field, parseInt(el.dataset.idx)); };
      });
    }

    /* -- LOCATIONS ---------------------------------- */
    function renderLocations(){
      var locs=data.locations||[];
      if(!locs.length){ $("locations-list").innerHTML="<div class='ep-empty'>Noch keine Standorte hinterlegt.</div>"; return; }
      var html="";
      locs.forEach(function(l){
        html+="<div class='ep-list-item'><div class='ep-list-item__body'>";
        html+="<div class='ep-list-item__title'>"+esc(l.city||"Standort")+(l.is_headquarters?" <span class='ep-badge ep-badge--ok'>HQ</span>":"")+"</div>";
        html+="<div class='ep-list-item__sub'>"+(l.label?esc(l.label)+" – ":"")+(l.postal_code?esc(l.postal_code)+" ":"")+esc(l.country||"")+(l.radius_km?" – Radius: "+l.radius_km+" km":"")+"</div>";
        html+="</div><div class='ep-list-item__actions'>";
        html+="<button class='ep-btn ep-btn--sm ep-btn--danger' onclick='EP.removeLocation("+l.id+")'>&#128465;</button>";
        html+="</div></div>";
      });
      $("locations-list").innerHTML=html;
    }

    /* -- CERTIFICATIONS ---------------------------- */
    function renderCerts(){
      var certs=data.certifications||[];
      if(!certs.length){ $("certs-list").innerHTML="<div class='ep-empty'>Noch keine Zertifizierungen hinterlegt.</div>"; return; }
      var html="";
      certs.forEach(function(c){
        var badge=c.is_expired?"ep-badge--miss":c.status==="active"?"ep-badge--ok":"ep-badge--warn";
        var label=c.is_expired?"Abgelaufen":c.status==="active"?"Aktiv":esc(c.status||"");
        html+="<div class='ep-list-item'><div class='ep-list-item__body'>";
        html+="<div class='ep-list-item__title'>"+esc(c.cert_name)+" <span class='ep-badge "+badge+"'>"+label+"</span></div>";
        html+="<div class='ep-list-item__sub'>"+(c.cert_type?esc(c.cert_type)+" – ":"")+(c.issuer?"Aussteller: "+esc(c.issuer):"")+(c.expires_at?" – Ablauf: "+new Date(c.expires_at).toLocaleDateString("de-DE"):"")+"</div>";
        html+="</div><div class='ep-list-item__actions'>";
        html+="<button class='ep-btn ep-btn--sm ep-btn--danger' onclick='EP.removeCert("+c.id+")'>&#128465;</button>";
        html+="</div></div>";
      });
      $("certs-list").innerHTML=html;
    }

    /* -- CONTACTS ----------------------------------- */
    function renderContacts(){
      var list=data.contacts||[];
      if(!list.length){ $("contacts-list").innerHTML="<div class='ep-empty'>Noch keine Ansprechpartner hinterlegt.</div>"; return; }
      var html="";
      list.forEach(function(c){
        html+="<div class='ep-list-item'><div class='ep-list-item__body'>";
        html+="<div class='ep-list-item__title'>"+esc(c.name)+(c.is_primary?" <span class='ep-badge ep-badge--ok'>Primaer</span>":"")+"</div>";
        html+="<div class='ep-list-item__sub'>"+(c.role_title?esc(c.role_title)+" – ":"")+(c.email?esc(c.email):"")+(c.phone?" – "+esc(c.phone):"")+"</div>";
        html+="</div><div class='ep-list-item__actions'>";
        html+="<button class='ep-btn ep-btn--sm ep-btn--danger' onclick='EP.removeContact("+c.id+")'>&#128465;</button>";
        html+="</div></div>";
      });
      $("contacts-list").innerHTML=html;
    }

    /* -- SCORECARD ---------------------------------- */
    function renderScorecard(){
      var s=data.scorecard;
      if(!s||!s.grade){ $("scorecard-widget").style.display="none"; return; }
      var colors={A:"var(--ds-success)",B:"var(--ds-warning)",C:"var(--ds-danger)"};
      var bg={A:"var(--ds-success-muted)",B:"var(--ds-warning-muted)",C:"var(--ds-danger-muted)"};
      var html="<div class='ep-score'>";
      html+="<div class='ep-score-grade' style='background:"+(bg[s.grade]||bg.C)+";color:"+(colors[s.grade]||colors.C)+"'>"+esc(s.grade)+"</div>";
      html+="<div class='ep-score-kpis'>";
      html+="<div class='ep-score-kpi'><div class='v'>"+Math.round((s.fill_rate||0)*100)+"%</div><div class='l'>Fill Rate</div></div>";
      html+="<div class='ep-score-kpi'><div class='v'>"+Math.round((s.on_time_rate||0)*100)+"%</div><div class='l'>Puenktlichkeit</div></div>";
      html+="<div class='ep-score-kpi'><div class='v'>"+(s.sla_breach_count||0)+"</div><div class='l'>SLA-Brueche</div></div>";
      html+="</div></div>";
      $("scorecard-body").innerHTML=html;
      $("scorecard-widget").style.display="block";
    }

    /* -- COMPLIANCE -------------------------------- */
    function renderCompliance(){
      var c=data.compliance;
      if(!c){ $("sec-compliance").style.display="none"; return; }
      $("sec-compliance").style.display="block";
      var colors={green:"var(--ds-success)",yellow:"var(--ds-warning)",red:"var(--ds-danger)"};
      var html="<div style='display:flex;gap:var(--ds-space-6);flex-wrap:wrap'>";
      ["green","yellow","red"].forEach(function(k){
        var count=c[k]||0;
        html+="<div style='text-align:center'><div style='font-size:24px;font-weight:900;color:"+colors[k]+"'>"+count+"</div><div style='font-size:11px;color:var(--ds-text-secondary);text-transform:uppercase'>"+k+"</div></div>";
      });
      html+="</div>";
      $("compliance-body").innerHTML=html;
    }

    /* -- TOGGLE EDIT ------------------------------- */
    function toggleEdit(sec){
      var view=$(sec+"-view"), edit=$(sec+"-edit");
      if(!view||!edit) return;
      if(edit.style.display==="none"){
        if(sec==="overview") renderOverviewEdit();
        if(sec==="basic") renderBasicEdit();
        if(sec==="capabilities"){ initCapDraft(); renderCapabilitiesEdit(); }
        view.style.display="none"; edit.style.display="block";
      } else {
        view.style.display="block"; edit.style.display="none";
      }
    }

    /* -- SAVE: Overview ---------------------------- */
    async function saveOverview(){
      var body={};
      overviewFields.forEach(function(f){ body[f.key]=$("ov-"+f.key).value.trim(); });
      try{
        await api(API+"/overview",{method:"PUT",body:body});
        var res=await api(API); data=res.data||res;
        toggleEdit("overview");
        renderAll();
        toast("Firmenprofil gespeichert");
      }catch(e){ toast("Speichern fehlgeschlagen",false); }
    }

    /* -- SAVE: Basic ------------------------------- */
    async function saveBasic(){
      var body={};
      basicFields.forEach(function(f){ body[f.key]=$("ba-"+f.key).value.trim(); });
      try{
        await api("/api/me/profile",{method:"PUT",body:body});
        var res=await api(API); data=res.data||res;
        toggleEdit("basic");
        renderAll();
        toast("Stammdaten gespeichert");
      }catch(e){ toast("Speichern fehlgeschlagen",false); }
    }

    /* -- SAVE: Capabilities ------------------------ */
    async function saveCapabilities(){
      var body={};
      capFields.forEach(function(f){
        var tags=[];
        var container=$("tags-"+f.key);
        if(container){
          container.querySelectorAll(".ep-tag").forEach(function(el){
            var txt=el.childNodes[0];
            if(txt) tags.push(txt.textContent.trim());
          });
        }
        body[f.key]=tags;
      });
      try{
        await api(API+"/capabilities",{method:"PUT",body:body});
        var res=await api(API); data=res.data||res;
        toggleEdit("capabilities");
        renderAll();
        toast("Kompetenzen gespeichert");
      }catch(e){ toast("Speichern fehlgeschlagen",false); }
    }

    /* -- TAG INPUT ---------------------------------- */
    function tagKey(e){
      if(e.key!=="Enter") return;
      e.preventDefault();
      var inp=e.target, val=inp.value.trim();
      if(!val) return;
      var field=inp.dataset.field;
      var container=$("tags-"+field);
      var tag=document.createElement("span");
      tag.className="ep-tag";
      tag.innerHTML=esc(val)+"<span class='x'>&times;</span>";
      tag.querySelector(".x").onclick=function(){ tag.remove(); };
      container.insertBefore(tag, inp);
      inp.value="";
    }
    function _removeTag(field, idx){
      _capDraft[field].splice(idx,1);
      renderCapabilitiesEdit();
    }

    /* -- ADD LOCATION ------------------------------ */
    function showAddLocation(){
      $("location-form").innerHTML="<div class='ep-form' style='margin-top:var(--ds-space-3)'><div class='ep-field'><label>Stadt *</label><input id='loc-city'/></div><div class='ep-field'><label>PLZ</label><input id='loc-postal'/></div><div class='ep-field'><label>Land</label><input id='loc-country' value='Deutschland'/></div><div class='ep-field'><label>Bezeichnung</label><input id='loc-label' placeholder='z.B. Hauptsitz, Filiale Nord'/></div><div class='ep-field'><label>Radius (km)</label><input id='loc-radius' type='number' value='50'/></div><div class='ep-field'><label>Hauptsitz?</label><select id='loc-hq'><option value='false'>Nein</option><option value='true'>Ja</option></select></div></div><div class='ep-actions'><button class='ep-btn' onclick='EP.hideForm(\"location-form\")'>Abbrechen</button><button class='ep-btn ep-btn--primary' onclick='EP.addLocation()'>Hinzufuegen</button></div>";
      $("location-form").style.display="block";
    }
    async function addLocation(){
      var body={city:$("loc-city").value.trim(),postal_code:$("loc-postal").value.trim(),country:$("loc-country").value.trim(),label:$("loc-label").value.trim(),radius_km:parseInt($("loc-radius").value)||50,is_headquarters:$("loc-hq").value==="true"};
      if(!body.city){ toast("Stadt ist erforderlich",false); return; }
      try{
        await api(API+"/locations",{method:"POST",body:body});
        var res=await api(API); data=res.data||res;
        $("location-form").style.display="none";
        renderAll(); toast("Standort hinzugefuegt");
      }catch(e){ toast("Fehler beim Hinzufuegen",false); }
    }
    async function removeLocation(id){
      if(!confirm("Standort wirklich entfernen?")) return;
      try{
        await api(API+"/locations/"+id,{method:"DELETE"});
        var res=await api(API); data=res.data||res;
        renderAll(); toast("Standort entfernt");
      }catch(e){ toast("Fehler",false); }
    }

    /* -- ADD CERT ---------------------------------- */
    function showAddCert(){
      $("cert-form").innerHTML="<div class='ep-form' style='margin-top:var(--ds-space-3)'><div class='ep-field'><label>Zertifikatsname *</label><input id='cert-name'/></div><div class='ep-field'><label>Typ</label><select id='cert-type'><option value='aueg_lizenz'>AUeG-Lizenz</option><option value='iso_9001'>ISO 9001</option><option value='iso_27001'>ISO 27001</option><option value='iso_45001'>ISO 45001</option><option value='tuev'>TUeV</option><option value='dekra'>DEKRA</option><option value='branchenzertifikat'>Branchenzertifikat</option><option value='qualitaetssiegel'>Qualitaetssiegel</option><option value='sonstige'>Sonstiges</option></select></div><div class='ep-field'><label>Aussteller</label><input id='cert-issuer'/></div><div class='ep-field'><label>Ablaufdatum</label><input id='cert-expires' type='date'/></div></div><div class='ep-actions'><button class='ep-btn' onclick='EP.hideForm(\"cert-form\")'>Abbrechen</button><button class='ep-btn ep-btn--primary' onclick='EP.addCert()'>Hinzufuegen</button></div>";
      $("cert-form").style.display="block";
    }
    async function addCert(){
      var body={cert_name:$("cert-name").value.trim(),cert_type:$("cert-type").value,issuer:$("cert-issuer").value.trim(),expires_at:$("cert-expires").value||null};
      if(!body.cert_name){ toast("Name ist erforderlich",false); return; }
      try{
        await api(API+"/certifications",{method:"POST",body:body});
        var res=await api(API); data=res.data||res;
        $("cert-form").style.display="none";
        renderAll(); toast("Zertifikat hinzugefuegt");
      }catch(e){ toast("Fehler",false); }
    }
    async function removeCert(id){
      if(!confirm("Zertifikat wirklich entfernen?")) return;
      try{
        await api(API+"/certifications/"+id,{method:"DELETE"});
        var res=await api(API); data=res.data||res;
        renderAll(); toast("Zertifikat entfernt");
      }catch(e){ toast("Fehler",false); }
    }

    /* -- ADD CONTACT ------------------------------- */
    function showAddContact(){
      $("contact-form").innerHTML="<div class='ep-form' style='margin-top:var(--ds-space-3)'><div class='ep-field'><label>Name *</label><input id='con-name'/></div><div class='ep-field'><label>Rolle / Titel</label><input id='con-role'/></div><div class='ep-field'><label>E-Mail</label><input id='con-email' type='email'/></div><div class='ep-field'><label>Telefon</label><input id='con-phone'/></div><div class='ep-field'><label>Primaer-Kontakt?</label><select id='con-primary'><option value='false'>Nein</option><option value='true'>Ja</option></select></div></div><div class='ep-actions'><button class='ep-btn' onclick='EP.hideForm(\"contact-form\")'>Abbrechen</button><button class='ep-btn ep-btn--primary' onclick='EP.addContact()'>Hinzufuegen</button></div>";
      $("contact-form").style.display="block";
    }
    async function addContact(){
      var body={name:$("con-name").value.trim(),role_title:$("con-role").value.trim(),email:$("con-email").value.trim(),phone:$("con-phone").value.trim(),is_primary:$("con-primary").value==="true"};
      if(!body.name){ toast("Name ist erforderlich",false); return; }
      try{
        await api(API+"/contacts",{method:"POST",body:body});
        var res=await api(API); data=res.data||res;
        $("contact-form").style.display="none";
        renderAll(); toast("Kontakt hinzugefuegt");
      }catch(e){ toast("Fehler",false); }
    }
    async function removeContact(id){
      if(!confirm("Kontakt wirklich entfernen?")) return;
      try{
        await api(API+"/contacts/"+id,{method:"DELETE"});
        var res=await api(API); data=res.data||res;
        renderAll(); toast("Kontakt entfernt");
      }catch(e){ toast("Fehler",false); }
    }

    function hideForm(id){ $(id).style.display="none"; }

    window.EP={toggleEdit:toggleEdit,saveOverview:saveOverview,saveBasic:saveBasic,saveCapabilities:saveCapabilities,tagKey:tagKey,_removeTag:_removeTag,showAddLocation:showAddLocation,addLocation:addLocation,removeLocation:removeLocation,showAddCert:showAddCert,addCert:addCert,removeCert:removeCert,showAddContact:showAddContact,addContact:addContact,removeContact:removeContact,hideForm:hideForm};
    load();
  })();
