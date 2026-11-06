"""Personal, read-only WeRead access. No shared metadata cache or write APIs."""
import datetime
import hashlib
import json
import re
import time

import weread
from domain import Problem,TZ,text
from metadata import fetch_json

ALLOWED={'/shelf/sync','/book/info','/book/getprogress','/book/bookmarklist','/review/list/mine','/user/notebooks'}


def credential(value):
    if not isinstance(value,str):raise Problem('请输入本人微信读书 Key')
    value=value.strip()
    if not value.startswith('wrk-') or not 12<=len(value)<=512 or any(not 33<=ord(c)<=126 for c in value):
        raise Problem('Key 格式不正确，请重新复制')
    return value


def call(key,api_name,**params):
    if api_name not in ALLOWED:raise Problem('不支持的微信读书操作')
    data=fetch_json('https://i.weread.qq.com/api/agent/gateway',
        {'Authorization':'Bearer '+key,'Content-Type':'application/json'},
        {'api_name':api_name,'skill_version':weread.SKILL_VERSION,**params})
    if not isinstance(data,dict):raise Problem('微信读书返回格式无效',502)
    if 'upgrade_info' in data:raise Problem('微信读书要求更新接口版本，本次同步已停止',503)
    if data.get('errcode',0)!=0:raise Problem('微信读书授权暂不可用，请检查 Key 或稍后重试',502)
    return data


def timestamp(value):
    if value in (None,'',0,'0'):return ''
    try:return datetime.datetime.fromtimestamp(float(value),TZ).isoformat(timespec='seconds')
    except (ValueError,TypeError,OverflowError,OSError):return ''


def book_id(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,150}',value):raise Problem('书籍编号无效')
    return value


def nonnegative(value):
    try:
        if isinstance(value,bool):raise ValueError()
        number=int(value or 0)
        if number<0:raise ValueError()
        return number
    except (ValueError,TypeError,OverflowError):raise Problem('微信读书数值格式异常',502)


def check_book(record,expected):
    if record.get('bookId') is not None and str(record['bookId'])!=expected:
        raise Problem('微信读书返回了不同书籍，旧记录保持不变',502)


def shelf(key):
    raw=call(key,'/shelf/sync')
    if not all(isinstance(raw.get(k,[]),list) for k in ('books','albums','archive')):raise Problem('微信读书书架格式异常',502)
    if len(raw.get('books',[]))>10000:raise Problem('书架条目过多，请稍后分批同步',413)
    books=[]
    for item in raw.get('books',[]):
        if not isinstance(item,dict) or not item.get('bookId') or not item.get('title'):continue
        key_id=book_id(str(item['bookId']))
        books.append({'id':key_id,'title':str(item['title'])[:400],'creator':str(item.get('author') or '')[:300],
            'image':weread.safe_link(item.get('cover'),True),'finished':item.get('finishReading') in (1,'1'),
            'last_read':timestamp(item.get('readUpdateTime')),'private':item.get('secret') in (1,'1'),
            'source_url':weread.safe_link(item.get('readerLink')) or weread.safe_link(item.get('deepLink'))})
    ids={b['id'] for b in books}
    folders=[{'name':str(a.get('name',''))[:100],'book_ids':[str(i) for i in a.get('bookIds',[]) if str(i) in ids]} for a in raw.get('archive',[]) if isinstance(a,dict) and isinstance(a.get('bookIds',[]),list)]
    return {'books':books,'folders':folders,'counts':{'ebooks':len(raw.get('books',[])),'audio':len(raw.get('albums',[])),
        'article_collections':int(bool(raw.get('mp'))),'total_entries':len(raw.get('books',[]))+len(raw.get('albums',[]))+int(bool(raw.get('mp')))}}


def progress(key,source_id):
    raw=call(key,'/book/getprogress',bookId=book_id(source_id))
    book=raw.get('book')
    if not isinstance(book,dict):raise Problem('这本书暂时没有可同步的阅读进度',404)
    check_book(book,source_id)
    value=book.get('progress')
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not 0<=value<=100:raise Problem('阅读进度格式异常',502)
    finished=timestamp(book.get('finishTime')) if value==100 else ''
    return {'progress':int(value),'finished_at':finished[:10],'read_at':timestamp(book.get('updateTime')),
            'read_seconds':nonnegative(book.get('recordReadingTime'))}


def book_info(key,source_id):
    raw=call(key,'/book/info',bookId=book_id(source_id));check_book(raw,source_id)
    if str(raw.get('bookId',''))!=source_id or not raw.get('title'):raise Problem('书籍资料格式异常',502)
    # Return bibliographic fields only, never account or reading statistics.
    book=weread.book_item(raw)
    return {k:book[k] for k in ('title','creator','description','image','year','source_url','provider','kind')}


