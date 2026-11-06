"""Serve only the trial bookstore endpoints. Delegate identity to the existing loopback club service."""
from contextlib import closing
import http.client
import json
import os
from urllib.parse import parse_qs, urlparse

import bookstores
from domain import Problem
from server import Handler, ThreadingHTTPServer, client_ip


class TrialHandler(Handler):
    def book_detail(self,source_id):
        upstream=http.client.HTTPConnection('127.0.0.1',int(os.environ.get('CLUB_AUTH_PORT','8787')),timeout=30)
        try:
            upstream.request('POST','/api/metadata/detail',json.dumps({'provider':'weread','source_id':source_id}),headers={
                'Host':urlparse(os.environ['CLUB_ORIGIN']).netloc,'Cookie':self.headers.get('Cookie',''),
                'Content-Type':'application/json','X-Club-Request':'1'})
            response=upstream.getresponse()
            if response.status==401:raise Problem('请先微信登录',401)
            if response.status!=200:raise Problem('书籍资料暂时无法读取，请稍后重试',503)
            raw=response.read(100_001)
            if len(raw)>100_000:raise ValueError()
            value=json.loads(raw)['item']
            if not isinstance(value,dict) or value.get('source_id')!=source_id:raise ValueError()
            return value
        except (OSError,ValueError,KeyError,TypeError,http.client.HTTPException):
            raise Problem('书籍资料暂时无法读取，请稍后重试',503)
        finally:upstream.close()

    def personal_snapshot(self):
        upstream=http.client.HTTPConnection('127.0.0.1',int(os.environ.get('CLUB_AUTH_PORT','8787')),timeout=15)
        try:
            upstream.request('GET','/api/state',headers={'Host':urlparse(os.environ['CLUB_ORIGIN']).netloc,
                'Cookie':self.headers.get('Cookie',''),'X-Club-View':'mini'})
            response=upstream.getresponse()
            if response.status==401:raise Problem('请先微信登录',401)
            if response.status!=200:raise Problem('书影资料暂不可用',503)
            raw=response.read(3_000_001)
            if len(raw)>3_000_000:raise ValueError()
            value=json.loads(raw)['state']
            if not isinstance(value,dict):raise ValueError()
            return value
        except (OSError,ValueError,KeyError,TypeError,http.client.HTTPException):
            raise Problem('书影资料暂不可用',503)
        finally:upstream.close()

    def book_sources(self):
        upstream=http.client.HTTPConnection('127.0.0.1',int(os.environ.get('CLUB_AUTH_PORT','8787')),timeout=30)
        try:
            upstream.request('GET','/api/booklists/group',headers={
                'Host':urlparse(os.environ['CLUB_ORIGIN']).netloc,'Cookie':self.headers.get('Cookie','')})
            res=upstream.getresponse()
            if res.status==401:raise Problem('请先微信登录',401)
            if res.status!=200:raise Problem('书影库暂时无法读取，请稍后重试',503)
            raw=res.read(3_000_001)
            if len(raw)>3_000_000:raise ValueError()
            data=json.loads(raw)
            if not isinstance(data.get('books'),list):raise ValueError()
            return data
        except (OSError,ValueError,KeyError,TypeError,http.client.HTTPException):
            raise Problem('书影库暂时无法读取，请稍后重试',503)
        finally:
            upstream.close()

    def viewer(self):
        cookie = self.headers.get('Cookie', '')
        if not cookie:
            return None
        # Never send a session to a public address or follow redirects.
        upstream = http.client.HTTPConnection('127.0.0.1', int(os.environ.get('CLUB_AUTH_PORT','8787')), timeout=4)
        try:
            upstream.request('GET','/api/session',headers={'Host':urlparse(os.environ['CLUB_ORIGIN']).netloc,'Cookie':cookie})
            res=upstream.getresponse()
            if res.status!=200: raise Problem('登录服务暂不可用',503)
            return json.loads(res.read(32768))['user']
        except (OSError, KeyError, ValueError, http.client.HTTPException):
            raise Problem('登录服务暂不可用',503)
        finally:
            upstream.close()

    def dispatch(self, write):
        try:
            self.check_host()
            parsed=urlparse(self.path)
            if not parsed.path.startswith('/api/bookstores/'): raise Problem('接口不存在',404)
            body=self.body() if write else None
            user=self.viewer()
            bookstores.serve(self,parsed.path,parse_qs(parsed.query),user,body,ip=client_ip(self.client_address[0],self.headers))
        except Problem as error:
            self.send({'error':error.message},error.status)

    def do_GET(self):
        self.dispatch(False)

    def do_POST(self):
        self.dispatch(True)


if __name__=='__main__':
    if not os.environ.get('BOOKSTORES_DB'):
        raise SystemExit('An isolated BOOKSTORES_DB is required.')
    with closing(bookstores.connect()) as db:
        bookstores.initialize(db)
    ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('BOOKSTORES_TRIAL_PORT','8796'))),TrialHandler).serve_forever()
