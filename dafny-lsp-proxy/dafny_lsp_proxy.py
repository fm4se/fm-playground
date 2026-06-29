import asyncio
import json
import uuid
import time
from typing import Dict, Any, Optional

class UserSession:
    """Represents an isolated user session with its own LSP process"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.dafny_process: Optional[asyncio.subprocess.Process] = None
        self.websocket: Optional[Any] = None
        self.message_id = 0
        self.last_activity = time.time()
        self.initialized = False
        self._lock = asyncio.Lock()

    async def start_lsp(self):
        """Start an isolated dafnyls process for this session"""
        try:
            self.dafny_process = await asyncio.create_subprocess_exec(
                "dafny",
                "server",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            # Start reading from dafnyls stdout and stderr
            asyncio.create_task(self.read_lsp_output())
            asyncio.create_task(self.read_lsp_stderr())

        except Exception as e:
            raise

    async def stop_lsp(self):
        """Stop the dafnyls process for this session"""
        if self.dafny_process:
            try:
                self.dafny_process.terminate()
                await asyncio.wait_for(self.dafny_process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.dafny_process.kill()
                await self.dafny_process.wait()
            self.dafny_process = None

    async def read_lsp_stderr(self):
        """Read stderr from dafnyls to capture error messages"""
        if not self.dafny_process:
            return

        while True:
            try:
                line = await self.dafny_process.stderr.readline()
                if not line:
                    break

                line_str = line.decode("utf-8").strip()
                if line_str:
                    pass
            except Exception as e:
                break

    async def read_lsp_output(self):
        """Read output from dafnyls and forward to the connected client"""
        if not self.dafny_process:
            return

        while True:
            try:
                line = await self.dafny_process.stdout.readline()
                if not line:
                    break

                line_str = line.decode("utf-8").strip()
                if line_str.startswith("Content-Length:"):
                    content_length = int(line_str.split(":")[1].strip())
                    # Read until empty header line
                    while True:
                        h_line = await self.dafny_process.stdout.readline()
                        if not h_line or h_line.decode("utf-8").strip() == "":
                            break
                    message_bytes = await self.dafny_process.stdout.readexactly(content_length)
                    message = json.loads(message_bytes.decode("utf-8"))
                    # Forward message to the client
                    await self.send_to_client(message)

            except json.JSONDecodeError as e:
                pass
            except Exception as e:
                break

    async def send_to_lsp(self, message: Dict[str, Any]):
        """Send a message to dafnyls"""
        if not self.dafny_process:
            raise RuntimeError(f"[Session {self.session_id}] Dafny LSP not started")

        async with self._lock:
            try:
                message_str = json.dumps(message)
                content = f"Content-Length: {len(message_str)}\r\n\r\n{message_str}"

                self.dafny_process.stdin.write(content.encode("utf-8"))
                await self.dafny_process.stdin.drain()
                self.last_activity = time.time()

            except Exception as e:
                raise

    async def send_to_client(self, message: Dict[str, Any]):
        """Send a message to the connected WebSocket client"""
        if not self.websocket:
            return

        try:
            # Handle different WebSocket types
            if hasattr(self.websocket, "send_text"):
                # FastAPI WebSocket
                await self.websocket.send_text(json.dumps(message))
            else:
                # Standard websockets library WebSocket
                await self.websocket.send(json.dumps(message))
            self.last_activity = time.time()
        except Exception as e:
            pass


class DafnyLSPProxy:
    """Multi-user LSP proxy that manages isolated sessions per user"""

    def __init__(self):
        self.sessions: Dict[str, UserSession] = {}
        self.session_timeout = 1800  # 30 minutes of inactivity
        self._cleanup_task: Optional[asyncio.Task] = None

    def create_session_id(self) -> str:
        """Generate a unique session ID"""
        return str(uuid.uuid4())

    async def create_session(self, session_id: Optional[str] = None) -> UserSession:
        """Create a new user session with an isolated LSP process"""
        if session_id is None:
            session_id = self.create_session_id()

        if session_id in self.sessions:
            return self.sessions[session_id]

        session = UserSession(session_id)
        await session.start_lsp()
        self.sessions[session_id] = session

        return session

    async def get_session(self, session_id: str) -> Optional[UserSession]:
        """Get an existing session"""
        session = self.sessions.get(session_id)
        if session:
            session.last_activity = time.time()
        return session

    async def remove_session(self, session_id: str):
        """Remove and cleanup a session"""
        session = self.sessions.pop(session_id, None)
        if session:
            await session.stop_lsp()

    async def start_cleanup_task(self):
        """Start the background task to cleanup inactive sessions"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_inactive_sessions())

    async def stop_cleanup_task(self):
        """Stop the cleanup task"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

    async def _cleanup_inactive_sessions(self):
        """Periodically cleanup inactive sessions"""
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute

                current_time = time.time()
                inactive_sessions = []

                for session_id, session in self.sessions.items():
                    if current_time - session.last_activity > self.session_timeout:
                        inactive_sessions.append(session_id)

                for session_id in inactive_sessions:
                    await self.remove_session(session_id)

            except asyncio.CancelledError:
                break
            except Exception as e:
                pass

    async def shutdown(self):
        """Shutdown all sessions and cleanup"""
        await self.stop_cleanup_task()

        # Stop all sessions
        session_ids = list(self.sessions.keys())
        for session_id in session_ids:
            await self.remove_session(session_id)

    def get_session_count(self) -> int:
        """Get the number of active sessions"""
        return len(self.sessions)

    def get_session_info(self) -> Dict[str, Any]:
        """Get information about all active sessions"""
        return {
            "total_sessions": len(self.sessions),
            "sessions": [
                {
                    "session_id": session_id,
                    "initialized": session.initialized,
                    "last_activity": session.last_activity,
                    "inactive_seconds": time.time() - session.last_activity,
                }
                for session_id, session in self.sessions.items()
            ],
        }
