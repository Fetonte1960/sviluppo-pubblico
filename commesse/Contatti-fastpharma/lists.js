"use strict";
(() => {
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const fmt=v=>v?new Date(v).toLocaleDateString("it-IT"):"Mai";
 let key="",base="",lists=[],current=null,rows=[],offset=0,total=0;
 let pollTimer=null,debounce=null,requestIndex=0,signature="";
 const pageSize=50;
 const controls=["listsCollection","listsRefresh","listsFile","listsSearch","listsRegion","listsProvince","listsCity","listsCategory"];
 function feedback(text,error=false){$("listsProgress").textContent=text;$("listsError").textContent=error?text:"";}
 async function api(path,options={}){
  if(!key)throw Error("Collega prima l'archivio TEST.");
  const res=await fetch(base+path,{
   ...options,headers:{"X-Demo-Key":key,...(options.headers||{})},
   cache:"no-store",signal:AbortSignal.timeout(options.method==="POST"?300000:30000)
  });
  if(res.status===401)throw Error("Chiave TEST non riconosciuta.");
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(body.error||"Richiesta non riuscita: HTTP "+res.status);
  return body;
 }
 function enabled(value){for(const id of controls)$(id).disabled=!value;}
 function options(select,values,label){
  select.innerHTML='<option value="">'+esc(label)+'</option>'+
   values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
 }
 function clearFilters(){
  for(const id of ["listsSearch","listsRegion","listsProvince","listsCity","listsCategory"])$(id).value="";
  offset=0;
 }
 function displaySource(){
  if(!current)return;
  const parts=[
   "Fonte: "+(current.source_name||"—"),
   "Farmacie: "+Number(current.record_count||0).toLocaleString("it-IT"),
   "Importato il: "+fmt(current.imported_at),
   "Licenza: "+(current.license||"—")
  ];
  if(current.source_date)parts.push("Data dataset: "+String(current.source_date).slice(0,10));
  $("listsMetadata").innerHTML=parts.map(x=>'<span>'+esc(x)+'</span>').join("");
  if(/^https:\/\//.test(current.source_url||""))
   $("listsMetadata").innerHTML+='<a href="'+esc(current.source_url)+'" target="_blank" rel="noopener noreferrer">Apri fonte e scarica CSV</a>';
  $("listsRefresh").disabled=!key||current.slug!=="farmacie-ministero-salute";
  $("listsFile").disabled=!key||current.slug!=="farmacie-ministero-salute";
 }
 async function loadLists(){
  lists=await api("/api/v1/lists");
  const keep=current?.id;
  current=lists.find(x=>x.id===keep)||lists[0]||null;
  $("listsCollection").innerHTML=lists.map(x=>
   '<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("");
  if(!current){feedback("Nessuna lista configurata.",true);return;}
  $("listsCollection").value=current.id;
  displaySource();
  await loadFacets();
  await page();
 }
 async function loadFacets(){
  if(!current)return;
  const value=await api("/api/v1/lists/"+encodeURIComponent(current.id)+"/facets");
  options($("listsRegion"),value.region||[],"Tutte le regioni");
  options($("listsProvince"),value.province||[],"Tutte le province");
  options($("listsCategory"),value.category||[],"Tutte le tipologie");
 }
 function query(){
  const p=new URLSearchParams({offset:String(offset),limit:String(pageSize)});
  for(const [k,id] of Object.entries({q:"listsSearch",region:"listsRegion",province:"listsProvince",city:"listsCity",category:"listsCategory"})){
   if($(id).value.trim())p.set(k,$(id).value.trim());
  }
  return p.toString();
 }
 async function page(){
  if(!current||!key)return;
  const ticket=++requestIndex;
  $("listsBody").innerHTML='<tr><td colspan="6" class="empty-row">Ricerca in corso…</td></tr>';
  try{
   const result=await api("/api/v1/lists/"+encodeURIComponent(current.id)+"/entries?"+query());
   if(ticket!==requestIndex)return;
   rows=result.entries||[];total=result.total||0;
   $("listsBody").innerHTML=rows.length?rows.map((r,i)=>
    '<tr tabindex="0" data-list-index="'+i+'">'+
    '<td class="primary-cell">'+esc(r.code)+'</td>'+
    '<td>'+esc(r.name)+'</td>'+
    '<td>'+esc([r.address,r.postal_code,r.city,r.province].filter(Boolean).join(", "))+'</td>'+
    '<td>'+esc(r.region)+'</td><td>'+esc(r.category)+'</td><td>'+esc(r.vat_number)+'</td></tr>'
   ).join(""):'<tr><td colspan="6" class="empty-row">Nessuna farmacia trovata. Verifica i filtri oppure importa l’elenco nazionale.</td></tr>';
   $("listsCount").textContent=total.toLocaleString("it-IT")+" farmacie corrispondenti ai filtri · dati pubblici";
   $("listsPageInfo").textContent=total?(offset+1).toLocaleString("it-IT")+"–"+(offset+rows.length).toLocaleString("it-IT")+" di "+total.toLocaleString("it-IT"):"0 di 0";
   $("listsPrev").disabled=offset===0;
   $("listsNext").disabled=offset+pageSize>=total;
   // Stessa navigazione accessibile sopra e sotto la tabella.
   $("listsPrevTop").disabled=$("listsPrev").disabled;
   $("listsNextTop").disabled=$("listsNext").disabled;
   $("listsPageInfoTop").textContent=$("listsPageInfo").textContent;
   $("listsScroll").scrollTop=0;
   $("listsError").textContent="";
  }catch(e){
   if(ticket===requestIndex)feedback(e.message,true);
  }
 }
 function showEntry(index){
  const item=rows[index];if(!item)return;
  $("listEntryTitle").textContent=item.name;
  const details={
   "Codice ministeriale":item.code,"Denominazione":item.name,"Partita IVA":item.vat_number,
   "Indirizzo":item.address,"CAP":item.postal_code,"Comune":item.city,
   "Provincia":item.province,"Regione":item.region,"Tipologia":item.category,
   ...item.original
  };
  $("listEntryDetails").innerHTML='<div class="fieldgrid">'+Object.entries(details)
   .filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!=="")
   .map(([k,v])=>'<div class="fieldpair"><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join("")+
   '</div><p class="hint">Dati della Lista esterna: non è ancora un’Organizzazione commerciale FastPharma.</p>';
  $("listEntryDialog").showModal();
 }
 async function poll(){
  if(!key)return;
  try{
   const status=await api("/api/v1/lists/import-status");
   if(status.state==="running"){
    feedback("Importazione in corso. "+(status.message||""));
    clearTimeout(pollTimer);pollTimer=setTimeout(poll,3000);
   }else{
    clearTimeout(pollTimer);pollTimer=null;
    if(status.state==="error")feedback(status.message,true);
    else if(status.state==="completed")feedback(status.message);
    await loadLists();
   }
  }catch(e){feedback(e.message,true);}
 }
 async function refresh(){
  if(!current||current.slug!=="farmacie-ministero-salute")return;
  if(!confirm("Scaricare e aggiornare l’intero elenco nazionale dal Ministero della Salute?"))return;
  $("listsRefresh").disabled=true;
  try{
   const r=await api("/api/v1/lists/ministero-farmacie/refresh",{method:"POST"});
   feedback("Download dell'elenco ministeriale avviato…");
   if(r.state==="running")await poll();
  }catch(e){feedback(e.message,true);}
  finally{if(current)$("listsRefresh").disabled=false;}
 }
 async function upload(file){
  if(!file)return;
  if(!/\.csv$/i.test(file.name)){feedback("Scegli un file CSV ufficiale.",true);return;}
  if(file.size>45*1024*1024){feedback("Il file supera 45 MB.",true);return;}
  if(!confirm("Importare l'intero CSV ministeriale? Non sarà alterato il CRM commerciale."))return;
  $("listsFile").disabled=true;feedback("Validazione e importazione del CSV in corso…");
  try{
   const r=await api("/api/v1/lists/ministero-farmacie/upload",{
    method:"POST",headers:{"Content-Type":"text/csv","X-Source-Filename":file.name},body:file
   });
   feedback(r.message||"Importazione completata.");await loadLists();
  }catch(e){feedback(e.message,true);}
  finally{$("listsFile").value="";$("listsFile").disabled=false;}
 }
 async function open({key:newKey,base:newBase}){
  const k=String(newKey||""),b=String(newBase||"").replace(/\/$/,"");
  const changed=signature!==b+"|"+k;key=k;base=b;signature=b+"|"+k;
  if(!key){
   enabled(false);$("listsCount").textContent="Collega l'archivio TEST per consultare le Liste.";
   feedback("Inserisci la chiave di collaudo.");return;
  }
  enabled(true);
  if(changed||!lists.length){
   try{await loadLists();feedback("Archivio Liste collegato.");}
   catch(e){feedback(e.message,true);}
  }
  try{
   const status=await api("/api/v1/lists/import-status");
   if(status.state==="running")await poll();
  }catch{}
 }
 $("listsCollection").addEventListener("change",async()=>{
  current=lists.find(x=>x.id===$("listsCollection").value)||null;
  clearFilters();displaySource();if(current){await loadFacets();await page();}
 });
 const filter=()=>{offset=0;clearTimeout(debounce);debounce=setTimeout(page,250);};
 for(const id of ["listsSearch","listsCity"])$(id).addEventListener("input",filter);
 for(const id of ["listsRegion","listsProvince","listsCategory"])$(id).addEventListener("change",filter);
 $("listsClear").addEventListener("click",()=>{clearFilters();page();});
 const prevPage=()=>{offset=Math.max(0,offset-pageSize);void page();};
 const nextPage=()=>{if(offset+pageSize<total){offset+=pageSize;void page();}};
 for(const id of ["listsPrev","listsPrevTop"])$(id).addEventListener("click",prevPage);
 for(const id of ["listsNext","listsNextTop"])$(id).addEventListener("click",nextPage);
 $("listsRefresh").addEventListener("click",refresh);
 $("listsFile").addEventListener("change",e=>upload(e.target.files?.[0]));
 $("listsBody").addEventListener("click",e=>{const i=e.target.closest("tr[data-list-index]")?.dataset.listIndex;if(i!==undefined)showEntry(Number(i));});
 $("listsBody").addEventListener("keydown",e=>{if(e.key==="Enter"){const i=e.target.closest("tr[data-list-index]")?.dataset.listIndex;if(i!==undefined)showEntry(Number(i));}});
 for(const id of ["closeListEntry","dismissListEntry"])$(id).addEventListener("click",()=>$("listEntryDialog").close());
 window.FastPharmaLists={open};
})();
