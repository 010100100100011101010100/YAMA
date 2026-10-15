"""Authenticated localhost service gateway for the Python worker.

The trusted session adapter supplies the cookie; models receive neither this
object nor credentials. Fixed public-lookup job routes are the only writes;
no arbitrary URL, raw query or report mutation is exposed.
"""

import asyncio
import json
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import UUID


class BackendError(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def require_uuid(value):
    try:
        if not isinstance(value, str) or str(UUID(value)) != value.lower():
            raise ValueError
    except (ValueError, AttributeError):
        raise ValueError("A UUID reference is required") from None
    return value


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        return None


class LocalBackend:
    def __init__(self, origin: str, cookie: str):
        parsed = urlsplit(origin)
        try:
            valid_port = parsed.port is not None and 1024 <= parsed.port <= 65535
        except ValueError:
            valid_port = False
        if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not valid_port
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in {"", "/"}):
            raise ValueError("The local gateway requires an explicit IPv4 loopback origin")
        if not isinstance(cookie, str) or not cookie or len(cookie) > 8192 or any(ord(c) < 32 or ord(c) == 127 for c in cookie):
            raise ValueError("A trusted session credential is required")
        self._origin = origin.rstrip("/")
        self._cookie = cookie
        # Never inherit proxy settings or forward a session cookie on a redirect.
        self._opener = build_opener(ProxyHandler({}), NoRedirects())

    def _get(self, path, command=None):
        headers = {"Cookie": self._cookie, "Accept": "application/json"}
        encoded = None
        if command is not None:
            encoded = json.dumps(command, ensure_ascii=False).encode("utf-8")
            if len(encoded) > 4096:
                raise ValueError("Public lookup command is too large")
            headers.update({"Origin": self._origin, "Content-Type": "application/json"})
        request = Request(self._origin + path, data=encoded, headers=headers)
        try:
            with self._opener.open(request, timeout=10) as response:
                if response.status not in {200, 202} or response.headers.get_content_type() != "application/json":
                    raise BackendError("invalid_backend_response")
                body = response.read(4 * 1024 * 1024 + 1)
                if len(body) > 4 * 1024 * 1024:
                    raise BackendError("invalid_backend_response")
                return json.loads(body)
        except HTTPError as error:
            # Do not include provider bodies, cookie values or arbitrary messages.
            codes = {401: "authentication_required", 403: "access_denied", 404: "report_not_found",
                     409: "revision_conflict", 429: "rate_limited", 503: "service_unavailable"}
            error.close()
            raise BackendError(codes.get(error.code, "service_unavailable")) from None
        except (URLError, socket.timeout, OSError):
            raise BackendError("service_unavailable") from None
        except (ValueError, UnicodeError):
            raise BackendError("invalid_backend_response") from None

    async def _read(self, path, key=None, command=None):
        body = await asyncio.to_thread(self._get, path) if command is None else await asyncio.to_thread(self._get, path, command)
        if not isinstance(body, dict) or (key is not None and key not in body):
            raise BackendError("invalid_backend_response")
        return body[key] if key is not None else body

    async def get_report(self, report_id):
        return await self._read(f"/api/reports/{require_uuid(report_id)}", "report")

    async def connections(self, report_id):
        return await self._read(f"/api/reports/{require_uuid(report_id)}/connections")

    async def list_evidence(self, report_id):
        return await self._read(f"/api/reports/{require_uuid(report_id)}/evidence", "evidence")

    async def evidence_source(self, report_id, evidence_id):
        return await self._read(f"/api/reports/{require_uuid(report_id)}/evidence/{require_uuid(evidence_id)}/source", "source")

    async def assistance(self, language):
        if language not in {"en", "hi", "hinglish"}:
            raise ValueError("Unsupported language")
        return await self._read(f"/api/assistance?language={language}")

    async def actions(self, report_id):
        return await self._read(f"/api/reports/{require_uuid(report_id)}/actions")

    async def start_public_web(self, report_id, command):
        return await self._read(f"/api/reports/{require_uuid(report_id)}/public-web", "job", command)

    async def public_web(self, report_id, job_id):
        return await self._read(f"/api/reports/{require_uuid(report_id)}/public-web/{require_uuid(job_id)}", "job")

    async def cancel_public_web(self, report_id, job_id):
        return await self._read(f"/api/reports/{require_uuid(report_id)}/public-web/{require_uuid(job_id)}/cancel", "job", {})

    async def notification_preview(self, report_id):
        return await self._read(f"/api/reports/{require_uuid(report_id)}/notifications/preview", "notification")
