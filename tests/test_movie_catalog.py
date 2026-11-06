from pathlib import Path
import copy
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import bookstores
import movie_catalog as movies
import personal_reading as personal
from domain import Problem
from scripts.build_movie_catalog import normalize


class MovieCatalog(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.rows = json.loads(Path(movies.__file__).with_name('movie_catalog.json').read_text())['movies'][:2]
        self.file = self.root/'catalog.json'
        self.file.write_text(json.dumps({'movies':self.rows,'genres':[], 'as_of':'2026-11-06'}))
        self.env = patch.dict(os.environ, MOVIE_CATALOG_FILE=str(self.file)); self.env.start(); self.addCleanup(self.env.stop)
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close);bookstores.initialize(self.db)
        self.user={'id':'me','role':'member','name':'本人'};self.state={'works':[]}

    def op(self,name,data=None,q=None,user=True):
        return personal.handle(self.db,name,q or {},data,self.user if user else None,lambda:self.state,lambda:{'books':[]})

    def test_catalog_is_real_distinct_complete_and_outside_the_client_package(self):
        data=json.loads(Path(movies.__file__).with_name('movie_catalog.json').read_text());rows=data['movies']
        self.assertGreaterEqual(len(rows),500);self.assertEqual(len(rows),len({r['id'] for r in rows}))
        self.assertGreaterEqual(len({g for r in rows for g in r['genre_ids']}),15)
        for row in rows:
            for key in ('title','creator','description','image','tags'):self.assertTrue(row[key])
            self.assertTrue(row['release_date']<=data['as_of'])
            self.assertEqual(row['source_url'],'https://www.themoviedb.org/movie/'+row['source_id'])
        self.assertFalse(Path('miniprogram/movie_catalog.json').exists())

    def test_index_is_short_but_detail_retains_full_synopsis_and_requires_login(self):
        self.rows[0]['description']='中文简介。'*100
        self.file.write_text(json.dumps({'movies':self.rows,'genres':[], 'as_of':'2026-11-06'}))
        with patch('metadata.tmdb',side_effect=AssertionError('browse must not call upstream')):
            self.assertEqual(len(self.op('movie-catalog')['movies'][0]['description']),180)
            self.assertEqual(self.op('movie-detail',q={'id':self.rows[0]['id']})['item']['description'],self.rows[0]['description'])
        with self.assertRaises(Problem) as denied:self.op('movie-catalog',user=False)
        self.assertEqual(denied.exception.status,401)
        with self.assertRaises(Problem):movies.detail('https://example.com')

    def test_new_movie_can_be_planned_and_reviewed_without_modifying_group_works(self):
        row=self.op('add',{'source':'catalog','kind':'movie','source_id':self.rows[0]['id'],'month':'2026-11'})['item']
        self.assertEqual(self.state['works'],[])
        self.assertEqual(self.op('item',q={'item':row['id']})['months'],['2026-11'])
        saved=self.op('save',{'item':row['id'],'rev':row['rev'],'status':'done','progress':100,'tracking':'manual','finished_at':'2026-11-01','reflection':'这是自己的影评。','rating':None})['item']
        self.assertEqual(saved['reflection'],'这是自己的影评。')
        self.assertEqual(self.op('add',{'source':'catalog','kind':'movie','source_id':self.rows[0]['id']})['item']['id'],row['id'])

    def test_later_local_import_does_not_duplicate_a_personal_movie(self):
        first=self.op('add',{'source':'catalog','kind':'movie','source_id':self.rows[0]['id']})['item']
        self.state['works']=[{**self.rows[0],'id':'local-1','private_note':'must not leak','extra':{'runtime':120,'internal':'hidden'}}]
        choices=self.op('sources',q={'source':'catalog','kind':'movie','expanded':'1'})['items']
        self.assertEqual(len(choices),2);self.assertEqual(choices[0]['id'],'work:local-1')
        self.assertNotIn('private_note',choices[0]);self.assertNotIn('internal',str(choices[0]))
        second=self.op('add',{'source':'catalog','kind':'movie','source_id':'work:local-1'})['item']
        self.assertEqual(first['id'],second['id'])

    def test_partial_duplicate_or_malformed_snapshot_is_not_served(self):
        self.file.write_text(json.dumps({'movies':[self.rows[0],self.rows[0]],'genres':[],'as_of':'2026-11-06'}))
        with self.assertRaises(Problem) as error:movies.listing()
        self.assertEqual(error.exception.status,503)

    def test_builder_rejects_unreleased_adult_and_incomplete_sources(self):
        sample={'id':123,'title':'电影','release_date':'2020-01-01','overview':'完整中文简介','poster_path':'/poster.jpg','genres':[{'id':18,'name':'剧情'}],'credits':{'crew':[{'job':'Director','name':'导演'}]}}
        self.assertEqual(normalize(sample,'2026-11-06')['id'],'tmdb:123')
        for change in [{'adult':True},{'release_date':'2099-01-01'},{'overview':'English only'},{'credits':{}},{'poster_path':''}]:
            self.assertIsNone(normalize({**sample,**change},'2026-11-06'))

    def test_primary_browse_categories_keep_raw_tags_and_correct_named_examples(self):
        corpus=json.loads(Path(movies.__file__).with_name('movie_catalog.json').read_text())['movies']
        byid={r['source_id']:r for r in corpus}
        self.assertIn('音乐与歌舞',movies.classify(byid['313369']))
        self.assertIn('音乐与歌舞',movies.classify(byid['316029']))
        self.assertEqual(movies.classify(byid['13']),['剧情'])
        self.assertEqual(movies.classify(byid['854']),['喜剧','奇幻'])
        for row in corpus:
            before=copy.deepcopy(row);categories=movies.classify(row)
            self.assertTrue(1<=len(categories)<=2);self.assertNotIn('待归类',categories)
            self.assertEqual(row,before)
        for key in ['313369','316029','82695']:
            self.assertIn('音乐与歌舞',movies.classify(byid[key]))
        for key in ['13','854','12405','453']:
            self.assertNotIn('爱情',movies.classify(byid[key]))
