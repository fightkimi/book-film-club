"""Personal close-reading and shot notebooks, separate from activity completion."""
import json
from domain import Problem, choice, find, text, now, uid
from companion import work_context

GLOSSARY = [
    {'name':'景别','definition':'画面中人物或物体所占的范围，从远景到特写。','observe':'记下同一人物在不同景别下，你感到亲近还是疏离。'},
    {'name':'构图','definition':'画面内人物、物体、空白与边界的安排。','observe':'视线先落在哪里？前景和背景的关系如何变化？'},
    {'name':'场面调度','definition':'人物、物体与摄影机在空间里的位置和运动安排。','observe':'谁靠近谁，谁被遮挡？位置变化是否改变了关系？'},
    {'name':'长镜头','definition':'一次连续拍摄在剪辑中保持较长时间不中断。','observe':'记录连续观察带来的感受，不把移动镜头都叫长镜头。'},
    {'name':'蒙太奇','definition':'通过镜头之间的组合与关系产生节奏、意义或联想。','observe':'相邻两镜放在一起，比单独观看多了什么含义？'},
    {'name':'匹配剪辑','definition':'以动作、形状、声音等相似性连接不同镜头。','observe':'具体是哪种相似性连接了前后画面？'},
    {'name':'叙事内声音','definition':'故事世界中存在、人物原则上可能听见的声音。','observe':'与配乐区分，留意看不见声源但仍属于故事空间的声音。'},
    {'name':'声桥','definition':'声音先于画面切换出现，或在切换后延续。','observe':'声音如何把两个空间或时间连接起来？'},
    {'name':'叙述视角','definition':'故事通过谁的感知与知识呈现，决定读者能知道什么。','observe':'区分叙述者的观察、判断，以及你自己的推测。'},
    {'name':'不可靠叙述','definition':'叙述者的陈述可能与文本的其他线索存在距离。','observe':'记录矛盾的具体证据，同时保留其他解释。'},
]


def notebook(payload,work):
    mode=choice(payload.get('mode','analysis'),['analysis','shots'])
    if mode=='shots' and work['kind']!='movie': raise Problem('逐镜记录仅适用于电影')
    notes=text(payload.get('notes',''),12000,False)
    shots=payload.get('shots',[])
    if not isinstance(shots,list) or len(shots)>30: raise Problem('每份笔记最多 30 个镜头')
    normalized=[]
    last_end=0
    for i,shot in enumerate(shots):
        if not isinstance(shot,dict): raise Problem('镜头格式无效')
        start,end=shot.get('start'),shot.get('end')
        if type(start) not in (int,float) or type(end) not in (int,float) or not 0<=start<end<=36000 or start<last_end:
            raise Problem('镜头起止秒数需递增、不重叠，且结束晚于开始')
        last_end=end
        normalized.append(dict(id='S'+str(i+1),start=start,end=end,
                               **{k:text(shot.get(k,''),1000,k=='evidence') for k in ('evidence','composition','movement','cut','sound')}))
    result=dict(work_id=work['id'],mode=mode,notes=notes,shots=normalized)
    if len(json.dumps(result,ensure_ascii=False))>60000: raise Problem('笔记过长，请拆分保存')
    return result


def ai_context(payload,state):
    work=find(state['works'],payload.get('work_id'))
    note=notebook(payload,work)
    if note['mode']=='analysis' and not note['notes']:
        raise Problem('请先写下你实际观察到的片段或阅读笔记')
    if note['mode']=='shots' and not note['shots']:
        raise Problem('请先记录至少一个镜头的起止时间和画面证据')
    return dict(work=work_context(work),notebook=note)


def validate_analysis(result,context):
    if not isinstance(result,dict): raise ValueError()
    claims=result.get('claims')
    if not isinstance(claims,list) or not 1<=len(claims)<=8: raise ValueError()
    evidence=context['notebook']['notes']+'\n'+'\n'.join(s['evidence'] for s in context['notebook']['shots'])
    normalized=[]
    for claim in claims:
        quote=text(claim.get('quote'),1000)
        if quote not in evidence: raise ValueError()
        normalized.append(dict(quote=quote,interpretation=text(claim.get('interpretation'),2000)))
    questions=result.get('questions')
    if not isinstance(questions,list) or not 1<=len(questions)<=5: raise ValueError()
    return dict(summary=text(result.get('summary'),4000),claims=normalized,questions=[text(q,1000) for q in questions])


def save(state,user,payload):
    work=find(state['works'],payload.get('work_id'))
    entry=notebook(payload,work)
    # Only explicit, edited text is persisted. AI drafts are not written by generate endpoints.
    entry['reflection']=text(payload.get('reflection',''),16000,False)
    entries=state.setdefault('studies',[])
    old=next((e for e in entries if e['user_id']==user['id'] and e['work_id']==work['id'] and e['mode']==entry['mode']),None)
    entry.update(id=old['id'] if old else uid(),user_id=user['id'],updated_at=now())
    if old: old.update(entry)
    else: entries.append(entry)
    return entry
