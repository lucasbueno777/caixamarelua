import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,runTransaction,serverTimestamp,deleteDoc,setDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {getStorage,ref,uploadBytes,getDownloadURL} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import {firebaseConfig} from './firebase-config.js';

const $=id=>document.getElementById(id);

const money=n=>(Number(n)||0).toLocaleString('pt-BR',{
  style:'currency',
  currency:'BRL'
});

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
}[c]));

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const storage=getStorage(app);

let products=[];
let sales=[];
let cart={};
let confirmed=false;
let busy=false;
let unsubs=[];
let connected={products:false,sales:false};

const dateKey=(d=new Date())=>{
  const parts=Object.fromEntries(
    new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Sao_Paulo',
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).formatToParts(d).map(x=>[x.type,x.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
};

const nowBR=()=>new Date().toLocaleString('pt-BR',{
  timeZone:'America/Sao_Paulo'
});

$('saleDate').textContent=nowBR();
$('reportDate').value=dateKey();

function status(){
  $('connection').textContent=
    connected.products&&connected.sales
      ?'● Sincronizado'
      :'● Verificando conexão';
}

function showPage(page){
  document.querySelectorAll('.page').forEach(el=>{
    el.hidden=el.id!==`page-${page}`;
  });

  document.querySelectorAll('#nav button').forEach(b=>{
    b.classList.toggle('active',b.dataset.page===page);
  });

  if(page==='fechamento')renderReport();
}

document.querySelectorAll('#nav button').forEach(b=>{
  b.onclick=()=>showPage(b.dataset.page);
});

$('loginForm').onsubmit=async e=>{
  e.preventDefault();
  $('loginError').textContent='';

  try{
    await signInWithEmailAndPassword(
      auth,
      $('email').value.trim(),
      $('password').value
    );
  }catch(err){
    $('loginError').textContent=
      'Não foi possível entrar. Confira o e-mail, a senha e a configuração do Firebase.';
  }
};

$('logout').onclick=()=>signOut(auth);

onAuthStateChanged(auth,user=>{
  unsubs.forEach(fn=>fn());
  unsubs=[];

  connected={products:false,sales:false};
  status();

  if(!user){
    $('loginView').hidden=false;
    $('app').hidden=true;
    products=[];
    sales=[];
    cart={};
    return;
  }

  $('loginView').hidden=true;
  $('app').hidden=false;

  unsubs.push(
    onSnapshot(collection(db,'products'),snapshot=>{
      products=snapshot.docs
        .map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));

      connected.products=true;
      status();
      renderProducts();
      renderCart();
    },err=>{
      $('connection').textContent=
        'Erro ao carregar produtos: '+err.code;
    })
  );

  unsubs.push(
    onSnapshot(collection(db,'sales'),snapshot=>{
      sales=snapshot.docs
        .map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>
          (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)
        );

      connected.sales=true;
      status();
      renderHistory();
      renderReport();
    },err=>{
      $('connection').textContent=
        'Erro ao carregar vendas: '+err.code;
    })
  );
});

function imageTag(p){
  return p.photoUrl
    ?`<img src="${escapeHtml(p.photoUrl)}" alt="${escapeHtml(p.name)}" loading="lazy">`
    :'<div class="thumb" style="display:grid;place-items:center;font-size:32px;color:#bb985e">☾</div>';
}

function renderProducts(){
  let q=$('search').value.toLowerCase().trim();

  $('catalog').innerHTML=products
    .filter(p=>p.name.toLowerCase().includes(q))
    .map(p=>`
      <article class="product-card">
        ${imageTag(p)}
        <b>${escapeHtml(p.name)}</b>
        <strong>${money(p.price)}</strong>
        <small>${p.stock} em estoque</small>
        <button class="primary" data-add="${p.id}"
          ${p.stock<1||confirmed?'disabled':''}>
          Adicionar +
        </button>
      </article>
    `).join('')||'<p>Nenhum produto encontrado.</p>';

  $('productList').innerHTML=products
    .map(p=>`
      <div class="list-line">
        ${p.photoUrl?`<img src="${escapeHtml(p.photoUrl)}" alt="">`:''}
        <div class="details">
          <b>${escapeHtml(p.name)}</b><br>
          <small>${money(p.price)} • Estoque: ${p.stock}</small>
        </div>
        <div class="buttons">
          <button class="smallbtn" data-edit="${p.id}">Editar</button>
          <button class="smallbtn" data-delete="${p.id}">Excluir</button>
        </div>
      </div>
    `).join('')||'<p>Cadastre seu primeiro produto.</p>';
}
$('search').oninput=renderProducts;

