"""Public movie metadata snapshot; no member data and no runtime upstream calls."""
import json
import os
from pathlib import Path
import re
import threading
from functools import lru_cache

from domain import Problem

_lock = threading.Lock()
_cached = None
_stamp = None

LABELS = {28:'动作',12:'冒险',16:'动画',35:'喜剧',80:'犯罪',99:'纪录片',18:'剧情',10751:'家庭',14:'奇幻',36:'历史',27:'恐怖',10402:'音乐与歌舞',9648:'悬疑',10749:'爱情',878:'科幻',53:'惊悚',10752:'战争',37:'西部'}
SOURCE_LABELS = {**{v:k for k,v in LABELS.items()}, '纪录':99, '音乐':10402}


@lru_cache(maxsize=1)
def category_policy():
    try:
        data=json.loads(Path(__file__).with_name('movie_categories.json').read_text())
        overrides=data['overrides']
        for entry in overrides.values():
            if not 1<=len(entry['categories'])<=2 or any(c not in LABELS.values() for c in entry['categories']):raise ValueError()
        return overrides
    except (OSError,ValueError,KeyError,TypeError):
        raise Problem('电影分类暂时无法读取，请稍后重试',503)


def classify(row, overrides=None):
    """Editorial browse categories, distinct from the full upstream genre tags."""
    overrides=category_policy() if overrides is None else overrides
    entry=overrides.get(str(row.get('source_id',''))) if row.get('provider')=='tmdb' else None
    if entry:return list(entry['categories'])
    ids=set(row.get('genre_ids') or [])
    ids.update(SOURCE_LABELS[t.strip()] for t in re.split(r'[/|,，、;；]+',row.get('tags','') or '') if t.strip() in SOURCE_LABELS)
    def pair(first, extras=()):
        return [LABELS[first]]+[LABELS[g] for g in extras if g in ids][:1]
    if 99 in ids:return pair(99,(10402,))
    if 16 in ids:return pair(16,(10402,878,28,12,35))
    if 10402 in ids:return pair(10402)
    if 10752 in ids:return pair(10752,(36,))
    if 37 in ids:return pair(37,(80,9648,28,12))
    if 878 in ids:return pair(878,(27,28,12))
    if 27 in ids:return pair(27,(53,))
    if 14 in ids:return pair(14,(28,12))
    if 9648 in ids:return pair(9648,(80,53))
    if 28 in ids:return pair(28,(80,12))
    if 80 in ids:return pair(80,(18,))
    if 12 in ids:return pair(12)
    if 36 in ids:return pair(36,(18,))
    if 53 in ids:return pair(53)
    if 10749 in ids:return pair(10749)
    if 35 in ids:return pair(35)
    if 18 in ids:return pair(18)
    if 10751 in ids:return pair(10751)
    return ['待归类']


def snapshot():
    global _cached, _stamp
    path = Path(os.environ.get('MOVIE_CATALOG_FILE', Path(__file__).with_name('movie_catalog.json')))
    try:
        stat = path.stat()
        stamp = (str(path.resolve()), stat.st_mtime_ns, stat.st_size)
        with _lock:
            if stamp != _stamp:
                if stat.st_size > 8_000_000: raise ValueError()
                data = json.loads(path.read_text())
                movies = data['movies']
                if not isinstance(movies, list) or len(movies) > 2000: raise ValueError()
                ids = set()
                for row in movies:
                    if not re.fullmatch(r'tmdb:\d{1,12}', row['id']) or row['id'] in ids: raise ValueError()
                    if row['kind'] != 'movie' or row['provider'] != 'tmdb' or row['id'] != 'tmdb:' + row['source_id']: raise ValueError()
                    if not all(isinstance(row.get(k), str) and row[k] for k in ('title', 'creator', 'description', 'image', 'tags')): raise ValueError()
                    ids.add(row['id'])
                _cached = data; _stamp = stamp
            return _cached
    except (OSError, ValueError, KeyError, TypeError):
        raise Problem('电影资料库暂时无法读取，请稍后重试', 503)


def detail(key):
    if not isinstance(key, str) or not re.fullmatch(r'tmdb:\d{1,12}', key):
        raise Problem('电影编号无效', 400)
    row = next((r for r in snapshot()['movies'] if r['id'] == key), None)
    if row is None: raise Problem('没有找到这部电影', 404)
    return {**row,'browse_genres':classify(row)}


def listing(local_works=()):
    data = snapshot()
    overrides=category_policy()
    sources={r['source_id']:r for r in data['movies']}
    for row in local_works:
        if row.get('kind','movie')=='movie' and row.get('provider')=='tmdb':sources.setdefault(str(row['source_id']),row)
    categories={key:classify(row,overrides) for key,row in sources.items()}
    return {'movies': [{**row, 'description': row['description'][:180], 'browse_genres':categories[row['source_id']]} for row in data['movies']],
            'classifications':categories,
            'genres': data['genres'], 'total': len(data['movies']), 'as_of': data['as_of']}


def choices(works, include_public=True):
    local = []
    for w in works:
        if w['kind'] != 'movie': continue
        extra = w.get('extra') or {}
        row = {k: w.get(k, '') for k in ('title', 'creator', 'image', 'kind', 'description', 'year')}
        row.update(id='work:' + w['id'], runtime=extra.get('runtime'))
        for key in ('provider', 'source_id', 'tags'):
            if w.get(key): row[key] = w[key]
        searchable = {k: extra[k] for k in ('aliases', 'original_title') if extra.get(k)}
        if searchable: row['extra'] = searchable
        local.append(row)
    known = {str(w.get('source_id')) for w in local if w.get('provider') == 'tmdb'}
    if not include_public: return local
    try:
        data = listing(works);public=data['movies']
        for row in local:row['browse_genres']=data['classifications'].get(str(row.get('source_id')),classify(row))
    except Problem:
        # Existing private records remain usable during a catalog outage.
        return local
    return local + [row for row in public if row['source_id'] not in known]
