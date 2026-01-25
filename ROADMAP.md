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
- [ ] **Trivia Quiz** - Host picks category, everyone answers timed questions. Points for speed + correctness.
- [ ] **Reaction Game** - Screen shows a signal, first to click wins the round. Test reflexes with random delays.

### Medium Priority

- [ ] **Word Scramble** - Unscramble letters to form words. Race mode or most words in time limit.
- [ ] **Quick Math** - Rapid-fire arithmetic problems. First to answer correctly gets points.
- [ ] **Memory Match** - Flip cards to find pairs. Take turns or race on same board.

### Low Priority / Fun Ideas

- [ ] **Word Chain / Shiritori** - Each player says a word starting with the last letter of the previous word.
- [ ] **Code Breaker (Mastermind)** - Guess the secret color/number sequence.
- [ ] **Would You Rather / Voting** - Everyone votes, see who's in the majority.
- [ ] **Emoji Puzzle** - Guess the movie/song/phrase from emoji clues.

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
