/* Testes locais de interface V2, sem navegador, rede ou banco.
   Executar: node tests/v2-recibos-interface.test.cjs
*/
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,'..','v2-documento-misto-previa.js'),'utf8');
const elements=new Map();
class Element {
 constructor(id=''){this.id=id;this.children=[];this.listeners={};this.hidden=false;this.disabled=false;this.checked=false;this.value='';this.textContent='';this.markup='';this.attributes={};}
 set innerHTML(v){this.markup=v;for(const match of v.matchAll(/\bid="([^"]+)"/g))if(!elements.has(match[1]))elements.set(match[1],new Element(match[1]));}
 get innerHTML(){return this.markup;}
 appendChild(child){this.children.push(child);if(child.id)elements.set(child.id,child);return child;}
 addEventListener(event,fn){this.listeners[event]=fn;}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k]??null;}
 focus(){this.focused=true;}
 insertAdjacentHTML(place,value){this.markup=place==='afterbegin'?value+this.markup:this.markup+value;}
}
let n=0;function pass(name,fn){fn();n++;console.log('PASS',name)}
const place=new Element('place'),month=new Element('fmonth');month.value='2026-10';elements.set('fmonth',month);
const document={
 readyState:'complete',
 querySelector:s=>s==='.vp-receipts-search'?place:null,
 querySelectorAll:s=>{
  if(s!=='#vpMixedReceiptItems input[data-vp-mixed-key]')return [];
  const html=elements.get('vpMixedReceiptItems')?.innerHTML||'';
  return Array.from(html.matchAll(/data-vp-mixed-key="([^"]+)"/g),m=>{
    const item=new Element();item.checked=true;
    item.getAttribute=k=>k==='data-vp-mixed-key'?m[1]:null;
    return item;
  });
 },
 getElementById:id=>elements.get(id)||null,
 createElement:()=>new Element(),
 body:new Element('body'),
 addEventListener(){}
};
const id='client-a';
const currentFinanceMonthReport={
 keys:{month:'2026-10'},
 maps:{
  cm:new Map([[id,{name:'Cliente teste'}]]),
  vm:new Map([['v1',{brand:'BMW',model:'X5'}],['v2',{brand:'Audi',model:'Q5'}],['v3',{brand:'VW',model:'T-Cross'}]]),
  sm:new Map([['plan-a',{name:'Premium'}],['plan-b',{name:'Essencial'}],['service-a',{name:'Higienização'}]])
 },
 packageMonthRows:[
  {id:'charge-a',client_id:id,vehicle_id:'v1',service_id:'plan-a',status:'paid',amount:250},
  {id:'charge-b',client_id:id,vehicle_id:'v2',service_id:'plan-b',status:'paid',amount:300}
 ],
 serviceApps:[{id:'service-a',client_id:id,vehicle_id:'v3',service_id:'service-a',final_value:150}],
 monthApps:[],payMap:new Map(),subscriptionPlanById:new Map()
};
const window={setTimeout:fn=>fn(),innerWidth:360};
const ctx={document,window,currentFinanceMonthReport,financeAllowed:()=>true,navigator:{},show:()=>{},console};
vm.runInNewContext(js,ctx,{timeout:3000});
const lookup=id=>elements.get(id);
pass('módulo instalado',()=>assert(lookup('vpMixedReceiptOpen')&&lookup('vpMixedReceiptSheet')));
window.vpV2OpenConsolidatedPreview();
pass('janela abre',()=>assert.equal(lookup('vpMixedReceiptSheet').hidden,false));
pass('único cliente selecionado automaticamente',()=>assert.equal(lookup('vpMixedReceiptClient').value,id));
const list=lookup('vpMixedReceiptItems').innerHTML,preview=lookup('vpMixedReceiptPreview').innerHTML;
pass('três grupos por veículo',()=>assert.equal((list.match(/vp-mixed-vehicle-group/g)||[]).length,3));
pass('serviços corretos por carro',()=>assert(list.includes('Premium')&&list.includes('Essencial')&&list.includes('Higienização')));
pass('lançamentos R$ 700',()=>assert(preview.includes('700,00')));
pass('recebido R$ 550',()=>assert(preview.includes('550,00')));
pass('pendente R$ 150',()=>assert(preview.includes('150,00')));
const click=lookup('vpMixedReceiptItems').listeners.click;
click({target:{closest:()=>({getAttribute:()=> 'none'})}});
pass('limpar bloqueia exportar',()=>assert(lookup('vpMixedShare').disabled&&lookup('vpMixedPrint').disabled));
click({target:{closest:()=>({getAttribute:()=> 'all'})}});
pass('selecionar todos permite exportar',()=>assert(!lookup('vpMixedShare').disabled&&!lookup('vpMixedPrint').disabled));
lookup('vpMixedClose').listeners.click();
pass('fecha janela',()=>assert.equal(lookup('vpMixedReceiptSheet').hidden,true));
ctx.financeAllowed=()=>false;
window.vpV2OpenConsolidatedPreview();
pass('colaborador não abre prévia',()=>assert.equal(lookup('vpMixedReceiptSheet').hidden,true));
ctx.financeAllowed=()=>true;
window.vpV2OpenConsolidatedPreview();
lookup('vpMixedReceiptItems').listeners.change({target:{checked:false,getAttribute:k=>k==='data-vp-vehicle'?'v1':null}});
pass('desmarcar carro retira pacote inteiro',()=>assert(lookup('vpMixedReceiptSummary').textContent.includes('450,00')));
ctx.financeAllowed=()=>false;
lookup('vpMixedPrint').listeners.click();
pass('perda de permissão bloqueia exportação e fecha painel',()=>assert.equal(lookup('vpMixedReceiptSheet').hidden,true));
ctx.financeAllowed=()=>true;
window.vpV2OpenConsolidatedPreview();
month.value='2026-11';
lookup('vpMixedPrint').listeners.click();
pass('competência alterada bloqueia exportação',()=>assert.equal(lookup('vpMixedReceiptSheet').hidden,true));
console.log('TOTAL',n,'testes de interface aprovados.');
