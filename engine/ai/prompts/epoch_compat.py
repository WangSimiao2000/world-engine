"""Epoch compatibility check prompt."""

PROMPT_TEMPLATE = """You are an epoch compatibility reviewer for a Chinese-mythology-inspired fictional world (山海纪).

## Epoch Definitions
{epoch_info}

## Entity Under Review
{entity_yaml}

## Instructions
- Check if this entity's concepts, technology level, and cultural references fit its assigned epoch
- Flag anything that seems too advanced or too primitive for the epoch
- Check if tags are appropriate for the epoch
- Respond in the structured format requested
"""
