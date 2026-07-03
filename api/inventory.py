from __future__ import annotations

from collections import defaultdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from time import time

try:
    from _api import clean_text, parse_optional_number, parse_positive_int, read_json_body, write_json, write_options
    from _supabase import fetch_table, supabase_request
except ModuleNotFoundError:
    from api._api import clean_text, parse_optional_number, parse_positive_int, read_json_body, write_json, write_options
    from api._supabase import fetch_table, supabase_request


INVENTORY_SELECT = (
    "id,sku,name,category,available_quantity,reserved_quantity,reorder_threshold,status,notes,"
    "material_origin,supplier_name,supplier_material_code,mms_code,unit,color,description,unit_cost,retail_price,"
    "import_source,created_at,updated_at"
)
SHORTAGE_SELECT = "id,order_id,inventory_item_id,product_name,quantity_required,quantity_reserved,quantity_missing,unit,status"
ORDER_SELECT = "id,order_number"


def normalize_origin(value):
    normalized = clean_text(value).lower()
    if normalized in {"fornitore", "supplier"}:
        return "fornitore"
    return "mms"


def code_base(value, default="MAT"):
    cleaned = clean_text(value).upper()
    chars = [char if char.isalnum() else "-" for char in cleaned]
    base = "".join(chars).strip("-")
    while "--" in base:
        base = base.replace("--", "-")
    return (base or default)[:18]


def generated_mms_code(name):
    suffix = str(int(time() * 1000))[-6:]
    return f"MMS-{code_base(name)}-{suffix}"


def generated_supplier_sku(supplier_name, supplier_code, name):
    supplier = code_base(supplier_name, "FOR")
    code = code_base(supplier_code or name, "MAT")
    return f"FOR-{supplier}-{code}"


def numeric(value, default=0):
    parsed = parse_optional_number(value)
    return parsed if parsed is not None else default


def normalize_inventory_item(raw):
    item = raw if isinstance(raw, dict) else {}
    name = clean_text(item.get("name") or item.get("product") or item.get("material"))
    if not name:
        raise ValueError("Nome materiale mancante")

    origin = normalize_origin(item.get("material_origin") or item.get("origin"))
    supplier_name = clean_text(item.get("supplier_name") or item.get("supplier")) or None
    supplier_code = clean_text(item.get("supplier_material_code") or item.get("supplier_code")) or None
    mms_code = clean_text(item.get("mms_code")) or None

    if origin == "mms":
        mms_code = mms_code or clean_text(item.get("sku")) or generated_mms_code(name)
        sku = clean_text(item.get("sku")) or mms_code
        supplier_name = supplier_name or None
        supplier_code = supplier_code or None
    else:
        sku = clean_text(item.get("sku")) or generated_supplier_sku(supplier_name, supplier_code, name)

    return {
        "sku": sku,
        "name": name,
        "category": clean_text(item.get("category")) or None,
        "available_quantity": numeric(item.get("available_quantity") or item.get("available"), 0),
        "reserved_quantity": numeric(item.get("reserved_quantity") or item.get("reserved"), 0),
        "reorder_threshold": numeric(item.get("reorder_threshold") or item.get("reorderThreshold"), 0),
        "status": clean_text(item.get("status")) or "Disponibile",
        "notes": clean_text(item.get("notes") or item.get("reorder")) or None,
        "material_origin": origin,
        "supplier_name": supplier_name,
        "supplier_material_code": supplier_code,
        "mms_code": mms_code,
        "unit": clean_text(item.get("unit")) or None,
        "color": clean_text(item.get("color") or item.get("colore")) or None,
        "description": clean_text(item.get("description") or item.get("descrizione")) or None,
        "unit_cost": numeric(item.get("unit_cost") or item.get("cost") or item.get("costo"), 0),
        "retail_price": numeric(item.get("retail_price") or item.get("public_price") or item.get("prezzo_pubblico"), 0),
        "import_source": clean_text(item.get("import_source") or item.get("importSource")) or "manuale",
    }


