# TSW Games - Roadmap & Ideas

This document tracks planned improvements and new game ideas for the TSW Games platform.

---

## Existing Game Improvements

### Wordle

- [ ] **Hard Mode** - Force players to use revealed hints in subsequent guesses
- [ ] **Daily Challenge** - Shared daily word everyone competes on (leaderboard by attempts)
- [ ] **Timed Mode** - Add a countdown timer per guess or total game time
- [ ] **Custom Words** - Let the host pick a secret word for friends to guess
- [ ] **Stats Tracking** - Win streaks, guess distribution chart, games played
- [ ] **Share Results** - Generate the classic emoji grid to copy/share
- [ ] **Rematch Button** - Quick restart with same players after game ends

### TypeRace

- [ ] **More Phrases** - Add quotes, song lyrics, code snippets (currently only 17 pangrams)
- [ ] **Difficulty Levels** - Short/Medium/Long text options
- [ ] **Countdown Timer** - Optional time limit mode
- [ ] **Mistake Highlighting** - Show where errors occurred after finishing
- [ ] **Practice Stats** - Track personal best WPM over time
- [ ] **Custom Text** - Let host paste custom text to race on

### Both Games (General Improvements)

- [ ] **In-Game Chat** - Simple message bubbles during lobby/game
- [ ] **Sound Effects** - Key clicks, win/lose sounds, countdown beeps
- [ ] **Spectator Mode** - Watch ongoing games without participating
- [ ] **Kick Player** - Let host remove disruptive players
- [ ] **Auto-Reconnect** - Handle network drops gracefully
- [ ] **Game History** - View past games and results

---

## New Games

### High Priority

- [x] **Drawing Game (Pictionary)** - One player draws, others guess the word. Canvas-based drawing with real-time sync.
- [ ] **Trivia Quiz** - Use template-driven rounds instead of a giant fixed question bank. Best variants: ranking, image reveal, category sort, fake-vs-real.
- [ ] **Reaction Game** - Screen shows a signal, first to click wins the round. Test reflexes with random delays.

### Medium Priority

- [x] **Word Scramble** - MVP implemented with anagram rounds built from the local Wordle answer list, so replayability comes from letter combinations instead of hardcoded prompts.
- [ ] **Quick Math** - Rapid-fire arithmetic problems. First to answer correctly gets points.
- [ ] **Memory Match** - Start with icons, colors, shapes, or symbols instead of external image packs. Can evolve into race mode or power-up mode.

### Low Priority / Fun Ideas

- [x] **Word Chain / Shiritori** - Each player says a word starting with the last letter of the previous word.
- [ ] **Code Breaker (Mastermind)** - Guess the secret color/shape/emoji sequence and use feedback about exact vs misplaced slots.
- [ ] **Would You Rather / Voting** - Build around reusable prompt templates and player-submitted prompts, not a fixed deck.
- [ ] **Emoji Puzzle** - Best only if backed by player-created decks or category packs; otherwise content runs dry too quickly.

### Social Deduction / Party Games

- [ ] **Codenames** - Two teams compete to identify their agents using one-word clues. Spymaster gives clue + number, team guesses words on grid.
- [ ] **Mafia / Werewolf** - Hidden roles, day/night cycle. Villagers try to find the werewolves, werewolves try to eliminate villagers.

### Interaction-First Ideas

- [ ] **Trust Fall** - Players submit true and fake statements, and the room votes on which ones are believable.
- [ ] **Hot Take Arena** - Prompt templates plus group voting. The fun comes from defending takes, not from storing hundreds of prompts.
- [ ] **Sync Up** - Everyone answers privately and scores by matching other players without coordinating.
- [ ] **Pressure Button** - Answer, pass, or pressure another player into answering under risk.
- [ ] **Timeline Chaos** - Order real and fake events, or even friend-group memories, on a shared timeline.
- [ ] **One Mic** - Collaborative story building where each player only sees the previous line or two.
- [ ] **Tier List Battle** - Players drag items into a shared tier board and vote on the final arrangement.
- [ ] **Bomb Defusal** - One player sees clues while another manipulates wires, symbols, switches, or sequences.
- [ ] **Shape Builder** - Players drag, rotate, and place shapes to recreate a hidden target arrangement.
- [ ] **Cluster Up** - Drag cards into groups that match a hidden rule, then let others infer the rule.

### Design Notes

- Prefer games with replayability from player input, combinations, procedural generation, voting, dragging, or hidden information instead of giant hardcoded content banks.
- `Trivia`, `Would You Rather`, `Hot Take Arena`, and `Sync Up` should be driven by templates, room-generated content, or mixed system prompts.
- `Reaction Game` works in the current realtime setup if the rounds include fake-outs, moving targets, pattern rules, or elimination pressure instead of a single plain click race.
- `Memory Match` should start with generated symbols or icons and not depend on external image packs.
- Shared manipulation games are a strong fit for this app: drag-to-sort, place-and-rotate, cooperative assembly, sabotage, and hidden-role board interaction all map well to the existing browser multiplayer setup.

---

## Technical Debt & Infrastructure

- [ ] Add error boundaries and better error handling
- [ ] Implement auto-reconnect for WebSocket drops
- [ ] Add rate limiting for room creation
- [ ] Room cleanup for old/empty games
- [ ] Mobile-optimized touch controls
- [ ] Add comprehensive TypeScript types (remove any `any` types)

---

## Completed

_Move items here when done_

- [x] Wordle - Single player mode
- [x] Wordle - Multiplayer (Race & Classic modes)
- [x] Wordle - Reveal options (after-round, at-end)
- [x] TypeRace - Single player mode
- [x] TypeRace - Multiplayer (Race & Classic modes)
- [x] TypeRace - WPM and accuracy tracking
- [x] Drawing Game - Multiplayer draw and guess with real-time canvas sync
- [x] Word Chain - Multiplayer word chaining with casual/hardcore modes and hearts system
- [x] Word Scramble - Single-player anagram MVP using the local Wordle answer list
