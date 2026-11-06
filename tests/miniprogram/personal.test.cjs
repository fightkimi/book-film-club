const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(name,handler=async()=>({}),signed=true){
 let config;const calls=[],nav=[],globalData={};let consent=true;
 const api={hasSession:()=>signed,request:async(path,data)=>{calls.push({path,data});return handler(path,data);}};
 const wx={reLaunch:r=>nav.push(r),redirectTo:r=>nav.push(r),navigateTo:r=>nav.push(r),switchTab:r=>nav.push(r),showToast:()=>{},setClipboardData:()=>{},pageScrollTo:()=>{}};
 const C={go:(name,params)=>nav.push({name,params}),confirm:async()=>consent};
 const context={module:{exports:{}},require:n=>n==='./api'?api:C,Page:c=>config=c,wx};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/lib/personal-api'),'utf8'),context);
 const P=context.module.exports;
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/'+name+'/index'),'utf8'),{require:n=>n.endsWith('/personal-api')?P:n.endsWith('/poster-url')?require('../../miniprogram/lib/poster-url'):{fetchBookstore:async()=>({stores:[]})},wx,getApp:()=>({globalData})});
 const page={...config,data:structuredClone(config.data),setData(next){Object.assign(this.data,next);}};
 page.onLoad({id:'item1'});
 return {page,calls,nav,globalData,consent:v=>consent=v,login:v=>signed=v};
}
test('all personal pages gate data and credentials behind the member session',async()=>{
 for(const name of ['library','personal-connect','personal-add','personal-item','personal-notes','personal-digest','personal-share']){
  const h=harness(name,async()=>assert.fail('no private fetch'),false);
  await h.page.load();assert.equal(h.page.data.authorized,false);assert.equal(h.calls.length,0);assert.match(h.nav[0].url,/login.*next=library/);
 }
});
test('connecting clears the entered key before network response and hiding clears it again',async()=>{
 let release;const h=harness('personal-connect',()=>new Promise(r=>release=r));
 h.page.setData({key:'wrk-'+'synthetic-placeholder',connection:{generation:''}});
 const pending=h.page.connect();assert.equal(h.page.data.key,'');assert.match(h.calls[0].data.key,/^wrk-/);
 release({connected:true,generation:'new'});await pending;
 h.page.setData({key:'another draft'});h.page.onHide();assert.equal(h.page.data.key,'');assert.equal(h.page.data.authorized,false);
});
test('AI receives only selected note IDs after explicit consent and retries reuse the request ID',async()=>{
 let fail=true;const h=harness('personal-notes',async()=>{if(fail)throw new Error('timeout');return {id:'digest1'};});
 h.page.setData({selected:['note2'],version:'v1'});h.consent(false);
 await h.page.generate();assert.equal(h.calls.length,0);
 h.consent(true);await h.page.generate();assert.equal(h.page.data.error,'timeout');
 const first=h.calls[0].data;assert.deepEqual([...first.note_ids],['note2']);assert.equal(first.consent,true);
 fail=false;await h.page.generate();assert.equal(h.calls[1].data.request_id,first.request_id);assert.equal(h.nav[0].name,'personal-digest');
});
test('sync refuses to overwrite an unsaved manual review',async()=>{
 const h=harness('personal-item',async()=>assert.fail('dirty record must not sync'));
 h.page.dirty=true;h.page.setData({reflection:'我的新观点'});
 await h.page.sync();assert.equal(h.calls.length,0);assert.equal(h.page.data.reflection,'我的新观点');assert.match(h.page.data.error,/先保存/);
});
test('personal share starts empty and preserves selected draft after failure',async()=>{
 const h=harness('personal-share',async()=>{throw new Error('network');});
 assert.equal(h.page.data.body,'');h.page.setData({body:'只分享这一段',title:'我的书',cityIndex:0});
 await h.page.publish();assert.equal(h.page.data.body,'只分享这一段');assert.equal(h.calls[0].data.body,'只分享这一段');assert.equal(h.calls[0].data.scope,'city');
});
test('choosing a catalog book opens its full introduction directly',()=>{
 const h=harness('personal-add');h.page.all=[{id:'work:book1',title:'书籍'}];h.page.data.source='catalog';
 h.page.choose({currentTarget:{dataset:{id:'work:book1'}}});
 assert.equal(h.nav[0].name,'work');assert.equal(h.nav[0].params.id,'book1');assert.equal(h.calls.length,0);
});
test('a card plan action selects a book, submits the chosen month once and returns to that month',async()=>{
 let finish;const h=harness('personal-add',()=>new Promise(r=>finish=r));
 h.page.all=[{id:'work:b1',title:'已核对的书籍'}];h.page.setData({source:'catalog',month:'2026-12'});
 h.page.selectForPlan({currentTarget:{dataset:{id:'work:b1'}}});
 assert.equal(h.page.data.selected.id,'work:b1');assert.equal(h.nav.length,0);
 const pending=h.page.add();h.page.add();assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].data.month,'2026-12');assert.equal(h.calls[0].data.source_id,'work:b1');
 finish({item:{id:'record1'}});await pending;assert.equal(h.nav[0].url,'/pages/library/index');assert.equal(h.globalData.personalLibraryFocus.month,'2026-12');assert.equal(h.globalData.personalLibraryFocus.view,'month');
});
test('a failed plan request keeps the selection and month available for retry',async()=>{
 const h=harness('personal-add',async()=>{throw new Error('暂时无法保存');});
 h.page.all=[{id:'work:b1',title:'书'}];h.page.setData({source:'catalog',month:'2026-12'});
 h.page.selectForPlan({currentTarget:{dataset:{id:'work:b1'}}});await h.page.add();
 assert.equal(h.page.data.selected.id,'work:b1');assert.equal(h.page.data.month,'2026-12');assert.equal(h.page.data.error,'暂时无法保存');assert.equal(h.nav.length,0);
});
test('AI review remains a draft, uses selected notes and supports restoring the original',async()=>{
 const draft={polished:'整理后的文字',suggestions:[],questions:[],evidence:[]};
 const h=harness('personal-item',async()=>({draft}));h.page.setData({reflection:'本人原稿',noteIds:['n2'],noteVersion:'v1'});
 h.consent(false);await h.page.assist();assert.equal(h.calls.length,0);
 h.consent(true);await h.page.assist();assert.equal(h.page.data.reflection,'本人原稿');assert.deepEqual([...h.calls[0].data.note_ids],['n2']);
 await h.page.adoptReview();assert.equal(h.page.data.reflection,'整理后的文字');h.page.restoreReview();assert.equal(h.page.data.reflection,'本人原稿');assert.equal(h.calls.length,1);
});
test('note-only updates preserve a typed review but concurrent review edits keep the conflict',()=>{
 const h=harness('personal-item');const before={id:'item1',kind:'book',status:'reading',reflection:'已保存',notes_version:'n1',rev:5};
 h.page.setData({item:before,reflection:'正在写的文字'});h.page.rev=5;h.page.dirty=true;
 h.page.apply({item:{...before,notes_version:'n2',rev:6},months:[],history:[]});
 assert.equal(h.page.data.reflection,'正在写的文字');assert.equal(h.page.rev,6);
 h.page.apply({item:{...before,notes_version:'n2',reflection:'另一个窗口修改了正文',rev:7},months:[],history:[]});
 assert.equal(h.page.data.reflection,'正在写的文字');assert.equal(h.page.rev,6);
});
