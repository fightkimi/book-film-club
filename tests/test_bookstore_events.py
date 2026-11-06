import concurrent.futures
from contextlib import closing
from pathlib import Path
import secrets
import sqlite3
import tempfile
import os
import hashlib
import unittest
from unittest.mock import patch

import bookstore_events as e
import bookstores as b
from domain import Problem


class GatheringLifecycle(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.file=Path(self.tmp.name)/'events.sqlite3'
        self.db=self.conn();self.addCleanup(self.db.close);b.initialize(self.db)
        self.host={'id':'host','name':'店员','role':'member'}
        self.member={'id':'m','name':'读者','role':'member'}
        with self.db:self.db.execute("insert into shop_manager values('duben','host')")
        self.fields=dict(shop='duben',kind='meet',title='共读小聚',place='一楼',starts='2099-09-09 15:00',capacity=1,
                         audience='readers',description='从第一页开始。',blurb='周末见')
        self.id=self.create()
        self.token=self.login('reader-a')

    def conn(self):
        db=sqlite3.connect(self.file);db.row_factory=sqlite3.Row;db.execute('pragma foreign_keys=on');return db

    def op(self,op,data,user=None,token=''):
        with self.db:
            self.db.execute('begin immediate')
            return e.write(self.db,'gather-'+op,data,user,token)

    def create(self,**kwargs):
        return self.op('new',{**self.fields,'request_id':secrets.token_hex(8),**kwargs},self.host)['id']

    def login(self,subject,key=None,user=None):
        with self.db, patch.object(e.wechat_login,'configuration',return_value=('app','unused')),patch.object(e.wechat_login,'exchange',return_value=subject):
            return e.login(self.db,{'event':key or self.id,'code':'fixture'},user,'local')['event_token']

    def detail(self,who=None,token=None):
        return e.detail(self.db,self.id,who,token or '')

    def test_my_events_uses_bound_identity_and_preserves_circle_scope_and_cancellation(self):
        identity=Path(self.tmp.name)/'identity.sqlite3'
        with sqlite3.connect(identity) as club:
            club.executescript('CREATE TABLE wx_identities(app_id TEXT,subject TEXT,user_id TEXT);')
            club.executemany('INSERT INTO wx_identities VALUES(?,?,?)',[('app','reader-a','m'),('app','reader-b','other')])
        with patch.dict(os.environ,WECHAT_APP_ID='app',BOOKSTORES_IDENTITY_DB=str(identity)):
            person=e.member_person(self.member)
            self.assertEqual(person,hashlib.sha256(b'app:bookstore:reader-a').hexdigest())
            self.assertEqual(e.member_person(self.host),'')
            with self.assertRaises(Problem):e.member_person(None)
        self.op('sign',{'event':self.id,'nickname':'读者'},self.member,self.token)
        circle=self.create(audience='circle')
        with self.db:self.db.execute("INSERT INTO membership VALUES('duben','m')")
        tok=self.login('reader-a',circle,self.member)
        self.op('sign',{'event':circle,'nickname':'圈友'},self.member,tok)
        self.op('cancel',{'event':self.id,'rev':1},self.host)
        result=e.mine(self.db,self.member,person)['events']
        self.assertEqual({r['id'] for r in result},{self.id,circle})
        self.assertEqual(next(r['state'] for r in result if r['id']==self.id),'cancelled')
        self.assertNotIn('person',str(result));self.assertNotIn('nickname',str(result))
        self.assertEqual(e.mine(self.db,self.member,hashlib.sha256(b'app:bookstore:reader-b').hexdigest())['events'],[])
        with self.db:self.db.execute("DELETE FROM membership WHERE reader='m'")
        self.assertEqual([r['id'] for r in e.mine(self.db,self.member,person)['events']],[self.id])
        self.op('delete',{'event':self.id,'rev':2},self.host)
        self.assertEqual(e.mine(self.db,self.member,person)['events'],[])

    def test_share_login_is_event_scoped_and_does_not_join_club_or_circle(self):
        with self.assertRaises(Problem) as unauth:self.detail()
        self.assertEqual(unauth.exception.status,401)
        self.assertFalse(self.detail(token=self.token)['can_manage'])
        with self.assertRaises(Problem):e.detail(self.db,self.create(),None,self.token)
        with self.assertRaises(Problem):self.op('pin',{'event':self.id},None,self.token)
        key=self.create(audience='circle')
        with self.assertRaises(Problem):self.login('reader-b',key)
        with self.assertRaises(Problem):e.detail(self.db,key,self.member,'')
        with self.db:self.db.execute("insert into membership values('duben','m')")
        ticket=self.login('reader-a',key,self.member)
        self.assertTrue(e.detail(self.db,key,self.member,ticket))
        with self.assertRaises(Problem):e.detail(self.db,key,None,ticket)
        self.assertEqual(self.db.execute('select count(*) from membership').fetchone()[0],1)

    def test_capacity_is_atomic_and_same_wechat_can_cancel_with_fresh_token(self):
        tokens=[self.token,self.login('reader-b')]
        def reserve(tok):
            with closing(self.conn()) as db,db:
                db.execute('begin immediate')
                try:e.write(db,'gather-sign',{'event':self.id,'nickname':'书友'},None,tok);return True
                except Problem:return False
        with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(reserve,tokens))
        self.assertEqual(sorted(results),[False,True])
        winner=results.index(True);subject=['reader-a','reader-b'][winner]
        fresh=self.login(subject)
        self.op('sign',{'event':self.id,'nickname':'同一个人'},self.member,fresh)
        self.assertTrue(self.detail(self.member,fresh)['joined'])
        self.assertEqual(self.detail(self.host)['roster'],['书友'])
        self.assertNotIn('roster',self.detail(token=fresh))
        self.op('leave',{'event':self.id},None,fresh)
        self.assertEqual(self.detail(self.host)['booked'],0)

    def test_edit_conflicts_cancel_and_notice(self):
        req='retry-1'
        self.assertEqual(self.create(request_id=req),self.create(request_id=req))
        f={**self.fields,'event':self.id,'title':'改期','rev':1}
        with self.assertRaises(Problem):self.op('edit',f,self.member)
        self.op('edit',f,self.host)
        self.assertEqual(self.detail(token=self.token)['title'],'改期')
        with self.assertRaises(Problem):self.op('edit',f,self.host)
        self.op('cancel',{'event':self.id,'rev':2},self.host)
        with self.assertRaises(Problem):self.op('sign',{'event':self.id,'nickname':'我'},None,self.token)
        notice=self.create(kind='notice')
        with self.assertRaises(Problem):self.op('sign',{'event':notice,'nickname':'我'},None,self.login('reader',notice))

    def test_recap_uses_only_consented_text_and_never_publishes_itself(self):
        self.op('sign',{'event':self.id,'nickname':'私密姓名'},None,self.token)
        self.op('end',{'event':self.id,'rev':1},self.host)
        self.op('note',{'event':self.id,'note':'不要发给模型','allow_recap':False},None,self.token)
        args={'event':self.id,'notes':'主持记录'}
        with patch.object(e.ai,'generate',return_value={'recap':'一段真实的回顾'}) as gen:
            out=e.draft(self.db,'gather-recap-ai',args,self.host)
            self.assertEqual(gen.call_args.args[1]['shared_notes'],[])
            self.assertNotIn('私密姓名',str(gen.call_args.args))
            with self.assertRaises(Problem):e.draft(self.db,'gather-recap-ai',{'event':self.id},self.host)
            with self.assertRaises(Problem):e.draft(self.db,'gather-recap-ai',args,self.member)
            self.op('note',{'event':self.id,'note':'这段愿意分享','allow_recap':True},None,self.token)
            with self.assertRaises(Problem):self.op('save-recap',dict(event=self.id,**out),self.host)
            out=e.draft(self.db,'gather-recap-ai',args,self.host)
            self.assertEqual(gen.call_args.args[1]['shared_notes'],['这段愿意分享'])
        self.assertFalse(self.detail(token=self.token)['recap'])
        self.op('save-recap',dict(event=self.id,**out),self.host)
        self.assertEqual(self.detail(token=self.token)['recap'],'一段真实的回顾')
        with self.assertRaises(Problem):self.op('note',{'event':self.id,'note':'修改','allow_recap':True},None,self.token)

    def test_delete_is_scoped_versioned_and_hides_shared_content(self):
        self.assertTrue(self.detail(self.host)['can_delete'])
        self.assertFalse(self.detail(token=self.token)['can_delete'])
        self.op('sign',{'event':self.id,'nickname':'私人称呼'},None,self.token)
        other={'id':'other-host','name':'另一家店主','role':'member'}
        with self.db:self.db.execute("INSERT INTO shop_manager VALUES('baidu','other-host')")
        for user,token in [(None,self.token),(self.member,self.token),(other,'')]:
            with self.assertRaises(Problem) as denied:self.op('delete',{'event':self.id,'rev':1},user,token)
            self.assertEqual(denied.exception.status,403)
        with self.assertRaises(Problem) as stale:self.op('delete',{'event':self.id,'rev':0},self.host)
        self.assertEqual(stale.exception.status,409)
        self.op('cancel',{'event':self.id,'rev':1},self.host,self.token)
        self.assertEqual(self.detail(token=self.token)['state'],'cancelled')
        self.assertEqual(len(e.shop_list(self.db,'duben',self.member)),1)
        self.op('delete',{'event':self.id,'rev':2},self.host,self.token)
        self.assertEqual(e.shop_list(self.db,'duben',self.host),[])
        self.assertEqual(e.shop_list(self.db,'duben',self.member),[])
        tombstone=self.detail(token=self.token)
        self.assertEqual(tombstone['state'],'deleted')
        for field in ('description','roster','recap','my_note','place','starts','booked'):
            self.assertNotIn(field,tombstone)
        for op in ('sign','end','cancel','delete'):
            with self.assertRaises(Problem) as gone:self.op(op,{'event':self.id,'rev':3,'nickname':'我'},self.host,self.token)
            self.assertEqual(gone.exception.status,410)
        self.assertEqual(self.db.execute('SELECT count(*) FROM gathering WHERE id=?',(self.id,)).fetchone()[0],1)

    def test_delete_open_or_ended_activity_and_notice(self):
        for kind in ('meet','notice'):
            for ended in (False,True):
                key=self.create(kind=kind)
                if ended:self.op('end',{'event':key,'rev':1},self.host)
                self.op('delete',{'event':key,'rev':2 if ended else 1},self.host)
                self.assertEqual(e.detail(self.db,key,self.host,'')['state'],'deleted')

    def test_ai_invitation_is_draft_and_host_only(self):
        with patch.object(e.ai,'generate',return_value={'intro':'草稿','questions':['想聊什么？'],'share':'来坐坐'}) as gen:
            with self.assertRaises(Problem):e.draft(self.db,'gather-invite-ai',self.fields,self.member)
            self.assertEqual(e.draft(self.db,'gather-invite-ai',self.fields,self.host)['intro'],'草稿')
            self.assertEqual(gen.call_args.args[1]['title'],self.fields['title'])
            self.assertNotIn('starts',gen.call_args.args[1])
        self.assertEqual(self.db.execute('SELECT count(*) FROM gathering').fetchone()[0],1)

    def test_store_voice_is_owner_only_versioned_and_kept_as_prompt_data(self):
        value='短句，保留疑问；不要替大家总结收获。'
        with self.assertRaises(Problem):b.write(self.db,'voice',{'shop':'duben','body':value,'voice_rev':0},self.member)
        with self.db:b.write(self.db,'voice',{'shop':'duben','body':value,'voice_rev':0},self.host)
        self.assertNotIn('voice',b.read(self.db,'shop',{'shop':'duben'},self.member))
        self.assertEqual(b.read(self.db,'shop',{'shop':'duben'},self.host)['voice'],value)
        with self.assertRaises(Problem):b.write(self.db,'voice',{'shop':'duben','body':'覆盖','voice_rev':0},self.host)
        with patch.object(e.ai,'generate',return_value={'intro':'草稿','questions':['为什么？'],'share':'来聊聊'}) as gen:
            e.draft(self.db,'gather-invite-ai',self.fields,self.host)
            profile=gen.call_args.args[1]['store_profile']
            self.assertEqual(profile['voice'],value)
            self.assertEqual(profile['lead'],b.STORES['duben']['lead'])
            self.assertNotIn('voice',e.writing_profile(self.db,'baidu').get('lead',''))
        b.initialize(self.db)
        self.assertEqual(b.shop_row(self.db,'duben')['voice_rev'],1)

    def test_repeat_creates_fresh_event_without_seats_notes_or_recap(self):
        self.op('sign',{'event':self.id,'nickname':'原读者'},None,self.token)
        self.op('end',{'event':self.id,'rev':1},self.host)
        self.op('note',{'event':self.id,'note':'原活动感想','allow_recap':True},None,self.token)
        self.op('save-recap',{'event':self.id,'rev':2,'notes_rev':1,'recap':'原活动回顾'},self.host)
        data={**self.fields,'source':self.id,'source_rev':3,'request_id':'repeat-one','starts':'2099-09-16 15:00'}
        key=self.op('repeat',data,self.host)['id']
        self.assertEqual(self.op('repeat',data,self.host)['id'],key)
        view=e.detail(self.db,key,self.host,'')
        self.assertEqual(view['state'],'open');self.assertEqual(view['booked'],0)
        self.assertEqual(view['roster'],[]);self.assertEqual(view['shared_note_count'],0)
        self.assertEqual(view['recap'],'');self.assertEqual(view['rev'],1)
        self.assertEqual(self.detail(self.host)['roster'],['原读者'])
        self.assertEqual(self.detail(self.host)['recap'],'原活动回顾')
        self.assertEqual(self.db.execute('SELECT source FROM gathering_repeat WHERE event=?',(key,)).fetchone()[0],self.id)

    def test_repeat_checks_owner_source_revision_and_private_audience(self):
        source=self.create(audience='circle')
        data={**self.fields,'source':source,'source_rev':1,'request_id':'repeat-private','audience':'circle'}
        with self.assertRaises(Problem):self.op('repeat',data,self.member)
        with self.assertRaises(Problem):self.op('repeat',{**data,'audience':'readers'},self.host)
        with self.assertRaises(Problem):self.op('repeat',{**data,'source_rev':0},self.host)
        with self.db:self.db.execute("INSERT INTO shop_manager VALUES('baidu','host')")
        with self.assertRaises(Problem):self.op('repeat',{**data,'shop':'baidu'},self.host)
        self.op('delete',{'event':source,'rev':1},self.host)
        with self.assertRaises(Problem):self.op('repeat',data,self.host)
