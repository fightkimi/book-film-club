"""Import personal records as inert text. Never fetch URLs from imported files."""
import csv
import hashlib
import io
import json
import math
import os
import re
from urllib.parse import urlsplit, urlencode
from domain import Problem, choice, boolean, find, text, now, uid, integer
from sources import read_json


def source_url(value, provider):
    value=text(value or '',2000,False)
    if not value:
        return ''
    parsed=urlsplit(value)
    allowed={'douban':('book.douban.com','movie.douban.com'), 'letterboxd':('letterboxd.com','www.letterboxd.com','boxd.it'), 'trakt':('trakt.tv',)}[provider]
    if parsed.scheme != 'https' or parsed.hostname not in allowed or '@' in parsed.netloc or parsed.port not in (None,443):
        raise Problem('来源链接不是此平台的 HTTPS 地址')
    return value


def rating(value, scale=5):
    if value in (None,''):
        return None
    if isinstance(value,str) and '★' in value:
        value=value.count('★')
    try:
        number=float(value)
    except (ValueError,TypeError):
        raise Problem('评分格式无效')
    if not math.isfinite(number) or not 0<=number<=scale:
        raise Problem('评分超出范围')
    return number * 5 / scale


def normalize(row, provider, status):
    if not isinstance(row,dict):
        raise Problem('每条记录必须为对象')
    if provider == 'trakt':
        movie=row.get('movie')
        if not isinstance(movie,dict):
            raise Problem('当前仅导入电影记录，缺少 movie 字段')
        ids=movie.get('ids',{})
        tmdb=str(ids.get('tmdb') or '')
        if tmdb and not re.fullmatch(r'\d{1,12}',tmdb): raise Problem('TMDB 编号无效')
        trakt_id=str(ids.get('trakt') or '')
        if not re.fullmatch(r'\d{1,12}',trakt_id): raise Problem('Trakt 编号无效')
        out=dict(title=text(movie.get('title'),200),kind='movie',year=str(movie.get('year') or '')[:40],
                 url='https://trakt.tv/movies/'+trakt_id,tmdb_id=tmdb,
                 date=text(row.get('watched_at') or row.get('last_watched_at') or row.get('listed_at') or row.get('rated_at') or '',40,False),
                 rating=rating(row.get('rating'),10),body=text(row.get('notes') or '',20000,False),status=status)
    else:
        title=row.get('title') or row.get('Name') or row.get('Title')
        url=source_url(row.get('url') or row.get('Letterboxd URI') or row.get('LetterboxdURI'),provider)
        rawstatus=row.get('status') or ''
        kind='book' if provider=='douban' and urlsplit(url).hostname=='book.douban.com' else 'movie'
        if provider=='douban':
            if not url: raise Problem('豆瓣记录必须提供来源链接')
            status={'读过':'done','看过':'done','在读':'reading','在看':'reading','想读':'wish','想看':'wish'}.get(rawstatus)
            if not status: raise Problem('只支持豆瓣书籍和电影的收藏状态')
        tmdb=text(row.get('tmdbID') or '',12,False)
        if tmdb and not re.fullmatch(r'\d{1,12}',tmdb): raise Problem('TMDB 编号无效')
        out=dict(title=text(title,200),kind=kind,year=text(row.get('Year') or '',40,False),url=url,tmdb_id=tmdb,
                 date=text(row.get('Watched Date') or row.get('WatchedDate') or row.get('date') or row.get('Date') or '',40,False),
                 rating=rating(row.get('rating') or row.get('Rating')),body=text(row.get('comment') or row.get('Review') or '',20000,False),status=status)
    # Stable across repeated imports; dated diary entries remain separate viewings.
    identity=out['url'] or (out['tmdb_id'] or out['title'])+'|'+out['year']
    dated=out['date'] if provider!='douban' and out['status']=='done' else ''
    out['source_key']=hashlib.sha256((provider+'|'+identity+'|'+dated).encode()).hexdigest()
    out['provider']=provider
    return out


