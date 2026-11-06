"""Activities shared by a person into a WeChat conversation. No access to chats."""
import datetime
import hashlib
import secrets
import time
import os
from pathlib import Path
import sqlite3
from contextlib import closing

import ai
import wechat_login
from companion import generation_slot
from domain import Problem, TZ, boolean, choice, integer, now, text

SCHEMA = """
CREATE TABLE IF NOT EXISTS gathering(
 id TEXT PRIMARY KEY, shop TEXT NOT NULL REFERENCES shop(id), creator TEXT NOT NULL, request_id TEXT NOT NULL,
 kind TEXT NOT NULL, audience TEXT NOT NULL, title TEXT NOT NULL, starts TEXT NOT NULL,
 place TEXT NOT NULL, capacity INTEGER NOT NULL, description TEXT NOT NULL, blurb TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'open', recap TEXT NOT NULL DEFAULT '', rev INTEGER NOT NULL DEFAULT 1,
 notes_rev INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, UNIQUE(creator,request_id));
CREATE INDEX IF NOT EXISTS shop_gatherings ON gathering(shop,created);
CREATE TABLE IF NOT EXISTS gathering_session(
 digest TEXT PRIMARY KEY, event TEXT NOT NULL REFERENCES gathering(id), person TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS gathering_seat(
 event TEXT NOT NULL REFERENCES gathering(id), person TEXT NOT NULL, nickname TEXT NOT NULL, joined TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', allow_recap INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(event,person));
CREATE TABLE IF NOT EXISTS attempts(ip TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS gathering_repeat(event TEXT PRIMARY KEY REFERENCES gathering(id),
 source TEXT NOT NULL REFERENCES gathering(id));
"""

def store_rights(db, key, user):
    from bookstores import rights, shop_row
    return rights(db, shop_row(db, key), user)


def manage(db, key, user):
    if not user: raise Problem('请先微信登录',401)
    if not store_rights(db,key,user)[1]: raise Problem('只有这家店的店主可以操作',403)


def event(db, key):
    row=db.execute('SELECT * FROM gathering WHERE id=?',(text(key,48),)).fetchone()
    if not row: raise Problem('没有找到这张卡片',404)
    return row


def attendee(db, key, token):
    if not token: return None
    if len(token)>128: raise Problem('请重新微信登录',401)
    row=db.execute('SELECT person FROM gathering_session WHERE digest=? AND event=? AND expires>?',
        (wechat_login.digest(token),key,time.time())).fetchone()
    if not row: raise Problem('活动登录已过期，请重新登录',401)
    return row['person']


def access(db, key, user, token):
    person=attendee(db,key,token)
    if not person and not user: raise Problem('请先微信登录',401)
    row=event(db,key)
    member,host=store_rights(db,row['shop'],user)
    if row['audience']=='circle' and not (member or host): raise Problem('这是本店圈友的活动，请先以圈内成员身份登录',403)
    return row,person,host


def login(db,data,user,ip):
    key=text(data.get('event'),48)
    code=text(data.get('code'),256)
    wechat_login.reserve_attempt(db,ip)
    app,secret=wechat_login.configuration()
    subject=wechat_login.exchange(app,secret,code)
    row=event(db,key)
    if row['audience']=='circle' and not any(store_rights(db,row['shop'],user)):
        raise Problem('这是圈友专场，请使用已入圈的成员身份登录',403)
    token=secrets.token_urlsafe(32)
    # RSVP identity is identical for a guest who later becomes a bound club member.
    person=hashlib.sha256((app+':bookstore:'+subject).encode()).hexdigest()
    db.execute('DELETE FROM gathering_session WHERE expires<=?',(time.time(),))
    db.execute('INSERT INTO gathering_session VALUES(?,?,?,?)',(wechat_login.digest(token),key,person,int(time.time())+43200))
    return {'event_token':token}


