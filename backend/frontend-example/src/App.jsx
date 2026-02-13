import { useState, useEffect, useCallback, useRef } from 'react';
import { Excalidraw, getSceneVersion } from '@excalidraw/excalidraw';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:5000`;
const ROOM_ID = window.location.pathname.split('/').pop() || 'default-room';

const generateUsername = () => `User_${Math.floor(Math.random() * 1000)}`;
const generateColor = () => `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;

function App() {
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [users, setUsers] = useState([]);
  const [currentUser] = useState({ username: generateUsername(), color: generateColor() });
  
  const isInitialized = useRef(false);
  const lastSceneVersion = useRef(0);
  const updateTimeout = useRef(null);

  useEffect(() => {
    const newSocket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });

    newSocket.on('connect', () => {
      console.log('socket connected:', newSocket.id);
      setConnectionStatus('connected');
    });


    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      setConnectionStatus('error');
    });

    newSocket.on('disconnect', () => setConnectionStatus('disconnected'));
    
    setSocket(newSocket);
    return () => newSocket.close();
  }, [currentUser]);

  useEffect(() => {
    if (!socket || !excalidrawAPI) return;

    const applyUpdate = (elements, appState, files, source) => {
      const remoteVersion = getSceneVersion(elements || []);
      console.log(`[${source}] Current local: v${lastSceneVersion.current}, Inbound: v${remoteVersion}`);
      
      if (remoteVersion <= lastSceneVersion.current) return;

      console.log(`Applying v${remoteVersion} from ${source}`);
      lastSceneVersion.current = remoteVersion;

      const zoomValue = typeof appState?.zoom === 'object' ? appState.zoom.value : appState?.zoom;
      const safeZoom = (isNaN(zoomValue) || zoomValue <= 0) ? 1 : zoomValue;

      excalidrawAPI.updateScene({
        elements: elements || [],
        appState: { 
          ...appState, 
          zoom: { value: safeZoom } 
        }
      });
      if (files) excalidrawAPI.addFiles(Object.values(files));
    };

    socket.on('scene-init', (data) => {
      console.log('scene-init received');
      applyUpdate(data.elements, data.appState, data.files, 'INIT');
      isInitialized.current = true;
      if (data.users) setUsers(data.users.filter(u => u.socketId !== socket.id));
    });

    // Join room AFTER listeners are attached
    console.log('emitting join-room for:', ROOM_ID);
    socket.emit('join-room', { roomId: ROOM_ID, user: currentUser });

    return () => {
      socket.off('scene-init');
      socket.off('scene-update');
      socket.off('pointer-update');
      socket.off('user-joined');
      socket.off('user-left');
    };
  }, [socket, excalidrawAPI]);

  const lastEmittedVersion = useRef(-1);

  const handleChange = useCallback((elements, appState, files) => {
    if (!elements) return;
    
    const currentVersion = getSceneVersion(elements);
    console.log(`[DEBUG] onChange triggered. Version: ${currentVersion}, Elements: ${elements.length}`);

    if (!socket) {
      console.warn('[DEBUG] No socket available for sync');
      return;
    }

    // Debounce
    if (updateTimeout.current) clearTimeout(updateTimeout.current);

    updateTimeout.current = setTimeout(() => {
      // Version check inside timeout to ensure we don't send old states
      if (currentVersion <= lastEmittedVersion.current) {
        console.log(`[DEBUG] Skipping emit (v${currentVersion} <= v${lastEmittedVersion.current})`);
        return;
      }

      console.log(`📤 [DEBUG] EMITTING v${currentVersion} (${elements.length} elements)`);
      lastEmittedVersion.current = currentVersion;
      lastSceneVersion.current = currentVersion;

      const zoomValue = typeof appState.zoom === 'object' ? appState.zoom.value : appState.zoom;
      const safeZoom = (isNaN(zoomValue) || zoomValue <= 0) ? 1 : zoomValue;

      socket.emit('scene-update', {
        elements: elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          scrollX: isNaN(appState.scrollX) ? 0 : appState.scrollX,
          scrollY: isNaN(appState.scrollY) ? 0 : appState.scrollY,
          zoom: { value: safeZoom }
        },
        files: files || {}
      }, (ack) => {
        console.log(`[DEBUG] Server acknowledged emission:`, ack);
      });
    }, 200);
  }, [socket]);

  const forceSync = () => {
    if (!excalidrawAPI || !socket) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();
    
    console.log(' [DEBUG] FORCE SYNC TRIGGERED');
    socket.emit('scene-update', {
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom
      },
      files
    });
  };

  const handlePointerUpdate = useCallback((payload) => {
    if (!socket || !payload.pointer) return;
    socket.emit('pointer-update', {
      x: payload.pointer.x,
      y: payload.pointer.y,
      tool: payload.pointer.tool,
      button: payload.button,
      username: currentUser.username,
      color: currentUser.color
    });
  }, [socket, currentUser]);

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw', background: '#f8f9fa' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 10 }}>
        <div className="connection-status" style={{ pointerEvents: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className={`status-indicator ${connectionStatus}`}></span>
            <span>{connectionStatus === 'connected' ? 'Live Sync' : 'Connecting...'}</span>
          </div>
          <button 
            onClick={forceSync}
            style={{ 
              background: '#4c6ef5', 
              color: 'white', 
              border: 'none', 
              padding: '4px 8px', 
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            Force Sync
          </button>
        </div>

        {users.length > 0 && (
          <div className="users-list" style={{ pointerEvents: 'auto' }}>
            <div className="users-title">Friends ({users.length})</div>
            {users.map(user => (
              <div key={user.socketId} className="user-item">
                <div className="user-color" style={{ backgroundColor: user.color || '#ccc' }} />
                <span>{user.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ height: '100%', width: '100%' }}>
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          onChange={handleChange}
          onPointerUpdate={handlePointerUpdate}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: true
            }
          }}
        />
      </div>
    </div>
  );
}

export default App;





