const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const start = html.indexOf('function paymentDiscountCalc(){');
const end = html.indexOf('function updatePaymentDiscountPreview()', start);
assert(start >= 0 && end > start, 'Baseline function must exist');
const cases = [
  {gross:150,type:'none',value:0,final:150},
  {gross:150,type:'percent',value:10,final:135},
  {gross:150,type:'fixed',value:15,final:135},
  {gross:150,type:'percent',value:100,final:0},
  {gross:150,type:'percent',value:101,error:true},
  {gross:150,type:'fixed',value:151,error:true},
  {gross:150,type:'fixed',value:-1,error:true},
  {gross:123.45,type:'percent',value:10,final:111.10},
];
for (const c of cases) {
  const context = {currentPaymentQuote:{gross:c.gross}, $:id=>({value:id==='paydiscounttype'?c.type:String(c.value)})};
  vm.createContext(context);
  vm.runInContext(html.slice(start,end),context);
  const result = context.paymentDiscountCalc();
  if(c.error) assert(result.error, JSON.stringify(c));
  else {assert.equal(result.error,'');assert.equal(result.final,c.final);}
}
console.log(`PASS: ${cases.length} frontend payment cases; does not certify RPC or UI.`);
