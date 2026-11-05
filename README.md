# Regatta Arkipelagos

Companion app for the Regatta Arkipelagos party game. It has eleven solo arcade games everyone plays on their own phone, three live games played together in a room, two pass-the-phone table games, a shared leaderboard, and a challenge-card deck with a timer. The interface is in Swedish.

## Solo games (the Regatta)

| Game | Signal flag | Goal | Score |
|---|---|---|---|
| **Kryssbanan** | P (preparatory signal) | Beat upwind to the buoy, round it, run back to the line. Tap SLAG as you tack for a speed boost; pressing early locks it briefly. | Time, lowest wins |
| **Skärslalom** | U (you are running into danger) | Weave between skerries as speed keeps rising. Yellow buoys give +25. | Points, highest wins |
| **Förtöj!** | S (my engines are going astern) | Five dockings. Hold to reverse and stop as close to the jetty as you dare. | Points (max 500) |
| **Förtöja 2** (leaderboard: *Parkera*) | D (keep clear, I am manoeuvring with difficulty) | Five harbour manoeuvres in different wind: alongside, bow-in, stern-in (back in), a tight alongside gap, and through a breakwater entrance into a box. Rudder line plus throttle lever. Any contact with a dock or boat fails the attempt. | Total time, lowest wins; failed attempts rank last and score no Regatta points |
| **Navigatören** | N (no) | Draw a route on a paper chart through mark 1 and mark 2 and into harbour. A line that touches land or a shoal stops the stroke and adds 3 s. Ångra removes the last stroke. Every chart is checked to be solvable. | Drawing time + time at sea (route length), lowest wins |
| **Fyrkaraktären** | L (stop instantly) | A lighthouse shows a real light characteristic (Fl, LFl, Iso, Fl(2), Mo(A), Q(6)+LFl and others). Hold to flash it back. Count, short/long and rhythm must match. Ten lights, three lives. | Points (max 1000) |
| **Kasta tamp** | T (keep clear of me) | Five swipe throws of a mooring line at a bollard, with crosswind. Swipe speed sets distance, direction sets the side. | Points (max 500) |
| **Grillmästaren** | G (I require a pilot) | 60 s at a grill with six hot and cool spots. Tap to flip, hold to serve. Both sides perfect gives 100, with a bonus for streaks. | Points, highest wins |
| **Måsattacken** | A (diver down, keep clear) | 60 s defending a shrimp sandwich from gulls. Tap or swipe a gull to shoo it; the dark trut needs two hits. Quick chains multiply points up to ×4, and each shrimp left at the end gives 25. | Points, highest wins |
| **Svallvågen** | O (man overboard) | Passing boats send wakes through the cockpit. Tilt the phone (device orientation, iOS asks for permission) to keep the coffee cup level; without a sensor, drag like a joystick. Jerks spill coffee, and a hard hit against the rim tips the cup. | Coffee kept, second by second (max 1000) |
| **Lotsen i dimman** | H (I have a pilot on board) | Memorise the fairway for 4 s, then steer through fog past the blinking marks to the lighthouse. The fog horn clears the fog briefly for +2 s; grounding (exact hull test) costs +5 s. | Time, lowest wins |

## Live games (Tillsammans)

One person creates a room. The others join with the four-letter code or a `#rum-CODE` link. The server (`api/room.js`) runs the race, and clients sync their clocks to it.

| Game | How it plays |
|---|---|
| **Startlinjen** | A shared countdown that goes dark at T−4 s. Tap as close after the gun as you dare; tapping before is a false start (OCS). Each player's best start is saved to its own leaderboard (*Start*), which does not count in the Regatta. |
| **Dragkampen** | Red against blue. Taps are summed per person, so uneven teams are fair. The first team to pull the knot 20 taps per person ahead wins; otherwise the leader after 40 s wins. |
| **Sjöslaget** | Team battleship on 8×8. The server places the fleets and hides each team's ships from the other. A hit earns another shot. |

Anything several phones can write at once uses a single atomic Redis command (`SET NX`, `HSETNX`, `INCRBY`). Two presses at the same moment can never start two races or fire two shots. Rooms expire after 3 hours. **The live games need the Redis store below; without it they show a message explaining that.**

## Table games (Bordet)

**Tickande sjömina:** say something in the category, then pass the phone. The fuse is hidden and lasts 20–60 s. **Pannkortet:** hold the phone to your forehead. Tilt down for right, tilt up to pass. On-screen buttons also work. An optional rule card can be drawn from the Begränsning category. Both run entirely on the phone.

Everyone in a round gets the same courses, scenarios and wind (seeded per round). The **Regatta** table turns each game's placings into points (10, 8, 6, 5, 4, 3, 2, 1). Starting a new round resets the leaderboard and gives everyone new courses.

Förtöja 2's boat model integrates damping exactly, so handling is the same at any frame rate, and collisions use the separating axis test on the same convex shapes that are drawn: a near miss is a miss and a clipped corner is a hit.

## Structure

```
public/          static site (no build step)
  index.html
  styles.css
  logic.js       game logic: pure create/update/draw functions
  games-extra.js Navigatören, Fyrkaraktären, Kasta tamp, Grillmästaren (same interface)
  games-more.js  Måsattacken, Svallvågen, Lotsen i dimman
  cards.js       the 11 challenge-card categories
  words.js       categories and word decks for the table games
  live.js        live rooms: Startlinjen, Dragkampen, Sjöslaget
  table.js       Tickande sjömina and Pannkortet
  app.js         views, leaderboard sync, game engine, card deck
api/state.js     serverless leaderboard (GET state, POST score / new round)
api/room.js      serverless live rooms (create/join, races, taps, pulls, shots)
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
