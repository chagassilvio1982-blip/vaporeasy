'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../v3/scripts/bootstrap.js'),'utf8');
const token='header.'+Buffer.from(JSON.stringify({session_id:'recovery-session'})).toString('base64url')+'.signature';
function harness(url='https://preview.test/v3/',options={}){
  const calls=[],elements=new Map(),storage=new Map(Object.entries(options.storage||{}));
  const el=id=>{if(!elements.has(id)){const classes=new Set(['main','hdr','recovery'].includes(id)?['hidden']:[]);elements.set(id,{value:'new-password-123',textContent:'',style:{},disabled:false,dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,v)=>v?classes.add(x):classes.delete(x)},querySelectorAll:()=>[el('recovery-password'),el('recovery-confirm'),el('submit')],reset(){el('recovery-password').value='';el('recovery-confirm').value=''}})}return elements.get(id)};
  let session=options.existing?{access_token:token,user:{id:'user1'}}:null;
  const auth={
    async getSession(){calls.push('getSession');return {data:{session}}},
    async getUser(){calls.push('getUser');return options.revoked?{error:{message:'revoked'}}:{data:{user:{id:options.otherUser?'user2':'user1'}}}},
    async updateUser(){calls.push('updateUser');if(options.updateError)return {error:{message:'failure'}};return {data:{user:{id:'user1'}}}},
    async signOut(){calls.push('signOut');if(options.signOutError)return {error:{message:'offline'}};session=null;return {}},
  };
  for(const method of ['verifyOtp','exchangeCodeForSession','setSession'])auth[method]=async args=>{calls.push(method);if(options.callbackError)return {error:{message:'expired'}};session={access_token:token,user:{id:'user1'}};return {data:{session}}};
  const context={URL,URLSearchParams,Image:class{},crypto:require('node:crypto').webcrypto,atob,console,location:new URL(url),history:{replaceState(_a,_b,path){context.location=new URL(path,context.location)}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:el,querySelectorAll:()=>[]},window:{supabase:{createClient(_url,_key,config){assert.equal(config.auth.detectSessionInUrl,false);return {auth,from(){throw Error('Internal data must stay blocked')}}}}}};
  vm.createContext(context);vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  return {context,el,calls,storage,options,run,init:()=>run('initializeRecovery()'),submit:()=>run('submitRecoveryPassword({preventDefault(){}})'),setSession:value=>{session=value}};
}
for(const [name,url,method] of [
  ['token_hash','?token_hash=fake&type=recovery','verifyOtp'],
  ['PKCE','?code=fake','exchangeCodeForSession'],
  ['implicit','#access_token=fake&refresh_token=fake&type=recovery','setSession'],
])test(name+': validates, updates, signs out and clears recovery',async()=>{
  const h=harness('https://preview.test/v3/'+url);assert.equal(await h.init(),true);
  assert.ok(h.calls.includes(method));assert.equal(h.el('submit').disabled,false);
  assert.equal(h.context.location.href,'https://preview.test/v3/');
  await h.run('enter({access_token:"fake",user:{id:"user1"}})');
  assert.equal(h.el('main').style.display,'none');
  await h.submit();assert.equal(h.calls.filter(x=>x==='updateUser').length,1);
  assert.ok(h.calls.indexOf('getUser')<h.calls.indexOf('updateUser'));
  assert.ok(h.calls.indexOf('updateUser')<h.calls.indexOf('signOut'));
  assert.equal(h.storage.has('v3_recovery_pending'),false);
  assert.equal(h.el('auth').classList.contains('hidden'),false);
  assert.equal(h.el('main').style.display,'none');
  assert.match(h.el('amsg').textContent,/Senha atualizada/);
});
for(const url of ['?type=recovery','?token_hash=expired&type=recovery','?code=expired','#access_token=fake&type=recovery','?error_code=otp_expired','?type=signup&token_hash=fake','?code=fake&token_hash=fake'])test('rejects invalid callback '+url,async()=>{
  const h=harness('https://preview.test/v3/'+url,{existing:true,callbackError:true});await h.init();await h.submit();
  assert.ok(!h.calls.includes('updateUser'));assert.equal(h.el('submit').disabled,true);assert.equal(h.el('main').style.display,'none');
});
test('no recovery intent keeps ordinary login unchanged',async()=>{const h=harness();assert.equal(await h.init(),false);assert.equal(h.calls.length,0)});
test('manual submission without validated recovery cannot update',async()=>{const h=harness(undefined,{existing:true});await h.submit();assert.ok(!h.calls.includes('updateUser'))});
test('stale legacy marker does not authorize an existing login',async()=>{const h=harness(undefined,{existing:true,storage:{v3_recovery_pending:'1'}});await h.init();await h.submit();assert.ok(!h.calls.includes('updateUser'))});
test('server rejection blocks expired session at submission',async()=>{const h=harness('https://preview.test/v3/?code=fake');await h.init();h.options.revoked=true;await h.submit();assert.ok(!h.calls.includes('updateUser'));assert.equal(h.el('submit').disabled,true)});
test('session disappearance blocks update',async()=>{const h=harness('https://preview.test/v3/?code=fake');await h.init();h.setSession(null);await h.submit();assert.ok(!h.calls.includes('updateUser'))});
test('identity mismatch blocks recovery',async()=>{const h=harness('https://preview.test/v3/?code=fake',{otherUser:true});await h.init();await h.submit();assert.ok(!h.calls.includes('updateUser'))});
test('double submit updates only once',async()=>{const h=harness('https://preview.test/v3/?code=fake');await h.init();await Promise.all([h.submit(),h.submit()]);assert.equal(h.calls.filter(x=>x==='updateUser').length,1)});
test('update failure retains validated form for retry',async()=>{const h=harness('https://preview.test/v3/?code=fake',{updateError:true});await h.init();await h.submit();assert.ok(!h.calls.includes('signOut'));assert.equal(h.el('submit').disabled,false)});
test('sign-out failure stays locked; retry never updates password twice',async()=>{const h=harness('https://preview.test/v3/?code=fake',{signOutError:true});await h.init();await h.submit();assert.equal(h.el('auth').style.display,'none');assert.equal(JSON.parse(h.storage.get('v3_recovery_pending')).completed,true);h.options.signOutError=false;await h.run('finishRecovery()');assert.equal(h.calls.filter(x=>x==='updateUser').length,1);assert.equal(h.storage.size,0)});
test('refresh resumes only the validated session',async()=>{const first=harness('https://preview.test/v3/?code=fake');await first.init();const h=harness(undefined,{existing:true,storage:Object.fromEntries(first.storage)});await h.init();assert.equal(h.el('submit').disabled,false);assert.ok(!h.calls.includes('exchangeCodeForSession'))});
test('expired recovery marker is rejected',async()=>{const h=harness(undefined,{existing:true,storage:{v3_recovery_pending:JSON.stringify({userId:'user1',sessionId:'recovery-session',expiresAt:1})}});await h.init();await h.submit();assert.ok(!h.calls.includes('updateUser'))});
test('completed recovery on refresh signs out without another update',async()=>{const h=harness(undefined,{existing:true,storage:{v3_recovery_pending:JSON.stringify({completed:true})}});await h.init();assert.ok(h.calls.includes('signOut'));assert.ok(!h.calls.includes('updateUser'));assert.equal(h.storage.size,0)});
test('short or mismatched passwords never call updateUser',async()=>{const h=harness('https://preview.test/v3/?code=fake');await h.init();h.el('recovery-password').value='short';await h.submit();h.el('recovery-password').value='another-password';await h.submit();assert.ok(!h.calls.includes('updateUser'))});
