# roleApp Game Client

`index.html` first opens a three-card mode selector:

- **Roleplay:** Explore the block town and practice everyday English with Maya, Lina and Leo. Open directly with `?mode=roleplay`.
- **Macera:** Open the same town with a three-step quest journal. Accepted conversations with Maya, Lina, and Leo unlock the next quest in order. Progress is saved in this browser. This is the prologue; later combat chapters are not implemented yet. Open directly with `?mode=adventure`.
- **Dub the Scene:** Open the Kaset & CD shop to record lines over a scene. Open directly with `?open=dub`.

The town uses three.js and the Praglish API. The old Phaser page remains at `studio.html?scene=...` for deep links; opening `studio.html` without a scene now returns to mode selection. Mode artwork is original AI-generated block-world illustration.
## Run with Docker

Docker is the recommended way to run the complete application. It does not
require a local Node.js installation:

```bash
docker compose up --build
```

Open `http://localhost:5173` after the services are ready.

## Run the client locally

Node.js 20 or newer is required only when developing the client outside Docker:

```bash
npm install
npm run dev
```

The client expects the API at `http://localhost:8000` by default. To use a
different endpoint, define `window.PRAGLISH_API_BASE_URL` before the game script
loads.

For interface-only development without Docker or Python, run the mock API in a
separate terminal:

```bash
npm run dev:mock-api
```

The mock server follows the same session, turn, vocabulary, and speech contracts
as the FastAPI service, but it is not real AI. Speech recognition returns a fixed
sample sentence and speech synthesis returns a valid silent WAV. Run the AI
container with a configured provider key for real STT and TTS.

## Controls

- Click the floor to move with A* pathfinding.
- Press `E` near an NPC to start a conversation, or near an object to open the
  vocabulary panel.
- Use the microphone button in a conversation to record speech. The client sends
  the recording to `/api/speech/stt` and plays the NPC response from
  `/api/speech/tts`.
- Press `Esc` to close a conversation or vocabulary panel.
- Press `B` to open the spell book and `P` to open the progress dashboard.
- In Macera mode, press `G` to open the quest journal.
- Use **Mod seçimi** in the town HUD to return to the opening cards.

## Validation

```bash
npm run typecheck
npm run test
npm run build
```

The Maya and Lina dialogue panels use the API session and turn flow. AI replies,
corrections, and rewards appear in the same panel. Microphone input relies on the
browser `getUserMedia` and `MediaRecorder` APIs and works only in a secure context,
such as `http://localhost` or HTTPS.

The player sprite sheet was produced for this project using a CC0 sheet layout as a reference; attribution details are in `public/assets/characters/SOURCE.md`.
