"""Credential encryption, bound to the owning club member. No secret-returning API."""
import os
from pathlib import Path
import secrets
import stat
import tempfile

from domain import Problem


def key_file():
    default=Path(os.environ.get('BOOKSTORES_DB',Path(__file__).parent/'data'/'bookstores.sqlite3')).with_name('personal-credentials.key')
    return Path(os.environ.get('PERSONAL_VAULT_KEY_FILE',default))


def master_key(create=True):
    path=key_file()
    try:
        if create and not path.exists():
            path.parent.mkdir(parents=True,exist_ok=True)
            fd,tmp=tempfile.mkstemp(prefix='.personal-key-',dir=path.parent)
            try:
                with os.fdopen(fd,'wb') as stream:
                    stream.write(secrets.token_bytes(32));stream.flush();os.fsync(stream.fileno())
                # Publish a complete key atomically; concurrent first binds use the winner.
                try:os.link(tmp,path)
                except FileExistsError:pass
            finally:os.unlink(tmp)
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as stream:
            info=os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode)&0o077:raise ValueError()
            key=stream.read(33)
        if len(key)!=32:raise ValueError()
        return key
    except (OSError,ValueError):
        raise Problem('个人连接密钥不可用，请联系管理员；已有凭证未被替换',503)


def seal(owner,secret):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce=secrets.token_bytes(12)
    return b'\x01'+nonce+AESGCM(master_key()).encrypt(nonce,secret.encode(),('weread:'+owner).encode())


def open_key(owner,ciphertext):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.exceptions import InvalidTag
    try:
        value=bytes(ciphertext)
        if value[:1]!=b'\x01':raise ValueError()
        return AESGCM(master_key(create=False)).decrypt(value[1:13],value[13:],('weread:'+owner).encode()).decode()
    except (InvalidTag,ValueError,UnicodeError):
        raise Problem('个人连接无法解密，请重新绑定本人 Key',503)
