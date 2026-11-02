"""Read-only metadata adapters. Source IDs, never user-supplied fetch URLs."""
import json
import os
import re
import isbnlib
import urllib.parse
import urllib.request
import urllib.error
from html import unescape
from sources import read_json
from domain import Problem, text, now


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Problem('数据源发生重定向，请稍后重试',502)


def fetch_json(url, headers=None, payload=None):
    request = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None, headers={'User-Agent':os.environ.get('METADATA_USER_AGENT','Tongpin/0.2 (personal book and film club)'), 'Accept':'application/json', **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request,timeout=20) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise Problem('数据源返回内容过大',502)
            return json.loads(raw)
    except Problem:
        raise
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raise Problem('数据源暂时限流，请稍后重试',429)
        if error.code in (401,403):
            raise Problem('数据源拒绝访问，请检查服务配置或账号可见性',502)
        raise Problem('数据源暂时无法返回资料，请稍后重试',502)
    except Exception:
        raise Problem('暂时无法连接数据源，请稍后重试或手工补全',502)


def tmdb(path, **params):
    token = os.environ.get('TMDB_TOKEN')
    if not token:
        raise Problem('电影刮削尚未配置 TMDB_TOKEN，请在服务器配置 API 读访问令牌',503)
    return read_json('https://api.themoviedb.org/3/'+path+'?'+urllib.parse.urlencode({'language':'zh-CN',**params}), {'Authorization':'Bearer '+token})


def search(kind, query, provider=None):
    query = text(query,160)
    if kind == 'book' and provider == 'weread':
        import weread
        return weread.search(query)
    if kind == 'book' and provider == 'googlebooks':
        return google_search(query)
    if provider not in (None, 'openlibrary' if kind == 'book' else 'tmdb'):
        raise Problem('数据源与作品类型不匹配')
    if kind == 'book':
        compact = query.replace('-', '').replace(' ', '')
        if re.fullmatch(r'[0-9Xx]{10,13}', compact):
            if not (isbnlib.is_isbn10(compact) or isbnlib.is_isbn13(compact)):
                raise Problem('ISBN 校验失败，请核对书籍版权页上的编号')
            isbn = isbnlib.to_isbn13(compact)
            data = read_json('https://openlibrary.org/api/books?'+urllib.parse.urlencode({'bibkeys':'ISBN:'+isbn,'format':'json','jscmd':'data'}))
            record = data.get('ISBN:'+isbn)
            if not record:
                return []
            edition = record.get('identifiers',{}).get('openlibrary',[])
            if not edition or not re.fullmatch(r'OL\d+M',edition[0]):
                return []
            return [dict(provider='openlibrary',source_id='/books/'+edition[0],title=record.get('title',''),creator=' / '.join(a.get('name','') for a in record.get('authors',[])),year=record.get('publish_date',''),image=record.get('cover',{}).get('large',''),kind='book',isbn=isbn)]
        data = read_json('https://openlibrary.org/search.json?'+urllib.parse.urlencode({'q':query,'limit':12,'fields':'key,title,author_name,first_publish_year,cover_i,edition_key','lang':'zh'}))
        return [dict(provider='openlibrary',source_id=d['key'],title=d.get('title',''),creator=' / '.join(d.get('author_name',[])),year=str(d.get('first_publish_year','')),image=('https://covers.openlibrary.org/b/id/%s-L.jpg?default=false'%d['cover_i']) if d.get('cover_i') else '',kind='book') for d in data.get('docs',[]) if re.fullmatch(r'/works/OL\d+W',d.get('key',''))]
    if kind == 'movie':
        data = tmdb('search/movie',query=query,include_adult='false')
        return [dict(provider='tmdb',source_id=str(d['id']),title=d.get('title',''),creator='',year=d.get('release_date','')[:4],description=d.get('overview',''),image='https://image.tmdb.org/t/p/w500'+d['poster_path'] if d.get('poster_path') else '',kind='movie') for d in data.get('results',[])][:12]
    raise Problem('不支持的数据类型')


