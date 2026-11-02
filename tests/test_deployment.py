import os
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import metadata
import server
from domain import Problem


class DeploymentContracts(unittest.TestCase):
    def test_credential_file_update_preserves_other_settings_and_permissions(self):
        from scripts.configure_sources import write_setting
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'club.env'
            path.write_text('CLUB_PORT=8787\nTMDB_TOKEN=old-test-only\n')
            write_setting(path,'TMDB_TOKEN','new-test-only')
            self.assertEqual(path.read_text(),'CLUB_PORT=8787\nTMDB_TOKEN=new-test-only\n')
            self.assertEqual(path.stat().st_mode & 0o777,0o600)

    def test_failed_credential_validation_does_not_change_file(self):
        from scripts.configure_sources import configure
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'club.env';path.write_text('TMDB_TOKEN=existing-test-only\n')
            with patch.dict(os.environ,{},clear=True), patch('getpass.getpass',return_value='new-test-only'), patch('metadata.tmdb',side_effect=Problem('invalid',502)):
                with self.assertRaises(Problem):configure('tmdb',path)
            self.assertEqual(path.read_text(),'TMDB_TOKEN=existing-test-only\n')

    def test_tmdb_host_is_allowlisted(self):
        with patch.dict(os.environ,{'TMDB_TOKEN':'fixture','TMDB_API_HOST':'api.tmdb.org'}), patch('metadata.read_json',return_value={}) as read:
            metadata.tmdb('configuration')
            self.assertTrue(read.call_args.args[0].startswith('https://api.tmdb.org/3/'))
            self.assertIn('language=zh-CN',read.call_args.args[0])
        with patch.dict(os.environ,{'TMDB_TOKEN':'fixture','TMDB_API_HOST':'evil.example'}):
            with self.assertRaises(Problem): metadata.tmdb('configuration')

    def test_real_ip_is_trusted_only_from_configured_loopback(self):
        header={'X-Real-IP':'203.0.113.12'}
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(server.client_ip('127.0.0.1',header),'127.0.0.1')
        with patch.dict(os.environ,{'CLUB_TRUST_PROXY':'1'}):
            self.assertEqual(server.client_ip('127.0.0.1',header),'203.0.113.12')
            self.assertEqual(server.client_ip('203.0.113.1',header),'203.0.113.1')
            self.assertEqual(server.client_ip('127.0.0.1',{'X-Real-IP':'spoofed'}),'127.0.0.1')
