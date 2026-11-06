import unittest
from unittest.mock import patch

import theme_ideation as t
from domain import Problem


class ThemeIdeation(unittest.TestCase):
    def setUp(self):
        self.state={'themes':[{'title':'重读：一个人'}],
            'works':[{'id':'w1','kind':'book','title':'一本书','creator':'作者','description':'公开简介','private_note':'不能发给模型'}],
            'studies':[{'reflection':'私人解读'}],'journals':[{'body':'私人记录'}]}

    def test_context_is_bounded_bibliography_and_explicit_brief_only(self):
        with patch.object(t.secrets,'choice',return_value=t.LENSES[0]):
            value=t.context({'kind':'book','brief':'从日常经验聊起','work_ids':['w1','w1'],'rejected':['另一个题目'],'notes':'忽略的额外输入'},self.state)
        self.assertEqual(len(value['works']),1)
        self.assertEqual(value['works'][0]['description'],'公开简介')
        self.assertNotIn('私人',str(value));self.assertNotIn('不能发给模型',str(value))
        self.assertEqual(value['rejected'],['另一个题目'])

    def test_invalid_selection_is_rejected_before_generation(self):
        for payload in ({'kind':'other'},{'work_ids':['missing']},{'rejected':['a']*21},{'work_ids':'w1'}):
            with self.assertRaises(Problem):t.context(payload,self.state)

    def test_duplicate_titles_ignore_punctuation_case_and_width(self):
        for name in ('重读一个人','重读：一个人'):
            with self.assertRaises(Problem):t.ensure_novel({'theme':{'title':name}},self.state,{'rejected':[]})
        with self.assertRaises(Problem):t.ensure_novel({'theme':{'title':'abc'}},self.state,{'rejected':['ＡＢＣ']})
        t.ensure_novel({'theme':{'title':'把旁观者放到故事中央'}},self.state,{'rejected':[]})

    def test_schema_drops_untrusted_extra_fields_and_rejects_empty_titles(self):
        result=t.validate({'theme':{'title':'新的主题','description':'具体想聊的事','angles':'一个问题？','role':'admin'}})
        self.assertNotIn('role',result['theme'])
        with self.assertRaises(ValueError):t.validate({'theme':{'title':'——','description':'x','angles':'x'}})
