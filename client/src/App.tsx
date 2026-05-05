import { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import type { Difficulty, RoomState, Player } from './types';
import Lobby from './Lobby';
import Game from './Game';

export default function App() {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Persist the active room code + display name across reconnects so we can
  // re-join automatically. These are refs (not state) because the socket's
  // 'connect' callback below reads them directly without needing re-renders.
  const sessionRef = useRef<{ code: string; name: string } | null>(null);

  useEffect(() => {
    socket.connect();

    const onConn = () => {
      setConnected(true);
      // If we had a session before the disconnect, silently rejoin the room.
      // The server preserves room state (board, mines, flags) under the room
      // code, so the player just gets a new socket id and steps back in.
      const sess = sessionRef.current;
      if (!sess) return;
      socket.emit('room:join', { code: sess.code, name: sess.name }, (res: any) => {
        if (res?.ok) {
          setMe(res.you);
          setRoom(res.state);
          setError(null);
        } else {
          // Room is gone (expired after 1h of inactivity) — fall back to lobby.
          sessionRef.current = null;
          setRoom(null);
          setMe(null);
          if (res?.error) setError(`Could not rejoin: ${res.error}`);
        }
      });
    };

    const onDisc = () => setConnected(false);

    const onState = (state: RoomState) => setRoom(state);

    const onCursor = ({ id, cursor }: { id: string; cursor: Player['cursor'] }) => {
      // Patch a single player's cursor without re-rendering the whole board state.
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) => (p.id === id ? { ...p, cursor } : p)),
        };
      });
    };

    socket.on('connect', onConn);
    socket.on('disconnect', onDisc);
    socket.on('room:state', onState);
    socket.on('cursor:update', onCursor);
    return () => {
      socket.off('connect', onConn);
      socket.off('disconnect', onDisc);
      socket.off('room:state', onState);
      socket.off('cursor:update', onCursor);
      socket.disconnect();
    };
  }, []);

  const createRoom = (name: string, difficulty: Difficulty) => {
    setError(null);
    socket.emit('room:create', { name, difficulty }, (res: any) => {
      if (!res?.ok) return setError(res?.error ?? 'Failed to create room');
      setMe(res.you);
      setRoom(res.state);
      sessionRef.current = { code: res.code, name };
    });
  };

  const joinRoom = (code: string, name: string) => {
    setError(null);
    socket.emit('room:join', { code, name }, (res: any) => {
      if (!res?.ok) return setError(res?.error ?? 'Failed to join room');
      setMe(res.you);
      setRoom(res.state);
      sessionRef.current = { code: res.code, name };
    });
  };

  const leaveRoom = () => {
    sessionRef.current = null; // prevent auto-rejoin after the bounce below
    setRoom(null);
    setMe(null);
    // Reconnect to drop server-side room membership cleanly.
    socket.disconnect();
    socket.connect();
  };

  if (!room || !me) {
    return (
      <Lobby
        connected={connected}
        error={error}
        onCreate={createRoom}
        onJoin={joinRoom}
      />
    );
  }
  return <Game room={room} me={me} connected={connected} onLeave={leaveRoom} />;
}
