"""Private reading records. Every lookup is scoped to the authenticated member."""
from contextlib import contextmanager
import datetime
import hashlib
import json
import math
import secrets
import threading
import time

import ai
import personal_vault as vault
import personal_weread as wr
import movie_catalog
from companion import generation_slot
from domain import Problem,boolean,choice,integer,now,text

SCHEMA="""
CREATE TABLE IF NOT EXISTS personal_connection(
 reader TEXT PRIMARY KEY, encrypted BLOB NOT NULL, generation TEXT NOT NULL,
 synced_at TEXT NOT NULL, shelf_meta TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS personal_wr_book(
 reader TEXT NOT NULL, source_id TEXT NOT NULL, generation TEXT NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY(reader,source_id));
CREATE TABLE IF NOT EXISTS personal_wr_notebook(
 reader TEXT NOT NULL,source_id TEXT NOT NULL,generation TEXT NOT NULL,body TEXT NOT NULL,
 PRIMARY KEY(reader,source_id));
CREATE TABLE IF NOT EXISTS personal_item(
 id TEXT PRIMARY KEY, reader TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT NOT NULL,
 kind TEXT NOT NULL, title TEXT NOT NULL, creator TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'wish', progress INTEGER NOT NULL DEFAULT 0, tracking TEXT NOT NULL DEFAULT 'manual',
 finished_at TEXT NOT NULL DEFAULT '', rating REAL, reflection TEXT NOT NULL DEFAULT '', spoiler INTEGER NOT NULL DEFAULT 0,
 remote_progress INTEGER, remote_finished TEXT NOT NULL DEFAULT '', wr_synced TEXT NOT NULL DEFAULT '',
 current_log TEXT NOT NULL DEFAULT '', notes_version TEXT NOT NULL DEFAULT '', rev INTEGER NOT NULL DEFAULT 1,
 created TEXT NOT NULL, updated TEXT NOT NULL, UNIQUE(reader,source,source_id),UNIQUE(reader,id));
CREATE INDEX IF NOT EXISTS personal_items ON personal_item(reader,kind,status,updated);
CREATE TABLE IF NOT EXISTS personal_plan(
 reader TEXT NOT NULL,item TEXT NOT NULL,month TEXT NOT NULL,created TEXT NOT NULL,
 PRIMARY KEY(reader,item,month),FOREIGN KEY(reader,item) REFERENCES personal_item(reader,id));
CREATE TABLE IF NOT EXISTS personal_log(
 id TEXT PRIMARY KEY,reader TEXT NOT NULL,item TEXT NOT NULL,finished_at TEXT NOT NULL,
 rating REAL,reflection TEXT NOT NULL,spoiler INTEGER NOT NULL,created TEXT NOT NULL,
 FOREIGN KEY(reader,item) REFERENCES personal_item(reader,id));
CREATE TABLE IF NOT EXISTS personal_note(
 reader TEXT NOT NULL,item TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,
 PRIMARY KEY(reader,item,id),FOREIGN KEY(reader,item) REFERENCES personal_item(reader,id));
CREATE TABLE IF NOT EXISTS personal_digest(
 id TEXT PRIMARY KEY,reader TEXT NOT NULL,item TEXT NOT NULL,request_id TEXT NOT NULL,
 content TEXT NOT NULL,sources TEXT NOT NULL,source_version TEXT NOT NULL,request_hash TEXT NOT NULL,
 edited TEXT NOT NULL DEFAULT '',rev INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,
 UNIQUE(reader,request_id),FOREIGN KEY(reader,item) REFERENCES personal_item(reader,id));
CREATE TABLE IF NOT EXISTS personal_share(
 reader TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,post INTEGER NOT NULL REFERENCES post(id),digest TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(reader,request_id));
CREATE TABLE IF NOT EXISTS personal_migration(reader TEXT PRIMARY KEY,created TEXT NOT NULL);
"""

_lock=threading.Lock()
_active=set()
_starts={}


@contextmanager
def sync_slot(reader,kind='sync'):
    key=(reader,kind);stamp=time.monotonic()
    with _lock:
        for old in list(_starts):
            _starts[old]=[v for v in _starts[old] if stamp-v<60]
            if not _starts[old]:del _starts[old]
        if key in _active:raise Problem('上一条同步还在进行，请稍候',429)
        if len(_starts.get(key,[]))>=12:raise Problem('同步较频繁，请一分钟后再试',429)
        _starts.setdefault(key,[]).append(stamp);_active.add(key)
    try:yield
    finally:
        with _lock:_active.discard(key)


def month(value):
    value=text(value,7)
    try:
        parsed=datetime.datetime.strptime(value,'%Y-%m')
        if parsed.strftime('%Y-%m')!=value or not 1900<=parsed.year<=2100:raise ValueError()
    except ValueError:raise Problem('请选择有效月份')
    return value


