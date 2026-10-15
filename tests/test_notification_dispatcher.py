import copy
import unittest
from uuid import uuid4
from test_agent_dispatcher import FakeBackend,report
from yama_agents.coordinator import AgentId,AuthorizationError,StateError
from yama_agents.dispatcher import ToolDispatcher
from yama_agents.fixture_model import FixtureModel

class MailBackend(FakeBackend):
    def __init__(self,snapshot):
        super().__init__(snapshot)
        self.notification={"id":str(uuid4()),"reportId":snapshot["_id"],"revision":1,"template":"workspace-link-v1","language":snapshot["language"],"status":"draft","provider":"fixture","deliveryConfirmed":False,
                           "recipient":{"id":str(uuid4()),"address":"preview@example.invalid","verification":"fixture"},"content":{"subject":"Your Yama workspace","text":"Generic link only.","html":"<p>Generic link only.</p>"},"receipt":"a"*64}
    async def notification_preview(self,report_id):
        return copy.deepcopy(self.notification)

class NotificationDispatcherTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.snapshot=report();self.backend=MailBackend(self.snapshot);self.dispatcher=await ToolDispatcher.bind(self.backend,self.snapshot["_id"],FixtureModel());self.room=self.dispatcher.coordinator
        self.room.select_agent(AgentId.DISHA);self.output=self.room.begin_output(AgentId.DISHA)
    async def test_disha_can_prepare_but_cannot_send_or_select_an_arbitrary_recipient(self):
        task=await self.dispatcher.start(self.output,AgentId.DISHA,"prepare_email",{});self.assertEqual((await self.dispatcher.execute(task))["status"],"ready")
        preview=await self.dispatcher.result(self.output,task);self.assertEqual(preview["status"],"draft");self.assertFalse(preview["deliveryConfirmed"])
        for agent in (AgentId.SAATHI,AgentId.DRISHTI):
            with self.assertRaises(AuthorizationError):await self.dispatcher.start(self.output,agent,"prepare_email",{})
        with self.assertRaises(ValueError):await self.dispatcher.start(self.output,AgentId.DISHA,"prepare_email",{"to":"evil@example.com"})
        with self.assertRaises(AuthorizationError):await self.dispatcher.start(self.output,AgentId.DISHA,"send_email",{})
    async def test_changed_preview_invalidates_a_cached_agent_result(self):
        task=await self.dispatcher.start(self.output,AgentId.DISHA,"prepare_email",{});await self.dispatcher.execute(task);self.backend.notification["receipt"]="b"*64
        with self.assertRaises(StateError):await self.dispatcher.result(self.output,task)
    async def test_wrong_revision_or_false_delivery_claim_is_rejected(self):
        for change in ({"revision":2},{"deliveryConfirmed":True}):
            self.backend.notification.update(change)
            task=await self.dispatcher.start(self.output,AgentId.DISHA,"prepare_email",{});self.assertEqual((await self.dispatcher.execute(task))["errorCode"],"invalid_backend_response")
            self.backend.notification.update(revision=1,deliveryConfirmed=False)