$('catalog').onclick=e=>{
  const b=e.target.closest('[data-add]');
  if(!b||confirmed)return;

  const p=products.find(p=>p.id===b.dataset.add);
  if(!p)return;

  if((cart[p.id]||0)>=p.stock)
    return alert('Estoque insuficiente.');

  cart[p.id]=(cart[p.id]||0)+1;
  renderCart();
};

$('cart').onclick=e=>{
  let b=e.target.closest('[data-qty]');
  if(!b||confirmed)return;

  let id=b.dataset.id;
  let p=products.find(p=>p.id===id);
  if(!p)return;

  cart[id]=Math.max(
    0,
    Math.min(p.stock,(cart[id]||0)+Number(b.dataset.qty))
  );

  if(!cart[id])delete cart[id];

  renderCart();
};

function getTotals(){
  const items=Object.entries(cart)
    .map(([id,qty])=>({p:products.find(p=>p.id===id),qty}))
    .filter(x=>x.p&&x.qty>0);

  const subtotal=items.reduce(
    (s,{p,qty})=>s+Math.round(Number(p.price)*100)*qty,
    0
  );

  const raw=Math.round((Number($('discount').value)||0)*100);
  const discount=Math.max(0,Math.min(subtotal,raw));

  return {
    items,
    subtotal,
    discount,
    total:subtotal-discount
  };
}

function renderCart(){
  let t=getTotals();

  $('cart').innerHTML=t.items.map(({p,qty})=>`
    <div class="cart-line">
      <div>
        <b>${escapeHtml(p.name)}</b><br>
        <small>${money(p.price)} × ${qty}</small>
      </div>
      <div class="qty">
        <button data-qty="-1" data-id="${p.id}" ${confirmed?'disabled':''}>−</button>
        ${qty}
        <button data-qty="1" data-id="${p.id}" ${confirmed?'disabled':''}>+</button>
      </div>
    </div>
  `).join('')||'<p>Seu carrinho está vazio.</p>';

  $('subtotal').textContent=money(t.subtotal/100);
  $('discountDisplay').textContent=money(t.discount/100);
  $('total').textContent=money(t.total/100);

  $('confirmSale').hidden=confirmed;
  $('paymentBox').hidden=!confirmed;
  $('discount').disabled=confirmed;

  renderProducts();
}

$('discount').oninput=()=>{
  confirmed=false;
  renderCart();
};

$('confirmSale').onclick=()=>{
  const t=getTotals();

  if(!t.items.length)
    return alert('Adicione um produto.');

  if(t.items.some(({p,qty})=>qty>p.stock))
    return alert('O estoque mudou. Revise o carrinho.');

  if(Number($('discount').value)<0||
     !Number.isFinite(Number($('discount').value)))
    return alert('Desconto inválido.');

  confirmed=true;
  $('saleMessage').textContent=
    'Carrinho confirmado. Escolha a forma de pagamento.';

  renderCart();
};

$('cancelConfirm').onclick=()=>{
  confirmed=false;
  renderCart();
};

document.querySelectorAll('input[name="payment"]').forEach(input=>{
  input.addEventListener('change',()=>{
    $('installmentsBox').hidden=
      document.querySelector('input[name="payment"]:checked').value
      !=='Crédito parcelado';
  });
});

