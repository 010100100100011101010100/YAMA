"""Behavioral contracts for the offline Yama conversation coordinator."""

import unittest

from yama_agents.coordinator import (
    AgentId, AuthorizationError, Coordinator, Mode, StateError, load_profile,
)


class CoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.room = Coordinator()

    def start_search(self):
        self.room.confirm_report(self.room.revision)
        output = self.room.begin_output(AgentId.SAATHI)
        search = self.room.start_task(output, AgentId.DRISHTI, "find_similar_cases")
        return output, search

    def test_only_foreground_agent_can_speak(self):
        with self.assertRaises(AuthorizationError):
            self.room.begin_output(AgentId.DRISHTI)
        self.room.begin_output(AgentId.SAATHI)
        with self.assertRaises(StateError):
            self.room.begin_output(AgentId.SAATHI)

    def test_handoff_waits_for_complete_text_or_audio_playout(self):
        for mode in Mode:
            with self.subTest(mode=mode):
                room = Coordinator(mode=mode)
                bridge = room.begin_output(AgentId.SAATHI)
                room.request_handoff(bridge, AgentId.DISHA, "next_actions")
                self.assertEqual(room.active_agent, AgentId.SAATHI)
                self.assertTrue(room.accepts_output(bridge))
                room.complete_output(bridge)
                self.assertEqual(room.active_agent, AgentId.DISHA)
                self.assertFalse(room.accepts_output(bridge))

    def test_duplicate_completion_does_not_repeat_handoff(self):
        bridge = self.room.begin_output(AgentId.SAATHI)
        self.room.request_handoff(bridge, AgentId.DISHA, "next_actions")
        self.assertTrue(self.room.complete_output(bridge))
        self.assertFalse(self.room.complete_output(bridge))
        self.assertEqual(sum(event.kind == "agent_changed" for event in self.room.events), 1)

    def test_user_interrupt_cancels_pending_handoff_and_old_chunks(self):
        bridge = self.room.begin_output(AgentId.SAATHI)
        self.room.request_handoff(bridge, AgentId.DISHA, "next_actions")
        self.room.begin_user_turn()
        self.assertFalse(self.room.accepts_output(bridge))
        self.assertFalse(self.room.complete_output(bridge))
        self.assertEqual(self.room.active_agent, AgentId.SAATHI)
        with self.assertRaises(StateError):
            self.room.begin_output(AgentId.SAATHI)
        self.room.end_user_turn()
        self.assertTrue(self.room.accepts_output(self.room.begin_output(AgentId.SAATHI)))

    def test_manual_selection_overrides_handoff_and_preserves_account(self):
        output, search = self.start_search()
        self.room.request_handoff(output, AgentId.DISHA, "next_actions")
        self.room.select_agent(AgentId.DRISHTI)
        self.assertFalse(self.room.complete_output(output))
        self.assertEqual(self.room.active_agent, AgentId.DRISHTI)
        self.assertEqual(self.room.confirmed_revision, self.room.revision)
        self.assertEqual(self.room.task_state(search).status, "running")

    def test_switching_mode_rejects_old_audio_preserves_agent_and_search(self):
        room = Coordinator(mode=Mode.VOICE)
        room.confirm_report(room.revision)
        speech = room.begin_output(AgentId.SAATHI)
        search = room.start_task(speech, AgentId.DRISHTI, "find_similar_cases")
        room.request_handoff(speech, AgentId.DISHA, "next_actions")
        room.set_mode(Mode.TEXT)
        self.assertFalse(room.accepts_output(speech))
        self.assertFalse(room.complete_output(speech))
        self.assertEqual(room.active_agent, AgentId.SAATHI)
        self.assertEqual(room.task_state(search).status, "running")

    def test_background_result_does_not_interrupt_foreground_agent(self):
        bridge, search = self.start_search()
        self.room.request_handoff(bridge, AgentId.DISHA, "next_actions")
        self.room.complete_output(bridge)
        disha = self.room.begin_output(AgentId.DISHA)
        self.assertTrue(self.room.complete_task(search, result_ref="fixture:comparison-1"))
        self.assertEqual(self.room.active_agent, AgentId.DISHA)
        self.assertTrue(self.room.accepts_output(disha))
        self.room.request_handoff(disha, AgentId.DRISHTI, "connection_ready", task=search)
        self.room.complete_output(disha)
        self.assertEqual(self.room.active_agent, AgentId.DRISHTI)

    def test_search_requires_current_confirmation(self):
        output = self.room.begin_output(AgentId.SAATHI)
        with self.assertRaises(AuthorizationError):
            self.room.start_task(output, AgentId.DRISHTI, "find_similar_cases")
        self.room.complete_output(output)
        self.room.select_agent(AgentId.DRISHTI)
        output = self.room.begin_output(AgentId.DRISHTI)
        with self.assertRaises(AuthorizationError):
            self.room.authorize_tool(output, "query_connection_paths")

    def test_disha_can_offer_help_before_confirmation(self):
        self.room.select_agent(AgentId.DISHA)
        output = self.room.begin_output(AgentId.DISHA)
        self.room.authorize_tool(output, "find_reporting_options")
        self.room.authorize_tool(output, "lookup_verified_assistance")
        self.assertIsNone(self.room.confirmed_revision)

    def test_role_permissions_and_trusted_actions_are_denied(self):
        output = self.room.begin_output(AgentId.SAATHI)
        for tool in ("query_connection_paths", "prepare_evidence_manifest", "confirm_report",
                     "submit_complaint", "create_entitlement", "execute_cypher"):
            with self.subTest(tool=tool), self.assertRaises(AuthorizationError):
                self.room.authorize_tool(output, tool)

    def test_background_delegation_cannot_expand_worker_permissions(self):
        output = self.room.begin_output(AgentId.SAATHI)
        with self.assertRaises(AuthorizationError):
            self.room.start_task(output, AgentId.SAATHI, "find_similar_cases")
        with self.assertRaises(AuthorizationError):
            self.room.start_task(output, AgentId.DISHA, "request_handoff")

    def test_stale_generation_cannot_call_tools_or_dispatch_work(self):
        output = self.room.begin_output(AgentId.SAATHI)
        self.room.begin_user_turn()
        with self.assertRaises(AuthorizationError):
            self.room.authorize_tool(output, "read_own_account")
        with self.assertRaises(AuthorizationError):
            self.room.start_task(output, AgentId.DISHA, "find_reporting_options")

    def test_edit_invalidates_confirmation_output_and_running_search(self):
        output, search = self.start_search()
        previous_revision = self.room.revision
        self.room.edit_report()
        self.assertEqual(self.room.revision, previous_revision + 1)
        self.assertIsNone(self.room.confirmed_revision)
        self.assertFalse(self.room.accepts_output(output))
        self.assertFalse(self.room.complete_task(search, result_ref="fixture:stale"))
        self.assertEqual(self.room.task_state(search).status, "stale")

    def test_edit_hides_previously_ready_result(self):
        _, search = self.start_search()
        self.room.complete_task(search, result_ref="fixture:comparison-1")
        self.room.edit_report()
        self.assertEqual(self.room.task_state(search).status, "stale")
        self.assertIsNone(self.room.task_state(search).result_ref)

    def test_old_confirmation_acknowledgement_is_rejected(self):
        previous_revision = self.room.revision
        self.room.edit_report()
        with self.assertRaises(StateError):
            self.room.confirm_report(previous_revision)

    def test_result_ready_handoff_requires_ready_matching_task(self):
        bridge, search = self.start_search()
        with self.assertRaises(StateError):
            self.room.request_handoff(bridge, AgentId.DRISHTI, "connection_ready", task=search)
        self.room.complete_task(search, result_ref="fixture:comparison-1")
        with self.assertRaises(StateError):
            self.room.request_handoff(bridge, AgentId.DISHA, "connection_ready", task=search)
        with self.assertRaises(StateError):
            self.room.request_handoff(bridge, AgentId.DRISHTI, "connection_ready")

    def test_unrelated_task_cannot_be_announced_as_connection_ready(self):
        bridge = self.room.begin_output(AgentId.SAATHI)
        assistance = self.room.start_task(bridge, AgentId.DISHA, "lookup_verified_assistance")
        self.room.complete_task(assistance, result_ref="fixture:assistance")
        with self.assertRaises(StateError):
            self.room.request_handoff(bridge, AgentId.DISHA, "connection_ready", task=assistance)

    def test_failure_and_duplicate_task_callbacks_do_not_claim_success(self):
        _, search = self.start_search()
        self.assertTrue(self.room.complete_task(search, error_code="provider_timeout"))
        self.assertFalse(self.room.complete_task(search, result_ref="fixture:late"))
        self.assertEqual(self.room.task_state(search).status, "failed")
        self.assertIsNone(self.room.task_state(search).result_ref)

    def test_cancellation_ignores_late_task_callback(self):
        _, search = self.start_search()
        self.assertTrue(self.room.cancel_task(search))
        self.assertFalse(self.room.complete_task(search, result_ref="fixture:late"))
        self.assertEqual(self.room.task_state(search).status, "cancelled")

    def test_cancelled_ready_task_cannot_trigger_pending_handoff(self):
        output, search = self.start_search()
        self.room.complete_task(search, result_ref="fixture:comparison-1")
        self.room.request_handoff(output, AgentId.DRISHTI, "connection_ready", task=search)
        self.room.cancel_task(search)
        self.room.complete_output(output)
        self.assertEqual(self.room.active_agent, AgentId.SAATHI)

    def test_user_can_disable_automatic_handoffs_but_select_directly(self):
        output = self.room.begin_output(AgentId.SAATHI)
        self.room.set_auto_handoffs(False)
        with self.assertRaises(StateError):
            self.room.request_handoff(output, AgentId.DISHA, "next_actions")
        self.room.select_agent(AgentId.DISHA)
        self.assertEqual(self.room.active_agent, AgentId.DISHA)

    def test_user_interrupt_preserves_ongoing_background_work(self):
        _, search = self.start_search()
        self.room.begin_user_turn()
        self.assertEqual(self.room.task_state(search).status, "running")

    def test_session_cannot_accept_another_sessions_output_or_task(self):
        output, search = self.start_search()
        another_room = Coordinator()
        self.assertFalse(another_room.accepts_output(output))
        self.assertFalse(another_room.complete_output(output))
        with self.assertRaises(AuthorizationError):
            another_room.complete_task(search, result_ref="fixture:foreign")

    def test_duplicate_pending_and_self_handoffs_are_rejected(self):
        output = self.room.begin_output(AgentId.SAATHI)
        with self.assertRaises(StateError):
            self.room.request_handoff(output, AgentId.SAATHI, "clarification")
        self.room.request_handoff(output, AgentId.DISHA, "next_actions")
        with self.assertRaises(StateError):
            self.room.request_handoff(output, AgentId.DRISHTI, "similar_cases")

    def test_automatic_handoffs_are_bounded_until_user_speaks(self):
        for target in (AgentId.DISHA, AgentId.DRISHTI, AgentId.SAATHI):
            output = self.room.begin_output(self.room.active_agent)
            self.room.request_handoff(output, target, "user_goal")
            self.room.complete_output(output)
        output = self.room.begin_output(AgentId.SAATHI)
        with self.assertRaises(StateError):
            self.room.request_handoff(output, AgentId.DISHA, "user_goal")
        self.room.begin_user_turn()
        self.room.end_user_turn()
        output = self.room.begin_output(AgentId.SAATHI)
        self.room.request_handoff(output, AgentId.DISHA, "user_goal")

    def test_events_are_metadata_only(self):
        _, search = self.start_search()
        self.room.complete_task(search, result_ref="authorized-store:private-result")
        serialized_events = repr(self.room.events)
        self.assertNotIn("private-result", serialized_events)
        self.assertNotIn("instructions", serialized_events)

    def test_task_callback_requires_exactly_one_outcome(self):
        _, search = self.start_search()
        for outcomes in ({}, {"result_ref": "fixture:1", "error_code": "timeout"}):
            with self.subTest(outcomes=outcomes), self.assertRaises(ValueError):
                self.room.complete_task(search, **outcomes)

    def test_profiles_load_common_policy_and_distinct_toolsets(self):
        profiles = {agent: load_profile(agent) for agent in AgentId}
        for profile in profiles.values():
            self.assertTrue(profile.instructions)
            self.assertIn("read_own_account", profile.tools)
            self.assertIn("request_handoff", profile.tools)
            self.assertEqual(profile.speaker, {AgentId.SAATHI:"priya",AgentId.DRISHTI:"shubh",AgentId.DISHA:"suhani"}[profile.agent])
        self.assertIn("propose_draft_assertions", profiles[AgentId.SAATHI].tools)
        self.assertIn("find_similar_cases", profiles[AgentId.DRISHTI].tools)
        self.assertIn("prepare_evidence_manifest", profiles[AgentId.DISHA].tools)
        self.assertNotIn("find_similar_cases", profiles[AgentId.SAATHI].tools)
        self.assertNotEqual(profiles[AgentId.SAATHI].instructions,
                            profiles[AgentId.DRISHTI].instructions)

    def test_invalid_agent_and_mode_fail_before_state_changes(self):
        for action in (lambda: self.room.select_agent("unknown"),
                       lambda: self.room.set_mode("video")):
            with self.assertRaises(ValueError):
                action()
        self.assertEqual(self.room.active_agent, AgentId.SAATHI)
        self.assertEqual(self.room.mode, Mode.TEXT)

    def test_backend_binding_rejects_invalid_revision_and_confirmation(self):
        for revision, confirmed in ((0, None), (True, None), (1.5, None), (2, 1), (1, True)):
            with self.subTest(revision=revision, confirmed=confirmed), self.assertRaises(ValueError):
                Coordinator(revision=revision, confirmed_revision=confirmed)

    def test_backend_synchronization_revokes_old_work_and_refuses_regression(self):
        output, task = self.start_search()
        self.room.synchronize_report(4, None)
        self.assertEqual(self.room.revision, 4)
        self.assertIsNone(self.room.confirmed_revision)
        self.assertFalse(self.room.accepts_output(output))
        self.assertEqual(self.room.task_state(task).status, "stale")
        with self.assertRaises(StateError):
            self.room.synchronize_report(3, None)
        self.assertEqual(self.room.revision, 4)

    def test_revoked_backend_confirmation_and_source_invalidation_hide_ready_results(self):
        _, task = self.start_search()
        self.room.complete_task(task, result_ref="private:result")
        self.room.synchronize_report(1, None)
        self.assertEqual(self.room.task_state(task).status, "stale")
        self.assertIsNone(self.room.task_state(task).result_ref)
        output = self.room.begin_output(AgentId.SAATHI)
        summary = self.room.start_task(output, AgentId.DISHA, "prepare_evidence_manifest")
        self.room.complete_task(summary, result_ref="private:manifest")
        self.assertTrue(self.room.stale_task(summary))
        self.assertFalse(self.room.stale_task(summary))


if __name__ == "__main__":
    unittest.main()
