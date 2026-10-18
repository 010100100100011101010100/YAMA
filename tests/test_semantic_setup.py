import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/setup-semantic.py'


class SemanticSetupTests(unittest.TestCase):
    def run_setup(self, *arguments):
        downloads = []

        def download(model, **options):
            downloads.append((model, options))
            Path(options['local_dir']).mkdir(parents=True, exist_ok=True)

        hub = types.ModuleType('huggingface_hub')
        hub.snapshot_download = download
        with patch.dict(sys.modules, {'huggingface_hub': hub}), \
                patch.object(sys, 'argv', [str(SCRIPT), *arguments]), \
                contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(SCRIPT), run_name='__main__')
        return downloads

    def test_model_only_setup_needs_no_environment_file(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.chdir(directory):
            destination = Path(directory) / 'image-model'
            downloads = self.run_setup('--directory', str(destination), '--no-env')
            self.assertFalse(Path('.env.local').exists())
            self.assertFalse(Path('.local').exists())
            manifest = json.loads((destination / 'yama-model.json').read_text())
            self.assertEqual(manifest['dimensions'], 384)
            self.assertEqual(manifest['revision'], downloads[0][1]['revision'])
            self.assertEqual(downloads[0][0], manifest['model'])
            self.assertIn('model.safetensors', downloads[0][1]['allow_patterns'])

    def test_model_only_setup_preserves_existing_environment(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.chdir(directory):
            original = 'YAMA_SEMANTIC_MODEL_PATH=/operator/model\nOTHER_SETTING=keep\n'
            Path('.env.local').write_text(original)
            self.run_setup('--directory', str(Path(directory) / 'model'), '--no-env')
            self.assertEqual(Path('.env.local').read_text(), original)

    def test_default_setup_retains_local_configuration_behaviour(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.chdir(directory):
            Path('.env.local').write_text('OTHER_SETTING=keep\n')
            self.run_setup()
            contents = Path('.env.local').read_text()
            self.assertIn('OTHER_SETTING=keep\n', contents)
            model = Path.cwd() / '.local/models/multilingual-e5-small'
            self.assertIn('YAMA_SEMANTIC_MODEL_PATH=' + json.dumps(str(model)), contents)
            self.assertEqual(os.stat('.env.local').st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
