# TSW Games App Audit

This audit captures product, UX, game-design, and technical notes for TSW Games. Current decision: do not remove any games for now. Games that look weaker should be improved, repositioned, or marked experimental instead of deleted.

## Overall Verdict

TSW Games has a strong core: small room-code multiplayer games for a private friend group. The app should stay focused on game-night utility, not public matchmaking, accounts, global leaderboards, or scaling to anonymous users.

The strongest direction is social/party games where the fun comes from the people in the room. The weakest direction is solo puzzle games made multiplayer without changing the social dynamic.

## What Is Working

- Clear niche: private friend-group games.
- Room-code multiplayer is the right model for this use case.
- The shared game catalog in `src/lib/gameCatalog.tsx` is a good source for homepage and sidebar navigation.
- PartyKit per-game servers keep game logic isolated.
- Newer social games are the best product direction: `Sync Up`, `Hot Take Arena`, and `Pressure Button`.
- Several hidden-info games already have the right idea of sending player-specific public state, especially `Codenames`, `Poker`, `Drawing`, and parts of `Mafia`.
- The app is usable and consistent today, even if the visual identity is still generic.

## Main Problems

- Hidden answers leak to clients in some games. `Wordle` sends `targetWord`, `Sudoku` sends the full solution, and `Word Scramble` sends solutions as part of public puzzle state.
- Some competitive games trust client-reported progress, completion, scoring, or correctness too much.
- Reconnect behavior is fragile. Refreshing during a game can lose a seat, role, hand, or progress.
- Empty or abandoned rooms can keep stale state forever.
- Adding games does not scale cleanly yet because socket hooks, lobby flows, server boilerplate, timers, and join/leave handling are duplicated per game.
- The root shell includes devtools that likely should not ship to production.
- Local PartyKit durable-object SQLite state is tracked in git. `.partykit` should be ignored and removed from tracked files.
- `README.md` is still starter-template content.
- Tests are missing where they matter most: Poker, Mafia, Codenames, and game-rule validation.
- Biome currently does not cover `party/*.ts`, even though server files hold the riskiest game logic.
- The homepage lists games, but does not strongly answer: "What should we play right now?"

## UI/UX Critique

- The current UI is functional but generic: cards, gradients, icons, and standard shadcn/Tailwind patterns.
- The app should feel more like a private arcade or friend-group game-night launcher, less like a SaaS dashboard.
- Add filters by mood and situation: quick, chaotic, social, serious, word, strategy, long session.
- Add duration and ideal player count to every game. Player range alone is not enough.
- Add a "Pick for us" button that recommends a game based on player count and mood.
- Add game detail/pre-lobby explanations: rules, ideal player count, average duration, and why it is fun.
- Lobbies should be more consistent. Some games use shared lobby components, while older games hand-roll similar UI.
- Mobile controls need special attention because friend-group games are often played on phones.
- Each game could use a more distinct visual personality while preserving shared navigation and lobby patterns.

## Game Recommendations

### Wordle

Verdict: keep and improve.

- Good as a light solo or quick race game, but less social than the newer party games.
- Do not send `targetWord` during play.
- Evaluate guesses on the server instead of trusting client-reported results.
- Add custom friend words, daily crew word, hard mode, and emoji share results.
- Multiplayer should allow everyone to finish or show final standings instead of feeling abruptly ended.

### Type Race

Verdict: keep and improve.

- Strong quick filler game for friends.
- Make typing focus foolproof. Hidden input focus can be unreliable.
- Add visible input or global key capture.
- Add max race duration and full final standings.
- Server should validate typed progress/completion where feasible.

### Drawing

Verdict: keep and improve.

- Excellent friend-group fit.
- Add undo, eraser, brush sizes, and better mobile drawing support.
- Cap stroke size and total strokes to prevent state bloat.
- Do not expose correct guess text in public state before round reveal.
- Add more word packs and maybe custom words.

### Word Scramble

Verdict: keep and improve.

- Good short competitive word game.
- Do not send solutions during play. Reveal them at the end.
- Bundle word lists locally instead of depending on a runtime external gist.
- Add categories, speed rounds, team mode, and better difficulty control.

### Sync Up

Verdict: keep and prioritize.

- One of the best friend-group games in the app.
- Add fuzzy matching or host-controlled merge after reveal for plurals, spelling differences, and synonyms.
- Add custom prompt packs.
- Reveal immediately when all remaining players have submitted.
- This should be treated as a flagship social game.

### Hot Take Arena

Verdict: keep and prioritize.

- Excellent social fit: quick, opinionated, and group-driven.
- Clarify that scoring rewards matching the room, not having the "best" take.
- Lock votes server-side after first submit.
- Add safe/spicy prompt packs.
- Expand prompts, ideally with friend-submitted or host-curated packs.

### Pressure Button

Verdict: keep and prioritize.

- Very strong for close friends, but prompts can get personal.
- Add safe/spicy modes and content warnings.
- Add a decision timer so the active player cannot stall indefinitely.
- Add host skip, force-advance, or emergency reset controls.
- Add custom prompt packs.

