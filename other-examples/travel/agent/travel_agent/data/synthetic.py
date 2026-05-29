"""
Synthetic travel inventory for the TripWeaver example.

All prices, flight numbers, hotel names, and itineraries are fabricated.
The footer of the surface labels everything as
"Demo · synthetic prices · not bookable." Do NOT quote any of this
as real availability.

Why a single Python module instead of CSV/JSON: this dataset is tiny
(<300 lines), purely literal, and never edited by the user during the
demo. Keeping it in Python means:
  - the agent's data shapes (Flight, Hotel, ItineraryDay) live next to
    the data, so a single edit catches all three places.
  - `from .data.synthetic import FLIGHTS` imports cleanly from tools.py
    without a json.load on every cold start.

If you fork this example and want to swap in your own city pair, just
edit the literals here. The schemas in `../../schemas/` reference the
field names (origin, destination, departTime, ...), so rename carefully
or keep the keys.
"""

from __future__ import annotations

from typing import TypedDict


class Flight(TypedDict):
    id: str
    airline: str
    airlineLogo: str
    flightNumber: str
    origin: str
    destination: str
    date: str
    departTime: str
    arriveTime: str
    duration: str
    stops: str
    price: str


class Hotel(TypedDict):
    id: str
    name: str
    neighborhood: str
    imageUrl: str
    nightlyRate: str
    rating: str


class ItineraryItem(TypedDict):
    id: str
    time: str
    title: str
    location: str
    category: str  # "museum" | "food" | "transit" | "experience" | "rest"


class ItineraryDay(TypedDict):
    id: str
    day: str
    title: str
    items: list[ItineraryItem]


# ─── Flights — LHR → JFK, near-future Wednesday, under $700 ─────────────
#
# Google favicon API gives us a real airline mark per row without
# shipping image assets. The agent prompt teaches it the same trick if
# it wants to vary the airline mix.

FLIGHTS_LHR_JFK: list[Flight] = [
    {
        "id": "fl-001",
        "airline": "British Airways",
        "airlineLogo": "https://www.google.com/s2/favicons?domain=britishairways.com&sz=128",
        "flightNumber": "BA 175",
        "origin": "LHR",
        "destination": "JFK",
        "date": "Wed, Mar 18",
        "departTime": "10:25",
        "arriveTime": "13:30",
        "duration": "8h 05m",
        "stops": "Nonstop",
        "price": "$642",
    },
    {
        "id": "fl-002",
        "airline": "Virgin Atlantic",
        "airlineLogo": "https://www.google.com/s2/favicons?domain=virginatlantic.com&sz=128",
        "flightNumber": "VS 3",
        "origin": "LHR",
        "destination": "JFK",
        "date": "Wed, Mar 18",
        "departTime": "11:00",
        "arriveTime": "14:10",
        "duration": "8h 10m",
        "stops": "Nonstop",
        "price": "$689",
    },
    {
        "id": "fl-003",
        "airline": "Delta",
        "airlineLogo": "https://www.google.com/s2/favicons?domain=delta.com&sz=128",
        "flightNumber": "DL 4",
        "origin": "LHR",
        "destination": "JFK",
        "date": "Wed, Mar 18",
        "departTime": "08:35",
        "arriveTime": "11:55",
        "duration": "8h 20m",
        "stops": "Nonstop",
        "price": "$598",
    },
]


# ─── Hotels — near Times Square, under $300/night ───────────────────────
#
# imageUrls use placehold.co re-tinted to the TripWeaver sky+coral palette.
# All names are fabricated — the seed worktree shipped a similar mix.

