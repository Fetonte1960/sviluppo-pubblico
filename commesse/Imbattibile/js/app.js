const API = document.documentElement.dataset.apiBase.replace(/\/$/, "");
const state = { products: [], customers: [] };

const $ = (id) => document.getElementById(id);
const money = (v) => new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(v||0));
const dateTime = (v) => new Date(v).toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"});

async function api(path, options={}) {
  const response = await fetch(API + path, {
    headers: { "Content-Type":"application/json", ...(options.headers||{}) },
    ...options
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.message || body?.error || `HTTP ${response.status}`);
  return body;
}

function message(text, error=false) {
  const box=$("message"); box.textContent=text; box.hidden=false; box.classList.toggle("error",error);
  clearTimeout(message.timer); message.timer=setTimeout(()=>box.hidden=true,4200);
}

async function checkConnection() {
  const el=$("connection-status");
  try {
    const health=await api("/health");
    if (health.database==="ok") { el.textContent="API + Neon online"; el.className="status ok"; }
    else { el.textContent="API online · Neon da collegare"; el.className="status warn"; }
  } catch { el.textContent="API non raggiungibile"; el.className="status warn"; }
}

async function loadDashboard() {
  const d=await api("/api/dashboard");
  $("metrics").innerHTML=[
    ["Articoli",d.products],["Unità a magazzino",d.stockUnits],["Clienti",d.customers],
    ["Fatture",d.invoices],["Fatturato demo",money(d.invoicedTotal)]
  ].map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${v}</strong></div>`).join("");
}

async function loadProducts() {
  state.products=await api("/api/products");
  $("products-body").innerHTML=state.products.map(p=>`<tr><td>${p.sku}</td><td>${p.name}</td><td>${p.categoryName}</td><td>${p.stock} ${p.unit}</td><td>${money(p.salePrice)}</td></tr>`).join("");
  const options=state.products.map(p=>`<option value="${p.id}">${p.sku} · ${p.name} (disp. ${p.stock})</option>`).join("");
  $("movement-product").innerHTML=options;
  document.querySelectorAll(".line-product").forEach(select=>{ select.innerHTML=options; });
}

async function loadMovements() {
  const rows=await api("/api/stock/movements");
  $("movements-body").innerHTML=rows.slice(0,30).map(m=>`<tr><td>${dateTime(m.movedAt)}</td><td>${m.sku} · ${m.productName}</td><td><span class="badge ${m.direction.toLowerCase()}">${m.direction==="IN"?"Carico":"Scarico"}</span></td><td>${m.quantity}</td><td>${m.reason||""}</td></tr>`).join("");
}

async function loadCustomers() {
  state.customers=await api("/api/parties?kind=customer");
  $("invoice-customer").innerHTML=state.customers.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
}

async function loadInvoices() {
  const rows=await api("/api/invoices");
  $("invoices-body").innerHTML=rows.map(i=>`<tr><td>${i.number}</td><td>${new Date(i.date).toLocaleDateString("it-IT")}</td><td>${i.customerName}</td><td>${money(i.total)}</td><td><a href="${API}/api/invoices/${i.id}/fatturapa.xml" target="_blank">Scarica</a></td></tr>`).join("");
}

function addInvoiceLine() {
  const wrap=document.createElement("div"); wrap.className="invoice-line";
  wrap.innerHTML=`<label>Articolo<select class="line-product" required></select></label><label>Qtà<input class="line-qty" type="number" min="0.01" step="0.01" value="1" required></label><button type="button" class="icon-button" title="Rimuovi">×</button>`;
  wrap.querySelector(".line-product").innerHTML=state.products.map(p=>`<option value="${p.id}">${p.sku} · ${p.name}</option>`).join("");
  wrap.querySelector(".icon-button").onclick=()=>wrap.remove();
  $("invoice-lines").appendChild(wrap);
}

async function refreshAll() {
  try {
    await checkConnection();
    await Promise.all([loadDashboard(),loadProducts(),loadMovements(),loadCustomers(),loadInvoices()]);
  } catch (e) { message(e.message,true); }
}

document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $("view-"+btn.dataset.view).classList.add("active");
}));

$("movement-form").addEventListener("submit", async e=>{
  e.preventDefault();
  try {
    await api("/api/stock/movements",{method:"POST",body:JSON.stringify({
      productId:Number($("movement-product").value),
      direction:$("movement-direction").value,
      quantity:Number($("movement-quantity").value),
      reason:$("movement-reason").value
    })});
    message("Movimento registrato.");
    await Promise.all([loadProducts(),loadMovements(),loadDashboard()]);
  } catch(err){message(err.message,true);}
});

$("invoice-form").addEventListener("submit", async e=>{
  e.preventDefault();
  const lines=[...document.querySelectorAll(".invoice-line")].map(row=>({
    productId:Number(row.querySelector(".line-product").value),
    quantity:Number(row.querySelector(".line-qty").value)
  }));
  try {
    const created=await api("/api/invoices",{method:"POST",body:JSON.stringify({
      customerId:Number($("invoice-customer").value), date:$("invoice-date").value, lines
    })});
    message(`Fattura ${created.number} creata.`);
    $("invoice-lines").innerHTML=""; addInvoiceLine();
    await Promise.all([loadInvoices(),loadProducts(),loadMovements(),loadDashboard()]);
  } catch(err){message(err.message,true);}
});

$("add-line").addEventListener("click",addInvoiceLine);
$("refresh-all").addEventListener("click",refreshAll);
$("invoice-date").value=new Date().toISOString().slice(0,10);

checkConnection().then(async()=>{
  try {
    await Promise.all([loadProducts(),loadCustomers()]);
    addInvoiceLine();
    await Promise.all([loadDashboard(),loadMovements(),loadInvoices()]);
  } catch(e) { message(e.message,true); }
});