### Word Chain

Verdict: keep for now, improve or mark as lightweight.

- Decent, but less exciting than the social games and overlaps with other word games.
- Decide whether it is 5-letter-only or free-length, then align copy and validation.
- Use a bundled dictionary instead of depending on external validation.
- Add chaos modifiers if keeping it long-term: banned letters, speed rounds, power-ups, team chains.

### Codenames

Verdict: keep and improve.

- Excellent group strategy game, but setup and recovery matter a lot.
- Add player cap enforcement.
- Add host reassignment and spymaster replacement if someone leaves.
- Add optional team discussion support or clearer expectation that players use voice chat.
- Improve clue validation beyond exact board-word matches.
- Add better onboarding for team/role setup.

### Sudoku

Verdict: keep for now, but reposition or redesign multiplayer.

- Weakest friend-group fit because it is mostly parallel solo play.
- Do not send full solution to clients during play.
- Server should validate submitted boards/progress.
- Multiplayer should become cooperative, relay-based, or team-based if it stays prominent.
- Otherwise keep it as a solo/chill game rather than a core group-night game.

### Texas Hold'em

Verdict: keep if the group actually plays poker; otherwise deprioritize.

- Good for poker-playing friends, but heavier and more complex than party games.
- Remove the v1/v2 UI toggle before a polished release.
- Add stable reconnect tokens so refresh does not lose seat or hand state.
- Add tests for all-in logic, side pots, showdown, dealer rotation, folds, and blind progression.
- Poker logic should not be trusted without dedicated tests.

### Mafia

Verdict: keep as beta and improve.

- Strong fit for large groups, but high complexity and long sessions.
- Add reconnect support, rematch/restart, host pause, force-advance, and admin recovery controls.
- Hide role-specific fields properly.
- Clamp timer/settings values from query params.
- Add better guidance for new players because Mafia has a higher rules burden.

## Games Not To Remove Right Now

Do not remove any games yet. If a game feels weak, mark it experimental, move it lower in the homepage ordering, or improve the multiplayer mechanic.

Recommended priority tiers:

- Flagship: `Sync Up`, `Hot Take Arena`, `Pressure Button`, `Drawing`.
- Strong but needs polish: `Codenames`, `Type Race`, `Mafia`.
- Keep but lower priority: `Wordle`, `Word Scramble`, `Poker`, `Word Chain`.
- Needs redesign/repositioning: `Sudoku`.

## Best New Game Directions

- Trivia, but only with interesting variants: ranking, image reveal, fake-or-real, category sort, wagering, or team steal rounds.
- Would You Rather as either a mode inside `Hot Take Arena` or a separate very lightweight social vote game.
- Reaction Game only if it has fake-outs, pattern rules, moving targets, or elimination pressure.
- Friend trivia: questions about the group, submitted by players.
- Trust Fall: true/fake statements, room votes on what is believable.
- Timeline Chaos: order real events, fake events, or friend-group memories.
- Tier List Battle: collaboratively build or fight over a tier list.
- Bomb Defusal: one player sees clues while another manipulates controls.
- One Mic: collaborative story where each player sees limited context.
- Cluster Up: sort cards into groups based on hidden rules.

Avoid adding too many plain solo brain games like basic math, plain Sudoku variants, or generic trivia banks unless they have a social twist.

## How To Scale To Many Games

Scaling here means scaling the game library while staying private and friend-group-oriented.

- Build a shared multiplayer engine for room creation, joining, leaving, host transfer, reconnect, errors, and cleanup.
- Create reusable server utilities for typed messages, safe parsing, public/private state, durable timers, broadcasting, and persistence.
- Create reusable client hooks around PartySocket connection lifecycle.
- Create reusable game shells: setup screen, lobby, waiting state, round header, timer, scoreboard, game-over modal.
- Create a richer game definition format: title, route, party name, min/max players, ideal players, duration, tags, mood, complexity, rules, and setup options.
- Prefer prompt/template-driven games because they scale through content packs rather than custom code every time.
- Reuse mechanics across games: voting, matching, drawing, typing, hidden roles, ordering, ranking, guessing, bluffing, and shared board manipulation.
- Add a game picker that recommends based on player count, mood, and available time.
- Keep the product private: no public rooms, no global matchmaking, no public leaderboards, no moderation-heavy features.

## Technical Priorities

1. Stop leaking hidden answers in `Wordle`, `Sudoku`, and `Word Scramble`.
2. Add stable player identity/reconnect tokens.
3. Add empty-room cleanup or stale-room reset.
4. Extract shared multiplayer client/server utilities before adding many more games.
5. Ignore and untrack `.partykit/state` files.
6. Add `typecheck` and include `party/*.ts` in linting.
7. Add tests for Poker, Mafia, Codenames, and word-game validation.
8. Replace starter `README.md` with real project docs.
9. Gate devtools so they do not ship in production.
10. Redesign homepage around "what should we play right now?"
