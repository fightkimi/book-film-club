"""Bounded, public-bibliography candidates for an activity organizer."""
import re
import secrets

import movie_catalog
from domain import Problem, choice, find, text

INSTRUCTION = '''
【活动书影策划方法】
这是从已有作品中做选择，不是编造书单或影单。先根据 theme 提炼一个具体、开放的讨论问题，再比较候选资料能支持哪些关联。
内部按四项判断：与问题的具体关联；是否能让参与者提出不同但成立的看法；与其他候选相比是否增加新的观察角度；资料已知的时间或理解负担。不要输出评分、排名分数或方法过程。
从 candidates 中挑3至6部有依据的候选，相关作品不足时少选或返回空数组。mixed 时两类都有合适作品就同时考虑，不强凑配对。作品并不是这次都要读完或看完的必修清单。
每部 reason 控制在约40至70个汉字，用一两句话自然连接作品与主题，并留一个可聊的方向。不要每项都套“可聊：”或相同句式，避免“探讨人性”“引发共鸣”等万能理由。理由不能套用到任意其他主题。
再反向检查一次：它为什么可能不适合这次相聚？例如与主题仅有标题联系、已知片长偏长、与另一候选重复。只把有依据、会影响选择的限制写进 caveat，尽量不超过40个汉字；没有实际限制时留空。不重复“资料没有交代结局”等无助于选择的提醒，不编造风险。
片长只能使用 runtime；没有书籍页数、阅读速度或影片时长时，不估算阅读或观影时间。不假定参与者的喜好、年龄、读过看过的经历，不把简介当作读完全书或看完原片。
不剧透结局，不引用未提供的对白、原文或镜头。保留候选 work_id。完成选择后再按 human-writing 的保真规则润色，只返回指定 JSON。
'''


def terms(value):
    tokens = set(re.findall(r'[a-z0-9]{2,}', value.lower()))
    for phrase in re.findall(r'[\u4e00-\u9fff]+', value):
        tokens.update(phrase[i:i+2] for i in range(len(phrase)-1))
    return tokens - {'我们', '一个', '可以', '什么', '如何', '主题', '讨论', '这次', '或者', '自己'}


def candidates(state, payload):
    kind = choice(payload.get('kind'), ('mixed', 'book', 'movie'))
    theme = find(state['themes'], payload.get('theme_id'))
    excluded = payload.get('exclude', [])
    if not isinstance(excluded, list) or len(excluded) > 200 or any(not isinstance(v, str) or len(v)>100 for v in excluded):
        raise Problem('已选作品无效')
    local = state['works']
    known = {str(w.get('source_id')) for w in local if w.get('provider')=='tmdb' and w.get('kind')=='movie'}
    public = [] if kind=='book' else [dict(w, externalMovie=True) for w in movie_catalog.snapshot()['movies'] if w['source_id'] not in known]
    rows = [w for w in [*local, *public] if (kind=='mixed' or w['kind']==kind)
            and w['id'] not in excluded and ('tmdb:'+str(w.get('source_id'))) not in excluded
            and (w.get('metadata_status')=='confirmed' or w.get('externalMovie'))]
    if not rows: raise Problem('暂时没有更多可推荐的作品，可以先手动选择')
    public_theme = {k:str(theme.get(k, ''))[:1200] for k in ('title','description','angles')}
    tokens = sorted(terms(' '.join(public_theme.values())))[:160]
    def score(row):
        fields = [(str(row.get(field,'')).lower()[:1200], weight)
                  for field,weight in [('title',6),('tags',3),('description',1)]]
        return sum(weight for value,weight in fields for token in tokens if token in value)
    def shortlist(pool, count):
        ranked = sorted(pool, key=lambda w:(-score(w),w['id']))
        top = ranked[:count*2//3]
        rest = ranked[len(top):]
        return top + secrets.SystemRandom().sample(rest, min(count-len(top),len(rest)))
    chosen = (shortlist([w for w in rows if w['kind']=='book'],24)+shortlist([w for w in rows if w['kind']=='movie'],24)
              if kind=='mixed' else shortlist(rows,48))
    # Never include user notes, shelf history, membership, credentials, or arbitrary extra fields.
    context = {'activity_selection':True,'theme':public_theme,'preferences':{'kind':kind},
               'candidates':[{'id':w['id'],'title':str(w['title'])[:160],'creator':str(w.get('creator',''))[:120],
                              'kind':w['kind'],'tags':str(w.get('tags',''))[:160],
                              'description':str(w.get('description',''))[:240],
                              'runtime':w.get('extra',{}).get('runtime')} for w in chosen]}
    return chosen, context


def present(works, draft):
    by_id = {w['id']:w for w in works}
    result = []
    rows = draft.get('recommendations')
    if not isinstance(rows,list) or len(rows)>6:raise Problem('推荐结果不完整，请重试',502)
    used = set()
    for row in rows:
        key = row.get('work_id') if isinstance(row,dict) else None
        if key not in by_id or key in used:raise Problem('推荐结果包含无效作品，请重试',502)
        used.add(key);work=by_id[key]
        public = {k:work.get(k,'') for k in ('id','title','kind','creator','provider','source_id','image','metadata_status')}
        result.append({**public,'externalMovie':bool(work.get('externalMovie')),
                       'reason':text(row.get('reason'),1200),'caveat':text(row.get('caveat',''),800,False)})
    return {'recommendations':result}
