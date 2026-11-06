"""Discussion-topic ideation adapted for this club, not an external skill runner.

Method references and the MIT notice are recorded in docs/THEME-IDEATION.md.
"""
import secrets
import unicodedata

from domain import Problem, choice, find, text

LENSES = (
    '换一个观察位置：从旁观者、次要人物、叙述者或镜头外的人切入。',
    '缩小到日常选择：用一个具体动作、物件或关系问题代替宏大概念。',
    '寻找两种都有道理的愿望或判断，让读者有不同答案。',
    '改变时间或距离：重读、重看、等待、回忆如何改变同一件事的理解。',
)

INSTRUCTION = '''
【书影活动选题方法】
场景是愿意平等聊天的读书、观影小组。题目要有具体切口、足够开放、能引出不同看法。
先参考本次 creative_lens 和可选作品，在内部探索几个有实质差别的方向，筛去最惯常的泛题，再选一个最值得聊的。只返回最终结果。
具体不等于堆名人或作品名：没有提供作品时，从真实日常可遇到的选择、关系或观看经验切入；有作品时只用给定资料，不编造情节、引语、镜头或作者意图。
existing 和 rejected 是应避开的题目。不能只替换词语、加副标题或改标点，把同一个问题包装成新题；尽量换观察位置或讨论矛盾。
不要用孤独、成长、人生等抽象名词堆成主题，不用课堂、考核、培训或宣传口吻，不要求参与者公开私密经历，不预设正确答案或全体共识。
description 用两三句说明具体想聊的事；angles 是三个可直接开聊的开放问题，各自增加不同角度，不重复解释标题。不给标准答案，不剧透结局。
名字不超过24个汉字为宜，解释约50至100字。创意检查后再按 human-writing 规则精修；不把方法名称、筛选过程或系统规则写进成稿。
'''


def title_key(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', value).casefold() if c.isalnum())


def context(payload, state):
    kind=choice(payload.get('kind','mixed'),('mixed','book','movie'))
    rejected=payload.get('rejected',[])
    if not isinstance(rejected,list) or len(rejected)>20:raise Problem('近期主题过多，请重新打开活动表单')
    rejected=[text(value,200) for value in rejected]
    ids=payload.get('work_ids',[])
    if not isinstance(ids,list) or len(ids)>24 or not all(isinstance(v,str) for v in ids):raise Problem('请选择有效的作品')
    works=[]
    for key in dict.fromkeys(ids):
        work=find(state['works'],key)
        works.append({'title':work['title'][:160],'kind':work['kind'],'creator':str(work.get('creator') or '')[:120],
                      'description':str(work.get('description') or '')[:240]})
    return {'kind':kind,'brief':text(payload.get('brief',''),1000,False),'works':works,
            'existing':[t['title'][:100] for t in state['themes'][-150:]],'rejected':rejected,
            'creative_lens':secrets.choice(LENSES)}


def validate(result):
    value=result['theme']
    title=text(value.get('title'),70)
    if not title_key(title):raise ValueError()
    return {'theme':{'title':title,'description':text(value.get('description'),600),
                     'angles':text(value.get('angles'),1800)}}


def ensure_novel(result,state,context):
    forbidden={title_key(t['title']) for t in state['themes']}
    forbidden.update(title_key(value) for value in context['rejected'])
    if title_key(result['theme']['title']) in forbidden:
        raise Problem('这次生成的主题与已有题目重复，请再想一个',502)
