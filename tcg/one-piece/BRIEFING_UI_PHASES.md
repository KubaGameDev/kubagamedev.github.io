# BRIEFING: OPTCG Playtest UI/UX Overhaul + Full Phase Engine

## Scope
This is a user-facing overhaul of the Playtest/Simulation page plus a backend rules-engine upgrade to support all official OPTCG turn phases. Do not touch the Collection tab grid or Deck Builder tab beyond the listed changes.

## Repos / Files to Edit
- Frontend: `C:\Users\kubag\Documents\GitHub\kubagamedev.github.io\tcg\one-piece\`
  - `index.html`
  - `app.js`
  - `styles.css` (add new styles only, keep existing palette)
- Backend: `C:\Users\kubag\Documents\GitHub\OnePieceTCG-Collection-Repo\optcg_collection\optcg_collection\simulation\`
  - `rules_engine.py`
  - `ai_player.py`
  - `batch_sim.py`
- Reference doc (already written): `C:\Users\kubag\ZCodeProject\OPTCG_RULES_GUIDE.md`

---

## Part A — Global UI Changes

### 1. Collapsible Local Backend Bridge Panel
- Add a clickable header/title to the backend panel section.
- When clicked, toggle `is-collapsed` class on the panel body.
- Collapsed state should hide the backend URL input and buttons but keep a small status line visible.
- Default state: collapsed (user can expand it when needed).

### 2. Collection Summary Visibility
- The summary grid with `cardmarket-total`, `ebay-total`, `quantity-total`, `unique-rows` should only be visible when the **Collection** tab is active.
- Add `is-hidden` when switching to Deck Builder or Playtest tabs, and remove it when Collection is active.

---

## Part B — Playtest Panel Restructure

### Current sections to reorganize (see `index.html` lines ~185–333)

### 1. Remove "Pass Turn" from the top control panel
- Keep Start Match, Run 10 Games in the top control panel.
- Move "Pass Turn" into the Actions subpanel only.

### 2. Top row: Simulation Mode + Game Status
Layout as two-column grid:
- **Left card:** "Simulation Mode" with the mode dropdown.
  - Rename options to:
    - `Player vs CPU`
    - `CPU 1 vs CPU 2`
  - Dropdown value stays `player-vs-cpu` / `cpu-vs-cpu`.
- **Right card:** "Game Status" (turn player, phase, turn number).

### 3. Second row: Deck Selection Subpanels (dynamic)
Depending on mode:
- **Player vs CPU:** show "Player Deck" and "CPU Deck".
- **CPU 1 vs CPU 2:** show "CPU 1 Deck" and "CPU 2 Deck".

### 4. Deck Subpanel Logic
- Source dropdown options:
  - `Starter Preset`
  - `Owned Collection`
- When **Starter Preset** is selected:
  - Hide the leader `<select>`.
  - Show a text note like: `Leader: <card_name> (<card_code>)` pulled from `deck.leader`.
  - Load the first preset (`ST-01`) by default automatically.
  - The preset dropdown should include an empty/disabled first option `[Select deck]` and then the actual presets.
- When **Owned Collection** is selected:
  - Show the leader dropdown.
  - Hide the leader note.

### 5. Hide Actions Panel in CPU vs CPU Mode
- The Actions subpanel (Draw, DON!!, Play Character, Attack, Pass Turn) should be hidden when mode is `cpu-vs-cpu`.
- Show it only in `player-vs-cpu` mode.

### 6. Game Log Panel
- Keep the Game Log panel visible in both modes.

---

## Part C — New Simulation Table Panel

Replace the separate "Player zones" + "Player field" panels with a single large **Simulation Table** panel.

### Layout (mirrored, top-to-bottom)
```
[ Opponent Deck | Opponent DON!! | Opponent Life | Opponent Trash ]

[ Opponent Character Area ]
[ Opponent Leader ]

--- CENTER DIVIDER ---

[ Player Leader ]
[ Player Character Area ]

