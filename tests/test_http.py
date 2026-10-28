import http.client
import json
import secrets
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
import server

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
    def test_setup_is_one_time(self):
        self.assertEqual(self.request('/api/setup',{})[0],409)
    def test_member_cannot_admin(self):
        _,s,_=self.request('/api/state',cookie=self.member_auth)
        status,_,_=self.request('/api/action',{'revision':s['revision'],'action':'theme.save','payload':{'title':'forbidden'}},self.member_auth)
        self.assertEqual(status,403)
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
    def test_rollback_invalid_action(self):
        _,before,_=self.request('/api/state',cookie=self.auth)
        self.request('/api/action',{'revision':before['revision'],'action':'unknown','payload':{}},self.auth)
        _,after,_=self.request('/api/state',cookie=self.auth)
        self.assertEqual(before['revision'],after['revision'])
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
