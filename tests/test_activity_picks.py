import copy
import json
import os
import unittest
from unittest.mock import patch

import activity_picks as picks
import ai
from domain import Problem


class ActivityPicks(unittest.TestCase):
    def setUp(self):
        self.state={'themes':[{'id':'theme','title':'迟来的道歉','description':'那些没说出口的话','angles':'如何回应？'}],
                    'works':[{'id':'book','kind':'book','title':'公开书目','creator':'作者','description':'关于道歉的书','metadata_status':'confirmed','private_note':'PRIVATE'}],
                    'journals':[{'body':'PRIVATE'}], 'members':[{'key':'SECRET'}]}
        self.movies=[{'id':'tmdb:'+str(i),'source_id':str(i),'provider':'tmdb','kind':'movie','title':'电影'+str(i),
                      'creator':'导演','description':'一段公开简介','tags':'剧情'} for i in range(1,100)]

    def test_type_selection_scope_deduplication_and_private_field_exclusion(self):
        original=copy.deepcopy(self.state)
        with patch('movie_catalog.snapshot',return_value={'movies':self.movies}):
            works,context=picks.candidates(self.state,{'kind':'movie','theme_id':'theme','exclude':['tmdb:1']})
            self.assertLessEqual(len(works),48)
            self.assertTrue(all(w['kind']=='movie' and w['id']!='tmdb:1' for w in works))
            self.assertNotIn('PRIVATE',json.dumps(context));self.assertNotIn('SECRET',json.dumps(context))
            self.assertTrue(context['activity_selection'])
            self.state['works'].append(dict(self.movies[0],id='canonical',metadata_status='confirmed'))
            chosen,_=picks.candidates(self.state,{'kind':'mixed','theme_id':'theme'})
            self.assertIn('book',{w['id'] for w in chosen})
            self.assertNotIn('tmdb:1',{w['id'] for w in chosen})
        self.assertEqual(self.state['journals'],original['journals'])

    def test_book_selection_does_not_require_the_movie_service(self):
        with patch('movie_catalog.snapshot',side_effect=AssertionError('not needed')):
            works,_=picks.candidates(self.state,{'kind':'book','theme_id':'theme'})
            self.assertEqual([w['id'] for w in works],['book'])

    def test_theme_match_is_included_and_context_is_bounded(self):
        self.movies[-1]['description']='一段关于迟来的道歉与回应的故事。'*1000
        with patch('movie_catalog.snapshot',return_value={'movies':self.movies}):
            works,context=picks.candidates(self.state,{'kind':'movie','theme_id':'theme'})
            self.assertIn('tmdb:99',{w['id'] for w in works})
            self.assertTrue(all(len(w['description'])<=240 for w in context['candidates']))
        with self.assertRaises(Problem):picks.candidates(self.state,{'kind':'book','theme_id':'missing'})
        with self.assertRaises(Problem):picks.candidates(self.state,{'kind':'book','theme_id':'theme','exclude':'book'})

    def test_recommendations_cannot_invent_duplicate_or_leak_fields(self):
        rows=[{'work_id':'book','reason':'与主题相关','caveat':''}]
        result=picks.present(self.state['works'],{'recommendations':rows})
        self.assertNotIn('PRIVATE',str(result));self.assertEqual(result['recommendations'][0]['kind'],'book')
        for invalid in ([{'work_id':'missing'}],rows*2,rows*7):
            with self.assertRaises(Problem):picks.present(self.state['works'],{'recommendations':invalid})

    def test_activity_recommendation_reuses_human_writing_and_bounded_timeout(self):
        context={'activity_selection':True,'candidates':[{'id':'book'}]}
        response={'choices':[{'message':{'content':json.dumps({'recommendations':[{'work_id':'book','reason':'从具体分歧切入','caveat':''}]})}}]}
        with patch.dict(os.environ,{'AI_CHAT_URL':'https://example.com/chat','AI_API_KEY':'fixture','AI_MODEL':'fixture'}),patch('ai.fetch_json',return_value=response) as request:
            ai.generate('recommend',context)
            self.assertEqual(request.call_args.kwargs['timeout'],50)
            prompt=request.call_args.args[2]['messages'][0]['content']
            self.assertIn('不编亲身阅读',prompt)
            self.assertIn('3至6部',prompt)
