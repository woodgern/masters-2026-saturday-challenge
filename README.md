# Masters Saturday Challenge

Static single-page app for a Masters party salary-cap game.

## Features

- `5` golfer roster under a `$100` cap
- prices computed from expected end-of-day score
- roster lock persisted in `localStorage`
- refresh-safe state after lock
- live team score once locked
- direct browser fetch from the live Masters feed by default
- configurable JSON endpoint override for live player data
- bundled sample data fallback so the page works immediately

## Pricing

For each golfer:

`expected_end_of_day_score = current_score + sum(remaining_hole_values)`

`price(E) = round(3 + 13 * 1.09^(-E))`

## Expected Live JSON Shape

```json
{
  "holeValues": {
    "1": 0.14,
    "2": -0.09,
    "3": 0.03
  },
  "players": [
    {
      "id": "mcilroy",
      "name": "Rory McIlroy",
      "currentScore": -8,
      "currentHole": 14,
      "finished": false
    }
  ]
}
```

Optional:

- `remainingHoles`: array of explicit remaining hole numbers if you do not want the app to infer them from `currentHole`

## Masters Feed

The scraper is wired to the public Masters JSON feed discovered in the site config:

`https://www.masters.com/en_US/scores/feeds/2026/scores.json`

The repo includes:

- [scripts/update_live_json.py](/home/nwoodger/Projects/masters-2026-saturday-charge-showdown/scripts/update_live_json.py) to fetch Masters data and convert it to this app's `live.json` shape
- [.github/workflows/update-live-data.yml](/home/nwoodger/Projects/masters-2026-saturday-charge-showdown/.github/workflows/update-live-data.yml) to refresh `live.json` every 5 minutes on GitHub

## Notes

- The app now tries the live Masters feed directly from the browser first.
- If that fails, it falls back to `./live.json`.
- If that also fails, it falls back to bundled sample data.

## Run

Open `index.html` directly, or serve the directory with any static file server.
