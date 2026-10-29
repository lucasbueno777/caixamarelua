import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,runTransaction,serverTimestamp,deleteDoc,setDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id), money=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
const CLOUDINARY_CLOUD_NAME='uwg5ge8x';
const CLOUDINARY_UPLOAD_PRESET='marelua_produtos';
let products=[],sales=[],cart={},confirmed=false,busy=false,unsubs=[],connected={products:false,sales:false};
const dateKey=(d=new Date())=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`};
const nowBR=()=>new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
$('saleDate').textContent=nowBR();$('reportDate').value=dateKey();
function status(){ $('connection').textContent=connected.products&&connected.sales?'● Sincronizado':'● Verificando conexão'; }
function showPage(page){document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==`page-${page}`);document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));if(page==='fechamento')renderReport();}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(err){$('loginError').textContent='Não foi possível entrar. Confira o e-mail, a senha e a configuração do Firebase.'}};
$('logout').onclick=()=>signOut(auth);
onAuthStateChanged(auth,user=>{unsubs.forEach(fn=>fn());unsubs=[];connected={products:false,sales:false};status();if(!user){$('loginView').hidden=false;$('app').hidden=true;products=[];sales=[];cart={};return}$('loginView').hidden=true;$('app').hidden=false;
 unsubs.push(onSnapshot(collection(db,'products'),snapshot=>{products=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));connected.products=true;status();renderProducts();renderCart();},err=>{$('connection').textContent='Erro ao carregar produtos: '+err.code}));
 unsubs.push(onSnapshot(collection(db,'sales'),snapshot=>{sales=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));connected.sales=true;status();renderHistory();renderReport();},err=>{$('connection').textContent='Erro ao carregar vendas: '+err.code}));});
function imageTag(p){return p.photoUrl?`<img src="${escapeHtml(p.photoUrl)}" alt="${escapeHtml(p.name)}" loading="lazy">`:'<div class="thumb" style="display:grid;place-items:center;font-size:32px;color:#bb985e">☾</div>'}
function renderProducts(){let q=$('search').value.toLowerCase().trim();$('catalog').innerHTML=products.filter(p=>p.name.toLowerCase().includes(q)).map(p=>`<article class="product-card">${imageTag(p)}<b>${escapeHtml(p.name)}</b><strong>${money(p.price)}</strong><small>${p.stock} em estoque</small><button class="primary" data-add="${p.id}" ${p.stock<1||confirmed?'disabled':''}>Adicionar +</button></article>`).join('')||'<p>Nenhum produto encontrado.</p>';
$('productList').innerHTML=products.map(p=>`<div class="list-line">${p.photoUrl?`<img src="${escapeHtml(p.photoUrl)}" alt="">`:''}<div class="details"><b>${escapeHtml(p.name)}</b><br><small>${money(p.price)} • Estoque: ${p.stock}</small></div><div class="buttons"><button class="smallbtn" data-edit="${p.id}">Editar</button><button class="smallbtn" data-delete="${p.id}">Excluir</button></div></div>`).join('')||'<p>Cadastre seu primeiro produto.</p>'}
$('search').oninput=renderProducts;
$('catalog').onclick=e=>{const b=e.target.closest('[data-add]');if(!b||confirmed)return;const p=products.find(p=>p.id===b.dataset.add);if(!p)return;if((cart[p.id]||0)>=p.stock)return alert('Estoque insuficiente.');cart[p.id]=(cart[p.id]||0)+1;renderCart()};
$('cart').onclick=e=>{let b=e.target.closest('[data-qty]');if(!b||confirmed)return;let id=b.dataset.id,p=products.find(p=>p.id===id);if(!p)return;cart[id]=Math.max(0,Math.min(p.stock,(cart[id]||0)+Number(b.dataset.qty)));if(!cart[id])delete cart[id];renderCart()};
function getTotals(){const items=Object.entries(cart).map(([id,qty])=>({p:products.find(p=>p.id===id),qty})).filter(x=>x.p&&x.qty>0);const subtotal=items.reduce((s,{p,qty})=>s+Math.round(Number(p.price)*100)*qty,0);const raw=Math.round((Number($('discount').value)||0)*100);const discount=Math.max(0,Math.min(subtotal,raw));return {items,subtotal,discount,total:subtotal-discount}}
function renderCart(){let t=getTotals();$('cart').innerHTML=t.items.map(({p,qty})=>`<div class="cart-line"><div><b>${escapeHtml(p.name)}</b><br><small>${money(p.price)} × ${qty}</small></div><div class="qty"><button data-qty="-1" data-id="${p.id}" ${confirmed?'disabled':''}>−</button>${qty}<button data-qty="1" data-id="${p.id}" ${confirmed?'disabled':''}>+</button></div></div>`).join('')||'<p>Seu carrinho está vazio.</p>';$('subtotal').textContent=money(t.subtotal/100);$('discountDisplay').textContent=money(t.discount/100);$('total').textContent=money(t.total/100);$('confirmSale').hidden=confirmed;$('paymentBox').hidden=!confirmed;$('discount').disabled=confirmed;renderProducts()}
$('discount').oninput=()=>{confirmed=false;renderCart()};$('confirmSale').onclick=()=>{const t=getTotals();if(!t.items.length)return alert('Adicione um produto.');if(t.items.some(({p,qty})=>qty>p.stock))return alert('O estoque mudou. Revise o carrinho.');if(Number($('discount').value)<0||!Number.isFinite(Number($('discount').value)))return alert('Desconto inválido.');confirmed=true;$('saleMessage').textContent='Carrinho confirmado. Escolha a forma de pagamento.';renderCart()};$('cancelConfirm').onclick=()=>{confirmed=false;renderCart()};
document.querySelectorAll('input[name="payment"]').forEach(input=>input.addEventListener('change',()=>{$('installmentsBox').hidden=document.querySelector('input[name="payment"]:checked').value!=='Crédito parcelado'}));

$('finishSale').onclick=async()=>{
 if(busy||!confirmed)return;
 let t=getTotals();
 if(!t.items.length)return;
 busy=true;
 $('finishSale').disabled=true;
 $('saleMessage').textContent='Registrando venda...';
 const payment=document.querySelector('input[name="payment"]:checked').value;
 const installments=payment==='Crédito parcelado'?Number($('installments').value):1;
 try{
  const saleRef=doc(collection(db,'sales'));
  await runTransaction(db,async tx=>{
   const refs=t.items.map(({p})=>doc(db,'products',p.id));
   const snapshots=[];
   for(const r of refs)snapshots.push(await tx.get(r));
   for(let i=0;i<snapshots.length;i++){
    const snap=snapshots[i],item=t.items[i];
    if(!snap.exists())throw Error('Produto excluído: '+item.p.name);
    const current=snap.data();
    if(current.stock<item.qty)throw Error('Estoque insuficiente: '+item.p.name);
   }
   for(let i=0;i<refs.length;i++)
    tx.update(refs[i],{stock:snapshots[i].data().stock-t.items[i].qty});
   tx.set(saleRef,{
    date:dateKey(),
    createdAt:serverTimestamp(),
    payment,
    installments,
    subtotalCents:t.subtotal,
    discountCents:t.discount,
    totalCents:t.total,
    items:t.items.map(({p,qty})=>({
     id:p.id,
     name:p.name,
     qty,
     priceCents:Math.round(Number(p.price)*100)
    }))
   });
  });
  cart={};
  confirmed=false;
  $('discount').value='0';
  $('saleMessage').textContent='Venda finalizada com sucesso!';
  showPage('caixa');
  renderCart();
 }catch(err){
  $('saleMessage').textContent='Erro: '+err.message;
 }finally{
  busy=false;
  $('finishSale').disabled=false;
 }
};

async function uploadImageToCloudinary(file){
 const endpoint=`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
 const formData=new FormData();
 formData.append('file',file);
 formData.append('upload_preset',CLOUDINARY_UPLOAD_PRESET);
 formData.append('folder','marelua_produtos');

 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),30000);

 try{
  const response=await fetch(endpoint,{
   method:'POST',
   body:formData,
   signal:controller.signal
  });
  const result=await response.json().catch(()=>({}));

  if(!response.ok){
   const reason=result?.error?.message||
    `Falha no envio da foto (HTTP ${response.status}).`;
   throw new Error(reason);
  }

  if(!result.secure_url)
   throw new Error('O Cloudinary não retornou o link da imagem.');

  return result.secure_url;
 }catch(err){
  if(err.name==='AbortError')
   throw new Error('O envio da foto demorou mais de 30 segundos. Verifique a internet e tente novamente.');
  throw err;
 }finally{
  clearTimeout(timeout);
 }
}

