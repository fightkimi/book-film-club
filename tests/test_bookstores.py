import concurrent.futures
from contextlib import closing
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import unittest

import bookstores as b
from domain import Problem


class StoreRights(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.file = Path(self.tmp.name)/'circle.sqlite3'
        self.db = self.open()
        self.addCleanup(self.db.close)
        b.initialize(self.db)
        self.admin = {'id':'admin','role':'admin','name':'管理员'}
        self.owner = {'id':'o','role':'member','name':'店主'}
        self.reader = {'id':'r','role':'member','name':'读者'}
        self.other = {'id':'x','role':'member','name':'读者乙'}
        self.call('claim',self.owner)
        self.call('approve',self.admin,reader='o')

    def open(self):
        c=sqlite3.connect(self.file); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON');return c

    def call(self, op, user, shop='duben', **kw):
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            return b.write(self.db,op,dict(shop=shop,**kw),user)

    def test_catalog_and_claim(self):
        self.assertEqual({s['city'] for s in b.read(self.db,'catalog',{'city':'全国'},self.reader)['stores']}, {'成都','上海','北京','南京','杭州','深圳','广州'})
        self.assertTrue(b.read(self.db,'shop',{'shop':'duben'},self.owner)['manage'])
        self.assertFalse(b.read(self.db,'shop',{'shop':'baidu'},self.owner)['manage'])
        for op,p in [('approve',{'reader':'r'}),('issue',{}),('arrival',{'body':'假上新'}),('pin',{'body':'私密'})]:
            with self.assertRaises(Problem): self.call(op,self.reader,**p)
        self.call('arrival',self.owner,body='新到图书')
        self.call('pin',self.owner,body='下次共读')
        nonmember=b.read(self.db,'shop',{'shop':'duben'},self.reader)
        self.assertEqual(nonmember['arrivals'][0]['body'],'新到图书')
        self.assertFalse(nonmember['pinned'])
        self.assertNotIn('claims',nonmember)
        self.assertFalse(b.read(self.db,'shop',{'shop':'duben'},self.admin)['member'])

    def test_atomic_codes(self):
        code=self.call('issue',self.owner)['code']
        with self.assertRaises(Problem):self.call('join',self.reader,'baidu',code=code)
        digest=hashlib.sha256(code.encode()).hexdigest()
        self.assertEqual(self.db.execute('SELECT digest FROM pass').fetchone()[0],digest)
        def redeem(user):
            with closing(self.open()) as db, db:
                db.execute('BEGIN IMMEDIATE')
                try:return b.write(db,'join',{'shop':'duben','code':code},user)['joined']
                except Problem:return False
        with concurrent.futures.ThreadPoolExecutor() as ex: results=list(ex.map(redeem,[self.reader,self.other]))
        self.assertEqual(sorted(results),[False,True])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM membership').fetchone()[0],1)
        expired=self.call('issue',self.owner)['code']
        with self.db:self.db.execute('UPDATE pass SET expires=0')
        winner=self.db.execute('SELECT reader FROM membership').fetchone()[0]
        with self.assertRaises(Problem):self.call('join',self.other if winner=='r' else self.reader,code=expired)

    def test_private_feed_and_reply_never_cross_into_city(self):
        args=dict(scope='circle',title='本店',body='手记',kind='逛店手记')
        with self.assertRaises(Problem):self.call('post',self.reader,**args)
        private=self.call('post',self.owner,**args)['id']
        for who in (None,self.reader,self.admin):
            with self.assertRaises(Problem):b.read(self.db,'topic',{'post':private},who)
            with self.assertRaises(Problem):b.read(self.db,'feed',{'scope':'circle','shop':'duben'},who)
        with self.assertRaises(Problem):self.call('reply',self.reader,'baidu',post=private,body='越权')
        self.call('join',self.reader,code=self.call('issue',self.owner)['code'])
        self.call('reply',self.reader,post=private,body='已读')
        public=self.call('post',self.reader,scope='city',title='全城',kind='问本地人',body='问书')['id']
        feed=b.read(self.db,'feed',{'scope':'city'},self.reader)['posts']
        self.assertEqual([p['id'] for p in feed],[public])
        self.assertNotIn('author',b.read(self.db,'topic',{'post':public},self.reader)['post'])
        self.assertEqual(b.read(self.db,'topic',{'post':private},self.reader)['replies'][0]['body'],'已读')
        with self.assertRaises(Problem):self.call('post',self.reader,'baidu',**args)

    def test_cross_city_discovery_keeps_private_circles_and_legacy_scope(self):
        def general(shop, **kw):
            return self.call('post',self.reader,shop,scope='city',title='选书',kind='问本地人',body='话题',**kw)['id']
        chengdu=general(None)
        shanghai=general('sh-bananafish',city='全国')
        nationwide=general(None,city='全国')
        local=general(None,city='北京')
        private=self.call('post',self.owner,scope='circle',title='圈内',kind='逛店手记',body='私信')['id']
        def listing(**filters):
            return [p['id'] for p in b.read(self.db,'feed',dict(scope='city',**filters),self.reader)['posts']]
        self.assertEqual(listing(),[chengdu])
        self.assertEqual(listing(city='全国'),[local,nationwide,shanghai,chengdu])
        self.assertEqual(listing(city='北京'),[local])
        self.assertEqual(listing(city='上海'),[shanghai])
        self.assertNotIn(private,listing(city='全国'))
        with self.assertRaises(Problem):general('sh-bananafish',city='北京')

    def test_upgrade_preserves_pre_city_post(self):
        with closing(sqlite3.connect(':memory:')) as db:
            db.row_factory=sqlite3.Row
            db.executescript("CREATE TABLE post(id INTEGER PRIMARY KEY,shop TEXT,scope TEXT,author TEXT,kind TEXT,title TEXT,body TEXT,published TEXT); INSERT INTO post VALUES(4,NULL,'city','r','逛店手记','旧帖','成都','2026');")
            b.initialize(db); b.initialize(db)
            self.assertEqual(b.read(db,'topic',{'post':4},self.reader)['post']['city'],'成都')


    def test_extra_managers_are_scoped_to_their_store(self):
        with self.db:
            self.db.executemany('INSERT INTO shop_manager VALUES(?,?)',[('duben',self.reader['id']),('duben',self.other['id'])])
        for who in (self.reader,self.other):
            view=b.read(self.db,'shop',{'shop':'duben'},who)
            self.assertTrue(view['member'] and view['manage'])
            self.assertTrue(self.call('issue',who)['code'])
            with self.assertRaises(Problem):self.call('issue',who,'baidu')
        self.assertEqual(self.db.execute("SELECT owner FROM shop WHERE id='duben'").fetchone()[0],self.owner['id'])

    def test_follow_is_persistent_personal_and_never_joins_circle(self):
        private=self.call('post',self.owner,scope='circle',title='圈内话题',kind='逛店手记',body='不公开')['id']
        self.call('follow',self.reader,enabled=True,reader=self.other['id'])
        self.call('follow',self.reader,enabled=True)
        with closing(self.open()) as db:
            self.assertEqual(b.followed_shops(db,self.reader['id']),['duben'])
            self.assertEqual(b.followed_shops(db,self.other['id']),[])
            self.assertEqual(db.execute('SELECT count(*) FROM shop_follow').fetchone()[0],1)
        view=b.read(self.db,'shop',{'shop':'duben'},self.reader)
        self.assertTrue(view['following']);self.assertFalse(view['member'] or view['manage'])
        with self.assertRaises(Problem):b.read(self.db,'topic',{'post':private},self.reader)
        with self.assertRaises(Problem):self.call('reply',self.reader,post=private,body='越权')
        for who in (None,):
            with self.assertRaises(Problem):b.read(self.db,'following',{},who)
        self.call('follow',self.reader,enabled=False)
        self.assertEqual(b.read(self.db,'following',{},self.reader)['stores'],[])

    def test_following_merges_only_public_updates_with_stable_pagination(self):
        import bookstore_events as events
        self.call('follow',self.reader,enabled=True)
        for n in range(61):self.call('post',self.owner,scope='city',title=str(n),kind='问本地人',body='公开')
        self.call('post',self.owner,scope='circle',title='私密',kind='逛店手记',body='私密')
        self.call('post',self.reader,'baidu',scope='city',title='别家',kind='问本地人',body='别家')
        self.call('arrival',self.owner,body='本店上新')
        for audience,state in [('readers','open'),('circle','open'),('readers','deleted')]:
            with self.db:
                event=events.write(self.db,'gather-new',dict(shop='duben',request_id=audience+state,kind='meet',audience=audience,title=audience+state,starts='2099-01-01 15:00',place='书店',capacity=12),self.owner,'')
                self.db.execute('UPDATE gathering SET state=? WHERE id=?',(state,event['id']))
        found=[];cursor=''
        while True:
            page=b.read(self.db,'following',{'before':cursor},self.reader)
            found+=page['updates'];cursor=page['next']
            if not cursor:break
        self.assertEqual(len(found),63)
        self.assertEqual(len({r['cursor'] for r in found}),63)
        self.assertEqual({r['type'] for r in found},{'arrival','post','gathering'})
        self.assertNotIn('私密',{r['title'] for r in found})
        self.assertNotIn('别家',{r['title'] for r in found})
        self.assertEqual([r['title'] for r in found if r['type']=='gathering'],['readersopen'])
        self.assertEqual(b.read(self.db,'following',{},self.other)['updates'],[])

    def test_recommendation_uses_canonical_book_and_idempotent_request(self):
        book={'id':'work:book-one','title':'服务端书名','creator':'作者'}
        data=dict(book_id=book['id'],body='一句理由',city='全国',shop='duben',request_id='same',title='伪造书名')
        def publish(payload,who=self.reader,chosen=book):
            with self.db:
                self.db.execute('BEGIN IMMEDIATE')
                return b.write(self.db,'recommend',payload,who,book=chosen)
        first=publish(data);self.assertEqual(publish(data),first)
        post=b.read(self.db,'topic',{'post':first['id']},self.reader)['post']
        self.assertEqual(post['title'],book['title']);self.assertEqual(post['book']['creator'],'作者')
        self.assertEqual(post['scope'],'city');self.assertEqual(post['city'],'成都')
        self.assertEqual(post['kind'],'一句话荐书')
        with self.assertRaises(Problem) as conflict:publish({**data,'body':'改过的理由'})
        self.assertEqual(conflict.exception.status,409)
        for patch in ({'body':'x'*141},{'body':'  '},{'book_id':'missing'},{'city':'上海'}):
            with self.assertRaises(Problem):publish({**data,'request_id':'invalid',**patch})
        with self.assertRaises(Problem):publish({**data,'request_id':'missing-book'},chosen=None)
        self.assertNotEqual(publish(data,self.other),first)
        self.assertEqual(self.db.execute('SELECT count(*) FROM post').fetchone()[0],2)
