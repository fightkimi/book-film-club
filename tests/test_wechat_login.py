import json
import os
import secrets
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import server
import wechat_login


class WeChatLogin(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.patch('server.DB_PATH', Path(self.tmp.name) / 'club.db')
        self.env = patch.dict(os.environ, WECHAT_APP_ID='fixture-app', WECHAT_APP_SECRET='test-only')
        self.env.start()
        self.addCleanup(self.env.stop)
        server.init_db()
        with server.connect() as c:
            for member in ('admin','member','second'):
                c.execute('INSERT INTO users VALUES(?,?,?,?,?,0)', (member,member,member,'admin' if member=='admin' else 'member','test-only'))
            self.admin = 'club_session=' + server.issue_session(c,'admin')
        self.http = ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.port = self.http.server_port
        self.origin = 'http://127.0.0.1:' + str(self.port)
        server.ALLOWED_ORIGINS.add(self.origin)
        self.addCleanup(server.ALLOWED_ORIGINS.discard,self.origin)
        self.addCleanup(self.http.server_close)
        self.addCleanup(self.http.shutdown)
        threading.Thread(target=self.http.serve_forever,daemon=True).start()
        self.remote = self.patch('wechat_login.fetch_json')
        self.remote.return_value = dict(openid='member-wechat-id',session_key='never-return-this')

    def patch(self, name, *args):
        override = patch(name,*args)
        value = override.start()
        self.addCleanup(override.stop)
        return value

    def call(self, path, payload=None, cookie=''):
        conn = HTTPConnection('127.0.0.1',self.port,timeout=5)
        conn.request('GET' if payload is None else 'POST',path,None if payload is None else json.dumps(payload),
                     {'Content-Type':'application/json','X-Club-Request':'1','Cookie':cookie})
        reply = conn.getresponse()
        status,body,session = reply.status,json.loads(reply.read()),(reply.getheader('Set-Cookie') or '').split(';')[0]
        conn.close()
        return status,body,session

    def ticket(self, user='member'):
        status,body,_ = self.call('/api/wechat/invite',{'user_id':user},self.admin)
        self.assertEqual(status,200,body)
        return body['invite']

    def login(self, **fields):
        return self.call('/api/wechat/login',dict(code='wechat-code',**fields))

    def test_bind_preserves_member_id_and_private_group(self):
        self.assertEqual(self.login()[0],403)
        ticket = self.ticket()
        status,body,cookie = self.login(invite=ticket)
        self.assertEqual((status,body),(200,{'ok':True}))
        snapshot = self.call('/api/state',cookie=cookie)[1]
        self.assertEqual(snapshot['user']['id'],'member')
        self.assertNotIn('never-return-this',json.dumps(snapshot))
        self.assertNotIn('member-wechat-id',json.dumps(snapshot))
        uri=urlparse(self.remote.call_args.args[0])
        self.assertEqual((uri.scheme,uri.netloc,uri.path),('https','api.weixin.qq.com','/sns/jscode2session'))
        self.assertEqual(parse_qs(uri.query)['appid'],['fixture-app'])
        self.assertEqual(self.login()[0],200)
        self.assertEqual(self.call('/api/wechat/invite',{'user_id':'admin'},cookie)[0],403)
        self.assertEqual(self.login(invite=ticket)[0],403)
        self.assertEqual(self.login(invite=self.ticket('second'))[0],403)
        with server.connect() as c:
            c.execute('UPDATE users SET disabled=1 WHERE id=?',('member',))
        self.assertEqual(self.login()[0],403)
        self.assertEqual(self.call('/api/state',cookie=cookie)[0],401)

    def test_invites_expire_and_fail_closed(self):
        old=self.ticket(); current=self.ticket()
        self.assertEqual(self.login(invite=old)[0],403)
        with server.connect() as c:
            c.execute('UPDATE wx_invitations SET expires=0')
        self.assertEqual(self.login(invite=current)[0],403)
        self.assertEqual(self.login(openid='forged',user_id='admin')[0],400)
        self.remote.return_value={'errcode':40029}
        self.assertEqual(self.login()[0],401)
        self.remote.reset_mock()
        with patch.dict(os.environ,WECHAT_APP_SECRET=''):
            self.assertEqual(self.login()[0],503)
        self.remote.assert_not_called()
        with server.connect() as c:
            self.assertEqual(c.execute('SELECT count(*) FROM wx_identities').fetchone()[0],0)
            self.assertEqual(c.execute('SELECT count(*) FROM sessions').fetchone()[0],1)

    def test_throttle_stops_before_contacting_provider(self):
        with server.connect() as c:
            for _ in range(20):
                wechat_login.reserve_attempt(c,'127.0.0.1')
        self.assertEqual(self.login()[0],429)
        self.remote.assert_not_called()