function resetProduct(){
 $('productForm').reset();
 $('productId').value='';
 $('productFormTitle').textContent='Cadastrar produto';
 $('productMessage').textContent='';
}
$('resetProduct').onclick=resetProduct;

$('productForm').onsubmit=async e=>{
 e.preventDefault();

 const id=$('productId').value||doc(collection(db,'products')).id;
 const name=$('productName').value.trim();
 const price=Number($('productPrice').value);
 const stock=Number($('productStock').value);

 if(!name||!Number.isFinite(price)||price<0||
    !Number.isSafeInteger(stock)||stock<0)
  return alert('Confira nome, preço e estoque.');

 const btn=$('productForm').querySelector('button[type=submit]');
 btn.disabled=true;
 $('productMessage').textContent='Salvando...';

 try{
  const existing=products.find(p=>p.id===id);
  let photoUrl=$('productPhotoUrl').value.trim()||
    existing?.photoUrl||'';

  const file=$('productPhoto').files[0];

  if(file){
   if(!file.type.startsWith('image/'))
    throw Error('Escolha uma imagem.');

   if(file.size>5*1024*1024)
    throw Error('A foto deve ter até 5 MB.');

   photoUrl=await uploadImageToCloudinary(file);
  }

  await setDoc(doc(db,'products',id),{
   name,
   price,
   stock,
   photoUrl
  });

  resetProduct();
  $('productMessage').textContent='Produto salvo com sucesso.';
 }catch(err){
  $('productMessage').textContent='Erro ao salvar: '+err.message;
 }finally{
  btn.disabled=false;
 }
};

