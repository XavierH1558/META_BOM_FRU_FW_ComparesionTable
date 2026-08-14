import unittest
import os
import json
from app import app

class TestV2EnhancementSuite(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_export_excel(self):
        """Test /api/export-excel endpoint produces downloadable xlsx bytes."""
        res = self.client.get('/api/export-excel?type=fru')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertTrue(len(res.data) > 0)

    def test_release_summary(self):
        """Test /api/release-summary returns structured markdown and text."""
        res = self.client.get('/api/release-summary?project=sanmiguel')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('# 🚀 META VR200 (SanMiguel) All-in-One Release Summary Report', data['markdown'])
        self.assertIn('markdown', data)

    def test_global_search(self):
        """Test /api/global-search returns matched results across datasets."""
        res = self.client.get('/api/global-search?q=cpld')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('results', data)
        self.assertIn('bkc', data['results'])
        self.assertIn('fru', data['results'])
        self.assertIn('matrix', data['results'])

    def test_history(self):
        """Test /api/history returns historical file metadata."""
        res = self.client.get('/api/history')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('history', data)

    def test_watchlist(self):
        """Test GET and POST /api/watchlist."""
        res = self.client.get('/api/watchlist')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('keywords', data)

    def test_signoff(self):
        """Test GET and POST /api/signoff."""
        res_post = self.client.post('/api/signoff', json={
            'key': 'test_item_1',
            'status': 'PASS',
            'note': 'Test signoff verification note'
        })
        self.assertEqual(res_post.status_code, 200)
        
        res_get = self.client.get('/api/signoff')
        self.assertEqual(res_get.status_code, 200)
        data = res_get.get_json()
        self.assertTrue(data['success'])
        self.assertIn('test_item_1', data['signoffs'])
        self.assertEqual(data['signoffs']['test_item_1']['status'], 'PASS')

    def test_yaml_compare(self):
        """Test /api/yaml-compare parses 1-3 YAML test suites and compares with BKC sheet."""
        res = self.client.get('/api/yaml-compare')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('summary', data)
        self.assertIn('items', data)
        self.assertIn('total_yaml_checks', data['summary'])
        self.assertIn('compliance_rate', data['summary'])

    def test_yaml_export_excel(self):
        """Test /api/export-excel?type=yaml produces downloadable xlsx workbook."""
        res = self.client.get('/api/export-excel?type=yaml')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertTrue(len(res.data) > 0)

    def test_yaml_release_summary(self):
        """Test /api/release-summary?tab=yaml returns structured markdown report."""
        res = self.client.get('/api/release-summary?tab=yaml')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('# 🧪 Test Suite (YAML) Compliance Summary', data['markdown'])

    def test_yaml_dispositions(self):
        """Test GET and POST /api/yaml-dispositions."""
        res_post = self.client.post('/api/yaml-dispositions', json={
            'key': 'test_key_1',
            'disposition_status': 'Waived',
            'owner': 'Meta PE',
            'note': 'Waived per client review'
        })
        self.assertEqual(res_post.status_code, 200)

        res_get = self.client.get('/api/yaml-dispositions')
        self.assertEqual(res_get.status_code, 200)
        data = res_get.get_json()
        self.assertTrue(data['success'])
        self.assertIn('test_key_1', data['dispositions'])
        self.assertEqual(data['dispositions']['test_key_1']['disposition_status'], 'Waived')

    def test_yaml_patch(self):
        """Test POST /api/yaml-patch generates code diff snippet."""
        res = self.client.post('/api/yaml-patch', json={
            'step_location': 'OOB_FW_Flash~bmc_flash',
            'component': 'BMC',
            'file_name': 'test.yaml',
            'yaml_version': '1.0.0',
            'bkc_version': '1.0.1'
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('patch_text', data)
        self.assertIn('snippet_yaml', data)

    def test_yaml_version_diff(self):
        """Test GET /api/yaml-version-diff compares two test suite files."""
        res = self.client.get('/api/yaml-version-diff')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('summary', data)
        self.assertIn('items', data)

    def test_5slot_yaml_export_and_summary(self):
        """Test /api/export-excel and /api/release-summary with 5 YAML slots."""
        res_excel = self.client.get('/api/export-excel?type=yaml&yaml_1=sanmiguel_dvt_fst.yaml&yaml_4=sanmiguel_dvt_runin_v2.yaml')
        self.assertEqual(res_excel.status_code, 200)

        res_sum = self.client.get('/api/release-summary?project=sanmiguel&tab=all&yaml_1=sanmiguel_dvt_fst.yaml&yaml_5=sanmiguel_dvt_pretest.yaml')
        self.assertEqual(res_sum.status_code, 200)
        data = res_sum.get_json()
        self.assertTrue(data['success'])
        self.assertIn('SanMiguel', data['markdown'])

if __name__ == '__main__':
    unittest.main()