def fields(data):
    kind=choice(data.get('kind'),('meet','notice'))
    title=text(data.get('title'),70)
    starts,place,cap='', '',0
    if kind=='meet':
        starts=text(data.get('starts'),16)
        try: stamp=datetime.datetime.strptime(starts,'%Y-%m-%d %H:%M')
        except ValueError: raise Problem('请选择有效的活动日期和时间')
        if stamp.strftime('%Y-%m-%d %H:%M')!=starts: raise Problem('日期格式有误')
        place=text(data.get('place'),160)
        cap=integer(data.get('capacity'),1,500)
    return dict(kind=kind,audience=choice(data.get('audience'),('readers','circle')),title=title,
                starts=starts,place=place,capacity=cap,description=text(data.get('description',''),4000,False),
                blurb=text(data.get('blurb',''),350,False))


def count(db,key):
    return db.execute('SELECT COUNT(*) FROM gathering_seat WHERE event=?',(key,)).fetchone()[0]


def shop_list(db,key,user):
    member,host=store_rights(db,key,user)
    return [dict(r) for r in db.execute("""SELECT id,kind,title,starts,state,audience FROM gathering
      WHERE shop=? AND state!='deleted' AND (audience='readers' OR ?) ORDER BY created DESC,rowid DESC LIMIT 50""",(key,member or host))]


def member_person(user, club_db=None):
    """Resolve only the authenticated member's binding; never accept a client person ID."""
    if not user: raise Problem('请先微信登录',401)
    source=os.environ.get('BOOKSTORES_IDENTITY_DB') or club_db
    if not source: raise Problem('活动身份暂时无法读取，请稍后重试',503)
    app=os.environ.get('WECHAT_APP_ID','')
    if not app: raise Problem('微信登录尚待配置',503)
    try:
        with closing(sqlite3.connect(Path(source).resolve().as_uri()+'?mode=ro',uri=True)) as club:
            row=club.execute('SELECT subject FROM wx_identities WHERE app_id=? AND user_id=?',(app,user['id'])).fetchone()
    except sqlite3.Error:
        raise Problem('活动身份暂时无法读取，请稍后重试',503)
    return hashlib.sha256((app+':bookstore:'+row[0]).encode()).hexdigest() if row else ''


def mine(db,user,person):
    from bookstores import STORES
    if not user: raise Problem('请先微信登录',401)
    if not person:return {'events':[]}
    # Recheck circle membership even for an old RSVP. Deleted cards are never discoverable.
    found=db.execute("""SELECT g.id,g.shop,g.title,g.starts,g.place,g.state,g.audience,g.recap
      FROM gathering g JOIN gathering_seat s ON s.event=g.id
      WHERE s.person=? AND g.kind='meet' AND g.state!='deleted'
      ORDER BY g.starts DESC,g.id DESC""",(person,)).fetchall()
    events=[]
    for row in found:
        if row['shop'] not in STORES:continue
        if row['audience']=='circle' and not any(store_rights(db,row['shop'],user)):continue
        events.append({k:row[k] for k in ('id','shop','title','starts','place','state','audience')})
        events[-1].update(shop_name=STORES[row['shop']]['name'],has_recap=bool(row['recap']))
    return {'events':events}


def detail(db,key,user,token):
    from bookstores import STORES
    row,person,host=access(db,key,user,token)
    if row['state']=='deleted':
        # Retain the identity of shared links, without exposing removed content or attendees.
        return {'id':key,'shop':row['shop'],'kind':row['kind'],'audience':row['audience'],
                'state':'deleted','title':'活动已删除' if row['kind']=='meet' else '告示已删除','can_manage':False}
    out={k:row[k] for k in ('id','shop','kind','audience','title','starts','place','capacity','description','blurb','state','recap','rev')}
    out.update(shop_name=STORES[row['shop']]['name'],can_manage=host,can_delete=host,booked=count(db,key),joined=False,ai_ready=host and ai.configured())
    out['signup_open']=row['kind']=='meet' and row['state']=='open' and row['starts']>now()[:16].replace('T',' ')
    if person:
        seat=db.execute('SELECT note,allow_recap,nickname FROM gathering_seat WHERE event=? AND person=?',(key,person)).fetchone()
        if seat:out.update(joined=True,my_note=seat['note'],allow_recap=bool(seat['allow_recap']),nickname=seat['nickname'])
    if host:
        out['roster']=[r['nickname'] for r in db.execute('SELECT nickname FROM gathering_seat WHERE event=? ORDER BY joined',(key,))]
        out['notes_rev']=row['notes_rev']
        out['shared_note_count']=db.execute("SELECT count(*) FROM gathering_seat WHERE event=? AND allow_recap=1 AND note<>''",(key,)).fetchone()[0]
    return out


