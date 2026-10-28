"""Create a private consistent SQLite backup. Never overwrite an existing backup."""
import os
import sqlite3
import sys
from pathlib import Path

if len(sys.argv)!=3:
    raise SystemExit('Usage: python scripts/backup.py SOURCE DESTINATION')
source,target=map(Path,sys.argv[1:])
if not source.is_file():
    raise SystemExit('Source database does not exist')
fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
os.close(fd)
with sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True) as src,sqlite3.connect(target) as dst:
    src.backup(dst)
print('Consistent backup created.')
