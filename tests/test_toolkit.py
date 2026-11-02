import copy
import json
import os
import unittest
from unittest.mock import patch
import imports
import metadata
import sources
import studies
import weread
from domain import Problem, empty_state
from test_companion import sample_state

class ImportContracts(unittest.TestCase):
    def setUp(self):
        self.state=sample_state();self.user={'id':'reader','role':'member'}
        self.state['works'][0].update(title='春光乍泄',year='1997',provider='tmdb',source_id='18329')
    def preview(self,content,provider='letterboxd',status='done'):
        return imports.parse(dict(provider=provider,content=content,status=status),self.state)
    def test_csv_chinese_and_multiline_review_and_half_rating(self):
        result=self.preview('Name,Year,Rating,Review,Watched Date,tmdbID\n春光乍泄,1997,4.5,"第一句\n第二句",2026-01-01,18329')
        row=result['rows'][0]
        self.assertEqual(row['rating'],4.5);self.assertEqual(row['body'],'第一句\n第二句')
        self.assertEqual(row['suggested_work_id'],'short')
    def test_import_idempotent_private_and_does_not_finish_cycle(self):
        p=self.preview('Name,Year,Rating\n春光乍泄,1997,4.5')
        key=p['rows'][0]['source_key'];payload=dict(selected=[key],mappings={key:'short'},sync_shelf=True)
        before=copy.deepcopy(self.state['records'])
        self.assertEqual(imports.apply_preview(self.state,self.user,p,payload)['added'],1)
        self.assertEqual(imports.apply_preview(self.state,self.user,p,payload)['skipped'],1)
        self.assertEqual(self.state['records'],before)
        self.assertEqual(self.state['journals'][0]['user_id'],'reader')
        self.assertEqual(self.state['shelves'][0]['status'],'done')
    def test_douban_updates_same_record_without_duplicating(self):
        first=self.preview('title,url,date,rating,status,comment\n活着,https://book.douban.com/subject/123/,2026-01-01,★★★★★,在读,原评','douban')
        second=self.preview('title,url,date,rating,status,comment\n活着,https://book.douban.com/subject/123/,2026-01-02,★★★★,读过,新评','douban')
        k=first['rows'][0]['source_key'];self.assertEqual(k,second['rows'][0]['source_key'])
        imports.apply_preview(self.state,self.user,first,dict(selected=[k]))
        imports.apply_preview(self.state,self.user,second,dict(selected=[k],overwrite=True))
        self.assertEqual(len(self.state['journals']),1);self.assertEqual(self.state['journals'][0]['body'],'新评')
    def test_distinct_rewatches_are_preserved(self):
        p=self.preview('Name,Watched Date,Letterboxd URI\nFilm,2026-01-01,https://letterboxd.com/film/film/\nFilm,2026-02-01,https://letterboxd.com/film/film/')
        self.assertEqual(len(p['rows']),2)
    def test_unsafe_urls_and_nonfinite_ratings_rejected_per_row(self):
        p=self.preview('Name,Rating,Letterboxd URI\nBad,4,javascript:alert(1)\nBad,NaN,https://letterboxd.com/film/a/\nGood,4,https://letterboxd.com/film/b/')
        self.assertEqual(len(p['rows']),1);self.assertEqual(len(p['errors']),2)
    def test_trakt_ten_point_ratings_and_no_watched_inference(self):
        row={'movie':{'title':'电影','year':2020,'ids':{'trakt':1,'tmdb':2}},'rating':9}
        p=self.preview(json.dumps([row]),'trakt','none')
        self.assertEqual(p['rows'][0]['rating'],4.5);self.assertEqual(p['rows'][0]['status'],'none')
    def test_trakt_public_request_is_fixed_host_and_paginated(self):
        with patch.dict(os.environ,{'TRAKT_CLIENT_ID':'test-only'}),patch('imports.read_json',return_value=[]) as read:
            imports.trakt_page(dict(username='reader',page=2,collection='ratings'))
            self.assertIn('/users/reader/ratings/movies?page=2&limit=50',read.call_args.args[0])
        with self.assertRaises(Problem): imports.trakt_page(dict(username='../me'))
    def test_unknown_selected_key_and_wrong_kind_cannot_import(self):
        p=self.preview('Name\nA')
        with self.assertRaises(Problem):imports.apply_preview(self.state,self.user,p,dict(selected=['forged']))
        k=p['rows'][0]['source_key']
        with self.assertRaises(Problem):imports.apply_preview(self.state,self.user,p,dict(selected=[k],mappings={k:'book'}))
    def test_import_limits_and_duplicates(self):
        with self.assertRaises(Problem):self.preview('Name\n'+'A\n'*201)
        p=self.preview('Name\nA\nA');self.assertEqual(len(p['rows']),1);self.assertEqual(len(p['errors']),1)

