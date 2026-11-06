from concurrent.futures import ThreadPoolExecutor
import copy
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import bookstores as b
import personal_reading as p
import personal_vault as vault
import personal_weread as wr
from domain import Problem

KEY='wrk-local-test-fixture-only'
SHELF={'books':[{'id':'book1','title':'测试书','creator':'作者','image':''}], 'folders':[], 'counts':{'ebooks':1,'audio':0,'article_collections':0,'total_entries':1}}


class PersonalRecords(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.file=self.root/'books.sqlite3'
        self.env=patch.dict(os.environ,BOOKSTORES_DB=str(self.file),PERSONAL_VAULT_KEY_FILE=str(self.root/'secret.key'))
        self.env.start();self.addCleanup(self.env.stop)
        self.db=self.connection();self.addCleanup(self.db.close);b.initialize(self.db)
        self.user={'id':'owner','role':'member','name':'本人'}
        self.other={'id':'admin','role':'admin','name':'管理员'}
        self.state={'works':[],'shelves':[],'journals':[],'cycles':[]}
        with p._lock:p._starts.clear()

    def connection(self):
        db=sqlite3.connect(self.file);db.row_factory=sqlite3.Row;db.execute('pragma foreign_keys=on');return db

    def op(self,op,data=None,q=None,user=None):
        try:return p.handle(self.db,op,q or {},data,self.user if user is None else user,lambda:copy.deepcopy(self.state),lambda:{'books':[]})
        except Exception:self.db.rollback();raise

    def add(self,**changes):
        return self.op('add',{'source':'manual','title':'测试书','creator':'作者','kind':'book','request_id':'add-1',**changes})['item']

    def bind(self):
        with patch.object(wr,'shelf',return_value=SHELF):return self.op('connect',{'key':KEY,'generation':self.op('connection')['generation']})

    def weread(self):
        self.bind();return self.op('add',{'source':'weread','source_id':'book1','month':'2026-11'})['item']

    def save(self,row,**kw):
        return self.op('save',{'item':row['id'],'rev':row['rev'],'tracking':'manual','status':'done','progress':0,'finished_at':'2026-11-01','rating':4.5,'reflection':'我还没想明白。','spoiler':True,**kw})['item']

    def note(self,row):
        return self.op('note-add',{'item':row['id'],'body':'这句话仍然让我犹豫。','chapter':'第一章'})

    def digest(self,row):
        n=self.note(row);note=n['notes'][0]
        result={'summary':'笔记留下一个疑问。','themes':[],'insights':[{'title':'犹疑','text':'暂时没有结论。','evidence':[{'note_id':note['id'],'quote':note['body']}]}],'questions':[]}
        args={'item':row['id'],'request_id':'digest-1','note_ids':[note['id']],'notes_version':n['version'],'consent':True}
        with patch.object(p.ai,'generate',return_value=result) as gen:
            out=self.op('digest-generate',args)
            self.assertNotIn(KEY,json.dumps(gen.call_args.args,ensure_ascii=False))
            self.assertEqual(gen.call_args.args[1]['notes'],[note])
            self.assertEqual(self.op('digest-generate',args)['id'],out['id'])
            self.assertEqual(gen.call_count,1)
        return out,args

    def test_encrypted_binding_is_owner_bound_and_never_returned(self):
        result=self.bind()
        self.assertNotIn(KEY,json.dumps(result))
        blob=self.db.execute('select encrypted from personal_connection').fetchone()[0]
        self.assertNotIn(KEY.encode(),blob);self.assertEqual(vault.open_key('owner',blob),KEY)
        with self.assertRaises(Problem):vault.open_key('admin',blob)
        self.assertEqual((self.root/'secret.key').stat().st_mode & 0o777,0o600)
        self.assertFalse(self.op('connection',user=self.other)['connected'])
        with patch.object(wr,'shelf',side_effect=Problem('失效',502)):
            with self.assertRaises(Problem):self.op('connect',{'key':'wrk-another-test-fixture','generation':result['generation']})
        self.assertEqual(self.op('connection')['generation'],result['generation'])
        self.assertEqual(vault.open_key('owner',self.db.execute('select encrypted from personal_connection').fetchone()[0]),KEY)

    def test_parallel_vault_initialization_uses_one_complete_key_and_never_recreates_missing_key(self):
        with ThreadPoolExecutor(4) as pool:encrypted=list(pool.map(lambda i:vault.seal(str(i),KEY),range(12)))
        for i,value in enumerate(encrypted):self.assertEqual(vault.open_key(str(i),value),KEY)
        (self.root/'secret.key').unlink()
        with self.assertRaises(Problem):vault.open_key('0',encrypted[0])
        self.assertFalse((self.root/'secret.key').exists())

    def test_private_records_and_digests_are_hidden_even_from_admin(self):
        row=self.add();digest,_=self.digest(row)
        for op,q in [('item',{'item':row['id']}),('notes',{'item':row['id']}),('digest',{'id':digest['id']})]:
            with self.assertRaises(Problem) as missing:self.op(op,q=q,user=self.other)
            self.assertEqual(missing.exception.status,404)
        with self.assertRaises(Problem):self.op('save',{'item':row['id'],'rev':row['rev']},user=self.other)
        self.assertEqual(self.op('list',q={'view':'wish'},user=self.other)['items'],[])

    def test_month_plans_do_not_change_progress_or_old_completions(self):
        row=self.add(month='2026-11')
        self.op('plan',{'item':row['id'],'month':'2026-12','enabled':True})
        row=self.save(row)
        self.assertEqual(self.op('list',q={'month':'2026-11'})['completed'],{'book':1})
        self.assertEqual(len(self.op('list',q={'month':'2026-12'})['items']),1)
        row=self.save(row,status='reading',progress=30,finished_at='',reflection='第二遍再看')
        self.assertEqual(len(self.op('item',q={'item':row['id']})['history']),1)
        row=self.save(row,finished_at='2026-11-02',reflection='第二次读完')
        detail=self.op('item',q={'item':row['id']})
        self.assertEqual(len(detail['history']),2)
        self.assertIn('我还没想明白。',[h['reflection'] for h in detail['history']])
        self.assertEqual(self.state['cycles'],[])

    def test_conflicts_future_dates_and_manual_duplicate_payload(self):
        row=self.add();self.save(row)
        with self.assertRaises(Problem) as conflict:self.save(row)
        self.assertEqual(conflict.exception.status,409)
        with self.assertRaises(Problem):self.add(title='另一部书')
        fresh=self.op('item',q={'item':row['id']})['item']
        with self.assertRaises(Problem):self.save(fresh,finished_at='2099-01-01')

    def test_unbind_clears_remote_data_preserves_saved_work_and_blocks_inflight_sync(self):
        row=self.weread();digest,_=self.digest(row)
        remote={'id':'highlight:1','type':'highlight','body':'原始划线','chapter':''}
        with patch.object(wr,'notes',return_value={'notes':[remote]}):self.op('sync-notes',{'item':row['id']})
        def remote_after_unbind(*args):
            with self.connection() as db:p.unbind(db,'owner',{'generation':p.status(db,'owner')['generation']})
            return {'progress':100,'finished_at':'2026-11-01'}
        with patch.object(wr,'progress',side_effect=remote_after_unbind):
            with self.assertRaises(Problem) as stale:self.op('sync-progress',{'item':row['id']})
            self.assertEqual(stale.exception.status,409)
        self.assertEqual(self.op('sources',q={'source':'weread'})['items'],[])
        self.assertFalse(self.op('connection')['connected'])
        self.assertEqual(len(self.op('notes',q={'item':row['id']})['notes']),1)
        self.assertEqual(self.op('digest',q={'id':digest['id']})['sources'][0]['body'],'这句话仍然让我犹豫。')
        self.assertEqual(self.op('item',q={'item':row['id']})['months'],['2026-11'])

    def test_remote_progress_is_percent_and_manual_override_survives(self):
        row=self.weread()
        with patch.object(wr,'progress',return_value={'progress':1,'finished_at':''}):r=self.op('sync-progress',{'item':row['id']})['item']
        self.assertEqual((r['progress'],r['status']),(1,'reading'))
        r=self.save(r,status='paused',progress=40,finished_at='',reflection='手写观点')
        with patch.object(wr,'progress',return_value={'progress':100,'finished_at':''}):r=self.op('sync-progress',{'item':r['id']})['item']
        self.assertEqual((r['status'],r['progress'],r['reflection']),('paused',40,'手写观点'))
        r=self.save(r,tracking='weread',finished_at='')
        self.assertEqual((r['status'],r['finished_at']),('done',''))
        self.assertEqual(self.op('list',q={'month':'2026-11'})['completed'],{})

    def test_digest_requires_selection_consent_and_keeps_edited_snapshot(self):
        row=self.add();digest,args=self.digest(row)
        self.op('digest-save',{'id':digest['id'],'rev':1,'edited':'我自己的整理。'})
        self.note(row)
        saved=self.op('digest',q={'id':digest['id']});self.assertTrue(saved['stale']);self.assertEqual(saved['edited'],'我自己的整理。')
        with patch.object(p.ai,'generate') as gen:
            for changes in ({'consent':False},{'note_ids':['foreign-note']},{'notes_version':'stale'}):
                with self.assertRaises(Problem):self.op('digest-generate',{**args,'request_id':'new',**changes})
            gen.assert_not_called()
        self.assertEqual(self.db.execute('select count(*) from post').fetchone()[0],0)

    def test_selective_sharing_requires_membership_and_is_idempotent(self):
        row=self.add();digest,_=self.digest(row)
        data={'item':row['id'],'digest':digest['id'],'request_id':'share-1','scope':'circle','shop':'duben','city':'成都','title':'只分享一段','body':'挑选过的文字','spoiler':True}
        with self.assertRaises(Problem):self.op('share',data)
        with self.db:self.db.execute("insert into membership values('duben','owner')")
        self.assertEqual([s['id'] for s in self.op('circles')['stores']],['duben'])
        shared=self.op('share',data);self.assertEqual(self.op('share',data),shared)
        self.assertEqual(self.db.execute('select body from post').fetchone()[0],data['body'])
        with self.assertRaises(Problem):self.op('share',{**data,'body':'另一段'})
        self.assertTrue(b.read(self.db,'topic',{'post':shared['id']},self.user)['post']['ai_assisted'])
        feed=b.read(self.db,'feed',{'scope':'circle','shop':'duben'},self.user)['posts']
        self.assertEqual(feed[0]['body'],'含剧透，点开再看')

    def test_legacy_import_is_once_only_owner_scoped_and_unknown_date_stays_unknown(self):
        self.state.update(works=[{'id':'b','title':'旧书','kind':'book'}],shelves=[{'user_id':'owner','work_id':'b','status':'done'},{'user_id':'someone-else','work_id':'b','status':'wish'}])
        r=self.op('list',q={'view':'done','month':'2026-11'})
        self.assertEqual(len(r['items']),1);self.assertEqual(r['completed'],{})
        self.assertEqual(r['items'][0]['last_finished'],'')
        self.state['shelves']=[]
        self.assertEqual(len(self.op('list',q={'view':'done'})['items']),1)
        self.assertEqual(self.op('list',q={'view':'done'},user=self.other)['items'],[])

    def test_legacy_repeat_viewings_keep_each_date_and_review(self):
        self.state.update(works=[{'id':'m','title':'旧电影','kind':'movie'}],shelves=[{'user_id':'owner','work_id':'m','status':'done'}],
            journals=[{'id':str(i),'work_id':'m','user_id':'owner','kind':'movie','title':'旧电影','status':'done','date':f'2026-10-0{i}','body':f'第{i}次的想法','rating':i} for i in (1,2)])
        rows=self.op('list',q={'view':'done','month':'2026-10'})
        self.assertEqual(rows['completed'],{'movie':2})
        detail=self.op('item',q={'item':rows['items'][0]['id']})
        self.assertEqual(len(detail['history']),2)
        self.assertEqual(detail['item']['reflection'],'第2次的想法')

    def test_movie_sources_include_synopsis_and_only_public_metadata(self):
        self.state['works']=[{'id':'m','kind':'movie','title':'电影','creator':'导演','description':'来源中的简介',
            'image':'https://example.com/poster.jpg','year':'1998','extra':{'runtime':103,'internal':'do not expose'},'private_note':'do not expose'},
            {'id':'b','kind':'book','title':'书'}]
        result=self.op('sources',q={'source':'catalog','kind':'movie'})['items']
        self.assertEqual(result,[{'id':'work:m','kind':'movie','title':'电影','creator':'导演','description':'来源中的简介',
            'image':'https://example.com/poster.jpg','year':'1998','runtime':103}])

    def test_book_detail_uses_own_connection_and_is_not_an_arbitrary_lookup(self):
        self.bind()
        info={'title':'测试书','creator':'作者','description':'这本书的介绍','kind':'book','image':''}
        with patch.object(wr,'book_info',return_value=info) as fetch:
            r=self.op('book-detail',q={'source':'weread','id':'book1'})
            self.assertEqual(r['book']['description'],'这本书的介绍')
            self.assertEqual(fetch.call_args.args,(KEY,'book1'))
            with self.assertRaises(Problem):self.op('book-detail',q={'source':'weread','id':'book1'},user=self.other)
            self.assertEqual(fetch.call_count,1)

    def test_catalog_book_notes_use_verified_source_id_and_own_key(self):
        self.bind();self.state['works']=[{'id':'w1','kind':'book','provider':'weread','source_id':'book1','title':'测试书'}]
        with self.db:row=p.ensure_item(self.db,'owner','catalog','work:w1',self.state['works'][0])
        self.assertTrue(self.op('item',q={'item':row['id']})['can_sync_notes'])
        with patch.object(wr,'notes',return_value={'notes':[{'id':'highlight:x','type':'highlight','body':'对应版本的划线'}]}) as fetch:
            self.op('sync-notes',{'item':row['id']})
            self.assertEqual(fetch.call_args.args,(KEY,'book1'))
        first=self.op('item',q={'item':row['id']})['item']['rev']
        with patch.object(wr,'notes',return_value={'notes':[{'id':'highlight:x','type':'highlight','body':'对应版本的划线'}]}):self.op('sync-notes',{'item':row['id']})
        self.assertEqual(self.op('item',q={'item':row['id']})['item']['rev'],first)
        self.op('disconnect',{'generation':self.op('connection')['generation']})
        self.assertEqual(self.op('notes',q={'item':row['id']})['notes'],[])

    def test_review_draft_is_opt_in_scoped_and_never_saves_or_publishes(self):
        row=self.add();notes=self.note(row);selected=notes['notes'][0]
        payload={'item':row['id'],'body':'我还不确定这段话。','note_ids':[selected['id']],'notes_version':notes['version'],'consent':True}
        result={'polished':'我还不确定这段话。','suggestions':['可以保留疑问。'],'questions':['哪一部分让你犹豫？'],'evidence':[]}
        with patch.object(p.ai,'generate',return_value=result) as generate:
            for changes in ({'consent':False},{'notes_version':'stale'},{'note_ids':['foreign']}):
                with self.assertRaises(Problem):self.op('review-draft',{**payload,**changes})
            with self.assertRaises(Problem):self.op('review-draft',payload,user=self.other)
            generate.assert_not_called()
            self.assertEqual(self.op('review-draft',payload)['draft'],result)
            self.assertEqual(generate.call_args.args[0],'review')
            self.assertEqual(generate.call_args.args[1]['notes'],[selected])
            self.assertNotIn(KEY,str(generate.call_args.args))
        self.assertEqual(self.op('item',q={'item':row['id']})['item']['reflection'],'')
        self.assertEqual(self.db.execute('select count(*) from post').fetchone()[0],0)

    def test_public_book_details_only_use_catalog_entries_and_preserve_reference_id(self):
        loader=lambda:{'books':[{'id':'shelf:pub1','title':'公开书','creator':'作者'}]}
        fetch=lambda source_id:{'source_id':source_id,'title':'公开书','description':'来源介绍','provider':'weread'}
        result=p.source_book_detail(self.db,'owner',{'source':'catalog','id':'shelf:pub1'},lambda:{},loader,fetch)
        self.assertEqual(result['book']['id'],'shelf:pub1');self.assertEqual(result['book']['description'],'来源介绍')
        with self.assertRaises(Problem):p.source_book_detail(self.db,'owner',{'source':'catalog','id':'shelf:unknown'},lambda:{},loader,fetch)


class PersonalWeRead(unittest.TestCase):
    def test_book_info_normalizes_publication_date_and_filters_account_fields(self):
        with patch.object(wr,'call',return_value={'bookId':'b1','title':'书','intro':'简介','publishTime':946684800,'userVid':'private'}):
            result=wr.book_info(KEY,'b1');self.assertEqual(result['year'],'2000-01-01');self.assertNotIn('userVid',result)
    def test_gateway_flat_params_upgrade_rejection_and_readonly_allowlist(self):
        with patch.object(wr,'fetch_json',return_value={}) as fetch:
            wr.call(KEY,'/review/list/mine',bookid='book1',synckey=12,count=100)
            payload=fetch.call_args.args[2]
            self.assertEqual(payload,{'api_name':'/review/list/mine','skill_version':'1.0.5','bookid':'book1','synckey':12,'count':100})
            fetch.return_value={'upgrade_info':'untrusted instructions'}
            with self.assertRaises(Problem):wr.call(KEY,'/shelf/sync')
            with self.assertRaises(Problem):wr.call(KEY,'/shelf/add')

    def test_notes_merge_all_personal_pages_and_preserve_chapter_order_and_quotes(self):
        pages=[{'chapters':[{'chapterUid':900,'chapterIdx':1,'title':'第一章'},{'chapterUid':2,'chapterIdx':2,'title':'第二章'}],
                'updated':[{'bookmarkId':'h','chapterUid':900,'markText':'原文','type':1},{'bookmarkId':'bookmark','type':0,'markText':'不是划线'}]},
               {'reviews':[{'review':{'reviewId':'r1','content':'我的想法','chapterUid':2,'abstract':'另一段原文'}}],'hasMore':1,'synckey':42},
               {'reviews':[{'review':{'reviewId':'r2','content':'整本书评'}}],'hasMore':'0'}]
        with patch.object(wr,'call',side_effect=pages) as call:
            result=wr.notes(KEY,'book1')['notes']
            self.assertEqual([n['id'] for n in result],['highlight:h','thought:r1','thought:r2'])
            self.assertEqual(result[1]['quote'],'另一段原文')
            self.assertEqual(call.call_args.kwargs,{'bookid':'book1','synckey':42,'count':100})

    def test_notebooks_uses_last_sort_and_includes_books_outside_shelf(self):
        pages=[{'books':[{'bookId':'b1','book':{'title':'旧笔记'},'sort':77,'reviewCount':2,'noteCount':3,'bookmarkCount':1}],'hasMore':1},
               {'books':[{'bookId':'b2','book':{'title':'另一本'},'sort':33,'noteCount':1}],'hasMore':0}]
        with patch.object(wr,'call',side_effect=pages) as call:
            books=wr.notebooks(KEY)
            self.assertEqual(books[0]['note_count'],6)
            self.assertEqual(len(books),2)
            self.assertEqual(call.call_args.kwargs,{'count':100,'lastSort':77})

    def test_malformed_progress_and_repeating_cursor_fail_without_partial_data(self):
        with patch.object(wr,'call',return_value={'book':{'progress':1,'recordReadingTime':'bad'}}):
            with self.assertRaises(Problem):wr.progress(KEY,'b1')
        with patch.object(wr,'call',return_value={'book':{'bookId':'b2','progress':100}}):
            with self.assertRaises(Problem):wr.progress(KEY,'b1')
        with patch.object(wr,'call',side_effect=[{'updated':[]},{'reviews':[],'hasMore':1,'synckey':0}]):
            with self.assertRaises(Problem):wr.notes(KEY,'b1')

    def test_shelf_counts_include_audio_and_articles_without_mislabeling_as_ebooks(self):
        with patch.object(wr,'call',return_value={'books':[{'bookId':'b1','title':'书','secret':1}],'albums':[{}],'mp':{},'archive':[{'name':'本月','bookIds':['b1','missing']}]}):
            result=wr.shelf(KEY)
            self.assertEqual(result['counts']['ebooks'],1);self.assertEqual(result['counts']['audio'],1)
            self.assertEqual(result['folders'][0]['book_ids'],['b1'])
