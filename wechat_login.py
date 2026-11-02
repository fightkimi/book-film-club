"""Bind verified mini-program identities to existing private club members."""
import hashlib
import os
import re
import secrets
import time
from urllib.parse import urlencode

from domain import Problem
from metadata import fetch_json

SCHEMA = """
CREATE TABLE IF NOT EXISTS wx_identities (
    app_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY(app_id, subject), UNIQUE(app_id, user_id)
);
CREATE TABLE IF NOT EXISTS wx_invitations (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    app_id TEXT NOT NULL,
    expires INTEGER NOT NULL,
    UNIQUE(app_id, user_id)
);
"""


def configuration():
    app_id = os.environ.get('WECHAT_APP_ID')
    secret = os.environ.get('WECHAT_APP_SECRET')
    if not app_id or not secret:
        raise Problem('微信登录尚待配置小程序 AppID 和服务端 AppSecret', 503)
    return app_id, secret


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def exchange(app_id, secret, code):
    query = urlencode(dict(appid=app_id, secret=secret, js_code=code,
                           grant_type='authorization_code'))
    result = fetch_json('https://api.weixin.qq.com/sns/jscode2session?' + query)
    if not isinstance(result, dict):
        raise Problem('微信登录服务暂时不可用', 502)
    if result.get('errcode') in (40029, 40163):
        raise Problem('微信登录凭据已失效，请重新点击登录', 401)
    if result.get('errcode') == 45011:
        raise Problem('微信登录请求过于频繁，请稍后再试', 429)
    openid = result.get('openid')
    if result.get('errcode', 0) or not isinstance(openid, str) or not openid or not result.get('session_key'):
        raise Problem('微信登录校验失败，请稍后再试或联系管理员', 502)
    return digest(openid)


def reserve_attempt(conn, ip):
    key = 'wx:' + ip
    stamp = int(time.time())
    conn.execute('BEGIN IMMEDIATE')
    conn.execute('DELETE FROM attempts WHERE ip LIKE ? AND until<=?', ('wx:%', stamp))
    row = conn.execute('SELECT count FROM attempts WHERE ip=?', (key,)).fetchone()
    if row and row[0] >= 20:
        raise Problem('微信登录请求过于频繁，请一分钟后重试', 429)
    conn.execute('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET count=count+1',
                 (key, stamp + 60))
    conn.commit()  # Don't hold the database lock while contacting WeChat.


def invite(conn, user_id):
    app_id, _ = configuration()
    user = conn.execute('SELECT disabled FROM users WHERE id=?', (user_id,)).fetchone()
    if user is None or user[0]:
        raise Problem('成员不存在或已停用', 404)
    if conn.execute('SELECT 1 FROM wx_identities WHERE app_id=? AND user_id=?', (app_id, user_id)).fetchone():
        raise Problem('该成员已绑定微信', 409)
    token = secrets.token_urlsafe(32)
    expires = int(time.time()) + 600
    conn.execute('INSERT OR REPLACE INTO wx_invitations VALUES(?,?,?,?)',
                 (digest(token), user_id, app_id, expires))
    return dict(invite=token, expires=expires)


def identify(conn, payload, ip):
    app_id, secret = configuration()
    code, ticket = payload.get('code'), payload.get('invite', '')
    if (set(payload) - {'code', 'invite'} or not isinstance(code, str) or not 1 <= len(code.strip()) <= 256
            or not isinstance(ticket, str) or (ticket and not re.fullmatch(r'[A-Za-z0-9_-]{43}', ticket))):
        raise Problem('微信登录请求格式无效')
    reserve_attempt(conn, ip)
    subject = exchange(app_id, secret, code)
    conn.execute('BEGIN IMMEDIATE')
    linked = conn.execute('SELECT user_id FROM wx_identities WHERE app_id=? AND subject=?',
                          (app_id, subject)).fetchone()
    if ticket:
        match = conn.execute('SELECT user_id FROM wx_invitations WHERE app_id=? AND token=? AND expires>?',
                             (app_id, digest(ticket), time.time())).fetchone()
        if not match:
            raise Problem('邀请已过期或已使用，请向管理员获取新邀请', 403)
        user_id = match[0]
        if linked and linked[0] != user_id:
            raise Problem('此微信已绑定其他成员', 403)
        if not linked:
            conn.execute('INSERT INTO wx_identities VALUES(?,?,?)', (app_id, subject, user_id))
        conn.execute('DELETE FROM wx_invitations WHERE token=?', (digest(ticket),))
    elif linked:
        user_id = linked[0]
    else:
        raise Problem('首次加入，请从管理员发给你的专属邀请进入。', 403)
    user = conn.execute('SELECT id FROM users WHERE id=? AND disabled=0', (user_id,)).fetchone()
    if not user:
        raise Problem('此成员账号已停用', 403)
    return user[0]  # Caller commits the binding and new session together.
