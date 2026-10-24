# RoleApp

RoleApp is an English-practice game built around conversations and actions in a block-world town. The opening screen has three paths:

| Mode | What you do |
|---|---|
| **Roleplay** | Explore the town and practice everyday English with Maya at the bakery, Lina at the library, and Leo at the café. |
| **Adventure** | Follow a three-step quest chain. Receive supplies from Maya, obtain a boat-building handbook from Lina, then talk to Leo. |
| **Dub the Scene** | Pick a film scene and character, record the lines, review word-level feedback, and replay the scene with your voice. |

Roleplay and Adventure use the same three.js town. Dubbing opens from the mode card or the town's Dub Shop. The older Phaser pages remain in the repository for existing deep links; the town is the main game. Combat and later adventure chapters are not implemented yet.

## Run locally with Docker

Docker Compose starts PostgreSQL, the FastAPI game API, the FastAPI AI service, and the Vite client.

1. Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell).
2. Set `GROQ_API_KEY` for speech synthesis and Adventure inventory decisions. Set `GEMINI_API_KEY` if you want Gemini to handle dialogue and evaluation; otherwise Groq handles them too. Replace or clear all example placeholders.
3. Start the stack:

```bash
docker compose up --build -d
docker compose ps
```

Open the game at <http://localhost:5173>. API documentation is at <http://localhost:8000/docs>; AI service documentation is at <http://localhost:8001/docs>. The game container runs Vite, so changes to mounted client files update locally.

```bash
docker compose logs -f game api ai db
docker compose down
```

`docker compose down` keeps the PostgreSQL volume. **`docker compose down -v` deletes all local database progress.** Never commit `.env` or put provider keys in client code.

### AI and speech configuration

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Optional Gemini dialogue, evaluation, correction, and STT provider. Gemini takes priority when both provider keys are set. |
| `GROQ_API_KEY` | Required for Groq TTS and Adventure inventory decisions; also supports dialogue and evaluation when Gemini is unset. |
| `GEMINI_STT_API_KEY` | Optional separate Gemini STT key. STT uses this, then `GEMINI_API_KEY`, then Groq STT. |
| `GROQ_INVENTORY_MODEL` | Groq model used to interpret item transfers; defaults to `openai/gpt-oss-120b`. |
| `GROQ_TTS_MODEL` | Groq voice model; defaults to `canopylabs/orpheus-v1-english`. |
| `USE_MOCK_AI` | Fixed development replies for conversations; this does not provide meaningful speech or dubbing evaluation. |

The remaining model names, thresholds, CORS settings, and service defaults are in [`.env.example`](.env.example) and [`docker-compose.yml`](docker-compose.yml). TTS failures are shown to the player and logged instead of silently hiding the missing audio.

## Play and controls

The browser creates a guest account automatically. Progress is tied to that guest identity; clearing browser storage loses access to it.

| Control | Action |
|---|---|
| Click the floor, arrow keys, or `W`/`A`/`S`/`D` | Walk around the town |
| `T` near an NPC | Talk |
| `F` near a highlighted object | Name it in English |
| `E` | Open or close inventory |
| `G` in Adventure | Open the quest journal |
| `B` | Open Spell Book |
| `P` | Open Progress Journal |
| `K` near the CD shelves | Open Dub the Scene |
| `M` or the phone button | Open the phone (texts with Sam) |
| `Z` next to your bed at home | Sleep until 07:00 (after 20:00) |
| `Space` / `Esc` in a cutscene | Next line / skip the scene |
| `Enter` near an activity or portal | Interact |
| `Esc` | Close the current panel |

Typing in a dialogue field does not trigger town movement or inventory shortcuts. Speech uses push-to-talk and browser microphone permission; remote microphone access normally requires HTTPS.

### Adventure and inventory

The three current quests progress in order:

1. **Supplies for the Road:** Maya actually hands over food or a drink.
2. **Boat-Building Handbook:** Lina actually hands over the handbook.
3. **One Last Stop:** Complete an accepted conversation with Leo.

The NPCs do not receive quest completion rules. After an accepted Adventure conversation, Groq examines the latest exchange, recent dialogue, and current inventory. It proposes the item identities and signed quantities that actually changed hands; offers, promises, and requests alone do not count. The API validates and saves the transfer, rejects removal of unowned items, and checks quest completion. Items are not restricted to a fixed catalog.

Quests, the chapter text, and familiar items live in one content file, [`api/game_data/adventure.json`](api/game_data/adventure.json). The API validates it at startup, applies its completion rules, and sends the same content to the client with `GET /api/adventure/state`, so adding or editing a quest needs no code change. Each quest's `complete_when` is either `receive_item` (the player actually receives a given `item_id`, or any item in the given `categories`, from that NPC) or `talk` (an accepted conversation with that NPC). Quests unlock in file order; a player's progress is the index of their active quest, so insert new quests after the ones players may already have finished. Item `aliases` help the inventory judge reuse the right `item_id`; they are not an allowed-item list.

