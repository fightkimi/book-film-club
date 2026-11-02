import copy
import json
import os
import unittest
from unittest.mock import patch

import ai
import companion
from domain import Problem, empty_state

ENV = {'AI_CHAT_URL': 'https://example.com/chat', 'AI_API_KEY': 'test-only', 'AI_MODEL': 'fixture'}


def sample_state(member='reader'):
    state = empty_state()
    state['themes'] = [dict(id='theme', title='关于相遇', description='关系', angles='距离')]
    state['works'] = [dict(id=key, title=key, kind=kind, creator='创作者', description='公开资料',
                           metadata_status=status, extra={'runtime': minutes})
                      for key, kind, minutes, status in [
                          ('short', 'movie', 90, 'confirmed'), ('long', 'movie', 150, 'confirmed'),
                          ('unknown', 'movie', None, 'confirmed'), ('book', 'book', None, 'confirmed'),
                          ('pending', 'movie', 80, 'pending')]]
    state['cycles'] = [dict(id='cycle', status='active', participants={member: {'status': 'joined'}},
                            theme=state['themes'][0], works=copy.deepcopy(state['works'][:1]))]
    state['records'] = [dict(user_id='other', work_id='short', progress=100, note='PRIVATE NOTE')]
    state['reviews'] = [dict(user_id='other', body='OTHER REVIEW')]
    return state


class CompanionContracts(unittest.TestCase):
    def test_generation_guard_limits_concurrency_and_recovers_from_failure(self):
        with companion.generation_slot('concurrency-fixture'):
            with self.assertRaises(Problem) as error:
                with companion.generation_slot('concurrency-fixture'): pass
            self.assertEqual(error.exception.status, 429)
        with self.assertRaises(RuntimeError):
            with companion.generation_slot('failure-fixture'): raise RuntimeError()
        with companion.generation_slot('failure-fixture'): pass

    def test_generation_guard_expires_after_one_minute(self):
        with patch('companion.time.monotonic', return_value=100):
            for _ in range(6):
                with companion.generation_slot('rate-fixture'): pass
            with self.assertRaises(Problem) as error:
                with companion.generation_slot('rate-fixture'): pass
            self.assertEqual(error.exception.status, 429)
        with patch('companion.time.monotonic', return_value=161):
            with companion.generation_slot('rate-fixture'): pass

    def setUp(self):
        self.state = sample_state()
        self.user = {'id': 'reader', 'role': 'member'}

    def test_duration_and_pending_and_type_are_hard_filters(self):
        result = companion.discover(self.state, self.user, dict(theme_id='theme', kind='movie', minutes=90))
        self.assertEqual([w['id'] for w in result['works']], ['short'])
        self.assertEqual([w['id'] for w in result['context']['candidates']], ['short'])

    def test_seen_exclusion_is_personal_and_does_not_modify_progress(self):
        self.state['shelves'] = [dict(user_id='reader', work_id='short', status='done')]
        self.state['records'].append(dict(user_id='reader', work_id='book', progress=100))
        before = copy.deepcopy(self.state)
        ids = [w['id'] for w in companion.discover(self.state, self.user, dict(theme_id='theme'))['works']]
        self.assertNotIn('short', ids)
        self.assertNotIn('book', ids)
        ids = [w['id'] for w in companion.discover(self.state, self.user, dict(theme_id='theme', exclude_seen=False))['works']]
        self.assertIn('short', ids)
        self.assertEqual(before, self.state)

    def test_book_not_subject_to_movie_duration(self):
        result = companion.discover(self.state, self.user, dict(theme_id='theme', kind='book', minutes=90))
        self.assertEqual([w['id'] for w in result['works']], ['book'])

    def test_invalid_filters_rejected(self):
        for args in [{'minutes': -1}, {'minutes': True}, {'kind': 'series'}, {'exclude_seen': 'true'}]:
            with self.subTest(args=args), self.assertRaises(Problem):
                companion.discover(self.state, self.user, dict(theme_id='theme', **args))

    def test_review_uses_frozen_work_and_only_explicit_draft(self):
        self.state['works'][0]['description'] = 'updated after publication'
        context = companion.context_for('review', self.state, self.user,
                                        dict(cycle_id='cycle', work_id='short', body='我的原稿', spoiler=False))
        self.assertEqual(context['work']['description'], '公开资料')
        self.assertEqual(context['draft'], '我的原稿')
        self.assertNotIn('PRIVATE', json.dumps(context))
        self.assertNotIn('OTHER', json.dumps(context))

    def test_review_requires_participation_and_unarchived_cycle(self):
        payload = dict(cycle_id='cycle', work_id='short', body='原稿')
        with self.assertRaises(Problem) as error:
            companion.context_for('review', self.state, dict(id='outsider'), payload)
        self.assertEqual(error.exception.status, 403)
        self.state['cycles'][0]['status'] = 'archived'
        with self.assertRaises(Problem) as error:
            companion.context_for('review', self.state, self.user, payload)
        self.assertEqual(error.exception.status, 409)

    def generate(self, task, result, context=None):
        with patch.dict(os.environ, ENV), patch('ai.fetch_json', return_value={'choices': [{'message': {'content': json.dumps(result)}}]}):
            return ai.generate(task, context or {})

    def test_recommendations_cannot_invent_or_repeat_work_ids(self):
        context = {'candidates': [{'id': 'short'}]}
        for ids in [['fabricated'], ['short', 'short']]:
            with self.subTest(ids=ids), self.assertRaises(Problem) as error:
                self.generate('recommend', {'recommendations': [{'work_id': key, 'reason': '理由'} for key in ids]}, context)
            self.assertEqual(error.exception.status, 502)
        self.assertEqual(self.generate('recommend', {'recommendations': []}, context), {'recommendations': []})

    def test_guide_and_review_output_validation(self):
        good = dict(intro='观察建议', watchpoints=['观察一', '观察二'], questions=['问题一', '问题二'], terms=[])
        self.assertEqual(self.generate('guide', good), good)
        for bad in [[], dict(good, terms=[None]), dict(good, questions='不是数组')]:
            with self.subTest(bad=bad), self.assertRaises(Problem) as error:
                self.generate('guide', bad)
            self.assertEqual(error.exception.status, 502)
        with self.assertRaises(Problem):
            self.generate('review', dict(polished='伪造正文', suggestions=[], questions=['问题']))
        good = dict(polished='我的整理稿', suggestions=['表达更清楚'], questions=['哪个细节？'])
        self.assertEqual(self.generate('review', good), good)

    def test_large_candidate_context_remains_valid_json(self):
        context = {'candidates': [{'id': str(i), 'description': '资' * 1200} for i in range(24)]}
        with patch.dict(os.environ, ENV), patch('ai.fetch_json', return_value={'choices': [{'message': {'content': '{"recommendations":[]}'}}]}) as fetch:
            ai.generate('recommend', context)
            self.assertEqual(json.loads(fetch.call_args.args[2]['messages'][1]['content']), context)