HOTELS_TIMES_SQUARE: list[Hotel] = [
    {
        "id": "hotel-nyc-001",
        "name": "The Pearl Midtown",
        "neighborhood": "Times Square",
        "imageUrl": "https://placehold.co/512x320/56b0f5/ffffff?text=Pearl",
        "nightlyRate": "$249",
        "rating": "4.6",
    },
    {
        "id": "hotel-nyc-002",
        "name": "Broadway Skyline Suites",
        "neighborhood": "Theater District",
        "imageUrl": "https://placehold.co/512x320/3296dc/ffffff?text=Skyline",
        "nightlyRate": "$289",
        "rating": "4.4",
    },
    {
        "id": "hotel-nyc-003",
        "name": "Hudson Loft Hotel",
        "neighborhood": "Hell's Kitchen",
        "imageUrl": "https://placehold.co/512x320/ff8a65/ffffff?text=Hudson",
        "nightlyRate": "$195",
        "rating": "4.5",
    },
]


# ─── Itinerary template — 3-day NYC, art-museum focus ───────────────────

NYC_3DAY_ART_FOCUS: list[ItineraryDay] = [
    {
        "id": "day-1",
        "day": "Day 1",
        "title": "Midtown landmarks + MoMA",
        "items": [
            {
                "id": "d1-1",
                "time": "09:00",
                "title": "Coffee at Sant Ambroeus",
                "location": "70th & Madison",
                "category": "food",
            },
            {
                "id": "d1-2",
                "time": "10:30",
                "title": "Museum of Modern Art (MoMA)",
                "location": "11 W 53rd St",
                "category": "museum",
            },
            {
                "id": "d1-3",
                "time": "13:30",
                "title": "Lunch at The Modern (MoMA cafe)",
                "location": "9 W 53rd St",
                "category": "food",
            },
            {
                "id": "d1-4",
                "time": "15:00",
                "title": "Walk to Bryant Park",
                "location": "5th & 42nd",
                "category": "experience",
            },
            {
                "id": "d1-5",
                "time": "19:30",
                "title": "Dinner: Keens Steakhouse",
                "location": "72 W 36th St",
                "category": "food",
            },
        ],
    },
    {
        "id": "day-2",
        "day": "Day 2",
        "title": "Met Museum + Central Park stroll",
        "items": [
            {
                "id": "d2-1",
                "time": "09:30",
                "title": "Subway uptown (4/5/6 to 86th)",
                "location": "Subway",
                "category": "transit",
            },
            {
                "id": "d2-2",
                "time": "10:00",
                "title": "The Metropolitan Museum of Art",
                "location": "1000 5th Ave",
                "category": "museum",
            },
            {
                "id": "d2-3",
                "time": "13:00",
                "title": "Lunch: Cafe Sabarsky",
                "location": "1048 5th Ave",
                "category": "food",
            },
            {
                "id": "d2-4",
                "time": "14:30",
                "title": "Central Park: the Ramble + Bow Bridge",
                "location": "Central Park",
                "category": "experience",
            },
            {
                "id": "d2-5",
                "time": "19:00",
                "title": "Dinner: Via Carota",
                "location": "51 Grove St",
                "category": "food",
            },
        ],
    },
    {
        "id": "day-3",
        "day": "Day 3",
        "title": "Whitney + High Line + farewell drinks",
        "items": [
            {
                "id": "d3-1",
                "time": "10:00",
                "title": "Whitney Museum of American Art",
                "location": "99 Gansevoort St",
                "category": "museum",
            },
            {
                "id": "d3-2",
                "time": "12:30",
                "title": "High Line walk (Gansevoort → 30th)",
                "location": "Chelsea / Meatpacking",
                "category": "experience",
            },
            {
                "id": "d3-3",
                "time": "13:30",
                "title": "Lunch: Los Tacos No. 1 (Chelsea Mkt)",
                "location": "Chelsea Market",
                "category": "food",
            },
            {
                "id": "d3-4",
                "time": "16:00",
                "title": "Rest stop at hotel",
                "location": "Hotel",
                "category": "rest",
            },
            {
                "id": "d3-5",
                "time": "19:30",
                "title": "Farewell cocktails: Bemelmans Bar",
                "location": "35 E 76th St",
                "category": "food",
            },
        ],
    },
]