$('productList').onclick=async e=>{
 const edit=e.target.closest('[data-edit]');
 const del=e.target.closest('[data-delete]');

 if(edit){
  const p=products.find(p=>p.id===edit.dataset.edit);
  if(!p)return;

  $('productId').value=p.id;
  $('productName').value=p.name;
  $('productPrice').value=p.price;
  $('productStock').value=p.stock;
  $('productPhotoUrl').value=p.photoUrl||'';
  $('productFormTitle').textContent='Editar produto';

  window.scrollTo({top:0,behavior:'smooth'});
 }

 if(del){
  const p=products.find(p=>p.id===del.dataset.delete);

  if(p&&confirm(`Excluir ${p.name}? O histórico das vendas será preservado.`)){
   try{
    await deleteDoc(doc(db,'products',p.id));
   }catch(err){
    alert('Não foi possível excluir: '+err.message);
   }
  }
 }
};

function saleTime(s){
 return s.createdAt?.toDate?.().toLocaleString('pt-BR',{
  timeZone:'America/Sao_Paulo'
 })||'Processando data...';
}

function paymentLabel(s){
 return s.payment==='Crédito parcelado'
  ?`Crédito parcelado (${s.installments||2}x)`
  :s.payment;
}

function renderHistory(){
 $('history').innerHTML=sales.map(s=>`
  <details class="sale-record">
   <summary>${s.cancelled?'[CANCELADA] ':''}${saleTime(s)} • ${money((s.totalCents||0)/100)} • ${escapeHtml(paymentLabel(s))}</summary>
   <p>${(s.items||[]).map(i=>`${escapeHtml(i.name)} (${i.qty} × ${money(i.priceCents/100)})`).join('<br>')}</p>
   <p>Subtotal: ${money((s.subtotalCents||0)/100)} | Desconto: ${money((s.discountCents||0)/100)}</p>
   <p>ID: ${escapeHtml(s.id)}</p>
   ${s.cancelled
    ?'<p><b>Esta venda foi cancelada e não entra no fechamento.</b></p>'
    :`<div class="buttons" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
       <button class="smallbtn" type="button" data-sale-edit="${escapeHtml(s.id)}">Editar venda</button>
       <button class="smallbtn" type="button" data-sale-cancel="${escapeHtml(s.id)}">Cancelar venda</button>
      </div>`
   }
  </details>
 `).join('')||'<p>Nenhuma venda registrada.</p>';
}

