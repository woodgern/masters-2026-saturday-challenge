#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCE_URL = "https://www.masters.com/en_US/scores/feeds/2026/scores.json"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "live.json"


def fetch_source() -> dict:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "Mozilla/5.0"},
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def detect_current_round(data: dict) -> int:
    current_round = str(data.get("currentRound", ""))
    if len(current_round) == 4 and "1" in current_round:
      return current_round.index("1") + 1

    players = data.get("player", [])
    for round_no in range(4, 0, -1):
        round_key = f"round{round_no}"
        for player in players:
            round_data = player.get(round_key) or {}
            scores = round_data.get("scores") or []
            if any(score is not None for score in scores):
                return round_no

    return 1


def parse_score(score_text: str | int | None) -> int:
    if score_text in (None, "", "E"):
        return 0
    return int(score_text)


def parse_current_hole(thru: str, finished: bool, round_scores: list[int | None]) -> int:
    if finished:
        return 18

    digits = "".join(ch for ch in str(thru) if ch.isdigit())
    if digits:
        return int(digits)

    last_completed = 0
    for index, value in enumerate(round_scores, start=1):
        if value is not None:
            last_completed = index

    return last_completed


def build_remaining_holes(round_scores: list[int | None], finished: bool) -> list[int]:
    if finished:
        return []

    holes = []
    for index, value in enumerate(round_scores, start=1):
        if value is None:
            holes.append(index)
    return holes


def transform_player(player: dict, current_round_no: int) -> dict:
    round_key = f"round{current_round_no}"
    round_data = player.get(round_key) or {}
    round_scores = round_data.get("scores") or []
    thru = str(player.get("thru", ""))
    finished = thru == "F" or round_data.get("roundStatus") == "Finished"
    current_hole = parse_current_hole(thru, finished, round_scores)

    return {
        "id": str(player["id"]),
        "name": player["full_name"],
        "currentScore": parse_score(player.get("topar")),
        "currentHole": current_hole,
        "finished": finished,
        "remainingHoles": build_remaining_holes(round_scores, finished),
        "position": player.get("pos"),
        "thru": thru,
        "currentRound": current_round_no,
        "roundScores": round_scores,
    }


def build_output(source_payload: dict) -> dict:
    data = source_payload["data"]
    current_round_no = detect_current_round(data)
    players = [transform_player(player, current_round_no) for player in data.get("player", [])]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": SOURCE_URL,
        "currentRound": current_round_no,
        "wallClockTime": data.get("wallClockTime"),
        "pars": (data.get("pars") or {}).get(f"round{current_round_no}", []),
        "players": players,
    }


def main() -> int:
    try:
        payload = fetch_source()
        output = build_output(payload)
        OUTPUT_PATH.write_text(json.dumps(output, indent=2) + "\n")
        print(f"Wrote {OUTPUT_PATH}")
        print(f"Players: {len(output['players'])}")
        print(f"Current round: {output['currentRound']}")
        return 0
    except Exception as exc:
        print(f"Failed to update live.json: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
