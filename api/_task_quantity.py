"""Quantity affects duration only; never order prices or material reservations."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def quantity_fields(payload):
    if "quantity" not in payload and "unit_hours" not in payload:
        return {}  # Older clients and historical total hours stay compatible.
    try:
        quantity = Decimal(str(payload.get("quantity", "")))
        unit = Decimal(str(payload.get("unit_hours", "")).replace(",", "."))
    except (InvalidOperation, ValueError):
        raise ValueError("Quantità e ore per pezzo non valide") from None
    if (not quantity.is_finite() or quantity != quantity.to_integral_value() or not 1 <= quantity <= 1000000
            or not unit.is_finite() or not 0 <= unit <= 1000000 or quantity * unit > 1000000000):
        raise ValueError("Quantità e ore per pezzo non valide")
    return {"quantity": int(quantity), "unit_hours": float(unit),
            "estimated_hours": float((quantity * unit).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP))}
