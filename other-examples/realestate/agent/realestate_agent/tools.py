"""
Tools for the Homestead realestate buyer's-agent example.

Four @tool functions, each emitting an A2UI envelope against the
`copilotkit://realestate-catalog` catalog:

- `show_listings`        — filtered ListingCard grid
- `show_listing_detail`  — single ListingDetail surface (carousel +
                           amenities + comps + schools)
- `pick_tour_slot`       — TourSlotPicker for a given listing
- `draft_offer_letter`   — OfferLetterDraft with Send / Revise / Cancel

Pattern mirrors `agent/src/a2ui_fixed_schema.py:show_listings` from the
seed prototype: load the catalog schema once at import time from a
sibling JSON file, then construct the data model per invocation.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from copilotkit import a2ui
from langchain.tools import tool

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Surface + catalog identity. Catalog is namespaced per example so the
# realestate Zod schemas + renderers don't collide with the base
# dashboard catalog.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATALOG_ID = "copilotkit://realestate-catalog"

LISTING_GRID_SURFACE = "realestate-listings"
LISTING_DETAIL_SURFACE = "realestate-listing-detail"
TOUR_SURFACE = "realestate-tour-slots"
OFFER_SURFACE = "realestate-offer-letter"

_THIS_DIR = Path(__file__).parent
_DATA_PATH = _THIS_DIR / "data" / "listings.json"
_SCHEMAS_DIR = _THIS_DIR.parent.parent / "schemas"


# ─── Data loading ────────────────────────────────────────────────────


def _load_data() -> dict[str, Any]:
    return json.loads(_DATA_PATH.read_text())


_DATA = _load_data()
_LISTINGS: list[dict[str, Any]] = _DATA["listings"]
_COMPS: dict[str, list[dict[str, Any]]] = _DATA.get("comps", {})
_TOUR_SLOTS: dict[str, list[dict[str, Any]]] = _DATA.get("tourSlots", {})
_SCHOOLS: dict[str, list[dict[str, Any]]] = _DATA.get("schoolsByNeighborhood", {})


def _load_schema(name: str) -> Any:
    """Load an A2UI component schema from the example's `schemas/` dir.

    Falls back to a minimal stub if the schema isn't on disk yet, so a
    half-shipped example renders SOMETHING in dev rather than 500ing on
    every invocation.
    """
    path = _SCHEMAS_DIR / f"{name}.json"
    if path.exists():
        return a2ui.load_schema(path)
    return [
        {
            "id": "root",
            "component": "Column",
            "gap": 12,
            "children": [
                {
                    "id": "fallback-text",
                    "component": "Text",
                    "text": f"realestate: {name} schema missing on disk.",
                },
            ],
        }
    ]


LISTING_GRID_SCHEMA = _load_schema("listing_grid")
LISTING_DETAIL_SCHEMA = _load_schema("listing_detail")
TOUR_SLOT_SCHEMA = _load_schema("tour_slot_picker")
OFFER_LETTER_SCHEMA = _load_schema("offer_letter_draft")


# ─── Formatters (pure, deterministic) ────────────────────────────────


def _fmt_money(value: float | int | str | None) -> str:
    """`1395000` → `"$1,395,000"`. Strings pass through."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return f"${int(value):,}"


