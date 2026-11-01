# Flappy Coin

A game by **IBuyTheTop** (Strike Discord), sent to Ben on 1 Nov 2026 as a single HTML file for an arcade cabinet in the
ecosystem world. It runs inside the world at `/ecosystem/arcade/flappy-coin/` in a sandboxed frame, and on its own at that URL.

What changed from the file as sent (everything else is as written):

- The inline script moved to `game.js`, the inline styles to `game.css`, and the three Google Fonts links were dropped, so the site's Content Security Policy
  (`script-src 'self'`, `font-src 'self'`) holds. The game falls back to Impact, Courier New and the system font.
- The leaderboard talked to Claude's shared database, which only exists when the file is opened inside Claude. It now talks to
  the world's arcade board on the Copilot Watch worker (`/arcade/top`, `/arcade/score`): one row per name, top ten shown.
- The name field is prefilled with the player's race leaderboard name when there is one, and names go to 20 characters like the race board (was 16).
- When a run ends the game tells the page it sits in (`postMessage`: `arcade.run`, `arcade.board`, and `arcade.close` for
  Escape) so the cabinet in the world can show the top score and the sheet can close.
- `?theme=dark|light` sets the colour scheme, so the frame follows the world's theme rather than the OS.
- A test hook, `window.__flappy.finish(score, level, seconds)`, so the world's QA can end a run without playing one.
- Two lines of CSS so a short frame scrolls the start and game-over screens from the top instead of clipping the title.
- `<meta name="robots" content="noindex">`: the world's page is the one to find.