def parse(payload, state):
    provider=choice(payload.get('provider'),['letterboxd','douban','trakt'])
    status=choice(payload.get('status','done'),['done','wish','reading','none'])
    content=text(payload.get('content'),100000)
    try:
        if provider=='trakt':
            rows=json.loads(content)
            if not isinstance(rows,list): raise Problem('请选择 Trakt 导出的电影 JSON 数组文件')
        else:
            rows=list(csv.DictReader(io.StringIO(content.lstrip('\ufeff')),strict=True))
    except (ValueError,csv.Error):
        raise Problem('文件格式无效，请使用 UTF-8 CSV 或 Trakt JSON')
    if not 1<=len(rows)<=200:
        raise Problem('每次支持 1～200 条记录，请拆分文件后导入')
    normalized, errors, keys=[],[],set()
    for i,row in enumerate(rows):
        try:
            item=normalize(row,provider,status)
            if item['source_key'] in keys:
                errors.append(dict(line=i+1,message='此文件内的重复记录已跳过')); continue
            keys.add(item['source_key'])
            matches=[w for w in state['works'] if w['kind']==item['kind'] and (
                (item['tmdb_id'] and w.get('provider')=='tmdb' and w.get('source_id')==item['tmdb_id']) or
                (item['url'] and w.get('source_url')==item['url']))]
            # A title match is merely a suggestion; the user must inspect it in preview.
            if not matches:
                matches=[w for w in state['works'] if w['kind']==item['kind'] and w['title'].casefold()==item['title'].casefold() and (not item['year'] or w.get('year')==item['year'])]
            item['suggested_work_id']=matches[0]['id'] if len(matches)==1 else ''
            normalized.append(item)
        except (Problem,TypeError,AttributeError,ValueError) as error:
            errors.append(dict(line=i+1,message=str(error) if isinstance(error,Problem) else '字段格式无效'))
    return dict(rows=normalized,errors=errors)


def trakt_page(payload):
    username=text(payload.get('username'),80)
    if not re.fullmatch(r'[A-Za-z0-9_-]+',username): raise Problem('Trakt 用户名格式无效')
    collection=choice(payload.get('collection','history'),['history','watchlist','ratings'])
    page=integer(payload.get('page',1),1,1000)
    client=os.environ.get('TRAKT_CLIENT_ID')
    if not client: raise Problem('Trakt 尚未配置 TRAKT_CLIENT_ID，可先导入导出的 JSON 文件',503)
    rows=read_json('https://api.trakt.tv/users/'+username+'/'+collection+'/movies?'+urlencode(dict(page=page,limit=50)),
                   {'trakt-api-key':client,'trakt-api-version':'2'},ttl=60)
    if not isinstance(rows,list): raise Problem('Trakt 返回格式无效',502)
    return dict(provider='trakt',status={'watchlist':'wish','history':'done','ratings':'none'}[collection],content=json.dumps(rows[:50],ensure_ascii=False))


def apply_preview(state,user,preview,payload):
    rows=preview['rows']; selected=payload.get('selected')
    mappings=payload.get('mappings',{})
    if not isinstance(selected,list) or len(selected)>200 or not all(isinstance(k,str) for k in selected) or not isinstance(mappings,dict):
        raise Problem('请选择有效的导入记录')
    if not selected: raise Problem('至少选择一条记录')
    valid={r['source_key'] for r in rows}
    if not set(selected)<=valid: raise Problem('导入记录不在本次预览中')
    overwrite=boolean(payload.get('overwrite',False)); sync=boolean(payload.get('sync_shelf',False))
    entries=state.setdefault('journals',[])
    added=updated=skipped=0
    for row in rows:
        key=row['source_key']
        if key not in selected: continue
        old=next((j for j in entries if j['user_id']==user['id'] and j.get('source_key')==key),None)
        if old and not overwrite:
            skipped+=1;continue
        wid=mappings.get(key,'')
        if wid:
            work=find(state['works'],wid)
            if work['kind']!=row['kind']: raise Problem('关联作品类型与导入记录不一致')
        entry={k:v for k,v in row.items() if k!='suggested_work_id'}
        entry.update(id=old['id'] if old else uid(),user_id=user['id'],work_id=wid,updated_at=now())
        if old: old.update(entry);updated+=1
        else: entries.append(entry);added+=1
        if sync and wid and entry['status']!='none':
            shelf=next((s for s in state['shelves'] if s['user_id']==user['id'] and s['work_id']==wid),None)
            values=dict(status=entry['status'],updated_at=now())
            if shelf: shelf.update(values)
            else: state['shelves'].append(dict(id=uid(),user_id=user['id'],work_id=wid,**values))
    return dict(added=added,updated=updated,skipped=skipped)
