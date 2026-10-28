import json
import os
import unittest
from unittest.mock import patch
import ai
import metadata
from domain import Problem

class ServiceContracts(unittest.TestCase):
    def test_ai_unconfigured(self):
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaises(Problem) as e: ai.generate('themes',{})
            self.assertEqual(e.exception.status,503)
    def test_ai_invalid_schema_cannot_be_accepted(self):
        with patch.dict(os.environ,{'AI_CHAT_URL':'https://example.com/chat','AI_API_KEY':'test-only','AI_MODEL':'fixture'}),patch('ai.fetch_json',return_value={'choices':[{'message':{'content':'{"themes": "bad"}'}}]}):
            with self.assertRaises(Problem) as e:ai.generate('themes',{})
            self.assertEqual(e.exception.status,502)
    def test_ai_json_is_validated(self):
        payload={'themes':[{'title':'主题','description':'说明','angles':'角度'}]}
        with patch.dict(os.environ,{'AI_CHAT_URL':'https://example.com/chat','AI_API_KEY':'test-only','AI_MODEL':'fixture'}),patch('ai.fetch_json',return_value={'choices':[{'message':{'content':json.dumps(payload)}}]}):
            self.assertEqual(ai.generate('themes',{}),payload)
    def test_isbn_checksum(self):
        with self.assertRaises(Problem):metadata.search('book','9780000000000')
    def test_openlibrary_search_maps_cover(self):
        with patch('metadata.fetch_json',return_value={'docs':[{'key':'/works/OL123W','title':'Book','cover_i':123,'author_name':['Author'],'first_publish_year':2001}]}):
            r=metadata.search('book','book')[0]
            self.assertIn('123-L.jpg',r['image']);self.assertEqual(r['creator'],'Author')
    def test_no_arbitrary_fetch_urls(self):
        with self.assertRaises(Problem):metadata.detail('openlibrary','https://127.0.0.1/secret')
        with self.assertRaises(Problem):metadata.detail('tmdb','../../secret')
    def test_movie_requires_configuration(self):
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaises(Problem) as e:metadata.search('movie','test')
            self.assertEqual(e.exception.status,503)
    def test_movie_fields_and_images(self):
        with patch('metadata.tmdb',return_value={'title':'Movie','poster_path':'/poster.jpg','backdrop_path':'/backdrop.jpg','release_date':'2020-01-01','overview':'Synopsis','runtime':90,'genres':[{'name':'剧情'}],'credits':{'crew':[{'job':'Director','name':'Director'}],'cast':[{'name':'Actor'}]}}):
            r=metadata.detail('tmdb','123');self.assertEqual(r['creator'],'Director');self.assertEqual(r['extra']['cast'],['Actor']);self.assertTrue(r['image'].endswith('/poster.jpg'))