function reportData(){
 const day=$('reportDate').value;
 const rows=sales.filter(s=>s.date===day&&!s.cancelled);
 const sum=k=>rows.reduce((v,s)=>v+(s[k]||0),0);
 const by=method=>rows.filter(s=>s.payment===method)
  .reduce((v,s)=>v+(s.totalCents||0),0);

 return {
  day,
  rows,
  count:rows.length,
  subtotal:sum('subtotalCents'),
  discount:sum('discountCents'),
  total:sum('totalCents'),
  pix:by('Pix'),
  cash:by('Dinheiro'),
  debit:by('Débito'),
  credit:by('Crédito'),
  creditInstallments:by('Crédito parcelado')
 };
}

function reportText(){
 let r=reportData();

 return `MAR E LUA - FECHAMENTO DO CAIXA
Data: ${r.day.split('-').reverse().join('/')}

Vendas: ${r.count}
Subtotal: ${money(r.subtotal/100)}
Descontos: ${money(r.discount/100)}
FATURAMENTO: ${money(r.total/100)}

Pix: ${money(r.pix/100)}
Dinheiro: ${money(r.cash/100)}
Débito: ${money(r.debit/100)}
Crédito à vista: ${money(r.credit/100)}
Crédito parcelado: ${money(r.creditInstallments/100)}

DETALHAMENTO DAS VENDAS
${r.rows.length?r.rows.map((s,i)=>`
${i+1}. ${saleTime(s)} | ${paymentLabel(s)} | ${money(s.totalCents/100)}
${s.items.map(x=>`  ${x.qty}x ${x.name} - ${money(x.priceCents*x.qty/100)}`).join('\n')}
  Desconto: ${money(s.discountCents/100)}`).join('\n'):'Nenhuma venda nesta data.'}`;
}

function renderReport(){
 let r=reportData();

 $('report').innerHTML=`
  <div class="stats">
   <div class="stat"><small>Vendas</small><strong>${r.count}</strong></div>
   <div class="stat"><small>Faturamento</small><strong>${money(r.total/100)}</strong></div>
   <div class="stat"><small>Descontos</small><strong>${money(r.discount/100)}</strong></div>
   <div class="stat"><small>Pix</small><strong>${money(r.pix/100)}</strong></div>
   <div class="stat"><small>Dinheiro</small><strong>${money(r.cash/100)}</strong></div>
   <div class="stat"><small>Débito</small><strong>${money(r.debit/100)}</strong></div>
   <div class="stat"><small>Crédito à vista</small><strong>${money(r.credit/100)}</strong></div>
   <div class="stat"><small>Crédito parcelado</small><strong>${money(r.creditInstallments/100)}</strong></div>
  </div>
  <h2 style="margin-top:22px">Detalhamento</h2>
  ${r.rows.map(s=>`
   <div class="sale-record">
    <b>${saleTime(s)} — ${escapeHtml(paymentLabel(s))} — ${money(s.totalCents/100)}</b>
    <p>${s.items.map(i=>`${i.qty}× ${escapeHtml(i.name)} (${money(i.priceCents*i.qty/100)})`).join('<br>')}</p>
    <small>Desconto: ${money(s.discountCents/100)}</small>
   </div>
  `).join('')||'<p>Nenhuma venda nesta data.</p>'}
 `;
}

$('reportDate').onchange=renderReport;

$('shareReport').onclick=()=>{
 const url='https://wa.me/?text='+encodeURIComponent(reportText());
 window.open(url,'_blank','noopener,noreferrer');
};

$('printReport').onclick=()=>window.print();

// Edição e cancelamento seguro de vendas: o estoque é ajustado na mesma transação.
let editingSaleId=null;

