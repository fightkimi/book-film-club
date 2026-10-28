import copy
import unittest
from unittest.mock import patch
from domain import empty_state,mutate,report,Problem


class ClubRules(unittest.TestCase):
    def setUp(self):
        self.s=empty_state()
        self.a={'id':'admin','role':'admin','name':'管理员'}
        self.u={'id':'reader','role':'member','name':'读者'}
        self.users=[self.a,self.u]
        self.theme=self.do('theme.save',{'title':'故乡','description':'说明'})
        self.work=self.do('work.save',{'title':'作品一','kind':'book','creator':'作者','description':'简介','image':'https://covers.openlibrary.org/b/id/1-L.jpg','source_url':'https://openlibrary.org/works/OL1W','metadata_status':'confirmed'})
        self.other=self.do('work.save',{'title':'作品二','kind':'book','creator':'作者','description':'简介','image':'https://covers.openlibrary.org/b/id/2-L.jpg','source_url':'https://openlibrary.org/works/OL2W','metadata_status':'confirmed'})
        self.c=self.do('cycle.save',{'title':'第一期','start':'2026-01-01','end':'2099-01-01','theme_id':self.theme['id'],'member_ids':['admin','reader'],'work_ids':[self.work['id'],self.other['id']],'rules':{'quantity':'all','review':True,'discussion':True}})
        self.do('cycle.transition',{'id':self.c['id'],'status':'active'})
    def do(self,action,p,user=None):
        return mutate(self.s,user or self.a,action,p,self.users)
    def rec(self,w=None,progress=100,user=None):
        return self.do('record.save',{'cycle_id':self.c['id'],'work_id':(w or self.work)['id'],'progress':progress},user or self.u)
    def review(self,w=None,user=None):
        return self.do('review.save',{'cycle_id':self.c['id'],'work_id':(w or self.work)['id'],'body':'我的感想','rating':4},user or self.u)
    def test_all_requires_each_work_review_and_discussion(self):
        self.rec();self.review();self.rec(self.other);self.review(self.other)
        self.assertEqual(report(self.s,self.c,'reader')['status'],'in_progress')
        self.do('participation.save',{'cycle_id':self.c['id'],'status':'joined','discussion':True},self.u)
        self.assertEqual(report(self.s,self.c,'reader')['status'],'done')
    def test_any_cannot_combine_different_work_and_review(self):
        self.c['rules']={'quantity':'any','review':True,'discussion':False}
        self.rec();self.review(self.other)
        self.assertNotEqual(report(self.s,self.c,'reader')['status'],'done')
        self.review();self.assertEqual(report(self.s,self.c,'reader')['status'],'done')
    def test_leave_is_not_failure(self):
        self.do('participation.save',{'cycle_id':self.c['id'],'status':'leave','discussion':False},self.u)
        self.assertEqual(report(self.s,self.c,'reader')['status'],'leave')
    def test_overdue_and_late_completion(self):
        self.c['end']='2020-01-01';self.c['rules']={'quantity':'any','review':False,'discussion':False}
        self.assertEqual(report(self.s,self.c,'reader')['status'],'overdue')
        self.rec();self.assertEqual(report(self.s,self.c,'reader')['status'],'late_done')
    def test_deadline_uses_shanghai_end_of_day(self):
        self.c['end']='2026-10-28'
        self.assertEqual(report(self.s,self.c,'reader','2026-10-28T23:59:58+08:00')['status'],'not_started')
        self.assertEqual(report(self.s,self.c,'reader','2026-10-29T00:00:00+08:00')['status'],'overdue')
    def test_completed_timestamp_stays_on_note_edit(self):
        r=self.rec();before=r['completed_at']
        with patch('domain.now',return_value='2090-01-01T00:00:00+08:00'):self.rec()
        self.assertEqual(r['completed_at'],before)
    def test_history_snapshots_immutable(self):
        self.do('theme.save',{**self.theme,'title':'新主题'})
        self.do('work.save',{**self.work,'title':'修改的作品'})
        self.assertEqual(self.c['theme']['title'],'故乡')
        self.assertEqual(self.c['works'][0]['title'],'作品一')
        with self.assertRaises(Problem):self.do('cycle.save',{'id':self.c['id']})
    def test_member_cannot_edit_others(self):
        with self.assertRaises(Problem) as e:self.do('record.save',{'cycle_id':self.c['id'],'work_id':self.work['id'],'user_id':'admin','progress':100},self.u)
        self.assertEqual(e.exception.status,403)
    def test_admin_edit_is_audited(self):
        self.do('record.save',{'cycle_id':self.c['id'],'work_id':self.work['id'],'user_id':'reader','progress':100})
        self.assertEqual(self.s['audit'][-1]['target_user_id'],'reader')
    def test_archive_locks_but_closed_accepts_late_records(self):
        self.do('cycle.transition',{'id':self.c['id'],'status':'closed'});self.rec()
        self.do('cycle.transition',{'id':self.c['id'],'status':'archived'})
        with self.assertRaises(Problem):self.rec()
        with self.assertRaises(Problem):self.review()
    def test_shelf_does_not_finish_cycle(self):
        self.do('shelf.save',{'work_id':self.work['id'],'status':'done'},self.u)
        self.assertEqual(report(self.s,self.c,'reader')['status'],'not_started')
    def test_repeated_work_has_separate_cycle_record(self):
        self.rec()
        c=copy.deepcopy(self.c);c['id']='other-cycle'
        self.assertEqual(report(self.s,c,'reader')['status'],'not_started')
    def test_draw_excludes_recent_and_disabled(self):
        other=self.do('theme.save',{'title':'新候选'})
        self.do('theme.save',{'title':'停用','enabled':False})
        draw=self.do('theme.draw',{'kind':'book','mode':'fresh'})
        self.assertEqual(draw['theme_id'],other['id']);self.assertEqual(len(draw['candidates']),1)
    def test_empty_pool_does_not_silently_fallback(self):
        with self.assertRaises(Problem):self.do('theme.draw',{'mode':'fresh'})
        self.assertEqual(len(self.s['draws']),0)
    def test_incomplete_metadata_cannot_publish(self):
        self.c['status']='draft';self.work['image']=''
        with self.assertRaises(Problem):self.do('cycle.transition',{'id':self.c['id'],'status':'active'})
    def test_invalid_progress_and_empty_review_rejected(self):
        for value in [-1,101,True,'100']:
            with self.assertRaises(Problem):self.rec(progress=value)
        with self.assertRaises(Problem):self.do('review.save',{'cycle_id':self.c['id'],'work_id':self.work['id'],'body':'   ','rating':4},self.u)
    def test_recap_becomes_stale_after_new_input(self):
        self.do('recap.save',{'cycle_id':self.c['id'],'body':'回顾'})
        self.assertEqual(self.c['recap_version'],self.c['content_version'])
        self.rec();self.assertNotEqual(self.c['recap_version'],self.c['content_version'])
    def test_vote_locked_after_publish(self):
        with self.assertRaises(Problem):self.do('vote',{'cycle_id':self.c['id'],'work_id':self.work['id']},self.u)

    def test_completed_count_is_independent_of_review_requirement(self):
        self.rec()
        r=report(self.s,self.c,'reader')
        self.assertEqual(r['completed'],1)
        self.assertNotEqual(r['status'],'done')
    def test_archived_statistics_do_not_change_with_future_date(self):
        self.do('cycle.transition',{'id':self.c['id'],'status':'closed'})
        self.do('cycle.transition',{'id':self.c['id'],'status':'archived'})
        self.assertEqual(report(self.s,self.c,'reader','2200-01-01T00:00:00+08:00')['status'],'not_started')
    def test_unknown_poster_key_is_rejected(self):
        with self.assertRaises(Problem):self.do('theme.save',{'title':'主题','poster_key':'../../secret'})

if __name__=='__main__':unittest.main()
