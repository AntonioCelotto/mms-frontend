from __future__ import annotations

import json
from datetime import date
from decimal import Decimal, InvalidOperation
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import read_json_body, require_access, write_json
from _supabase import supabase_request


def normalize_rows(rows):
    if not isinstance(rows, list) or len(rows) > 500:
        raise ValueError("Elenco pagamenti non valido")
    result = []
    ids = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Movimento non valido")
        raw_id = row.get("id")
        row_id = int(raw_id) if raw_id not in (None, "") else None
        if row_id is not None and (row_id <= 0 or row_id in ids):
            raise ValueError("Identificativo pagamento non valido")
        ids.add(row_id)
        kind = row.get("payment_type")
        status = row.get("status")
        if kind not in {"acconto", "saldo", "scadenza"} or status not in {"pagato", "da_pagare", "scaduto", "autorizzato"}:
            raise ValueError("Tipo o stato pagamento non valido")
        raw_amount = row.get("amount")
        amount = None
        if raw_amount not in (None, ""):
            try:
                number = Decimal(str(raw_amount).replace(",", "."))
            except InvalidOperation as exc:
                raise ValueError("Importo non valido") from exc
            if not number.is_finite() or number < 0:
                raise ValueError("Importo non valido")
            amount = str(number)  # Preserve cents exactly through JSON -> numeric.
        dates = {}
        for field in ("due_date", "paid_date"):
            value = row.get(field) or None
            if value is not None:
                date.fromisoformat(value)
            dates[field] = value
        if status == "pagato" and not dates["paid_date"]:
            raise ValueError("Inserisci la data del pagamento")
        notes = row.get("notes")
        if notes is not None and (not isinstance(notes, str) or len(notes) > 10000):
            raise ValueError("Nota pagamento non valida")
        result.append({"id": row_id, "payment_type": kind, "amount": amount,
                       **dates, "status": status, "notes": notes})
    return result


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not require_access(self, {"admin", "commerce"}):
            return
        payload = read_json_body(self)
        try:
            if not isinstance(payload, dict):
                raise ValueError("JSON non valido")
            order_id = int(payload.get("order_id"))
            expected = payload.get("expected")
            if order_id <= 0 or not isinstance(expected, list) or len(expected) > 500:
                raise ValueError("Ordine o versione pagamenti non valida")
            rows = normalize_rows(payload.get("payments"))
        except (TypeError, ValueError, OverflowError) as error:
            return write_json(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
        try:
            saved = supabase_request("/rest/v1/rpc/mms_sync_order_payments", method="POST", payload={
                "p_order_id": order_id, "p_expected": expected, "p_rows": rows,
            })
            if not isinstance(saved, list):
                raise RuntimeError("Risposta pagamenti non valida")
        except RuntimeError as error:
            try:
                detail = json.loads(str(error))
            except (ValueError, TypeError):
                detail = {}
            code = detail.get("code")
            if code in {"PT409", "PT400", "PT404"}:
                return write_json(self, {"error": detail.get("message") or "Pagamenti non aggiornati"}, int(code[2:]))
            return write_json(self, {"error": "Salvataggio pagamenti non riuscito. Nessun movimento è stato modificato parzialmente."}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, {"payments": saved})

    def log_message(self, format, *args):
        return
