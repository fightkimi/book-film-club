import ast
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import ai
import ai_writing
from domain import Problem


class WritingSkill(unittest.TestCase):
    def test_every_task_has_a_profile_and_applies_it_before_returning_valid_json(self):
        specs=next(n.value for n in ast.walk(ast.parse(Path(ai.__file__).read_text()))
                   if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='specs' for t in n.targets))
        self.assertEqual({ast.literal_eval(k) for k in specs.keys},set(ai_writing.PROFILES))
        quote='不是所有问题都需要立刻解决。'
        cases={
            'activity_theme':({'kind':'mixed'}, {'theme':{'title':'一句没说出口的话','description':'从停顿和沉默里，看看人物怎样留住或失去一次交流的机会。','angles':'沉默何时也是回答？\n谁在等对方先开口？\n你会怎样理解那次停顿？'}}),
            'themes':({}, {'themes':[{'title':'等待','description':'面对等待','angles':'时间\n选择\n关系'}]}),
            'analyze':({}, {'analysis':'围绕等待提出问题。','recommendations':[]}),
            'recap':({}, {'recap':'两位读者留下了不同的解释。'}),
            'recommend':({'candidates':[{'id':'b1'}]}, {'recommendations':[{'work_id':'b1','reason':'候选资料包含相关讨论。','caveat':'资料尚不充分。'}]}),
            'guide':({}, {'intro':'留意叙述的视角。','watchpoints':['谁在叙述？','视角有无变化？'],'questions':['你相信叙述者吗？','哪些细节支持你的判断？'],'terms':[]}),
            'review':({'draft':'我可能还没想明白。'}, {'polished':'我可能还没想明白。','suggestions':['保留疑问。'],'questions':['哪一段引起这个疑问？']}),
            'study':({'notebook':{'notes':quote,'shots':[]}}, {'summary':'记录中留有疑问。','claims':[{'quote':quote,'interpretation':'可以暂时保留悬而未决的问题。'}],'questions':['什么情况下需要先行动？']}),
            'personal_notes':({'notes':[{'id':'n1','body':quote,'type':'highlight'}]}, {'summary':'所选笔记涉及等待。','themes':[],'insights':[{'title':'等待','text':'是否行动仍需具体判断。','evidence':[{'note_id':'n1','quote':quote}]}],'questions':[]}),
            'bookstore_invite':({'kind':'notice'}, {'intro':'本周读书会改到二楼。','questions':[],'share':'改到二楼见。'}),
            'bookstore_recap':({}, {'recap':'大家对结尾有两种解释，仍未达成共识。'}),
        }
        self.assertEqual(set(cases),set(ai_writing.PROFILES))
        for task,(context,expected) in cases.items():
            with self.subTest(task=task),patch.dict(os.environ,AI_CHAT_URL='https://example.com/chat',AI_MODEL='fixture',AI_API_KEY='test-placeholder'),patch('ai.fetch_json',return_value={'choices':[{'message':{'content':json.dumps(expected,ensure_ascii=False)}}]}) as fetch:
                self.assertEqual(ai.generate(task,context),expected)
                self.assertEqual(fetch.call_count,1)
                messages=fetch.call_args.args[2]['messages']
                self.assertIn(ai_writing.COMMON,messages[0]['content'])
                self.assertIn(ai_writing.PROFILES[task],messages[0]['content'])
                self.assertEqual(json.loads(messages[1]['content']),context)

    def test_style_never_mutates_verbatim_citations_or_accepts_invented_evidence(self):
        context={'notes':[{'id':'original','type':'highlight','body':'2026 年 11 月 5 日，“赋能”仍是原文的一部分。'}]}
        result={'summary':'一条笔记。','themes':[],'insights':[{'title':'原文','text':'记录原文的措辞。','evidence':[{'note_id':'original','quote':context['notes'][0]['body']}]}],'questions':[]}
        with patch.dict(os.environ,AI_CHAT_URL='https://example.com/chat',AI_MODEL='fixture',AI_API_KEY='test-placeholder'),patch('ai.fetch_json') as fetch:
            fetch.return_value={'choices':[{'message':{'content':json.dumps(result)}}]}
            self.assertEqual(ai.generate('personal_notes',context),result)
            result['insights'][0]['evidence'][0]['quote']='原文没有的句子。'
            fetch.return_value={'choices':[{'message':{'content':json.dumps(result)}}]}
            with self.assertRaises(Problem) as invalid:ai.generate('personal_notes',context)
            self.assertEqual(invalid.exception.status,502)

    def test_unknown_task_cannot_silently_skip_writing_skill(self):
        with self.assertRaises(Problem):ai_writing.instruction('new-task-without-profile')

    def test_personal_review_citations_remain_exact_and_writing_rules_apply(self):
        context={'personal':True,'draft':'我的想法','notes':[{'id':'n1','body':'原文保持不变','type':'highlight'}]}
        result={'polished':'整理后的想法','suggestions':['保留疑问'],'questions':['依据是什么？'],'evidence':[{'note_id':'n1','quote':'原文保持不变'}]}
        with patch.dict(os.environ,AI_CHAT_URL='https://example.com/chat',AI_MODEL='fixture',AI_API_KEY='test-placeholder'),patch('ai.fetch_json') as fetch:
            fetch.return_value={'choices':[{'message':{'content':json.dumps(result)}}]}
            self.assertEqual(ai.generate('review',context),result)
            self.assertIn(ai_writing.COMMON,fetch.call_args.args[2]['messages'][0]['content'])
            result['evidence'][0]['quote']='伪造引文'
            fetch.return_value={'choices':[{'message':{'content':json.dumps(result)}}]}
            with self.assertRaises(Problem):ai.generate('review',context)
