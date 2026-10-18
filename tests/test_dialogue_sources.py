import unittest
from copy import deepcopy
from yama_agents.backend import BackendError
from yama_agents.dialogue import generate, FixtureDialogue
from tests.test_dialogue import bindings


class DialogueSourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_context_is_bounded_and_cannot_introduce_foreign_tools_or_private_urls(self):
        context = bindings('disha', automatic=False)
        context['publicContext'] = {'status': 'ready', 'sources': [{
            'url': 'https://cybercrime.gov.in/', 'title': 'Reporting portal', 'publisher': 'cybercrime.gov.in',
            'retrievedAt': '2026-10-17T12:00:00.000Z', 'excerpt': 'Public guidance.', 'bodyRead': True, 'live': True,
        }]}
        await generate(context, FixtureDialogue())
        for mutation in [lambda value: value.update(url='http://127.0.0.1/'),
                         lambda value: value.update(url='https://user:secret@cybercrime.gov.in/'),
                         lambda value: value.update(excerpt='x' * 2001),
                         lambda value: value.update(tool='send_email')]:
            invalid = deepcopy(context)
            mutation(invalid['publicContext']['sources'][0])
            with self.assertRaises(BackendError): await generate(invalid, FixtureDialogue())

    async def test_questions_cannot_be_duplicates_unbounded_or_attached_to_a_handoff(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        for question in [
            {'kind': 'choice', 'prompt': 'Choose', 'options': ['Same', 'Same'], 'placeholder': None},
            {'kind': 'text', 'prompt': 'Answer', 'options': ['Unexpected'], 'placeholder': None},
            {'kind': 'text', 'prompt': 'x' * 181, 'options': [], 'placeholder': None},
        ]:
            with self.assertRaises(BackendError):
                await generate(bindings(automatic=False), SimpleNamespace(reply=AsyncMock(return_value={'text': 'A question.', 'handoff': None, 'question': question})))
