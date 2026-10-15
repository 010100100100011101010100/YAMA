"""Real HTTP transport boundaries without databases or provider calls."""

import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from uuid import uuid4

from yama_agents.backend import BackendError, LocalBackend


class Handler(BaseHTTPRequestHandler):
    status = 200
    body = b'{}'
    content_type = "application/json"
    redirect = None
    requests = []

    def log_message(self, *arguments):
        pass

    def do_GET(self):
        type(self).requests.append((self.path, self.headers.get("Cookie")))
        self.send_response(type(self).status)
        self.send_header("Content-Type", type(self).content_type)
        if type(self).redirect:
            self.send_header("Location", type(self).redirect)
        self.end_headers()
        try:
            self.wfile.write(type(self).body)
        except (BrokenPipeError, ConnectionResetError):
            pass


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    async def asyncSetUp(self):
        Handler.status = 200
        Handler.body = b'{}'
        Handler.content_type = "application/json"
        Handler.redirect = None
        Handler.requests = []
        self.gateway = LocalBackend(self.origin, "session=private-fixture")
        self.report_id = str(uuid4())

    async def test_only_literal_loopback_origin_is_accepted(self):
        for origin in ("https://example.com", "http://127.0.0.1.evil.test:3000", "http://localhost:3000",
                       "http://127.0.0.1:3000/path", "http://user@127.0.0.1:3000", "http://127.0.0.1:3000/?target=other",
                       "http://127.0.0.1:3000/#x", "http://127.0.0.1:80", "http://127.0.0.1:99999"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                LocalBackend(origin, "session=private-fixture")

    async def test_credentials_and_references_never_become_request_paths(self):
        for cookie in ("", "session=x\r\nX-Forged: true", "a" * 8193):
            with self.assertRaises(ValueError):
                LocalBackend(self.origin, cookie)
        for reference in ("../other", "?query=x", "not-a-uuid", {"$ne": None}):
            with self.assertRaises(ValueError):
                await self.gateway.get_report(reference)
        self.assertEqual(Handler.requests, [])

    async def test_all_four_reads_use_fixed_owned_routes(self):
        evidence_id = str(uuid4())
        for method, arguments, key, value, suffix in (
            (self.gateway.get_report, [self.report_id], "report", {"_id": self.report_id}, ""),
            (self.gateway.connections, [self.report_id], None, {"status": "ready"}, "/connections"),
            (self.gateway.list_evidence, [self.report_id], "evidence", [], "/evidence"),
            (self.gateway.evidence_source, [self.report_id, evidence_id], "source", {"text": "Fictional"}, f"/evidence/{evidence_id}/source"),
        ):
            Handler.body = json.dumps({key: value} if key else value).encode()
            self.assertEqual(await method(*arguments), value)
            self.assertEqual(Handler.requests[-1][0], f"/api/reports/{self.report_id}{suffix}")
            self.assertEqual(Handler.requests[-1][1], "session=private-fixture")

    async def test_redirect_does_not_forward_session_cookie(self):
        Handler.status = 302
        Handler.redirect = self.origin + "/credential-sink"
        with self.assertRaises(BackendError):
            await self.gateway.get_report(self.report_id)
        self.assertEqual(len(Handler.requests), 1)

    async def test_inherited_proxy_is_not_used(self):
        Handler.body = b'{"report":{}}'
        with patch.dict(os.environ, {"http_proxy": "http://127.0.0.1:1", "HTTP_PROXY": "http://127.0.0.1:1", "no_proxy": ""}):
            gateway = LocalBackend(self.origin, "session=private-fixture")
            self.assertEqual(await gateway.get_report(self.report_id), {})

    async def test_backend_bodies_and_credentials_are_absent_from_errors(self):
        for status, code in ((401, "authentication_required"), (404, "report_not_found"),
                             (409, "revision_conflict"), (429, "rate_limited"), (503, "service_unavailable")):
            Handler.status = status
            Handler.body = b'private-fixture private incident or driver error'
            with self.assertRaises(BackendError) as raised:
                await self.gateway.get_report(self.report_id)
            self.assertEqual(str(raised.exception), code)

    async def test_invalid_json_wrong_shape_and_non_json_are_refused(self):
        for body, content_type in ((b"not json", "application/json"), (b"[]", "application/json"),
                                   (b"{}", "application/json"), (b'{"report":{}}', "text/html")):
            Handler.body, Handler.content_type = body, content_type
            with self.assertRaises(BackendError):
                await self.gateway.get_report(self.report_id)

    async def test_response_bytes_are_bounded(self):
        Handler.body = b"x" * (4 * 1024 * 1024 + 1)
        with self.assertRaises(BackendError) as raised:
            await self.gateway.get_report(self.report_id)
        self.assertEqual(raised.exception.code, "invalid_backend_response")

    async def test_connection_failure_is_sanitized(self):
        gateway = LocalBackend("http://127.0.0.1:6399", "session=private-fixture")
        with self.assertRaises(BackendError) as raised:
            await gateway.get_report(self.report_id)
        self.assertEqual(raised.exception.code, "service_unavailable")


if __name__ == "__main__":
    unittest.main()
