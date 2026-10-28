#!/usr/bin/env python3
"""Single-instance club server. Bind to loopback; terminate HTTPS at a trusted proxy."""
import copy
import csv
import hashlib
import hmac
import http.cookies
import io
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import ai
import metadata
from domain import Problem, admin, empty_state, find, mutate, now, report, text, uid

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('CLUB_DB',str(ROOT/'data'/'club.sqlite3')))
PORT = int(os.environ.get('CLUB_PORT','8787'))
ORIGIN = os.environ.get('CLUB_ORIGIN','http://127.0.0.1:%s'%PORT)
ALLOWED_ORIGINS = {ORIGIN,'http://localhost:%s'%PORT,'http://127.0.0.1:5173','http://localhost:5173'}


def connect():
    c=sqlite3.connect(DB_PATH,timeout=10)
    c.row_factory=sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c


def init_db():
    DB_PATH.parent.mkdir(parents=True,exist_ok=True)
    with connect() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,secret TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(ip TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS metadata_cache(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,body TEXT NOT NULL,expires INTEGER NOT NULL);
        ''')
        c.execute('INSERT OR IGNORE INTO state VALUES(1,0,?)',(json.dumps(empty_state()),))
    os.chmod(DB_PATH,0o600)


def credential_hash(value):
    from argon2 import PasswordHasher
    if not isinstance(value,str) or not 10<=len(value)<=256:
        raise Problem('密码需为 10～256 个字符')
    return PasswordHasher().hash(value)


def credential_matches(value,stored):
    from argon2 import PasswordHasher
    from argon2.exceptions import VerificationError, InvalidHashError
    try:
        return PasswordHasher().verify(stored,value)
    except (VerificationError,InvalidHashError,TypeError):
        return False


def public_users(c):
    return [dict(r) for r in c.execute('SELECT id,username,name,role,disabled FROM users')]


def load_state(c):
    row=c.execute('SELECT revision,body FROM state WHERE id=1').fetchone()
    return row['revision'],json.loads(row['body'])


def save_state(c,revision,state):
    c.execute('UPDATE state SET revision=?,body=? WHERE id=1',(revision+1,json.dumps(state,ensure_ascii=False)))


def snapshot(c,user):
    rev,s=load_state(c)
    s['reports']={cy['id']:[report(s,cy,mid) for mid in cy['participants']] for cy in s['cycles']}
    if user['role']!='admin':
        s['audit']=[]
        for r in s['records']:
            if r['user_id']!=user['id']:
                r.pop('note',None)
        s['shelves']=[r for r in s['shelves'] if r['user_id']==user['id']]
    return dict(revision=rev,state=s,users=public_users(c),user={k:user[k] for k in ['id','name','username','role']},services={'ai':ai.configured(),'tmdb':bool(os.environ.get('TMDB_TOKEN'))})


def create_user(c,p,role='member'):
    username=text(p.get('username'),40).lower()
    if not re.fullmatch('[a-z0-9_-]{3,40}',username):
        raise Problem('账号需为 3～40 位字母、数字、下划线或连字符')
    user_id=uid()
    c.execute('INSERT INTO users(id,username,name,role,secret) VALUES(?,?,?,?,?)',(user_id,username,text(p.get('name'),40),role,credential_hash(p.get('credential'))))
    return dict(c.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone())


def issue_session(c,user_id):
    raw=secrets.token_urlsafe(32)
    c.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
    c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(raw.encode()).hexdigest(),user_id,int(time.time())+604800))
    return raw


def seed_themes():
    rows=[('离开故乡之后','距离如何改变我们对身份、亲密关系与归属的理解。','身份：离开熟悉的地方后，我们怎样定义自己？\n关系：距离揭示了什么？\n归属：故乡是地点、人，还是记忆？'),('不可靠的讲述者','当故事只能从一个人的眼睛里看见，我们相信什么？','视角：谁没有说话？\n记忆：哪些细节发生了变化？\n判断：我们如何建立自己的理解？'),('普通人的一次反抗','关注平凡生活中的选择、勇气与代价。','边界：忍耐从哪里结束？\n行动：一个小选择如何改变生活？\n代价：胜利一定值得吗？'),('时间留下的痕迹','在回忆与现实之间，观察时间怎样塑造一个人。','回忆：我们为什么记住某些瞬间？\n变化：过去如何进入现在？\n和解：是否必须告别？'),('另一种亲密关系','讨论家庭之外的陪伴，以及关系中的自由和责任。','陪伴：共同经历意味着什么？\n边界：爱与控制的距离？\n责任：选择关系意味着承担什么？'),('城市里的陌生人','相遇、擦肩与独处构成一座城市的故事。','空间：城市如何影响人的关系？\n孤独：独处与孤立有什么不同？\n相遇：偶然会改变什么？')]
    return [dict(id=uid(),title=a,description=b,angles=c,kind='mixed',tags='人文 / 关系',weight=1,enabled=True,source='editorial',created_at=now(),updated_at=now()) for a,b,c in rows]


class Handler(BaseHTTPRequestHandler):
    server_version='BookFilmClub'

    def log_message(self,fmt,*args):
        # Do not log query strings, request bodies, credentials, or external responses.
        pass

    def send(self,data,status=200,cookie=None,ctype='application/json; charset=utf-8',filename=None):
        body=json.dumps(data,ensure_ascii=False).encode() if ctype.startswith('application/json') else data
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
        if cookie is not None:
            secure='; Secure' if os.environ.get('CLUB_SECURE_COOKIE')=='1' else ''
            self.send_header('Set-Cookie','club_session=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=%s%s'%(cookie,604800 if cookie else 0,secure))
        if filename:
            self.send_header('Content-Disposition','attachment; filename="%s"'%filename)
        self.end_headers()
        self.wfile.write(body)

    def user(self,c,required=True):
        try:
            raw=http.cookies.SimpleCookie(self.headers.get('Cookie','')).get('club_session')
            token=hashlib.sha256(raw.value.encode()).hexdigest() if raw else ''
            row=c.execute('SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.disabled=0',(token,time.time())).fetchone()
            if row:
                return dict(row)
        except http.cookies.CookieError:
            pass
        if required:
            raise Problem('请先登录',401)
        return None

    def check_host(self):
        if self.headers.get('Host') not in {urlparse(o).netloc for o in ALLOWED_ORIGINS}:
            raise Problem('主机地址不受信任',403)

    def body(self):
        self.check_host()
        origin=self.headers.get('Origin')
        if self.headers.get('X-Club-Request')!='1' or (origin and origin not in ALLOWED_ORIGINS):
            raise Problem('请求来源不受信任',403)
        if not self.headers.get('Content-Type','').startswith('application/json'):
            raise Problem('请求格式必须为 JSON',415)
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=150000:
                raise Problem('请求内容为空或过大',413)
            body=json.loads(self.rfile.read(length))
            if not isinstance(body,dict):
                raise ValueError()
            return body
        except (ValueError,UnicodeError):
            raise Problem('JSON 请求格式无效')

    def do_GET(self):
        try:
            self.check_host()
            parsed=urlparse(self.path)
            with connect() as c:
                if parsed.path=='/api/session':
                    user=self.user(c,False)
                    self.send({'initialized':bool(c.execute('SELECT 1 FROM users LIMIT 1').fetchone()),'user':{k:user[k] for k in ['id','name','username','role']} if user else None})
                    return
                if parsed.path.startswith('/api/'):
                    user=self.user(c)
                    if parsed.path=='/api/state':
                        self.send(snapshot(c,user)); return
                    if parsed.path=='/api/export':
                        admin(user)
                        rev,s=load_state(c)
                        self.send({'schema':1,'exported_at':now(),'revision':rev,'state':s,'members':public_users(c)},filename='book-film-club.json'); return
                    if parsed.path=='/api/report.csv':
                        admin(user)
                        _,s=load_state(c)
                        cycle=find(s['cycles'],parse_qs(parsed.query).get('cycle',[''])[0])
                        out=io.StringIO(); writer=csv.writer(out)
                        writer.writerow(['成员','状态','完成作品','总作品','评价数','参与讨论','完成时间'])
                        members={u['id']:u['name'] for u in public_users(c)}
                        for mid in cycle['participants']:
                            r=report(s,cycle,mid)
                            name=members[mid]
                            if name[:1] in '=+-@': name="'"+name
                            writer.writerow([name,r['status'],r['completed'],r['total'],r['reviewed'],r['discussion'],r['completed_at'] or ''])
                        self.send(('\ufeff'+out.getvalue()).encode(),ctype='text/csv; charset=utf-8',filename='cycle-report.csv'); return
                    raise Problem('接口不存在',404)
            path=(ROOT/'dist'/parsed.path.lstrip('/')).resolve()
            if not path.is_relative_to((ROOT/'dist').resolve()):
                raise Problem('路径无效',403)
            if not path.is_file(): path=ROOT/'dist'/'index.html'
            if not path.is_file():
                self.send(b'Run npm run build first.',503,ctype='text/plain'); return
            self.send(path.read_bytes(),ctype=mimetypes.guess_type(path)[0] or 'application/octet-stream')
        except Problem as e:
            self.send({'error':e.message},e.status)

    def do_POST(self):
        try:
            p=self.body()
            path=urlparse(self.path).path
            if path in ['/api/login','/api/setup']:
                self.authenticate(path,p); return
            with connect() as c:
                user=self.user(c)
                if path=='/api/logout':
                    raw=http.cookies.SimpleCookie(self.headers.get('Cookie',''))['club_session'].value
                    c.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(raw.encode()).hexdigest(),))
                    c.commit()
                    self.send({'ok':True},cookie=''); return
                if path=='/api/credential':
                    if not credential_matches(p.get('current',''),user['secret']):
                        raise Problem('当前密码不正确',403)
                    c.execute('UPDATE users SET secret=? WHERE id=?',(credential_hash(p.get('credential')),user['id']))
                    c.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
                    token=issue_session(c,user['id'])
                    c.commit()
                    self.send({'ok':True},cookie=token); return
                if path=='/api/metadata/search':
                    result=metadata.search(p.get('kind'),p.get('query'))
                    self.send({'results':result}); return
                if path=='/api/metadata/detail':
                    item=metadata.detail(p.get('provider'),p.get('source_id'))
                    token=uid()
                    c.execute('DELETE FROM metadata_cache WHERE expires<?',(time.time(),))
                    c.execute('INSERT INTO metadata_cache VALUES(?,?,?,?)',(token,user['id'],json.dumps(item),time.time()+3600))
                    c.commit()
                    self.send({'item':item,'token':token}); return
                if path=='/api/ai':
                    admin(user)
                    _,s=load_state(c)
                    task=p.get('task')
                    if task=='themes': context={'existing':[t['title'] for t in s['themes']],'brief':text(p.get('brief',''),2000,False)}
                    elif task=='analyze': context=find(s['themes'],p.get('theme_id'))
                    elif task=='recap':
                        cy=find(s['cycles'],p.get('cycle_id'))
                        context={'theme':cy['theme'],'direction':cy['direction'],'reviews':[{'body':r['body'],'rating':r['rating']} for r in s['reviews'] if r['cycle_id']==cy['id']]}
                    else: raise Problem('AI 任务无效')
                    self.send({'draft':ai.generate(task,context)}); return
                if path!='/api/action': raise Problem('接口不存在',404)
                c.execute('BEGIN IMMEDIATE')
                rev,s=load_state(c)
                if p.get('revision')!=rev:
                    raise Problem('其他成员刚刚更新了内容，已刷新数据，请重新提交',409)
                action=p.get('action'); args=p.get('payload',{})
                if not isinstance(args,dict): raise Problem('操作内容无效')
                if action=='member.add':
                    admin(user)
                    added=create_user(c,args)
                    result={'id':added['id']}
                    s['audit'].append(dict(id=uid(),action=action,user_id=user['id'],target_id=added['id'],at=now()))
                elif action=='member.toggle':
                    admin(user)
                    member=find(public_users(c),args.get('id'))
                    if member['role']=='admin': raise Problem('不能停用管理员')
                    c.execute('UPDATE users SET disabled=? WHERE id=?',(not member['disabled'],member['id']))
                    c.execute('DELETE FROM sessions WHERE user_id=?',(member['id'],))
                    s['audit'].append(dict(id=uid(),action=action,user_id=user['id'],target_id=member['id'],at=now()))
                    result=None
                elif action=='metadata.import':
                    row=c.execute('SELECT body FROM metadata_cache WHERE token=? AND user_id=? AND expires>?',(args.get('token'),user['id'],time.time())).fetchone()
                    if not row: raise Problem('刮削预览已过期，请重新搜索',409)
                    item=json.loads(row['body'])
                    old=find(s['works'],args['id']) if args.get('id') else None
                    duplicate=next((w for w in s['works'] if w.get('provider')==item['provider'] and w.get('source_id')==item['source_id']),None)
                    if duplicate and (not old or duplicate['id']!=old['id']):
                        raise Problem('此来源作品已入库，请打开已有作品刷新资料',409)
                    if old: admin(user)
                    # Refresh always preserves manual fields unless the user explicitly clears protection.
                    if old and old.get('manual_edited_at'):
                        raise Problem('此作品有手工修订，请使用预览资料手工合并，避免覆盖',409)
                    item.update(id=old['id'] if old else None,metadata_status='confirmed')
                    result=mutate(s,user,'work.save',item,public_users(c))
                    result.update(provider=item['provider'],source_id=item['source_id'],scraped_at=item['scraped_at'],extra=item.get('extra',{}))
                    c.execute('DELETE FROM metadata_cache WHERE token=?',(args.get('token'),))
                else:
                    result=mutate(s,user,action,args,public_users(c))
                save_state(c,rev,s)
                c.commit()
                self.send({'result':result,**snapshot(c,user)})
        except Problem as e:
            self.send({'error':e.message},e.status)
        except sqlite3.IntegrityError:
            self.send({'error':'账号或记录已经存在'},409)
        except (TypeError,KeyError,ValueError):
            self.send({'error':'提交的数据不完整或格式不正确'},400)
        except Exception as e:
            print('Request failed:',type(e).__name__,flush=True)
            self.send({'error':'服务暂时无法完成操作，已有数据未被修改'},500)

    def authenticate(self,path,p):
        with connect() as c:
            c.execute('BEGIN IMMEDIATE')
            ip=self.client_address[0]
            attempt=c.execute('SELECT * FROM attempts WHERE ip=?',(ip,)).fetchone()
            if attempt and attempt['until']>time.time() and attempt['count']>=10:
                raise Problem('尝试次数过多，请 15 分钟后重试',429)
            if path=='/api/setup':
                if c.execute('SELECT 1 FROM users LIMIT 1').fetchone(): raise Problem('小组已创建，请登录',409)
                user=create_user(c,p,'admin')
                rev,s=load_state(c); s['group']=text(p.get('group','书影小组'),80)
                s['themes']=seed_themes()
                save_state(c,rev,s)
            else:
                row=c.execute('SELECT * FROM users WHERE username=?',(str(p.get('username','')).lower(),)).fetchone()
                if not row or row['disabled'] or not credential_matches(p.get('credential',''),row['secret']):
                    count=attempt['count']+1 if attempt and attempt['until']>time.time() else 1
                    until=attempt['until'] if attempt and attempt['until']>time.time() else time.time()+900
                    c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(ip,count,until))
                    c.commit()
                    raise Problem('账号或密码不正确',401)
                user=dict(row)
            c.execute('DELETE FROM attempts WHERE ip=?',(ip,))
            token=issue_session(c,user['id'])
            c.commit()
            self.send({'ok':True},cookie=token)


if __name__=='__main__':
    init_db()
    print('Book Film Club: http://127.0.0.1:%s'%PORT,flush=True)
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
