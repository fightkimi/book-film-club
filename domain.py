"""Club invariants. All mutations run inside a version-checked SQLite transaction."""
import copy
import datetime as dt
import secrets
import uuid
import json
from pathlib import Path
POSTER_KEYS = {p["id"] for p in json.loads((Path(__file__).parent/"src"/"posters.json").read_text())}

TZ = dt.timezone(dt.timedelta(hours=8))


class Problem(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status
        super().__init__(message)


def now():
    return dt.datetime.now(TZ).isoformat(timespec='seconds')


def uid():
    return uuid.uuid4().hex[:16]


def text(value, limit=200, required=True):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise Problem('请填写有效内容，长度不超过 %s 字' % limit)
    return value.strip()


def choice(value, options):
    if value not in options:
        raise Problem('选项无效')
    return value


def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise Problem('数值范围应为 %s～%s' % (low, high))
    return value


def boolean(value):
    if type(value) is not bool:
        raise Problem('请使用有效的开关值')
    return value


def find(items, key):
    result = next((x for x in items if x['id'] == key), None)
    if result is None:
        raise Problem('记录不存在', 404)
    return result


def admin(user):
    if user['role'] != 'admin':
        raise Problem('只有管理员可以操作', 403)


def date(value):
    try:
        return dt.date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        raise Problem('日期格式应为 YYYY-MM-DD')


def empty_state(group='书影小组'):
    return dict(group=group, themes=[], cycles=[], works=[], draws=[], shelves=[], records=[], reviews=[], votes=[], audit=[])


def report(s, cycle, member_id, at=None):
    if cycle.get('archived_reports') and cycle['status'] == 'archived':
        return copy.deepcopy(cycle['archived_reports'][member_id])
    p = cycle['participants'][member_id]
    records = [r for r in s['records'] if r['cycle_id'] == cycle['id'] and r['user_id'] == member_id]
    reviews = [r for r in s['reviews'] if r['cycle_id'] == cycle['id'] and r['user_id'] == member_id]
    target = cycle.get('works', [])
    complete, qualified, evidence = 0, 0, []
    for w in target:
        r = next((r for r in records if r['work_id'] == w['id']), {})
        v = next((r for r in reviews if r['work_id'] == w['id']), {})
        if r.get('progress') == 100:
            complete += 1
        if r.get('progress') == 100 and (not cycle['rules']['review'] or v.get('body')):
            qualified += 1
            evidence.append(max(r['completed_at'], v['created_at'] if cycle['rules']['review'] else r['completed_at']))
    enough = bool(target) and (qualified == len(target) if cycle['rules']['quantity'] == 'all' else qualified >= 1)
    done = enough and (not cycle['rules']['discussion'] or p['discussion'])
    done_at = None
    if done:
        done_at = max(evidence) if cycle['rules']['quantity'] == 'all' else min(evidence)
        if cycle['rules']['discussion']:
            done_at = max(done_at, p['discussion_at'])
    deadline = cycle['end'] + 'T23:59:59+08:00'
    if p['status'] != 'joined':
        status = p['status']
    elif cycle['status'] == 'draft':
        status = 'planned'
    elif done:
        status = 'late_done' if done_at > deadline else 'done'
    elif (at or now()) > deadline:
        status = 'overdue'
    else:
        status = 'in_progress' if records or reviews or p['discussion'] else 'not_started'
    return dict(user_id=member_id, status=status, completed=complete, total=len(target), reviewed=len(reviews), discussion=p['discussion'], completed_at=done_at)


def ready_work(w):
    return bool(w.get('title') and w.get('creator') and w.get('description') and w.get('image') and w.get('source_url') and w.get('metadata_status') == 'confirmed')


def mutate(s, user, action, p, users):
    stamp, result = now(), None
    if action == 'theme.save':
        admin(user)
        old = find(s['themes'], p['id']) if p.get('id') else None
        item = dict(id=old['id'] if old else uid(), title=text(p.get('title')), description=text(p.get('description', ''), 4000, False), kind=choice(p.get('kind', 'mixed'), ['book','movie','mixed']), angles=text(p.get('angles',''),6000,False), tags=text(p.get('tags',''),300,False), weight=integer(p.get('weight',1),1,10), enabled=boolean(p.get('enabled',True)), created_at=old['created_at'] if old else stamp, updated_at=stamp, source=old.get('source','manual') if old else 'manual',poster_key=choice(p.get('poster_key',old.get('poster_key','') if old else ''),[*POSTER_KEYS,'none','']))
        if old:
            old.update(item)
        else:
            s['themes'].append(item)
        result = item
    elif action == 'theme.draw':
        admin(user)
        mode = choice(p.get('mode','fresh'), ['fresh','continue','random'])
        kind = choice(p.get('kind','mixed'), ['book','movie','mixed'])
        used = [c['theme_id'] for c in sorted(s['cycles'], key=lambda c:c.get('published_at',''), reverse=True) if c['status'] != 'draft']
        candidates = [t for t in s['themes'] if t['enabled'] and (kind == 'mixed' or t['kind'] in [kind,'mixed'])]
        if mode == 'fresh':
            candidates = [t for t in candidates if t['id'] not in used[:3]]
        elif mode == 'continue':
            candidates = [t for t in candidates if t['id'] in used]
        if not candidates:
            raise Problem('没有符合条件的主题，请调整抽取模式或新增主题')
        winner = secrets.SystemRandom().choices(candidates, weights=[t['weight'] for t in candidates])[0]
        result = dict(id=uid(), theme_id=winner['id'], theme_title=winner['title'], mode=mode, kind=kind, candidates=[dict(id=t['id'],title=t['title'],weight=t['weight']) for t in candidates], at=stamp, user_id=user['id'])
        s['draws'].append(result)
    elif action == 'work.save':
        old = find(s['works'],p['id']) if p.get('id') else None
        if old:
            admin(user)
        item = dict(id=old['id'] if old else uid(), kind=choice(p.get('kind'),['book','movie']), title=text(p.get('title')), creator=text(p.get('creator',''),300,False), year=text(p.get('year',''),40,False), description=text(p.get('description',''),12000,False), tags=text(p.get('tags',''),500,False), image=text(p.get('image',''),2000,False), source_url=text(p.get('source_url',''),2000,False), metadata_status=choice(p.get('metadata_status','pending'),['pending','confirmed']), created_at=old['created_at'] if old else stamp, updated_at=stamp)
        if old and item['kind'] != old['kind']:
            raise Problem('已有作品的类型不可更改，请创建新作品')
        for key in ['image','source_url']:
            if item[key] and not item[key].startswith('https://') and not (key == 'image' and item[key].startswith('/media/')):
                raise Problem('图片和来源链接须使用 HTTPS')
        for w in s['works']:
            if w['id'] != item['id'] and (w['kind'],w['title'].casefold(),w['creator'].casefold()) == (item['kind'],item['title'].casefold(),item['creator'].casefold()):
                raise Problem('该作品已在书影库中，请使用现有作品',409)
        if item['metadata_status'] == 'confirmed' and not ready_work(item):
            raise Problem('确认资料前请补全作者或导演、简介、图片与来源')
        # Metadata provenance is only accepted through the trusted scraper import route.
        if old:
            old.update(item)
            old['manual_edited_at'] = stamp
            result = old
        else:
            item['provider'] = 'manual'
            s['works'].append(item)
            result = item
    elif action == 'cycle.save':
        admin(user)
        old = find(s['cycles'],p['id']) if p.get('id') else None
        if old and old['status'] != 'draft':
            raise Problem('活动已发布，主题、作品和规则已冻结',409)
        theme = find(s['themes'],p.get('theme_id'))
        start, end = date(p.get('start')), date(p.get('end'))
        if end < start:
            raise Problem('截止日期不能早于开始日期')
        members = p.get('member_ids',[])
        if not isinstance(members,list) or not members or len(members) != len(set(members)):
            raise Problem('请选择参与成员')
        for mid in members:
            member = find(users,mid)
            if member.get('disabled'):
                raise Problem('不能添加已停用成员')
        works = p.get('work_ids',[])
        if not isinstance(works,list) or len(works) != len(set(works)):
            raise Problem('作品列表无效')
        snapshots = [copy.deepcopy(find(s['works'],wid)) for wid in works]
        rules = p.get('rules',{})
        item = dict(id=old['id'] if old else uid(), title=text(p.get('title')), start=start,end=end,kind=choice(p.get('kind','mixed'),['book','movie','mixed']),theme_id=theme['id'],theme=copy.deepcopy(theme), direction=text(p.get('direction',''),4000,False),works=snapshots, nominations=old['nominations'] if old else list(works),participants={mid:(old['participants'].get(mid,dict(status='joined',discussion=False,discussion_at=None)) if old else dict(status='joined',discussion=False,discussion_at=None)) for mid in members},rules=dict(quantity=choice(rules.get('quantity','all'),['all','any']),review=boolean(rules.get('review',False)),discussion=boolean(rules.get('discussion',False))),status='draft',created_at=old['created_at'] if old else stamp,content_version=0,recap='',recap_version=-1)
        if old:
            old.update(item)
        else:
            s['cycles'].append(item)
        result = item
    elif action == 'cycle.transition':
        admin(user)
        c = find(s['cycles'],p.get('id'))
        target = p.get('status')
        allowed = {'draft':['active'],'active':['closed'],'closed':['active','archived'],'archived':[]}
        if target not in allowed[c['status']]:
            raise Problem('不允许这样更改活动状态',409)
        if target == 'active' and c['status'] == 'draft':
            if not c['works']:
                raise Problem('请至少确定一部作品')
            # Re-read canonical metadata at publish; draft snapshots may be outdated.
            c['works'] = [copy.deepcopy(find(s['works'],w['id'])) for w in c['works']]
            if any(not ready_work(w) for w in c['works']):
                raise Problem('请先补全并确认所有作品的刮削资料和图片')
            if c['kind'] != 'mixed' and any(w['kind'] != c['kind'] for w in c['works']):
                raise Problem('作品类型与活动类型不一致')
            c['theme'] = copy.deepcopy(find(s['themes'],c['theme_id']))
            c['published_at'] = stamp
        if target == 'archived':
            c['archived_reports'] = {mid: report(s,c,mid) for mid in c['participants']}
        c['status'] = target
        result = c
    elif action in ['nominate','vote']:
        c = find(s['cycles'],p.get('cycle_id'))
        if c['status'] != 'draft':
            raise Problem('活动已发布，候选和投票已锁定',409)
        if user['id'] not in c['participants'] and user['role'] != 'admin':
            raise Problem('你不在本期名单中',403)
        w = find(s['works'],p.get('work_id'))
        if action == 'nominate':
            if w['id'] not in c['nominations']:
                c['nominations'].append(w['id'])
        else:
            if w['id'] not in c['nominations']:
                raise Problem('请先提名这部作品')
            old = next((v for v in s['votes'] if v['cycle_id']==c['id'] and v['work_id']==w['id'] and v['user_id']==user['id']),None)
            if old:
                s['votes'].remove(old)
            else:
                s['votes'].append(dict(id=uid(),cycle_id=c['id'],work_id=w['id'],user_id=user['id']))
    elif action in ['record.save','review.save','participation.save']:
        c = find(s['cycles'],p.get('cycle_id'))
        if c['status'] not in ['active','closed']:
            raise Problem('仅进行中或已结束的活动可登记；归档活动只读',409)
        mid = p.get('user_id',user['id'])
        if mid != user['id']:
            admin(user)
        if mid not in c['participants']:
            raise Problem('成员不在本期名单中')
        if action == 'participation.save':
            old = c['participants'][mid]
            status = choice(p.get('status'),['joined','leave','opted_out'])
            discussion = boolean(p.get('discussion',False))
            old.update(status=status, discussion=discussion, discussion_at=(old.get('discussion_at') or stamp) if discussion else None)
        else:
            wid = p.get('work_id')
            find(c['works'],wid)
            items = s['records'] if action == 'record.save' else s['reviews']
            old = next((r for r in items if r['cycle_id']==c['id'] and r['user_id']==mid and r['work_id']==wid),None)
            item = dict(id=old['id'] if old else uid(),cycle_id=c['id'],user_id=mid,work_id=wid,updated_at=stamp)
            if action == 'record.save':
                progress = integer(p.get('progress'),0,100)
                item.update(progress=progress,note=text(p.get('note',''),10000,False),completed_at=((old or {}).get('completed_at') or stamp) if progress == 100 else None)
            else:
                item.update(body=text(p.get('body'),20000),rating=integer(p.get('rating'),1,5),spoiler=boolean(p.get('spoiler',False)),created_at=old['created_at'] if old else stamp)
            if old:
                old.update(item)
            else:
                items.append(item)
            result = item
        c['content_version'] += 1
    elif action == 'shelf.save':
        w = find(s['works'],p.get('work_id'))
        status = choice(p.get('status'),['wish','reading','done','none'])
        old = next((r for r in s['shelves'] if r['user_id']==user['id'] and r['work_id']==w['id']),None)
        if old:
            s['shelves'].remove(old)
        if status != 'none':
            s['shelves'].append(dict(id=uid(),user_id=user['id'],work_id=w['id'],status=status,updated_at=stamp))
    elif action == 'recap.save':
        admin(user)
        c = find(s['cycles'],p.get('cycle_id'))
        if c['status'] not in ['active','closed']:
            raise Problem('活动草稿及归档期间不能编辑回顾',409)
        c['recap'] = text(p.get('body'),20000)
        c['recap_version'] = c['content_version']
        c['recap_at'] = stamp
    else:
        raise Problem('不支持的操作')
    s['audit'].append(dict(id=uid(),action=action,user_id=user['id'],target_user_id=p.get('user_id'),target_id=p.get('id') or p.get('cycle_id') or (result or {}).get('id'),at=stamp))
    return result
