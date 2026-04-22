"""Response Formatter Service for AI Chat Assistant.

This service structures AI responses with chart metadata and determines
appropriate visualizations based on query results.
"""

import logging
import re
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Literal

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ChartMetadata:
    """Metadata for chart visualization."""
    
    type: Literal["bar", "line", "pie"]
    data: list[float]
    labels: list[str]
    title: str | None = None
    x_axis_label: str | None = None
    y_axis_label: str | None = None


@dataclass
class FormattedResponse:
    """Formatted AI response with optional chart metadata."""
    
    content: str
    chart_metadata: ChartMetadata | None = None


class ResponseFormatter:
    """Formats AI responses and prepares visualizations.
    
    Responsibilities:
    - Structure AI responses with chart metadata
    - Determine chart type based on query intent and data structure
    - Support bar charts for top-N queries
    - Support line charts for time-series data
    - Support pie charts for distributions
    - Format streaming chunks for real-time responses
    """

    MAX_CHART_CATEGORIES = 10  # Don't chart if more than 10 categories
    MIN_CHART_CATEGORIES = 2   # Need at least 2 data points for a chart

    def __init__(self):
        """Initialize the response formatter."""
        logger.info("ResponseFormatter initialized")

    async def format_response(
        self,
        ai_response: str,
        query_results: list[dict] | None = None,
        user_query: str | None = None,
    ) -> FormattedResponse:
        """Format AI response with optional chart metadata.
        
        Analyzes query results and user query to determine if a visualization
        would be helpful, and if so, what type of chart to use.
        
        Args:
            ai_response: The AI's text response
            query_results: Optional database query results
            user_query: Optional original user query for context
            
        Returns:
            FormattedResponse with content and optional chart metadata
            
        Requirements: 1.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
        """
        # Determine if we should include a chart
        chart_metadata = None
        
        if query_results and user_query:
            chart_metadata = self.determine_chart_type(query_results, user_query)
        
        return FormattedResponse(
            content=ai_response,
            chart_metadata=chart_metadata,
        )

    def determine_chart_type(
        self,
        query_results: list[dict],
        user_query: str,
    ) -> ChartMetadata | None:
        """Determine if results should include visualization and what type.
        
        Decision logic:
        - Top-N queries → Bar chart
        - Time-series queries → Line chart
        - Distribution/breakdown queries → Pie chart
        - Queries with >10 results → No chart (table only)
        - Single value queries → No chart
        
        Args:
            query_results: Database query results
            user_query: Original user query for context
            
        Returns:
            ChartMetadata if visualization is appropriate, None otherwise
            
        Requirements: 11.2, 11.3, 11.4
        """
        if not query_results:
            return None
        
        # Check if we have enough data points
        num_results = len(query_results)
        
        if num_results < self.MIN_CHART_CATEGORIES:
            logger.debug(f"Not enough data points for chart: {num_results}")
            return None
        
        if num_results > self.MAX_CHART_CATEGORIES:
            logger.debug(f"Too many data points for chart: {num_results}")
            return None
        
        # Analyze query intent
        query_lower = user_query.lower()
        
        # Check for time-series indicators
        if self._is_time_series_query(query_lower, query_results):
            return self._create_line_chart(query_results, user_query)
        
        # Check for distribution/breakdown indicators
        if self._is_distribution_query(query_lower):
            return self._create_pie_chart(query_results, user_query)
        
        # Check for top-N or comparison indicators
        if self._is_top_n_query(query_lower):
            return self._create_bar_chart(query_results, user_query)
        
        # Default: if we have categorical data with numeric values, use bar chart
        if self._has_categorical_numeric_data(query_results):
            return self._create_bar_chart(query_results, user_query)
        
        return None

    async def format_streaming_chunk(self, chunk: str) -> str:
        """Format a streaming response chunk.
        
        Ensures chunks are properly formatted for SSE transmission.
        
        Args:
            chunk: Response chunk from AI API
            
        Returns:
            Formatted chunk string
            
        Requirements: 2.8
        """
        # For now, just return the chunk as-is
        # In a full implementation, this might add SSE formatting
        return chunk

    def _is_time_series_query(self, query: str, results: list[dict]) -> bool:
        """Check if query is asking for time-series data.
        
        Args:
            query: User query (lowercase)
            results: Query results
            
        Returns:
            True if this appears to be a time-series query
        """
        # Check for time-related keywords
        time_keywords = [
            "trend", "over time", "monthly", "daily", "weekly", "yearly",
            "last", "past", "previous", "history", "timeline", "progression"
        ]
        
        has_time_keyword = any(keyword in query for keyword in time_keywords)
        
        # Check if results have date/month columns
        if results:
            first_row = results[0]
            date_columns = ["month", "date", "payment_date", "year", "day", "week"]
            has_date_column = any(col in first_row for col in date_columns)
            
            return has_time_keyword and has_date_column
        
        return has_time_keyword

    def _is_distribution_query(self, query: str) -> bool:
        """Check if query is asking for distribution/breakdown.
        
        Args:
            query: User query (lowercase)
            
        Returns:
            True if this appears to be a distribution query
        """
        distribution_keywords = [
            "breakdown", "distribution", "split", "proportion", "percentage",
            "share", "composition", "by touchpoint", "by environment"
        ]
        
        return any(keyword in query for keyword in distribution_keywords)

    def _is_top_n_query(self, query: str) -> bool:
        """Check if query is asking for top-N results.
        
        Args:
            query: User query (lowercase)
            
        Returns:
            True if this appears to be a top-N query
        """
        top_n_keywords = [
            "top", "best", "highest", "largest", "most", "leading",
            "bottom", "worst", "lowest", "smallest", "least"
        ]
        
        return any(keyword in query for keyword in top_n_keywords)

    def _has_categorical_numeric_data(self, results: list[dict]) -> bool:
        """Check if results have categorical labels and numeric values.
        
        Args:
            results: Query results
            
        Returns:
            True if results are suitable for charting
        """
        if not results:
            return False
        
        first_row = results[0]
        
        # Need at least 2 columns: one for labels, one for values
        if len(first_row) < 2:
            return False
        
        # Check if we have at least one string column and one numeric column
        has_string = False
        has_numeric = False
        
        for value in first_row.values():
            if isinstance(value, str):
                has_string = True
            elif isinstance(value, (int, float)):
                has_numeric = True
        
        return has_string and has_numeric

    def _create_bar_chart(
        self,
        results: list[dict],
        user_query: str,
    ) -> ChartMetadata | None:
        """Create bar chart metadata from query results.
        
        Args:
            results: Query results
            user_query: Original user query
            
        Returns:
            ChartMetadata for bar chart
        """
        try:
            # Extract labels and data
            labels, data = self._extract_chart_data(results)
            
            if not labels or not data:
                return None
            
            # Generate title from query
            title = self._generate_chart_title(user_query, "Bar Chart")
            
            return ChartMetadata(
                type="bar",
                data=data,
                labels=labels,
                title=title,
                x_axis_label=self._guess_x_axis_label(results),
                y_axis_label=self._guess_y_axis_label(results),
            )
        except Exception as e:
            logger.error(f"Failed to create bar chart: {e}")
            return None

    def _create_line_chart(
        self,
        results: list[dict],
        user_query: str,
    ) -> ChartMetadata | None:
        """Create line chart metadata from query results.
        
        Args:
            results: Query results
            user_query: Original user query
            
        Returns:
            ChartMetadata for line chart
        """
        try:
            # Extract labels and data
            labels, data = self._extract_chart_data(results)
            
            if not labels or not data:
                return None
            
            # Generate title from query
            title = self._generate_chart_title(user_query, "Trend")
            
            return ChartMetadata(
                type="line",
                data=data,
                labels=labels,
                title=title,
                x_axis_label=self._guess_x_axis_label(results),
                y_axis_label=self._guess_y_axis_label(results),
            )
        except Exception as e:
            logger.error(f"Failed to create line chart: {e}")
            return None

    def _create_pie_chart(
        self,
        results: list[dict],
        user_query: str,
    ) -> ChartMetadata | None:
        """Create pie chart metadata from query results.
        
        Args:
            results: Query results
            user_query: Original user query
            
        Returns:
            ChartMetadata for pie chart
        """
        try:
            # Extract labels and data
            labels, data = self._extract_chart_data(results)
            
            if not labels or not data:
                return None
            
            # Generate title from query
            title = self._generate_chart_title(user_query, "Distribution")
            
            return ChartMetadata(
                type="pie",
                data=data,
                labels=labels,
                title=title,
            )
        except Exception as e:
            logger.error(f"Failed to create pie chart: {e}")
            return None

    def _extract_chart_data(self, results: list[dict]) -> tuple[list[str], list[float]]:
        """Extract labels and numeric data from query results.
        
        Args:
            results: Query results
            
        Returns:
            Tuple of (labels, data)
        """
        if not results:
            return [], []
        
        labels = []
        data = []
        
        # Identify label and value columns
        first_row = results[0]
        columns = list(first_row.keys())
        
        # Find the first string column for labels
        label_column = None
        for col in columns:
            if isinstance(first_row[col], str):
                label_column = col
                break
        
        # Find the first numeric column for data
        value_column = None
        for col in columns:
            if isinstance(first_row[col], (int, float)):
                value_column = col
                break
        
        if not label_column or not value_column:
            # Fallback: use first two columns
            if len(columns) >= 2:
                label_column = columns[0]
                value_column = columns[1]
            else:
                return [], []
        
        # Extract data
        for row in results:
            label = str(row.get(label_column, ""))
            value = row.get(value_column, 0)
            
            # Convert to float
            try:
                value_float = float(value)
                labels.append(label)
                data.append(value_float)
            except (ValueError, TypeError):
                logger.warning(f"Could not convert value to float: {value}")
                continue
        
        return labels, data

    def _generate_chart_title(self, user_query: str, chart_type: str) -> str:
        """Generate a chart title from the user query.
        
        Args:
            user_query: Original user query
            chart_type: Type of chart (for fallback)
            
        Returns:
            Chart title string
        """
        # Try to extract a meaningful title from the query
        # Remove question words and clean up
        title = user_query
        
        # Remove common question words
        question_words = ["what", "show", "give", "tell", "how", "which", "who", "when", "where"]
        for word in question_words:
            title = re.sub(rf"\b{word}\b", "", title, flags=re.IGNORECASE)
        
        # Clean up
        title = title.strip()
        title = re.sub(r"\s+", " ", title)
        
        # Capitalize first letter
        if title:
            title = title[0].upper() + title[1:]
        else:
            title = chart_type
        
        # Limit length
        if len(title) > 50:
            title = title[:47] + "..."
        
        return title

    def _guess_x_axis_label(self, results: list[dict]) -> str | None:
        """Guess appropriate X-axis label from results.
        
        Args:
            results: Query results
            
        Returns:
            X-axis label or None
        """
        if not results:
            return None
        
        first_row = results[0]
        columns = list(first_row.keys())
        
        # Look for common label columns
        label_columns = ["bank", "touchpoint", "month", "environment", "date"]
        
        for col in columns:
            if col.lower() in label_columns:
                return col.replace("_", " ").title()
        
        # Default to first column
        if columns:
            return columns[0].replace("_", " ").title()
        
        return None

    def _guess_y_axis_label(self, results: list[dict]) -> str | None:
        """Guess appropriate Y-axis label from results.
        
        Args:
            results: Query results
            
        Returns:
            Y-axis label or None
        """
        if not results:
            return None
        
        first_row = results[0]
        columns = list(first_row.keys())
        
        # Look for common value columns
        value_columns = ["total_amount", "payment_count", "avg_amount", "count", "sum", "average"]
        
        for col in columns:
            if col.lower() in value_columns:
                return col.replace("_", " ").title()
        
        # Look for any numeric column
        for col in columns:
            if isinstance(first_row[col], (int, float)):
                return col.replace("_", " ").title()
        
        return None
