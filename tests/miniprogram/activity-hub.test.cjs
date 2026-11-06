const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function screen(config){return {...config,data:structuredClone(config.data||{}),setData(patch){for(const [key,value] of Object.entries(patch)){const parts=key.split('.');let target=this.data;while(parts.length>1)target=target[parts.shift()];target[parts[0]]=value;}}};}
test('month panel previews the year and commits only a selected month',()=>{
 let c;const events=[];vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/components/month-picker/index.js'),'utf8'),{Component:x=>c=x});
 const s=screen({data:{...c.data,value:'2026-11'},...c.methods});s.triggerEvent=(type,e)=>events.push(e.value);
 s.open();s.year({currentTarget:{dataset:{step:1}}});assert.equal(s.data.year,2027);assert.equal(events.length,0);
 s.close();s.open();assert.equal(s.data.year,2026);s.pick({currentTarget:{dataset:{month:2}}});assert.equal(events[0],'2026-02');assert.equal(s.data.opened,false);
 s.data.disabled=true;s.open();assert.equal(s.data.opened,false);
});
test('starting an activity opens its own planning flow without silently switching tabs',()=>{
 let c;const calls=[];const C={define:x=>c=x,go:(...a)=>calls.push(a)};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/activities/index'),'utf8'),{require:n=>n.endsWith('/page')?C:n.endsWith('/theme-browser')?require('../../miniprogram/lib/theme-browser'):{},getApp:()=>({globalData:{}})});
 const s=screen(c);s.create();assert.equal(s.data.hubTab,'activities');assert.equal(calls[0][0],'cycle-edit');
});
test('chosen theme and canonical works survive activity steps and member collapse',()=>{
 let c;vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/cycle-edit/index'),'utf8'),{require:n=>n.endsWith('/page')?{define:x=>c=x}:{activityCover:()=>null},wx:{pageScrollTo:()=>{}}});
 const s=screen(c);s.query={theme_id:'t',works:'w,missing'};s.data.canStartActivity=true;
 s.ready({state:{themes:[{id:'t',title:'我的主题'}],works:[{id:'w',title:'真实作品'}],cycles:[]},users:[{id:'me'},{id:'other'}],user:{id:'me',role:'member'}});
 assert.equal(s.data.form.theme_id,'t');assert.equal(s.data.form.title,'我的主题');assert.deepEqual([...s.data.form.work_ids],['w']);
 s.members({detail:{value:['me']}});s.toggleMembers();s.toggleMembers();assert.equal(s.data.members[1].checked,false);
 s.nextStep();assert.equal(s.data.step,1);s.previousStep();assert.equal(s.data.step,0);assert.deepEqual([...s.data.form.work_ids],['w']);
});
test('theme choices contain real themes only and inline random selection keeps the form',async()=>{
 let c;const calls=[];const t={id:'t',title:'抽取的主题',enabled:true};
 const C={define:x=>c=x,api:{action:async(action,payload)=>{calls.push({action,payload});return {state:{themes:[t]},result:{theme_id:'t',theme_title:t.title}};}},run:async(p,fn)=>fn()};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/cycle-edit/index'),'utf8'),{require:n=>n.endsWith('/page')?C:{activityCover:()=>null},wx:{showToast:()=>{}}});
 const s=screen(c);s.query={};s.data.canStartActivity=true;
 s.ready({state:{themes:[t],works:[],cycles:[]},users:[{id:'me'}],user:{id:'me',role:'member'}});
 assert.equal(s.data.themeIndex,-1);assert.deepEqual([...s.data.themes.map(t=>t.id)],['t']);
 await s.randomTheme();assert.equal(s.data.form.theme_id,'t');assert.equal(s.data.step,0);assert.equal(calls[0].action,'theme.draw');
});
test('theme records exclude candidates with no associated activity',()=>{
 const browser=require('../../miniprogram/lib/theme-browser');const s=screen(browser);
 browser.ready.call(s,{state:{themes:[{id:'unused',title:'未选'},{id:'used',title:'已选'}],cycles:[{id:'event',theme_id:'used',status:'active'}],draws:[]}});
 assert.deepEqual(s.data.themes.map(t=>t.id),['used']);assert.equal(s.data.themes[0].uses,1);
});
test('AI topic generation previews a new candidate and writes only after adoption',async()=>{
 let c,resolve;const requests=[],actions=[];let state={themes:[{id:'old',title:'原有主题'}],works:[],cycles:[]};
 const draft={title:'一个没被听见的回答',description:'从一次被打断的交流聊起。',angles:'谁没有被听见？\n换个视角会怎样？\n是否需要回应？'};
 const C={define:x=>c=x,api:{request:async(path,payload)=>{requests.push(payload);return new Promise(r=>resolve=r);},refresh:async()=>({state}),action:async(action,payload)=>{actions.push(action);const result={...payload,id:'new'};state={...state,themes:state.themes.concat(result)};return {result,state};}},run:async(p,fn)=>{if(p.data.busy)return;p.setData({busy:true});try{return await fn();}finally{p.setData({busy:false});}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/cycle-edit/index'),'utf8'),{require:n=>n.endsWith('/page')?C:{activityCover:()=>null},wx:{showToast:()=>{}}});
 const s=screen(c);s.query={};s.data.canStartActivity=true;s.ready({state,users:[{id:'me'}],user:{id:'me',role:'member'}});
 const pending=s.generateTheme();s.generateTheme();assert.equal(requests.length,1);assert.equal(requests[0].task,'activity_theme');
 resolve({draft:{theme:draft}});await pending;
 assert.equal(actions.length,0);assert.equal(s.data.form.theme_id,'');assert.equal(s.data.themeDraft.title,draft.title);
 await s.useTheme();assert.deepEqual(actions,['theme.save']);assert.equal(s.data.form.theme_id,'new');assert.equal(s.data.step,0);
 const again=s.generateTheme();assert.ok(requests[1].rejected.includes(draft.title));resolve({draft:{theme:{...draft,title:'另一个切口'}}});await again;
 assert.equal(actions.length,1);assert.equal(s.data.form.theme_id,'new');
});
test('AI theme errors stay near the action and leave the chosen theme and works intact',async()=>{
 let c;const C={define:x=>c=x,api:{request:async()=>{throw new Error('暂时没有生成成功');}},run:async(p,fn)=>fn()};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/cycle-edit/index'),'utf8'),{require:n=>n.endsWith('/page')?C:{activityCover:()=>null},wx:{showToast:()=>{}}});
 const s=screen(c);s.data.form={kind:'book',theme_id:'old',work_ids:['w1'],direction:''};
 await s.generateTheme();assert.equal(s.data.themeError,'暂时没有生成成功');assert.equal(s.data.form.theme_id,'old');assert.deepEqual(s.data.form.work_ids,['w1']);
});
