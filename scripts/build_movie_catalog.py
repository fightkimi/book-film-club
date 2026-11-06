#!/usr/bin/env python3
"""Build a bounded, resumable public film snapshot using the configured TMDB API.

Run with the existing server environment. Never prints or writes credentials.
The final file is replaced only after all acceptance checks pass.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import metadata
from domain import Problem

GENRES = [18, 35, 10749, 9648, 878, 16, 99, 53, 28, 10752, 36, 80, 14, 12]
REQUIRED = ('313369', '316029', '82695')  # Musical cinema is not reliably covered by TMDB's Music genre.


def normalize(raw, as_of):
    date = raw.get('release_date', '')
    if raw.get('adult') or not date or date > as_of:
        return None
    directors = [p['name'] for p in raw.get('credits', {}).get('crew', []) if p.get('job') == 'Director' and p.get('name')]
    description = raw.get('overview', '').strip()
    if not all((raw.get('title'), description, directors, raw.get('poster_path'), raw.get('genres'))):
        return None
    # This Chinese-language catalog skips untranslated descriptions instead of fabricating one.
    if not any('\u4e00' <= c <= '\u9fff' for c in description):
        return None
    source_id = str(raw['id'])
    return {
        'id': 'tmdb:' + source_id, 'provider': 'tmdb', 'source_id': source_id, 'kind': 'movie',
        'title': raw['title'], 'creator': ' / '.join(dict.fromkeys(directors)),
        'year': date[:4], 'release_date': date, 'description': description,
        'image': 'https://image.tmdb.org/t/p/w500' + raw['poster_path'],
        'source_url': 'https://www.themoviedb.org/movie/' + source_id,
        'tags': ' / '.join(g['name'] for g in raw['genres']),
        'genre_ids': [g['id'] for g in raw['genres']],
        'extra': {
            'runtime': raw.get('runtime') or None, 'original_title': raw.get('original_title', ''),
            'aliases': list(dict.fromkeys(p['title'] for p in raw.get('alternative_titles', {}).get('titles', []) if p.get('iso_3166_1') in ('CN', 'TW', 'HK') and p.get('title'))),
        },
    }


def build(output, limit, as_of):
    output.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = output.with_suffix('.partial.json')
    saved = json.loads(checkpoint.read_text()) if checkpoint.exists() else {'items': {}, 'skipped': []}
    items = saved['items']; skipped = set(saved['skipped']); requests = 0
    if output.exists():
        for row in json.loads(output.read_text())['movies']:items.setdefault(row['source_id'],row)

    def call(path, **params):
        nonlocal requests
        for attempt in range(4):
            requests += 1
            if requests > 1400: raise RuntimeError('bounded request budget exhausted')
            try: return metadata.tmdb(path, **params)
            except Problem as error:
                if error.status == 429 or (error.status == 502 and '暂时' in error.message):
                    time.sleep(min(2 ** (attempt + 1), 16)); continue
                raise
        raise RuntimeError('TMDB rate limit persisted; checkpoint retained')

    def persist():
        checkpoint.write_text(json.dumps({'items': items, 'skipped': sorted(skipped)}, ensure_ascii=False))

    genres = call('genre/movie/list')['genres']
    for key in REQUIRED:
        if key in items:continue
        row=normalize(call('movie/'+key,append_to_response='credits,alternative_titles'),as_of)
        if not row:raise RuntimeError('A required musical lacks complete source metadata')
        items[key]=row
    candidates = []
    seen = set()
    # Round-robin genres and Chinese-language cinema before filling from the broad catalog.
    for page in range(1, 9):
        if len(items)>=limit:break
        pools = []
        for genre in GENRES:
            pools.append(call('discover/movie', page=page, include_adult='false', include_video='false',
                              sort_by='vote_count.desc', with_genres=genre,
                              **{'vote_count.gte': 50 if genre == 99 else 200, 'primary_release_date.lte': as_of})['results'])
        pools.append(call('discover/movie', page=page, include_adult='false', sort_by='vote_count.desc',
                          with_original_language='zh|cn', **{'primary_release_date.lte': as_of})['results'])
        for offset in range(20):
            for pool in pools:
                if offset >= len(pool): continue
                key = str(pool[offset]['id'])
                if key not in seen: seen.add(key); candidates.append(key)
        for key in candidates:
            if key in items or key in skipped: continue
            try:
                raw = call('movie/' + key, append_to_response='credits,alternative_titles')
                row = normalize(raw, as_of)
            except Problem as error:
                # Stop after a source outage rather than treating a failed batch as empty movies.
                persist(); raise RuntimeError('TMDB detail unavailable; rerun resumes safely') from error
            if row: items[key] = row
            else: skipped.add(key)
            if (len(items) + len(skipped)) % 20 == 0:
                persist(); print(json.dumps({'accepted': len(items), 'skipped': len(skipped), 'requests_this_run': requests}), flush=True)
            if len(items) >= limit: break
        if len(items) >= limit: break
    persist()
    if len(items) < limit: raise RuntimeError('not enough complete films; final snapshot left unchanged')
    # Never retire already-published IDs as a side effect of a refresh.
    rows = list(items.values())
    assert len({r['source_id'] for r in rows}) == len(rows) >= limit
    payload = {'provider': 'TMDB', 'as_of': as_of, 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'genres': genres, 'movies': rows}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.new.json'); temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n')
    os.replace(temporary, output)
    print(json.dumps({'complete': True, 'count': len(rows), 'bytes': output.stat().st_size,
                      'genres': {g['name']: sum(g['id'] in r['genre_ids'] for r in rows) for g in genres}}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--limit', type=int, default=500)
    parser.add_argument('--as-of', required=True)
    args = parser.parse_args()
    if not 1 <= args.limit <= 1000: parser.error('limit must be between 1 and 1000')
    datetime.date.fromisoformat(args.as_of)
    build(args.output, args.limit, args.as_of)
