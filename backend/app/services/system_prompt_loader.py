"""System Prompt Loader Service for AI Chat Assistant.

This service loads the AI system prompt from a YAML configuration file,
supports hot-reloading when the file changes, and validates prompt structure.
"""

import logging
import os
import time
from pathlib import Path
from typing import Any

import yaml

from app.core.logging import get_logger

logger = get_logger(__name__)


class SystemPromptLoader:
    """Loads and manages the AI system prompt configuration.
    
    Responsibilities:
    - Load system prompt from YAML file on initialization
    - Support hot-reloading when file changes (watch file for updates)
    - Validate prompt contains required sections
    - Provide formatted prompt text for AI API calls
    """

    # Required sections in the system prompt YAML
    REQUIRED_SECTIONS = [
        "role",
        "domain",
        "database_schema",
        "example_queries",
        "guardrails",
    ]

    def __init__(self, config_path: str | Path | None = None):
        """Initialize the system prompt loader.
        
        Args:
            config_path: Path to the system prompt YAML file.
                        Defaults to backend/app/config/system_prompt.yaml
        """
        if config_path is None:
            # Default path relative to this file
            base_dir = Path(__file__).parent.parent
            config_path = base_dir / "config" / "system_prompt.yaml"
        
        self.config_path = Path(config_path)
        self._prompt_data: dict[str, Any] = {}
        self._formatted_prompt: str = ""
        self._last_modified: float = 0.0
        
        # Load the prompt on initialization
        self.load_prompt()
        
        logger.info(f"SystemPromptLoader initialized with config: {self.config_path}")

    def load_prompt(self) -> None:
        """Load the system prompt from the YAML file.
        
        Validates the prompt structure and caches the formatted prompt text.
        
        Raises:
            FileNotFoundError: If the config file doesn't exist
            ValueError: If the prompt is missing required sections
            yaml.YAMLError: If the YAML file is malformed
        """
        if not self.config_path.exists():
            raise FileNotFoundError(
                f"System prompt configuration file not found: {self.config_path}"
            )
        
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                self._prompt_data = yaml.safe_load(f)
            
            # Update last modified timestamp
            self._last_modified = os.path.getmtime(self.config_path)
            
            # Validate prompt structure
            self._validate_prompt()
            
            # Format the prompt for AI API calls
            self._formatted_prompt = self._format_prompt()
            
            logger.info("System prompt loaded successfully")
            
        except yaml.YAMLError as e:
            logger.error(f"Failed to parse system prompt YAML: {e}")
            raise ValueError(f"Invalid YAML in system prompt file: {e}") from e
        except Exception as e:
            logger.error(f"Failed to load system prompt: {e}")
            raise

    def reload_if_changed(self) -> bool:
        """Check if the config file has changed and reload if necessary.
        
        This method should be called periodically to support hot-reloading.
        
        Returns:
            True if the prompt was reloaded, False otherwise
        """
        try:
            current_mtime = os.path.getmtime(self.config_path)
            
            if current_mtime > self._last_modified:
                logger.info("System prompt file changed, reloading...")
                self.load_prompt()
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to check/reload system prompt: {e}")
            return False

    def get_prompt(self) -> str:
        """Get the formatted system prompt text.
        
        Automatically reloads if the file has changed.
        
        Returns:
            Formatted system prompt string for AI API calls
        """
        # Check for updates before returning
        self.reload_if_changed()
        return self._formatted_prompt

    def get_database_schema(self) -> dict[str, Any]:
        """Get the database schema section from the prompt.
        
        Returns:
            Dictionary containing database schema information
        """
        self.reload_if_changed()
        return self._prompt_data.get("database_schema", {})

    def get_example_queries(self) -> list[dict[str, str]]:
        """Get example queries from the prompt.
        
        Returns:
            List of example query dictionaries
        """
        self.reload_if_changed()
        return self._prompt_data.get("example_queries", [])

    def get_guardrails(self) -> dict[str, Any]:
        """Get guardrails section from the prompt.
        
        Returns:
            Dictionary containing guardrail rules
        """
        self.reload_if_changed()
        return self._prompt_data.get("guardrails", {})

    def _validate_prompt(self) -> None:
        """Validate that the prompt contains all required sections.
        
        Raises:
            ValueError: If required sections are missing
        """
        missing_sections = []
        
        for section in self.REQUIRED_SECTIONS:
            if section not in self._prompt_data:
                missing_sections.append(section)
        
        if missing_sections:
            raise ValueError(
                f"System prompt is missing required sections: {', '.join(missing_sections)}"
            )
        
        # Validate database_schema has tables
        schema = self._prompt_data.get("database_schema", {})
        if not schema:
            raise ValueError("database_schema section is empty")
        
        # Validate example_queries is a list
        examples = self._prompt_data.get("example_queries", [])
        if not isinstance(examples, list) or len(examples) == 0:
            raise ValueError("example_queries must be a non-empty list")
        
        logger.debug("System prompt validation passed")

    def _format_prompt(self) -> str:
        """Format the prompt data into a compact text string for AI API calls.
        
        Keeps the prompt as short as possible to minimize token usage.
        
        Returns:
            Formatted prompt string
        """
        sections = []
        
        # Role — keep it short
        if "role" in self._prompt_data:
            sections.append(self._prompt_data["role"].strip())
            sections.append("")
        
        # Database schema — compact format, no verbose headers
        if "database_schema" in self._prompt_data:
            sections.append("## Database Schema")
            schema = self._prompt_data["database_schema"]
            
            for table_name, table_info in schema.items():
                col_lines = []
                for column in table_info.get("columns", []):
                    col_name = column.get("name", "")
                    col_desc = column.get("description", "")
                    col_lines.append(f"  {col_name}: {col_desc}")
                sections.append(f"Table `{table_name}`:")
                sections.extend(col_lines)
                sections.append("")
        
        # Example queries — only first 3 to save tokens
        if "example_queries" in self._prompt_data:
            examples = self._prompt_data["example_queries"][:3]
            sections.append("## Example SQL Queries")
            for example in examples:
                sections.append(f"Q: {example.get('question', '')}")
                sections.append("```sql")
                sections.append(example.get("sql", "").strip())
                sections.append("```")
                sections.append("")
        
        # Guardrails — flatten to bullet list, skip verbose headers
        if "guardrails" in self._prompt_data:
            sections.append("## Rules")
            guardrails = self._prompt_data["guardrails"]
            for category, rules in guardrails.items():
                if isinstance(rules, list):
                    for rule in rules:
                        sections.append(f"- {rule}")
            sections.append("")
        
        return "\n".join(sections)

    def get_compact_sql_prompt(self) -> str:
        """Get a minimal prompt for SQL generation only.
        
        Used when we only need the schema and SQL rules — not the full prompt.
        Saves ~400 tokens per SQL generation call.
        
        Returns:
            Compact prompt string for SQL generation
        """
        self.reload_if_changed()
        sections = []
        
        # Role one-liner
        sections.append("You are a SQL generator for a payment analytics admin dashboard.")
        sections.append("")
        
        # Schema — only the two main tables, compact
        schema = self._prompt_data.get("database_schema", {})
        for table_name in ["payment_records", "upload_sessions"]:
            if table_name not in schema:
                continue
            table_info = schema[table_name]
            col_lines = []
            for col in table_info.get("columns", []):
                col_lines.append(f"  {col['name']}: {col.get('description', '')}")
            sections.append(f"Table `{table_name}`:")
            sections.extend(col_lines)
            sections.append("")
        
        # SQL rules only
        guardrails = self._prompt_data.get("guardrails", {})
        sql_rules = guardrails.get("sql_generation", [])
        if sql_rules:
            sections.append("SQL Rules:")
            for rule in sql_rules:
                sections.append(f"- {rule}")
            sections.append("")
        
        return "\n".join(sections)


# Global singleton instance
_system_prompt_loader: SystemPromptLoader | None = None


def get_system_prompt_loader() -> SystemPromptLoader:
    """Get or create the global system prompt loader instance.
    
    Returns:
        SystemPromptLoader singleton instance
    """
    global _system_prompt_loader
    if _system_prompt_loader is None:
        _system_prompt_loader = SystemPromptLoader()
    return _system_prompt_loader