function ensureSaleEditor(){
 if($('saleEditor'))return;

 const wrap=document.createElement('div');
 wrap.id='saleEditor';
 wrap.hidden=true;
 wrap.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);padding:16px;overflow:auto;';

 wrap.innerHTML=`
  <div style="max-width:760px;margin:20px auto;background:#fff;color:#171717;border-radius:14px;padding:20px;box-sizing:border-box">
   <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
    <h2 style="margin:0">Editar venda</h2>
    <button type="button" id="closeSaleEditor" class="ghost">Fechar</button>
   </div>

   <p class="hint">Altere os produtos, quantidades, desconto e pagamento. O estoque será recalculado ao salvar.</p>

   <div id="editSaleItems"></div>

   <button type="button" id="addSaleItem" class="ghost" style="margin:10px 0">+ Adicionar produto</button>

   <label>Desconto (R$)
    <input id="editSaleDiscount" type="number" min="0" step="0.01" value="0">
   </label>

   <div style="margin:12px 0;font-weight:700">
    Subtotal: <span id="editSaleSubtotal">R$ 0,00</span>
    · Total: <span id="editSaleTotal">R$ 0,00</span>
   </div>

   <label>Forma de pagamento
    <select id="editSalePayment">
     <option>Pix</option>
     <option>Dinheiro</option>
     <option>Débito</option>
     <option>Crédito</option>
     <option>Crédito parcelado</option>
    </select>
   </label>

   <div id="editSaleInstallmentsBox" hidden>
    <label>Parcelas
     <select id="editSaleInstallments">
      ${Array.from({length:11},(_,i)=>`<option value="${i+2}">${i+2}x</option>`).join('')}
     </select>
    </label>
   </div>

   <p id="editSaleMessage" role="status"></p>

   <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button type="button" id="saveSaleEdit" class="primary">Salvar alterações</button>
    <button type="button" id="cancelSaleEdit" class="ghost">Descartar</button>
   </div>
  </div>
 `;

 document.body.appendChild(wrap);

 $('closeSaleEditor').onclick=closeSaleEditor;
 $('cancelSaleEdit').onclick=closeSaleEditor;

 $('addSaleItem').onclick=()=>{
  addEditSaleRow();
  updateEditSaleTotals();
 };

 $('editSaleItems').onclick=e=>{
  const b=e.target.closest('[data-remove-edit-item]');
  if(b){
   b.closest('[data-edit-row]').remove();
   updateEditSaleTotals();
  }
 };

 $('editSaleItems').onchange=e=>{
  if(e.target.matches('[data-edit-product]')){
   const row=e.target.closest('[data-edit-row]');
   const p=products.find(x=>x.id===e.target.value);

   row.dataset.price=String(p?Math.round(Number(p.price)*100):0);
   row.querySelector('[data-edit-price]').textContent=
    money((Number(row.dataset.price)||0)/100);

   updateEditSaleTotals();
  }
 };

 $('editSaleItems').oninput=e=>{
  if(e.target.matches('[data-edit-qty]'))updateEditSaleTotals();
 };

 $('editSalePayment').onchange=()=>{
  $('editSaleInstallmentsBox').hidden=
   $('editSalePayment').value!=='Crédito parcelado';
 };

 $('editSaleDiscount').oninput=updateEditSaleTotals;
 $('saveSaleEdit').onclick=saveSaleEdit;
}

function closeSaleEditor(){
 if($('saleEditor'))$('saleEditor').hidden=true;
 editingSaleId=null;
}

function addEditSaleRow(item=null){
 const host=$('editSaleItems');
 const row=document.createElement('div');

 row.dataset.editRow='1';

 const chosen=item?.id||products[0]?.id||'';

 const priceCents=Number.isFinite(Number(item?.priceCents))
  ?Number(item.priceCents)
  :Math.round(Number(products.find(p=>p.id===chosen)?.price||0)*100);

 row.dataset.price=String(priceCents);

 row.style.cssText='display:grid;grid-template-columns:minmax(150px,1fr) 75px auto auto;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #ddd';

 row.innerHTML=`
  <select data-edit-product aria-label="Produto">
   ${products.map(p=>`
    <option value="${escapeHtml(p.id)}" ${p.id===chosen?'selected':''}>
     ${escapeHtml(p.name)} (estoque ${Number(p.stock)||0})
    </option>
   `).join('')}
  </select>

  <input data-edit-qty aria-label="Quantidade" type="number" min="1" step="1" value="${Math.max(1,Number(item?.qty)||1)}">

  <span data-edit-price>${money(priceCents/100)}</span>

  <button type="button" class="smallbtn" data-remove-edit-item>Remover</button>
 `;

 host.appendChild(row);
}

