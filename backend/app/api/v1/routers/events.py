"""
Server-Sent Events (SSE) endpoint.

Clients connect to GET /api/v1/events/stream and receive push notifications
whenever a new upload session is created by any user.  The frontend uses
these events to auto-refresh the uploads list via TanStack Query cache
invalidation — no full page reload required.
"""

import asyncio
import json
from asyncio import Queue
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.v1.dependencies.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/events", tags=["Events"])

# In-memory registry of connected client queues.
# This works correctly for a single-process deployment (Uvicorn with 1 worker).
# For multi-worker deployments, replace with Redis pub/sub.
_subscribers: set[Queue] = set()


async def _stream(queue: Queue) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted lines from the queue; send keepalives every 25 s."""
    _subscribers.add(queue)
    try:
        while True:
            try:
                payload: str = await asyncio.wait_for(queue.get(), timeout=25.0)
                yield f"data: {payload}\n\n"
            except asyncio.TimeoutError:
                # SSE comment — keeps the HTTP connection alive through proxies
                yield ": keepalive\n\n"
    finally:
        _subscribers.discard(queue)


async def broadcast_new_upload(session_id: str, file_name: str) -> None:
    """
    Call this after a new UploadSession is persisted.
    Pushes a 'new_upload' event to every connected SSE client.
    """
    payload = json.dumps(
        {"type": "new_upload", "session_id": session_id, "file_name": file_name}
    )
    for q in list(_subscribers):
        await q.put(payload)


async def broadcast_upload_progress(
    session_id: str, file_name: str, processed: int, total: int
) -> None:
    """Push upload progress to SSE clients (called during batch inserts)."""
    payload = json.dumps(
        {
            "type": "upload_progress",
            "session_id": session_id,
            "file_name": file_name,
            "processed": processed,
            "total": total,
        }
    )
    for q in list(_subscribers):
        await q.put(payload)


@router.get("/stream")
async def event_stream(
    _current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    SSE stream that pushes upload-lifecycle events to authenticated clients.

    The browser fetches this with:
        fetch('/api/v1/events/stream', { headers: { Authorization: 'Bearer …' } })
    and reads the body as a ReadableStream, which lets us pass the JWT in a
    header (unlike the native EventSource API which does not support headers).
    """
    queue: Queue = asyncio.Queue()
    return StreamingResponse(
        _stream(queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable Nginx response buffering
        },
    )
