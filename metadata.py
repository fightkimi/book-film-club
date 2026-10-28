"""Read-only metadata adapters. Source IDs, never user-supplied fetch URLs."""
import json
import os
import re
import isbnlib
import urllib.parse
import urllib.request
from domain import Problem, text, now


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Problem('数据源发生重定向，请稍后重试',502)


def fetch_json(url, headers=None, payload=None):
    request = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None, headers={'User-Agent':'BookFilmClub/0.1 (personal reading club)', 'Accept':'application/json', **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request,timeout=20) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise Problem('数据源返回内容过大',502)
            return json.loads(raw)
    except Problem:
        raise
    except Exception:
        raise Problem('暂时无法连接数据源，请稍后重试或手工补全',502)


def tmdb(path, **params):
    token = os.environ.get('TMDB_TOKEN')
    if not token:
        raise Problem('电影刮削尚未配置 TMDB_TOKEN，请在服务器配置 API 读访问令牌',503)
    return fetch_json('https://api.themoviedb.org/3/'+path+'?'+urllib.parse.urlencode({'language':'zh-CN',**params}), {'Authorization':'Bearer '+token})


def search(kind, query):
    query = text(query,160)
    if kind == 'book':
        compact = query.replace('-', '').replace(' ', '')
        if re.fullmatch(r'[0-9Xx]{10,13}', compact):
            if not (isbnlib.is_isbn10(compact) or isbnlib.is_isbn13(compact)):
                raise Problem('ISBN 校验失败，请核对书籍版权页上的编号')
            isbn = isbnlib.to_isbn13(compact)
            data = fetch_json('https://openlibrary.org/api/books?'+urllib.parse.urlencode({'bibkeys':'ISBN:'+isbn,'format':'json','jscmd':'data'}))
            record = data.get('ISBN:'+isbn)
            if not record:
                return []
            edition = record.get('identifiers',{}).get('openlibrary',[])
            if not edition or not re.fullmatch(r'OL\d+M',edition[0]):
                return []
            return [dict(provider='openlibrary',source_id='/books/'+edition[0],title=record.get('title',''),creator=' / '.join(a.get('name','') for a in record.get('authors',[])),year=record.get('publish_date',''),image=record.get('cover',{}).get('large',''),kind='book',isbn=isbn)]
        data = fetch_json('https://openlibrary.org/search.json?'+urllib.parse.urlencode({'q':query,'limit':12,'fields':'key,title,author_name,first_publish_year,cover_i,edition_key','lang':'zh'}))
        return [dict(provider='openlibrary',source_id=d['key'],title=d.get('title',''),creator=' / '.join(d.get('author_name',[])),year=str(d.get('first_publish_year','')),image=('https://covers.openlibrary.org/b/id/%s-L.jpg?default=false'%d['cover_i']) if d.get('cover_i') else '',kind='book') for d in data.get('docs',[]) if re.fullmatch(r'/works/OL\d+W',d.get('key',''))]
    if kind == 'movie':
        data = tmdb('search/movie',query=query,include_adult='false')
        return [dict(provider='tmdb',source_id=str(d['id']),title=d.get('title',''),creator='',year=d.get('release_date','')[:4],description=d.get('overview',''),image='https://image.tmdb.org/t/p/w500'+d['poster_path'] if d.get('poster_path') else '',kind='movie') for d in data.get('results',[])][:12]
    raise Problem('不支持的数据类型')


def detail(provider, source_id):
    if provider == 'openlibrary' and re.fullmatch(r'/(?:works/OL\d+W|books/OL\d+M)',str(source_id)):
        d = fetch_json('https://openlibrary.org'+source_id+'.json')
        edition = source_id.startswith('/books/')
        work = {}
        work_key = (d.get('works') or [{}])[0].get('key','')
        if edition and re.fullmatch(r'/works/OL\d+W',work_key):
            work = fetch_json('https://openlibrary.org'+work_key+'.json')
        authors = []
        for a in (d.get('authors') or work.get('authors',[]))[:4]:
            key = a.get('author',a).get('key','')
            if re.fullmatch(r'/authors/OL\d+A',key):
                authors.append(fetch_json('https://openlibrary.org'+key+'.json').get('name',''))
        desc = d.get('description') or work.get('description','')
        if isinstance(desc,dict):
            desc=desc.get('value','')
        covers = [c for c in d.get('covers',[]) if isinstance(c,int) and c>0]
        result = dict(kind='book',title=d.get('title',''),creator=' / '.join(authors),year=str(d.get('publish_date','') if edition else d.get('first_publish_date','')),description=desc,tags=' / '.join((d.get('subjects') or work.get('subjects',[]))[:6]),image=('https://covers.openlibrary.org/b/id/%s-L.jpg?default=false'%covers[0]) if covers else '',source_url='https://openlibrary.org'+source_id,extra={'isbn':d.get('isbn_13',d.get('isbn_10',[])),'publishers':d.get('publishers',[]),'pages':d.get('number_of_pages'),'level':'edition' if edition else 'work'})
    elif provider == 'tmdb' and re.fullmatch(r'\d{1,12}',str(source_id)):
        d = tmdb('movie/'+source_id,append_to_response='credits')
        result = dict(kind='movie',title=d.get('title',''),creator=' / '.join(c['name'] for c in d.get('credits',{}).get('crew',[]) if c.get('job')=='Director'),year=d.get('release_date','')[:4],description=d.get('overview',''),tags=' / '.join(g['name'] for g in d.get('genres',[])),image='https://image.tmdb.org/t/p/w500'+d['poster_path'] if d.get('poster_path') else '',source_url='https://www.themoviedb.org/movie/'+source_id,extra={'runtime':d.get('runtime'),'cast':[c['name'] for c in d.get('credits',{}).get('cast',[])[:8]],'original_title':d.get('original_title'),'rating':d.get('vote_average'),'backdrop':'https://image.tmdb.org/t/p/w1280'+d['backdrop_path'] if d.get('backdrop_path') else ''})
    else:
        raise Problem('数据来源或作品编号无效')
    result.update(provider=provider,source_id=source_id,scraped_at=now(),metadata_status='pending')
    return result
