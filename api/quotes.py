from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

try:
    from _api import clean_text, read_json_body, write_json, write_options
    from _supabase import delete_rows, fetch_table, supabase_request
except ModuleNotFoundError:
    from api._api import clean_text, read_json_body, write_json, write_options
    from api._supabase import delete_rows, fetch_table, supabase_request


QUOTE_SELECT = "id,quote_number,client_name,category,priority,quote_date,status,note,total,payload,created_at,updated_at"


def quote_date(value):
    cleaned = clean_text(value)
    return cleaned[:10] if cleaned else None


def quote_total(value):
    if value in (None, ""):
        return 0
    try:
        return round(float(str(value).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return 0


def normalize_quote_payload(raw_quote):
    quote = raw_quote if isinstance(raw_quote, dict) else {}
    quote_number = clean_text(quote.get("id") or quote.get("quote_number"))
    client_name = clean_text(quote.get("client") or quote.get("client_name"))
    if not quote_number:
        raise ValueError("Numero preventivo mancante")
    if not client_name:
        raise ValueError("Cliente preventivo mancante")

    payload = dict(quote)
    payload["id"] = quote_number
    payload["client"] = client_name
    payload["status"] = clean_text(quote.get("status")) or "Bozza"
    payload["articles"] = quote.get("articles") if isinstance(quote.get("articles"), list) else []
    payload["photos"] = quote.get("photos") if isinstance(quote.get("photos"), list) else []

    return {
        "quote_number": quote_number,
        "client_name": client_name,
        "category": clean_text(quote.get("category")) or None,
        "priority": clean_text(quote.get("priority")) or None,
        "quote_date": quote_date(quote.get("quoteDate") or quote.get("quote_date")),
        "status": payload["status"],
        "note": clean_text(quote.get("note")) or None,
        "total": quote_total(quote.get("total")),
        "payload": payload,
    }


def shape_quote(row):
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    quote = dict(payload)
    quote["id"] = row.get("quote_number") or quote.get("id")
    quote["client"] = row.get("client_name") or quote.get("client")
    quote["category"] = row.get("category") or quote.get("category") or ""
    quote["priority"] = row.get("priority") or quote.get("priority") or ""
    quote["quoteDate"] = row.get("quote_date") or quote.get("quoteDate") or ""
    quote["status"] = row.get("status") or quote.get("status") or "Bozza"
    quote["note"] = row.get("note") or quote.get("note") or ""
    quote["total"] = float(row.get("total") or quote.get("total") or 0)
    quote["articles"] = quote.get("articles") if isinstance(quote.get("articles"), list) else []
    quote["photos"] = quote.get("photos") if isinstance(quote.get("photos"), list) else []
    quote["createdAt"] = quote.get("createdAt") or row.get("created_at") or ""
    quote["updatedAt"] = row.get("updated_at") or quote.get("updatedAt") or ""
    return quote


def query_value(path, key):
    params = parse_qs(urlparse(path).query)
    values = params.get(key) or []
    return clean_text(values[0]) if values else ""


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        try:
            rows = fetch_table("quotes", select=QUOTE_SELECT, order="created_at.desc")
        except RuntimeError as error:
            return write_json(self, {"error": "Preventivi non disponibili", "detail": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE)

        return write_json(self, {"quotes": [shape_quote(row) for row in rows]})

    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        raw_quote = payload.get("quote") if isinstance(payload.get("quote"), dict) else payload
        try:
            row_payload = normalize_quote_payload(raw_quote)
            rows = supabase_request(
                "/rest/v1/quotes",
                method="POST",
                query={"on_conflict": "quote_number", "select": QUOTE_SELECT},
                payload=row_payload,
                prefer="resolution=merge-duplicates,return=representation",
            )
        except ValueError as error:
            return write_json(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except RuntimeError as error:
            return write_json(self, {"error": "Preventivo non salvato", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        row = rows[0] if isinstance(rows, list) and rows else None
        return write_json(self, {"quote": shape_quote(row) if row else raw_quote}, HTTPStatus.CREATED)

    def do_PATCH(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        quote_number = clean_text(payload.get("id") or payload.get("quote_number"))
        if not quote_number:
            return write_json(self, {"error": "Preventivo non valido"}, HTTPStatus.BAD_REQUEST)

        patch_payload = {}
        status = clean_text(payload.get("status"))
        if status:
            patch_payload["status"] = status

        if isinstance(payload.get("quote"), dict):
            try:
                patch_payload = normalize_quote_payload(payload["quote"])
            except ValueError as error:
                return write_json(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)

        if not patch_payload:
            return write_json(self, {"error": "Nessun dato da aggiornare"}, HTTPStatus.BAD_REQUEST)

        try:
            rows = supabase_request(
                "/rest/v1/quotes",
                method="PATCH",
                query={"quote_number": f"eq.{quote_number}", "select": QUOTE_SELECT},
                payload=patch_payload,
                prefer="return=representation",
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Preventivo non aggiornato", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        if not rows:
            return write_json(self, {"error": "Preventivo non trovato"}, HTTPStatus.NOT_FOUND)
        return write_json(self, {"quote": shape_quote(rows[0])})

    def do_DELETE(self):
        quote_number = query_value(self.path, "id") or query_value(self.path, "quote_number")
        if not quote_number:
            return write_json(self, {"error": "Preventivo non valido"}, HTTPStatus.BAD_REQUEST)

        try:
            delete_rows("quotes", filters={"quote_number": f"eq.{quote_number}"})
        except RuntimeError as error:
            return write_json(self, {"error": "Preventivo non eliminato", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        return write_json(self, {"deleted": True, "id": quote_number})

    def log_message(self, format, *args):
        return