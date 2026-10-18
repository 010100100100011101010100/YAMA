import unittest
from yama_agents.dialogue import generate, FixtureDialogue
from tests.test_dialogue import bindings


class DialogueToneTests(unittest.IsolatedAsyncioTestCase):
    async def test_roles_do_not_repeat_introductions_or_internal_dataset_labels(self):
        for language in ('en', 'hi', 'hinglish'):
            for agent in ('saathi', 'drishti', 'disha'):
                reply = await generate(bindings(agent, language, automatic=False), FixtureDialogue())
                self.assertNotRegex(reply['text'], r'I[’\']m (?:Saathi|Drishti|Disha)|Main (?:Saathi|Drishti|Disha) hoon|मैं (?:साथी|दृष्टि|दिशा) हूँ')
                self.assertNotRegex(reply['text'].casefold(), r'fictional|synthetic|fixture|काल्पनिक')
