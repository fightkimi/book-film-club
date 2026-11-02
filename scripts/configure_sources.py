"""Interactive server-only credential setup. Input never appears in shell history."""
import argparse
import getpass
import os
from pathlib import Path
import re
import sys
import tempfile
import subprocess

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))


def write_setting(path,key,value):
    lines=path.read_text().splitlines() if path.exists() else []
    lines=[line for line in lines if not line.startswith(key+'=')]
    lines.append(key+'='+value)
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False) as out:
        os.chmod(out.name,0o600)
        out.write('\n'.join(lines)+'\n')
        temp=out.name
    os.replace(temp,path)


def configure(source,path):
    from domain import Problem
    import metadata
    # Load configuration only into this process; never print its values.
    if path.exists():
        for line in path.read_text().splitlines():
            key,sep,value=line.partition('=')
            if sep and re.fullmatch(r'[A-Z][A-Z0-9_]*',key): os.environ[key]=value.strip()
    variable={'tmdb':'TMDB_TOKEN','omdb':'OMDB_KEY'}[source]
    value=getpass.getpass(variable+'（输入不显示，直接回车取消）: ').strip()
    if source=='tmdb': value=value.removeprefix('Bearer ').strip()
    if not value: return False
    if not re.fullmatch(r'[A-Za-z0-9_.-]{8,4096}',value):
        raise Problem('密钥格式不正确，未保存')
    os.environ[variable]=value
    if source=='tmdb':
        data=metadata.tmdb('configuration')
        if not data.get('images'): raise Problem('TMDB 未返回有效配置，未保存')
    else:
        from sources import read_json
        import urllib.parse
        data=read_json('https://www.omdbapi.com/?'+urllib.parse.urlencode(dict(apikey=value,i='tt1285016')))
        if data.get('Response')=='False': raise Problem('OMDb 未返回有效影片，未保存')
    write_setting(path,variable,value)
    return True


if __name__=='__main__':
    from domain import Problem
    parser=argparse.ArgumentParser(description='安全配置同频电影数据源')
    parser.add_argument('source',choices=['tmdb','omdb'])
    parser.add_argument('--env-file',default='/etc/tongpin/tongpin.env')
    args=parser.parse_args()
    try:
        if configure(args.source,Path(args.env_file)):
            subprocess.run(['systemctl','restart','tongpin'],check=True)
            print('验证成功，配置已保存，服务已重启。')
        else: print('已取消，没有修改配置。')
    except Problem as error:
        print(error.message,file=sys.stderr);raise SystemExit(1)