def notebooks(key):
    books={};cursor=None;seen=set();started=time.monotonic()
    for _ in range(100):
        if time.monotonic()-started>45:raise Problem('笔记目录较大，本次未同步完成，请稍后再试',504)
        page=call(key,'/user/notebooks',count=100,**({'lastSort':cursor} if cursor is not None else {}))
        rows=page.get('books',[])
        if not isinstance(rows,list):raise Problem('笔记目录格式异常',502)
        for r in rows:
            b=r.get('book',{}) if isinstance(r,dict) else {}
            if not isinstance(b,dict) or not b.get('title'):continue
            source_id=book_id(str(r.get('bookId') or b.get('bookId') or ''))
            books[source_id]={'id':source_id,'title':str(b['title'])[:400],'creator':str(b.get('author') or '')[:300],
                'image':weread.safe_link(b.get('cover'),True),'note_count':sum(nonnegative(r.get(k)) for k in ('reviewCount','noteCount','bookmarkCount')),
                'highlight_count':nonnegative(r.get('noteCount')),'thought_count':nonnegative(r.get('reviewCount')),'bookmark_count':nonnegative(r.get('bookmarkCount'))}
        if page.get('hasMore') not in (1,'1',True):break
        nxt=rows[-1].get('sort') if rows else None
        if not isinstance(nxt,(str,int)) or str(nxt) in seen:raise Problem('笔记目录分页异常，旧目录保持不变',502)
        seen.add(str(nxt));cursor=nxt
    else:raise Problem('笔记目录超过同步上限，旧目录保持不变',413)
    return sorted(books.values(),key=lambda b:(-b['note_count'],b['id']))


def notes(key,source_id):
    source_id=book_id(source_id)
    highlights=call(key,'/book/bookmarklist',bookId=source_id)
    if not isinstance(highlights.get('updated',[]),list):raise Problem('划线格式异常',502)
    chapter_rows=highlights.get('chapters',[])
    if not isinstance(chapter_rows,list):raise Problem('章节格式异常',502)
    if isinstance(highlights.get('book'),dict):check_book(highlights['book'],source_id)
    chapters={str(c.get('chapterUid')):str(c.get('title') or '') for c in chapter_rows if isinstance(c,dict)}
    order={str(c.get('chapterUid')):nonnegative(c.get('chapterIdx',i)) for i,c in enumerate(chapter_rows) if isinstance(c,dict)}
    rows={}
    for h in highlights.get('updated',[]):
        if not isinstance(h,dict) or h.get('type') in (0,'0') or not h.get('markText'):continue
        check_book(h,source_id)
        key_id='highlight:'+str(h.get('bookmarkId') or hashlib.sha256((str(h.get('chapterUid'))+str(h.get('range'))+str(h['markText'])).encode()).hexdigest())
        rows[key_id]={'id':key_id,'type':'highlight','body':str(h['markText']),'quote':'','chapter':chapters.get(str(h.get('chapterUid')),''),
            'chapter_id':str(h.get('chapterUid') or ''),'chapter_order':order.get(str(h.get('chapterUid')),100000),'position':str(h.get('range') or ''),'created':timestamp(h.get('createTime'))}
    cursor=0;seen=set();started=time.monotonic()
    for _ in range(100):
        if time.monotonic()-started>45:raise Problem('笔记较多，本次未同步完成，旧笔记保持不变',504)
        page=call(key,'/review/list/mine',bookid=source_id,synckey=cursor,count=100)
        if not isinstance(page.get('reviews',[]),list):raise Problem('个人想法格式异常',502)
        for entry in page.get('reviews',[]):
            r=entry.get('review',{}) if isinstance(entry,dict) else {}
            if not isinstance(r,dict) or not r.get('reviewId') or not r.get('content'):continue
            check_book(r,source_id)
            key_id='thought:'+str(r['reviewId'])
            rows[key_id]={'id':key_id,'type':'thought','body':str(r['content']),'quote':str(r.get('abstract') or ''),
                'chapter':str(r.get('chapterName') or chapters.get(str(r.get('chapterUid')),'') or ''),
                'chapter_id':str(r.get('chapterUid') or ''),'chapter_order':nonnegative(r.get('chapterIdx',order.get(str(r.get('chapterUid')),100000))),'position':str(r.get('range') or ''),'created':timestamp(r.get('createTime'))}
        if page.get('hasMore') not in (1,'1',True):break
        next_cursor=page.get('synckey')
        if not isinstance(next_cursor,(int,str)) or next_cursor==cursor or str(next_cursor) in seen:raise Problem('笔记分页异常，旧笔记保持不变',502)
        seen.add(str(next_cursor));cursor=next_cursor
    else:raise Problem('笔记量较大，未完成同步，旧笔记保持不变',413)
    ordered=sorted(rows.values(),key=note_order)
    if len(ordered)>10000 or len(json.dumps(ordered,ensure_ascii=False))>2_000_000:raise Problem('单本笔记超过本次同步上限',413)
    version=hashlib.sha256(json.dumps(ordered,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    return {'notes':ordered,'version':version}


def note_order(row):
    match=re.match(r'\d+',str(row.get('position') or ''))
    return (row.get('chapter_order',100000),int(match[0]) if match else 0,row.get('created',''),row['id'])
