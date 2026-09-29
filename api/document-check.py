from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from _api import clean_text, require_access, write_json
from _supabase import fetch_table


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not require_access(self, {"admin", "commerce"}):
            return
        params = parse_qs(urlparse(self.path).query)
        quote_number = clean_text((params.get("quote_number") or [""])[0])
        if not quote_number or len(quote_number) > 100:
            return write_json(self, {"error": "Numero preventivo non valido"}, HTTPStatus.BAD_REQUEST)
        try:
            quotes = fetch_table("quotes", select="id,quote_number", filters={"quote_number": f"eq.{quote_number}"}, page_size=1)
            orders = fetch_table("orders", select="id,order_number", filters={"source_quote_number": f"eq.{quote_number}"}, page_size=1)
        except RuntimeError:
            return write_json(self, {"error": "Controllo duplicati non disponibile"}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, {"quote_exists": bool(quotes), "order": orders[0] if orders else None})

    def log_message(self, format, *args):
        return