$('finishSale').onclick=async()=>{
  if(busy||!confirmed)return;

  let t=getTotals();
  if(!t.items.length)return;

  busy=true;
  $('finishSale').disabled=true;
  $('saleMessage').textContent='Registrando venda...';

  const payment=
    document.querySelector('input[name="payment"]:checked').value;

  const installments=
    payment==='Crédito parcelado'
      ?Number($('installments').value)
      :1;

  try{
    const saleRef=doc(collection(db,'sales'));

    await runTransaction(db,async tx=>{
      const refs=t.items.map(({p})=>doc(db,'products',p.id));
      const snapshots=[];

      for(const r of refs){
        snapshots.push(await tx.get(r));
      }

      for(let i=0;i<snapshots.length;i++){
        const snap=snapshots[i];
        const item=t.items[i];

        if(!snap.exists())
          throw Error('Produto excluído: '+item.p.name);

        const current=snap.data();

        if(current.stock<item.qty)
          throw Error('Estoque insuficiente: '+item.p.name);
      }

      for(let i=0;i<refs.length;i++){
        tx.update(refs[i],{
          stock:snapshots[i].data().stock-t.items[i].qty
        });
      }

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
     !Number.isSafeInteger(stock)||stock<0){
    return alert('Confira nome, preço e estoque.');
  }

  const btn=$('productForm').querySelector('button[type=submit]');
  btn.disabled=true;
  $('productMessage').textContent='Salvando...';

  try{
    const existing=products.find(p=>p.id===id);
    let photoUrl=
      $('productPhotoUrl').value.trim()||existing?.photoUrl||'';

    const file=$('productPhoto').files[0];

    if(file){
      if(!file.type.startsWith('image/'))
        throw Error('Escolha uma imagem.');

      if(file.size>5*1024*1024)
        throw Error('A foto deve ter até 5 MB.');

      const path=
        `products/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;

      const uploaded=await uploadBytes(
        ref(storage,path),
        file,
        {contentType:file.type}
      );

      photoUrl=await getDownloadURL(uploaded.ref);
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
  const vendasVisiveis=sales.filter(s=>
    s.cancelled!==true &&
    s.cancelado!==true &&
    s.status!=='cancelada' &&
    s.status!=='cancelado' &&
    !s.cancelledAt
  );

  $('history').innerHTML=vendasVisiveis.map(s=>`
    <details class="sale-record">
      <summary>
        ${saleTime(s)} •
        ${money((s.totalCents||0)/100)} •
        ${escapeHtml(paymentLabel(s))}
      </summary>

      <p>
        ${(s.items||[]).map(i=>
          `${escapeHtml(i.name)} (${i.qty} × ${money((i.priceCents||0)/100)})`
        ).join('<br>')}
      </p>

      <p>
        Subtotal: ${money((s.subtotalCents||0)/100)}
        | Desconto: ${money((s.discountCents||0)/100)}
      </p>

      <p>ID: ${escapeHtml(s.id)}</p>

      <div class="buttons"
        style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">

        <button class="smallbtn" type="button"
          data-sale-edit="${escapeHtml(s.id)}">
          Editar venda
        </button>

        <button class="smallbtn" type="button"
          data-sale-cancel="${escapeHtml(s.id)}">
          Cancelar venda
        </button>
      </div>
    </details>
  `).join('')||'<p>Nenhuma venda registrada.</p>';
}

function reportData(){
  const day=$('reportDate').value;

  const rows=sales.filter(s=>
    s.date===day &&
    s.cancelled!==true &&
    s.cancelado!==true &&
    s.status!=='cancelada' &&
    s.status!=='cancelado' &&
    !s.cancelledAt
  );

  const sum=k=>rows.reduce((v,s)=>v+(s[k]||0),0);

  const by=method=>rows
    .filter(s=>s.payment===method)
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
${(s.items||[]).map(x=>`  ${x.qty}x ${x.name} - ${money(x.priceCents*x.qty/100)}`).join('\n')}
  Desconto: ${money(s.discountCents/100)}`).join('\n'):'Nenhuma venda nesta data.'}`;
}

function renderReport(){
  let r=reportData();

  $('report').innerHTML=`
    <div class="stats">
      <div class="stat">
        <small>Vendas</small>
        <strong>${r.count}</strong>
      </div>

      <div class="stat">
        <small>Faturamento</small>
        <strong>${money(r.total/100)}</strong>
      </div>

      <div class="stat">
        <small>Descontos</small>
        <strong>${money(r.discount/100)}</strong>
      </div>

      <div class="stat">
        <small>Pix</small>
        <strong>${money(r.pix/100)}</strong>
      </div>

      <div class="stat">
        <small>Dinheiro</small>
        <strong>${money(r.cash/100)}</strong>
      </div>

      <div class="stat">
        <small>Débito</small>
        <strong>${money(r.debit/100)}</strong>
      </div>

      <div class="stat">
        <small>Crédito à vista</small>
        <strong>${money(r.credit/100)}</strong>
      </div>

      <div class="stat">
        <small>Crédito parcelado</small>
        <strong>${money(r.creditInstallments/100)}</strong>
      </div>
    </div>

    <h2 style="margin-top:22px">Detalhamento</h2>

    ${r.rows.map(s=>`
      <div class="sale-record">
        <b>
          ${saleTime(s)} —
          ${escapeHtml(paymentLabel(s))} —
          ${money(s.totalCents/100)}
        </b>

        <p>
          ${(s.items||[]).map(i=>
            `${i.qty}× ${escapeHtml(i.name)} (${money(i.priceCents*i.qty/100)})`
          ).join('<br>')}
        </p>

        <small>Desconto: ${money(s.discountCents/100)}</small>
      </div>
    `).join('')||'<p>Nenhuma venda nesta data.</p>'}`;
}

$('reportDate').onchange=renderReport;

$('shareReport').onclick=()=>{
  const url='https://wa.me/?text='+encodeURIComponent(reportText());
  window.open(url,'_blank','noopener,noreferrer');
};

$('printReport').onclick=()=>window.print();

// Edição e cancelamento seguro de vendas:
// o estoque é ajustado na mesma transação.

let editingSaleId=null;

function ensureSaleEditor(){
  if($('saleEditor'))return;

  const modal=document.createElement('div');
  modal.id='saleEditor';
  modal.className='modal';
  modal.style.cssText=
    'display:none;position:fixed;inset:0;background:#0008;z-index:9999;overflow:auto;padding:20px';

  modal.innerHTML=`
    <div style="background:white;color:#111;max-width:720px;margin:20px auto;padding:20px;border-radius:12px">
      <h2>Editar venda</h2>

      <div id="editSaleItems"></div>

      <button type="button" class="smallbtn" id="editAddItem">
        Adicionar produto
      </button>

      <div style="margin-top:16px">
        <label for="editDiscount">Desconto em reais</label>
        <input id="editDiscount" type="number" min="0" step="0.01" value="0">
      </div>

      <div style="margin-top:16px">
        <label for="editPayment">Forma de pagamento</label>
        <select id="editPayment">
          <option>Pix</option>
          <option>Dinheiro</option>
          <option>Débito</option>
          <option>Crédito</option>
          <option>Crédito parcelado</option>
        </select>
      </div>

      <div id="editInstallmentsBox" style="display:none;margin-top:12px">
        <label for="editInstallments">Número de parcelas</label>
        <select id="editInstallments">
          <option value="2">2x</option>
          <option value="3">3x</option>
          <option value="4">4x</option>
          <option value="5">5x</option>
          <option value="6">6x</option>
          <option value="7">7x</option>
          <option value="8">8x</option>
          <option value="9">9x</option>
          <option value="10">10x</option>
          <option value="11">11x</option>
          <option value="12">12x</option>
        </select>
      </div>

      <div id="editSaleTotals" style="margin-top:16px"></div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px">
        <button type="button" class="primary" id="editSaveSale">
          Salvar alterações
        </button>

        <button type="button" class="smallbtn" id="editDiscardSale">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  $('editDiscardSale').onclick=closeSaleEditor;

  $('editAddItem').onclick=addEditSaleRow;

  $('editDiscount').oninput=updateEditSaleTotals;

  $('editPayment').onchange=()=>{
    $('editInstallmentsBox').style.display=
      $('editPayment').value==='Crédito parcelado'?'block':'none';

    updateEditSaleTotals();
  };

  $('editInstallments').onchange=updateEditSaleTotals;

  $('editSaveSale').onclick=saveSaleEdit;
}

function closeSaleEditor(){
  const modal=$('saleEditor');

  if(modal)modal.style.display='none';

  editingSaleId=null;
}

function addEditSaleRow(item=null){
  const container=$('editSaleItems');

  const row=document.createElement('div');
  row.className='edit-sale-row';
  row.style.cssText=
    'display:grid;grid-template-columns:minmax(0,1fr) 80px 42px;gap:8px;margin:10px 0;align-items:center';

  const options=products.map(p=>`
    <option value="${p.id}" ${item?.productId===p.id?'selected':''}>
      ${escapeHtml(p.name)} — ${money(p.price)}
    </option>
  `).join('');

  row.innerHTML=`
    <select class="edit-product">
      <option value="">Selecione um produto</option>
      ${options}
    </select>

    <input class="edit-qty" type="number" min="1"
      step="1" value="${item?.qty||1}">

    <button type="button" class="smallbtn edit-remove">X</button>
  `;

  container.appendChild(row);

  row.querySelector('.edit-product').onchange=updateEditSaleTotals;
  row.querySelector('.edit-qty').oninput=updateEditSaleTotals;

  row.querySelector('.edit-remove').onclick=()=>{
    row.remove();
    updateEditSaleTotals();
  };

  updateEditSaleTotals();
}

function updateEditSaleTotals(){
  if(!$('editSaleTotals'))return;

  let subtotal=0;

  document.querySelectorAll('.edit-sale-row').forEach(row=>{
    const id=row.querySelector('.edit-product').value;
    const qty=Math.max(0,parseInt(row.querySelector('.edit-qty').value)||0);
    const product=products.find(p=>p.id===id);

    if(product)subtotal+=Math.round(product.price*100)*qty;
  });

  const discount=Math.max(
    0,
    Math.round((Number($('editDiscount').value)||0)*100)
  );

  const total=Math.max(0,subtotal-discount);

  $('editSaleTotals').innerHTML=`
    <p>Subtotal: <b>${money(subtotal/100)}</b></p>
    <p>Desconto: <b>${money(discount/100)}</b></p>
    <p>Total: <b>${money(total/100)}</b></p>
  `;
}

function openSaleEditor(id){
  const sale=sales.find(s=>s.id===id);

  if(!sale){
    alert('Venda não encontrada.');
    return;
  }

  if(sale.cancelled===true||sale.cancelado===true||sale.cancelledAt){
    alert('Não é possível editar uma venda cancelada.');
    return;
  }

  ensureSaleEditor();

  editingSaleId=id;

  $('editSaleItems').innerHTML='';

  (sale.items||[]).forEach(item=>{
    addEditSaleRow({
      productId:item.productId,
      qty:item.qty
    });
  });

  $('editDiscount').value=((sale.discountCents||0)/100).toFixed(2);

  $('editPayment').value=sale.payment||'Pix';

  $('editInstallments').value=String(sale.installments||2);

  $('editInstallmentsBox').style.display=
    $('editPayment').value==='Crédito parcelado'?'block':'none';

  $('saleEditor').style.display='block';

  updateEditSaleTotals();
}

async function saveSaleEdit(){
  if(busy||!editingSaleId)return;

  const sale=sales.find(s=>s.id===editingSaleId);

  if(!sale||sale.cancelled===true||sale.cancelado===true){
    closeSaleEditor();
    return;
  }

  const rows=[...document.querySelectorAll('.edit-sale-row')];

  if(!rows.length){
    alert('A venda precisa ter pelo menos um produto.');
    return;
  }

  const newItems=[];

  for(const row of rows){
    const id=row.querySelector('.edit-product').value;
    const qty=Number(row.querySelector('.edit-qty').value);
    const product=products.find(p=>p.id===id);

    if(!product||!Number.isSafeInteger(qty)||qty<1){
      alert('Confira os produtos e as quantidades.');
      return;
    }

    const priceCents=Math.round(Number(product.price)*100);

    if(!Number.isSafeInteger(priceCents)||priceCents<0){
      alert('Preço inválido em um dos produtos.');
      return;
    }

    newItems.push({
      id:product.id,
      name:product.name,
      qty,
      priceCents
    });
  }

  if(new Set(newItems.map(i=>i.id)).size!==newItems.length){
    alert('O mesmo produto aparece mais de uma vez. Remova a linha repetida e ajuste a quantidade.');
    return;
  }

  const subtotalCents=newItems.reduce(
    (sum,item)=>sum+item.qty*item.priceCents,
    0
  );

  const rawDiscount=Number($('editDiscount').value);

  if(!Number.isFinite(rawDiscount)||rawDiscount<0){
    alert('Desconto inválido.');
    return;
  }

  const discountCents=Math.round(rawDiscount*100);

  if(discountCents>subtotalCents){
    alert('O desconto não pode ser maior que o subtotal.');
    return;
  }

  const payment=$('editPayment').value;

  const installments=payment==='Crédito parcelado'
    ?Number($('editInstallments').value)
    :1;

  const oldQty={};
  const newQty={};

  (sale.items||[]).forEach(item=>{
    if(item.id){
      oldQty[item.id]=(oldQty[item.id]||0)+Number(item.qty||0);
    }
  });

  newItems.forEach(item=>{
    newQty[item.id]=(newQty[item.id]||0)+item.qty;
  });

  const allIds=[...new Set([
    ...Object.keys(oldQty),
    ...Object.keys(newQty)
  ])];

  busy=true;

  const saveButton=$('editSaveSale');
  if(saveButton)saveButton.disabled=true;

  try{
    await runTransaction(db,async tx=>{
      const saleRef=doc(db,'sales',editingSaleId);
      const saleSnap=await tx.get(saleRef);

      if(!saleSnap.exists()){
        throw Error('A venda não foi encontrada.');
      }

      const currentSale=saleSnap.data();

      if(
        currentSale.cancelled===true||
        currentSale.cancelado===true||
        currentSale.cancelledAt
      ){
        throw Error('Esta venda já foi cancelada.');
      }

      const refs=allIds.map(id=>doc(db,'products',id));
      const snaps=[];

      for(const refDoc of refs){
        snaps.push(await tx.get(refDoc));
      }

      const updates=[];

      for(let i=0;i<refs.length;i++){
        const id=allIds[i];
        const snap=snaps[i];

        if(!snap.exists()){
          throw Error(
            'Um produto desta venda não existe mais. Recrie o produto antes de editar.'
          );
        }

        const data=snap.data();
        const stock=Number(data.stock)||0;

        const nextStock=
          stock+
          (oldQty[id]||0)-
          (newQty[id]||0);

        if(nextStock<0){
          throw Error(
            `Estoque insuficiente para ${data.name||id}.`
          );
        }

        updates.push({
          ref:refs[i],
          stock:nextStock
        });
      }

      updates.forEach(item=>{
        tx.update(item.ref,{stock:item.stock});
      });

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
    alert('Não foi possível salvar a alteração: '+err.message);

  }finally{
    busy=false;

    if(saveButton)saveButton.disabled=false;
  }
}

async function cancelSale(id){
  const sale=sales.find(s=>s.id===id);

  if(
    !sale||
    sale.cancelled===true||
    sale.cancelado===true||
    sale.cancelledAt
  ){
    return;
  }

  const confirmedCancel=confirm(
    `Cancelar a venda de ${money((sale.totalCents||0)/100)}? `+
    'Os produtos serão devolvidos ao estoque e essa venda não entrará no fechamento.'
  );

  if(!confirmedCancel)return;
  if(busy)return;

  busy=true;

  try{
    await runTransaction(db,async tx=>{
      const saleRef=doc(db,'sales',id);
      const saleSnap=await tx.get(saleRef);

      if(!saleSnap.exists()){
        throw Error('A venda não foi encontrada.');
      }

      const currentSale=saleSnap.data();

      if(
        currentSale.cancelled===true||
        currentSale.cancelado===true||
        currentSale.cancelledAt
      ){
        throw Error('Esta venda já foi cancelada.');
      }

      const qty={};

      (currentSale.items||[]).forEach(item=>{
        if(item.id){
          qty[item.id]=(qty[item.id]||0)+Number(item.qty||0);
        }
      });

      const ids=Object.keys(qty);
      const refs=ids.map(productId=>doc(db,'products',productId));
      const snaps=[];

      for(const refDoc of refs){
        snaps.push(await tx.get(refDoc));
      }

      for(let i=0;i<refs.length;i++){
        if(!snaps[i].exists()){
          throw Error(
            'Não foi possível devolver o estoque porque um produto desta venda foi excluído. Recrie o produto e tente novamente.'
          );
        }
      }

      for(let i=0;i<refs.length;i++){
        const currentStock=Number(snaps[i].data().stock)||0;

        tx.update(refs[i],{
          stock:currentStock+qty[ids[i]]
        });
      }

      tx.update(saleRef,{
        cancelled:true,
        cancelledAt:serverTimestamp(),
        cancelledBy:auth.currentUser?.uid||null
      });
    });

    closeSaleEditor();
    renderHistory();
    renderReport();
    renderProducts();

    alert(
      'Venda cancelada. O estoque foi devolvido e o fechamento foi atualizado.'
    );

  }catch(err){
    alert('Não foi possível cancelar a venda: '+err.message);

  }finally{
    busy=false;
  }
}

$('history').addEventListener('click',e=>{
  const edit=e.target.closest('[data-sale-edit]');
  const cancel=e.target.closest('[data-sale-cancel]');

  if(edit){
    openSaleEditor(edit.dataset.saleEdit);
  }

  if(cancel){
    cancelSale(cancel.dataset.saleCancel);
  }
});
