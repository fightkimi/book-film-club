"""Independent bookstore directory and discussions. Circle data is isolated from the club snapshot."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time

import bookstore_events as gatherings
import personal_reading
import theme_ideation
from companion import generation_slot
from domain import Problem, admin, boolean, choice, now, text

CATALOG = json.loads(Path(__file__).with_name('bookstore_catalog.json').read_text())
STORES = {s['id']: s for s in CATALOG}
CITIES = {s['city'] for s in CATALOG}
LEGACY_CITY = '成都'
ALL_CITIES = '全国'
SCHEMA = """
CREATE TABLE IF NOT EXISTS shop(id TEXT PRIMARY KEY, owner TEXT, pinned TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS shop_manager(shop TEXT NOT NULL REFERENCES shop(id), reader TEXT NOT NULL,
 PRIMARY KEY(shop,reader));
CREATE TABLE IF NOT EXISTS membership(shop TEXT NOT NULL REFERENCES shop(id), reader TEXT NOT NULL,
 PRIMARY KEY(shop,reader));
CREATE TABLE IF NOT EXISTS pass(digest TEXT PRIMARY KEY, shop TEXT NOT NULL REFERENCES shop(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS claim(shop TEXT NOT NULL REFERENCES shop(id), reader TEXT NOT NULL, name TEXT NOT NULL,
 PRIMARY KEY(shop,reader));
CREATE TABLE IF NOT EXISTS arrival(id INTEGER PRIMARY KEY, shop TEXT NOT NULL REFERENCES shop(id), body TEXT NOT NULL, published TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS post(id INTEGER PRIMARY KEY, shop TEXT REFERENCES shop(id), scope TEXT NOT NULL CHECK(scope IN ('city','circle')),
 author TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, published TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS feed ON post(scope,shop,id);
CREATE TABLE IF NOT EXISTS reply(id INTEGER PRIMARY KEY, post INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
 author TEXT NOT NULL, body TEXT NOT NULL, published TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS conversation ON reply(post,id);
CREATE TABLE IF NOT EXISTS shop_follow(shop TEXT NOT NULL REFERENCES shop(id), reader TEXT NOT NULL,
 created TEXT NOT NULL, PRIMARY KEY(reader,shop));
CREATE TABLE IF NOT EXISTS book_recommendation(
 post INTEGER PRIMARY KEY REFERENCES post(id), reader TEXT NOT NULL, request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, book_id TEXT NOT NULL, title TEXT NOT NULL, creator TEXT NOT NULL,
 UNIQUE(reader,request_id));
"""


def connect(club_db=None):
    path = Path(os.environ.get('BOOKSTORES_DB', Path(club_db or os.environ.get('CLUB_DB', Path(__file__).parent/'data'/'club.sqlite3')).with_name('bookstores.sqlite3')))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


def initialize(db):
    db.executescript(SCHEMA + gatherings.SCHEMA + personal_reading.SCHEMA)
    db.execute('BEGIN IMMEDIATE')
    shop_columns={r[1] for r in db.execute('PRAGMA table_info(shop)')}
    if 'voice' not in shop_columns:
        db.execute("ALTER TABLE shop ADD COLUMN voice TEXT NOT NULL DEFAULT ''")
    if 'voice_rev' not in shop_columns:
        db.execute('ALTER TABLE shop ADD COLUMN voice_rev INTEGER NOT NULL DEFAULT 0')
    if 'city' not in {r[1] for r in db.execute('PRAGMA table_info(post)')}:
        # Every topic written before city selection was posted from the Chengdu edition.
        db.execute("ALTER TABLE post ADD COLUMN city TEXT NOT NULL DEFAULT '成都'")
    db.execute('CREATE INDEX IF NOT EXISTS city_feed ON post(scope,city,id)')
    if 'spoiler' not in {r[1] for r in db.execute('PRAGMA table_info(post)')}:
        db.execute('ALTER TABLE post ADD COLUMN spoiler INTEGER NOT NULL DEFAULT 0')
    db.executemany('INSERT OR IGNORE INTO shop(id) VALUES(?)', [(key,) for key in STORES])
    db.commit()


def require_user(user):
    if not user:
        raise Problem('请先微信登录', 401)
    return user['id']


def shop_row(db, key):
    if not isinstance(key, str) or key not in STORES:
        raise Problem('没有找到这家书店', 404)
    return db.execute('SELECT * FROM shop WHERE id=?', (key,)).fetchone()


def rights(db, shop, user):
    if not user:
        return False, False
    local_manager = shop['owner']==user['id'] or bool(db.execute('SELECT 1 FROM shop_manager WHERE shop=? AND reader=?',(shop['id'],user['id'])).fetchone())
    manage = user['role']=='admin' or local_manager
    member = local_manager or bool(db.execute('SELECT 1 FROM membership WHERE shop=? AND reader=?', (shop['id'],user['id'])).fetchone())
    return member, manage


def rows(cursor):
    return [dict(r) for r in cursor]


def followed_shops(db, reader):
    return [r[0] for r in db.execute('SELECT shop FROM shop_follow WHERE reader=? ORDER BY created DESC,shop',(reader,))]


def following(db, reader, before=''):
    keys=followed_shops(db,reader)
    cursor=text(before,160,False)
    # This feed is intentionally public-only, even if the reader also belongs to a private circle.
    updates=rows(db.execute("""WITH followed AS (SELECT shop FROM shop_follow WHERE reader=?), updates AS (
      SELECT p.published||'|p|'||printf('%020d',p.id) AS cursor,'post' AS type,p.id,p.shop,p.title,
             CASE WHEN p.spoiler=1 THEN '含剧透，点开再看' ELSE substr(p.body,1,160) END AS body,p.published,
             p.kind AS kind,'' AS state FROM post p JOIN followed f ON p.shop=f.shop WHERE p.scope='city'
      UNION ALL
      SELECT a.published||'|a|'||printf('%020d',a.id),'arrival',a.id,a.shop,'书店上新',a.body,a.published,'',''
             FROM arrival a JOIN followed f ON a.shop=f.shop
      UNION ALL
      SELECT g.created||'|g|'||g.id,'gathering',g.id,g.shop,g.title,g.starts,g.created,g.kind,g.state
             FROM gathering g JOIN followed f ON g.shop=f.shop WHERE g.audience='readers' AND g.state!='deleted'
    ) SELECT * FROM updates WHERE (?='' OR cursor<?) ORDER BY cursor DESC LIMIT 31""",(reader,cursor,cursor)))
    more=len(updates)>30
    updates=updates[:30]
    for item in updates:
        item.update(shop_name=STORES[item['shop']]['name'],city=STORES[item['shop']]['city'])
    return {'stores':[STORES[key] for key in keys], 'updates':updates,
            'next':updates[-1]['cursor'] if more else ''}


def recommendation_request(data):
    payload={'book_id':text(data.get('book_id'),200),'body':text(data.get('body'),140),
             'shop':data.get('shop') or None,'city':choice(data.get('city',ALL_CITIES),[*CITIES,ALL_CITIES])}
    if payload['shop'] not in (None,*STORES):raise Problem('没有找到这家书店',404)
    if payload['shop']:
        city=STORES[payload['shop']]['city']
        if payload['city'] not in (city,ALL_CITIES):raise Problem('书店与所选城市不符')
        payload['city']=city
    req=text(data.get('request_id'),80)
    digest=hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return req,digest,payload


def prior_recommendation(db, reader, req, fingerprint):
    row=db.execute('SELECT post,fingerprint FROM book_recommendation WHERE reader=? AND request_id=?',(reader,req)).fetchone()
    if row:
        if row['fingerprint']!=fingerprint:raise Problem('上次荐书已发布，请返回树洞查看后再写一条',409)
        return {'id':row['post']}


def library_books(handler, club_db, include_media=False):
    if hasattr(handler,'book_sources'):
        result=handler.book_sources()
    else:
        import booklists
        with sqlite3.connect(Path(club_db).resolve().as_uri()+'?mode=ro',uri=True) as club:
            state=json.loads(club.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
        result=booklists.group(state)
    # Only bibliographic fields cross this boundary; member shelf names and private notes never do.
    books=[]
    for item in result.get('books',[]):
        if not item.get('id') or not item.get('title'):continue
        key=('work:'+str(item['workId'])) if item.get('workId') else ('shelf:'+str(item['id']))
        books.append({'id':key,'title':str(item['title'])[:400],'creator':str(item.get('author') or '')[:300]})
        if include_media:books[-1].update(image=str(item.get('cover') or '')[:2000],personalUpload=bool(item.get('personalUpload')))
    return {'books':books,'partial':bool(result.get('unavailable'))}


def private_snapshot(handler,club_db):
    if hasattr(handler,'personal_snapshot'):return handler.personal_snapshot()
    with sqlite3.connect(Path(club_db).resolve().as_uri()+'?mode=ro',uri=True) as club:
        return json.loads(club.execute('SELECT body FROM state WHERE id=1').fetchone()[0])


def book_metadata(handler,source_id):
    if hasattr(handler,'book_detail'):return handler.book_detail(source_id)
    import metadata
    return metadata.detail('weread',source_id)


def index_value(value):
    try:
        n=int(str(value))
        if not 0<n<2**63: raise ValueError()
        return n
    except (ValueError, TypeError):
        raise Problem('记录编号无效')


def read(db, operation, q, user):
    require_user(user)
    if operation=='catalog':
        city=choice(q.get('city',LEGACY_CITY), [*CITIES,ALL_CITIES])
        return {'stores':CATALOG if city==ALL_CITIES else [s for s in CATALOG if s['city']==city],
                'followed':followed_shops(db,user['id'])}
    if operation=='following':
        return following(db,user['id'],q.get('before',''))
    if operation=='shop':
        s=shop_row(db,q.get('shop')); member,manage=rights(db,s,user)
        out=dict(store=STORES[s['id']], signed=bool(user), member=member, manage=manage, claimed=bool(s['owner']), pinned=s['pinned'] if member else '',
                 arrivals=rows(db.execute('SELECT body,published FROM arrival WHERE shop=? ORDER BY id DESC LIMIT 24',(s['id'],))))
        out['gatherings']=gatherings.shop_list(db,s['id'],user)
        out['event_ai_ready']=manage and gatherings.ai.configured()
        if manage:out.update(voice=s['voice'],voice_rev=s['voice_rev'])
        out['following']=s['id'] in followed_shops(db,user['id'])
        if user:
            out['pending']=bool(db.execute('SELECT 1 FROM claim WHERE shop=? AND reader=?',(s['id'],user['id'])).fetchone())
            if user['role']=='admin':
                out['claims']=rows(db.execute('SELECT reader,name FROM claim WHERE shop=?',(s['id'],)))
        return out
    if operation=='topic':
        p=db.execute('SELECT * FROM post WHERE id=?',(index_value(q.get('post')),)).fetchone()
        if not p: raise Problem('话题不存在',404)
        if p['scope']=='circle':
            require_user(user)
            if not rights(db,shop_row(db,p['shop']),user)[0]: raise Problem('请先加入本店圈子',403)
        book=db.execute('SELECT book_id AS id,title,creator FROM book_recommendation WHERE post=?',(p['id'],)).fetchone()
        assisted=bool(db.execute("SELECT 1 FROM personal_share WHERE post=? AND digest<>''",(p['id'],)).fetchone())
        return dict(post={k:p[k] for k in ('id','scope','shop','city','title','kind','body','published','spoiler')} | {'shop_name':STORES[p['shop']]['name'] if p['shop'] else '', 'book':dict(book) if book else None,'ai_assisted':assisted},
                    replies=rows(db.execute('SELECT id,body,published FROM reply WHERE post=? AND id>? ORDER BY id LIMIT 40',
                                     (p['id'],index_value(q['after']) if q.get('after') else 0))))
    if operation!='feed': raise Problem('接口不存在',404)
    scope=choice(q.get('scope'),('city','circle'))
    key=None
    if scope=='circle':
        require_user(user)
        s=shop_row(db,q.get('shop'));key=s['id']
        if not rights(db,s,user)[0]: raise Problem('请先加入本店圈子',403)
    city = choice(q.get('city', LEGACY_CITY), [*CITIES, ALL_CITIES]) if scope=='city' else ALL_CITIES
    before=index_value(q['before']) if q.get('before') else 2**63-1
    posts=rows(db.execute("""SELECT p.id,p.city,p.shop,p.title,p.kind,p.spoiler,
      CASE WHEN p.spoiler=1 THEN '含剧透，点开再看' ELSE substr(p.body,1,160) END AS body,
      p.published,(SELECT count(*) FROM reply WHERE post=p.id) AS replies
      FROM post p WHERE scope=? AND (? IS NULL OR shop=?) AND (? IS NULL OR p.city=?) AND p.id<? ORDER BY p.id DESC LIMIT 30""",
      (scope,key,key, None if city==ALL_CITIES else city,city,before)))
    for p in posts:
        p['shop_name']=STORES[p['shop']]['name'] if p['shop'] else ''
    return {'posts':posts}


def write(db, op, data, user, book=None):
    reader=require_user(user)
    if op=='recommend':
        req,fingerprint,payload=recommendation_request(data)
        prior=prior_recommendation(db,reader,req,fingerprint)
        if prior:return prior
        if not book or book['id']!=payload['book_id']:raise Problem('请从书影库重新选一本书',400)
        title=text(book['title'],400);creator=text(book.get('creator',''),300,False)
        new=db.execute("INSERT INTO post(shop,scope,author,kind,title,body,published,city) VALUES(?,'city',?,'一句话荐书',?,?,?,?)",
                       (payload['shop'],reader,title,payload['body'],now(),payload['city']))
        db.execute('INSERT INTO book_recommendation VALUES(?,?,?,?,?,?,?)',
                   (new.lastrowid,reader,req,fingerprint,book['id'],title,creator))
        return {'id':new.lastrowid}
    if op=='reply':
        pid=index_value(data.get('post')); read(db,'topic',{'post':pid},user)
        db.execute('INSERT INTO reply(post,author,body,published) VALUES(?,?,?,?)',(pid,reader,text(data.get('body'),600),now()))
        return {'ok':True}
    if op=='post':
        scope=choice(data.get('scope'),('city','circle'))
        key=data.get('shop') or None
        if key or scope=='circle':
            s=shop_row(db,key)
            if scope=='circle' and not rights(db,s,user)[0]: raise Problem('请先加入本店圈子',403)
        city=choice(data.get('city',STORES[key]['city'] if key else LEGACY_CITY),[*CITIES,ALL_CITIES])
        if key:
            if city not in (ALL_CITIES,STORES[key]['city']): raise Problem('书店与所选城市不符')
            city=STORES[key]['city']
        kind=choice(data.get('kind'),('逛店手记','问本地人','读书笔记','书评','影评'))
        new=db.execute('INSERT INTO post(shop,scope,author,kind,title,body,published,city,spoiler) VALUES(?,?,?,?,?,?,?,?,?)',
            (key,scope,reader,kind,text(data.get('title'),60),text(data.get('body'),4000 if kind in ('读书笔记','书评','影评') else 1200),now(),city,boolean(data.get('spoiler',False))))
        return {'id':new.lastrowid}
    s=shop_row(db,data.get('shop'));key=s['id'];member,manage=rights(db,s,user)
    if op=='follow':
        enabled=boolean(data.get('enabled'))
        if enabled:db.execute('INSERT OR IGNORE INTO shop_follow VALUES(?,?,?)',(key,reader,now()))
        else:db.execute('DELETE FROM shop_follow WHERE shop=? AND reader=?',(key,reader))
        return {'following':enabled}
    if op=='join':
        code=text(data.get('code'),64).upper()
        if member: return {'joined':True}
        used=db.execute('DELETE FROM pass WHERE digest=? AND shop=? AND expires>?',(hashlib.sha256(code.encode()).hexdigest(),key,int(time.time())))
        if used.rowcount!=1: raise Problem('此码无效，请向本店重新领码',400)
        db.execute('INSERT INTO membership VALUES(?,?)',(key,reader))
        return {'joined':True}
    if op=='claim':
        if s['owner'] or manage: raise Problem('此店已有负责人或你已能管理',409)
        db.execute('INSERT OR IGNORE INTO claim VALUES(?,?,?)',(key,reader,user['name']))
        return {'ok':True}
    if op=='approve':
        admin(user)
        target=text(data.get('reader'),64)
        if not db.execute('SELECT 1 FROM claim WHERE shop=? AND reader=?',(key,target)).fetchone():raise Problem('申请不存在',404)
        db.execute('UPDATE shop SET owner=? WHERE id=?',(target,key))
        db.execute('DELETE FROM claim WHERE shop=?',(key,))
        return {'ok':True}
    if not manage: raise Problem('仅本店店主或管理员可操作',403)
    if op=='voice':
        if data.get('voice_rev')!=s['voice_rev']:raise Problem('书店语气已更新，请刷新后再保存',409)
        db.execute('UPDATE shop SET voice=?,voice_rev=voice_rev+1 WHERE id=?',(text(data.get('body',''),600,False),key))
        return {'ok':True}
    if op=='issue':
        code=secrets.token_hex(6).upper()
        db.execute('DELETE FROM pass WHERE expires<=?',(int(time.time()),))
        db.execute('INSERT INTO pass VALUES(?,?,?)',(hashlib.sha256(code.encode()).hexdigest(),key,int(time.time())+86400))
        return {'code':code}
    if op=='arrival':
        db.execute('INSERT INTO arrival(shop,body,published) VALUES(?,?,?)',(key,text(data.get('body'),400),now()))
    elif op=='pin':
        db.execute('UPDATE shop SET pinned=? WHERE id=?',(text(data.get('body'),400,False),key))
    else: raise Problem('接口不存在',404)
    return {'ok':True}


def serve(handler, path, query, user, body=None, club_db=None, ip='local'):
    operation=path.removeprefix('/api/bookstores/')
    db=connect(club_db)
    try:
        if operation=='activity-theme-ai' and body is not None:
            reader=require_user(user)
            state=private_snapshot(handler,club_db)
            context=theme_ideation.context(body,state)
            with generation_slot(reader):draft=gatherings.ai.generate('activity_theme',context)
            theme_ideation.ensure_novel(draft,state,context)
            result={'draft':draft}
        elif operation.startswith('personal/'):
            result=personal_reading.handle(db,operation.removeprefix('personal/'),{k:v[0] for k,v in query.items()},body,user,
                load_state=lambda:private_snapshot(handler,club_db),load_books=lambda:library_books(handler,club_db,include_media=True),
                load_book_detail=lambda source_id:book_metadata(handler,source_id))
        elif operation=='recommend-books' and body is None:
            require_user(user)
            result=library_books(handler,club_db)
        elif operation=='recommend' and body is not None:
            reader=require_user(user)
            req,fingerprint,payload=recommendation_request(body)
            result=prior_recommendation(db,reader,req,fingerprint)
            if not result:
                # Source lookup may use a loopback service; never hold the write lock during it.
                book=next((b for b in library_books(handler,club_db)['books'] if b['id']==payload['book_id']),None)
                db.execute('BEGIN IMMEDIATE')
                result=write(db,operation,body,user,book=book)
                db.commit()
        elif operation.startswith('gather-'):
            result=gatherings.handle(db,handler,operation,query,user,body,ip)
        elif body is None:
            result=read(db,operation,{k:v[0] for k,v in query.items()},user)
        else:
            db.execute('BEGIN IMMEDIATE')
            result=write(db,operation,body,user)
            db.commit()
        handler.send(result)
    finally:
        db.close()
