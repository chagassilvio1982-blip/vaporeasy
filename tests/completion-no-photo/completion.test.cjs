'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261017140000_operator_complete_without_photo.sql'),'utf8');
const match=html.match(/\/\/ Conclusão direta:[\s\S]*?(?=async function loadRemoteImage\(url\)\{)/);
assert.ok(match,'Bloco de conclusão direta não encontrado');

function setup(role='owner',status='in_progress'){
  const calls=[],msgs=[];
  const rows=[{id:'appointment-1',status}];
  const updateChain={
    eq(col,value){calls.push(['eq',col,value]);return this},
    is(col,value){calls.push(['is',col,value]);return this},
    async select(col){calls.push(['select',col]);return {data:[{id:'appointment-1'}],error:null}}
  };
  const ctx={
    currentApps:rows,currentRole:role,
    sb:{
      rpc:async(fn,args)=>{calls.push(['rpc',fn,args]);return {data:true,error:null}},
      from:table=>({update:row=>{calls.push(['update',table,row]);return updateChain}})
    },
    agendaMonthCache:{clear:()=>calls.push(['clear','agenda'])},
    operatorMonthCache:{clear:()=>calls.push(['clear','operator'])},
    show:(id,message,type)=>msgs.push({id,message,type}),
    loadApps:async()=>calls.push(['loadApps']),
    loadOperatorJobs:async()=>calls.push(['loadOperatorJobs']),
    loadOperatorMonth:async()=>calls.push(['loadOperatorMonth']),
    operatorSelectedDate:'2026-10-17',
    fail:e=>e.message||String(e)
  };
  vm.createContext(ctx);
  vm.runInContext(match[0]+'; this.complete=openCompletion',ctx);
  return {complete:ctx.complete,calls,msgs};
}

test('interface não oferece foto nem justificativa na conclusão',()=>{
  assert.doesNotMatch(html,/id="finishphoto"/);
  assert.doesNotMatch(html,/id="finishexception"/);
  assert.doesNotMatch(html,/data-legacy-photo/);
  assert.doesNotMatch(html,/Tire a foto final ou marque a exceção/);
});

test('proprietário conclui sem foto e somente em execução',async()=>{
  const v=setup('owner');
  await v.complete('appointment-1');
  assert.ok(v.calls.some(x=>x[0]==='update'&&x[1]==='appointments'&&x[2].status==='completed'));
  assert.ok(v.calls.some(x=>x[0]==='eq'&&x[1]==='status'&&x[2]==='in_progress'));
  assert.ok(v.calls.some(x=>x[0]==='loadApps'));
  assert.equal(v.msgs.at(-1).type,'ok');
});

test('colaborador conclui via RPC com validação de permissões',async()=>{
  const v=setup('operator');
  await v.complete('appointment-1');
  assert.ok(v.calls.some(x=>x[0]==='rpc'&&x[1]==='operator_complete_job'&&x[2].p_appointment_id==='appointment-1'));
  assert.ok(v.calls.some(x=>x[0]==='loadOperatorJobs'));
});

test('não tenta concluir atendimento fora de execução',async()=>{
  const v=setup('owner','scheduled');
  await v.complete('appointment-1');
  assert.equal(v.calls.filter(x=>x[0]==='update'||x[0]==='rpc').length,0);
  assert.equal(v.msgs.at(-1).type,'error');
});

test('migração mantém proteção por papel e vínculo sem foto obrigatória',()=>{
  assert.match(sql,/private.current_app_role\(\)/);
  assert.match(sql,/private.operator_is_assigned_today\(p_appointment_id\)/);
  assert.match(sql,/status = 'in_progress'/);
  assert.doesNotMatch(sql,/appointment_completion_photos|completion_exceptions/);
});