def detail(provider, source_id):
    if provider == 'weread':
        import weread
        return weread.detail(source_id)
    if provider == 'googlebooks':
        return google_detail(source_id)
    if provider == 'openlibrary' and re.fullmatch(r'/(?:works/OL\d+W|books/OL\d+M)',str(source_id)):
        d = read_json('https://openlibrary.org'+source_id+'.json')
        edition = source_id.startswith('/books/')
        work = {}
        work_key = (d.get('works') or [{}])[0].get('key','')
        if edition and re.fullmatch(r'/works/OL\d+W',work_key):
            work = read_json('https://openlibrary.org'+work_key+'.json')
        authors = []
        for a in (d.get('authors') or work.get('authors',[]))[:4]:
            key = a.get('author',a).get('key','')
            if re.fullmatch(r'/authors/OL\d+A',key):
                authors.append(read_json('https://openlibrary.org'+key+'.json').get('name',''))
        desc = d.get('description') or work.get('description','')
        if isinstance(desc,dict):
            desc=desc.get('value','')
        covers = [c for c in d.get('covers',[]) if isinstance(c,int) and c>0]
        result = dict(kind='book',title=d.get('title',''),creator=' / '.join(authors),year=str(d.get('publish_date','') if edition else d.get('first_publish_date','')),description=desc,tags=' / '.join((d.get('subjects') or work.get('subjects',[]))[:6]),image=('https://covers.openlibrary.org/b/id/%s-L.jpg?default=false'%covers[0]) if covers else '',source_url='https://openlibrary.org'+source_id,extra={'isbn':d.get('isbn_13',d.get('isbn_10',[])),'publishers':d.get('publishers',[]),'pages':d.get('number_of_pages'),'level':'edition' if edition else 'work'})
    elif provider == 'tmdb' and re.fullmatch(r'\d{1,12}',str(source_id)):
        d = tmdb('movie/'+source_id,append_to_response='credits,alternative_titles')
        result = dict(kind='movie',title=d.get('title',''),creator=' / '.join(c['name'] for c in d.get('credits',{}).get('crew',[]) if c.get('job')=='Director'),year=d.get('release_date','')[:4],description=d.get('overview',''),tags=' / '.join(g['name'] for g in d.get('genres',[])),image='https://image.tmdb.org/t/p/w500'+d['poster_path'] if d.get('poster_path') else '',source_url='https://www.themoviedb.org/movie/'+source_id,extra={'aliases':list(dict.fromkeys(a['title'] for a in d.get('alternative_titles',{}).get('titles',[]) if a.get('iso_3166_1') in ('CN','TW','HK') and a.get('title'))), 'imdb_id':d.get('imdb_id'), 'runtime':d.get('runtime'),'cast':[c['name'] for c in d.get('credits',{}).get('cast',[])[:8]],'original_title':d.get('original_title'),'rating':d.get('vote_average'),'backdrop':'https://image.tmdb.org/t/p/w1280'+d['backdrop_path'] if d.get('backdrop_path') else ''})
    else:
        raise Problem('数据来源或作品编号无效')
    result.update(provider=provider,source_id=source_id,scraped_at=now(),metadata_status='pending')
    return result


def google(path='', **params):
    key = os.environ.get('GOOGLE_BOOKS_KEY')
    if not key:
        raise Problem('Google Books 尚未配置，请选择 Open Library 或请管理员配置 GOOGLE_BOOKS_KEY',503)
    return read_json('https://www.googleapis.com/books/v1/volumes'+path+'?'+urllib.parse.urlencode(dict(key=key,**params)))


