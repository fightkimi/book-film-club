"""Member-authorized book lists and anonymous WeRead charts."""
import json
import hashlib
import os
import threading
import time
import urllib.request
import unicodedata

from domain import Problem
from metadata import NoRedirect
import weread

RANKS = {'rising': '飙升榜', 'newbook': '新书榜', 'all': '总榜'}
_ranks = {}
_lock = threading.Lock()


def member_keys():
    try:
        keys = json.loads(os.environ.get('WEREAD_MEMBER_KEYS', '{}'))
        if not isinstance(keys, dict) or not all(
            name.strip() and (key is None or isinstance(key, str)) for name, key in keys.items()
        ):
            raise ValueError()
    except (ValueError, TypeError):
        raise Problem('成员书单配置无效，请联系管理员', 503)
    primary = os.environ.get('WEREAD_SHARED_SHELF_OWNER')
    if primary:
        return {primary: os.environ.get('WEREAD_API_KEY'), **keys}
    return keys


def directory(state):
    imported = state.get('imported_booklists', {})
    keys = member_keys()
    return {'members': [{'name': n, 'connected': bool(keys.get(n) or n in imported),
                         'source':'weread' if keys.get(n) else 'import' if n in imported else 'empty'}
                        for n in dict.fromkeys([*keys, *imported])],
            'ranks': [{'id': i, 'name': n} for i,n in RANKS.items()]}


def card(book):
    if not isinstance(book,dict) or not book.get('title') or not book.get('bookId'):
        return None
    return {'id': str(book['bookId']), 'title': str(book['title'])[:200],
            'author': str(book.get('author') or '')[:300], 'cover': weread.safe_link(book.get('cover'),True)}


def member(name, state):
    keys = member_keys()
    imported = state.get('imported_booklists', {})
    if not isinstance(name,str) or (name not in keys and name not in imported):
        raise Problem('成员书单不存在',404)
    if not keys.get(name) and name in imported:
        ids = set(imported[name])
        books = [{'id':w['id'], 'workId':w['id'], 'title':w['title'], 'author':w.get('creator',''), 'cover':w.get('image','')}
                 for w in state['works'] if w['id'] in ids and w['kind']=='book']
        return {'books':books, 'folders':[], 'connected':True, 'scope':'import'}
    if not keys.get(name):
        return {'books': [], 'folders': [], 'connected': False}
    data = weread.shared_shelf(keys[name])
    if not isinstance(data.get('books', []),list):
        raise Problem('成员书架暂时无法读取',502)
    books = {}
    full = name == os.environ.get('WEREAD_FULL_SHELF_OWNER') == os.environ.get('WEREAD_SHARED_SHELF_OWNER')
    for row in data.get('books',[]):
        if not isinstance(row,dict):
            continue
        uploaded = str(row.get('bookId','')).startswith('CB_')
        if not full and (row.get('secret',0) not in (0,'0') or uploaded):
            continue
        item = card(row)
        if item:
            source_id = item['id']
            if uploaded:
                item.update(id='upload-'+hashlib.sha256(source_id.encode()).hexdigest(), cover='', personalUpload=True)
            books[source_id] = item
    folders = []
    for folder in data.get('archive') or []:
        ids = [books[str(i)]['id'] for i in folder.get('bookIds',[]) if str(i) in books]
        if ids and folder.get('name'):
            folders.append({'name': str(folder['name'])[:100], 'ids': ids})
    return {'books': list(books.values()), 'folders': folders, 'connected': True,
            'scope':'full' if full else 'public'}


def rank(rank_id):
    if not isinstance(rank_id,str) or rank_id not in RANKS:
        raise Problem('榜单不存在',404)
    with _lock:
        cached = _ranks.get(rank_id)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        url = 'https://weread.qq.com/web/category/' + rank_id
        try:
            with urllib.request.build_opener(NoRedirect()).open(url,timeout=10) as resp:
                raw = resp.read(3_000_001)
            if len(raw)>3_000_000:
                raise ValueError()
            _, sep, contents = raw.decode().partition('window.__INITIAL_STATE__=')
            if not sep:
                raise ValueError()
            state,_ = json.JSONDecoder().raw_decode(contents.lstrip())
            page = state['categoryStoreModule']
            if page['categoryId'] != rank_id or page.get('isFetchError'):
                raise ValueError()
            books = [item for row in page['categoryBookList'][:20] if (item := card(row.get('bookInfo')))]
            if not books:
                raise ValueError()
        except (OSError, ValueError, KeyError, TypeError, AttributeError, Problem):
            raise Problem('微信读书榜单暂时无法读取，请稍后重试',502)
        result = {'books': books, 'source': url}
        _ranks[rank_id] = (time.monotonic()+900, result)
        return result


def group(state):
    """Keep one entry per WeRead edition and prefer the club's editable work."""
    rows, editions, titles = [], set(), set()

    def add(item, source_ids):
        label = tuple(' '.join(unicodedata.normalize('NFKC', part).split()).casefold()
                      for part in (item['title'], item['author']))
        ids = {str(i) for i in source_ids if i}
        duplicate = not editions.isdisjoint(ids) or (all(label) and label in titles)
        editions.update(ids)
        if all(label):
            titles.add(label)
        if not duplicate:
            rows.append(item)

    for work in state['works']:
        if work['kind'] == 'book':
            add({'id':work['id'], 'workId':work['id'], 'title':work['title'],
                 'author':work.get('creator') or '', 'cover':work.get('image','')},
                [(work.get('extra') or {}).get('weread_id'),work.get('source_id') if work.get('provider')=='weread' else None])
    unavailable = []
    for name,key in member_keys().items():
        if not key:
            continue
        try:
            books = member(name,state)['books']
        except Problem:
            unavailable.append(name)
            continue
        for item in books:
            add(item, [item['id']])
    return {'books':rows, 'unavailable':unavailable}