def active_shortage_maps():
    try:
        shortages = fetch_table("inventory_shortages", select=SHORTAGE_SELECT, order="id.desc")
        orders = fetch_table("orders", select=ORDER_SELECT)
    except RuntimeError:
        return {}, {}

    order_numbers = {row.get("id"): row.get("order_number") for row in orders if row.get("id")}
    totals = defaultdict(float)
    details = defaultdict(list)
    closed_statuses = {"arrivato", "chiuso", "ordinato_completo", "annullato"}

    for row in shortages:
        if clean_text(row.get("status")).lower() in closed_statuses:
            continue
        item_id = parse_positive_int(row.get("inventory_item_id"))
        if not item_id:
            continue
        missing = numeric(row.get("quantity_missing"), 0)
        if missing <= 0:
            continue
        totals[item_id] += missing
        unit = clean_text(row.get("unit"))
        order_id = row.get("order_id")
        order_number = order_numbers.get(order_id) or order_id
        details[item_id].append(
            {
                "order_id": order_id,
                "order_number": order_number,
                "product_name": row.get("product_name") or "",
                "quantity_required": row.get("quantity_required") or 0,
                "quantity_reserved": row.get("quantity_reserved") or 0,
                "quantity_missing": missing,
                "unit": unit,
                "status": row.get("status") or "da_ordinare",
            }
        )
    return dict(totals), dict(details)


def shape_inventory_item(row, shortage_totals=None, shortage_details=None):
    item_id = row.get("id")
    shortage_quantity = (shortage_totals or {}).get(item_id, 0)
    return {
        "id": row.get("id"),
        "sku": row.get("sku") or "",
        "product": row.get("name") or "",
        "name": row.get("name") or "",
        "category": row.get("category") or "",
        "available": row.get("available_quantity") or 0,
        "available_quantity": row.get("available_quantity") or 0,
        "reserved": row.get("reserved_quantity") or 0,
        "reserved_quantity": row.get("reserved_quantity") or 0,
        "shortage_quantity": shortage_quantity,
        "shortage_details": (shortage_details or {}).get(item_id, []),
        "reorder_threshold": row.get("reorder_threshold") or 0,
        "status": row.get("status") or "",
        "reorder": row.get("notes") or "",
        "notes": row.get("notes") or "",
        "material_origin": row.get("material_origin") or "mms",
        "supplier_name": row.get("supplier_name") or "",
        "supplier_material_code": row.get("supplier_material_code") or "",
        "mms_code": row.get("mms_code") or "",
        "unit": row.get("unit") or "",
        "color": row.get("color") or "",
        "description": row.get("description") or "",
        "unit_cost": row.get("unit_cost") or 0,
        "retail_price": row.get("retail_price") or 0,
        "import_source": row.get("import_source") or "",
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        try:
            rows = fetch_table("inventory_items", select=INVENTORY_SELECT, order="name.asc")
            shortage_totals, shortage_details = active_shortage_maps()
        except RuntimeError as error:
            return write_json(self, {"error": "Magazzino non disponibile", "detail": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, {"items": [shape_inventory_item(row, shortage_totals, shortage_details) for row in rows]})

    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        raw_items = body.get("items") if isinstance(body.get("items"), list) else [body.get("item") if isinstance(body.get("item"), dict) else body]
        try:
            payload = [normalize_inventory_item(item) for item in raw_items if isinstance(item, dict)]
        except ValueError as error:
            return write_json(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
        if not payload:
            return write_json(self, {"error": "Nessun materiale valido"}, HTTPStatus.BAD_REQUEST)

        try:
            rows = supabase_request(
                "/rest/v1/inventory_items",
                method="POST",
                query={"on_conflict": "sku", "select": INVENTORY_SELECT},
                payload=payload if len(payload) > 1 else payload[0],
                prefer="resolution=merge-duplicates,return=representation",
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Materiale non salvato", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        shortage_totals, shortage_details = active_shortage_maps()
        shaped = [shape_inventory_item(row, shortage_totals, shortage_details) for row in (rows if isinstance(rows, list) else [])]
        return write_json(self, {"items": shaped, "item": shaped[0] if shaped else None}, HTTPStatus.CREATED)

    def do_PATCH(self):
        body = read_json_body(self)
        if body is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        item_id = parse_positive_int(body.get("id"))
        if not item_id:
            return write_json(self, {"error": "Materiale non valido"}, HTTPStatus.BAD_REQUEST)

        try:
            payload = normalize_inventory_item(body)
            rows = supabase_request(
                "/rest/v1/inventory_items",
                method="PATCH",
                query={"id": f"eq.{item_id}", "select": INVENTORY_SELECT},
                payload=payload,
                prefer="return=representation",
            )
        except ValueError as error:
            return write_json(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except RuntimeError as error:
            return write_json(self, {"error": "Materiale non aggiornato", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        if not rows:
            return write_json(self, {"error": "Materiale non trovato"}, HTTPStatus.NOT_FOUND)
        shortage_totals, shortage_details = active_shortage_maps()
        return write_json(self, {"item": shape_inventory_item(rows[0], shortage_totals, shortage_details)})

    def log_message(self, format, *args):
        return
