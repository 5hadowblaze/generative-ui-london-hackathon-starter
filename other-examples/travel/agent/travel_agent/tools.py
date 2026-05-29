"""
Tools for the TripWeaver (travel) example.

Four tools, one trip-planning copilot:
  - search_flights:     render flight-results surface (FlightCard list)
  - search_hotels:      render hotel-results surface (HotelCard list)
  - build_itinerary:    render itinerary-timeline surface (day-by-day)
  - email_itinerary:    render an email-confirmation card

Each tool returns an `a2ui.render(operations=[...])` envelope keyed to a
distinct surface id so the route page can scroll-stack the four surfaces
as the conversation grows. All inventory is synthetic — see
data/synthetic.py for the source.

Schema discovery follows the canonical fixed-schema pattern in
agent/src/a2ui_fixed_schema.py:search_flights — load JSON once at import
time, then return an a2ui.render(operations=[...]) envelope from the tool.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from copilotkit import a2ui
from langchain.tools import tool

# Same import-fallback pattern as graph.py — package-relative is canonical
# under langgraph; absolute path injection is the fallback for smoke
# probing this module file directly.
try:
    from .data.synthetic import (  # type: ignore[import-not-found]
        FLIGHTS_LHR_JFK,
        HOTELS_TIMES_SQUARE,
        NYC_3DAY_ART_FOCUS,
        Flight,
        Hotel,
        ItineraryDay,
    )
except ImportError:
    import sys as _sys
    from pathlib import Path as _Path

    _pkg_root = _Path(__file__).resolve().parent
    _sys.path.insert(0, str(_pkg_root.parent))
    from travel_agent.data.synthetic import (  # type: ignore  # noqa: E402
        FLIGHTS_LHR_JFK,
        HOTELS_TIMES_SQUARE,
        NYC_3DAY_ART_FOCUS,
        Flight,
        Hotel,
        ItineraryDay,
    )

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Surface + catalog identity. Catalog is namespaced per example to avoid
# collision with the base starter's app-dashboard-catalog.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATALOG_ID = "copilotkit://travel-catalog"

# Distinct surfaces — the route page scroll-stacks them in conversation order.
SURFACE_FLIGHTS = "flight-results"
SURFACE_HOTELS = "hotel-results"
SURFACE_ITINERARY = "itinerary-timeline"
SURFACE_EMAIL = "email-confirmation"

_THIS_DIR = Path(__file__).parent
# Schemas live one directory up — co-located with the rest of the example
# (see other-examples/travel/schemas/). Same shape as legal-contract-review.
_SCHEMAS_DIR = (_THIS_DIR / ".." / ".." / "schemas").resolve()


def _load_schema(name: str) -> Any:
    """Load a fixed component-tree schema from ../schemas/<name>.json."""
    path = _SCHEMAS_DIR / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text())
    # Ugly fallback — same tell as legal-contract-review's: if you see this
    # surface, the schema files haven't been shipped to the worktree yet.
    return [
        {
            "id": "root",
            "component": "Column",
            "gap": 12,
            "children": [
                {
                    "id": "fallback-text",
                    "component": "Text",
                    "text": f"TripWeaver schema not found: {name}",
                }
            ],
        }
    ]


FLIGHT_SCHEMA = _load_schema("flight_results")
HOTEL_SCHEMA = _load_schema("hotel_results")
ITINERARY_SCHEMA = _load_schema("itinerary_timeline")
EMAIL_SCHEMA = _load_schema("email_confirmation")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# search_flights — fixed-schema A2UI tool. Returns 3 LHR→JFK flights.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@tool
def search_flights(origin: str = "LHR", destination: str = "JFK") -> str:
    """Find flights matching the user's request and render FlightCards.

    Call this when the user asks to find or compare flights between two
    airports (e.g. "flights LHR to JFK next Wednesday under $700"). Demo
    data is hard-coded to LHR→JFK; the origin and destination args are
    captured for the chat trace but don't filter the synthetic inventory.

    Each FlightCard shows airline + flight number, departure / arrival
    times, duration, stops, and price. The Select button dispatches a
    `select_flight` event back to the agent.
    """
    flights: list[Flight] = FLIGHTS_LHR_JFK
    return a2ui.render(
        operations=[
            a2ui.create_surface(SURFACE_FLIGHTS, catalog_id=CATALOG_ID),
            a2ui.update_components(SURFACE_FLIGHTS, FLIGHT_SCHEMA),
            a2ui.update_data_model(
                SURFACE_FLIGHTS,
                {
                    "origin": origin,
                    "destination": destination,
                    "flights": flights,
                },
            ),
        ],
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# search_hotels — fixed-schema A2UI tool. Returns 3 Times Square hotels.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@tool
def search_hotels(area: str = "Times Square") -> str:
    """Find hotels matching the user's request and render HotelCards.

    Call this when the user asks to find or compare hotels (e.g. "hotels
    near Times Square under $300"). Demo data is hard-coded to a
    Times-Square-adjacent mix; the `area` arg is captured for the chat
    trace.

    Each HotelCard shows a photo placeholder, name, neighborhood, nightly
    rate, and a star rating. The Select button dispatches a
    `select_hotel` event back to the agent.
    """
    hotels: list[Hotel] = HOTELS_TIMES_SQUARE
    return a2ui.render(
        operations=[
            a2ui.create_surface(SURFACE_HOTELS, catalog_id=CATALOG_ID),
            a2ui.update_components(SURFACE_HOTELS, HOTEL_SCHEMA),
            a2ui.update_data_model(
                SURFACE_HOTELS,
                {"area": area, "hotels": hotels},
            ),
        ],
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# build_itinerary — render the day-by-day timeline.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@tool
def build_itinerary(destination: str = "NYC", days: int = 3) -> str:
    """Build a multi-day itinerary and render the timeline.

    Call this when the user asks for an itinerary (e.g. "build me a 3-day
    NYC itinerary, art museum focus"). Demo data ships a 3-day NYC plan
    with an art-museum-and-food bent; the destination / days args are
    captured for the chat trace.

    The timeline renders one ItineraryDay per day, each containing a list
    of ItineraryItems (time, title, location, category).
    """
    plan: list[ItineraryDay] = NYC_3DAY_ART_FOCUS[: max(1, min(days, 3))]
    return a2ui.render(
        operations=[
            a2ui.create_surface(SURFACE_ITINERARY, catalog_id=CATALOG_ID),
            a2ui.update_components(SURFACE_ITINERARY, ITINERARY_SCHEMA),
            a2ui.update_data_model(
                SURFACE_ITINERARY,
                {
                    "destination": destination,
                    "days": str(len(plan)),
                    "plan": plan,
                },
            ),
        ],
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# email_itinerary — render a confirmation card.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@tool
def email_itinerary(recipient: str = "you@example.com") -> str:
    """Send the itinerary by email and render a confirmation card.

    Call this when the user asks to email, share, or send their itinerary
    (e.g. "email it to me"). The demo doesn't actually send mail — the
    confirmation card is the only side effect.
    """
    return a2ui.render(
        operations=[
            a2ui.create_surface(SURFACE_EMAIL, catalog_id=CATALOG_ID),
            a2ui.update_components(SURFACE_EMAIL, EMAIL_SCHEMA),
            a2ui.update_data_model(
                SURFACE_EMAIL,
                {
                    "recipient": recipient,
                    "headline": "Itinerary on the way",
                    "summary": (
                        "We sent your 3-day NYC plan to "
                        f"{recipient}. (Demo only — no email was actually sent.)"
                    ),
                },
            ),
        ],
    )


# ─── Exported tool list — graph.py imports this. ────────────────────────
travel_tools = [search_flights, search_hotels, build_itinerary, email_itinerary]
