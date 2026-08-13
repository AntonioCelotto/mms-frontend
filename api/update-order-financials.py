from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, read_json_body, write_json
from _supabase import patch_rows


ALLOWED_DISCOUNT_TYPES = {"none", "percentage", "fixed"}
CENT = Decimal("0.01")


def decimal_value(value) -> Decimal:
    try:
        parsed = Decimal(str(value if value is not None else 0).replace(",", "."))
    except (InvalidOperation, ValueError):
        return Decimal("0")
    return max(parsed, Decimal("0")).quantize(CENT, rounding=ROUND_HALF_UP)


class handler(BaseHTTPRequestHandler):
    def do_PATCH(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        try:
            order_id = int(payload.get("order_id"))
        except (TypeError, ValueError):
            return write_json(self, {"error": "Ordine non valido"}, HTTPStatus.BAD_REQUEST)

        subtotal = decimal_value(payload.get("subtotal"))
        discount_type = clean_text(payload.get("discountType") or payload.get("discount_type")).lower() or "none"
        if discount_type not in ALLOWED_DISCOUNT_TYPES:
            discount_type = "none"
        discount_value = decimal_value(payload.get("discountValue") or payload.get("discount_value"))

        if discount_type == "percentage":
            discount_value = min(discount_value, Decimal("100"))
            discount_amount = (subtotal * discount_value / Decimal("100")).quantize(CENT, rounding=ROUND_HALF_UP)
        elif discount_type == "fixed":
            discount_amount = min(discount_value, subtotal)
        else:
            discount_value = Decimal("0")
            discount_amount = Decimal("0")

        total = (subtotal - discount_amount).quantize(CENT, rounding=ROUND_HALF_UP)
        row = {
            "subtotal": float(subtotal),
            "discount_type": discount_type,
            "discount_value": float(discount_value),
            "discount_amount": float(discount_amount),
            "total": float(total),
        }

        try:
            rows = patch_rows("orders", filters={"id": f"eq.{order_id}"}, payload=row)
        except RuntimeError as error:
            return write_json(
                self,
                {"error": "Sconto ordine non salvato", "detail": str(error)},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

        if not rows:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)
        return write_json(self, {"order": rows[0]})

    def log_message(self, format, *args):
        return
