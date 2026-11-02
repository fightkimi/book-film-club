"""Read-only deployment probe: Chinese search, metadata, poster and ratings."""
import json
import os
from pathlib import Path
import sys
import urllib.request

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import metadata
from domain import Problem


if __name__=='__main__':
    config=Path('/etc/tongpin/tongpin.env')
    if config.exists():
        for line in config.read_text().splitlines():
            key,sep,value=line.partition('=')
            if sep and key in ('TMDB_TOKEN','TMDB_API_HOST','OMDB_KEY'): os.environ[key]=value.strip()
    try:
        candidates=metadata.search('movie','流浪地球')
        if not candidates: raise Problem('中文搜索未返回候选')
        chosen=next((w for w in candidates if w['title']=='流浪地球'),candidates[0])
        movie=metadata.detail('tmdb',chosen['source_id'])
        if not all(movie.get(k) for k in ('title','creator','description','image')):
            raise Problem('资料不完整，请检查中文字段和海报')
        request=urllib.request.Request(movie['image'],method='HEAD')
        with urllib.request.build_opener(metadata.NoRedirect()).open(request,timeout=20) as response:
            if not response.headers.get('Content-Type','').startswith('image/'):
                raise Problem('海报没有返回图片')
        extra=metadata.film_extras(movie)
        if not extra['ratings']: raise Problem('未获取到评分')
        print(json.dumps(dict(title=movie['title'],director=movie['creator'],poster='OK',ratings=extra['ratings'],warnings=extra['warnings']),ensure_ascii=False))
    except Problem as error:
        print(error.message,file=sys.stderr);raise SystemExit(1)
