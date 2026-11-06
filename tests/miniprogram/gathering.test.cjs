const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const calls=[], modals=[], toasts=[];
  const api={hasSession:()=>true};
  const ctx={accepted:true, failure:null, state:'open', rev:1};
  const wx={
    showModal(o){modals.push(o);o.success({confirm:ctx.accepted});},
    showToast(o){toasts.push(o.title);}, setNavigationBarTitle(){}, hideShareMenu(){ctx.shareHidden=true;},
  };
  const common={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/lib/page'),'utf8'),{module:common,require:()=>api,wx});
  const eventApi={valid:()=>true,has:()=>true,async call(op,id,body){
    calls.push({op,id,body});
    if(op==='detail')return {id,kind:'meet',state:ctx.state,rev:ctx.rev,can_manage:ctx.state!=='deleted'};
    if(ctx.failure)throw ctx.failure;
    ctx.state=op==='delete'?'deleted':op==='end'?'ended':'cancelled';ctx.rev++;
    return {ok:true};
  }};
  let page;
  vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/bookstore-gathering/index'),'utf8'),{
    Page(p){page=p;},wx,require:name=>name.endsWith('/page-lifecycle')?{retain:c=>c}:name.endsWith('/sharing')?{enable(){},prepare(){},schedule(){}}:name.endsWith('/api')?api:name.endsWith('/page')?common.exports:eventApi,
  });
  page.data={...page.data,v:{kind:'meet',state:'open',rev:1}};
  page.id='0123456789abcdef01234567';page.setData=d=>Object.assign(page.data,d);
  return {page,ctx,calls,modals,toasts,change:op=>page.state({currentTarget:{dataset:{op}}})};
}

test('cancel, end and delete confirm the intended action, persist once, refresh and show feedback',async()=>{
  for(const [op,state,title] of [['cancel','cancelled','这场先取消？'],['end','ended','散场了？'],['delete','deleted','删除这场活动？']]){
    const s=setup();await s.change(op);
    assert.equal(s.modals[0].title,title);
    assert.deepEqual(s.calls.map(c=>c.op),[op,'detail']);
    assert.equal(s.calls[0].body.rev,1);
    assert.equal(s.page.data.v.state,state);
    assert.equal(s.page.data.busy,false);
    assert.equal(s.toasts.length,1);
    if(op==='delete')assert.equal(s.ctx.shareHidden,true);
  }
});

test('dismissing the confirmation performs no mutation',async()=>{
  const s=setup();s.ctx.accepted=false;await s.change('cancel');
  assert.equal(s.calls.length,0);assert.equal(s.page.data.busy,false);
});

test('version conflicts refresh and surface feedback without repeating a mutation',async()=>{
  const s=setup();s.ctx.failure=Object.assign(new Error('活动已更新'),{status:409});s.ctx.rev=2;
  await s.change('cancel');
  assert.deepEqual(s.calls.map(c=>c.op),['cancel','detail']);
  assert.equal(s.page.data.v.rev,2);assert.equal(s.page.data.error,'活动已更新');
  assert.equal(s.toasts[0],'活动已更新');assert.equal(s.page.data.busy,false);
});

test('failed modal and duplicate taps do not leave the screen busy or mutate twice',async()=>{
  const s=setup();s.page.data.busy=true;await s.change('cancel');assert.equal(s.calls.length,0);
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/lib/page'),'utf8'),{
    module:mod,require:()=>({}),wx:{showModal(o){o.fail();}},
  });
  assert.equal(await mod.exports.confirm('确认'),false);
});