Inventory has a nine-slot hotbar and at least 27 bag slots. An item's icon is `game/public/assets/inventory/<item_id>.svg`; items without one use the generic item SVG. Hover over a slot to see the English item name and quantity. Icons are static assets; there is no automatic image-generation service. Inventory and quest progress persist in PostgreSQL for the guest account.

### Tiers, time, Sam and cutscenes

Adventure is split into tiers (kademe) in [`api/game_data/adventure.json`](api/game_data/adventure.json). Tier 1 is the prologue above at A1; tier 2, "An Old Friend", runs at A2 and introduces Sam. A player's progress is still one number: the index of the active quest across all tiers laid end to end, so existing progress keeps its meaning. Each tier's CEFR level is passed to the NPCs as their language ceiling. Besides `receive_item` and `talk`, quests can complete on a watched cutscene (`scene`), a meeting that ended kept or missed (`plan_resolved`), or reaching a place with the right items (`reach_place`); a quest's `on_complete` can send scripted phone texts.

- **Clock:** 2 real minutes = 1 game hour. The API owns the clock and advances it on the client's ticks, capped per tick, so it pauses while the game is closed. The sky and light follow the time of day; sleeping in your bed at home (`Z`, after 20:00) jumps to 07:00.
- **Sam:** the player's childhood friend (voice `troy`) appears in tier 2's first cutscene and walks a daily routine between his house, the fountain, the beach and Leo's café.
- **Phone:** one persistent text thread with Sam. Texts go through the same turn pipeline as face-to-face talk (language check, memory, relationship). Unread messages show as a badge.
- **Meetings:** after each accepted turn with Sam, a plan judge reads whether a place and time were agreed, cancelled, or apologised for; the API applies the rules in [`api/game_data/plans.json`](api/game_data/plans.json) (known places, at least two game hours' notice, 07:00–22:00). Sam texts a reminder an hour before, walks to the place and waits one game hour. If the player is there, the meeting is kept (sympathy +5, trust +12) and a cutscene plays; if not, Sam sends a hurt message, trust drops by 25 and his friends hear about it. An apology restores 10 trust.
- **Cutscenes:** in-engine scenes in `api/game_data/cutscenes/` with letterbox bars, scripted camera, walking characters and voiced subtitles. Steps are `camera`, `title`, `place`, `walk`, `say`, `effect`, `wait` and `toast`; a step's `when` (`kept_meeting` / `missed_meeting`) branches on the story so far.

### NPC memory and relationships

Maya, Lina, and Leo remember what actually happened with the player and feel differently about them over time. Memories are never written by the language model: each one comes from a template and is tied to a real event, either a confirmed item handover or a completed quest. The NPC involved remembers it as something they saw, and their friends hear about it once as a rumor ("I heard..."). Each NPC's sympathy (−100…100) and trust (0…100) toward the player rise with accepted conversation turns (capped per conversation), gifts, received items, and quests, and a share of every change reaches the NPC's friends through gossip. The sympathy tier (hostile, cold, neutral, friendly, close) shapes the NPC's tone and appears in the conversation header. The NPC roster, who gossips to whom, and every relationship number live in [`api/game_data/npcs.json`](api/game_data/npcs.json).

### Dubbing

Choose a scene and character, listen to each reference line, record your version, and review transcript alignment and accuracy. The final screen can replay the scene with your recordings. Dubbing completion is stored in browser `localStorage`, not PostgreSQL.

## Architecture and data

| Service | Stack | Port | Responsibility |
|---|---|---:|---|
| `game` | TypeScript, three.js, Phaser legacy scenes, Vite | 5173 | Town, modes, dubbing interface |
| `api` | FastAPI, SQLAlchemy | 8000 | Sessions, quests, inventory, rewards, analytics, speech proxy |
| `ai` | FastAPI, Gemini/Groq | 8001 | NPC replies, language assessment, item decisions, STT, TTS |
| `db` | PostgreSQL 16 | 5432 | Guest and gameplay data |

The API applies checked-in Alembic migrations on startup. PostgreSQL stores guest profiles, dialogue, XP, coins, Adventure state and inventory, vocabulary, and learning analytics. Progress Journal shows profile, grammar, words, idioms, and activity. A new play session resets conversation context while account-level progress remains.

The current guest-auth system is a prototype and does not provide production accounts. Speech is push-to-talk, not streaming. Gemini is used when its key is set; if a Gemini call fails (for example a 503 "high demand"), the same call is retried on Groq when `GROQ_API_KEY` is set. If both fail, the player sees a short "couldn't answer right now" message instead of a server error.

## Development and validation

For frontend development without Docker, install Node.js 24, then run from `game/`:

```bash
npm ci
npm run dev
```

The client expects the API at `http://localhost:8000`. `npm run dev:mock-api` starts a local mock API for interface work; its speech output is silent.

With Docker running:

```bash
docker compose exec -T game npm run build
docker compose exec -T game npm test
docker compose exec -T api python -m unittest discover -s tests
docker compose exec -T ai python -m unittest discover -s tests
```

See [`game/README.md`](game/README.md) for client-specific details. The older `studio.html` page remains for deep links, but new players start from the three-card mode selector in `index.html`.
