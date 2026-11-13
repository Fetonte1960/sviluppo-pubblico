"use strict";
// FastPharma CRM V1: logica client, codice indipendente da Vtiger.
// Chiave di accesso custodita soltanto nella memoria della sessione JS.
(() => {
 const cfg=window.CONTATTI_CONFIG||{},base=String(cfg.apiBase||"").replace(/\/$/,"");
 const desktop=cfg.desktop===true&&!!window.CONTATTI_DESKTOP?.key;
 // API in same-origin sul backend Render/Windows; su Pages config.js imposta apiBase.
 const hasApi=true;
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const fmt=v=>{if(!v)return "";let d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"}):String(v)};
 const models={
  contacts:{title:"Contatti",single:"Contatto",group:"Commerciale",desc:"Referenti collegati all’organizzazione selezionata.",
   cols:[["first_name","Nome"],["last_name","Cognome"],["company","Azienda"],["email","Email"],["phone","Telefono"],["status","Stato"]],
   fields:[["first_name","Nome","text",true],["last_name","Cognome","text",true],["organization_id","Organizzazione","org",true],["company","Azienda (descrizione)","text"],["email","Email","email"],["phone","Telefono","tel"],["status","Stato","contactStatus"],["notes","Note","textarea"]],
   titleOf:r=>[r.first_name,r.last_name].filter(Boolean).join(" "),subtitle:r=>r.email||r.company||"Persona / referente"},
  organizations:{title:"Organizzazioni",single:"Organizzazione",group:"Anagrafiche",desc:"Farmacie, aziende e partner collegati ai contatti.",
   cols:[["name","Organizzazione"],["type","Tipo"],["city","Città"],["phone","Telefono"],["email","Email"]],
   fields:[["name","Ragione sociale / Nome","text",true],["type","Tipo","orgType"],["city","Città","text"],["phone","Telefono","tel"],["email","Email","email"],["address","Indirizzo","text"],["postal_code","CAP","text"],["province","Provincia","text"],["region","Regione","text"],["vat_number","Partita IVA","text"],["notes","Note","textarea"]],
   titleOf:r=>r.name,subtitle:r=>[r.city,r.type].filter(Boolean).join(" · ")},
  activities:{title:"Attività",single:"Attività",group:"Commerciale",desc:"Telefonate, richiami e appuntamenti da completare.",
   cols:[["subject","Oggetto"],["type","Tipo"],["due_at","Scadenza"],["status","Stato"],["contact_id","Contatto"]],
   fields:[["subject","Oggetto attività","text",true],["type","Tipo","activityType"],["status","Stato","activityStatus"],["due_at","Data e ora","datetime-local"],["contact_id","Contatto collegato","contact"],["organization_id","Organizzazione collegata","org"],["notes","Note","textarea"]],
   titleOf:r=>r.subject,subtitle:r=>[r.type,fmt(r.due_at)].filter(Boolean).join(" · ")},
  deals:{title:"Trattative",single:"Trattativa",group:"Commerciale",desc:"Opportunità commerciali e fasi di trattativa.",
   cols:[["name","Trattativa"],["stage","Fase"],["value","Valore"],["organization_id","Organizzazione"],["contact_id","Contatto"]],
   fields:[["name","Nome trattativa","text",true],["stage","Fase","stage"],["value","Valore (€)","number"],["organization_id","Organizzazione","org"],["contact_id","Contatto","contact"],["notes","Note","textarea"]],
   titleOf:r=>r.name,subtitle:r=>r.stage||"Trattativa"}
 };
 const opts={contactStatus:["Attivo","Da contattare","In trattativa","Non interessato"],
  orgType:["Farmacia","Azienda","Fornitore","Partner","Altro"],
  activityType:["Telefonata","Richiamo","Appuntamento","Visita","Altro"],
  activityStatus:["Da fare","In corso","Completata","Annullata"],
  stage:["Qualificazione","Primo contatto","Proposta","Negoziazione","Vinta","Persa"]};
 // Nessun dato fittizio nel gestionale: prima dell'accesso gli archivi sono vuoti.
 const demo={contacts:[],organizations:[],activities:[],deals:[]};
 let data=structuredClone(demo),key=desktop?window.CONTATTI_DESKTOP.key:"",authenticated=false;
 let module="dashboard",screen="dashboard",activeId=null,tab="summary",editId=null,sortBy="",desc=false;
 let formModule="contacts",formContext=null;
 // La scelta nasce solo dall'apertura del dettaglio Organizzazione (V1.0.16).
 let selectedOrganizationId=null;
 const selectedOrganization=()=>selectedOrganizationId&&getRecord("organizations",selectedOrganizationId);
 const commercial=k=>k==="contacts"||k==="activities"||k==="deals";
 const commercialTitle=k=>k==="contacts"?"Contatti di: ":k==="activities"?"Attività di: ":"Trattative di: ";
 const belongsToOrganization=(r,id)=>String(r.organization_id||"")===String(id)||
  (!r.organization_id&&!!r.contact_id&&String(getRecord("contacts",r.contact_id)?.organization_id||"")===String(id));
 const clearOrganization=()=>{selectedOrganizationId=null;};
 const getRecord=(kind,id)=>(data[kind]||[]).find(r=>String(r.id)===String(id));
 const name=(kind,id)=>{const r=getRecord(kind,id);return r?models[kind].titleOf(r):""};
 // V1.0.16 — nome dell’organizzazione: collegamento diretto o tramite il referente.
 const organizationOf=r=>{
  const direct=r.organization_id&&getRecord("organizations",r.organization_id);
  if(direct?.name)return direct.name;
  const contact=r.contact_id&&getRecord("contacts",r.contact_id);
  const indirect=contact?.organization_id&&getRecord("organizations",contact.organization_id);
  if(indirect?.name)return indirect.name;
  return r.organization_id||contact?.organization_id?"Organizzazione non disponibile":"Nessuna organizzazione collegata";
 };
 const associatedTitle=(kind,r)=>(kind==="contacts"?"Contatto":kind==="activities"?"Attività":"Trattativa")+" di: "+organizationOf(r);
 const val=(field,value)=>{
  if(field==="organization_id")return name("organizations",value);
  if(field==="contact_id")return name("contacts",value);
  if(field.endsWith("_at"))return fmt(value);
  if(field==="value"&&value!==null&&value!==undefined)return Number(value).toLocaleString("it-IT",{style:"currency",currency:"EUR"});
  return value??"";
 };
 function display(field,r){return field==="company"&&r.organization_id ? (name("organizations",r.organization_id)||r.company||"") : val(field,r[field]);}
 function showNotice(text,error=false){$("#notice").textContent=text;$("#notice").classList.toggle("error",error)}
 function loginStatus(text,error=false){
  const element=$("#loginFeedback");
  if(!element)return;
  element.textContent=text;
  element.classList.toggle("error",error);
 }
 function dashboard(){
  $("#metricContacts").textContent=data.contacts.length;$("#metricOrganizations").textContent=data.organizations.length;
  $("#metricActivities").textContent=data.activities.filter(x=>!["Completata","Annullata"].includes(x.status)).length;
  $("#metricDeals").textContent=data.deals.length;
  const upcoming=data.activities.filter(x=>!["Completata","Annullata"].includes(x.status)).sort((a,b)=>(a.due_at||"9999").localeCompare(b.due_at||"9999")).slice(0,6);
  $("#upcoming").innerHTML=upcoming.length?upcoming.map(r=>`<div class="upcoming-row"><div><b>${esc(r.subject)}</b><small>${esc(r.type||"Attività")} · ${esc(name("contacts",r.contact_id)||"Nessun referente")}</small></div><span>${esc(fmt(r.due_at)||"Da pianificare")}</span></div>`).join(""):'<p class="muted">Nessuna attività aperta.</p>';
 }
 const archivesFrame=$("#archivesFrame");
 let archivesInitialized=false;
 function shareArchiveSession(){
  if(!archivesInitialized || !archivesFrame.contentWindow)return;
  archivesFrame.contentWindow.postMessage({
   type:"fastpharma-archive-session",
   key:authenticated?key:"",
   importKey:desktop?(window.CONTATTI_DESKTOP?.importKey||""):""
  },window.location.origin);
 }
 window.addEventListener("message",event=>{
  if(event.origin!==window.location.origin || event.source!==archivesFrame.contentWindow)return;
  if(event.data?.type==="fastpharma-archive-ready"){
   shareArchiveSession();
  }else if(event.data?.type==="fastpharma-archive-data-changed" && authenticated){
   // Il ripristino modifica il database: aggiorna le cache del CRM in memoria.
   const kinds=Object.keys(models);
   Promise.all(kinds.map(kind=>get("/api/v1/"+kind)))
     .then(incoming=>{
       data=Object.fromEntries(kinds.map((kind,i)=>[kind,incoming[i]]));
       showNotice("Archivio ripristinato: elenchi CRM aggiornati.");
       render();
     })
     .catch(error=>showNotice("Ripristino completato, ma aggiornamento liste non riuscito: "+error.message,true));
  }
 });
 function openArchives(){
  if(!authenticated)return; // Pannello amministrativo accessibile solo dopo autenticazione.
  clearOrganization();module="archives";screen="archives";activeId=null;
  render();
  if(!archivesInitialized){
   archivesInitialized=true;
   archivesFrame.src="./laboratorio.html?v=1.0.16";
  }else shareArchiveSession();
 }
 function openModule(next){
  if(!authenticated && next!=="dashboard")return;
  if(commercial(next)&&!selectedOrganization())return;
  if(next==="lists"){clearOrganization();module="lists";screen="lists";activeId=null;render();return;}
  if(next!=="dashboard"&&!models[next])return;
  if(!commercial(next))clearOrganization();
  module=next;screen=next==="dashboard"?"dashboard":"list";activeId=null;sortBy="";desc=false;
  $("#recordSearch").value="";$("#recordFilter").value="";render();
 }
 function render(){
  // Dashboard: unico percorso d'accesso prima della verifica della chiave.
  if(!authenticated && screen!=="dashboard"){
   clearOrganization();module="dashboard";screen="dashboard";activeId=null;
  }
  if(selectedOrganizationId&&!selectedOrganization())clearOrganization();
  if(commercial(module)&&!selectedOrganization()){
   module="organizations";screen="list";activeId=null;
  }
  $$(".navlink").forEach(b=>{
   const requiresAccess=b.dataset.module!=="dashboard";
   b.disabled=(requiresAccess&&!authenticated)||(commercial(b.dataset.module)&&!selectedOrganization());
   b.setAttribute("aria-disabled",String(b.disabled));
   b.classList.toggle("is-active",b.dataset.module===module);
  });
  $("#archivesNav").disabled=!authenticated;
  $("#archivesNav").setAttribute("aria-disabled",String(!authenticated));
  $$("[data-jump]").forEach(b=>{
   b.disabled=!authenticated||(commercial(b.dataset.jump)&&!selectedOrganization());
   b.setAttribute("aria-disabled",String(b.disabled));
  });
  $(".main")?.classList.toggle("is-locked",!authenticated);
  $("#dashboard").hidden=screen!=="dashboard";
  $("#recordsScreen").hidden=screen!=="list";
  $("#detailScreen").hidden=screen!=="detail";
  $("#archivesScreen").hidden=screen!=="archives";
  $("#listsScreen").hidden=screen!=="lists";
  $("#accessSection").hidden=screen!=="dashboard";
  $("#archivesNav").classList.toggle("is-active",screen==="archives");
  const m=models[module];
  $("#breadcrumb").textContent=screen==="lists"?"CRM / Anagrafiche / Liste":screen==="archives"?"CRM / Amministrazione / Archivi":m?`CRM / ${m.group} / ${m.title}`:"CRM / Panoramica";
  $("#pageTitle").textContent=screen==="lists"?"Liste":screen==="archives"?"Salvataggio e ripristino archivi":
   commercial(module)&&selectedOrganization()?
   commercialTitle(module)+selectedOrganization().name:m?m.title:"Dashboard";
  $("#pageSubtitle").textContent=screen==="lists"?"Elenchi esterni di enti pubblici e privati, separati dalle Organizzazioni.":screen==="archives"?"Backup e ripristino guidato dei soli dati Contatti.":m?m.desc:"Un unico punto per contatti, aziende e attività commerciali.";
  $("#newRecord").hidden=!m;$("#newRecord").disabled=!authenticated||(commercial(module)&&!selectedOrganization());
  $("#importFromLists").hidden=!(module==="organizations" && screen==="list");
  $("#importFromLists").disabled=!authenticated;
  $("#newRecord").textContent=m?"+ Aggiungi "+m.single:"+ Aggiungi";
  dashboard();
  if(screen==="list")list();if(screen==="detail")detail();
  if(screen==="lists")window.FastPharmaLists?.open({key:authenticated?key:"",base});
 }
 function list(){
  const m=models[module],raw=data[module].filter(r=>!commercial(module)||
   (selectedOrganization()&&belongsToOrganization(r,selectedOrganizationId)));
  const filterField=module==="organizations"?"type":module==="deals"?"stage":"status";
  const old=$("#recordFilter").value,filterValues=[...new Set(raw.map(r=>r[filterField]).filter(Boolean))].sort();
  $("#recordFilter").innerHTML='<option value="">Tutti gli stati / tipi</option>'+filterValues.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if(filterValues.includes(old))$("#recordFilter").value=old;
  const q=$("#recordSearch").value.trim().toLowerCase();
  let filtered=raw.filter(r=>(!$("#recordFilter").value||r[filterField]===$("#recordFilter").value)&&
    (!q||Object.values(r).join(" ").toLowerCase().includes(q)||[name("contacts",r.contact_id),name("organizations",r.organization_id)].join(" ").toLowerCase().includes(q)));
  if(sortBy)filtered.sort((a,b)=>String(val(sortBy,a[sortBy])).localeCompare(String(val(sortBy,b[sortBy])),"it",{numeric:true})*(desc?-1:1));
  $("#listTitle").textContent=commercial(module)&&selectedOrganization()?
   commercialTitle(module)+selectedOrganization().name:m.title+" · List View";
  $("#recordCount").textContent=filtered.length+" record · "+(authenticated?"Archivio collegato":"Accesso richiesto");
  $("#recordsHead").innerHTML="<tr>"+m.cols.map(([field,label])=>`<th><button type="button" data-sort="${field}">${esc(label)} ${sortBy===field?(desc?"↓":"↑"):""}</button></th>`).join("")+"</tr>";
  $("#recordsBody").innerHTML=filtered.length?filtered.map(r=>`<tr tabindex="0" data-id="${esc(r.id)}">`+m.cols.map(([field],i)=>`<td class="${i===0?"primary-cell":""}">${esc(display(field,r)||"—")}</td>`).join("")+"</tr>").join(""):`<tr><td colspan="${m.cols.length}" class="empty-row">Nessun record trovato.</td></tr>`;
 }
 function openRecord(id){
  if(!authenticated||!getRecord(module,id))return;
  if(module==="organizations")selectedOrganizationId=id;
  if(commercial(module)&&(!selectedOrganization()||
   !belongsToOrganization(getRecord(module,id),selectedOrganizationId)))return;
  activeId=id;tab="summary";screen="detail";render();
 }
 function detail(){
  const m=models[module],r=getRecord(module,activeId);
  if(!r||(commercial(module)&&!belongsToOrganization(r,selectedOrganizationId))){
   screen="list";render();return;
  }
  $("#detailCaption").textContent=m.single+" · "+(authenticated?"Archivio collegato":"Accesso richiesto");
  const hasOrganizationTitle=commercial(module);
  $("#detailTitle").textContent=hasOrganizationTitle?associatedTitle(module,r):m.titleOf(r);
  $("#detailSubtitle").textContent=hasOrganizationTitle?
   [m.titleOf(r),m.subtitle(r)].filter(Boolean).join(" · "):m.subtitle(r);
  $("#editRecord").disabled=!authenticated;
  $("#deleteRecord").disabled=!authenticated;
  const canAddActivity=module==="organizations";
  for(const action of ["#logCall","#planFollowup"]){
   $(action).hidden=!canAddActivity;
   $(action).disabled=!authenticated;
  }
  $$(".tab").forEach(b=>{let on=b.dataset.tab===tab;b.classList.toggle("is-active",on);b.setAttribute("aria-selected",on?"true":"false")});
  if(tab==="oneview"){related(r);return}
  const fields=tab==="summary"?m.fields.slice(0,5):m.fields;
  const provenance=module==="organizations" && r.source_key ?
   '<div class="org-source"><strong>Provenienza: '+esc(r.source_title||"Lista esterna")+
   '</strong><span>Codice nella fonte: '+esc(r.source_key)+
   (r.source_category?' · Tipologia: '+esc(r.source_category):'')+
   '</span></div>' : "";
  $("#detailContent").innerHTML='<div class="fieldgrid">'+fields.map(([field,label])=>`<div class="fieldpair"><span>${esc(label)}</span><strong>${esc(display(field,r)||"—")}</strong></div>`).join("")+"</div>"+
   provenance+
   (tab==="summary"&&(module==="contacts"||module==="organizations")?activityTimeline(module,r.id):"");
 }
 function activityTimeline(kind,recordId){
  const history=data.activities.filter(activity=>
   kind==="contacts"?activity.contact_id===recordId:belongsToOrganization(activity,recordId)
  ).sort((a,b)=>String(b.due_at||b.created_at||"").localeCompare(String(a.due_at||a.created_at||"")));
  return '<section class="activity-history">'+
   '<div class="history-title"><h3>Storico attività ('+history.length+')</h3>'+
   '<span>Telefonate, richiami e appuntamenti collegati</span></div>'+
   (history.length?history.map(a=>
      '<button type="button" class="history-item" data-kind="activities" data-id="'+esc(a.id)+'">'+
      '<span><strong>'+esc(a.subject)+'</strong><small>'+esc(a.type||"Attività")+
      (a.contact_id?" · "+esc(name("contacts",a.contact_id)):"")+'</small>'+
      (a.notes?'<small>'+esc(a.notes)+'</small>':"")+'</span>'+
      '<span class="history-meta"><b>'+esc(a.status||"Da fare")+'</b><small>'+
      esc(fmt(a.due_at||a.created_at)||"Senza data")+'</small></span></button>'
   ).join(""):'<p class="muted">Nessuna attività registrata per questa scheda.</p>')+
   '</section>';
 }
 function startActivityFromSheet(type){
  if(!authenticated || screen!=="detail" || module!=="organizations" || !selectedOrganization())return;
  const source=getRecord(module,activeId);
  if(!source)return;
  const context={module,id:activeId,
   organizationId:module==="organizations"?source.id:source.organization_id||"",
   contactId:module==="contacts"?source.id:"",
   defaults:{type:type==="Richiamo"?"Richiamo":"Telefonata",
      status:type==="Richiamo"?"Da fare":"Completata"}};
  showForm(null,{target:"activities",context});
 }

 function related(r){
  const linked={};
  for(const kind of Object.keys(models)){
   if(kind===module)continue;
   if(kind==="organizations")linked[kind]=r.organization_id?[getRecord(kind,r.organization_id)].filter(Boolean):[];
   else if(kind==="contacts")linked[kind]=data.contacts.filter(c=>module==="organizations"?c.organization_id===r.id:c.id===r.contact_id);
   else linked[kind]=data[kind].filter(x=>{
    if(module==="contacts")return x.contact_id===r.id;
    if(module==="organizations")return belongsToOrganization(x,r.id);
    return (!!r.contact_id&&x.contact_id===r.contact_id)||(!!r.organization_id&&x.organization_id===r.organization_id);
   });
  }
  $("#detailContent").innerHTML='<div class="related-grid">'+Object.entries(linked).map(([kind,items])=>`<div class="related-block"><h3>${esc(models[kind].title)} (${items.length})</h3>`+(items.length?items.slice(0,20).map(x=>`<button type="button" class="related-link" data-kind="${kind}" data-id="${esc(x.id)}">${esc(models[kind].titleOf(x))}</button>`).join(""):'<p class="muted">Nessun record collegato.</p>')+"</div>").join("")+"</div>";
 }

 function optionHtml(type,selected,organizationId=""){
  if(type==="org"||type==="contact"){
   const kind=type==="org"?"organizations":"contacts";
   const records=kind==="contacts"&&organizationId
     ? data.contacts.filter(c=>c.organization_id===organizationId)
     : data[kind];
   return '<option value="">Nessuno</option>'+records.map(x=>
    '<option value="'+esc(x.id)+'" '+(x.id===selected?"selected":"")+'>'+
    esc(models[kind].titleOf(x))+'</option>').join("");
  }
  return (opts[type]||[]).map(v=>
   '<option value="'+esc(v)+'" '+(v===selected?"selected":"")+'>'+esc(v)+'</option>').join("");
 }
 function localDate(value){
  if(!value)return "";
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return "";
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
 }
 function showForm(id=null,settings={}){
  if(!authenticated){showNotice("Accedi agli archivi per apportare modifiche.",true);return}
  formModule=settings.target||module;
  if(commercial(formModule)&&!selectedOrganization()){
   showNotice("Apri prima il dettaglio di un'Organizzazione.",true);return;
  }
  formContext=settings.context||null;
  editId=id;
  const m=models[formModule],r=id?getRecord(formModule,id):null;
  if(!m)return;
  const context=formContext;
  const home=context?getRecord(context.module,context.id):null;
  const defaults=context?{
   contact_id:context.contactId||"",organization_id:context.organizationId||"",
   ...context.defaults,
   ...(formModule==="activities"&&context.defaults.type?{
     subject:(context.defaults.type==="Richiamo"?"Richiamare: ":"Telefonata: ")+
       (home?models[context.module].titleOf(home):"")
   }:{})
  }:commercial(formModule)?{organization_id:selectedOrganizationId}:{};
  const selectedOrg=commercial(formModule)?selectedOrganizationId:(r?.organization_id??defaults.organization_id??"");
  $("#dialogHeading").textContent=(id?"Modifica ":(["activities","organizations","deals"].includes(formModule)?"Nuova ":"Nuovo "))+m.single;
  $("#dialogError").textContent="";
  $("#formFields").innerHTML=m.fields.map(([field,label,type,required])=>{
   const value=r?.[field]??defaults[field]??"";
   const attr=`name="${field}" id="f_${field}" ${required?"required":""}`;
   let input;
   if(type==="textarea")input=`<textarea ${attr} maxlength="2000" rows="3">${esc(value)}</textarea>`;
   else if(type==="org"||type==="contact"||opts[type])
    input=`<select ${attr}>${optionHtml(type,value,type==="contact"?selectedOrg:"")}</select>`;
   else if(type==="datetime-local")input=`<input type="datetime-local" ${attr} value="${esc(localDate(value))}">`;
   else if(type==="number")input=`<input type="number" min="0" step="0.01" ${attr} value="${esc(value||0)}">`;
   else input=`<input type="${type==="email"?"email":type==="tel"?"tel":"text"}" ${attr} maxlength="${field==="email"?254:field==="name"||field==="address"?field==="name"?300:400:field==="subject"?200:field==="company"?180:field==="region"||field==="province"||field==="city"?150:field==="postal_code"?20:field==="vat_number"?50:120}" value="${esc(value)}">`;
   return `<label class="${type==="textarea"?"wide":""}" for="f_${field}">${esc(label)}${required?" *":""}${input}</label>`;
  }).join("");
  if(commercial(formModule)){
   $("#f_organization_id").value=selectedOrganizationId;
   $("#f_organization_id").disabled=true;
   if(formModule==="activities"&&context?.module==="contacts")$("#f_contact_id").disabled=true;
  }
  updateFormOrganizationTitle();
  $("#recordDialog").showModal();
 }
 function updateFormOrganizationTitle(){
  if(!editId||!commercial(formModule))return;
  const r={organization_id:$("#f_organization_id")?.value||"",contact_id:$("#f_contact_id")?.value||""};
  $("#dialogHeading").textContent=associatedTitle(formModule,r);
 }
 function syncActivityLinks(event){
  if(!commercial(formModule))return;
  const org=$("#f_organization_id"),contact=$("#f_contact_id");
  if(!org||!contact)return;
  if(event.target===contact){
   const person=getRecord("contacts",contact.value);
   if(person?.organization_id){
    org.value=person.organization_id;
    // Dopo la selezione del referente, mostra soltanto i colleghi della stessa azienda.
    contact.innerHTML=optionHtml("contact",person.id,org.value);
    contact.value=person.id;
   }
  }else if(event.target===org){
   const old=contact.value;
   contact.innerHTML=optionHtml("contact",old,org.value);
   const valid=contact.querySelector('option[value="'+old+'"]');
   if(!valid || !old)contact.value="";
   if(old && !valid)$("#dialogError").textContent=
    "Referente azzerato: non appartiene all'organizzazione selezionata.";
   else $("#dialogError").textContent="";
  }
 }
 async function get(path){
  const r=await fetch(base+path,{headers:{"X-Demo-Key":key},cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(r.status===401)throw new Error("Chiave di accesso non riconosciuta. Verifica la chiave e riprova.");
  if(r.status===503)throw new Error("Server o archivio non disponibile. Riprova.");
  if(!r.ok)throw new Error("Archivio non disponibile (HTTP "+r.status+").");
  return await r.json();
 }
 const chromeCredentialId="Gestione contatti";
 const previousChromeCredentialId="FastPharma-TEST";
 let chromeStorePending=false;
 // Chrome gestisce la credenziale nel proprio Password Manager. Mai in localStorage,
 // sessionStorage, cookie o PostgreSQL; la chiave resta solo nella sessione RAM del CRM.
 function hasChromePasswordStore(){
  return !desktop && typeof window.PasswordCredential==="function" &&
   typeof navigator.credentials?.store==="function";
 }
 function showChromePasswordUi(){
  $("#chromeLoadKey").hidden=desktop || !(typeof navigator.credentials?.get==="function");
  $("#chromePasswordActions").hidden=!authenticated || !hasChromePasswordStore();
 }
 async function saveToChromePasswordManager(){
  if(!authenticated || !key || !hasChromePasswordStore() || chromeStorePending)return;
  chromeStorePending=true;
  const button=$("#chromeSaveKey");
  button.disabled=true;
  $("#chromePasswordStatus").textContent="Richiesta di salvataggio inviata a Chrome…";
  try{
   // Chromium non sempre riconosce come login un form AJAX senza navigazione.
   // L'API dedicata richiede direttamente al browser di gestire questa credenziale.
   const credential=new window.PasswordCredential({
    id:chromeCredentialId,password:key,name:"Gestione contatti"
   });
   await navigator.credentials.store(credential);
   $("#chromePasswordStatus").textContent=
    "Chrome ha gestito la richiesta. Verifica la voce in Gestore delle password; il browser può non mostrare una finestra.";
  }catch(error){
   $("#chromePasswordStatus").textContent=
    "Chrome non ha completato il salvataggio. Verifica le impostazioni del Gestore delle password oppure riprova.";
  }finally{button.disabled=false;chromeStorePending=false;}
 }
 async function loadFromChromePasswordManager(){
  if(desktop || typeof navigator.credentials?.get!=="function")return;
  const button=$("#chromeLoadKey");
  button.disabled=true;
  loginStatus("Ricerca della credenziale FastPharma nel Gestore delle password di Chrome…");
  try{
   const stored=await navigator.credentials.get({password:true,mediation:"required"});
   // Su GitHub Pages altre applicazioni possono condividere l'origin:
   // accettare esclusivamente il profilo esatto di FastPharma.
   if(stored?.type==="password" && (stored.id===chromeCredentialId || stored.id===previousChromeCredentialId) && typeof stored.password==="string"){
    $("#demoKey").value=stored.password;
    loginStatus("Chiave recuperata dal browser. Premi «Verifica e apri».");
   }else{
    loginStatus("Nessuna chiave FastPharma selezionata in Chrome. Puoi inserirla manualmente.",true);
   }
  }catch(error){
   loginStatus("Chrome non ha restituito una password. Puoi inserirla manualmente.",true);
  }finally{button.disabled=false;}
 }
 async function connect(candidate){
  if(!hasApi)throw new Error("Servizio di accesso agli archivi non configurato");
  key=candidate;
  try{
   const kinds=Object.keys(models),incoming=await Promise.all(kinds.map(k=>get("/api/v1/"+k)));
   data=Object.fromEntries(kinds.map((k,i)=>[k,incoming[i]]));authenticated=true;
   $("#accessSection").classList.add("connected");
   $("#accessMessage").textContent="Archivio collegato. Puoi consultare e aggiornare i dati.";
   $("#connectionBadge").textContent="Archivio collegato";$("#connectionBadge").classList.add("connected");
   // Mantieni il campo nel form ora nascosto: Chrome può riconoscere
   // l'accesso riuscito e proporre il salvataggio nel proprio gestore password.
   // La web app non scrive alcun segreto in storage o cookie.
   loginStatus("Accesso riuscito: archivio collegato.");
   showNotice("Accesso riuscito: ora puoi consultare gli archivi.",false);
   shareArchiveSession();render();
   showChromePasswordUi();
   // Tentativo esplicito dopo il login riuscito; senza bloccare l'apertura del CRM.
   // L'utente può anche riprovare con il pulsante visibile dopo l'accesso.
   if(hasChromePasswordStore())void saveToChromePasswordManager();
  }catch(e){
   key="";authenticated=false;data=structuredClone(demo);
   $("#accessSection").classList.remove("connected");
   $("#connectionBadge").textContent="Archivio non collegato";
   $("#connectionBadge").classList.remove("connected");
   shareArchiveSession();render();showChromePasswordUi();throw e;
  }
 }
 async function save(event){
  event.preventDefault();if(!authenticated)return;
  const payload={};
  const target=formModule;
  if(commercial(target)&&!selectedOrganization()){
   $("#dialogError").textContent="Organizzazione di lavoro non più disponibile.";return;
  }
  for(const [field,,type] of models[target].fields){
   let value=$("#f_"+field)?.value.trim()||"";
   if(type==="datetime-local"&&value)value=new Date(value).toISOString();
   if(field==="value"&&!value)value="0";
   payload[field]=value||null;
  }
  if(commercial(target)){
   payload.organization_id=selectedOrganizationId;
   if(payload.contact_id&&String(getRecord("contacts",payload.contact_id)?.organization_id||"")!==String(selectedOrganizationId)){
    $("#dialogError").textContent="Il contatto scelto non appartiene all'organizzazione selezionata.";return;
   }
  }
  const url="/api/v1/"+target+(editId?"/"+encodeURIComponent(editId):"");
  $("#submitRecord").disabled=true;$("#dialogError").textContent="";
  try{
   const res=await fetch(base+url,{method:editId?"PUT":"POST",headers:{"X-Demo-Key":key,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
   if(!res.ok){const problem=await res.json().catch(()=>({}));throw new Error(problem.error||"Salvataggio non riuscito (HTTP "+res.status+")")}
   const result=await res.json();
   data[target]=await get("/api/v1/"+target);
   $("#recordDialog").close();
   const originalContext=formContext;
   formContext=null;
   if(originalContext&&originalContext.returnTo!==false){
    module=originalContext.module;
    activeId=originalContext.id;
   }else{
    module=target;
    activeId=result.id;
   }
   screen="detail";tab="summary";
   showNotice(models[target].single+(editId?" aggiornata":" creata")+
    (originalContext?" e aggiunta allo storico della scheda.":" nell'archivio."));
   render();
  }catch(e){$("#dialogError").textContent=e.message}finally{$("#submitRecord").disabled=false}
 }

 // Importa una sola organizzazione da una Lista esterna, con conferma esplicita.
 let orgImportLists=[],orgImportListId="",orgImportItems=[],orgImportOffset=0,orgImportTotal=0;
 let orgImportSelected=null,orgImportPreview=null,orgImportSerial=0,orgImportTimer=null,orgImportBusy=false;
 const orgImportLimit=25;
 const orgImportEl=id=>document.getElementById(id);
 const orgImportError=(message="")=>{orgImportEl("orgImportError").textContent=message;};
 const orgImportOptions=(id,values,label)=>{
  orgImportEl(id).innerHTML='<option value="">'+esc(label)+'</option>'+
   values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
 };
 function resetOrgImportSelection(){
  orgImportSelected=null;orgImportPreview=null;
  orgImportEl("orgImportPreview").hidden=true;
  orgImportEl("orgImportConfirm").disabled=true;
  orgImportError();
 }
 async function importListFacets(){
  const facets=await get("/api/v1/lists/"+encodeURIComponent(orgImportListId)+"/facets");
  orgImportOptions("orgImportRegion",facets.region||[],"Tutte le regioni");
  orgImportOptions("orgImportProvince",facets.province||[],"Tutte le province");
 }
 async function findImportEntries(){
  if(!authenticated || !orgImportListId)return;
  const request=++orgImportSerial;
  resetOrgImportSelection();
  orgImportEl("orgImportRows").innerHTML='<tr><td colspan="6" class="empty-row">Ricerca in corso…</td></tr>';
  const query=new URLSearchParams({offset:String(orgImportOffset),limit:String(orgImportLimit)});
  for(const [name,id] of [["q","orgImportSearch"],["region","orgImportRegion"],["province","orgImportProvince"],["city","orgImportCity"]]){
   const val=orgImportEl(id).value.trim();
   if(val)query.set(name,val);
  }
  try{
   const response=await get("/api/v1/lists/"+encodeURIComponent(orgImportListId)+"/entries?"+query);
   if(request!==orgImportSerial)return;
   orgImportItems=response.entries||[];orgImportTotal=response.total||0;
   orgImportEl("orgImportCount").textContent=orgImportTotal.toLocaleString("it-IT")+
      " risultati · scegli una sola farmacia";
   orgImportEl("orgImportRows").innerHTML=orgImportItems.length?orgImportItems.map(item=>
    '<tr><td>'+esc(item.code)+'</td><td>'+esc(item.name)+'</td><td>'+esc(item.city)+'</td>'+
    '<td>'+esc(item.province)+'</td><td>'+esc(item.region)+'</td>'+
    '<td><button type="button" class="secondary" data-org-import-code="'+esc(item.code)+'">Seleziona</button></td></tr>'
   ).join(""):'<tr><td colspan="6" class="empty-row">Nessuna farmacia trovata con questi filtri.</td></tr>';
   orgImportEl("orgImportPageInfo").textContent=orgImportTotal?
    (orgImportOffset+1).toLocaleString("it-IT")+"–"+
    (orgImportOffset+orgImportItems.length).toLocaleString("it-IT")+" di "+
    orgImportTotal.toLocaleString("it-IT"):"0 di 0";
   orgImportEl("orgImportPrev").disabled=orgImportOffset===0;
   orgImportEl("orgImportNext").disabled=orgImportOffset+orgImportLimit>=orgImportTotal;
  }catch(e){if(request===orgImportSerial)orgImportError(e.message);}
 }
 function scheduleOrgImportSearch(){
  orgImportOffset=0;clearTimeout(orgImportTimer);
  orgImportTimer=setTimeout(()=>{void findImportEntries();},280);
 }
 async function openOrgImporter(){
  if(!authenticated || module!=="organizations"){showNotice("Accedi agli archivi e apri Organizzazioni.",true);return;}
  const dialog=orgImportEl("orgImportDialog");
  orgImportError();resetOrgImportSelection();
  orgImportOffset=0;orgImportLists=[];orgImportListId="";
  for(const id of ["orgImportSearch","orgImportCity"])orgImportEl(id).value="";
  dialog.showModal();
  try{
   orgImportLists=await get("/api/v1/lists");
   if(!dialog.open)return;
   orgImportEl("orgImportList").innerHTML=orgImportLists.map(l=>
    '<option value="'+esc(l.id)+'">'+esc(l.title)+'</option>').join("");
   const first=orgImportLists.find(l=>l.slug==="farmacie-ministero-salute")||orgImportLists[0];
   if(!first){orgImportError("Nessuna Lista esterna disponibile.");return;}
   orgImportListId=first.id;orgImportEl("orgImportList").value=first.id;
   await importListFacets();
   await findImportEntries();
  }catch(e){orgImportError("Impossibile aprire le Liste: "+e.message);}
 }
 async function previewOrgImport(code){
  if(!orgImportListId || !code || orgImportBusy)return;
  orgImportSelected=code;orgImportPreview=null;
  orgImportEl("orgImportConfirm").disabled=true;
  orgImportError();
  orgImportEl("orgImportPreview").hidden=false;
  orgImportEl("orgImportPreviewContent").textContent="Verifica duplicati in corso…";
  orgImportEl("orgImportMatches").textContent="";
  try{
   const preview=await get("/api/v1/lists/"+encodeURIComponent(orgImportListId)+
     "/entries/"+encodeURIComponent(code)+"/organization-preview");
   if(orgImportSelected!==code)return;
   orgImportPreview=preview;
   const item=preview.entry;
   orgImportEl("orgImportPreviewContent").innerHTML=
    '<strong>'+esc(item.name)+'</strong>'+
    '<p>Codice ministeriale: '+esc(item.code)+' · '+esc(item.source_title)+'</p>'+
    '<p>'+esc([item.address,item.postal_code,item.city,item.province,item.region].filter(Boolean).join(", "))+'</p>'+
    '<p>Partita IVA: '+esc(item.vat_number||"Non indicata")+'</p>';
   const matches=preview.matches||[];
   orgImportEl("orgImportMatches").innerHTML=matches.length?
    '<h4>Corrispondenze rilevate</h4>'+matches.map(m=>
      '<div class="org-import-match '+(m.blocking?'org-import-blocking':'')+'">'+
      '<strong>'+esc(m.name)+'</strong> · '+esc(m.city||"")+
      '<small>'+esc(m.reason)+'</small></div>').join("")+
     (preview.can_import?'<p class="hint">La stessa partita IVA può appartenere a più sedi: verifica prima di importare.</p>':''):
     '<p class="hint">Nessuna organizzazione corrispondente trovata.</p>';
   orgImportEl("orgImportConfirm").disabled=!preview.can_import;
   if(!preview.can_import)orgImportError("Importazione bloccata: questa farmacia risulta già presente.");
  }catch(e){orgImportError(e.message);}
 }
 async function confirmOrgImport(){
  if(orgImportBusy || !orgImportPreview?.can_import || !orgImportSelected || !authenticated)return;
  const entry=orgImportPreview.entry;
  if(!window.confirm("Importare in Organizzazioni solo «"+entry.name+"»?"))return;
  orgImportBusy=true;orgImportEl("orgImportConfirm").disabled=true;orgImportError();
  try{
   const url=base+"/api/v1/lists/"+encodeURIComponent(orgImportListId)+
     "/entries/"+encodeURIComponent(orgImportSelected)+"/import-organization";
   const response=await fetch(url,{
    method:"POST",headers:{"X-Demo-Key":key},signal:AbortSignal.timeout(30000)
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"Importazione non riuscita (HTTP "+response.status+").");
   data.organizations=await get("/api/v1/organizations");
   orgImportEl("orgImportDialog").close();
   // Come il click su una riga Organizzazioni: apre il dettaglio e rende
   // questa farmacia il contesto di lavoro per Attività e Trattative.
   module="organizations";
   openRecord(result.id);
   showNotice("Farmacia «"+result.name+"» importata in Organizzazioni. Completa i dati commerciali dalla scheda.");
  }catch(e){
   orgImportError(e.message);
  }finally{
   orgImportBusy=false;
   orgImportEl("orgImportConfirm").disabled=!orgImportPreview?.can_import;
  }
 }
 function closeOrgImporter(){
  orgImportSerial++;clearTimeout(orgImportTimer);
  orgImportEl("orgImportDialog").close();
 }
 // V1.0.11 — cancella una sola scheda per volta e solo senza collegamenti.
 let deleteTarget=null,deletePreview=null,deleteBusy=false,deleteRequestId=0;
 const deleteDialog=$("#deleteRecordDialog");
 const deleteCheck=$("#deleteConfirmCheck");
 const deleteButton=$("#deleteDialogConfirm");
 function syncDeleteButton(){
  deleteButton.disabled=deleteBusy || !authenticated || !deleteTarget ||
   !deletePreview?.can_delete || !deleteCheck.checked;
 }
 function resetDelete(){
  deleteRequestId++;
  deleteTarget=null;deletePreview=null;deleteBusy=false;
  deleteCheck.checked=false;deleteCheck.disabled=true;syncDeleteButton();
  $("#deleteDialogError").textContent="";
 }
 function closeDeleteDialog(){
  if(deleteBusy)return;
  deleteDialog.close();resetDelete();
 }
 async function openDeleteDialog(){
  if(!authenticated||screen!=="detail"||!models[module]||!activeId){
   showNotice("Apri una scheda per cancellare il record selezionato.",true);return;
  }
  resetDelete();
  const record=getRecord(module,activeId);
  if(!record)return;
  deleteTarget={module,id:record.id,title:models[module].titleOf(record)};
  $("#deleteDialogTitle").textContent="Cancella "+models[module].single.toLowerCase();
  $("#deleteDialogHelp").textContent=module==="organizations"?
   "Eliminando l'Organizzazione saranno rimossi anche tutti i Contatti, le Attività e le Trattative collegati. La cancellazione non è annullabile dalla schermata.":
   "Verrà eliminato solo questo record, purché non abbia collegamenti bloccanti.";
  $("#deleteRecordName").textContent=deleteTarget.title;
  $("#deleteDependencyStatus").textContent="Controllo dei collegamenti sul database in corso…";
  deleteDialog.showModal();
  const token=++deleteRequestId;
  try{
   const result=await get("/api/v1/"+encodeURIComponent(deleteTarget.module)+"/"+
     encodeURIComponent(deleteTarget.id)+"/delete-preview");
   if(token!==deleteRequestId||!deleteDialog.open)return;
   deletePreview=result;
   const linked=Object.entries(result.linked||{}).filter(([,count])=>Number(count)>0);
   if(result.cascade){
    $("#deleteDependencyStatus").textContent="La cancellazione comprenderà questa Organizzazione e "+
     (linked.length?linked.map(([kind,count])=>count+" "+kind).join(", ")+" collegati. ":"nessun altro record. ")+
     "Le Liste ministeriali resteranno intatte.";
    $("#deleteConfirmText").textContent=
     "Confermo di cancellare definitivamente l'organizzazione con tutti i Contatti, le Attività e le Trattative collegati.";
    deleteCheck.disabled=false;
   }else if(linked.length){
    $("#deleteDependencyStatus").textContent="Cancellazione non consentita: "+
      linked.map(([kind,count])=>count+" "+kind).join(", ")+
      " collegati. Eliminali o riassegnali prima di riprovare.";
    deleteCheck.checked=false;deleteCheck.disabled=true;
   }else{
    $("#deleteDependencyStatus").textContent=
      "Nessun collegamento bloccante. Verrà eliminata soltanto questa scheda; "+
      "le Liste ministeriali resteranno intatte.";
    $("#deleteConfirmText").textContent="Confermo di voler cancellare definitivamente questo singolo record.";
    deleteCheck.disabled=false;
   }
   syncDeleteButton();
  }catch(error){
   if(token===deleteRequestId){
    $("#deleteDialogError").textContent="Impossibile verificare il record: "+error.message;
    deleteCheck.checked=false;deleteCheck.disabled=true;syncDeleteButton();
   }
  }
 }
 async function confirmDelete(){
  if(deleteBusy||!deleteTarget||!deletePreview?.can_delete||
     !deleteCheck.checked||!authenticated)return;
  const target={...deleteTarget};
  deleteBusy=true;syncDeleteButton();
  $("#deleteDialogError").textContent="";
  try{
   const response=await fetch(base+"/api/v1/"+encodeURIComponent(target.module)+"/"+
     encodeURIComponent(target.id),{
      method:"DELETE",
      headers:{"X-Demo-Key":key,"X-Confirm-Delete":"true",
       ...(target.module==="organizations"?{"X-Confirm-Cascade":"true"}:{})},
      signal:AbortSignal.timeout(20000)
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"Cancellazione non riuscita (HTTP "+response.status+").");
   // Il server ha confermato la DELETE. Non riprovare se il refresh rete fallisce.
   deleteDialog.close();resetDelete();
   if(target.module==="organizations")clearOrganization();
   module=target.module;activeId=null;screen="list";
   data[target.module]=data[target.module].filter(r=>String(r.id)!==String(target.id));
   render();
   showNotice(target.title+" eliminato dall'archivio "+models[target.module].title+
    (target.module==="organizations"?" con i record collegati.":"."));
   try{
    if(target.module==="organizations"){
     const kinds=Object.keys(models);
     const incoming=await Promise.all(kinds.map(k=>get("/api/v1/"+k)));
     data=Object.fromEntries(kinds.map((k,i)=>[k,incoming[i]]));
    }else data[target.module]=await get("/api/v1/"+target.module);
    if(module===target.module&&screen==="list")render();
   }catch(error){
    showNotice("Cancellazione eseguita; elenco non aggiornato dal server: "+error.message,true);
   }
  }catch(error){
   $("#deleteDialogError").textContent=error.message;
  }finally{
   deleteBusy=false;syncDeleteButton();
  }
 }
 $("#deleteRecord").addEventListener("click",()=>{void openDeleteDialog();});
 $("#deleteDialogClose").addEventListener("click",closeDeleteDialog);
 $("#deleteDialogCancel").addEventListener("click",closeDeleteDialog);
 deleteCheck.addEventListener("change",syncDeleteButton);
 deleteButton.addEventListener("click",()=>{void confirmDelete();});
 deleteDialog.addEventListener("close",()=>{if(!deleteBusy)resetDelete();});

 $("#importFromLists").addEventListener("click",()=>{void openOrgImporter();});
 orgImportEl("orgImportClose").addEventListener("click",closeOrgImporter);
 orgImportEl("orgImportCancel").addEventListener("click",closeOrgImporter);
 orgImportEl("orgImportList").addEventListener("change",async()=>{
  orgImportListId=orgImportEl("orgImportList").value;orgImportOffset=0;
  for(const id of ["orgImportRegion","orgImportProvince","orgImportSearch","orgImportCity"])orgImportEl(id).value="";
  try{await importListFacets();await findImportEntries();}catch(e){orgImportError(e.message);}
 });
 for(const id of ["orgImportSearch","orgImportCity"])orgImportEl(id).addEventListener("input",scheduleOrgImportSearch);
 for(const id of ["orgImportRegion","orgImportProvince"])orgImportEl(id).addEventListener("change",scheduleOrgImportSearch);
 orgImportEl("orgImportPrev").addEventListener("click",()=>{orgImportOffset=Math.max(0,orgImportOffset-orgImportLimit);void findImportEntries();});
 orgImportEl("orgImportNext").addEventListener("click",()=>{if(orgImportOffset+orgImportLimit<orgImportTotal){orgImportOffset+=orgImportLimit;void findImportEntries();}});
 orgImportEl("orgImportRows").addEventListener("click",e=>{
  const code=e.target.closest("button[data-org-import-code]")?.dataset.orgImportCode;
  if(code!==undefined)void previewOrgImport(code);
 });
 orgImportEl("orgImportConfirm").addEventListener("click",()=>{void confirmOrgImport();});

 $$(".navlink[data-module]").forEach(b=>b.addEventListener("click",()=>openModule(b.dataset.module)));
 $("#archivesNav").addEventListener("click",openArchives);
 $$("[data-jump]").forEach(b=>b.addEventListener("click",()=>openModule(b.dataset.jump)));
 $("#newRecord").addEventListener("click",()=>{
  if(commercial(module)&&selectedOrganization())
   showForm(null,{context:{module:"organizations",id:selectedOrganizationId,
    organizationId:selectedOrganizationId,returnTo:false,defaults:{}}});
  else showForm();
 });
 $("#backToList").addEventListener("click",()=>{
  if(module==="organizations")clearOrganization();
  screen="list";activeId=null;render();
 });
 $("#editRecord").addEventListener("click",()=>showForm(activeId));
 $("#logCall").addEventListener("click",()=>startActivityFromSheet("Telefonata"));
 $("#planFollowup").addEventListener("click",()=>startActivityFromSheet("Richiamo"));
 $("#formFields").addEventListener("change",event=>{syncActivityLinks(event);updateFormOrganizationTitle();});
 $("#recordSearch").addEventListener("input",list);
 $("#recordFilter").addEventListener("change",list);
 $("#recordsHead").addEventListener("click",e=>{const f=e.target.closest("[data-sort]")?.dataset.sort;if(!f)return;desc=sortBy===f?!desc:false;sortBy=f;list()});
 $("#recordsBody").addEventListener("click",e=>{const id=e.target.closest("tr[data-id]")?.dataset.id;if(id)openRecord(id)});
 $("#recordsBody").addEventListener("keydown",e=>{if(e.key==="Enter"){const id=e.target.closest("tr[data-id]")?.dataset.id;if(id)openRecord(id)}});
 $$(".tab").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.tab;detail()}));
 $("#detailContent").addEventListener("click",e=>{
  const b=e.target.closest("button[data-kind]");if(!b)return;
  if(b.dataset.kind==="organizations")selectedOrganizationId=b.dataset.id;
  if(commercial(b.dataset.kind)&&(!selectedOrganization()||
   !belongsToOrganization(getRecord(b.dataset.kind,b.dataset.id)||{},selectedOrganizationId)))return;
  module=b.dataset.kind;activeId=b.dataset.id;screen="detail";tab="summary";render();
 });
 $("#recordForm").addEventListener("submit",save);
 $("#closeDialog").addEventListener("click",()=>$("#recordDialog").close());
 $("#cancelDialog").addEventListener("click",()=>$("#recordDialog").close());
 $("#chromeLoadKey").addEventListener("click",loadFromChromePasswordManager);
 $("#chromeSaveKey").addEventListener("click",()=>{void saveToChromePasswordManager();});
 $("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const candidate=$("#demoKey").value.trim();if(!candidate){showNotice("Inserisci la chiave di accesso.",true);return}
  const b=$("#connectButton");
  b.disabled=true;
  b.textContent="Verifica in corso…";
  loginStatus("Connessione al server e verifica della chiave…");
  showNotice("Verifica accesso in corso…");
  try{
   await connect(candidate);
  }catch(error){
   const message=error?.name==="TimeoutError"?"Tempo di risposta del server superato: riprova.":
     error instanceof TypeError?"Server non raggiungibile o comunicazione bloccata dal browser. Riprova.":error.message;
   loginStatus(message,true);
   showNotice("Accesso non riuscito: "+message,true);
  }finally{
   b.disabled=false;
   b.textContent="Verifica e apri";
  }
 });
 render();
 showChromePasswordUi();
 window.__FASTPHARMA_CRM_READY__=true;
 if(desktop){
  $("#loginForm").hidden=true;showNotice("Collegamento al database Windows in corso…");
  connect(key).catch(e=>showNotice("Archivio Windows non pronto: "+e.message,true));
 }else if(!hasApi)showNotice("Servizio non configurato.");
})();
