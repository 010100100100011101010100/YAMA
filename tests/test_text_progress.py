import unittest
from yama_agents.text_progress import TextProgress

class TextProgressTests(unittest.TestCase):
    def test_only_text_field_is_emitted_with_safe_partial_unicode_and_no_handoff_execution(self):
        seen=[]; progress=TextProgress(seen.append)
        progress.feed('{"text":"नमस्ते ')
        self.assertEqual(seen, ['नमस्ते '])
        progress.last_emit=0
        progress.feed('hello\\nworld", "handoff":{"target":"disha"}}')
        self.assertEqual(seen[-1], 'नमस्ते hello\nworld')
        self.assertNotIn('disha', ''.join(seen))

    def test_does_not_emit_analysis_or_other_json_fields(self):
        seen=[]; TextProgress(seen.append).feed('{"reasoning":"private thought","handoff":null}')
        self.assertEqual(seen, [])
