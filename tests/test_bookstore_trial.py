import http.client
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
from urllib.parse import quote
import tempfile
import threading
import unittest
from unittest.mock import patch

import bookstores
import server
from deploy.bookstore_trial import TrialHandler


class TrialHTTPCases(unittest.TestCase):
    def test_trial_with_existing_identity_and_separate_storage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch.object(server,'DB_PATH',root/'club.sqlite3'), patch.dict(os.environ,BOOKSTORES_DB=str(root/'separate'/'bookstores.sqlite3')):
                server.init_db()
                with server.connect() as db:
                    for id,role in [('platform','admin'),('visitor','member')]:
                        db.execute('INSERT INTO users VALUES(?,?,?,?,?,0)',(id,id,id,role,'unused'))
                    staff=server.issue_session(db,'platform')
                    visitor=server.issue_session(db,'visitor')
                    rev,state=server.load_state(db)
                    state['works'].append({'id':'library-book','kind':'book','title':'真实书目','creator':'作者','image':'','metadata_status':'confirmed','description':'公开简介'})
                    state['themes'].append({'id':'activity-test-theme','title':'迟来的话','description':'交流与回应','angles':'如何回应？'})
                    server.save_state(db,rev,state)
                auth=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                trial=ThreadingHTTPServer(('127.0.0.1',0),TrialHandler)
                servers=[auth,trial]
                host='127.0.0.1:'+str(trial.server_port)
                origin='http://'+host
                with patch.object(server,'ALLOWED_ORIGINS',{origin}),patch.dict(os.environ,CLUB_ORIGIN=origin,CLUB_AUTH_PORT=str(auth.server_port)),patch('booklists.member_keys',return_value={}):
                    for srv in servers: threading.Thread(target=srv.serve_forever,daemon=True).start()
                    def req(op,token=None,payload=None,event_ticket=None):
                        conn=http.client.HTTPConnection('127.0.0.1',trial.server_port,timeout=5)
                        headers={'Host':host,'X-Club-Request':'1','Content-Type':'application/json'}
                        if event_ticket:headers['X-Book-Event-Token']=event_ticket
                        if token:headers['Cookie']='club_session'+'='+token
                        conn.request('POST' if payload is not None else 'GET','/api/bookstores/'+op,
                                     json.dumps(payload) if payload is not None else None,headers)
                        res=conn.getresponse();body=json.loads(res.read());conn.close();return res.status,body
                    try:
                        self.assertEqual(req('catalog?city='+quote('全国'),visitor)[1]['stores'],bookstores.CATALOG)
                        for endpoint in ('catalog','shop?shop=duben','feed?scope=city','topic?post=1','following','recommend-books'):
                            for token in (None,'expired-session'):
                                self.assertEqual(req(endpoint,token)[0],401)
                        code,library=req('recommend-books',visitor)
                        self.assertEqual(code,200)
                        self.assertEqual(library['books'],[{'id':'work:library-book','title':'真实书目','creator':'作者'}])
                        self.assertEqual(req('follow',visitor,{'shop':'duben','enabled':True})[0],200)
                        self.assertFalse(req('shop?shop=duben',visitor)[1]['member'])
                        recommendation={'book_id':'work:library-book','body':'一句理由','shop':'duben','city':'全国','request_id':'rec-http','title':'伪造书名','book':{'title':'伪造书名'}}
                        code,posted=req('recommend',visitor,recommendation)
                        self.assertEqual(code,200)
                        self.assertEqual(req('recommend',visitor,recommendation)[1],posted)
                        self.assertEqual(req('topic?post='+str(posted['id']),visitor)[1]['post']['title'],'真实书目')
                        self.assertEqual(req('recommend',visitor,{**recommendation,'request_id':'bad','book_id':'missing'})[0],400)
                        self.assertEqual(req('following',visitor)[1]['updates'][0]['id'],posted['id'])
                        self.assertEqual(req('issue',payload={'shop':'duben'})[0],401)
                        self.assertEqual(req('issue',visitor,{'shop':'duben'})[0],403)
                        code=req('issue',staff,{'shop':'duben'})[1]['code']
                        self.assertEqual(req('join',visitor,{'shop':'duben','code':code})[0],200)
                        pid=req('post',visitor,dict(shop='duben',scope='circle',kind='逛店手记',title='标题',body='正文'))[1]['id']
                        self.assertEqual(req('topic?post='+str(pid))[0],401)
                        self.assertEqual([p['id'] for p in req('feed?scope=city',visitor)[1]['posts']],[posted['id']])
                        self.assertTrue(req('shop?shop=duben',visitor)[1]['member'])
                        self.assertEqual(req('reply',visitor,{'post':pid,'body':'回复'})[0],200)
                        payload=dict(shop='duben',kind='meet',audience='readers',title='测试聚会',description='测试',blurb='',place='一楼',capacity=2,starts='2099-06-01 15:00',request_id='fixture')
                        code,event=req('gather-new',staff,payload)
                        self.assertEqual(code,200); eid=event['id']
                        self.assertEqual(req('gather-detail?event='+eid)[0],401)
                        with patch('wechat_login.configuration',return_value=('fixture','unused')),patch('wechat_login.exchange',return_value='synthetic-subject'):
                            code,guest=req('gather-login',payload={'event':eid,'code':'test'})
                        self.assertEqual(code,200);ticket=guest['event_token']
                        self.assertEqual(req('gather-detail?event='+eid,event_ticket=ticket)[0],200)
                        self.assertEqual(req('catalog',event_ticket=ticket)[0],401)
                        self.assertEqual(req('gather-sign',payload={'event':eid,'nickname':'测试'},event_ticket=ticket)[0],200)
                        self.assertEqual(req('gather-end',payload={'event':eid,'rev':1},event_ticket=ticket)[0],403)
                        self.assertTrue(req('gather-detail?event='+eid,event_ticket=ticket)[1]['joined'])
                        self.assertEqual(req('gather-cancel',staff,{'event':eid,'rev':1},ticket)[0],200)
                        self.assertEqual(req('gather-detail?event='+eid,event_ticket=ticket)[1]['state'],'cancelled')
                        repeat={**payload,'source':eid,'source_rev':2,'request_id':'repeat-http','starts':'2099-06-08 15:00'}
                        self.assertEqual(req('gather-repeat',visitor,repeat)[0],403)
                        code,new=req('gather-repeat',staff,repeat)
                        self.assertEqual(code,200)
                        self.assertEqual(req('gather-repeat',staff,repeat)[1],new)
                        self.assertEqual(req('gather-detail?event='+new['id'],staff)[1]['booked'],0)
                        self.assertEqual(req('gather-delete',visitor,{'event':eid,'rev':2},ticket)[0],403)
                        self.assertEqual(req('gather-delete',staff,{'event':eid,'rev':1},ticket)[0],409)
                        self.assertEqual(req('gather-delete',staff,{'event':eid,'rev':2},ticket)[0],200)
                        self.assertEqual([g['id'] for g in req('shop?shop=duben',staff)[1]['gatherings']],[new['id']])
                        tombstone=req('gather-detail?event='+eid,event_ticket=ticket)[1]
                        self.assertEqual(tombstone['state'],'deleted')
                        self.assertNotIn('description',tombstone)
                        self.assertNotIn('roster',tombstone)
                        self.assertEqual(req('following',event_ticket=ticket)[0],401)
                        self.assertEqual(req('recommend-books',event_ticket=ticket)[0],401)
                        self.assertEqual(req('topic?post='+str(pid),visitor)[1]['replies'][0]['body'],'回复')
                        for endpoint in ('personal/connection','personal/list','personal/notes?item=missing','personal/circles'):
                            self.assertEqual(req(endpoint)[0],401)
                            self.assertEqual(req(endpoint,event_ticket=ticket)[0],401)
                        code,added=req('personal/add',visitor,{'source':'manual','kind':'movie','title':'我的电影','creator':'导演','request_id':'private-http','month':'2026-11'})
                        self.assertEqual(code,200);item_id=added['item']['id']
                        self.assertEqual(req('personal/list?month=2026-11',visitor)[1]['items'][0]['id'],item_id)
                        self.assertEqual(req('personal/item?item='+item_id,staff)[0],404)
                        self.assertEqual(req('personal/list?view=wish',staff)[1]['items'],[])
                        self.assertEqual(req('personal/note-add',visitor,{'item':item_id,'body':'我的私人想法'})[0],200)
                        self.assertEqual(req('personal/notes?item='+item_id,staff)[0],404)
                        self.assertEqual(req('personal/digest-generate',visitor,{'item':item_id,'request_id':'no-consent','note_ids':['x'],'consent':False})[0],400)
                        code,saved=req('personal/save',visitor,{'item':item_id,'rev':2,'status':'done','tracking':'manual','progress':100,'finished_at':'2026-11-01','rating':4,'reflection':'个人影评','spoiler':True})
                        self.assertEqual(code,200)
                        self.assertEqual(saved['item']['reflection'],'个人影评')
                        self.assertEqual(req('voice',visitor,{'shop':'duben','voice_rev':0,'body':'越权'})[0],403)
                        self.assertEqual(req('voice',staff,{'shop':'duben','voice_rev':0,'body':'平等，具体，少口号'})[0],200)
                        self.assertNotIn('voice',req('shop?shop=duben',visitor)[1])
                        theme_payload={'kind':'mixed','work_ids':['library-book'],'rejected':[]}
                        new_theme={'title':'给日常留下一次停顿','description':'从一次停顿聊聊选择。','angles':'谁在等？\n为什么等？\n还能怎样？'}
                        with server.connect() as before_db:revision_before,state_before=server.load_state(before_db)
                        with patch('bookstore_events.ai.generate',return_value={'theme':new_theme}) as generated:
                            self.assertEqual(req('activity-theme-ai',payload=theme_payload)[0],401)
                            self.assertEqual(req('activity-theme-ai',payload=theme_payload,event_ticket=ticket)[0],401)
                            self.assertEqual(req('activity-theme-ai',visitor,{**theme_payload,'work_ids':['unknown']})[0],404)
                            generated.assert_not_called()
                            code,draft=req('activity-theme-ai',visitor,theme_payload)
                            self.assertEqual(code,200);self.assertEqual(draft['draft']['theme'],new_theme)
                            self.assertEqual(generated.call_args.args[0],'activity_theme')
                            self.assertEqual(generated.call_args.args[1]['works'][0]['title'],'真实书目')
                            self.assertEqual(req('activity-theme-ai',visitor,{**theme_payload,'rejected':[new_theme['title']]})[0],502)
                        with server.connect() as after_db:revision_after,state_after=server.load_state(after_db)
                        self.assertEqual((revision_before,state_before),(revision_after,state_after))
                        picks_payload={'kind':'book','theme_id':'activity-test-theme','exclude':[]}
                        with patch('bookstore_events.ai.generate',return_value={'recommendations':[{'work_id':'library-book','reason':'围绕交流讨论','caveat':''}]}) as generated:
                            self.assertEqual(req('activity-picks-ai',payload=picks_payload)[0],401)
                            self.assertEqual(req('activity-picks-ai',payload=picks_payload,event_ticket=ticket)[0],401)
                            generated.assert_not_called()
                            status,result=req('activity-picks-ai',visitor,picks_payload)
                            self.assertEqual(status,200)
                            self.assertEqual(result['recommendations'][0]['id'],'library-book')
                            self.assertEqual(generated.call_args.args[0],'recommend')
                        with server.connect() as after_db:revision_after,state_after=server.load_state(after_db)
                        self.assertEqual((revision_before,state_before),(revision_after,state_after))
                        self.assertEqual(req('personal/book-detail?source=weread&id=book1',staff)[0],404)
                        with patch('server.metadata.detail',return_value={'source_id':'public1','provider':'weread','kind':'book','title':'来源书名','description':'来自资料源的介绍','creator':'作者'}):
                            code,book=req('personal/add',visitor,{'source':'public','source_id':'public1','title':'不可信标题'})
                            self.assertEqual(code,200);self.assertEqual(book['item']['title'],'来源书名')
                            self.assertEqual(book['item']['source_id'],'shelf:public1')
                    finally:
                        for srv in servers:srv.shutdown();srv.server_close()
                with server.connect() as db:
                    self.assertFalse(db.execute("SELECT 1 FROM sqlite_master WHERE name IN ('post','membership','shop')").fetchone())
