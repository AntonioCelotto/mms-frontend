from __future__ import annotations

import json
from http import HTTPStatus

MAX_JSON_BODY_BYTES = 128 * 1024


def read_json_body(handler):
    try:
        length = int(handler.headers.get("Content-Length", "0") or "0")
    except ValueError:
        return None
    if length > MAX_JSON_BODY_BYTES:
        return None
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def write_json(handler, payload, status=HTTPStatus.OK):
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def write_options(handler):
    handler.send_response(HTTPStatus.NO_CONTENT)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()


def parse_positive_int(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def parse_optional_positive_int(value):
    if value in (None, "", 0, "0"):
        return None
    return parse_positive_int(value)


def parse_optional_number(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def clean_text(value):
    if value is None:
        return ""
    return str(value).strip()


def normalize_choice(value, allowed, default=None):
    normalized = clean_text(value).lower()
    if normalized in allowed:
        return normalized
    return default


def public_error(message, status=HTTPStatus.BAD_REQUEST):
    return {"error": message}, status
