from __future__ import annotations

from typing import Protocol

from shared.schemas import DialogueTurn, NPCIdentity

from .groq_client import DEFAULT_GROQ_MODEL, build_groq_client


class TextGenerator(Protocol):
    def generate(
        self,
        identity: NPCIdentity,
        dialogue_history: list[DialogueTurn],
    ) -> str: ...


def _focus_words_instruction(identity: NPCIdentity) -> str:
    if not identity.focus_words:
        return ""
    words = ", ".join(f'"{w}"' for w in identity.focus_words[:2])
    return (
        f"The player is learning these words: {words}. If one of them fits the scene "
        "naturally, use it once in your reply in a clear, helpful context. Never force a "
        "word that does not fit, never explain or define it, and never mention that the "
        "player is learning it.\n\n"
    )


def _npc_system_instruction(identity: NPCIdentity) -> str:
    return (
        "You are an NPC in an English-learning role-play game. "
        "Stay strictly in character. Reply only in natural English, regardless of the "
        "player's input language. Continue the scenario naturally and concisely. "
        "Do not evaluate or correct the user's English; the language evaluator has "
        "already accepted every user turn you receive. Ask at most one question per turn. "
        "Keep your reply short: 1-2 short sentences, never more than 3 - this is a spoken "
        "role-play, not an essay, and shorter replies also mean the model finishes faster.\n\n"
        "When the player clearly asks to take a specific item reasonably available at "
        "your location, hand it over in this reply instead of asking unnecessary "
        "clarifying questions. If no count is given, treat it as one. Explicitly say "
        "which item and how many you are giving now. Do not describe a promise or an "
        "offer as a completed handover. Avoid inventing administrative barriers, such "
        "as a library card, unless the conversation has established one.\n\n"
        f"{_focus_words_instruction(identity)}"
        f"NPC identity and scenario data:\n{identity.model_dump_json(indent=2)}"
    )


class GeminiTextGenerator:
    """Google Gemini API adapter

    Since NpcModule only knows the TextGenerator protocol,
    the model or provider can be changed later without changing the pipeline.

    """

    def __init__(self, api_key: str, model: str = "gemini-3.5-flash-lite"):
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not defined")

        try:
            from google import genai
        except ImportError as exc:
            raise RuntimeError(
                "Gemini dependency is missing. Run 'pip install -r ai/requirements.txt' to install it."
            ) from exc

        self._client = genai.Client(api_key=api_key)
        self._model = model

    def generate(
        self,
        identity: NPCIdentity,
        dialogue_history: list[DialogueTurn],
    ) -> str:
        from google.genai import types

        system_instruction = _npc_system_instruction(identity)
        conversation = "\n".join(
            f"{turn.speaker.upper()}: {turn.text}" for turn in dialogue_history
        )
        response = self._client.models.generate_content(
            model=self._model,
            contents=conversation,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )
        reply = (response.text or "").strip()
        if not reply:
            raise RuntimeError("Gemini returned an empty response")
        return reply


class GroqTextGenerator:
    """Groq (OpenAI-compatible chat-completions) NPC dialogue adapter.

    Same system prompt as `GeminiTextGenerator`; the dialogue history is
    translated into standard OpenAI-style `user`/`assistant` chat turns
    instead of one flattened "SPEAKER: text" block.
    """

    def __init__(self, api_key: str, model: str = DEFAULT_GROQ_MODEL):
        self._client = build_groq_client(api_key)
        self._model = model

    def generate(
        self,
        identity: NPCIdentity,
        dialogue_history: list[DialogueTurn],
    ) -> str:
        messages = [
            {"role": "system", "content": _npc_system_instruction(identity)}
        ]
        for turn in dialogue_history:
            role = "user" if turn.speaker == "user" else "assistant"
            messages.append({"role": role, "content": turn.text})

        response = self._client.post(
            "/chat/completions",
            json={
                "model": self._model,
                "temperature": 0.7,
                "messages": messages,
            },
        )
        response.raise_for_status()
        reply = (response.json()["choices"][0]["message"]["content"] or "").strip()
        if not reply:
            raise RuntimeError("Groq returned an empty response")
        return reply


class NpcModule:
    """NPC identity, roles, and only approved dialogues are managed."""

    def __init__(self, identity: NPCIdentity, generator: TextGenerator):
        self.identity = identity
        self.generator = generator
        self.dialogue_history: list[DialogueTurn] = []

    def respond(self, accepted_user_text: str) -> str:
        candidate_history = [
            *self.dialogue_history,
            DialogueTurn(speaker="user", text=accepted_user_text),
        ]
        npc_reply = self.generator.generate(self.identity, candidate_history)

        # API call is successful, so save both sides of the conversation. This ensures
        # that an incomplete turn doesn't corrupt the permanent conversation history.
        self.dialogue_history.extend(
            [
                DialogueTurn(speaker="user", text=accepted_user_text),
                DialogueTurn(speaker="npc", text=npc_reply),
            ]
        )
        return npc_reply