def date(value,optional=True):
    value=text(value or '',10,not optional)
    if not value:return ''
    try:
        parsed=datetime.date.fromisoformat(value)
        if parsed.isoformat()!=value or not 1900<=parsed.year<=2100:raise ValueError()
    except ValueError:raise Problem('日期格式无效')
    return value


def item(db,reader,key):
    row=db.execute('SELECT * FROM personal_item WHERE reader=? AND id=?',(reader,text(key,80))).fetchone()
    if not row:raise Problem('没有找到这条个人记录',404)
    return row


def connection(db,reader,required=False):
    row=db.execute('SELECT * FROM personal_connection WHERE reader=?',(reader,)).fetchone()
    if not row and required:raise Problem('请先在“我的”连接微信读书',409)
    return row


def status(db,reader):
    row=connection(db,reader)
    return {'connected':bool(row),'generation':row['generation'] if row else '',
            'synced_at':row['synced_at'] if row else '',**(json.loads(row['shelf_meta']) if row else {}),'ai_ready':ai.configured()}


def assert_generation(db,reader,generation):
    row=connection(db,reader)
    if (row['generation'] if row else '')!=generation:raise Problem('个人连接已改变，请重新打开页面',409)


def store_shelf(db,reader,generation,data):
    db.execute('DELETE FROM personal_wr_book WHERE reader=?',(reader,))
    db.executemany('INSERT INTO personal_wr_book VALUES(?,?,?,?)',[(reader,b['id'],generation,json.dumps(b,ensure_ascii=False)) for b in data['books']])


def clear_remote_notes(db,reader):
    affected=[r[0] for r in db.execute("SELECT DISTINCT item FROM personal_note WHERE reader=? AND id NOT LIKE 'manual:%'",(reader,))]
    db.execute("DELETE FROM personal_note WHERE reader=? AND id NOT LIKE 'manual:%'",(reader,))
    for key in affected:refresh_note_version(db,reader,key)


def bind(db,reader,data):
    key=wr.credential(data.get('key'))
    expected=text(data.get('generation',''),80,False)
    with sync_slot(reader,'connect'):
        shelf=wr.shelf(key)
        encrypted=vault.seal(reader,key)
        generation=secrets.token_hex(16)
        db.execute('BEGIN IMMEDIATE')
        assert_generation(db,reader,expected)
        # A changed credential may belong to a different WeRead account. Never merge its raw notes.
        clear_remote_notes(db,reader)
        db.execute('DELETE FROM personal_wr_notebook WHERE reader=?',(reader,))
        db.execute('INSERT OR REPLACE INTO personal_connection VALUES(?,?,?,?,?)',
                   (reader,encrypted,generation,now(),json.dumps({'counts':shelf['counts'],'folders':shelf['folders']},ensure_ascii=False)))
        store_shelf(db,reader,generation,shelf);db.commit()
    return status(db,reader)


def unbind(db,reader,data):
    db.execute('BEGIN IMMEDIATE');assert_generation(db,reader,text(data.get('generation',''),80,False))
    db.execute('DELETE FROM personal_connection WHERE reader=?',(reader,))
    db.execute('DELETE FROM personal_wr_book WHERE reader=?',(reader,))
    db.execute('DELETE FROM personal_wr_notebook WHERE reader=?',(reader,))
    clear_remote_notes(db,reader)
    db.commit();return status(db,reader)


def sync_shelf(db,reader):
    row=connection(db,reader,True);generation=row['generation'];key=vault.open_key(reader,row['encrypted'])
    with sync_slot(reader):
        shelf=wr.shelf(key)
        db.execute('BEGIN IMMEDIATE');assert_generation(db,reader,generation)
        store_shelf(db,reader,generation,shelf)
        db.execute('UPDATE personal_connection SET synced_at=?,shelf_meta=? WHERE reader=?',
                   (now(),json.dumps({'counts':shelf['counts'],'folders':shelf['folders']},ensure_ascii=False),reader));db.commit()
    return status(db,reader)


def ensure_item(db,reader,source,source_id,book):
    old=db.execute('SELECT * FROM personal_item WHERE reader=? AND source=? AND source_id=?',(reader,source,source_id)).fetchone()
    if old:
        if source=='manual' and any(old[k]!=book.get(k,'') for k in ('kind','title','creator')):
            raise Problem('这次添加已完成，请返回记录列表后再添加',409)
        return old
    key=secrets.token_hex(12)
    kind=choice(book.get('kind','book'),('book','movie'))
    db.execute('INSERT INTO personal_item(id,reader,source,source_id,kind,title,creator,image,tracking,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        (key,reader,source,source_id,kind,text(book.get('title'),400),text(book.get('creator',''),300,False),
         str(book.get('image') or '')[:2000],'weread' if source=='weread' else 'manual',now(),now()))
    return item(db,reader,key)