def check_version(row,data):
    if data.get('rev')!=row['rev']: raise Problem('这张卡片刚更新过，请刷新后再试',409)


def write(db,op,data,user,token):
    if op in ('gather-new','gather-repeat'):
        shop=text(data.get('shop'),64);manage(db,shop,user)
        req=text(data.get('request_id'),80)
        prior=db.execute('SELECT id,shop FROM gathering WHERE creator=? AND request_id=?',(user['id'],req)).fetchone()
        source=None
        if op=='gather-repeat':
            source=event(db,data.get('source'))
            if source['shop']!=shop:raise Problem('只能在原书店再约一场',403)
            if source['kind']!='meet' or source['state']=='deleted':raise Problem('这场活动不能再次发起',409)
            if data.get('kind')!='meet' or data.get('audience')!=source['audience']:
                raise Problem('再约一场沿用原活动的可见范围',400)
        if prior:
            repeat=db.execute('SELECT source FROM gathering_repeat WHERE event=?',(prior['id'],)).fetchone()
            if prior['shop']!=shop or (source['id'] if source else None)!=(repeat['source'] if repeat else None):
                raise Problem('此邀约已提交，请返回活动列表查看',409)
            return {'id':prior['id']}
        if source and data.get('source_rev')!=source['rev']:raise Problem('原活动刚更新过，请重新载入后再约',409)
        f=fields(data)
        if f['kind']=='meet' and f['starts']<=now()[:16].replace('T',' '): raise Problem('请选择未来的活动时间')
        key=secrets.token_hex(12)
        db.execute("""INSERT INTO gathering(id,shop,creator,request_id,kind,audience,title,starts,place,capacity,description,blurb,created)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",(key,shop,user['id'],req,*f.values(),now()))
        if source:db.execute('INSERT INTO gathering_repeat VALUES(?,?)',(key,source['id']))
        return {'id':key}
    key=text(data.get('event'),48)
    row,person,host=access(db,key,user,token)
    if row['state']=='deleted': raise Problem('这张卡片已删除',410)
    if op in ('gather-sign','gather-leave','gather-note'):
        if not person: raise Problem('请先验证活动报名身份',401)
        if row['kind']!='meet':raise Problem('告示无需报名')
        seat=db.execute('SELECT 1 FROM gathering_seat WHERE event=? AND person=?',(key,person)).fetchone()
        if op=='gather-note':
            if not seat or row['state']!='ended': raise Problem('散场后，报名读者可以留下感想',403)
            if row['recap']: raise Problem('本场回顾已发布',409)
            db.execute('UPDATE gathering_seat SET note=?,allow_recap=? WHERE event=? AND person=?',
                (text(data.get('note',''),800,False),boolean(data.get('allow_recap',False)),key,person))
            db.execute('UPDATE gathering SET notes_rev=notes_rev+1 WHERE id=?',(key,))
        elif row['state']!='open' or row['starts']<=now()[:16].replace('T',' '):
            raise Problem('报名已截止',409)
        elif op=='gather-leave':
            db.execute('DELETE FROM gathering_seat WHERE event=? AND person=?',(key,person))
        elif not seat:
            if count(db,key)>=row['capacity']:raise Problem('这场已经满员了',409)
            db.execute('INSERT INTO gathering_seat(event,person,nickname,joined) VALUES(?,?,?,?)',
                (key,person,text(data.get('nickname'),32),now()))
        return {'ok':True}
    if not host:raise Problem('只有这家店的店主可以操作',403)
    check_version(row,data)
    if op=='gather-delete':
        db.execute("UPDATE gathering SET state='deleted',rev=rev+1 WHERE id=?",(key,))
    elif op=='gather-save-recap':
        if row['kind']!='meet' or row['state']!='ended': raise Problem('散场后才能发布回顾',409)
        if data.get('notes_rev')!=row['notes_rev']:raise Problem('读者留言已更新，请重新核对后发布',409)
        db.execute('UPDATE gathering SET recap=?,rev=rev+1 WHERE id=?',(text(data.get('recap'),6000),key))
    elif row['state']!='open':raise Problem('这张卡片已结束',409)
    elif op=='gather-edit':
        f=fields(data)
        if f['kind']=='meet' and f['starts']!=row['starts'] and f['starts']<=now()[:16].replace('T',' '): raise Problem('改期请选择未来时间')
        if (f['kind'],f['audience'])!=(row['kind'],row['audience']): raise Problem('已发布卡片不能更改类型或可见范围')
        if f['kind']=='meet' and f['capacity']<count(db,key):raise Problem('名额不能少于已报名人数',409)
        db.execute('UPDATE gathering SET title=?,starts=?,place=?,capacity=?,description=?,blurb=?,rev=rev+1 WHERE id=?',
            (f['title'],f['starts'],f['place'],f['capacity'],f['description'],f['blurb'],key))
    elif op in ('gather-end','gather-cancel'):
        state='ended' if op=='gather-end' else 'cancelled'
        db.execute('UPDATE gathering SET state=?,rev=rev+1 WHERE id=?',(state,key))
    else:raise Problem('接口不存在',404)
    return {'ok':True}


def writing_profile(db,shop):
    from bookstores import STORES,shop_row
    store=STORES[shop]
    return {**{k:store.get(k,'') for k in ('name','interest','lead')},'voice':shop_row(db,shop)['voice']}


def draft(db,op,data,user):
    from bookstores import STORES
    if op=='gather-invite-ai':
        shop=text(data.get('shop'),64);manage(db,shop,user)
        f=fields(data)
        # Dates, seats and address are rendered from the event so a shared card survives rescheduling.
        ctx={k:f[k] for k in ('kind','title','description')}
        ctx['store']=STORES[shop]['name']
        ctx['store_profile']=writing_profile(db,shop)
        with generation_slot(user['id']):return ai.generate('bookstore_invite',ctx)
    if not user: raise Problem('请先微信登录',401)
    row=event(db,data.get('event'));manage(db,row['shop'],user)
    if row['kind']!='meet' or row['state']!='ended':raise Problem('散场后再写回顾',409)
    notes=text(data.get('notes',''),3000,False)
    messages=[r['note'] for r in db.execute("SELECT note FROM gathering_seat WHERE event=? AND allow_recap=1 AND note<>'' ORDER BY joined LIMIT 24",(row['id'],))]
    if not notes and not messages: raise Problem('先写几句现场记录，或等书友留下愿意分享的感想')
    ctx=dict(title=row['title'],store=STORES[row['shop']]['name'],store_profile=writing_profile(db,row['shop']),host_notes=notes,shared_notes=messages)
    with generation_slot(user['id']):result=ai.generate('bookstore_recap',ctx)
    return {**result,'rev':row['rev'],'notes_rev':row['notes_rev']}


def handle(db,handler,op,q,user,body,ip):
    if body is None:
        if op!='gather-detail':raise Problem('接口不存在',404)
        return detail(db,q.get('event',[''])[0],user,handler.headers.get('X-Book-Event-Token',''))
    if op=='gather-login':
        result=login(db,body,user,ip)
    elif op in ('gather-invite-ai','gather-recap-ai'):
        # Never hold a SQLite write transaction across a model call.
        return draft(db,op,body,user)
    else:
        db.execute('BEGIN IMMEDIATE')
        result=write(db,op,body,user,handler.headers.get('X-Book-Event-Token',''))
    db.commit()
    return result
