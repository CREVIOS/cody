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
import { useActiveUserId } from "@/hooks/useActiveUserId";
import { getWsBaseUrl } from "@/lib/config/endpoints";

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
  // Get active user ID for authentication
  const activeUserId = useActiveUserId();
  
  // Single terminal instance - no multiple sessions
  const [terminal, setTerminal] = useState<any>(null);
  const [fitAddon, setFitAddon] = useState<any>(null);
  const [searchAddon, setSearchAddon] = useState<any>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [isTerminalMounted, setIsTerminalMounted] = useState(false);
  const [pendingOutput, setPendingOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const connectionAttemptsRef = useRef<number>(0);
  const lastConnectionErrorRef = useRef<string | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  
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
    const baseUrl = getWsBaseUrl();
    const cleanBase = baseUrl.replace(/\/$/, '');
    const url = new URL(`${cleanBase}/`);
    url.searchParams.set('type', 'terminal');
    url.searchParams.set('projectId', projectId);
    if (activeUserId) {
      url.searchParams.set('userId', activeUserId);
    }
    const fullUrl = url.toString();
    
    return {
      baseUrl: cleanBase,
      fullUrl,
      httpUrl: cleanBase.replace('ws://', 'http://').replace('wss://', 'https://')
    };
  }, [projectId, activeUserId]);

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
          allowTransparency: false,
          // Disable bracketed paste mode to fix ls output issues
          ignoreBracketedPasteMode: true
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
        
        // Don't connect here - let the reconnect useEffect handle it when activeUserId is available
        if (!activeUserId) {
          addDebugLog('Terminal initialized but waiting for user ID...', 'warning');
        }
        
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
  }, [projectId]); // Initialize terminal when projectId changes

  // WebSocket connection
  const connectWebSocket = useCallback((term: any, fit: any) => {
    // Don't connect if no user ID (for authentication)
    if (!activeUserId) {
      addDebugLog('Cannot connect: user ID not available', 'warning');
      return;
    }
    
    // Prevent duplicate connections
    if (isConnectingRef.current) {
      addDebugLog('WebSocket connection already in progress, skipping...', 'info');
      return;
    }
    
    // Prevent infinite retry loop on auth errors
    if (lastConnectionErrorRef.current === 'AUTH_REQUIRED' && connectionAttemptsRef.current >= 3) {
      addDebugLog('Too many auth failures, stopping connection attempts', 'error');
      setError('Authentication failed. Please check your user session.');
      return;
    }
    
    // Prevent duplicate connections
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      addDebugLog('WebSocket already connecting/connected, skipping...', 'info');
      return;
    }
    
    // Close existing connection if any (but not connecting/open)
    if (ws) {
      ws.close();
      setWs(null);
    }
    
    isConnectingRef.current = true;
    connectionAttemptsRef.current += 1;
    
    // Build URL with userId
    const baseUrl = getWsBaseUrl();
    const cleanBase = baseUrl.replace(/\/$/, '');
    
    // Ensure we have a valid base URL
    let wsBaseUrl: string;
    if (cleanBase.startsWith('ws://') || cleanBase.startsWith('wss://')) {
      wsBaseUrl = cleanBase;
    } else {
      wsBaseUrl = `ws://${cleanBase}`;
    }
    
    const url = new URL(wsBaseUrl);
    url.searchParams.set('type', 'terminal');
    url.searchParams.set('projectId', projectId);
    url.searchParams.set('userId', activeUserId);
    const fullUrl = url.toString();
    
    addDebugLog(`Connecting to WebSocket: ${fullUrl}`, 'info');
    addDebugLog(`User ID: ${activeUserId}`, 'info');
    addDebugLog(`Base URL: ${wsBaseUrl}`, 'info');
    setConnectionStatus('connecting');
    
    const websocket = new WebSocket(fullUrl);
    
    websocket.onopen = () => {
      addDebugLog('WebSocket connected', 'success');
      setConnectionStatus('connected');
      setWs(websocket);
      isConnectingRef.current = false;
      connectionAttemptsRef.current = 0; // Reset on successful connection
      lastConnectionErrorRef.current = null;
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
            if (message.code === 'AUTH_REQUIRED') {
              lastConnectionErrorRef.current = 'AUTH_REQUIRED';
              addDebugLog('Authentication error - stopping reconnection attempts', 'error');
            }
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
    
    websocket.onclose = (event) => {
      addDebugLog(`WebSocket closed: code=${event.code}, reason=${event.reason}`, 'warning');
      setConnectionStatus('disconnected');
      setWs(null);
      sessionIdRef.current = null;
      isConnectingRef.current = false;
      
      // Don't auto-reconnect on auth errors (code 1008)
      if (event.code === 1008 && event.reason === 'Authentication required') {
        lastConnectionErrorRef.current = 'AUTH_REQUIRED';
        addDebugLog('Authentication failed - not reconnecting', 'error');
        return;
      }
    };
    
  }, [activeUserId, projectId, ws, addDebugLog]);

  // Reconnect WebSocket when activeUserId becomes available (only if not already connected and no auth error)
  useEffect(() => {
    // Don't reconnect if we have an auth error
    if (lastConnectionErrorRef.current === 'AUTH_REQUIRED') {
      return;
    }
    
    // Don't reconnect if already connecting
    if (isConnectingRef.current) {
      return;
    }
    
    if (activeUserId && terminal && (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
      // Limit connection attempts
      if (connectionAttemptsRef.current >= 3) {
        addDebugLog('Max connection attempts reached, stopping...', 'error');
        return;
      }
      
      addDebugLog('User ID now available, connecting WebSocket...', 'info');
      // Small delay to prevent rapid reconnections
      const timeoutId = setTimeout(() => {
        connectWebSocket(terminal, fitAddon);
      }, 500); // Increased delay to prevent rapid reconnections
      return () => clearTimeout(timeoutId);
    }
  }, [activeUserId, terminal, ws, fitAddon, connectWebSocket]);

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

  // Refit terminal on container resize (e.g., sidebar width changes or height drag)
  useEffect(() => {
    if (!terminalContainerRef.current || !fitAddon) return;

    const container = terminalContainerRef.current;
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        // ignore fit errors during rapid resize
      }
    });

    observer.observe(container);

    // Also refit on window resize as a fallback
    const handleWindowResize = () => {
      try {
        fitAddon.fit();
      } catch {}
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [fitAddon]);

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
      className={`flex flex-col h-full ${
        theme === 'dark' ? 'bg-[#1e1e1e] text-[#cccccc]' : 'bg-[#ffffff] text-[#333333]'
      } ${isMaximized ? 'fixed inset-0 z-50' : ''} ${className}`}
      style={{
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace'
      }}
    >
      {/* Header - VSCode style */}
      <div className={`flex items-center justify-between px-3 py-1.5 shrink-0 ${
        theme === 'dark' 
          ? 'bg-[#252526] border-b border-[#3e3e42]' 
          : 'bg-[#f3f3f3] border-b border-[#e5e5e5]'
      }`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Tabs */}
          <div className="flex items-center gap-1 min-w-0">
            {/* Single tab display - VSCode style */}
            <div className={`px-3 py-1.5 text-xs flex items-center gap-2 transition-colors duration-150 ${
              theme === 'dark'
                ? 'bg-[#1e1e1e] text-[#ffffff] border-t-2 border-t-[#007acc]'
                : 'bg-[#ffffff] text-[#333333] border-t-2 border-t-[#007acc]'
            }`}>
              {getStatusIndicator()}
              <span className="truncate">Terminal</span>
            </div>
          </div>

          {/* Connection info */}
          <div className="flex items-center gap-3 ml-4 text-xs opacity-70">
            {connectionStats.connected ? (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                <span className="text-[10px]">{connectionStats.latency}ms</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                <span className="text-[10px]">Disconnected</span>
              </div>
            )}
            {sshInfo && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={copySshCommand}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors duration-150 ${
                    theme === 'dark'
                      ? 'bg-[#2d2d30] hover:bg-[#3e3e42] text-[#cccccc]'
                      : 'bg-[#e5e5e5] hover:bg-[#d1d1d1] text-[#333333]'
                  }`}
                  title="Copy SSH command to clipboard"
                >
                  Port: {sshInfo.port}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 ml-2 shrink-0">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-1.5 rounded transition-colors duration-150 ${
              showSearch 
                ? (theme === 'dark' ? 'bg-[#3e3e42] text-[#ffffff]' : 'bg-[#e5e5e5] text-[#333333]')
                : (theme === 'dark' ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-[#ececec] text-[#616161]')
            }`}
            title="Search (Ctrl+Shift+F)"
          >
            <Search size={14} />
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`p-1.5 rounded transition-colors duration-150 ${
              theme === 'dark' ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-[#ececec] text-[#616161]'
            }`}
            title="Upload File"
          >
            <Upload size={14} />
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded transition-colors duration-150 ${
              showSettings 
                ? (theme === 'dark' ? 'bg-[#3e3e42] text-[#ffffff]' : 'bg-[#e5e5e5] text-[#333333]')
                : (theme === 'dark' ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-[#ececec] text-[#616161]')
            }`}
            title="Settings"
          >
            <Settings size={14} />
          </button>
          
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className={`p-1.5 rounded transition-colors duration-150 ${
              theme === 'dark' ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-[#ececec] text-[#616161]'
            }`}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          
          {onClose && (
            <button
              onClick={onClose}
              className={`p-1.5 rounded transition-colors duration-150 ${
                theme === 'dark' ? 'hover:bg-[#e81123] text-[#ffffff]' : 'hover:bg-[#e81123] text-[#ffffff]'
              }`}
              title="Close Terminal"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar - VSCode style */}
      {showSearch && (
        <div className={`px-3 py-2 shrink-0 ${
          theme === 'dark' 
            ? 'bg-[#252526] border-b border-[#3e3e42]' 
            : 'bg-[#f3f3f3] border-b border-[#e5e5e5]'
        }`}>
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
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors duration-150 ${
                theme === 'dark'
                  ? 'bg-[#3c3c3c] border border-[#3e3e42] text-[#cccccc] placeholder-[#858585] focus:border-[#007acc]'
                  : 'bg-[#ffffff] border border-[#e5e5e5] text-[#333333] placeholder-[#858585] focus:border-[#007acc]'
              } focus:outline-none`}
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
              className={`p-1 rounded transition-colors duration-150 ${
                theme === 'dark' ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-[#ececec] text-[#616161]'
              }`}
              title="Previous"
            >
              ↑
            </button>
            <button
              onClick={() => handleSearch(searchTerm, 'next')}
              className={`p-1 rounded transition-colors duration-150 ${
                theme === 'dark' ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-[#ececec] text-[#616161]'
              }`}
              title="Next"
            >
              ↓
            </button>
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchTerm('');
              }}
              className={`p-1 rounded transition-colors duration-150 ${
                theme === 'dark' ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-[#ececec] text-[#616161]'
              }`}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Settings panel - VSCode style */}
      {showSettings && (
        <div className={`px-3 py-2 shrink-0 border-b ${
          theme === 'dark' 
            ? 'bg-[#252526] border-[#3e3e42]' 
            : 'bg-[#f3f3f3] border-[#e5e5e5]'
        }`}>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className={`font-medium mb-1.5 block ${
                theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333333]'
              }`}>Theme:</label>
              <select
                value={currentTheme}
                onChange={(e) => setCurrentTheme(e.target.value as keyof typeof terminalThemes)}
                className={`w-full px-2 py-1 text-xs rounded transition-colors duration-150 ${
                  theme === 'dark'
                    ? 'bg-[#3c3c3c] border border-[#3e3e42] text-[#cccccc]'
                    : 'bg-[#ffffff] border border-[#e5e5e5] text-[#333333]'
                } focus:outline-none focus:border-[#007acc]`}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
            <div>
              <label className={`font-medium mb-1.5 block ${
                theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333333]'
              }`}>Connection:</label>
              <div className={`text-xs ${
                theme === 'dark' ? 'text-[#969696]' : 'text-[#616161]'
              }`}>
                <div className="truncate">URL: {wsConfig.fullUrl}</div>
                <div>Project: {projectId}</div>
                <div>Status: {connectionStatus}</div>
                {sshInfo && (
                  <div className={`mt-2 p-2 rounded border ${
                    theme === 'dark'
                      ? 'bg-[#2d2d30] border-[#3e3e42]'
                      : 'bg-[#f3f3f3] border-[#e5e5e5]'
                  }`}>
                    <div className={`font-medium mb-1 ${
                      theme === 'dark' ? 'text-[#4ec9b0]' : 'text-[#007acc]'
                    }`}>SSH Access:</div>
                    <div className="space-y-0.5">
                      <div>Host: {sshInfo.host}</div>
                      <div>Port: {sshInfo.port}</div>
                      <div>User: {sshInfo.user}</div>
                    </div>
                    <div className={`mt-1 font-mono text-xs ${
                      theme === 'dark' ? 'text-[#4fc1ff]' : 'text-[#007acc]'
                    }`}>
                      ssh {sshInfo.user}@{sshInfo.host} -p {sshInfo.port}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Debug logs */}
          <div className="mt-3">
            <label className={`font-medium mb-1.5 block ${
              theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333333]'
            }`}>Debug Logs (last 10):</label>
            <div className={`rounded border p-2 h-32 overflow-y-auto text-xs font-mono scrollbar-thin ${
              theme === 'dark'
                ? 'bg-[#1e1e1e] border-[#3e3e42]'
                : 'bg-[#ffffff] border-[#e5e5e5]'
            }`}>
              {debugLogs.slice(-10).map((log, index) => (
                <div key={index} className={`mb-1 ${
                  log.type === 'error' ? (theme === 'dark' ? 'text-[#f48771]' : 'text-[#a1260d]') :
                  log.type === 'warning' ? (theme === 'dark' ? 'text-[#cca700]' : 'text-[#b89500]') :
                  log.type === 'success' ? (theme === 'dark' ? 'text-[#89d185]' : 'text-[#0e7c0e]') :
                  (theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333333]')
                }`}>
                  <span className={theme === 'dark' ? 'text-[#858585]' : 'text-[#858585]'}>[{log.timestamp}]</span> {log.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className={`px-3 py-2 text-xs border-b ${
          theme === 'dark'
            ? 'bg-red-900/20 border-red-700/40 text-red-300'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {error}
        </div>
      )}

      {/* Terminal container - VSCode style */}
      <div
        ref={terminalContainerRef}
        className="flex-1 overflow-hidden min-h-0 relative"
        style={{ 
          backgroundColor: terminalThemes[currentTheme].background,
          transition: 'background-color 0.2s ease'
        }}
        onClick={() => {
          if (terminal) {
            terminal.focus();
          }
        }}
      />

      {/* Status bar - VSCode style */}
      <div className={`flex items-center justify-between px-3 py-0.5 text-[10px] shrink-0 border-t ${
        theme === 'dark'
          ? 'bg-[#007acc] text-[#ffffff] border-t-[#007acc]'
          : 'bg-[#007acc] text-[#ffffff] border-t-[#007acc]'
      }`}>
        <div className="flex items-center gap-3">
          {terminal && (
            <>
              <span className="opacity-90">
                {terminal.cols}×{terminal.rows}
              </span>
              <span className={`flex items-center gap-1.5 opacity-90 ${
                connectionStatus === 'connected' ? '' : 
                connectionStatus === 'connecting' ? 'opacity-70' :
                'opacity-70'
              }`}>
                {getStatusIndicator()}
                <span className="capitalize">{connectionStatus}</span>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 opacity-90">
          <span className="truncate max-w-[200px]">Project: {projectId}</span>
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