def sync_notebooks(db,reader):
    row=connection(db,reader,True);generation=row['generation'];key=vault.open_key(reader,row['encrypted'])
    with sync_slot(reader):
        books=wr.notebooks(key)
        db.execute('BEGIN IMMEDIATE');assert_generation(db,reader,generation)
        db.execute('DELETE FROM personal_wr_notebook WHERE reader=?',(reader,))
        db.executemany('INSERT INTO personal_wr_notebook VALUES(?,?,?,?)',[(reader,b['id'],generation,json.dumps(b,ensure_ascii=False)) for b in books])
        db.commit()
    return {'count':len(books)}


def finish_log(db,row,finished,rating,reflection,spoiler):
    if row['current_log']:
        db.execute('UPDATE personal_log SET finished_at=?,rating=?,reflection=?,spoiler=? WHERE reader=? AND id=?',
                   (finished,rating,reflection,spoiler,row['reader'],row['current_log']))
        return row['current_log']
    key=secrets.token_hex(12)
    db.execute('INSERT INTO personal_log VALUES(?,?,?,?,?,?,?,?)',(key,row['reader'],row['id'],finished,rating,reflection,spoiler,now()))
    return key


def save_record(db,reader,data):
    row=item(db,reader,data.get('item'))
    if data.get('rev')!=row['rev']:raise Problem('记录刚更新过，请重新载入后再保存',409)
    tracking=choice(data.get('tracking','manual'),('manual','weread'))
    if tracking=='weread' and row['source']!='weread':raise Problem('这条记录不支持微信读书同步')
    record_status=choice(data.get('status'),('wish','reading','done','paused'))
    progress=integer(data.get('progress',0),0,100)
    finished=date(data.get('finished_at',''))
    if tracking=='manual' and record_status=='done' and finished>now()[:10]:raise Problem('完成日期不能晚于今天')
    if tracking=='weread':
        progress=row['remote_progress'] if row['remote_progress'] is not None else row['progress']
        finished=row['remote_finished'] if row['remote_progress'] is not None else row['finished_at']
        record_status='done' if progress==100 else 'reading' if progress>0 else 'wish'
    elif record_status=='done':progress=100;finished=finished or now()[:10]
    elif record_status=='wish':progress=0;finished=''
    else:
        if progress==100:raise Problem('读完或看完后请选择已完成')
        finished=''
    raw_rating=data.get('rating')
    if raw_rating in (None,''):rating=None
    else:
        try:rating=float(raw_rating)
        except (ValueError,TypeError):raise Problem('评分格式无效')
        if not math.isfinite(rating) or not 0.5<=rating<=5:raise Problem('评分范围为 0.5 至 5')
    reflection=text(data.get('reflection',''),12000,False);spoiler=boolean(data.get('spoiler',False))
    current=finish_log(db,row,finished,rating,reflection,spoiler) if record_status=='done' else ''
    db.execute('UPDATE personal_item SET status=?,progress=?,tracking=?,finished_at=?,rating=?,reflection=?,spoiler=?,current_log=?,rev=rev+1,updated=? WHERE reader=? AND id=?',
               (record_status,progress,tracking,finished,rating,reflection,spoiler,current,now(),reader,row['id']))
    return detail(db,reader,row['id'])


def detail(db,reader,key):
    row=item(db,reader,key)
    out=dict(row);out.pop('reader')
    plans=[r[0] for r in db.execute('SELECT month FROM personal_plan WHERE reader=? AND item=? ORDER BY month DESC',(reader,key))]
    history=[dict(r) for r in db.execute('SELECT id,finished_at,rating,reflection,spoiler FROM personal_log WHERE reader=? AND item=? ORDER BY created DESC',(reader,key))]
    count=db.execute('SELECT count(*) FROM personal_note WHERE reader=? AND item=?',(reader,key)).fetchone()[0]
    return {'item':out,'months':plans,'history':history,'note_count':count,'connection':status(db,reader)}


