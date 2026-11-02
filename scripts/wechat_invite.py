"""Bootstrap the first WeChat binding for an existing member, on the server."""
import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    parser = argparse.ArgumentParser(description='为指定小组成员生成一次性微信绑定邀请')
    parser.add_argument('username', help='已有小组账号（首次绑定管理员时使用）')
    args = parser.parse_args()
    config = Path('/etc/tongpin/tongpin.env')
    if config.exists():
        for line in config.read_text().splitlines():
            key, sep, value = line.partition('=')
            if sep and key in ('CLUB_DB','WECHAT_APP_ID','WECHAT_APP_SECRET'):
                os.environ[key] = value.strip()
    import server
    from wechat_login import invite
    from domain import Problem
    with server.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        user = conn.execute('SELECT id FROM users WHERE username=?', (args.username.lower(),)).fetchone()
        if not user:
            raise SystemExit('账号不存在')
        try:
            ticket = invite(conn, user[0])
        except Problem as error:
            raise SystemExit(error.message)
    print('仅交给该成员本人，有效期 10 分钟。')
    print('pages/login/index?invite=' + ticket['invite'])


if __name__ == '__main__':
    main()
