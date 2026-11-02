"""Tencent WeRead Agent Gateway, public book metadata only. No shelf/note APIs."""
import datetime as dt
import os
import re
from urllib.parse import urlsplit, urlunsplit
from domain import Problem, text, now, TZ
from sources import read_json

SKILL_VERSION='1.0.5'


def gateway(api_name, **params):
    if api_name not in ('/store/search','/book/info'):
        raise Problem('同频仅开放微信读书的书籍搜索与详情接口')
    key=os.environ.get('WEREAD_API_KEY')
    if not key: raise Problem('微信读书尚未配置 WEREAD_API_KEY，可先选择其他书籍来源',503)
    data=read_json('https://i.weread.qq.com/api/agent/gateway',{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
                   payload=dict(api_name=api_name,skill_version=SKILL_VERSION,**params))
    if not isinstance(data,dict): raise Problem('微信读书返回格式无效',502)
    if 'upgrade_info' in data:
        raise Problem('微信读书要求更新接口版本，请管理员核对官方 Skill 后更新；本次操作已停止',503)
    if data.get('errcode',0)!=0:
        raise Problem('微信读书服务返回错误，请检查服务授权或稍后重试',502)
    return data


def safe_link(value, image=False):
    if not isinstance(value,str): return ''
    parsed=urlsplit(value)
    host=parsed.hostname or ''
    allowed=host=='weread.qq.com' or host.endswith('.weread.qq.com')
    if image: allowed=allowed or host=='qpic.cn' or host.endswith('.qpic.cn') or host.endswith('.qlogo.cn')
    if not allowed or '@' in parsed.netloc or parsed.port not in (None,443) or parsed.scheme not in (('http','https') if image else ('https',)):
        return ''
    return urlunsplit(parsed._replace(scheme='https'))


def book_item(data):
    source_id=str(data.get('bookId',''))
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',source_id): raise Problem('微信读书书籍编号无效',502)
    published=data.get('publishTime','')
    if isinstance(published,(int,float)) or (isinstance(published,str) and published.isdigit() and len(published)>=9):
        try: published=dt.datetime.fromtimestamp(float(published),TZ).date().isoformat()
        except (ValueError,OverflowError,OSError): published=''
    elif isinstance(published,str) and re.match(r'^\d{4}-\d{2}-\d{2}',published):
        published=published[:10]
    link=safe_link(data.get('readerLink')) or safe_link(data.get('deepLink'))
    return dict(provider='weread',source_id=source_id,kind='book',title=str(data.get('title') or '')[:200],
                creator=str(data.get('author') or '')[:300],year=str(published)[:40],description=str(data.get('intro') or '')[:12000],
                image=safe_link(data.get('cover'),True),source_url=link,tags=str(data.get('category') or '')[:500],
                extra={'isbn':[str(data['isbn'])] if data.get('isbn') else [],'publishers':[str(data['publisher'])] if data.get('publisher') else [],
                       'translator':str(data.get('translator') or '')[:300], 'level':'edition','rating':data.get('newRating'),'rating_scale':100},
                scraped_at=now(),metadata_status='pending')


def search(query):
    data=gateway('/store/search',keyword=text(query,160),scope=10)
    results=[]; seen=set()
    for group in data.get('results',[]):
        for row in group.get('books',[]):
            book=row.get('bookInfo')
            if isinstance(book,dict) and book.get('bookId'):
                item=book_item(book)
                if item['source_id'] not in seen:
                    seen.add(item['source_id']);results.append(item)
    return results[:15]


def detail(source_id):
    if not isinstance(source_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',source_id):
        raise Problem('微信读书书籍编号无效')
    return book_item(gateway('/book/info',bookId=source_id))