def google_item(data):
    source_id = text(data.get('id'),100)
    if not re.fullmatch(r'[A-Za-z0-9_-]+',source_id):
        raise Problem('数据源返回了无效的图书编号',502)
    info = data.get('volumeInfo',{})
    image = info.get('imageLinks',{}).get('thumbnail','')
    parsed = urllib.parse.urlparse(image)
    image = urllib.parse.urlunparse(parsed._replace(scheme='https')) if parsed.hostname in ('books.google.com','books.googleusercontent.com') and not parsed.username else ''
    return dict(provider='googlebooks',source_id=source_id,kind='book',title=info.get('title','')[:200],
                creator=' / '.join(info.get('authors',[]))[:300],year=info.get('publishedDate','')[:40],
                description=unescape(re.sub('<[^>]+>','',info.get('description','')))[:12000],image=image,
                tags=' / '.join(info.get('categories',[]))[:500],source_url='https://books.google.com/books?id='+source_id,
                extra={'isbn':[i['identifier'] for i in info.get('industryIdentifiers',[]) if i.get('type') in ('ISBN_10','ISBN_13')],
                       'publishers':[info['publisher']] if info.get('publisher') else [],'pages':info.get('pageCount'),'level':'edition'},
                metadata_status='pending',scraped_at=now())


def google_search(query):
    compact=query.replace('-','').replace(' ','')
    if re.fullmatch(r'[0-9Xx]{10,13}',compact):
        if not (isbnlib.is_isbn10(compact) or isbnlib.is_isbn13(compact)):
            raise Problem('ISBN 校验失败，请核对编号')
        query='isbn:'+isbnlib.to_isbn13(compact)
    return [google_item(item) for item in google(q=query,maxResults=12,printType='books').get('items',[])][:12]


def google_detail(source_id):
    if not isinstance(source_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',source_id):
        raise Problem('无效的 Google Books 编号')
    return google_item(google('/'+source_id))


def film_card(data):
    return dict(kind='movie',provider='tmdb',source_id=str(data['id']),title=data.get('title',''),
                year=data.get('release_date','')[:4],image='https://image.tmdb.org/t/p/w500'+data['poster_path'] if data.get('poster_path') else '',
                description=data.get('overview',''))


def film_extras(work):
    if work.get('provider') != 'tmdb' or not re.fullmatch(r'\d{1,12}',str(work.get('source_id',''))):
        raise Problem('请先通过 TMDB 匹配这部电影，再获取相关影片与评分')
    ratings, warnings, related = [], [], []
    imdb_id=work.get('extra',{}).get('imdb_id')
    try:
        movie=tmdb('movie/'+work['source_id'])
        imdb_id=movie.get('imdb_id')
        ratings.append(dict(source='TMDB',value=str(movie.get('vote_average',0))+' / 10',votes=movie.get('vote_count',0),url=work['source_url']))
        related=[film_card(d) for d in tmdb('movie/'+work['source_id']+'/recommendations').get('results',[])][:8]
    except Problem as error:
        warnings.append(error.message)
    if os.environ.get('OMDB_KEY') and re.fullmatch(r'tt\d{7,10}',imdb_id or ''):
        try:
            data=read_json('https://www.omdbapi.com/?'+urllib.parse.urlencode(dict(apikey=os.environ['OMDB_KEY'],i=imdb_id,r='json')))
            if data.get('Response') == 'False':
                warnings.append('OMDb 暂无此影片的评分资料')
            else:
                ratings.extend(dict(source=str(r['Source'])[:80],value=str(r['Value'])[:60],url='https://www.imdb.com/title/'+imdb_id+'/',via='OMDb') for r in data.get('Ratings',[]) if r.get('Source') in ('Internet Movie Database','Rotten Tomatoes','Metacritic'))
        except Problem as error:
            warnings.append(error.message)
    else:
        warnings.append('跨站评分需要 OMDB_KEY 和有效的 IMDb 编号；未配置时仅显示 TMDB。')
    return dict(ratings=ratings,related=related,warnings=warnings,at=now())


def charts(page=1):
    from domain import integer
    page=integer(page,1,10)
    data=tmdb('movie/top_rated',page=page)
    return dict(items=[dict(film_card(d),rank=(page-1)*20+i+1) for i,d in enumerate(data.get('results',[]))],page=page,at=now())
