// Pure pricing calculation. Margin is a share of selling price, not markup.
function calculateCareDraft({base,hour,overhead,fees,margin,items}) {
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 if(![base,hour,overhead,fees,margin].every(valid)||fees+margin>=100)throw Error('Premissas inválidas.');
 let cost=base+overhead;
 for(const c of items){
  if(!valid(c.quantity)||!valid(c.period)||c.period<=0)throw Error('Periodicidade inválida.');
  if(c.quantity>0){if(!valid(c.material_cost)||!valid(c.minutes))throw Error('Custo ou tempo pendente.');cost+=c.quantity/c.period*(c.material_cost+c.minutes/60*hour);}
 }
 const price=Math.ceil(cost/(1-(fees+margin)/100)*100)/100;
 if(cost<=0||!Number.isFinite(price))throw Error('Informe um custo mensal maior que zero.');
 return {cost,price};
}
/* Internal pilot: draft records only. Backend authorization is enforced by RLS. */
(()=>{
 const allowed=()=>!publicToken && ['owner','admin'].includes(currentRole);
 const el=id=>document.getElementById(id);
 const button=document.createElement('button');button.id='care-menu';button.className='ghost hidden';button.textContent='Cuidados especiais · testes';
 el('out').before(button);
 const dialog=document.createElement('dialog');dialog.id='care-dialog';dialog.style.cssText='width:min(720px,95vw);max-height:90vh;overflow:auto';
 document.body.append(dialog);
 let catalog=[];
 function numberField(id,label,value='',max='') {return `<label>${label}<input id="${id}" type="number" min="0" ${max?`max="${max}"`:''} step="0.01" required value="${value}" inputmode="decimal"></label>`;}
 function sync(){button.classList.toggle('hidden',!allowed());if(!allowed()){dialog.close();dialog.replaceChildren();catalog=[];}}
 new MutationObserver(sync).observe(el('prole'),{childList:true,subtree:true});
 button.onclick=async()=>{if(!allowed())return;dialog.innerHTML='<p>Carregando cuidados…</p>';dialog.showModal();await render();};
 async function render(){
  if(!allowed())return sync();
  const r=await sb.from('internal_special_care').select('*').order('name');
  if(r.error){dialog.innerHTML='<p>Não foi possível carregar os cuidados internos.</p><button id="care-close">Fechar</button>';el('care-close').onclick=()=>dialog.close();return;}
  if(!allowed())return sync();catalog=r.data;
  dialog.innerHTML=`<div class="actions"><h2>Cuidados especiais</h2><button id="care-close" type="button" class="ghost">Fechar</button></div>
  <p class="notice">Uso interno · valores em rascunho. As simulações não alteram planos, cobranças ou recibos.</p>
  <div id="care-message" role="status"></div><h3>Cadastro de cuidados</h3><div id="care-list"></div>
  <details id="care-editor"><summary>Cadastrar ou editar cuidado</summary><form id="care-form" class="stack">
  <input id="care-id" type="hidden"><label>Nome<input id="care-name" required maxlength="120"></label>
  <label>Descrição<textarea id="care-description"></textarea></label><label>Produtos e consumo por execução<textarea id="care-materials"></textarea></label>
  ${numberField('care-cost','Custo de materiais por execução (R$)')}${numberField('care-minutes','Tempo adicional por execução (minutos)')}
  <label>Situação<select id="care-active"><option value="true">Ativo</option><option value="false">Arquivado</option></select></label>
  <button class="primary">Salvar cuidado interno</button></form></details>
  <h3>Simular plano mensal</h3><form id="care-simulation" class="stack"><label>Nome da simulação<input id="sim-name" required maxlength="120"></label>
  ${numberField('sim-base','Custo mensal das estéticas incluídas (R$)')}
  ${numberField('sim-hour','Custo da hora de trabalho (R$)')}
  ${numberField('sim-overhead','Deslocamento e despesas alocados ao plano/mês (R$)')}
  <p class="meta">Evite contar mão de obra ou despesas duas vezes. Informe abaixo quantas aplicações e a cada quantos meses. Exemplo: 1 aplicação a cada 3 meses.</p>
  <div id="sim-items"></div>
  ${numberField('sim-fees','Impostos e taxas sobre a venda (%)','','99.99')}
  ${numberField('sim-margin','Margem desejada sobre a venda (%)','','99.99')}
  <button class="primary">Calcular e salvar rascunho</button></form><div id="sim-result" role="status"></div><h3>Simulações salvas</h3><div id="sim-history"></div>`;
  el('care-close').onclick=()=>dialog.close();
  el('care-list').innerHTML=catalog.map(c=>`<p><button type="button" class="ghost" data-edit="${c.id}">${esc(c.name)}${c.active?'':' · arquivado'}</button> · ${c.material_cost===null||c.minutes===null?'Custos/tempo pendentes':money(c.material_cost)+' · '+c.minutes+' min'}</p>`).join('');
  dialog.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const c=catalog.find(c=>c.id===b.dataset.edit);for(const [id,key] of [['id','id'],['name','name'],['description','description'],['materials','materials'],['cost','material_cost'],['minutes','minutes'],['active','active']])el('care-'+id).value=c[key]??'';el('care-editor').open=true;});
  el('sim-items').innerHTML=catalog.filter(c=>c.active).map(c=>`<fieldset data-care="${c.id}"><legend>${esc(c.name)}</legend>${numberField('qty-'+c.id,'Quantidade de aplicações',0)}${numberField('period-'+c.id,'A cada quantos meses',1)}</fieldset>`).join('');
  el('care-form').onsubmit=async e=>{e.preventDefault();if(!allowed())return sync();const b=e.submitter;b.disabled=true;const row={name:el('care-name').value.trim(),description:el('care-description').value,materials:el('care-materials').value,material_cost:Number(el('care-cost').value),minutes:Number(el('care-minutes').value),active:el('care-active').value==='true',updated_at:new Date().toISOString()};
   const id=el('care-id').value;const result=id?await sb.from('internal_special_care').update(row).eq('id',id).select('id'):await sb.from('internal_special_care').insert(row).select('id');
   if(result.error||!result.data?.length){el('care-message').textContent='Não foi possível salvar. Confira seu acesso e os campos.';b.disabled=false;}else await render();};
  el('care-simulation').onsubmit=saveSimulation;
  const history=await sb.from('internal_care_simulations').select('*').order('created_at',{ascending:false}).limit(10);
  if(!allowed())return sync();
  el('sim-history').innerHTML=history.error?'Não foi possível carregar o histórico.':history.data.map(s=>`<details><summary>${esc(s.name)} · ${money(s.assumptions.price)} / mês</summary><p>Custo mensal: ${money(s.assumptions.cost)} · Margem pretendida: ${esc(s.assumptions.margin)}%</p><pre style="white-space:pre-wrap">${esc(JSON.stringify(s.assumptions,null,2))}</pre></details>`).join('')||'Nenhuma simulação salva.';
 }
 async function saveSimulation(e){
  e.preventDefault();if(!allowed())return sync();const output=el('sim-result');
  try{
   const read=id=>{const input=el(id);const n=Number(input.value);if(input.value===''||!Number.isFinite(n)||n<0)throw Error('Preencha todos os custos e percentuais com valores válidos.');return n;};
   const base=read('sim-base'),hour=read('sim-hour'),overhead=read('sim-overhead'),fees=read('sim-fees'),margin=read('sim-margin');
   if(fees+margin>=100)throw Error('A soma de impostos, taxas e margem deve ser menor que 100%.');
   const items=catalog.filter(c=>c.active).map(c=>{const quantity=read('qty-'+c.id),period=read('period-'+c.id);if(period<=0)throw Error('A periodicidade deve ser maior que zero.');if(quantity>0&&(c.material_cost===null||c.minutes===null))throw Error('Preencha custo e tempo de '+c.name+' antes de incluí-lo.');return {name:c.name,quantity,period,material_cost:c.material_cost,minutes:c.minutes,monthly_cost:quantity>0?quantity/period*(Number(c.material_cost)+Number(c.minutes)/60*hour):0};});
   const {cost,price}=calculateCareDraft({base,hour,overhead,fees,margin,items:items.map(i=>({...i,material_cost:i.material_cost===null?null:Number(i.material_cost),minutes:i.minutes===null?null:Number(i.minutes)}))});
   if(!Number.isFinite(price)||cost<=0)throw Error('Informe um custo mensal maior que zero.');
   const assumptions={base,hour,overhead,fees,margin,items,cost,price};e.submitter.disabled=true;
   const result=await sb.from('internal_care_simulations').insert({name:el('sim-name').value.trim(),assumptions}).select('id');
   if(result.error||!result.data?.length)throw Error('Não foi possível salvar a simulação.');
   output.textContent=`Rascunho salvo. Custo mensal: ${money(cost)}. Preço calculado: ${money(price)}/mês. Depende da qualidade dos custos informados e de validação comercial; não é preço publicado.`;
  }catch(error){output.textContent=error.message;}finally{e.submitter.disabled=false;}
 }
 sync();
})();
