from __future__ import annotations

import json
import os
import socket
from collections import defaultdict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co"
DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk"
SUPABASE_URL = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL).rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_KEY)
SUPABASE_TIMEOUT_SECONDS = 5


def supabase_request(path: str, *, method: str = "GET", query: dict | None = None, payload=None, prefer: str | None = None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Configurazione Supabase mancante")

    url = f"{SUPABASE_URL}{path}"
    if query:
        url = f"{url}?{urlencode(query, doseq=True)}"

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer

    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=True).encode("utf-8")

    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None
    except HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(detail or exc.reason) from exc
    except (URLError, TimeoutError, socket.timeout) as exc:
        raise RuntimeError(f"Supabase non raggiungibile entro {SUPABASE_TIMEOUT_SECONDS}s: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Risposta Supabase non valida") from exc


def fetch_table(table: str, *, select: str = "*", filters: dict | None = None, order: str | None = None):
    query = {"select": select}
    if filters:
        query.update(filters)
    if order:
        query["order"] = order
    return supabase_request(f"/rest/v1/{table}", query=query) or []


def insert_rows(table: str, payload, *, returning: str = "representation"):
    return supabase_request(
        f"/rest/v1/{table}",
        method="POST",
        payload=payload,
        prefer=f"return={returning}",
    )


def patch_rows(table: str, *, filters: dict, payload, returning: str = "representation"):
    return supabase_request(
        f"/rest/v1/{table}",
        method="PATCH",
        query=filters,
        payload=payload,
        prefer=f"return={returning}",
    )


def delete_rows(table: str, *, filters: dict):
    return supabase_request(
        f"/rest/v1/{table}",
        method="DELETE",
        query=filters,
        prefer="return=minimal",
    )


def resolve_order(order_ref: int):
    rows = fetch_table("orders", filters={"id": f"eq.{order_ref}"})
    if rows:
        return rows[0]
    rows = fetch_table("orders", filters={"order_number": f"eq.{order_ref}"})
    return rows[0] if rows else None


def next_order_number() -> str:
    rows = fetch_table("orders", select="order_number", order="id.desc")
    numeric = [int(row["order_number"]) for row in rows if str(row.get("order_number", "")).isdigit()]
    return str((max(numeric) if numeric else 0) + 1)


def ensure_client(name: str):
    rows = fetch_table("clients", filters={"name": f"eq.{name}"})
    if rows:
        return rows[0]
    created = insert_rows("clients", {"name": name, "visibility_enabled": False})
    return created[0]


def get_department_by_name(name: str):
    rows = fetch_table("departments", filters={"name": f"eq.{name}"})
    if not rows:
        raise RuntimeError(f"Reparto non trovato: {name}")
    return rows[0]


def infer_production_mode(department_name: str) -> str:
    normalized = (department_name or "").strip().lower()
    if "esterna" in normalized:
        return "esterno"
    if "commercio" in normalized:
        return "commercio"
    if "misto" in normalized:
        return "misto"
    return "interno"


