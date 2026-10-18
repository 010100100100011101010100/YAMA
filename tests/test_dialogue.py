import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from yama_agents.backend import BackendError
from yama_agents.coordinator import AgentId
from yama_agents.openai_model import OpenAIModel, ProviderConfig
from yama_agents.dialogue import generate, FixtureDialogue


def bindings(agent='saathi', language='en', automatic=True, depth=0):
    return {'agent': agent, 'language': language, 'revision': 2, 'confirmed': False,
            'automatic': automatic, 'depth': depth, 'messages': [{'text': 'Synthetic: payment was not made.'}],
            'assertions': [], 'history': []}


class DialogueTests(unittest.IsolatedAsyncioTestCase):
    async def test_synthetic_identifier_matches_and_reported_outcomes_are_grounded_for_both_specialists(self):
        from copy import deepcopy
        source_id = '550e8400-e29b-41d4-a716-446655440000'
        reference = {'messageId': source_id, 'start': 0, 'end': 24, 'quote': 'seller@synthetic.invalid'}
        reference['end'] = len(reference['quote'])
        candidate = {'title': 'Fictional report', 'shared': [], 'different': [], 'differences': [],
            'harmCategories': ['sexual_molestation', 'bullying'],
            'identifiers': [{'kind': 'email', 'value': reference['quote'], 'assertionIds': [source_id],
                'quote': reference['quote'], 'source': {key: reference[key] for key in ('messageId', 'start', 'end')}, 'catalogueSource': reference}],
            'resolution': {'status': 'partially_resolved', 'summary': 'The synthetic reporter said an account was blocked.',
                'verification': 'synthetic_user_report', 'actions': [{'kind': 'account_blocked', 'description': 'Reported block',
                    'date': '2026-10-01', 'sourceMessageId': source_id}]},
            'evidence': [{'id': source_id, 'name': 'synthetic-screenshot.png', 'format': 'png', 'sha256': 'a' * 64}]}
        for agent in ('drishti', 'disha'):
            context = bindings(agent, automatic=False); context['confirmed'] = True
            context['comparison'] = {'status': 'ready', 'revision': 2, 'recipe': 'confirmed-pattern-sources-v1',
                'candidates': [candidate], 'blocked': [], 'linkage': 'not_assessed'}
            await generate(context, FixtureDialogue())
            for mutate in (
                lambda value: value['resolution'].update(verification='police_verified'),
                lambda value: value['evidence'][0].update(sha256='not-a-hash'),
                lambda value: value['identifiers'][0].update(kind='password'),
                lambda value: value['identifiers'][0]['catalogueSource'].update(end=999),
                lambda value: value.update(privateVictimName='not authorized'),
                lambda value: value.update(harmCategories=['unrecognized_offence']),
                lambda value: value.update(harmCategories=['bullying', 'bullying']),
                lambda value: value.update(fictionalActor={'name': 'Author-only answer key'}),
            ):
                invalid = deepcopy(context); mutate(invalid['comparison']['candidates'][0])
                with self.assertRaises(BackendError): await generate(invalid, FixtureDialogue())

    async def test_named_recipient_gets_an_explicit_localized_saathi_bridge(self):
        for language in ('en', 'hi', 'hinglish'):
            context = bindings(language=language)
            context['addressing'] = {'kind': 'name', 'target': 'disha'}
            context['visited'] = []
            reply = await generate(context, FixtureDialogue())
            self.assertIn('@Disha', reply['text'])
            self.assertEqual(reply['handoff'], {'target': 'disha', 'reason': 'user_goal'})

    async def test_every_role_can_route_a_request_to_another_specialist(self):
        for agent, text, target in (
            ('disha', '@Disha, find similar cases.', 'drishti'),
            ('drishti', '@Drishti, what are my next steps?', 'disha'),
            ('disha', '@Disha, I need to correct my account.', 'saathi'),
        ):
            context = bindings(agent)
            context['messages'] = [{'text': text}]
            reply = await generate(context, FixtureDialogue())
            self.assertEqual(reply['handoff']['target'], target)
            self.assertIn('@' + target.capitalize(), reply['text'])

    async def test_a_model_cannot_ignore_the_requested_recipient_or_cycle_back(self):
        context = bindings()
        context['addressing'] = {'kind': 'name', 'target': 'disha'}
        wrong = {'text': '@Drishti, continue.', 'handoff': {'target': 'drishti', 'reason': 'similar_cases'}}
        with self.assertRaises(BackendError):
            await generate(context, SimpleNamespace(reply=AsyncMock(return_value=wrong)))
        context = bindings('drishti', depth=1)
        context['visited'] = ['saathi']
        loop = {'text': '@Saathi, continue.', 'handoff': {'target': 'saathi', 'reason': 'clarification'}}
        with self.assertRaises(BackendError):
            await generate(context, SimpleNamespace(reply=AsyncMock(return_value=loop)))

    async def test_drishti_uses_actual_comparisons_without_claiming_identity_linkage(self):
        context = bindings('drishti', automatic=False); context['confirmed'] = True
        context['comparison'] = {'status': 'ready', 'revision': 2, 'recipe': 'confirmed-pattern-sources-v1',
            'candidates': [{'title': 'Fictional delivery', 'shared': ['paid'], 'different': ['no_reply'], 'differences': []}],
            'blocked': [{'pattern': 'no_reply', 'status': 'contradicted'}], 'linkage': 'not_assessed'}
        for language in ('en', 'hi', 'hinglish'):
            context['language'] = language
            reply = await generate(context, FixtureDialogue())
            self.assertIn('1', reply['text'])
            self.assertNotIn('has not searched', reply['text'])
        context['comparison']['revision'] = 1
        with self.assertRaises(BackendError): await generate(context, FixtureDialogue())

    async def test_empty_pending_and_unconfirmed_comparisons_are_distinct(self):
        context = bindings('drishti', automatic=False)
        for status in ('unconfirmed', 'pending', 'ready'):
            context['confirmed'] = status != 'unconfirmed'
            context['comparison'] = {'status': status, 'revision': 2, 'recipe': 'confirmed-pattern-sources-v1', 'candidates': [], 'blocked': [], 'linkage': 'not_assessed'}
            reply = await generate(context, FixtureDialogue())
            self.assertIn({'unconfirmed': 'confirm', 'pending': 'still being prepared', 'ready': 'No matching'}[status], reply['text'])

    async def test_all_roles_and_languages_have_bounded_fixture_replies(self):
        for language in ('en', 'hi', 'hinglish'):
            for agent in AgentId:
                reply = await generate(bindings(agent.value, language), FixtureDialogue())
                self.assertTrue(reply['text'].strip())
                self.assertLessEqual(len(reply['text']), 4000)
        self.assertEqual((await generate(bindings(), FixtureDialogue()))['handoff']['target'], 'drishti')

    async def test_auto_off_and_chain_limit_suppress_handoffs(self):
        for context in (bindings(automatic=False), bindings(depth=2)):
            reply = await generate(context, FixtureDialogue())
            self.assertIsNone(reply['handoff'])
            self.assertIn('What would you like to clarify?', reply['text'])
            self.assertNotIn('Drishti can explain', reply['text'])

    async def test_model_cannot_select_itself_or_forge_a_task_ready_handoff(self):
        for handoff in ({'target': 'saathi', 'reason': 'user_goal'}, {'target': 'disha', 'reason': 'connection_ready'}):
            model = SimpleNamespace(reply=AsyncMock(return_value={'text': 'Reply', 'handoff': handoff}))
            with self.assertRaises(BackendError):
                await generate(bindings(), model)

    async def test_openai_has_app_owned_history_strict_output_and_no_write_tools(self):
        client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(return_value=SimpleNamespace(
            status='completed', model='test-model', output=[], output_text='{"text":"What would you like to clarify?","handoff":null,"question":null}', usage=None))))
        model = OpenAIModel(ProviderConfig('private-test-key', 'test-model', 'https://api.openai.com/v1', 1000, 2), client=client)
        context = bindings('disha', 'hinglish')
        context['history'] = [{'agent': 'saathi', 'text': 'An earlier reply.'}]
        reply = await generate(context, model)
        self.assertIsNone(reply['handoff'])
        request = client.responses.create.call_args.kwargs
        self.assertFalse(request['store'])
        self.assertEqual(request['tools'], [])
        self.assertNotIn('previous_response_id', request)
        self.assertIn('Disha', request['instructions'])
        self.assertIn('An earlier reply.', request['input'][0]['content'])
        self.assertTrue(request['text']['format']['strict'])

    async def test_invalid_or_overlong_output_and_context_are_rejected(self):
        for reply in ({'text': 'x' * 4001, 'handoff': None}, {'text': 'ok', 'handoff': None, 'confirm': True}):
            with self.assertRaises(BackendError):
                await generate(bindings(), SimpleNamespace(reply=AsyncMock(return_value=reply)))
        context = bindings(); context['messages'][0]['text'] = 'x' * 24001
        with self.assertRaises(BackendError):
            await generate(context, FixtureDialogue())

    async def test_context_preserves_corrections_negative_and_excluded_evidence(self):
        context = bindings('drishti')
        context['assertions'] = [{'field': 'amount', 'value': '₹2,000', 'originalValue': '₹1,000', 'included': False, 'polarity': 'contradicted'}]
        client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(return_value=SimpleNamespace(
            status='completed', model='test-model', output=[], output_text='{"text":"We need to review this uncertainty.","handoff":null,"question":null}', usage=None))))
        model = OpenAIModel(ProviderConfig('private-test-key', 'test-model', 'https://api.openai.com/v1', 1000, 2), client=client)
        await generate(context, model)
        import json
        request = client.responses.create.call_args.kwargs
        submitted = json.loads(request['input'][0]['content'])
        self.assertEqual(submitted['assertions'], context['assertions'])
        self.assertNotIn('ownerId', submitted)
        self.assertNotIn('reportId', submitted)
        self.assertIn('Prior generated replies are not evidence', request['instructions'])

    async def test_unknown_roles_and_locale_cannot_load_skills_or_call_a_provider(self):
        model = SimpleNamespace(reply=AsyncMock(return_value={'text': 'Never called', 'handoff': None}))
        for context in (bindings('../../staff'), bindings(language='fr')):
            with self.assertRaises(BackendError):
                await generate(context, model)
        model.reply.assert_not_called()
