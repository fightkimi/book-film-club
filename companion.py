"""Read-only companion contexts. Never send other members' notes or account data."""
from domain import Problem, boolean, choice, find, integer, text
from contextlib import contextmanager
import threading
import time

_lock = threading.Lock()
_requests = {}
_running = set()


@contextmanager
def generation_slot(user_id):
    """Single-instance budget guard: one in flight, at most six starts per minute."""
    stamp = time.monotonic()
    with _lock:
        for key in list(_requests):
            _requests[key] = [at for at in _requests[key] if stamp - at < 60]
            if not _requests[key]:
                del _requests[key]
        if user_id in _running:
            raise Problem('上一条 AI 请求仍在处理中，请稍后再试', 429)
        if len(_requests.get(user_id, [])) >= 6:
            raise Problem('AI 请求较频繁，请一分钟后再试', 429)
        _requests.setdefault(user_id, []).append(stamp)
        _running.add(user_id)
    try:
        yield
    finally:
        with _lock:
            _running.discard(user_id)


def work_context(work):
    return {key: work.get(key, '') for key in ('id', 'title', 'kind', 'creator', 'year', 'tags')} | {
        'description': work.get('description', '')[:1200],
        'runtime': work.get('extra', {}).get('runtime'),
    }


def discover(state, user, payload):
    theme = find(state['themes'], payload.get('theme_id'))
    kind = choice(payload.get('kind', 'mixed'), ['mixed', 'movie', 'book'])
    minutes = integer(payload.get('minutes', 0), 0, 600)
    exclude_seen = boolean(payload.get('exclude_seen', True))
    mood = text(payload.get('mood', ''), 300, False)
    seen = {s['work_id'] for s in state['shelves'] if s['user_id'] == user['id'] and s['status'] == 'done'}
    seen.update(r['work_id'] for r in state['records'] if r['user_id'] == user['id'] and r['progress'] == 100)
    works = []
    for work in reversed(state['works']):
        if work.get('metadata_status') != 'confirmed' or (kind != 'mixed' and work['kind'] != kind):
            continue
        if exclude_seen and work['id'] in seen:
            continue
        runtime = work.get('extra', {}).get('runtime')
        # Unknown runtimes cannot satisfy a strict viewing-time constraint.
        if minutes and work['kind'] == 'movie' and (type(runtime) not in (int, float) or not 0 < runtime <= minutes):
            continue
        works.append(work)
    return {
        'works': works[:24], 'total': len(works),
        'context': {
            'theme': {key: theme.get(key, '')[:2000] for key in ('title', 'description', 'angles')},
            'preferences': {'kind': kind, 'minutes': minutes, 'mood': mood},
            'candidates': [work_context(w) for w in works[:24]],
        },
    }


def context_for(task, state, user, payload):
    if task == 'recommend':
        result = discover(state, user, payload)
        if not result['works']:
            raise Problem('没有符合条件的作品，请调整筛选或先补充书影库')
        return result['context']
    if task == 'guide':
        return {'work': work_context(find(state['works'], payload.get('work_id')))}
    if task == 'review':
        cycle = find(state['cycles'], payload.get('cycle_id'))
        if user['id'] not in cycle['participants']:
            raise Problem('只能整理自己参与活动的感想', 403)
        if cycle['status'] not in ('active', 'closed'):
            raise Problem('仅进行中或已结束的活动可以整理感想', 409)
        work = find(cycle['works'], payload.get('work_id'))
        return {'work': work_context(work), 'draft': text(payload.get('body'), 12000),
                'theme': text(cycle['theme']['title']),
                'spoiler': boolean(payload.get('spoiler', False))}
    raise Problem('AI 任务无效')