class StudyContracts(unittest.TestCase):
    def setUp(self):self.state=sample_state();self.work=self.state['works'][0]
    def test_shots_validate_time_and_evidence(self):
        for shot in [dict(start=10,end=3,evidence='内容'),dict(start=0,end=float('nan'),evidence='内容'),dict(start=0,end=3,evidence='')]:
            with self.assertRaises(Problem): studies.notebook(dict(mode='shots',shots=[shot]),self.work)
        with self.assertRaises(Problem):studies.notebook(dict(mode='shots',shots=[dict(start=0,end=5,evidence='一'),dict(start=4,end=8,evidence='二')]),self.work)
    def test_ai_requires_actual_notes_and_verifies_quotes(self):
        with self.assertRaises(Problem):studies.ai_context(dict(work_id='short',mode='analysis'),self.state)
        context=studies.ai_context(dict(work_id='short',mode='analysis',notes='房间里只剩下钟声。'),self.state)
        valid={'summary':'可能表达孤独','claims':[{'quote':'只剩下钟声','interpretation':'一种可能的解读'}],'questions':['钟声如何变化？']}
        self.assertEqual(studies.validate_analysis(valid,context),valid)
        valid['claims'][0]['quote']='镜头推进到人物脸部'
        with self.assertRaises(ValueError):studies.validate_analysis(valid,context)
    def test_studies_are_owned_and_save_separately(self):
        p=dict(work_id='short',mode='analysis',notes='事实',reflection='解读')
        studies.save(self.state,{'id':'one'},p);studies.save(self.state,{'id':'two'},p)
        studies.save(self.state,{'id':'one'},dict(p,notes='新事实'))
        self.assertEqual(len(self.state['studies']),2)
        self.assertEqual(self.state['studies'][0]['notes'],'新事实')
        self.assertEqual(self.state['studies'][1]['notes'],'事实')

class SourceContracts(unittest.TestCase):
    def setUp(self):sources._cache.clear();sources._last.clear()
    def test_source_cache_and_host_boundary(self):
        with patch('metadata.fetch_json',return_value={'title':'书'}) as fetch:
            a=sources.read_json('https://openlibrary.org/test.json');a['title']='changed'
            self.assertEqual(sources.read_json('https://openlibrary.org/test.json')['title'],'书')
            self.assertEqual(fetch.call_count,1)
        for url in ['http://openlibrary.org/test','https://127.0.0.1/test','https://openlibrary.org.evil.test/test','https://user@openlibrary.org/test']:
            with self.assertRaises(Problem): sources.read_json(url)
    def test_google_metadata_sanitizes_html_and_image_host(self):
        data={'id':'abc_123','volumeInfo':{'title':'中文书','authors':['作者'],'description':'<b>介绍</b>&amp;文字','imageLinks':{'thumbnail':'https://evil.test/track'},'industryIdentifiers':[{'type':'ISBN_13','identifier':'9780140328721'}]}}
        item=metadata.google_item(data)
        self.assertEqual(item['description'],'介绍&文字');self.assertEqual(item['image'],'')
        with self.assertRaises(Problem):metadata.google_detail('../private')
    def test_weread_flat_request_and_scope17_results(self):
        response={'results':[{'scope':17,'books':[{'bookInfo':{'bookId':'123','title':'三体','author':'刘慈欣','intro':'简介','readerLink':'https://weread.qq.com/web/reader/example','cover':'https://cdn.qpic.cn/book.jpg'}}]}]}
        with patch.dict(os.environ,{'WEREAD_API_KEY':'wrk-test-only'}),patch('weread.read_json',return_value=response) as read:
            books=weread.search('三体');self.assertEqual(books[0]['title'],'三体')
            payload=read.call_args.kwargs['payload'];self.assertEqual(payload['scope'],10);self.assertEqual(payload['skill_version'],'1.0.5');self.assertNotIn('params',payload)
    def test_weread_upgrade_and_private_api_fail_closed(self):
        with patch.dict(os.environ,{'WEREAD_API_KEY':'wrk-test-only'}),patch('weread.read_json',return_value={'upgrade_info':{'message':'untrusted'}}):
            with self.assertRaises(Problem) as err:weread.search('书')
            self.assertEqual(err.exception.status,503)
        with self.assertRaises(Problem):weread.gateway('/shelf/sync')
    def test_weread_missing_links_are_not_invented(self):
        item=weread.book_item({'bookId':'1','title':'书','publishTime':1748563200,'readerLink':'javascript:alert(1)'})
        self.assertEqual(item['source_url'],'');self.assertRegex(item['year'],r'^\d{4}-\d{2}-\d{2}$')
    def test_tmdb_chinese_aliases_and_independent_ratings(self):
        data={'title':'中文名','id':1,'imdb_id':'tt1234567','vote_average':8.2,'vote_count':10,'alternative_titles':{'titles':[{'title':'繁體譯名','iso_3166_1':'TW'}]}}
        with patch('metadata.tmdb',return_value=data) as call:
            item=metadata.detail('tmdb','1');self.assertEqual(item['extra']['aliases'],['繁體譯名']);self.assertEqual(call.call_args.kwargs['append_to_response'],'credits,alternative_titles')
        with patch('metadata.tmdb',side_effect=[data,{'results':[]}]),patch.dict(os.environ,{'OMDB_KEY':'test'}),patch('metadata.read_json',return_value={'Ratings':[{'Source':'Rotten Tomatoes','Value':'95%'}]}):
            r=metadata.film_extras(dict(provider='tmdb',source_id='1',source_url='https://www.themoviedb.org/movie/1'))
            self.assertEqual([x['value'] for x in r['ratings']],['8.2 / 10','95%'])

class AnalysisResponseContract(unittest.TestCase):
    def test_model_cannot_invent_quoted_evidence(self):
        import ai
        from test_companion import ENV
        context=studies.ai_context(dict(work_id='short',mode='analysis',notes='只听见雨声。'),sample_state())
        result={'summary':'一种解释','claims':[{'quote':'并不存在的镜头','interpretation':'不可信'}],'questions':['继续观察？']}
        with patch.dict(os.environ,ENV),patch('ai.fetch_json',return_value={'choices':[{'message':{'content':json.dumps(result)}}]}):
            with self.assertRaises(Problem) as error:ai.generate('study',context)
            self.assertEqual(error.exception.status,502)
        result['claims'][0]['quote']='只听见雨声'
        with patch.dict(os.environ,ENV),patch('ai.fetch_json',return_value={'choices':[{'message':{'content':json.dumps(result)}}]}):
            self.assertEqual(ai.generate('study',context),result)
