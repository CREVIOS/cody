'use client'
import '@xterm/xterm/css/xterm.css';
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  X, 
  Maximize2, 
  Minimize2, 
  Terminal,
  Plus,
  Settings,
  Search,
  RefreshCw,
  Download,
  Upload,
  Monitor,
  Wifi,
  WifiOff,
  Activity,
  AlertCircle
} from "lucide-react";

// Terminal session interface
interface TerminalSession {
  id: string;
  terminal: any;
  fitAddon: any;
  searchAddon: any;
  ws: WebSocket | null;
  title: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: Date;
  pid?: number;
  serverSessionId?: string; // Added for backend synchronization
  pendingOutput: string; // Added for buffering output
}

interface EnhancedTerminalProps {
  projectId: string;
  onClose?: () => void;
  theme?: 'dark' | 'light';
  className?: string;
}

export default function EnhancedTerminal({ 
  projectId, 
  onClose, 
  theme = 'dark',
  className = '' 
}: EnhancedTerminalProps) {
  // Single terminal instance - no multiple sessions
  const [terminal, setTerminal] = useState<any>(null);
  const [fitAddon, setFitAddon] = useState<any>(null);
  const [searchAddon, setSearchAddon] = useState<any>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [isTerminalMounted, setIsTerminalMounted] = useState(false);
  const [pendingOutput, setPendingOutput] = useState('');
  
  // Other state
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [connectionStats, setConnectionStats] = useState({
    connected: false,
    latency: 0,
    lastPing: null as Date | null
  });
  const [sshInfo, setSshInfo] = useState<{
    host: string;
    port: number;
    user: string;
  } | null>(null);

  const [debugLogs, setDebugLogs] = useState<Array<{timestamp: string, message: string, type: string}>>([]);

  // Refs
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  
  // Configuration
  const wsConfig = useMemo(() => {
    const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
    const cleanBase = baseUrl.replace(/\/$/, '');
    const fullUrl = `${cleanBase}/?type=terminal&projectId=${encodeURIComponent(projectId)}`;
    
    return {
      baseUrl: cleanBase,
      fullUrl,
      httpUrl: cleanBase.replace('ws://', 'http://').replace('wss://', 'https://')
    };
  }, [projectId]);

  const addDebugLog = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-50), { timestamp, message, type }]);
    console.log(`[Terminal ${type.toUpperCase()}] ${message}`);
  }, []);
  
  // Terminal themes
  const terminalThemes = useMemo(() => ({
    dark: {
      background: '#0d1117',
      foreground: '#f0f6fc',
      cursor: '#58a6ff',
      cursorAccent: '#0d1117',
      selection: 'rgba(88, 166, 255, 0.3)',
      black: '#484f58',
      red: '#ff7b72',
      green: '#7ce38b',
      yellow: '#ffa657',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#ffdf5d',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    },
    light: {
      background: '#ffffff',
      foreground: '#24292f',
      cursor: '#0969da',
      cursorAccent: '#ffffff',
      selection: 'rgba(9, 105, 218, 0.3)',
      black: '#24292f',
      red: '#cf222e',
      green: '#116329',
      yellow: '#4d2d00',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#1b7c83',
      white: '#6e7781',
      brightBlack: '#656d76',
      brightRed: '#a40e26',
      brightGreen: '#1a7f37',
      brightYellow: '#633c01',
      brightBlue: '#218bff',
      brightMagenta: '#a475f9',
      brightCyan: '#3192aa',
      brightWhite: '#8c959f'
    }
  }), []);

  const [currentTheme, setCurrentTheme] = useState<keyof typeof terminalThemes>('dark');

  // Initialize terminal once
  useEffect(() => {
    if (mountedRef.current || !projectId) return;
    mountedRef.current = true;
    
    addDebugLog('Initializing terminal...', 'info');
    
    const initializeTerminal = async () => {
      try {
        // Import xterm libraries
      const [
        { Terminal }, 
        { FitAddon }, 
        { WebLinksAddon }, 
        { SearchAddon },
        { WebglAddon }
      ] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
        import('@xterm/addon-search'),
        import('@xterm/addon-webgl')
      ]);
    
        // Create terminal
        const terminalInstance = new Terminal({
        theme: terminalThemes[currentTheme],
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "Liberation Mono", monospace',
        fontWeight: 400,
        fontWeightBold: 600,
        lineHeight: 1.2,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: 'block',
        cursorWidth: 1,
        scrollback: 10000,
        tabStopWidth: 4,
        macOptionIsMeta: true,
        rightClickSelectsWord: true,
        windowsMode: navigator.platform.includes('Win'),
        allowProposedApi: true,
        smoothScrollDuration: 150,
        fastScrollModifier: 'alt',
        fastScrollSensitivity: 5,
        scrollSensitivity: 3,
          convertEol: true,
          disableStdin: false,
          logLevel: 'warn',
          allowTransparency: false
      });

      // Create addons
        const fitAddonInstance = new FitAddon();
      const webLinksAddon = new WebLinksAddon((event, uri) => {
        window.open(uri, '_blank');
      });
        const searchAddonInstance = new SearchAddon();
      
        // Load addons
        terminalInstance.loadAddon(fitAddonInstance);
        terminalInstance.loadAddon(webLinksAddon);
        terminalInstance.loadAddon(searchAddonInstance);
        
        try {
          const webglAddon = new WebglAddon();
          terminalInstance.loadAddon(webglAddon);
        addDebugLog('WebGL renderer enabled', 'success');
      } catch (error) {
        addDebugLog('WebGL not available, using canvas renderer', 'warning');
      }
      
        // Store terminal reference for later use
        (terminalInstance as any)._needsInputSetup = true;

        // Set state
        setTerminal(terminalInstance);
        setFitAddon(fitAddonInstance);
        setSearchAddon(searchAddonInstance);
        
        addDebugLog('Terminal created successfully', 'success');
        
        // Mount terminal to DOM
        if (terminalContainerRef.current) {
          terminalInstance.open(terminalContainerRef.current);
          fitAddonInstance.fit();
          terminalInstance.focus();
          setIsTerminalMounted(true);
          addDebugLog('Terminal mounted to DOM', 'success');
          
          // Set up basic input handlers immediately for testing
          terminalInstance.onData((data) => {
            addDebugLog(`Terminal received input: ${JSON.stringify(data)}`, 'info');
            // Will be overridden when WebSocket connects
          });
        }
        
        // Connect WebSocket
        connectWebSocket(terminalInstance, fitAddonInstance);
        
      } catch (error) {
        addDebugLog(`Failed to initialize terminal: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
          }
    };

    initializeTerminal();

    // Cleanup on unmount
    return () => {
      if (terminal) {
        terminal.dispose();
      }
      if (ws) {
        ws.close();
      }
    };
  }, [projectId]); // Only depend on projectId

  // WebSocket connection
  const connectWebSocket = useCallback((term: any, fit: any) => {
    if (ws) {
      ws.close();
    }
    
    addDebugLog(`Connecting to WebSocket: ${wsConfig.fullUrl}`, 'info');
    setConnectionStatus('connecting');
    
    const websocket = new WebSocket(wsConfig.fullUrl);
    
    websocket.onopen = () => {
      addDebugLog('WebSocket connected', 'success');
      setConnectionStatus('connected');
      setWs(websocket);
        };

    websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
        addDebugLog(`Received WebSocket message: ${message.type}`, 'info');
            
            switch (message.type) {
              case 'session:created':
            sessionIdRef.current = message.sessionId;
            addDebugLog(`Session created: ${message.sessionId}`, 'success');
            
            // Debug the state
            addDebugLog(`Terminal exists: ${!!term}, needs setup: ${!!(term as any)?._needsInputSetup}`, 'info');
            
            // Set up input handlers now that we have a session and WebSocket
            if (term) {
              addDebugLog('Setting up terminal input handlers', 'info');
              
              // Clear any existing handlers
              term.onData(() => {});
              
              // Set up proper input handler
              term.onData((data: string) => {
                addDebugLog(`Sending input: ${JSON.stringify(data)}`, 'info');
                if (websocket && websocket.readyState === WebSocket.OPEN && sessionIdRef.current) {
                  websocket.send(JSON.stringify({
                    type: 'terminal:input',
                    sessionId: sessionIdRef.current,
                    data: btoa(String.fromCharCode(...new TextEncoder().encode(data))),
                  }));
                } else {
                  addDebugLog('Cannot send input: WebSocket not ready', 'warning');
            }
              });

              // Set up resize handler
              term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
                if (websocket && websocket.readyState === WebSocket.OPEN && sessionIdRef.current) {
                  websocket.send(JSON.stringify({
                    type: 'terminal:resize',
                    sessionId: sessionIdRef.current,
                    cols,
                    rows
                  }));
                }
              });
              
              (term as any)._needsInputSetup = false;
              addDebugLog('Terminal input handlers set up successfully', 'success');
            } else {
              addDebugLog('Cannot set up input handlers: terminal not available', 'error');
            }
            
            // Send initial resize
            if (term && fit) {
              fit.fit();
              websocket.send(JSON.stringify({
                type: 'terminal:resize',
                sessionId: message.sessionId,
                cols: term.cols,
                rows: term.rows
              }));
            }
            break;
            
          case 'terminal:output':
            try {
              const binaryStr = atob(message.data);
              const bytes = Uint8Array.from(binaryStr, ch => ch.charCodeAt(0));
              const data = new TextDecoder('utf-8').decode(bytes);
            
              // Set up input handlers if not already done (fallback)
              if (term && !sessionIdRef.current) {
                // Extract session ID from the message
                const sessionId = message.sessionId || 'extracted-session';
                sessionIdRef.current = sessionId;
                
                addDebugLog('Setting up input handlers (fallback from terminal:output)', 'info');
                
                // Clear any existing handlers
                term.onData(() => {});
                
                term.onData((inputData: string) => {
                  addDebugLog(`Sending input: ${JSON.stringify(inputData)}`, 'info');
                  if (websocket && websocket.readyState === WebSocket.OPEN && sessionIdRef.current) {
                    websocket.send(JSON.stringify({
      type: 'terminal:input',
                      sessionId: sessionIdRef.current,
                      data: btoa(String.fromCharCode(...new TextEncoder().encode(inputData))),
    }));
                  } else {
                    addDebugLog('Cannot send input: WebSocket not ready or no session ID', 'warning');
  }
});

                // Set up resize handler
                term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
                  if (websocket && websocket.readyState === WebSocket.OPEN && sessionIdRef.current) {
                    websocket.send(JSON.stringify({
      type: 'terminal:resize',
                      sessionId: sessionIdRef.current,
      cols,
      rows
    }));
                  }
                });
                
                addDebugLog(`Input handlers set up successfully (fallback) with session: ${sessionId}`, 'success');
  }
              
              if (isTerminalMounted && term) {
                term.write(data);
              } else {
                setPendingOutput(prev => prev + data);
                addDebugLog(`Buffering output: ${data.length} chars`, 'info');
              }
            } catch (error) {
              addDebugLog(`Error processing output: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            }
            break;
            
          case 'error':
            addDebugLog(`Server error: ${message.message}`, 'error');
            if (term) {
              term.write(`\r\n\x1b[31m❌ Error: ${message.message}\x1b[0m\r\n`);
            }
            break;
        }
    } catch (error) {
        addDebugLog(`Error parsing message: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      }
    };
    
    websocket.onerror = () => {
      addDebugLog('WebSocket error', 'error');
      setConnectionStatus('error');
    };
    
    websocket.onclose = () => {
      addDebugLog('WebSocket closed', 'warning');
      setConnectionStatus('disconnected');
      setWs(null);
      sessionIdRef.current = null;
    };
    
  }, [wsConfig.fullUrl, isTerminalMounted, addDebugLog]);

  // Fetch SSH info
  const fetchSshInfo = useCallback(async () => {
    try {
      const response = await fetch(`${wsConfig.httpUrl}/api/projects/${projectId}/container/ssh`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSshInfo(data);
          addDebugLog(`SSH available: ${data.user}@${data.host}:${data.port}`, 'success');
        }
      }
    } catch (error) {
      addDebugLog(`Failed to fetch SSH info: ${error instanceof Error ? error.message : 'Unknown error'}`, 'warning');
    }
  }, [wsConfig.httpUrl, projectId, addDebugLog]);

  // Fetch SSH info when connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      setTimeout(fetchSshInfo, 1000);
    }
  }, [connectionStatus, fetchSshInfo]);

  // Flush buffered output when terminal becomes mounted
  useEffect(() => {
    if (isTerminalMounted && terminal && pendingOutput) {
      addDebugLog(`Flushing ${pendingOutput.length} chars of buffered output`, 'info');
      terminal.write(pendingOutput);
      setPendingOutput('');
    }
  }, [isTerminalMounted, terminal, pendingOutput, addDebugLog]);

  // Update theme
  useEffect(() => {
    if (terminal) {
      terminal.options.theme = terminalThemes[currentTheme];
    }
  }, [currentTheme, terminal, terminalThemes]);

  // SSH functions
  const copySshCommand = useCallback(async () => {
    if (!sshInfo) return;
    const sshCommand = `ssh ${sshInfo.user}@${sshInfo.host} -p ${sshInfo.port}`;
    try {
      await navigator.clipboard.writeText(sshCommand);
      addDebugLog('SSH command copied to clipboard', 'success');
    } catch (error) {
      addDebugLog('Failed to copy SSH command', 'error');
    }
  }, [sshInfo, addDebugLog]);

  const openSshTerminal = useCallback(async () => {
    if (!sshInfo) return;
    const sshCommand = `ssh ${sshInfo.user}@${sshInfo.host} -p ${sshInfo.port}`;
    
    try {
      if (navigator.platform.includes('Mac')) {
        const response = await fetch(`${wsConfig.httpUrl}/api/projects/${projectId}/container/ssh/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: sshCommand })
        });
        
        if (response.ok) {
          addDebugLog('SSH terminal opened', 'success');
        } else {
          throw new Error('Failed to open SSH terminal');
    }
      } else {
        await navigator.clipboard.writeText(sshCommand);
        addDebugLog('SSH command copied - paste in your terminal', 'info');
      }
    } catch (error) {
      addDebugLog(`Failed to open SSH terminal: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }, [sshInfo, wsConfig.httpUrl, projectId, addDebugLog]);

  // Search functionality
  const handleSearch = useCallback((term: string, direction: 'next' | 'previous' = 'next') => {
    if (searchAddon && term) {
      try {
        if (direction === 'next') {
          searchAddon.findNext(term, { caseSensitive: false });
        } else {
          searchAddon.findPrevious(term, { caseSensitive: false });
        }
      } catch (error) {
        addDebugLog(`Search error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      }
    }
  }, [searchAddon, addDebugLog]);

  // File upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !ws || !sessionIdRef.current) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      ws.send(JSON.stringify({
          type: 'file:upload',
        sessionId: sessionIdRef.current,
          filename: file.name,
          content: btoa(content)
        }));
        addDebugLog(`File uploaded: ${file.name}`, 'success');
    };
    reader.readAsBinaryString(file);
    event.target.value = '';
  }, [ws, addDebugLog]);

  // Status indicator
  const getStatusIndicator = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="w-3 h-3 text-green-500" />;
      case 'connecting':
        return <RefreshCw className="w-3 h-3 text-yellow-500 animate-spin" />;
      case 'disconnected':
        return <WifiOff className="w-3 h-3 text-orange-500" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Monitor className="w-3 h-3 text-gray-500" />;
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-gray-900 text-gray-100 ${
        isMaximized ? 'fixed inset-0 z-50' : ''
      } ${className}`}
      style={{
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Terminal size={18} className="text-green-500" />
          <span className="text-sm font-semibold">Terminal</span>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-2">
            {connectionStats.connected ? (
              <>
                <Activity className="w-3 h-3 text-green-500" />
                <span>{connectionStats.latency}ms</span>
              </>
            ) : (
              <WifiOff className="w-3 h-3 text-red-500" />
            )}
          </div>
            {sshInfo && (
              <div className="flex items-center gap-2">
            <button
                  onClick={openSshTerminal}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-600 hover:bg-green-700 text-white transition-colors"
                  title="Open SSH terminal (like Replit)"
            >
                  <span>🚀</span>
                  <span>SSH Terminal</span>
            </button>
        <button
                  onClick={copySshCommand}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  title="Copy SSH command to clipboard"
        >
                  <span>🔑</span>
                  <span>Port: {sshInfo.port}</span>
        </button>
              </div>
            )}
          </div>
      </div>

        {/* Tabs */}
       
        <div className="flex-1 flex items-center gap-1 mx-6">
          {/* Single tab display */}
          <div className="px-3 py-1.5 text-xs rounded-md flex items-center gap-2 bg-gray-700 text-white">
            {getStatusIndicator()}
            <span>Terminal</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-1.5 rounded-md hover:bg-gray-700 transition-colors ${
              showSearch ? 'bg-gray-700' : ''
            }`}
            title="Search (Ctrl+Shift+F)"
          >
            <Search size={16} />
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
            title="Upload File"
          >
            <Upload size={16} />
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-md hover:bg-gray-700 transition-colors ${
              showSettings ? 'bg-gray-700' : ''
            }`}
            title="Settings"
          >
            <Settings size={16} />
          </button>
          
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-red-600 transition-colors"
              title="Close Terminal"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search terminal output..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                handleSearch(e.target.value);
              }}
              className="flex-1 px-3 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded-md focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch(searchTerm, e.shiftKey ? 'previous' : 'next');
                } else if (e.key === 'Escape') {
                  setShowSearch(false);
                  setSearchTerm('');
                }
              }}
              autoFocus
            />
            <button
              onClick={() => handleSearch(searchTerm, 'previous')}
              className="p-1.5 rounded-md hover:bg-gray-700"
              title="Previous"
            >
              ↑
            </button>
            <button
              onClick={() => handleSearch(searchTerm, 'next')}
              className="p-1.5 rounded-md hover:bg-gray-700"
              title="Next"
            >
              ↓
            </button>
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchTerm('');
              }}
              className="p-1.5 rounded-md hover:bg-gray-700"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="font-medium mb-2 block">Theme:</label>
              <select
                value={currentTheme}
                onChange={(e) => setCurrentTheme(e.target.value as keyof typeof terminalThemes)}
                className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded-md"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
            <div>
              <label className="font-medium mb-2 block">Connection:</label>
              <div className="text-xs text-gray-400">
                <div>URL: {wsConfig.fullUrl}</div>
                <div>Project: {projectId}</div>
                <div>Status: {connectionStatus}</div>
                {sshInfo && (
                  <div className="mt-2 p-2 bg-gray-800 rounded border">
                    <div className="font-medium text-green-400 mb-1">SSH Access:</div>
                    <div>Host: {sshInfo.host}</div>
                    <div>Port: {sshInfo.port}</div>
                    <div>User: {sshInfo.user}</div>
                    <div className="mt-1 font-mono text-xs text-blue-400">
                      ssh {sshInfo.user}@{sshInfo.host} -p {sshInfo.port}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Debug logs */}
          <div className="mt-4">
            <label className="font-medium mb-2 block">Debug Logs (last 10):</label>
            <div className="bg-gray-900 rounded border border-gray-600 p-2 h-32 overflow-y-auto text-xs font-mono">
              {debugLogs.slice(-10).map((log, index) => (
                <div key={index} className={`mb-1 ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  log.type === 'success' ? 'text-green-400' :
                  'text-gray-300'
                }`}>
                  <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Terminal container */}
      <div
  ref={terminalContainerRef}
        className="flex-1 overflow-hidden min-h-0"
  style={{ backgroundColor: terminalThemes[currentTheme].background }}
        onClick={() => {
          if (terminal) {
            terminal.focus();
          }
        }}
/>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 text-xs bg-gray-800 border-t border-gray-700">
        <div className="flex items-center gap-4">
          {terminal && (
            <>
              <span className="text-gray-400">
                {terminal.cols}×{terminal.rows}
              </span>
              <span className={`flex items-center gap-1 ${
                connectionStatus === 'connected' ? 'text-green-400' : 
                connectionStatus === 'connecting' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {getStatusIndicator()}
                {connectionStatus}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4 text-gray-400">
          <span>Project: {projectId}</span>
          {connectionStats.connected && (
            <span>Ping: {connectionStats.latency}ms</span>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
}