def listing(db,reader,q):
    current=month(q.get('month',now()[:7]));view=choice(q.get('view','month'),('month','wish','done'));kind=choice(q.get('kind',''),('','book','movie'))
    try:offset=integer(int(q.get('offset',0)),0,100000)
    except (ValueError,TypeError):raise Problem('分页参数无效')
    clause={'month':'EXISTS(SELECT 1 FROM personal_plan p WHERE p.reader=i.reader AND p.item=i.id AND p.month=?)',
            'wish':"i.status IN ('wish','reading','paused')",'done':"(i.status='done' OR EXISTS(SELECT 1 FROM personal_log l WHERE l.reader=i.reader AND l.item=i.id))"}[view]
    args=[reader,kind,kind]+([current] if view=='month' else [])
    rows=[dict(r) for r in db.execute('SELECT i.* FROM personal_item i WHERE i.reader=? AND (?=\'\' OR i.kind=?) AND '+clause+' ORDER BY i.updated DESC,i.id LIMIT 51 OFFSET ?',(*args,offset))]
    more=len(rows)>50;rows=rows[:50]
    for row in rows:
        row.pop('reader')
        reflection=row.pop('reflection')
        row['reflection_excerpt']=reflection[:120]
        row['reflection_long']=len(reflection)>120
        row['last_finished']=db.execute('SELECT max(finished_at) FROM personal_log WHERE reader=? AND item=?',(reader,row['id'])).fetchone()[0] or row['finished_at']
    totals={r['kind']:r['n'] for r in db.execute('SELECT kind,count(*) AS n FROM personal_log l JOIN personal_item i ON i.id=l.item AND i.reader=l.reader WHERE l.reader=? AND substr(l.finished_at,1,7)=? GROUP BY kind',(reader,current))}
    return {'items':rows,'next':offset+50 if more else None,'month':current,'completed':totals,'connection':status(db,reader)}


def note_source(row,load_state):
    if row['kind']!='book':return ''
    if row['source']=='weread':return row['source_id']
    key=row['source_id'];source=''
    if row['source']=='catalog' and key.startswith('shelf:') and not key.startswith('shelf:upload-'):source=key[6:]
    elif row['source']=='catalog' and key.startswith('work:') and load_state:
        work=next((w for w in load_state().get('works',[]) if w['id']==key[5:] and w['kind']=='book'),None)
        if work:source=work.get('source_id','') if work.get('provider')=='weread' else (work.get('extra') or {}).get('weread_id','')
    try:return wr.book_id(source) if source else ''
    except Problem:return ''


def sync_item(db,reader,data,notes_only=False,load_state=None):
    row=item(db,reader,data.get('item'))
    source_id=note_source(row,load_state) if notes_only else row['source_id'] if row['source']=='weread' else ''
    if not source_id:raise Problem('这条记录尚未关联微信读书，请从本人的微信读书书架选入对应版本')
    con=connection(db,reader,True);generation=con['generation'];key=vault.open_key(reader,con['encrypted'])
    with sync_slot(reader):
        result=wr.notes(key,source_id) if notes_only else wr.progress(key,source_id)
        db.execute('BEGIN IMMEDIATE');assert_generation(db,reader,generation)
        live=item(db,reader,row['id'])
        if notes_only:
            db.execute("DELETE FROM personal_note WHERE reader=? AND item=? AND id NOT LIKE 'manual:%'",(reader,row['id']))
            db.executemany('INSERT INTO personal_note VALUES(?,?,?,?)',[(reader,row['id'],n['id'],json.dumps(n,ensure_ascii=False)) for n in result['notes']])
            refresh_note_version(db,reader,row['id'])
        else:
            values={'remote_progress':result['progress'],'remote_finished':result['finished_at'],'wr_synced':now()}
            if live['tracking']=='weread':
                state='done' if result['progress']==100 else 'reading' if result['progress']>0 else 'wish'
                current=finish_log(db,live,result['finished_at'],live['rating'],live['reflection'],live['spoiler']) if state=='done' else ''
                values.update(status=state,progress=result['progress'],finished_at=result['finished_at'],current_log=current)
            db.execute('UPDATE personal_item SET '+','.join(k+'=?' for k in values)+',rev=rev+1,updated=? WHERE reader=? AND id=?',(*values.values(),now(),reader,row['id']))
        db.commit()
    return detail(db,reader,row['id'])


def note_rows(db,reader,key):
    return [json.loads(r[0]) for r in db.execute('SELECT body FROM personal_note WHERE reader=? AND item=? ORDER BY id',(reader,key))]


