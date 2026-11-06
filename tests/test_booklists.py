import os
import unittest
from unittest.mock import patch
import booklists
from domain import Problem, empty_state, mutate


class SharedBooklists(unittest.TestCase):
    def test_group_merges_visible_titles_with_local_detail_and_no_private_leak(self):
        books=[{'id':'l','kind':'book','title':'书A','creator':'作者','provider':'weread','source_id':'11'},
               {'id':'m','kind':'movie','title':'电影','creator':'导演'}]
        raw={'books':[{'bookId':'11','title':'书A','author':'作者'},
                      {'bookId':'12','title':'书Ａ','author':'作者'},
                      {'bookId':'13','title':'另一书','author':'丙'},
                      {'bookId':'14','title':'私密书','secret':1}]}
        with patch.dict(os.environ,{'WEREAD_SHARED_SHELF_OWNER':'甲','WEREAD_API_KEY':'fixture'},clear=True),patch('weread.shared_shelf',return_value=raw):
            result=booklists.group({'works':books})
            self.assertEqual([r['id'] for r in result['books']],['l','13'])
            self.assertEqual(result['books'][0]['workId'],'l')
    def test_private_books_never_escape_in_rows_or_folders(self):
        raw = {'books':[{'bookId':'1','title':'公开'}, {'bookId':'2','title':'私密','secret':1}, {'bookId':'CB_1','title':'个人文档'}],
               'archive':[{'name':'选读','bookIds':['1','2','CB_1']},{'name':'隐私','bookIds':['2']}]}
        env = {'WEREAD_API_KEY':'fixture', 'WEREAD_SHARED_SHELF_OWNER':'甲','WEREAD_MEMBER_KEYS':'{"乙":null}'}
        with patch.dict(os.environ,env,clear=True),patch('weread.shared_shelf',return_value=raw) as fetch:
            data=booklists.member('甲',{});self.assertEqual([b['id'] for b in data['books']],['1'])
            self.assertEqual(data['folders'],[{'name':'选读','ids':['1']}]);self.assertFalse(booklists.member('乙',{})['connected'])
            with self.assertRaises(Problem):booklists.member('其他',{})
            fetch.assert_called_once_with('fixture')
            self.assertNotIn('fixture',str(booklists.directory({})))
            with patch.dict(os.environ,{'WEREAD_FULL_SHELF_OWNER':'甲'}):
                full=booklists.member('甲',{})
                self.assertEqual(len(full['books']),3)
                self.assertEqual(full['scope'],'full')
                self.assertNotIn('CB_1',str(full))
                self.assertTrue(full['books'][2]['personalUpload'])
            with patch.dict(os.environ,{'WEREAD_FULL_SHELF_OWNER':'乙'}):
                self.assertEqual(len(booklists.member('甲',{})['books']),1)
    def test_imports_remain_attributed_without_a_key(self):
        state={'imported_booklists':{'甲':['b']},'works':[{'id':'b','title':'原书','kind':'book'},{'id':'c','title':'其他','kind':'book'}]}
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(booklists.directory(state)['members'][0]['source'],'import')
            self.assertEqual([b['workId'] for b in booklists.member('甲',state)['books']],['b'])
        with self.assertRaises(Problem):booklists.rank('https://example.com')
    def test_activity_owner_may_only_create_edit_publish_own_draft(self):
        state=empty_state();a={'id':'a','role':'admin'};u={'id':'u','role':'organizer'};v={'id':'v','role':'member'};users=[a,u,v]
        def act(user,action,p):return mutate(state,user,action,p,users)
        theme=act(a,'theme.save',{'title':'主题'})
        work=act(a,'work.save',dict(kind='book',title='书',creator='作者',image='https://example.com/b',description='简介',source_url='https://example.com',metadata_status='confirmed'))
        p=dict(title='期',start='2026-11-01',end='2026-12-01',theme_id=theme['id'],member_ids=['u'],work_ids=[work['id']],created_by='a')
        ordinary=act(v,'cycle.save',p);self.assertEqual(ordinary['created_by'],'v')
        foreign=act(a,'cycle.save',p)
        for action,args in [('cycle.save',dict(p,id=foreign['id'])),('cycle.transition',dict(id=foreign['id'],status='active')),('theme.save',{'id':theme['id'],'title':'外部'})]:
            with self.assertRaises(Problem):act(u,action,args)
        own=act(u,'cycle.save',p);self.assertEqual(own['created_by'],'u')
        act(u,'cycle.save',dict(p,id=own['id']));act(u,'cycle.transition',dict(id=own['id'],status='active'))
        with self.assertRaises(Problem):act(u,'cycle.transition',dict(id=own['id'],status='closed'))
