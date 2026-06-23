"""Google Flights 备用数据源（需可访问 Google）。"""

from __future__ import annotations

from typing import Any

from fast_flights import FlightQuery, Passengers, create_query, get_flights

from ctrip_safari import FlightOffer


def _minutes_to_text(minutes: int) -> str:
    if minutes <= 0:
        return ""
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours}小时{mins}分"
    if hours:
        return f"{hours}小时"
    return f"{mins}分"


def search_google_flights(
    from_airport: str,
    to_airport: str,
    date: str,
    *,
    top_n: int = 5,
    adults: int = 1,
) -> dict[str, Any]:
    query = create_query(
        flights=[
            FlightQuery(
                date=date,
                from_airport=from_airport.upper(),
                to_airport=to_airport.upper(),
            )
        ],
        trip="one-way",
        seat="economy",
        passengers=Passengers(adults=adults),
        max_stops=0,
        language="zh-CN",
        currency="CNY",
    )
    results = get_flights(query)
    flights: list[FlightOffer] = []
    for item in list(results)[:top_n]:
        if len(item.flights) != 1:
            continue
        leg = item.flights[0]
        dep_h, dep_m = leg.departure.time
        arr_h, arr_m = leg.arrival.time
        flights.append(
            FlightOffer(
                airline=" / ".join(item.airlines),
                flight_no="",
                dep_time=f"{dep_h:02d}:{dep_m:02d}",
                arr_time=f"{arr_h:02d}:{arr_m:02d}",
                price=int(item.price),
                duration=_minutes_to_text(leg.duration),
                source="google_flights",
            )
        )
    return {"flights": flights, "source": "google_flights"}