function updateEditSaleTotals(){
 const rows=[...$('editSaleItems').querySelectorAll('[data-edit-row]')];
 let subtotal=0;

 rows.forEach(row=>{
  const qty=Number(row.querySelector('[data-edit-qty]').value);
  const price=Number(row.dataset.price)||0;

  subtotal+=Number.isSafeInteger(qty)&&qty>0?qty*price:0;
 });

 const raw=Number($('editSaleDiscount').value);
 const discount=Number.isFinite(raw)&&raw>0?Math.round(raw*100):0;

 $('editSaleSubtotal').textContent=money(subtotal/100);
 $('editSaleTotal').textContent=
  money(Math.max(0,subtotal-Math.min(subtotal,discount))/100);
}

function openSaleEditor(id){
 const sale=sales.find(s=>s.id===id);
 if(!sale||sale.cancelled)return;

 if(!products.length){
  alert('Cadastre ou carregue os produtos antes de editar uma venda.');
  return;
 }

 ensureSaleEditor();
 editingSaleId=id;
 $('editSaleItems').innerHTML='';

 (sale.items||[]).forEach(item=>addEditSaleRow(item));

 $('editSaleDiscount').value=((sale.discountCents||0)/100).toFixed(2);
 $('editSalePayment').value=sale.payment||'Pix';
 $('editSaleInstallments').value=String(sale.installments||2);

 $('editSaleInstallmentsBox').hidden=
  $('editSalePayment').value!=='Crédito parcelado';

 $('editSaleMessage').textContent='';
 $('saveSaleEdit').disabled=false;
 $('saleEditor').hidden=false;

 updateEditSaleTotals();
}

async function saveSaleEdit(){
 if(busy||!editingSaleId)return;

 const sale=sales.find(s=>s.id===editingSaleId);
 if(!sale||sale.cancelled)return closeSaleEditor();

 const rows=[...$('editSaleItems').querySelectorAll('[data-edit-row]')];

 if(!rows.length)
  return alert('A venda precisa ter pelo menos um produto.');

 const newItems=[];

 for(const row of rows){
  const id=row.querySelector('[data-edit-product]').value;
  const qty=Number(row.querySelector('[data-edit-qty]').value);
  const p=products.find(x=>x.id===id);

  if(!p||!Number.isSafeInteger(qty)||qty<1){
   alert('Confira os produtos e as quantidades.');
   return;
  }

  const priceCents=Number(row.dataset.price);

  if(!Number.isSafeInteger(priceCents)||priceCents<0){
   alert('Preço inválido em um dos produtos.');
   return;
  }

  newItems.push({
   id:p.id,
   name:p.name,
   qty,
   priceCents
  });
 }

 if(new Set(newItems.map(i=>i.id)).size!==newItems.length){
  alert('O mesmo produto aparece mais de uma vez. Remova a linha repetida e ajuste a quantidade.');
  return;
 }

 const subtotalCents=newItems.reduce(
  (sum,i)=>sum+i.qty*i.priceCents,0
 );

 const rawDiscount=Number($('editSaleDiscount').value);

 if(!Number.isFinite(rawDiscount)||rawDiscount<0){
  alert('Desconto inválido.');
  return;
 }

 const discountCents=Math.round(rawDiscount*100);

 if(discountCents>subtotalCents){
  alert('O desconto não pode ser maior que o subtotal.');
  return;
 }

 const payment=$('editSalePayment').value;

 const installments=payment==='Crédito parcelado'
  ?Number($('editSaleInstallments').value)
  :1;

 const oldQty={},newQty={};

 (sale.items||[]).forEach(i=>{
  if(i.id)oldQty[i.id]=(oldQty[i.id]||0)+Number(i.qty||0);
 });

 newItems.forEach(i=>{
  newQty[i.id]=(newQty[i.id]||0)+i.qty;
 });

 const allIds=[...new Set([
  ...Object.keys(oldQty),
  ...Object.keys(newQty)
 ])];

 busy=true;
 $('saveSaleEdit').disabled=true;
 $('editSaleMessage').textContent='Salvando e ajustando o estoque...';

 try{
  await runTransaction(db,async tx=>{
   const saleRef=doc(db,'sales',editingSaleId);
   const saleSnap=await tx.get(saleRef);

   if(!saleSnap.exists())
    throw Error('A venda não foi encontrada.');

   if(saleSnap.data().cancelled)
    throw Error('Esta venda já foi cancelada.');

   const refs=allIds.map(id=>doc(db,'products',id));
   const snaps=[];

   for(const refDoc of refs)
    snaps.push(await tx.get(refDoc));

   const updated=[];

   for(let i=0;i<refs.length;i++){
    const id=allIds[i];
    const snap=snaps[i];

    if(!snap.exists())
     throw Error('O produto associado à venda não existe mais. Recrie o produto antes de editar.');

    const data=snap.data();
    const stock=Number(data.stock)||0;
    const nextStock=stock+(oldQty[id]||0)-(newQty[id]||0);

    if(nextStock<0){
     throw Error(
      `Estoque insuficiente para ${data.name||id}. Disponível: ${stock}, necessário a mais: ${(newQty[id]||0)-(oldQty[id]||0)}.`
     );
    }

    updated.push({
     ref:refs[i],
     stock:nextStock
    });
   }

   updated.forEach(x=>tx.update(x.ref,{stock:x.stock}));

   tx.update(saleRef,{
    items:newItems,
    subtotalCents,
    discountCents,
    totalCents:subtotalCents-discountCents,
    payment,
    installments,
    editedAt:serverTimestamp(),
    editedBy:auth.currentUser?.uid||null
   });
  });

  closeSaleEditor();
  renderHistory();
  renderReport();

  alert('Venda atualizada e estoque ajustado com sucesso.');

 }catch(err){
  $('editSaleMessage').textContent='Não foi possível salvar: '+err.message;

 }finally{
  busy=false;

  if($('saveSaleEdit'))
   $('saveSaleEdit').disabled=false;
 }
}

