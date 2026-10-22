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

The current guest-auth system is a prototype and does not provide production accounts. Speech is push-to-talk, not streaming. Provider selection is configuration-based; there is no automatic request-level failover.

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
