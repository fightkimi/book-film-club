"""Insert authored discussion prompts into the explicitly selected trial DB; safe to repeat."""
import argparse
import json
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def seed(db, catalog, prompts):
    stores = {s['id']: s for s in catalog}
    cities = {s['city'] for s in catalog} | {'全国'}
    count = 0
    seen = set()
    with db:
        db.execute('BEGIN IMMEDIATE')
        for prompt in prompts:
            key = prompt['key']
            assert key and key not in seen
            seen.add(key)
            shop = prompt.get('shop')
            city = stores[shop]['city'] if shop else prompt['city']
            if city not in cities or not (0 < len(prompt['title']) <= 60 and 0 < len(prompt['body']) <= 1200):
                raise ValueError(key)
            author = 'editorial:' + key
            count += db.execute("""INSERT INTO post(shop,scope,author,kind,title,body,published,city)
                SELECT ?, 'city', ?, '编辑话题', ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM post WHERE author=? AND kind='编辑话题')""",
                (shop,author,prompt['title'],prompt['body'],datetime.now().astimezone().isoformat(timespec='seconds'),city,author)).rowcount
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('database', type=Path)
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error('Existing bookstore database required')
    with closing(sqlite3.connect(args.database)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        print('Inserted:',seed(db,json.loads((ROOT/'bookstore_catalog.json').read_text()),json.loads((ROOT/'bookstore_editorial.json').read_text())))