async function cancelSale(id){
 const sale=sales.find(s=>s.id===id);
 if(!sale||sale.cancelled)return;

 if(!confirm(
  `Cancelar a venda de ${money((sale.totalCents||0)/100)}? Os produtos serão devolvidos ao estoque e essa venda não entrará no fechamento.`
 ))return;

 if(busy)return;
 busy=true;

 try{
  await runTransaction(db,async tx=>{
   const saleRef=doc(db,'sales',id);
   const saleSnap=await tx.get(saleRef);

   if(!saleSnap.exists())
    throw Error('A venda não foi encontrada.');

   const currentSale=saleSnap.data();

   if(currentSale.cancelled)
    throw Error('Esta venda já foi cancelada.');

   const qty={};

   (currentSale.items||[]).forEach(i=>{
    if(i.id)
     qty[i.id]=(qty[i.id]||0)+Number(i.qty||0);
   });

   const ids=Object.keys(qty);
   const refs=ids.map(pid=>doc(db,'products',pid));
   const snaps=[];

   for(const refDoc of refs)
    snaps.push(await tx.get(refDoc));

   for(let i=0;i<refs.length;i++){
    if(!snaps[i].exists()){
     throw Error(
      'Não foi possível devolver o estoque porque um produto desta venda foi excluído. Recrie o produto e tente novamente.'
     );
    }
   }

   for(let i=0;i<refs.length;i++){
    tx.update(refs[i],{
     stock:(Number(snaps[i].data().stock)||0)+qty[ids[i]]
    });
   }

   tx.update(saleRef,{
    cancelled:true,
    cancelledAt:serverTimestamp(),
    cancelledBy:auth.currentUser?.uid||null
   });
  });

  alert('Venda cancelada. O estoque foi devolvido e o fechamento foi atualizado.');

 }catch(err){
  alert('Não foi possível cancelar a venda: '+err.message);

 }finally{
  busy=false;
 }
}

$('history').addEventListener('click',e=>{
 const edit=e.target.closest('[data-sale-edit]');
 const cancel=e.target.closest('[data-sale-cancel]');

 if(edit)
  openSaleEditor(edit.dataset.saleEdit);

 if(cancel)
  cancelSale(cancel.dataset.saleCancel);
});
