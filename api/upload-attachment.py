from __future__ import annotations

import base64
import binascii
import json
import re
import socket
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from _api import clean_text, write_json
from _supabase import SUPABASE_KEY, SUPABASE_TIMEOUT_SECONDS, SUPABASE_URL, insert_rows, resolve_order


BUCKET = "order-attachments"
MAX_UPLOAD_BODY_BYTES = 15 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def read_upload_body(handler):
    try:
        length = int(handler.headers.get("Content-Length", "0") or "0")
    except ValueError:
        return None
    if length <= 0 or length > MAX_UPLOAD_BODY_BYTES:
        return None
    raw = handler.rfile.read(length)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", clean_text(name)).strip("-._")
    return cleaned or "attachment"


def upload_to_storage(path: str, content_type: str, data: bytes):
    encoded_path = quote(path, safe="/")
    request = Request(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{encoded_path}",
        data=data,
        method="POST",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "false",
        },
    )
    try:
        with urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(detail or exc.reason) from exc
    except (URLError, TimeoutError, socket.timeout) as exc:
        raise RuntimeError(f"Storage non raggiungibile: {exc}") from exc


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = read_upload_body(self)
        if payload is None:
            return write_json(self, {"error": "Payload allegato non valido o troppo grande"}, HTTPStatus.BAD_REQUEST)

        order_ref = payload.get("order_id")
        file_name = safe_filename(payload.get("file_name"))
        mime_type = clean_text(payload.get("file_type"))
        raw_data = clean_text(payload.get("data"))
        if not order_ref or not file_name or mime_type not in ALLOWED_MIME_TYPES or not raw_data:
            return write_json(self, {"error": "Campi allegato mancanti o non validi"}, HTTPStatus.BAD_REQUEST)

        try:
            order = resolve_order(int(order_ref))
        except (TypeError, ValueError, RuntimeError):
            order = None
        if not order:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        if raw_data.startswith("data:") and "," in raw_data:
            raw_data = raw_data.split(",", 1)[1]

        try:
            binary = base64.b64decode(raw_data, validate=True)
        except (ValueError, binascii.Error):
            return write_json(self, {"error": "File non decodificabile"}, HTTPStatus.BAD_REQUEST)

        if not binary:
            return write_json(self, {"error": "File vuoto"}, HTTPStatus.BAD_REQUEST)

        extension = ALLOWED_MIME_TYPES[mime_type]
        path = f"orders/{order['id']}/{uuid.uuid4().hex}-{file_name}"
        if "." not in path.rsplit("/", 1)[-1]:
            path = f"{path}.{extension}"
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{quote(path, safe='/')}"

        try:
            upload_to_storage(path, mime_type, binary)
            created = insert_rows(
                "attachments",
                {
                    "order_id": order["id"],
                    "file_type": "foto",
                    "file_name": file_name,
                    "file_url": public_url,
                    "storage_bucket": BUCKET,
                    "storage_path": path,
                    "mime_type": mime_type,
                    "file_size": len(binary),
                    "notes": "Caricato da Nuovo ordine",
                },
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Upload allegato non riuscito", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        row = created[0]
        return write_json(
            self,
            {
                "attachment": {
                    "id": row["id"],
                    "order_id": int(order_ref),
                    "name": row["file_name"],
                    "url": row["file_url"],
                    "mime_type": row.get("mime_type") or mime_type,
                    "size": row.get("file_size") or len(binary),
                }
            },
            HTTPStatus.CREATED,
        )

    def do_OPTIONS(self):
        from _api import write_options

        return write_options(self)

    def log_message(self, format, *args):
        return
