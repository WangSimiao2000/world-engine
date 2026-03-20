"""Pluggable AI provider interface."""

from __future__ import annotations

from typing import Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


@runtime_checkable
class AIProvider(Protocol):
    def review(self, prompt: str, response_model: type[T]) -> T: ...


class OpenAIProvider:
    def __init__(self, model: str = "gpt-4o"):
        import instructor
        from openai import OpenAI

        self.client = instructor.from_openai(OpenAI())
        self.model = model

    def review(self, prompt: str, response_model: type[T]) -> T:
        return self.client.chat.completions.create(
            model=self.model,
            response_model=response_model,
            messages=[{"role": "user", "content": prompt}],
        )
