"use strict";
// FastPharma CRM V1: logica client, codice indipendente da Vtiger.
// Chiave TEST esclusivamente in memoria, nessun dato personale reale.
(() => {
 const cfg=window.CONTATTI_CONFIG||{},base=String(cfg.apiBase||"").replace(/\/$/,"");
 const desktop=cfg.desktop===true&&!!window.CONTATTI_DESKTOP?.key;
 // API in same-origin sul backend Render/Windows; su Pages config.js imposta apiBase.
 const hasApi=true;
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const fmt=v=>{if(!v)return "";let d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"}):String(v)};
 const models={
  contacts:{title:"Contatti",single:"Contatto",group:"Anagrafiche",desc:"Persone, referenti e contatti commerciali.",
   cols:[["first_name","Nome"],["last_name","Cognome"],["company","Azienda"],["email","Email"],["phone","Telefono"],["status","Stato"]],
   fields:[["first_name","Nome","text",true],["last_name","Cognome","text",true],["organization_id","Organizzazione","org"],["company","Azienda (testo V0)","text"],["email","Email","email"],["phone","Telefono","tel"],["status","Stato","contactStatus"],["notes","Note","textarea"]],
   titleOf:r=>[r.first_name,r.last_name].filter(Boolean).join(" "),subtitle:r=>r.email||r.company||"Persona / referente"},
  organizations:{title:"Organizzazioni",single:"Organizzazione",group:"Anagrafiche",desc:"Farmacie, aziende e partner collegati ai contatti.",
   cols:[["name","Organizzazione"],["type","Tipo"],["city","Città"],["phone","Telefono"],["email","Email"]],
   fields:[["name","Ragione sociale / Nome","text",true],["type","Tipo","orgType"],["city","Città","text"],["phone","Telefono","tel"],["email","Email","email"],["notes","Note","textarea"]],
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
 const demo={
  organizations:[{id:"demo-o1",name:"Farmacia Dimostrativa",type:"Farmacia",city:"Reggio Calabria",email:"farmacia@example.invalid"},{id:"demo-o2",name:"Partner Esempio",type:"Partner",city:"Lodi",email:"partner@example.invalid"}],
  contacts:[{id:"demo-c1",first_name:"Anna",last_name:"Esempio",company:"Farmacia Dimostrativa",organization_id:"demo-o1",email:"anna@example.invalid",status:"Da contattare"},{id:"demo-c2",first_name:"Marco",last_name:"Prova",company:"Partner Esempio",organization_id:"demo-o2",email:"marco@example.invalid",status:"Attivo"}],
  activities:[{id:"demo-a1",subject:"Richiamo dimostrativo",type:"Richiamo",status:"Da fare",due_at:"2026-11-12T09:30:00Z",contact_id:"demo-c1",organization_id:"demo-o1"},{id:"demo-a2",subject:"Presentazione servizi",type:"Appuntamento",status:"In corso",due_at:"2026-11-16T11:00:00Z",contact_id:"demo-c2",organization_id:"demo-o2"}],
  deals:[{id:"demo-d1",name:"Servizio dimostrativo",stage:"Proposta",value:250,contact_id:"demo-c1",organization_id:"demo-o1"},{id:"demo-d2",name:"Accordo partner demo",stage:"Qualificazione",value:500,contact_id:"demo-c2",organization_id:"demo-o2"}]
 };
 let data=structuredClone(demo),key=desktop?window.CONTATTI_DESKTOP.key:"",authenticated=false;
 let module="dashboard",screen="dashboard",activeId=null,tab="summary",editId=null,sortBy="",desc=false;
 let formModule="contacts",formContext=null;
 const getRecord=(kind,id)=>(data[kind]||[]).find(r=>String(r.id)===String(id));
 const name=(kind,id)=>{const r=getRecord(kind,id);return r?models[kind].titleOf(r):""};
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
  module="archives";screen="archives";activeId=null;
  render();
  if(!archivesInitialized){
   archivesInitialized=true;
   archivesFrame.src="./laboratorio.html?v=1.0.2";
  }else shareArchiveSession();
 }
 function openModule(next){
  if(next!=="dashboard"&&!models[next])return;
  module=next;screen=next==="dashboard"?"dashboard":"list";activeId=null;sortBy="";desc=false;
  $("#recordSearch").value="";$("#recordFilter").value="";render();
 }
 function render(){
  $$(".navlink").forEach(b=>b.classList.toggle("is-active",b.dataset.module===module));
  $("#dashboard").hidden=screen!=="dashboard";
  $("#recordsScreen").hidden=screen!=="list";
  $("#detailScreen").hidden=screen!=="detail";
  $("#archivesScreen").hidden=screen!=="archives";
  $("#accessSection").hidden=screen==="archives";
  $("#archivesNav").classList.toggle("is-active",screen==="archives");
  const m=models[module];
  $("#breadcrumb").textContent=screen==="archives"?"CRM / Amministrazione / Archivi":m?`CRM / ${m.group} / ${m.title}`:"CRM / Panoramica";
  $("#pageTitle").textContent=screen==="archives"?"Salvataggio e ripristino archivi":m?m.title:"Dashboard";
  $("#pageSubtitle").textContent=screen==="archives"?"Backup e ripristino guidato dei soli dati Contatti.":m?m.desc:"Un unico punto per contatti, aziende e attività commerciali.";
  $("#newRecord").hidden=!m;$("#newRecord").disabled=!authenticated;
  $("#newRecord").textContent=m?"+ Aggiungi "+m.single:"+ Aggiungi";
  dashboard();
  if(screen==="list")list();if(screen==="detail")detail();
 }
 function list(){
  const m=models[module],raw=data[module].slice();
  const filterField=module==="organizations"?"type":module==="deals"?"stage":"status";
  const old=$("#recordFilter").value,filterValues=[...new Set(raw.map(r=>r[filterField]).filter(Boolean))].sort();
  $("#recordFilter").innerHTML='<option value="">Tutti gli stati / tipi</option>'+filterValues.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if(filterValues.includes(old))$("#recordFilter").value=old;
  const q=$("#recordSearch").value.trim().toLowerCase();
  let filtered=raw.filter(r=>(!$("#recordFilter").value||r[filterField]===$("#recordFilter").value)&&
    (!q||Object.values(r).join(" ").toLowerCase().includes(q)||[name("contacts",r.contact_id),name("organizations",r.organization_id)].join(" ").toLowerCase().includes(q)));
  if(sortBy)filtered.sort((a,b)=>String(val(sortBy,a[sortBy])).localeCompare(String(val(sortBy,b[sortBy])),"it",{numeric:true})*(desc?-1:1));
  $("#listTitle").textContent=m.title+" · List View";
  $("#recordCount").textContent=filtered.length+" record · "+(authenticated?"Archivio PostgreSQL TEST":"Esempi inventati");
  $("#recordsHead").innerHTML="<tr>"+m.cols.map(([field,label])=>`<th><button type="button" data-sort="${field}">${esc(label)} ${sortBy===field?(desc?"↓":"↑"):""}</button></th>`).join("")+"</tr>";
  $("#recordsBody").innerHTML=filtered.length?filtered.map(r=>`<tr tabindex="0" data-id="${esc(r.id)}">`+m.cols.map(([field],i)=>`<td class="${i===0?"primary-cell":""}">${esc(display(field,r)||"—")}</td>`).join("")+"</tr>").join(""):`<tr><td colspan="${m.cols.length}" class="empty-row">Nessun record trovato.</td></tr>`;
 }
 function openRecord(id){if(!getRecord(module,id))return;activeId=id;tab="summary";screen="detail";render()}
 function detail(){
  const m=models[module],r=getRecord(module,activeId);
  if(!r){screen="list";render();return}
  $("#detailCaption").textContent=m.single+" · "+(authenticated?"Archivio TEST":"Esempio inventato");
  $("#detailTitle").textContent=m.titleOf(r);$("#detailSubtitle").textContent=m.subtitle(r);
  $("#editRecord").disabled=!authenticated;
  const canAddActivity=module==="contacts"||module==="organizations";
  for(const action of ["#logCall","#planFollowup"]){
   $(action).hidden=!canAddActivity;
   $(action).disabled=!authenticated;
  }
  $$(".tab").forEach(b=>{let on=b.dataset.tab===tab;b.classList.toggle("is-active",on);b.setAttribute("aria-selected",on?"true":"false")});
  if(tab==="oneview"){related(r);return}
  const fields=tab==="summary"?m.fields.slice(0,5):m.fields;
  $("#detailContent").innerHTML='<div class="fieldgrid">'+fields.map(([field,label])=>`<div class="fieldpair"><span>${esc(label)}</span><strong>${esc(display(field,r)||"—")}</strong></div>`).join("")+"</div>"+
   (tab==="summary"&&(module==="contacts"||module==="organizations")?activityTimeline(module,r.id):"");
 }
 function activityTimeline(kind,recordId){
  const history=data.activities.filter(activity=>
   kind==="contacts"?activity.contact_id===recordId:activity.organization_id===recordId
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
  if(!authenticated || screen!=="detail" || !["contacts","organizations"].includes(module))return;
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
    if(module==="organizations")return x.organization_id===r.id;
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
  if(!authenticated){showNotice("Collega l'archivio TEST per modificare.",true);return}
  formModule=settings.target||module;
  formContext=settings.context||null;
  editId=id;
  const m=models[formModule],r=id?getRecord(formModule,id):null;
  if(!m)return;
  const context=formContext;
  const home=context?getRecord(context.module,context.id):null;
  const defaults=context?{
   contact_id:context.contactId||"",organization_id:context.organizationId||"",
   ...context.defaults,
   subject:(context.defaults.type==="Richiamo"?"Richiamare: ":"Telefonata: ")+
     (home?models[context.module].titleOf(home):"")
  }:{};
  const selectedOrg=r?.organization_id??defaults.organization_id??"";
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
   else input=`<input type="${type==="email"?"email":type==="tel"?"tel":"text"}" ${attr} maxlength="${field==="email"?254:field==="name"||field==="subject"?200:field==="company"?180:120}" value="${esc(value)}">`;
   return `<label class="${type==="textarea"?"wide":""}" for="f_${field}">${esc(label)}${required?" *":""}${input}</label>`;
  }).join("");
  if(formModule==="activities"){
   if(context?.module==="contacts"){
    $("#f_contact_id").disabled=true;
    $("#f_organization_id").disabled=true;
   }else if(context?.module==="organizations"){
    $("#f_organization_id").disabled=true;
   }
  }
  $("#recordDialog").showModal();
 }
 function syncActivityLinks(event){
  if(formModule!=="activities")return;
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
  if(r.status===401)throw new Error("Chiave TEST non riconosciuta. Verifica la chiave e riprova.");
  if(r.status===503)throw new Error("Server o database TEST non ancora disponibile. Riprova.");
  if(!r.ok)throw new Error("Archivio non disponibile (HTTP "+r.status+").");
  return await r.json();
 }
 async function connect(candidate){
  if(!hasApi)throw new Error("API di collaudo non configurata");
  key=candidate;
  try{
   const kinds=Object.keys(models),incoming=await Promise.all(kinds.map(k=>get("/api/v1/"+k)));
   data=Object.fromEntries(kinds.map((k,i)=>[k,incoming[i]]));authenticated=true;
   $("#accessSection").classList.add("connected");
   $("#accessMessage").textContent="Archivio PostgreSQL TEST collegato. Non inserire dati personali reali.";
   $("#connectionBadge").textContent="Archivio TEST collegato";$("#connectionBadge").classList.add("connected");
   $("#demoKey").value="";
   loginStatus("Accesso riuscito: archivio TEST collegato.");
   showNotice("Accesso riuscito: ora visualizzi i dati del database TEST.",false);
   shareArchiveSession();render();
  }catch(e){
   key="";authenticated=false;data=structuredClone(demo);
   $("#accessSection").classList.remove("connected");
   $("#connectionBadge").textContent="Archivio non collegato";
   $("#connectionBadge").classList.remove("connected");
   shareArchiveSession();render();throw e;
  }
 }
 async function save(event){
  event.preventDefault();if(!authenticated)return;
  const payload={};
  const target=formModule;
  for(const [field,,type] of models[target].fields){
   let value=$("#f_"+field)?.value.trim()||"";
   if(type==="datetime-local"&&value)value=new Date(value).toISOString();
   if(field==="value"&&!value)value="0";
   payload[field]=value||null;
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
   if(originalContext){
    module=originalContext.module;
    activeId=originalContext.id;
   }else{
    module=target;
    activeId=result.id;
   }
   screen="detail";tab="summary";
   showNotice(models[target].single+(editId?" aggiornata":" creata")+
    (originalContext?" e aggiunta allo storico della scheda.":" nell'archivio TEST."));
   render();
  }catch(e){$("#dialogError").textContent=e.message}finally{$("#submitRecord").disabled=false}
 }
 $$(".navlink[data-module]").forEach(b=>b.addEventListener("click",()=>openModule(b.dataset.module)));
 $("#archivesNav").addEventListener("click",openArchives);
 $$("[data-jump]").forEach(b=>b.addEventListener("click",()=>openModule(b.dataset.jump)));
 $("#newRecord").addEventListener("click",()=>showForm());
 $("#backToList").addEventListener("click",()=>{screen="list";activeId=null;render()});
 $("#editRecord").addEventListener("click",()=>showForm(activeId));
 $("#logCall").addEventListener("click",()=>startActivityFromSheet("Telefonata"));
 $("#planFollowup").addEventListener("click",()=>startActivityFromSheet("Richiamo"));
 $("#formFields").addEventListener("change",syncActivityLinks);
 $("#recordSearch").addEventListener("input",list);
 $("#recordFilter").addEventListener("change",list);
 $("#recordsHead").addEventListener("click",e=>{const f=e.target.closest("[data-sort]")?.dataset.sort;if(!f)return;desc=sortBy===f?!desc:false;sortBy=f;list()});
 $("#recordsBody").addEventListener("click",e=>{const id=e.target.closest("tr[data-id]")?.dataset.id;if(id)openRecord(id)});
 $("#recordsBody").addEventListener("keydown",e=>{if(e.key==="Enter"){const id=e.target.closest("tr[data-id]")?.dataset.id;if(id)openRecord(id)}});
 $$(".tab").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.tab;detail()}));
 $("#detailContent").addEventListener("click",e=>{
  const b=e.target.closest("button[data-kind]");if(!b)return;
  module=b.dataset.kind;activeId=b.dataset.id;screen="detail";tab="summary";render();
 });
 $("#recordForm").addEventListener("submit",save);
 $("#closeDialog").addEventListener("click",()=>$("#recordDialog").close());
 $("#cancelDialog").addEventListener("click",()=>$("#recordDialog").close());
 $("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const candidate=$("#demoKey").value.trim();if(!candidate){showNotice("Inserisci la chiave di collaudo.",true);return}
  const b=$("#connectButton");
  b.disabled=true;
  b.textContent="Verifica in corso…";
  loginStatus("Connessione al server TEST e verifica della chiave…");
  showNotice("Verifica accesso in corso…");
  try{
   await connect(candidate);
  }catch(error){
   const message=error?.name==="TimeoutError"?"Timeout del server TEST: riprova fra poco.":
     error instanceof TypeError?"Server non raggiungibile o comunicazione bloccata dal browser. Riprova su Render TEST.":error.message;
   loginStatus(message,true);
   showNotice("Accesso non riuscito: "+message,true);
  }finally{
   b.disabled=false;
   b.textContent="Verifica e apri";
  }
 });
 render();
 window.__FASTPHARMA_CRM_READY__=true;
 if(desktop){
  $("#loginForm").hidden=true;showNotice("Collegamento al database Windows in corso…");
  connect(key).catch(e=>showNotice("Archivio Windows non pronto: "+e.message,true));
 }else if(!hasApi)showNotice("Demo statica: API non configurata.");
})();