[ Player Deck | Player DON!! | Player Life | Player Trash ]
[ Player Hand ]
```

### Visual Elements
- **Piles** (deck, DON!! deck, life, trash): rectangle with a count number on top.
- **Life area**: show as stacked/piled rectangles, count displayed.
- **Character area**: up to 5 slots, each a card rectangle.
- **Leader**: single large rectangle.
- **Hand**: horizontal row of card rectangles at the bottom.

### Card Rectangle Widget
Each card shown as a compact rectangle with:
- **Top-left:** Cost (or attached DON!! count for field cards)
- **Top-right:** Counter value (if any)
- **Center:** Shortened card name or card code
- **Bottom-left:** Power displayed as `1K`, `2K`, `5K` etc. (divide by 1000, append `K`)
- **Bottom-right:** Life value (Leader only) as `5🩸` or `L 5`
- Resting/active state shown via rotation or border color.

### Responsiveness
- The table panel should be the main visual focus.
- Use CSS Grid or Flexbox to keep the mirrored layout stable.

---

## Part D — Backend Phase Engine Upgrade

### Current State
The engine currently has a simplified "draw/don/play/attack/pass" flow. It already does DON!! refresh on pass, but it does not model Rested/Active states, attached DON!!, or separate Refresh/End phases.

### Required Phases (in order)
Implement in `rules_engine.py`:

1. **Refresh Phase**
   - Set all of the turn player's cards to **Active**.
   - Return all DON!! cards attached to Leader/Characters/Stage back to Cost Area as Active.
   - Reset any "this turn" counters.

2. **Draw Phase**
   - Draw 1 card.
   - **First player does NOT draw on their first turn.** Track `is_first_turn` per player.

3. **DON!! Phase**
   - Add DON!! from DON!! deck to Cost Area Active.
   - Normally +2, but only +1 if:
     - Only 1 DON!! card remains in the DON!! deck, OR
     - It is the player's very first turn and they are the first player.

4. **Main Phase**
   - Allow actions: Play Character, Attach DON!!, Play Event, Play Stage, Attack.
   - Attacking enters the Battle Phase.

5. **End Phase**
   - Resolve end-of-turn effects.
   - Pass turn to opponent.

### Battle Phase Steps
When an attack is declared:
1. **Attack Step** — Rest attacker, declare target (Leader or Character).
2. **Block Step** — Defender may choose an active Character to block.
3. **Counter Step** — Defender may apply [Counter] effects/events.
4. **Battle Resolution** — Compare powers. If attacker power ≥ defender power, K.O. defender.
   - Direct attack on Leader removes 1 Life card to hand.

### State Model Updates
Add to `GameState` / player objects:
- `rested: bool` on cards in field/leader.
- `attached_don: list[Card]` on Leader and each Character.
- `active_don: int` (already exists as `don_active`) — number of untapped DON!! in Cost Area.
- `don_total: int` — total DON!! in Cost Area + attached.

### AI Updates in `ai_player.py` and `batch_sim.py`
Update the CPU/simple AI to respect the new phases:
- Refresh phase: already handled by engine.
- Draw phase: draw card.
- DON!! phase: activate DON!!.
- Main phase: choose from valid actions (play, attach DON, attack).
- Make CPU more likely to attach DON!! to its Leader/Characters before attacking.
- Choose attack targets intelligently: attack weakest blocker or direct if possible.

---

## Part E — Testing Requirements

After making changes, run:
```bash
cd C:\Users\kubag\Documents\GitHub\OnePieceTCG-Collection-Repo
python -m pytest optcg_collection/tests/ -v
```

Fix any failing tests. If tests need updating because of new phase behavior, update them to match the official rules.

Also manually verify via the browser:
1. Backend panel can collapse/expand.
2. Collection summary disappears in Playtest tab.
3. Playtest layout shows Simulation Mode + Game Status on top.
4. Deck panels relabel between Player/CPU and CPU1/CPU2 based on mode.
5. Starter Preset hides leader dropdown and shows leader note.
6. Default ST-01 loads automatically.
7. CPU vs CPU hides Actions panel.
8. Simulation Table renders both players' boards with rectangles for piles, life, characters, leader, hand.
9. A CPU vs CPU game runs through phases and ends.

---

## Output
Report back with:
1. Which files you changed.
2. The pytest result.
3. Any blockers or design decisions you had to make.