def refresh_note_version(db,reader,key):
    version=hashlib.sha256(json.dumps(note_rows(db,reader,key),sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    db.execute('UPDATE personal_item SET notes_version=?,rev=rev+1,updated=? WHERE reader=? AND id=? AND notes_version<>?',(version,now(),reader,key,version))
    return version


def read_notes(db,reader,key):
    row=item(db,reader,key)
    notes=sorted(note_rows(db,reader,key),key=wr.note_order)
    digests=[dict(r) for r in db.execute('SELECT id,created,source_version,rev FROM personal_digest WHERE reader=? AND item=? ORDER BY created DESC',(reader,key))]
    public_row=dict(row);public_row.pop('reader')
    return {'item':public_row,'notes':notes,'version':row['notes_version'],'digests':digests,'ai_ready':ai.configured(),'connected':bool(connection(db,reader))}


def digest_row(db,reader,key):
    row=db.execute('SELECT * FROM personal_digest WHERE reader=? AND id=?',(reader,text(key,80))).fetchone()
    if not row:raise Problem('没有找到这份个人整理',404)
    current=item(db,reader,row['item'])
    return {'id':row['id'],'item':row['item'],'title':current['title'],'content':json.loads(row['content']),
            'sources':json.loads(row['sources']),'edited':row['edited'],'rev':row['rev'],'created':row['created'],
            'stale':row['source_version']!=current['notes_version']}


def validate_digest(result,context):
    notes={n['id']:n for n in context['notes']}
    def sections(name,maximum):
        rows=result.get(name,[])
        if not isinstance(rows,list) or len(rows)>maximum:raise ValueError()
        out=[]
        for row in rows:
            evidence=row.get('evidence')
            if not isinstance(evidence,list) or not 1<=len(evidence)<=4:raise ValueError()
            verified=[]
            for source in evidence:
                key=source.get('note_id');quote=text(source.get('quote'),600)
                if key not in notes or not any(quote in notes[key].get(field,'') for field in ('body','quote')):raise ValueError()
                verified.append({'note_id':key,'quote':quote})
            out.append({'title':text(row.get('title',''),100,False),'text':text(row.get('text'),1800),'evidence':verified})
        return out
    return {'summary':text(result.get('summary'),3000),'themes':sections('themes',6),'insights':sections('insights',8),
            'questions':ai.strings(result.get('questions',[]),0,5)}


def validate_review_evidence(value,context):
    if not isinstance(value,list) or len(value)>8:raise ValueError()
    notes={n['id']:n for n in context.get('notes',[])};out=[]
    for entry in value:
        key=entry.get('note_id');quote=text(entry.get('quote'),600)
        if key not in notes or not any(quote in notes[key].get(k,'') for k in ('body','quote')):raise ValueError()
        out.append({'note_id':key,'quote':quote})
    return out


def review_draft(db,reader,data):
    row=item(db,reader,data.get('item'));body=text(data.get('body',''),12000,False)
    if not boolean(data.get('consent',False)):raise Problem('请确认使用当前文字和所选笔记生成 AI 草稿')
    ids=data.get('note_ids',[])
    if not isinstance(ids,list) or len(ids)>80 or not all(isinstance(v,str) for v in ids):raise Problem('每次最多选取 80 条笔记')
    if not body and not ids:raise Problem('先写一点自己的想法，或选几条笔记')
    if ids and data.get('notes_version')!=row['notes_version']:raise Problem('笔记有更新，请重新选择',409)
    notes={n['id']:n for n in note_rows(db,reader,row['id'])}
    if any(key not in notes for key in ids):raise Problem('所选笔记不存在')
    selected=[notes[key] for key in dict.fromkeys(ids)]
    if sum(len(n.get('body',''))+len(n.get('quote','')) for n in selected)>60000:raise Problem('所选笔记较长，请减少选择',413)
    context={'work':{'title':row['title'],'creator':row['creator'],'kind':row['kind']},'draft':body,'notes':selected,'personal':True,'spoiler':True}
    con=connection(db,reader);generation=con['generation'] if con else ''
    with generation_slot(reader):result=ai.generate('review',context)
    assert_generation(db,reader,generation)
    if ids and item(db,reader,row['id'])['notes_version']!=row['notes_version']:raise Problem('笔记在生成期间更新，请重新选择',409)
    return {'draft':result}


def generate_digest(db,reader,data):
    row=item(db,reader,data.get('item'));req=text(data.get('request_id'),80)
    ids=data.get('note_ids')
    if not isinstance(ids,list) or not 1<=len(ids)<=80 or not all(isinstance(x,str) for x in ids):raise Problem('每次请选择 1 至 80 条笔记；笔记较多时可以按章节整理')
    request_hash=hashlib.sha256(json.dumps([row['id'],sorted(set(ids)),data.get('notes_version')]).encode()).hexdigest()
    prior=db.execute('SELECT id,item,request_hash FROM personal_digest WHERE reader=? AND request_id=?',(reader,req)).fetchone()
    if prior:
        if prior['request_hash']!=request_hash:raise Problem('上次整理已完成，请查看后重新发起',409)
        return digest_row(db,reader,prior['id'])
    if not boolean(data.get('consent',False)):raise Problem('请确认使用所选笔记进行 AI 整理')
    if data.get('notes_version')!=row['notes_version']:raise Problem('原笔记已更新，请刷新后重新选择',409)
    found={n['id']:n for n in note_rows(db,reader,row['id'])}
    if any(key not in found for key in ids):raise Problem('所选笔记不存在，请重新选择')
    selected=[found[key] for key in dict.fromkeys(ids)]
    if sum(len(n.get('body',''))+len(n.get('quote','')) for n in selected)>60000:raise Problem('所选笔记较长，请按章节分次整理',413)
    con=connection(db,reader);generation=con['generation'] if con else ''
    context={'book':{'title':row['title'],'creator':row['creator'],'kind':row['kind']},'notes':selected,'scope':'仅所选个人笔记，不代表整本书原文'}
    with generation_slot(reader):
        result=ai.generate('personal_notes',context)
        db.execute('BEGIN IMMEDIATE');assert_generation(db,reader,generation)
        current=item(db,reader,row['id'])
        if current['notes_version']!=row['notes_version']:raise Problem('笔记在整理期间发生变化，请重新整理',409)
        key=secrets.token_hex(12)
        db.execute('INSERT INTO personal_digest(id,reader,item,request_id,content,sources,source_version,request_hash,created) VALUES(?,?,?,?,?,?,?,?,?)',
            (key,reader,row['id'],req,json.dumps(result,ensure_ascii=False),json.dumps(selected,ensure_ascii=False),row['notes_version'],request_hash,now()))
        db.commit()
    return digest_row(db,reader,key)


def seed_existing(db,reader,load_state):
    if db.execute('SELECT 1 FROM personal_migration WHERE reader=?',(reader,)).fetchone():return
    state=load_state();works={w['id']:w for w in state.get('works',[])}
    db.execute('BEGIN IMMEDIATE')
    if db.execute('SELECT 1 FROM personal_migration WHERE reader=?',(reader,)).fetchone():db.commit();return
    protected={r[0] for r in db.execute('SELECT id FROM personal_item WHERE reader=?',(reader,))}
    for shelf in state.get('shelves',[]):
        if shelf.get('user_id')!=reader or shelf.get('work_id') not in works:continue
        work=works[shelf['work_id']]
        row=ensure_item(db,reader,'catalog','work:'+work['id'],work)
        if row['id'] in protected:continue
        status_value=shelf.get('status','wish')
        if status_value not in ('wish','reading','done'):continue
        current=finish_log(db,row,'',None,'',False) if status_value=='done' else ''
        db.execute('UPDATE personal_item SET status=?,progress=?,current_log=? WHERE reader=? AND id=?',
            (status_value,100 if status_value=='done' else 0,current,reader,row['id']))
    # Each dated diary entry remains a distinct viewing, even when several map to one work.
    for journal in sorted(state.get('journals',[]),key=lambda j:str(j.get('date') or '')):
        if journal.get('user_id')!=reader:continue
        source_id='work:'+journal['work_id'] if journal.get('work_id') in works else 'legacy:'+journal['id']
        work=works.get(journal.get('work_id')) or {'title':journal['title'],'kind':journal['kind'],'creator':''}
        row=ensure_item(db,reader,'catalog',source_id,work)
        status_value=journal.get('status') if journal.get('status') in ('wish','reading','done') else row['status']
        try:finished=date(str(journal.get('date') or '')[:10]) if status_value=='done' else ''
        except Problem:finished=''
        reflection=str(journal.get('body') or '')[:12000];rating=journal.get('rating') or None
        current=''
        if status_value=='done':
            current='legacy:'+hashlib.sha256(str(journal['id']).encode()).hexdigest()[:24]
            db.execute('INSERT OR IGNORE INTO personal_log VALUES(?,?,?,?,?,?,?,?)',(current,reader,row['id'],finished,rating,reflection,True,now()))
            # Replace only the date-less placeholder made from the old shelf during this migration.
            if row['id'] not in protected and row['current_log'] and not row['finished_at'] and not row['reflection']:
                db.execute('DELETE FROM personal_log WHERE reader=? AND id=?',(reader,row['current_log']))
        if row['id'] in protected:continue
        db.execute('UPDATE personal_item SET status=?,progress=?,finished_at=?,rating=?,reflection=?,spoiler=1,current_log=? WHERE reader=? AND id=?',
            (status_value,100 if status_value=='done' else row['progress'],finished,rating,reflection,current,reader,row['id']))
    db.execute('INSERT INTO personal_migration VALUES(?,?)',(reader,now()));db.commit()


def book_view(work,key):
    return {k:work.get(k,'') for k in ('title','creator','description','image','year','source_url','provider')} | {'id':key,'kind':'book'}


def source_book_detail(db,reader,q,load_state,load_books,load_book_detail):
    source=choice(q.get('source'),('catalog','weread','notebooks'));key=text(q.get('id'),200)
    if source=='catalog':
        if key.startswith('work:'):
            work=next((w for w in load_state().get('works',[]) if 'work:'+w['id']==key and w['kind']=='book'),None)
            if not work:raise Problem('没有找到这本书',404)
            return {'book':book_view(work,key)}
        row=next((b for b in load_books()['books'] if b['id']==key),None)
        if not row:raise Problem('没有找到这本书',404)
        if row.get('personalUpload'):return {'book':{**row,'kind':'book','description':'','description_unavailable':True}}
        if not key.startswith('shelf:') or load_book_detail is None:raise Problem('书籍资料暂不可用',503)
        source_id=key.removeprefix('shelf:')
        work=load_book_detail(source_id)
        if work.get('source_id')!=source_id:raise Problem('书籍资料不匹配，请重新选择',502)
        return {'book':book_view(work,key)}
    saved=db.execute('SELECT body FROM personal_wr_book WHERE reader=? AND source_id=? UNION ALL SELECT body FROM personal_wr_notebook WHERE reader=? AND source_id=?',(reader,key,reader,key)).fetchone()
    if not saved:raise Problem('请先同步本人书架或笔记目录',404)
    con=connection(db,reader,True);generation=con['generation']
    with sync_slot(reader):
        book=wr.book_info(vault.open_key(reader,con['encrypted']),key)
        assert_generation(db,reader,generation)
    return {'book':{**json.loads(saved['body']),**book,'id':key}}


def handle(db,op,q,data,user,load_state,load_books,load_book_detail=None):
    from bookstores import require_user,write as write_post
    reader=require_user(user)
    if data is None:
        if op=='movie-catalog':return movie_catalog.listing(load_state().get('works',[]))
        if op=='movie-detail':return {'item':movie_catalog.detail(q.get('id'))}
        if op=='connection':return status(db,reader)
        if op=='book-detail':return source_book_detail(db,reader,q,load_state,load_books,load_book_detail)
        if op=='list':seed_existing(db,reader,load_state);return listing(db,reader,q)
        if op in ('item','notes'):
            row=item(db,reader,q.get('item'));supported=bool(note_source(row,load_state))
            result=detail(db,reader,row['id']) if op=='item' else read_notes(db,reader,row['id'])
            return {**result,'notes_supported':supported,'can_sync_notes':supported and bool(connection(db,reader))}
        if op=='digest':return digest_row(db,reader,q.get('id'))
        if op=='circles':
            from bookstores import STORES,rights
            return {'stores':[STORES[s['id']] for s in db.execute('SELECT * FROM shop') if rights(db,s,user)[0]]}
        if op=='sources':
            source=choice(q.get('source','weread'),('weread','notebooks','catalog'));kind=choice(q.get('kind','book'),('book','movie'))
            if source in ('weread','notebooks'):
                table='personal_wr_notebook' if source=='notebooks' else 'personal_wr_book'
                return {'items':[json.loads(r['body']) for r in db.execute('SELECT body FROM '+table+' WHERE reader=? ORDER BY source_id',(reader,))], 'connection':status(db,reader)}
            if kind=='book':
                local={'work:'+w['id']:w for w in load_state().get('works',[]) if w['kind']=='book'}
                return {'items':[{**b,**(book_view(local[b['id']],b['id']) if b['id'] in local else {'kind':'book'})} for b in load_books()['books']]}
            return {'items':movie_catalog.choices(load_state().get('works',[]),q.get('expanded')=='1')}
        raise Problem('接口不存在',404)
    if op=='connect':return bind(db,reader,data)
    if op=='disconnect':return unbind(db,reader,data)
    if op=='sync-shelf':return sync_shelf(db,reader)
    if op=='sync-notebooks':return sync_notebooks(db,reader)
    if op in ('sync-progress','sync-notes'):return sync_item(db,reader,data,notes_only=op=='sync-notes',load_state=load_state)
    if op=='digest-generate':return generate_digest(db,reader,data)
    if op=='review-draft':return review_draft(db,reader,data)
    book=None;source='';source_id=''
    if op=='add':
        source=choice(data.get('source'),('weread','catalog','manual','public'));source_id=text(data.get('source_id',''),200,False)
        kind=choice(data.get('kind','book'),('book','movie'))
        if source=='public':
            source_id=wr.book_id(source_id)
            if source_id.startswith('CB_') or load_book_detail is None:raise Problem('这本书没有可读取的公开资料')
            book=load_book_detail(source_id)
            if book.get('source_id')!=source_id or book.get('kind')!='book':raise Problem('书籍资料不匹配',502)
            source='catalog';source_id='shelf:'+source_id
        elif source=='weread':
            existing=db.execute('SELECT body FROM personal_wr_book WHERE reader=? AND source_id=? UNION ALL SELECT body FROM personal_wr_notebook WHERE reader=? AND source_id=?',(reader,source_id,reader,source_id)).fetchone()
            if not existing:raise Problem('请先同步个人书架，再选择这本书',404)
            book=json.loads(existing['body'])|{'kind':'book'}
        elif source=='catalog':
            choices=load_books()['books'] if kind=='book' else movie_catalog.choices(load_state().get('works',[]))
            if kind=='movie' and source_id.startswith('tmdb:'):
                local=next((b for b in choices if b['id'].startswith('work:') and b.get('provider')=='tmdb' and str(b.get('source_id'))==source_id[5:]),None)
                if local:source_id=local['id']
            book=next((b for b in choices if b['id']==source_id),None)
            # A detail link may predate a matching local import; keep its stable public ID valid.
            if not book and kind=='movie' and source_id.startswith('tmdb:'):book=movie_catalog.detail(source_id)
            if not book:raise Problem('请从书影库重新选择',404)
            book={**book,'kind':kind}
            if kind=='movie' and book.get('provider')=='tmdb':
                public_id='tmdb:'+str(book.get('source_id',''))
                existing=db.execute('SELECT source_id FROM personal_item WHERE reader=? AND source=\'catalog\' AND source_id IN (?,?) ORDER BY CASE WHEN source_id=? THEN 0 ELSE 1 END LIMIT 1',
                    (reader,source_id,public_id,source_id)).fetchone()
                if existing:source_id=existing['source_id']
        else:
            source_id=text(data.get('request_id'),80)
            book={'kind':kind,'title':text(data.get('title'),400),'creator':text(data.get('creator',''),300,False)}
    db.execute('BEGIN IMMEDIATE')
    try:
        if op=='add':
            row=ensure_item(db,reader,source,source_id,book)
            if data.get('month'):db.execute('INSERT OR IGNORE INTO personal_plan VALUES(?,?,?,?)',(reader,row['id'],month(data['month']),now()))
            result=detail(db,reader,row['id'])
        elif op=='save':result=save_record(db,reader,data)
        elif op=='plan':
            row=item(db,reader,data.get('item'));target=month(data.get('month'))
            if boolean(data.get('enabled',True)):db.execute('INSERT OR IGNORE INTO personal_plan VALUES(?,?,?,?)',(reader,row['id'],target,now()))
            else:db.execute('DELETE FROM personal_plan WHERE reader=? AND item=? AND month=?',(reader,row['id'],target))
            result=detail(db,reader,row['id'])
        elif op=='note-add':
            row=item(db,reader,data.get('item'));key='manual:'+secrets.token_hex(12)
            note={'id':key,'type':'thought','body':text(data.get('body'),12000),'quote':'','chapter':text(data.get('chapter',''),200,False),'created':now(),'chapter_id':'','position':''}
            db.execute('INSERT INTO personal_note VALUES(?,?,?,?)',(reader,row['id'],key,json.dumps(note,ensure_ascii=False)))
            refresh_note_version(db,reader,row['id']);result=read_notes(db,reader,row['id'])
        elif op=='digest-save':
            row=digest_row(db,reader,data.get('id'))
            if data.get('rev')!=row['rev']:raise Problem('整理内容已更新，请重新载入',409)
            db.execute('UPDATE personal_digest SET edited=?,rev=rev+1 WHERE reader=? AND id=?',(text(data.get('edited',''),20000,False),reader,row['id']))
            result=digest_row(db,reader,row['id'])
        elif op=='share':
            row=item(db,reader,data.get('item'));req=text(data.get('request_id'),80)
            digest=text(data.get('digest',''),80,False)
            if digest and digest_row(db,reader,digest)['item']!=row['id']:raise Problem('整理与作品不匹配')
            payload={'scope':choice(data.get('scope'),('city','circle')),'shop':data.get('shop') or None,'city':data.get('city','全国'),
                     'kind':'读书笔记' if digest else '书评' if row['kind']=='book' else '影评','title':text(data.get('title'),60),
                     'body':text(data.get('body'),4000),'spoiler':boolean(data.get('spoiler',False))}
            fingerprint=hashlib.sha256(json.dumps([row['id'],digest,payload],sort_keys=True,ensure_ascii=False).encode()).hexdigest()
            prior=db.execute('SELECT * FROM personal_share WHERE reader=? AND request_id=?',(reader,req)).fetchone()
            if prior:
                if prior['fingerprint']!=fingerprint:raise Problem('上次分享已发布，请先返回查看',409)
                result={'id':prior['post']}
            else:
                result=write_post(db,'post',payload,user)
                db.execute('INSERT INTO personal_share VALUES(?,?,?,?,?)',(reader,req,fingerprint,result['id'],digest))
        else:raise Problem('接口不存在',404)
        db.commit();return result
    except Exception:
        db.rollback();raise
