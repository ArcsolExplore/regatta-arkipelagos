# Regatta Arkipelagos

Companion app for the Regatta Arkipelagos party game: four arcade games everyone plays on their own phone, a shared leaderboard, and a challenge-card deck with a timer. The interface is in Swedish.

## Games

| Game | Signal flag | Goal | Score |
|---|---|---|---|
| **Kryssbanan** | P (preparatory signal) | Beat upwind to the buoy, round it, run back to the line. Tap SLAG as you tack for a speed boost; pressing early locks it briefly. | Time, lowest wins |
| **Skärslalom** | U (you are running into danger) | Weave between skerries as speed keeps rising. Yellow buoys give +25. | Points, highest wins |
| **Förtöj!** | S (my engines are going astern) | Five dockings. Hold to reverse and stop as close to the jetty as you dare. | Points (max 500) |
| **Förtöja 2** (leaderboard: *Parkera*) | D (keep clear, I am manoeuvring with difficulty) | Five harbour manoeuvres in different wind: alongside, bow-in, stern-in (back in), a tight alongside gap, and through a breakwater entrance into a box. Rudder line plus throttle lever. Any contact with a dock or boat fails the attempt. | Total time, lowest wins; failed attempts rank last and score no Regatta points |

Everyone in a round gets the same courses, scenarios and wind (seeded per round). The **Regatta** table turns each game's placings into points (10, 8, 6, 5, 4, 3, 2, 1). Starting a new round resets the leaderboard and gives everyone new courses.

Förtöja 2's boat model integrates damping exactly, so handling is the same at any frame rate, and collisions use the separating axis test on the same convex shapes that are drawn: a near miss is a miss and a clipped corner is a hit.

## Structure

```
public/          static site (no build step)
  index.html
  styles.css
  logic.js       game logic: pure create/update/draw functions
  cards.js       the 11 challenge-card categories
  app.js         views, leaderboard sync, game engine, card deck
api/state.js     serverless leaderboard (GET state, POST score / new round)
vercel.json      serves public/ as the site
```

## Shared leaderboard: one-time setup

The leaderboard is stored in Redis through the Vercel Marketplace:

1. In the Vercel dashboard, open the **regatta-arkipelagos** project → **Storage** → **Create Database** → **Upstash for Redis** (the free plan is enough).
2. Connect it to the project. Vercel adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables.
3. Redeploy.

Until that's done the app still works. The status chip shows **Lokal** and scores are kept on each phone. If a phone loses its connection mid-game, its score is queued and sent when the connection returns.

## Running locally

Any static server works for the games and the card deck:

```
npx serve public
```

To test the leaderboard locally, run `vercel dev` with the Redis variables pulled down (`vercel env pull`).

## Note on deployment protection

New Vercel projects can have Vercel Authentication turned on. If guests see a Vercel login page, go to **Settings → Deployment Protection** and make sure the production domain is public.