def build_bootstrap():
    clients = fetch_table("clients", order="name.asc")
    departments = fetch_table("departments", order="name.asc")
    users = fetch_table("users", order="id.asc")
    user_skills = fetch_table("user_skills", order="id.asc")
    inventory_items = fetch_table("inventory_items", order="name.asc")
    orders = fetch_table("orders", order="id.desc")
    order_tasks = fetch_table("order_tasks", order="id.asc")
    order_materials = fetch_table("order_materials", order="id.asc")
    payments = fetch_table("payments", order="id.desc")
    attachments = fetch_table("attachments", select="id,order_id", order="id.asc")

    client_map = {row["id"]: row for row in clients}
    department_map = {row["id"]: row for row in departments}
    user_map = {row["id"]: row for row in users}
    inventory_map = {row["id"]: row for row in inventory_items}
    order_by_id = {row["id"]: row for row in orders}
    display_order_ids = {
        row["id"]: int(row["order_number"]) if str(row.get("order_number", "")).isdigit() else row["id"] for row in orders
    }

    attachment_count = defaultdict(int)
    for row in attachments:
        attachment_count[row["order_id"]] += 1

    latest_payment_by_order = {}
    for row in payments:
        latest_payment_by_order.setdefault(row["order_id"], row)

    order_department = {}
    for task in order_tasks:
        order_department.setdefault(task["order_id"], department_map.get(task["department_id"], {}).get("name", "Da assegnare"))

    shaped_orders = []
    for row in orders:
        latest_payment = latest_payment_by_order.get(row["id"], {})
        client = client_map.get(row["client_id"], {})
        shaped_orders.append(
            {
                "db_id": row["id"],
                "id": display_order_ids[row["id"]],
                "client": client.get("name", "Cliente"),
                "category": row.get("category") or "",
                "department": order_department.get(row["id"], "Da assegnare"),
                "route": (row.get("production_mode") or "").replace("_", " ").title(),
                "priority": (row.get("priority") or "").title(),
                "status": (row.get("status") or "").replace("_", " ").title(),
                "payment": (latest_payment.get("status") or "da_pagare").replace("_", " ").title(),
                "eta": row.get("estimated_delivery_date") or "Da definire",
                "files": attachment_count[row["id"]],
                "summary": row.get("internal_notes") or f"Ordine {row.get('order_number')} per {client.get('name', 'Cliente')}",
                "notes": row.get("internal_notes") or "Nessuna nota operativa registrata.",
                "customerWindow": row.get("estimated_delivery_date") or "Da confermare",
                "orderDate": row.get("order_date") or "Da definire",
                "estimatedDelivery": row.get("estimated_delivery_date") or "Da definire",
                "warehouseLinked": bool(row.get("warehouse_linked")),
                "clientVisibility": row.get("client_visibility_note") or "",
            }
        )

    payments_payload = []
    for row in payments[:20]:
        order = next((item for item in shaped_orders if item["db_id"] == row["order_id"]), None)
        raw_order = order_by_id.get(row["order_id"], {})
        client = client_map.get(raw_order.get("client_id"), {})
        payments_payload.append(
            {
                "orderId": order["id"] if order else row["order_id"],
                "client": client.get("name", "Cliente"),
                "mode": (row.get("payment_type") or "").title(),
                "detail": row.get("notes") or "Nessuna nota pagamento.",
                "due": row.get("due_date") or "Da definire",
                "state": (row.get("status") or "").replace("_", " ").title(),
            }
        )

    department_stats = defaultdict(lambda: {"activeOrders": set(), "activeTasks": 0})
    for task in order_tasks:
        department_name = department_map.get(task["department_id"], {}).get("name", "Reparto")
        department_stats[department_name]["activeOrders"].add(task["order_id"])
        department_stats[department_name]["activeTasks"] += 1

    departments_payload = []
    for department in departments:
        stats = department_stats[department["name"]]
        departments_payload.append(
            {
                "id": department["name"].lower().replace(" ", "-"),
                "name": department["name"],
                "activeOrders": len(stats["activeOrders"]),
                "activeTasks": stats["activeTasks"],
                "load": min(92, 40 + int(stats["activeTasks"] or 0)),
                "note": f"{stats['activeTasks']} task attivi nel reparto",
            }
        )

    metrics = {
        "openOrders": len(shaped_orders),
        "activeOrders": sum(1 for row in shaped_orders if row["status"] != "Evaso"),
        "toStart": sum(1 for row in shaped_orders if row["status"] == "Da Avviare"),
        "urgent": sum(1 for row in shaped_orders if row["priority"] == "Express"),
        "delays": sum(1 for row in shaped_orders if row["status"] == "In Attesa"),
        "openPayments": sum(1 for row in payments_payload if row["state"] != "Pagato"),
        "paymentValue": f"{max(len(payments_payload) * 4, 16)}k",
        "activeTasks": sum(item["activeTasks"] for item in departments_payload),
        "completedMonth": sum(1 for row in shaped_orders if row["status"] == "Evaso"),
    }

    order_tasks_payload = defaultdict(list)
    calendar_map = defaultdict(list)
    timeline = defaultdict(list)
    alerts = []

    for task in order_tasks:
        display_order_id = display_order_ids.get(task["order_id"], task["order_id"])
        user = user_map.get(task.get("assigned_user_id"))
        owner = None
        if user:
            owner = " ".join(part for part in [user.get("first_name"), user.get("last_name")] if part).strip()
        owner = owner or task.get("external_supplier_name") or "Non assegnato"
        department_name = department_map.get(task["department_id"], {}).get("name", "Reparto")
        order_tasks_payload[str(display_order_id)].append(
            {
                "id": task["id"],
                "name": task["task_name"],
                "phase": task["task_phase"],
                "team": f"{department_name} - {owner}",
                "hours": f"{float(task.get('estimated_hours') or 0):.1f} h".replace(".", ","),
                "time": task.get("planned_date") or "Da pianificare",
                "state": (task.get("status") or "").replace("_", " ").title(),
                "calendarDay": task.get("calendar_day_label") or "Da pianificare",
            }
        )
        if task.get("calendar_day_label"):
            calendar_map[task["calendar_day_label"]].append(
                {
                    "orderId": display_order_id,
                    "phase": task["task_phase"],
                    "title": task["task_name"],
                    "owner": owner,
                    "time": task.get("planned_date") or "Da pianificare",
                }
            )

    for order in shaped_orders[:20]:
        timeline[str(order["id"])].append(
            {
                "date": order["orderDate"],
                "title": f"Ordine #{order['id']} creato",
                "detail": order["notes"],
            }
        )
        if order["status"] == "In Attesa":
            alerts.append(
                {
                    "orderId": order["id"],
                    "title": f"Ordine #{order['id']} in attesa",
                    "detail": order["notes"],
                }
            )

    order_materials_payload = defaultdict(list)
    for material in order_materials:
        display_order_id = display_order_ids.get(material["order_id"], material["order_id"])
        inventory_item = inventory_map.get(material.get("inventory_item_id"))
        order_materials_payload[str(display_order_id)].append(
            {
                "material": material["product_name"],
                "source": "MMS" if material.get("source_type") == "mms" else "Cliente",
                "warehouse": material.get("warehouse_status_note") or (f"SKU {inventory_item['sku']}" if inventory_item and inventory_item.get("sku") else "Inserimento manuale"),
                "delivery": "Consegnato" if material.get("delivery_status") == "consegnato" else "Non consegnato",
                "preorder": material.get("preorder_note") or "Nessun preordine",
            }
        )
        if material.get("delivery_status") == "non_consegnato":
            alerts.append(
                {
                    "orderId": display_order_id,
                    "title": f"Materiale non consegnato per ordine #{display_order_id}",
                    "detail": material["product_name"],
                }
            )

    clients_payload = []
    for client in clients:
        order_ids = [row["id"] for row in shaped_orders if client_map.get(order_by_id.get(row["db_id"], {}).get("client_id"), {}).get("name") == client["name"]][:6]
        clients_payload.append(
            {
                "id": client["id"],
                "name": client["name"],
                "trust": "Affidabilita' alta" if len(order_ids) >= 3 else "Affidabilita' da confermare",
                "email": client.get("email") or "",
                "phone": client.get("phone") or "",
                "paymentRule": client.get("payment_terms") or "Da definire",
                "workType": "Gestione ordini e lavorazioni collegate",
                "note": client.get("notes") or "",
                "visibilityEnabled": bool(client.get("visibility_enabled")),
                "orders": order_ids,
                "tags": ["Portale cliente" if client.get("visibility_enabled") else "Uso interno"],
            }
        )

    inventory_payload = [
        {
            "sku": row.get("sku") or "",
            "product": row.get("name") or "",
            "category": row.get("category") or "",
            "available": row.get("available_quantity") or 0,
            "reserved": row.get("reserved_quantity") or 0,
            "status": row.get("status") or "",
            "reorder": row.get("notes") or "Senza note",
        }
        for row in inventory_items
    ]

    skill_map = defaultdict(list)
    for row in user_skills:
        skill_map[row["user_id"]].append(row["skill_name"])

    accounts_payload = []
    for row in users:
        full_name = " ".join(part for part in [row.get("first_name"), row.get("last_name")] if part).strip()
        accounts_payload.append(
            {
                "id": row["id"],
                "role": "Amministratore" if row.get("role") == "admin" else "Visualizzatore",
                "name": full_name,
                "phone": row.get("phone") or "",
                "email": row.get("email") or "",
                "skills": ", ".join(skill_map[row["id"]]),
            }
        )

    calendar_payload = []
    for day in ["Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'"]:
        calendar_payload.append({"day": day, "date": "", "slots": calendar_map.get(day, [])})

    return {
        "metrics": metrics,
        "orders": shaped_orders,
        "departments": departments_payload,
        "alerts": alerts[:8],
        "payments": payments_payload,
        "orderTasks": dict(order_tasks_payload),
        "orderTimeline": dict(timeline),
        "orderMaterials": dict(order_materials_payload),
        "clients": clients_payload,
        "calendar": calendar_payload,
        "inventory": inventory_payload,
        "accounts": accounts_payload,
    }
