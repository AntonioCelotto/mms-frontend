from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from decimal import Decimal, InvalidOperation

from _api import clean_text, normalize_choice, parse_positive_int, read_json_body, require_access, write_json
from _supabase import fetch_table, resolve_order, supabase_request


ALLOWED_SOURCE_TYPES = {"mms", "cliente"}
ALLOWED_DELIVERY_STATUSES = {"consegnato", "non_consegnato"}


def normalize_material(item):
    product_name = clean_text(item.get("product_name") or item.get("material") or item.get("name"))
    if not product_name:
        return None

    source_type = normalize_choice(item.get("source_type") or item.get("source"), ALLOWED_SOURCE_TYPES, "cliente")
    delivery_status = normalize_choice(
        item.get("delivery_status") or item.get("delivery"),
        ALLOWED_DELIVERY_STATUSES,
        "non_consegnato",
    )
    raw_quantity = next((item[key] for key in ("quantity_required", "quantity", "qty")
                         if key in item and item[key] not in (None, "")), "1")
    quantity_required = str(raw_quantity).strip()
    try:
        quantity = Decimal(quantity_required.replace(",", "."))
    except InvalidOperation:
        raise ValueError("Quantità materiale non valida") from None
    if not quantity.is_finite() or quantity <= 0 or quantity > 1000000000:
        raise ValueError("Quantità materiale non valida")
    quantity_required = str(quantity)
    inventory_sku = clean_text(item.get("inventory_sku") or item.get("sku")) or None
    inventory_item_id = parse_positive_int(item.get("inventory_item_id") or item.get("inventoryItemId"))

    return {
        "product_name": product_name,
        "material": product_name,
        "source_type": source_type,
        "source": source_type,
        "delivery_status": delivery_status,
        "delivery": delivery_status,
        "warehouse_status_note": clean_text(item.get("warehouse_status_note") or item.get("warehouse")) or None,
        "warehouse": clean_text(item.get("warehouse_status_note") or item.get("warehouse")) or None,
        "preorder_note": clean_text(item.get("preorder_note") or item.get("preorder")) or None,
        "preorder": clean_text(item.get("preorder_note") or item.get("preorder")) or None,
        "quantity_required": quantity_required,
        "quantity": quantity_required,
        "inventory_item_id": inventory_item_id,
        "inventoryItemId": inventory_item_id,
        "inventory_sku": inventory_sku,
        "sku": inventory_sku,
        "unit": clean_text(item.get("unit")) or None,
        "notes": clean_text(item.get("notes")) or None,
        "article_key": clean_text(item.get("article_key") or item.get("articleKey")) or None,
        "article_name": clean_text(item.get("article_name") or item.get("articleName")) or None,
    }


def validate_article(material, order):
    key = material.get("article_key")
    if not key:
        material["article_name"] = None
        return
    payload = order.get("source_quote_payload") or {}
    articles = payload.get("articles", []) if isinstance(payload, dict) else []
    for index, article in enumerate(articles if isinstance(articles, list) else []):
        if not isinstance(article, dict):
            continue
        candidate = str(article.get("id") or article.get("code") or f"article-{index+1}")
        if key == candidate:
            material["article_name"] = clean_text(article.get("name") or article.get("product_name")) or f"Articolo {index+1}"
            return
    raise ValueError("Articolo di destinazione non presente nell'ordine")


def resolve_order_for_materials(payload):
    order_db_id = parse_positive_int(payload.get("order_db_id") or payload.get("db_id"))
    if order_db_id:
        rows = fetch_table("orders", filters={"id": f"eq.{order_db_id}"})
        if rows:
            return rows[0]

    order_ref = parse_positive_int(payload.get("order_id"))
    if not order_ref:
        return None

    rows = fetch_table("orders", filters={"order_number": f"eq.{order_ref}"})
    if rows:
        return rows[0]
    return resolve_order(order_ref)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not require_access(self, {"admin", "commerce"}):
            return
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        materials = payload.get("materials", [])
        if not isinstance(materials, list):
            return write_json(self, {"error": "Materiali non validi"}, HTTPStatus.BAD_REQUEST)

        order = resolve_order_for_materials(payload)
        if not order:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        normalized = []
        legacy_payload = any(isinstance(item, dict) and (item.get("product_name") or item.get("material") or item.get("name"))
                             and "article_key" not in item and "articleKey" not in item for item in materials)
        if legacy_payload:
            try:
                existing = fetch_table("order_materials", select="id,article_key", filters={"order_id": f"eq.{order['id']}"})
            except RuntimeError as error:
                return write_json(self, {"error": "Verifica materiali non disponibile", "detail": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE)
            if any(row.get("article_key") for row in existing):
                return write_json(self, {"error": "Aggiorna la pagina prima di salvare i materiali collegati agli articoli"}, HTTPStatus.CONFLICT)
        try:
            for item in materials:
                if not isinstance(item, dict):
                    continue
                material = normalize_material(item)
                if material:
                    validate_article(material, order)
                    normalized.append(material)
        except ValueError as error:
            return write_json(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)

        try:
            saved = supabase_request(
                "/rest/v1/rpc/replace_order_materials_atomic",
                method="POST",
                payload={
                    "p_order_id": order["id"],
                    "p_materials": normalized,
                },
            )
        except RuntimeError as error:
            return write_json(
                self,
                {"error": "Salvataggio materiali non riuscito", "detail": str(error)},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

        return write_json(self, {"ok": True, "saved": int(saved or 0), "order_db_id": order["id"]})

    def log_message(self, format, *args):
        return