def _fmt_money_per_sqft(value: float | int | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return f"${int(value):,} / sqft"


def _fmt_sqft(value: int | float | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return f"{int(value):,}"


def _fmt_baths(value: float | int | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        # 2 → "2", 2.5 → "2.5"
        return str(int(value)) if float(value).is_integer() else f"{value:g}"
    return str(value)


def _fmt_str(value: Any) -> str:
    return "" if value is None else str(value)


def _render_listing_card(row: dict[str, Any]) -> dict[str, Any]:
    """Build a display-formatted row for the ListingCard data model."""
    return {
        "id": _fmt_str(row.get("id")),
        "address": _fmt_str(row.get("address")),
        "neighborhood": _fmt_str(row.get("neighborhood")),
        "beds": _fmt_str(row.get("beds")),
        "baths": _fmt_baths(row.get("baths")),
        "sqft": _fmt_sqft(row.get("sqft")),
        "price": _fmt_money(row.get("price")),
        "pricePerSqft": _fmt_money_per_sqft(row.get("pricePerSqft")),
        "propertyType": _fmt_str(row.get("propertyType")),
        "schoolRating": _fmt_str(row.get("schoolRating")),
        "status": _fmt_str(row.get("status")),
    }


# ─── In-memory "last viewed" state ───────────────────────────────────
# Lets `pick_tour_slot` and `draft_offer_letter` default to the most
# recently surfaced listing when the caller omits listing_id. Restart
# the agent process to reset.

_LAST_LISTING_ID: dict[str, str] = {}


def _set_last(listing_id: str) -> None:
    _LAST_LISTING_ID["id"] = listing_id


def _get_last() -> str | None:
    return _LAST_LISTING_ID.get("id")


def _resolve_listing(
    listing_id: str | None = None,
    address: str | None = None,
) -> dict[str, Any] | None:
    """Locate a listing by id or (case-insensitive) address."""
    if listing_id:
        target = listing_id.strip().upper()
        for row in _LISTINGS:
            if row.get("id", "").upper() == target:
                return row
    if address:
        target = address.strip().lower()
        # Loose match: contained as substring within the stored address.
        for row in _LISTINGS:
            stored = row.get("address", "").lower()
            if target == stored or target in stored or stored in target:
                return row
    return None


# ─── Tools ───────────────────────────────────────────────────────────


@tool
def show_listings(
    neighborhood: str | None = None,
    beds_min: int | None = None,
    max_price: int | None = None,
    limit: int = 3,
) -> str:
    """Show a grid of Brooklyn listing cards matching the buyer's filter.

    Call this when the buyer asks to see homes, search inventory, or
    filter by neighborhood / beds / budget. Examples:
      - "3BR homes in Brooklyn under $1.5M"
      - "show me Park Slope brownstones"
      - "what's available in Cobble Hill"

    Args:
        neighborhood: optional neighborhood filter
            (Park Slope, Boerum Hill, Cobble Hill, Carroll Gardens).
        beds_min: optional minimum bedroom count (e.g. 3).
        max_price: optional max price in USD (e.g. 1500000).
        limit: how many cards to render (default 3, max 6).
    """
    rows = _LISTINGS
    if neighborhood:
        target = neighborhood.strip().lower()
        rows = [r for r in rows if r.get("neighborhood", "").lower() == target]
    if beds_min is not None:
        rows = [r for r in rows if int(r.get("beds", 0)) >= int(beds_min)]
    if max_price is not None:
        rows = [r for r in rows if int(r.get("price", 0)) <= int(max_price)]

    rows = rows[: max(1, min(int(limit or 3), 6))]
    listings = [_render_listing_card(r) for r in rows]

    if listings:
        _set_last(listings[0]["id"])

    return a2ui.render(
        operations=[
            a2ui.create_surface(LISTING_GRID_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(LISTING_GRID_SURFACE, LISTING_GRID_SCHEMA),
            a2ui.update_data_model(
                LISTING_GRID_SURFACE,
                {
                    "filterSummary": _describe_filter(
                        neighborhood, beds_min, max_price, len(listings)
                    ),
                    "listings": listings,
                },
            ),
        ],
    )


def _describe_filter(
    neighborhood: str | None,
    beds_min: int | None,
    max_price: int | None,
    count: int,
) -> str:
    parts: list[str] = []
    if beds_min:
        parts.append(f"{beds_min}+ bedroom")
    if neighborhood:
        parts.append(neighborhood)
    if max_price:
        parts.append(f"under ${max_price:,}")
    qualifier = ", ".join(parts) if parts else "Brooklyn"
    plural = "home" if count == 1 else "homes"
    return f"{count} {qualifier} {plural}"


@tool
def show_listing_detail(
    listing_id: str | None = None,
    address: str | None = None,
) -> str:
    """Drill into a single listing — full detail page with comps + schools.

    Call this when the buyer names a specific listing or asks for more
    detail. Examples:
      - "Drill into 123 Maple St"
      - "Tell me more about HS-1001"
      - "Show me the full listing for the Garfield brownstone"

    Args:
        listing_id: preferred — the Homestead listing id (e.g. "HS-1001").
        address: fallback — the street address (case-insensitive match).
    """
    listing = _resolve_listing(listing_id=listing_id, address=address)
    if listing is None:
        return (
            "show_listing_detail: no listing matched "
            f"id={listing_id!r} address={address!r}. "
            "Ask the user which listing they meant or call show_listings first."
        )

    _set_last(listing["id"])

    # Detail-shaped row (richer than ListingCard's row).
    display = _render_listing_card(listing)
    display.update(
        {
            "yearBuilt": _fmt_str(listing.get("yearBuilt")),
            "notes": _fmt_str(listing.get("notes")),
            "listingAgent": _fmt_str(listing.get("listingAgent")),
        }
    )

    amenities = [
        {"id": f"am-{i}", "label": _fmt_str(a)}
        for i, a in enumerate(listing.get("amenities", []) or [])
    ]
    rooms = [
        {
            "id": f"room-{i}",
            "label": _fmt_str(r.get("label")),
            "detail": _fmt_str(r.get("detail")),
        }
        for i, r in enumerate(listing.get("rooms", []) or [])
    ]

    comps_raw = _COMPS.get(listing["id"], [])
    comps = [
        {
            "id": f"comp-{i}",
            "address": _fmt_str(c.get("address")),
            "soldPrice": _fmt_money(c.get("soldPrice")),
            "beds": _fmt_str(c.get("beds")),
            "baths": _fmt_baths(c.get("baths")),
            "sqft": _fmt_sqft(c.get("sqft")),
            "pricePerSqft": _fmt_money_per_sqft(c.get("pricePerSqft")),
            "soldDate": _fmt_str(c.get("soldDate")),
        }
        for i, c in enumerate(comps_raw)
    ]

    schools_raw = _SCHOOLS.get(listing.get("neighborhood", ""), [])
    schools = [
        {
            "id": f"school-{i}",
            "name": _fmt_str(s.get("name")),
            "level": _fmt_str(s.get("level")),
            "rating": _fmt_str(s.get("rating")),
            "distance": _fmt_str(s.get("distance")),
        }
        for i, s in enumerate(schools_raw)
    ]

    return a2ui.render(
        operations=[
            a2ui.create_surface(LISTING_DETAIL_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(LISTING_DETAIL_SURFACE, LISTING_DETAIL_SCHEMA),
            a2ui.update_data_model(
                LISTING_DETAIL_SURFACE,
                {
                    "listing": display,
                    "amenities": amenities,
                    "rooms": rooms,
                    "comps": comps,
                    "schools": schools,
                },
            ),
        ],
    )


@tool
def pick_tour_slot(
    listing_id: str | None = None,
    day: str | None = None,
) -> str:
    """Show available tour slots so the buyer can pick one.

    Call this when the buyer wants to schedule a viewing. Examples:
      - "Schedule a tour Saturday afternoon"
      - "Book a tour at 123 Maple"
      - "When can I see HS-1001?"

    Args:
        listing_id: optional — defaults to the most recently surfaced listing.
        day: optional — "Saturday" or "Sunday" (filters the grid).
    """
    target_id = listing_id or _get_last()
    if not target_id:
        return (
            "pick_tour_slot: no listing context yet. Call show_listings or "
            "show_listing_detail first so I know which property to tour."
        )

    listing = _resolve_listing(listing_id=target_id)
    if listing is None:
        return f"pick_tour_slot: listing {target_id!r} not found."

    _set_last(listing["id"])
    raw_slots = _TOUR_SLOTS.get(listing["id"], [])

    # Synthesize slots if we don't have any cataloged for this listing.
    if not raw_slots:
        raw_slots = [
            {"day": "Saturday", "time": "11:00 AM", "available": True},
            {"day": "Saturday", "time": "2:00 PM", "available": True},
            {"day": "Sunday", "time": "12:00 PM", "available": True},
        ]

    if day:
        wanted = day.strip().lower()
        raw_slots = [s for s in raw_slots if str(s.get("day", "")).lower() == wanted]

    slots = [
        {
            "id": f"slot-{i}",
            "day": _fmt_str(s.get("day")),
            "time": _fmt_str(s.get("time")),
            "available": bool(s.get("available", True)),
            # listing context bundled per-slot so the action carries it.
            "listingId": listing["id"],
        }
        for i, s in enumerate(raw_slots)
    ]

    return a2ui.render(
        operations=[
            a2ui.create_surface(TOUR_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(TOUR_SURFACE, TOUR_SLOT_SCHEMA),
            a2ui.update_data_model(
                TOUR_SURFACE,
                {
                    "listing": {
                        "id": listing["id"],
                        "address": _fmt_str(listing.get("address")),
                        "neighborhood": _fmt_str(listing.get("neighborhood")),
                    },
                    "slots": slots,
                },
            ),
        ],
    )


@tool
def draft_offer_letter(
    listing_id: str | None = None,
    offer_amount: int | None = None,
) -> str:
    """Draft a buyer's offer letter for a listing.

    Call this when the buyer asks to write, draft, or prepare an offer.
    Examples:
      - "Draft an offer at $1.4M"
      - "Write up an offer for 123 Maple at 1.35"
      - "Prepare an offer letter, $1,450,000"

    Args:
        listing_id: optional — defaults to the most recently surfaced listing.
        offer_amount: integer USD (e.g. 1400000). If omitted, defaults
            to 96% of the asking price (a sensible opener for the demo).
    """
    target_id = listing_id or _get_last()
    if not target_id:
        return (
            "draft_offer_letter: no listing context yet. Call show_listings "
            "or show_listing_detail first."
        )

    listing = _resolve_listing(listing_id=target_id)
    if listing is None:
        return f"draft_offer_letter: listing {target_id!r} not found."

    _set_last(listing["id"])
    asking = int(listing.get("price", 0))
    amount = int(offer_amount) if offer_amount is not None else int(round(asking * 0.96))

    pct_of_asking = (amount / asking * 100.0) if asking else 0.0
    pct_label = f"{pct_of_asking:.1f}%" if asking else "n/a"

    body_lines = [
        "Dear seller,",
        "",
        f"On behalf of my client, I am pleased to submit an offer of "
        f"{_fmt_money(amount)} for {listing.get('address', '')} in "
        f"{listing.get('neighborhood', '')}, Brooklyn.",
        "",
        f"This offer represents {pct_label} of the asking price of "
        f"{_fmt_money(asking)}. My client is a qualified buyer with "
        "pre-approval in hand and a flexible close.",
        "",
        "Terms:",
        f"  - All-cash to {_fmt_money(amount)}",
        "  - Standard contingencies (inspection, financing, title)",
        "  - 45-day close, flexible on rent-back",
        "",
        "We are excited about this home and would welcome the opportunity "
        "to discuss any seller priorities. Looking forward to next steps.",
        "",
        "Warmly,",
        "Homestead Buyer's Agent",
    ]

    return a2ui.render(
        operations=[
            a2ui.create_surface(OFFER_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(OFFER_SURFACE, OFFER_LETTER_SCHEMA),
            a2ui.update_data_model(
                OFFER_SURFACE,
                {
                    "listing": {
                        "id": listing["id"],
                        "address": _fmt_str(listing.get("address")),
                        "neighborhood": _fmt_str(listing.get("neighborhood")),
                        "askingPrice": _fmt_money(asking),
                    },
                    "offer": {
                        "amount": _fmt_money(amount),
                        "amountRaw": amount,
                        "pctOfAsking": pct_label,
                    },
                    "letter": "\n".join(body_lines),
                },
            ),
        ],
    )
