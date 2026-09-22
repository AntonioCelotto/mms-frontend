from __future__ import annotations

import json
import socket
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

from _api import profile_can_access_order, require_access, write_json, write_options
from _supabase import SUPABASE_KEY, SUPABASE_TIMEOUT_SECONDS, SUPABASE_URL, fetch_table, resolve_order


SIGNED_URL_SECONDS = 3600


def signed_storage_url(bucket: str, path: str) -> str:
    request = Request(
        f"{SUPABASE_URL}/storage/v1/object/sign/{quote(bucket, safe='')}/{quote(path, safe='/')}",
        data=json.dumps({"expiresIn": SIGNED_URL_SECONDS}).encode("utf-8"),
        method="POST",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except (HTTPError, URLError, TimeoutError, socket.timeout, json.JSONDecodeError) as exc:
        raise RuntimeError("Impossibile autorizzare il download dell'allegato") from exc
    signed_path = payload.get("signedURL") or payload.get("signedUrl") or ""
    if not signed_path:
        raise RuntimeError("Collegamento allegato non disponibile")
    return signed_path if signed_path.startswith("http") else f"{SUPABASE_URL}{signed_path}"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        profile = require_access(self, {"admin", "commerce", "operator"})
        if not profile:
            return
        query = parse_qs(urlparse(self.path).query)
        order_ref = (query.get("order_id") or [""])[0]
        try:
            order = resolve_order(int(order_ref))
        except (TypeError, ValueError, RuntimeError):
            order = None
        if not order:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)
        if not profile_can_access_order(profile, order.get("id")):
            return write_json(self, {"error": "Operazione non autorizzata"}, HTTPStatus.FORBIDDEN)

        rows = fetch_table(
            "attachments",
            select="id,order_id,file_type,file_name,storage_bucket,storage_path,mime_type,file_size,created_at",
            filters={"order_id": f"eq.{order['id']}"},
            order="id.asc",
        )
        attachments = []
        try:
            for row in rows:
                bucket = row.get("storage_bucket") or ""
                path = row.get("storage_path") or ""
                if not bucket or not path:
                    continue
                attachments.append({
                    "id": row["id"],
                    "order_id": int(order_ref),
                    "name": row.get("file_name") or "Allegato",
                    "url": signed_storage_url(bucket, path),
                    "mime_type": row.get("mime_type") or row.get("file_type") or "",
                    "size": row.get("file_size") or 0,
                    "created_at": row.get("created_at") or "",
                })
        except RuntimeError as error:
            return write_json(self, {"error": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, {"attachments": attachments})

    def do_OPTIONS(self):
        return write_options(self)

    def log_message(self, format, *args):
        return
