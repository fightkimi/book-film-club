import http.client
import json
import secrets
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
import server
from unittest.mock import patch
from test_companion import sample_state

class HttpBoundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.original=server.DB_PATH
        server.DB_PATH=Path(cls.tmp.name)/'club.sqlite3';server.init_db()
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.port=cls.http.server_address[1];server.ALLOWED_ORIGINS.add('http://127.0.0.1:'+str(cls.port))
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
        cls.auth=None;cls.member_auth=None
        cls.admin_secret=secrets.token_urlsafe(18);cls.member_secret=secrets.token_urlsafe(18)
        status,body,cookie=cls.request('/api/setup',{'group':'测试','username':'admin','name':'管理员','credential':HttpBoundaries.admin_secret})
        assert status==200,(status,body)
        cls.auth=cookie
        _,state,_=cls.request('/api/state',cookie=cls.auth)
        status,body,_=cls.request('/api/action',{'revision':state['revision'],'action':'member.add','payload':{'name':'读者','username':'reader','credential':HttpBoundaries.member_secret}},cls.auth)
        assert status==200,(status,body)
        _,_,cls.member_auth=cls.request('/api/login',{'username':'reader','credential':HttpBoundaries.member_secret})
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();server.DB_PATH=cls.original;cls.tmp.cleanup()
    @classmethod
    def request(cls,path,body=None,cookie=None,origin=None,header=True):
        c=http.client.HTTPConnection('127.0.0.1',cls.port,timeout=10)
        headers={}
        if body is not None:
            headers={'Content-Type':'application/json'}
            if header:headers['X-Club-Request']='1'
        if cookie:headers['Cookie']=cookie
        if origin:headers['Origin']=origin
        c.request('POST' if body is not None else 'GET',path,json.dumps(body).encode() if body is not None else None,headers)
        r=c.getresponse();raw=r.read();cookie=r.getheader('Set-Cookie');status=r.status;c.close()
        return status,json.loads(raw),cookie.split(';')[0] if cookie else None
    def test_anonymous_cannot_read_data(self):
        self.assertEqual(self.request('/api/state')[0],401)
    def test_local_video_policy_is_limited_to_self_and_blob(self):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=10)
        c.request('GET','/api/session');response=c.getresponse()
        policy=response.getheader('Content-Security-Policy');response.read();c.close()
        self.assertIn("media-src 'self' blob:;",policy)
        self.assertIn("connect-src 'self';",policy)
    def test_setup_is_one_time(self):
        self.assertEqual(self.request('/api/setup',{})[0],409)
    def test_mini_state_revision_is_authenticated_and_viewer_scoped(self):
        from urllib.parse import urlencode
        _,before,_=self.request('/api/state',cookie=self.member_auth)
        self.assertTrue(before['user']['can_create_theme'] and before['user']['can_start_activity'])
        path='/api/state?'+urlencode({'since':before['revision'],'viewer':before['user']['id']+':member'})
        def read(cookie):
            conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
            conn.request('GET',path,headers={'X-Club-View':'mini', 'Cookie':cookie})
            r=conn.getresponse();result=r.status,json.loads(r.read());conn.close();return result
        self.assertTrue(read(self.member_auth)[1]['unchanged'])
        self.assertIn('state',read(self.auth)[1])
        self.assertEqual(read('')[0],401)

    def test_member_cannot_admin(self):
        _,s,_=self.request('/api/state',cookie=self.member_auth)
        status,_,_=self.request('/api/action',{'revision':s['revision'],'action':'theme.save','payload':{'id':s['state']['themes'][0]['id'],'title':'forbidden'}},self.member_auth)
        self.assertEqual(status,403)
    def test_authenticated_member_can_draw(self):
        _,snapshot,_=self.request('/api/state',cookie=self.member_auth)
        self.assertTrue(snapshot['user']['can_draw_theme'])
        body={'revision':snapshot['revision'],'action':'theme.draw','payload':{'mode':'random'}}
        self.assertEqual(self.request('/api/action',body)[0],401)
        status,updated,_=self.request('/api/action',body,self.member_auth)
        self.assertEqual(status,200)
        self.assertEqual(updated['state']['draws'][-1]['user_id'],snapshot['user']['id'])
    def test_stale_revision_does_not_overwrite(self):
        status,_,_=self.request('/api/action',{'revision':-1,'action':'theme.save','payload':{'title':'stale'}},self.auth)
        self.assertEqual(status,409)
    def test_rejects_cross_site_and_missing_header(self):
        self.assertEqual(self.request('/api/action',{},self.auth,'https://evil.example')[0],403)
        self.assertEqual(self.request('/api/action',{},self.auth,header=False)[0],403)
    def test_no_secrets_in_state_or_export(self):
        _,s,_=self.request('/api/state',cookie=self.auth)
        self.assertNotIn('secret',s['user'])
        self.assertTrue(all('secret' not in u for u in s['users']))
        _,export,_=self.request('/api/export',cookie=self.auth)
        self.assertTrue(all('secret' not in u for u in export['members']))
    def test_member_cannot_export(self):
        self.assertEqual(self.request('/api/export',cookie=self.member_auth)[0],403)
    def test_companion_member_access_and_private_context(self):
        _,before,_=self.request('/api/state',cookie=self.member_auth)
        state=sample_state(before['user']['id'])
        with patch('server.load_state',return_value=(before['revision'],state)):
            self.assertEqual(self.request('/api/discover',{'theme_id':'theme'},self.member_auth)[0],200)
            self.assertEqual(self.request('/api/ai',{'task':'themes'},self.member_auth)[0],403)
            payload={'task':'review','cycle_id':'cycle','work_id':'short','body':'我自己的感想'}
            with patch('server.ai.generate',return_value={'polished':'整理稿','suggestions':['表达建议'],'questions':['依据？']}) as generate:
                status,_,_=self.request('/api/ai',payload,self.member_auth)
                self.assertEqual(status,200)
                context=generate.call_args.args[1]
                self.assertEqual(context['draft'],'我自己的感想')
                self.assertNotIn('PRIVATE NOTE',json.dumps(context))
                self.assertNotIn('OTHER REVIEW',json.dumps(context))
            with patch.dict('os.environ',{},clear=True):
                self.assertEqual(self.request('/api/ai',{'task':'guide','work_id':'short'},self.member_auth)[0],503)
            with patch('server.ai.generate',return_value={'recommendations':[{'work_id':'short','reason':'主题关联','caveat':''}]}):
                status,response,_=self.request('/api/ai',{'task':'recommend','theme_id':'theme','kind':'movie','minutes':90},self.member_auth)
                self.assertEqual(status,200)
                self.assertEqual([w['id'] for w in response['works']],['short'])
            state['cycles'][0]['status']='archived'
            self.assertEqual(self.request('/api/ai',payload,self.member_auth)[0],409)
        _,after,_=self.request('/api/state',cookie=self.member_auth)
        self.assertEqual(before['revision'],after['revision'])
        self.assertEqual(before['state'],after['state'])
    def test_companion_requires_authenticated_same_origin_requests(self):
        self.assertEqual(self.request('/api/discover',{'theme_id':'theme'})[0],401)
        self.assertEqual(self.request('/api/ai',{'task':'guide'},self.member_auth,'https://evil.example')[0],403)
    def test_personal_import_preview_bound_to_user_and_one_time(self):
        status,preview,_=self.request('/api/import/preview',{'provider':'letterboxd','content':'Name,Rating,Review\n私人电影,4,私人的感想','status':'done'},self.member_auth)
        self.assertEqual(status,200)
        _,member,_=self.request('/api/state',cookie=self.member_auth)
        args={'token':preview['token'],'selected':[preview['rows'][0]['source_key']],'mappings':{}}
        request={'revision':member['revision'],'action':'library.import','payload':args}
        self.assertEqual(self.request('/api/action',request,self.auth)[0],409)
        status,result,_=self.request('/api/action',request,self.member_auth)
        self.assertEqual(status,200);self.assertEqual(result['result']['added'],1)
        self.assertEqual(result['state']['journals'][0]['body'],'私人的感想')
        request['revision']=result['revision']
        self.assertEqual(self.request('/api/action',request,self.member_auth)[0],409)
        _,admin_state,_=self.request('/api/state',cookie=self.auth)
        self.assertEqual(admin_state['state']['journals'],[])
        _,export,_=self.request('/api/export',cookie=self.auth)
        self.assertNotIn('journals',export['state'])
        _,personal,_=self.request('/api/personal-export',cookie=self.member_auth)
        self.assertEqual(personal['journals'][0]['body'],'私人的感想')
        other_id=personal['journals'][0]['id']
        self.assertEqual(self.request('/api/action',{'revision':result['revision'],'action':'journal.link','payload':{'id':other_id,'work_id':'any'}},self.auth)[0],403)
    def test_personal_study_save_persists_and_is_not_shared(self):
        _,before,_=self.request('/api/state',cookie=self.auth)
        work={'kind':'movie','title':'Notebook test film','creator':'Creator','description':'Info','image':'https://example.com/poster.jpg','source_url':'https://example.com/film','metadata_status':'confirmed'}
        status,created,_=self.request('/api/action',{'revision':before['revision'],'action':'work.save','payload':work},self.auth)
        self.assertEqual(status,200)
        status,saved,_=self.request('/api/action',{'revision':created['revision'],'action':'study.save','payload':{'work_id':created['result']['id'],'mode':'shots','shots':[{'start':0,'end':5,'evidence':'私人观察内容'}]}},self.member_auth)
        self.assertEqual(status,200);self.assertEqual(saved['state']['studies'][0]['shots'][0]['id'],'S1')
        _,admin_state,_=self.request('/api/state',cookie=self.auth)
        self.assertEqual(admin_state['state']['studies'],[])
    def test_rollback_invalid_action(self):
        _,before,_=self.request('/api/state',cookie=self.auth)
        self.request('/api/action',{'revision':before['revision'],'action':'unknown','payload':{}},self.auth)
        _,after,_=self.request('/api/state',cookie=self.auth)
        self.assertEqual(before['revision'],after['revision'])
    def test_member_can_import_a_verified_movie_and_use_it_in_a_viewing_activity(self):
        movie=dict(kind='movie',title='Activity selection fixture',creator='Director',description='Verified synopsis',
                   image='https://example.com/film.jpg',source_url='https://example.com/film',
                   provider='tmdb',source_id='999881',year='2020',scraped_at='2026-11-06',extra={})
        with patch('server.metadata.detail',return_value=movie):
            status,preview,_=self.request('/api/metadata/detail',{'provider':'tmdb','source_id':'999881'},self.member_auth)
        self.assertEqual(status,200)
        _,before,_=self.request('/api/state',cookie=self.member_auth)
        status,imported,_=self.request('/api/action',{'revision':before['revision'],'action':'metadata.import','payload':{'token':preview['token']}},self.member_auth)
        self.assertEqual(status,200);work=imported['result']
        self.assertEqual(work['provider'],'tmdb');self.assertEqual(work['metadata_status'],'confirmed')
        form=dict(title='Viewing fixture',kind='movie',start='2026-11-06',end='2026-11-07',
                  theme_id=imported['state']['themes'][0]['id'],member_ids=[before['user']['id']],work_ids=[work['id']],rules={'quantity':'all'})
        status,draft,_=self.request('/api/action',{'revision':imported['revision'],'action':'cycle.save','payload':form},self.member_auth)
        self.assertEqual(status,200);self.assertEqual(draft['result']['works'][0]['kind'],'movie')
        status,published,_=self.request('/api/action',{'revision':draft['revision'],'action':'cycle.transition','payload':{'id':draft['result']['id'],'status':'active'}},self.member_auth)
        self.assertEqual(status,200);self.assertEqual(published['result']['status'],'active')
    def test_session_logout_revokes_cookie(self):
        _,_,cookie=self.request('/api/login',{'username':'reader','credential':HttpBoundaries.member_secret})
        self.assertEqual(self.request('/api/logout',{},cookie)[0],200)
        self.assertEqual(self.request('/api/state',cookie=cookie)[0],401)

    def test_credential_rotation_revokes_prior_sessions(self):
        old,new=secrets.token_urlsafe(18),secrets.token_urlsafe(18)
        _,state,_=self.request('/api/state',cookie=self.auth)
        status,_,_=self.request('/api/action',{'revision':state['revision'],'action':'member.add','payload':{'name':'临时验证','username':'rotation','credential':old}},self.auth)
        self.assertEqual(status,200)
        _,_,one=self.request('/api/login',{'username':'rotation','credential':old})
        _,_,two=self.request('/api/login',{'username':'rotation','credential':old})
        status,_,current=self.request('/api/credential',{'current':old,'credential':new},one)
        self.assertEqual(status,200)
        self.assertEqual(self.request('/api/state',cookie=two)[0],401)
        self.assertEqual(self.request('/api/state',cookie=current)[0],200)
        self.assertEqual(self.request('/api/login',{'username':'rotation','credential':old})[0],401)
    def test_zz_login_rate_limit(self):
        for _ in range(10):self.request('/api/login',{'username':'missing','credential':'invalid'})
        self.assertEqual(self.request('/api/login',{'username':'missing','credential':'invalid'})[0],429)
