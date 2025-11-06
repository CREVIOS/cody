// containerService.js
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs-extra');
const EventEmitter = require('events');

class ContainerService extends EventEmitter {
  constructor(fileSystemService) {
    super();
    this.docker = new Docker();
    this.fileSystemService = fileSystemService;
    this.containers = new Map(); // projectId -> containerInfo
    this.sessions = new Map(); // sessionId -> sessionInfo
    this.creatingContainers = new Set(); // Track containers being created
    this.IMAGE_NAME = 'project-sandbox:latest';
    
    // Port monitoring
    this.portMonitors = new Map(); // projectId -> port monitor info
    this.activePorts = new Map(); // projectId -> Set of active ports
    
    // Configuration
    this.config = {
      maxContainers: 10,
      maxSessionsPerContainer: 5,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      containerMemory: 1024 * 1024 * 1024, // 1GB
      containerCpu: 1.0,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      
      // Port monitoring config
      monitoredPorts: [3000, 3001, 4000, 5000, 8000, 8080, 8888, 9000],
      portCheckInterval: 2000, // Check every 2 seconds
    };
    
    // Initialize
    this.init();
  }

  async init() {
    try {
      await this.ensureImage();
      this.startCleanupTimer();
      console.log('✅ Container service initialized');
      this.emit('ready');  
    } catch (error) {
      console.error('❌ Failed to initialize container service:', error);
      throw error;
    }
  }

  async ensureImage() {
    try {
      await this.docker.getImage(this.IMAGE_NAME).inspect();
      console.log('📦 Sandbox image exists');
    } catch (error) {
      console.log('🔨 Building sandbox image...');
      await this.buildImage();
    }
  }

  async buildImage() {
    const dockerfileContent = `
FROM node:18-bullseye
ENV DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC PYTHONUNBUFFERED=1

      # Install packages including git and OpenSSH
      RUN apt-get update && \
          apt-get install -y --no-install-recommends \
              bash zsh fish vim nano emacs \
              git curl wget htop tree jq ripgrep fd-find \
              openssh-server \
              build-essential gfortran make \
              python3 python3-pip python3-dev \
              locales \
              net-tools iproute2 \
          && ln -s /usr/bin/fd-find /usr/local/bin/fd \
          && locale-gen en_US.UTF-8 \
          && rm -rf /var/lib/apt/lists/*

# Configure SSH and generate host keys
RUN mkdir /var/run/sshd && \
    ssh-keygen -A && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config && \
    echo 'Port 22' >> /etc/ssh/sshd_config

# Create non-root user and workspace BEFORE setting password
RUN useradd -ms /bin/bash developer && \
    echo 'developer:developer' | chpasswd && \
    mkdir -p /workspace && chown developer:developer /workspace

# Expose SSH port
EXPOSE 22

# Global NPM installs
RUN npm install -g --force typescript ts-node nodemon pm2 yarn pnpm eslint prettier

# Python packages
RUN pip3 install --no-cache-dir --upgrade pip wheel setuptools && \
    pip3 install --no-cache-dir requests beautifulsoup4 fastapi uvicorn numpy

USER developer
WORKDIR /workspace

# Split Oh-My-Bash installation for debugging
RUN git --version  # Verify git is available
RUN git clone --depth=1 https://github.com/ohmybash/oh-my-bash.git ~/.oh-my-bash
RUN cp ~/.oh-my-bash/templates/bashrc.osh-template ~/.bashrc  # Use correct template name if needed

RUN sed 's/OSH_THEME=.*/OSH_THEME="agnoster"/' ~/.bashrc > /tmp/bashrc.tmp && \
    mv /tmp/bashrc.tmp ~/.bashrc

RUN printf '%s\\n' \
    'export PS1="\\[\\e[32m\\]\\u@\\h \\[\\e[34m\\]\\w\\[\\e[0m\\]\\$ "' \
    'export LANG=en_US.UTF-8' \
    'export LC_ALL=en_US.UTF-8' \
    'alias ll="ls -la"' \
    'alias la="ls -A"' \
    'alias l="ls -CF"' \
    'alias grep="grep --color=auto"' >> ~/.bashrc

# Create a startup script that generates SSH keys and runs sshd
USER root
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'set -e' >> /start.sh && \
    echo 'echo "Starting SSH daemon..."' >> /start.sh && \
    echo 'if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then' >> /start.sh && \
    echo '  echo "Generating SSH host keys..."' >> /start.sh && \
    echo '  ssh-keygen -A' >> /start.sh && \
    echo 'fi' >> /start.sh && \
    echo 'echo "SSH host keys ready"' >> /start.sh && \
    echo 'ls -la /etc/ssh/ssh_host_*' >> /start.sh && \
    echo 'echo "Starting SSH daemon in background..."' >> /start.sh && \
    echo '/usr/sbin/sshd' >> /start.sh && \
    echo 'echo "SSH daemon started, keeping container alive..."' >> /start.sh && \
    echo 'tail -f /dev/null' >> /start.sh && \
    chmod +x /start.sh

# Default command: run startup script as root (needed for sshd)
CMD ["/start.sh"]


HEALTHCHECK --interval=30s --timeout=3s --start-period=8s --retries=3 \
  CMD pgrep sshd > /dev/null || exit 1
`;
    
    
    try {
      // Create temporary build context
      const tempDir = await fs.mkdtemp('/tmp/docker-build-');
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      await fs.writeFile(dockerfilePath, dockerfileContent);

      // Build image with progress
      const stream = await this.docker.buildImage({
        context: tempDir,
        src: ['Dockerfile']
      }, {
        t: this.IMAGE_NAME,
        forcerm: true,
        pull: true
      });

      // Monitor build progress
      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err, res) => {
          if (err) {
            const last = res[res.length - 1] || {};
            if (last.error) return reject(new Error(last.error));
            console.error('❌ Docker build failed:', err);
            reject(err);
          } else {
            const last = res[res.length - 1] || {};
            if (last.error) return reject(new Error(last.error));
            console.log('✅ Docker image built successfully');
            resolve(res);
          }
        }, (event) => {
          if (event.stream && !event.stream.includes('Step')) {
            process.stdout.write('.');
          }
          if (event.error) {
            console.error('Build error:', event.error);
          }
        });
      });

      // Cleanup
      await fs.remove(tempDir);
      
    } catch (error) {
      console.error('❌ Failed to build Docker image:', error);
      throw error;
    }
  }

  async createContainer(projectId) {
    try {
      // Prevent concurrent container creation for the same project
      if (this.creatingContainers.has(projectId)) {
        console.log(`Container creation already in progress for project: ${projectId}`);
        // Wait for the existing creation to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (this.containers.has(projectId)) {
          return this.containers.get(projectId);
        }
      }
      
      this.creatingContainers.add(projectId);
      
      // Check container limits
      if (this.containers.size >= this.config.maxContainers) {
        throw new Error('Maximum number of containers reached');
      }

      // Check if container already exists and is running
      if (this.containers.has(projectId)) {
        const containerInfo = this.containers.get(projectId);
        const container = this.docker.getContainer(containerInfo.id);
        
        try {
          const info = await container.inspect();
          if (info.State.Running) {
            containerInfo.lastActivity = new Date();
            return containerInfo;
          }
          // Start stopped container
          await container.start();
          containerInfo.lastActivity = new Date();
          return containerInfo;
        } catch (error) {
          // Container doesn't exist, remove from map and clean up
          console.log(`Container ${containerInfo.id} no longer exists, cleaning up`);
          this.containers.delete(projectId);
        }
      }

      // Clean up any existing containers with the same name
      const containerName = `sandbox-${projectId}`;
      try {
        const existingContainer = this.docker.getContainer(containerName);
        const info = await existingContainer.inspect();
        console.log(`Found existing container ${containerName}, removing...`);
        await existingContainer.remove({ force: true });
        console.log(`✅ Removed existing container: ${containerName}`);
      } catch (error) {
        if (error.statusCode === 404) {
          console.log(`No existing container ${containerName} to remove`);
        } else {
          console.warn(`Failed to remove existing container ${containerName}:`, error.message);
        }
      }

      // Prepare workspace directory
      const workspacePath = `/tmp/sandbox-${projectId}`;
      await fs.ensureDir(workspacePath);

      // Sync project files first
      await this.syncProjectFiles(projectId, workspacePath);

      // Create container with security hardening
      const container = await this.docker.createContainer({
        Image: this.IMAGE_NAME,
        name: containerName,
        Hostname: 'sandbox',
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        Env: [
          'TERM=xterm-256color',
          'NODE_ENV=development',
          `PROJECT_ID=${projectId}`,
          'SHELL=/bin/bash',
          'HOME=/home/developer',
          'USER=developer'
        ],
        WorkingDir: '/workspace',
        User: 'root',
        HostConfig: {
          // Security settings
          ReadonlyRootfs: false,
          CapDrop: ['ALL'],
          CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE'],
          SecurityOpt: ['no-new-privileges'],
          NoNewPrivileges: true,
          
          // Resource limits
          Memory: this.config.containerMemory,
          MemorySwap: this.config.containerMemory,
          CpuShares: Math.floor(this.config.containerCpu * 1024),
          PidsLimit: 512,
          
          // Network isolation
          NetworkMode: 'bridge',
          DnsSearch: [],
          Dns: ['8.8.8.8', '8.8.4.4'],
          
          // File system
          Binds: [`${workspacePath}:/workspace:rw`],
          
          // Port bindings (moved from above for clarity)
          PortBindings: {
            '22/tcp': [{ HostPort: '0' }],
            '3000/tcp': [{ HostPort: '0' }],
            '3001/tcp': [{ HostPort: '0' }],
            '4000/tcp': [{ HostPort: '0' }],
            '5000/tcp': [{ HostPort: '0' }],
            '8000/tcp': [{ HostPort: '0' }],
            '8080/tcp': [{ HostPort: '0' }],
            '8888/tcp': [{ HostPort: '0' }],
            '9000/tcp': [{ HostPort: '0' }]
          },
          Tmpfs: {
            '/tmp': 'rw,size=100m',
            '/var/tmp': 'rw,size=100m'
          },
          
          // Ulimits
          Ulimits: [
            { Name: 'nofile', Soft: 1024, Hard: 2048 },
            { Name: 'nproc', Soft: 256, Hard: 512 },
            { Name: 'fsize', Soft: 100000000, Hard: 100000000 } // 100MB
          ],
          
          // Auto remove on stop
          AutoRemove: false
        },
        
        // Networking
        ExposedPorts: {
          '22/tcp': {},
          '3000/tcp': {},
          '3001/tcp': {},
          '4000/tcp': {},
          '5000/tcp': {},
          '8000/tcp': {},
          '8080/tcp': {},
          '8888/tcp': {},
          '9000/tcp': {}
        },
        
        // Labels for identification
        Labels: {
          'project.id': projectId,
          'service': 'sandbox',
          'created.by': 'container-service'
        }
      });

      // Start container
      await container.start();
      
      // Get container info
      const containerInfo = await container.inspect();

      // Determine mapped SSH host port
      let sshHostPort = null;
      try {
        const sshBinding = containerInfo.NetworkSettings.Ports['22/tcp'];
        console.log('SSH port bindings:', sshBinding);
        if (sshBinding && sshBinding.length > 0) {
          sshHostPort = sshBinding[0].HostPort;
        }
      } catch (err) {
        console.warn('Could not determine SSH host port:', err.message);
      }

      const info = {
        id: container.id,
        projectId,
        name: containerInfo.Name,
        createdAt: new Date(),
        lastActivity: new Date(),
        sessions: new Map(),
        workspacePath,
        state: 'running',
        sshPort: sshHostPort
      };

      this.containers.set(projectId, info);
      
      // Emit event
      this.emit('container:created', { projectId, containerId: container.id });
      
      console.log(`✅ Container created for project: ${projectId}`);
      
      if (sshHostPort) {
        console.log(`🔑 SSH available on localhost:${sshHostPort} (user: developer / pwd: developer)`);
        
        // Test SSH connectivity after a delay
        setTimeout(async () => {
          try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            
            // Test if SSH port is responding
            await execAsync(`nc -z localhost ${sshHostPort}`, { timeout: 3000 });
            console.log(`✅ SSH port ${sshHostPort} is responding`);
          } catch (error) {
            console.error(`❌ SSH port ${sshHostPort} is not responding. Checking container logs...`);
            
            // Get container logs to debug
            try {
              const container = this.docker.getContainer(info.id);
              const logs = await container.logs({
                stdout: true,
                stderr: true,
                tail: 20
              });
              console.log('Container logs:', logs.toString());
            } catch (logError) {
              console.error('Failed to get container logs:', logError.message);
            }
          }
        }, 5000);
      } else {
        console.log(`⚠️  SSH port not mapped for project: ${projectId}`);
      }
      
      // Start port monitoring and file watching after container is ready
      setTimeout(() => {
        this.startPortMonitoring(projectId);
        this.startFileWatching(projectId);
      }, 3000);
      
      this.creatingContainers.delete(projectId);
      return info;
      
    } catch (error) {
      this.creatingContainers.delete(projectId);
      console.error(`❌ Failed to create container for project ${projectId}:`, error);
      throw error;
    }
  }

  async syncProjectFiles(projectId, workspacePath) {
    try {
      // Get project structure from file system service
      const structure = await this.fileSystemService.getProjectStructure(projectId);
      
      if (!structure || structure.length === 0) {
        console.log(`📁 No existing files for project ${projectId}, creating empty workspace`);
        return;
      }

      console.log(`📁 Starting sync for project ${projectId} with ${structure.length} items`);
      await this.syncDirectoryStructure(projectId, structure, workspacePath);
      
      console.log(`📁 Synced ${projectId} files to container workspace`);
      
    } catch (error) {
      console.error(`❌ Failed to sync files for project ${projectId}:`, error);
      console.error('Error details:', error);
      // Don't throw error, just log it - empty workspace is acceptable
    }
  }

  async syncDirectoryStructure(projectId, items, basePath) {
    for (const item of items) {
      const itemPath = path.join(basePath, item.path);
      
      if (item.type === 'folder') {
        await fs.ensureDir(itemPath);
        if (item.children) {
          await this.syncDirectoryStructure(projectId, item.children, basePath);
        }
      } else if (item.type === 'file') {
        // Read file content and write to workspace
        try {
          const fileResult = await this.fileSystemService.readFile(projectId, item.path);
          if (fileResult.success) {
            await fs.ensureDir(path.dirname(itemPath));
            await fs.writeFile(itemPath, fileResult.content);
            console.log(`📄 Synced file: ${item.path} (${fileResult.content.length} bytes)`);
          }
        } catch (error) {
          console.error(`Failed to sync file ${item.path}:`, error);
        }
      }
    }
  }

  async createTerminalSession(projectId) {
    try {
      // Create or get container
      const containerInfo = await this.createContainer(projectId);
      
      // Check session limits
      if (containerInfo.sessions.size >= this.config.maxSessionsPerContainer) {
        throw new Error('Maximum sessions per container reached');
      }

      const container = this.docker.getContainer(containerInfo.id);
      const sessionId = uuidv4();
      
      // Create exec instance with proper shell
      const exec = await container.exec({
        Cmd: ['/bin/bash', '--login', '-i'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        User: 'developer',
        WorkingDir: '/workspace',
        Env: [
          'TERM=xterm-256color',
          'HOME=/home/developer',
          'USER=developer',
          'SHELL=/bin/bash'
        ]
      });

      // Start the exec instance
      const stream = await exec.start({
        hijack: true,
        stdin: true
      });

      // Create session info
      const sessionInfo = {
        sessionId,
        projectId,
        exec,
        stream,
        createdAt: new Date(),
        lastActivity: new Date(),
        
        // Methods
        write: (data) => {
          try {
            if (stream && !stream.destroyed) {
              stream.write(data);
              sessionInfo.lastActivity = new Date();
            }
          } catch (error) {
            console.error('Error writing to stream:', error);
          }
        },
        
        resize: async (cols, rows) => {
          try {
            await exec.resize({ h: rows, w: cols });
          } catch (error) {
            console.error('Error resizing terminal:', error);
          }
        },
        
        kill: () => {
          try {
            if (stream && !stream.destroyed) {
              stream.end();
            }
          } catch (error) {
            console.error('Error killing session:', error);
          }
        }
      };

      // Store session
      this.sessions.set(sessionId, sessionInfo);
      containerInfo.sessions.set(sessionId, sessionInfo);
      containerInfo.lastActivity = new Date();

      // Handle stream end
      stream.on('end', () => {
        console.log(`🔚 Stream ended for session: ${sessionId}`);
        this.cleanupSession(sessionId);
      });

      stream.on('error', (error) => {
        console.error(`Terminal session ${sessionId} error:`, error);
        console.error('Stream error details:', {
          message: error.message,
          code: error.code,
          stack: error.stack
        });
        this.cleanupSession(sessionId);
      });

      console.log(`🖥️  Terminal session created: ${sessionId}`);
      
      return sessionInfo;
      
    } catch (error) {
      console.error('❌ Failed to create terminal session:', error);
      throw error;
    }
  }

  async handleWebSocketConnection(ws, projectId) {
    let currentSession = null;
    
    try {
      // Create terminal session
      currentSession = await this.createTerminalSession(projectId);
      const { sessionId, stream } = currentSession;
      
      console.log(`🔌 WebSocket connected for session: ${sessionId}`);

      // Send initial messages
      ws.send(JSON.stringify({
        type: 'session:created',
        sessionId,
        projectId
      }));

      // Track if banner has been sent
      let bannerSent = false;
      
      // Send welcome message after the first bash prompt appears
      const sendBannerAfterPrompt = () => {
        if (bannerSent) return;
        bannerSent = true;
        
        console.log(`📢 Sending banner for session: ${sessionId}, WS state: ${ws.readyState}`);
        const bannerLines = [
          '\r\n\x1b[1;32m✅ Terminal session ready!\x1b[0m\r\n',
          `\x1b[1;34mProject: ${projectId}\x1b[0m\r\n`,
          '\x1b[1;33mType commands below:\x1b[0m\r\n',
          '\r\n'
        ];

        for (const line of bannerLines) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'terminal:output',
                  sessionId,
                  data: Buffer.from(line).toString('base64')
                })
              );
              console.log(`📤 Sent banner line (${line.length} chars)`);
            } else {
              console.log(`⚠️  WebSocket not open (state: ${ws.readyState}), skipping banner line`);
              break;
            }
          } catch (err) {
            console.error('Error sending banner line:', err);
            break;
          }
        }
        console.log(`📢 Banner sending complete for session: ${sessionId}`);
      };
      
      // Fallback: send banner after 2 seconds if not already sent
      setTimeout(() => {
        if (!bannerSent) {
          console.log('📢 Sending banner via fallback timer');
          sendBannerAfterPrompt();
        }
      }, 2000);

      // Handle data from container to client with proper demultiplexing
      stream.on('data', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            // Demultiplex Docker stream data
            const demuxedData = this.demultiplexDockerStream(data);
            if (demuxedData && demuxedData.length > 0) {
              // Send the original data first
              ws.send(JSON.stringify({
                type: 'terminal:output',
                sessionId,
                data: demuxedData.toString('base64')
              }));
              
              // Check if this looks like a bash prompt and send banner after it
              const dataStr = demuxedData.toString();
              if (!bannerSent && (dataStr.includes('bash-') || dataStr.includes('$ ') || dataStr.includes('developer@'))) {
                setTimeout(() => {
                  try {
                    sendBannerAfterPrompt();
                  } catch (error) {
                    console.error('Error sending banner after prompt:', error);
                  }
                }, 200);
              }
            }
          } catch (error) {
            console.error('Error sending terminal output:', error);
          }
        }
      });

      // Handle WebSocket messages
      ws.on('message', async (message) => {
        try {
          const msg = JSON.parse(message);
          
          switch (msg.type) {
            case 'terminal:input':
              if (msg.sessionId === sessionId && currentSession) {
                const data = Buffer.from(msg.data, 'base64');
                console.log(`⬅️  [${sessionId}] Received input (${data.length} bytes):`, JSON.stringify(data.toString()));
                currentSession.write(data);
              }
              break;
              
            case 'terminal:resize':
              if (msg.sessionId === sessionId && currentSession && msg.cols && msg.rows) {
                await currentSession.resize(msg.cols, msg.rows);
              }
              break;
              
            case 'file:sync':
              if (msg.path && msg.content !== undefined) {
                await this.syncFileToContainer(projectId, msg.path, msg.content);
              }
              break;
              
            case 'session:ping':
              ws.send(JSON.stringify({
                type: 'session:pong',
                sessionId,
                timestamp: Date.now()
              }));
              break;
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message'
          }));
        }
      });

      // Handle WebSocket close
      ws.on('close', () => {
        console.log(`🔌 WebSocket closed for session: ${sessionId} (currentSession exists: ${!!currentSession})`);
        if (currentSession) {
          this.cleanupSession(sessionId);
        }
      });

      // Handle WebSocket errors
      ws.on('error', (error) => {
        console.error(`🔌 WebSocket error for session ${sessionId}:`, error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          stack: error.stack
        });
        if (currentSession) {
          this.cleanupSession(sessionId);
        }
      });

    } catch (error) {
      console.error('❌ Error handling WebSocket connection:', error);
      console.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        projectId,
        wsReadyState: ws.readyState
      });
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to create terminal session'
        }));
      }
      
      if (currentSession) {
        this.cleanupSession(currentSession.sessionId);
      }
    }
  }

  // Demultiplex Docker stream data
  demultiplexDockerStream(data) {
    if (!data || data.length === 0) {
      return Buffer.alloc(0);
    }

    const result = [];
    let offset = 0;

    while (offset < data.length) {
      // Check if we have enough bytes for a header (8 bytes minimum)
      if (offset + 8 > data.length) {
        // Not enough data for a complete header, treat remaining as raw data
        result.push(data.slice(offset));
        break;
      }

      // Read Docker stream header
      const streamType = data[offset];
      const payloadLength = data.readUInt32BE(offset + 4);

      // Validate header
      if (streamType < 0 || streamType > 2) {
        // Invalid stream type, treat as raw data
        result.push(data.slice(offset));
        break;
      }

      // Check if we have enough data for the payload
      if (offset + 8 + payloadLength > data.length) {
        // Not enough data for the complete payload, treat remaining as raw data
        result.push(data.slice(offset));
        break;
      }

      // Extract payload (skip the 8-byte header)
      if (payloadLength > 0) {
        const payload = data.slice(offset + 8, offset + 8 + payloadLength);
        result.push(payload);
      }

      // Move to next frame
      offset += 8 + payloadLength;
    }

    return Buffer.concat(result);
  }

  cleanupSession(sessionId) {
    const sessionInfo = this.sessions.get(sessionId);
    if (sessionInfo) {
      try {
        sessionInfo.kill();
        this.sessions.delete(sessionId);
        
        // Remove from container sessions
        const containerInfo = this.containers.get(sessionInfo.projectId);
        if (containerInfo) {
          containerInfo.sessions.delete(sessionId);
        }
        
        console.log(`🧹 Cleaned up session: ${sessionId}`);
      } catch (error) {
        console.error(`Error cleaning up session ${sessionId}:`, error);
      }
    }
  }

  async syncFileToContainer(projectId, filePath, content) {
    try {
      const containerInfo = this.containers.get(projectId);
      if (!containerInfo) return;

      const fullPath = path.join(containerInfo.workspacePath, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
      
      console.log(`📝 Synced file to container: ${filePath}`);
    } catch (error) {
      console.error(`❌ Failed to sync file ${filePath}:`, error);
    }
  }

  // Port monitoring and forwarding methods
  async startPortMonitoring(projectId) {
    if (this.portMonitors.has(projectId)) {
      return; // Already monitoring
    }

    const containerInfo = this.containers.get(projectId);
    if (!containerInfo) return;

    console.log(`🔍 Starting port monitoring for project: ${projectId}`);
    
    this.activePorts.set(projectId, new Set());
    
    const monitor = setInterval(async () => {
      await this.checkContainerPorts(projectId);
    }, this.config.portCheckInterval);

    this.portMonitors.set(projectId, {
      interval: monitor,
      startTime: new Date(),
      lastCheck: new Date()
    });
  }

  async stopPortMonitoring(projectId) {
    const monitor = this.portMonitors.get(projectId);
    if (monitor) {
      clearInterval(monitor.interval);
      this.portMonitors.delete(projectId);
      this.activePorts.delete(projectId);
      console.log(`🛑 Stopped port monitoring for project: ${projectId}`);
    }
  }

  async checkContainerPorts(projectId) {
    try {
      const containerInfo = this.containers.get(projectId);
      if (!containerInfo) return;

      const container = this.docker.getContainer(containerInfo.id);
      const currentPorts = this.activePorts.get(projectId) || new Set();
      const newActivePorts = new Set();

      // Check each monitored port
      for (const port of this.config.monitoredPorts) {
        const isActive = await this.isPortActive(containerInfo.id, port);
        
        if (isActive) {
          newActivePorts.add(port);
          
          // New port detected
          if (!currentPorts.has(port)) {
            console.log(`🌐 New web server detected on port ${port} for project: ${projectId}`);
            
            // Get the host port mapping
            const hostPort = await this.getHostPortMapping(containerInfo.id, port);
            
            this.emit('port:detected', {
              projectId,
              containerPort: port,
              hostPort,
              url: `http://localhost:${hostPort}`,
              timestamp: new Date()
            });
          }
        } else if (currentPorts.has(port)) {
          // Port is no longer active
          console.log(`🔴 Web server stopped on port ${port} for project: ${projectId}`);
          this.emit('port:stopped', {
            projectId,
            containerPort: port,
            timestamp: new Date()
          });
        }
      }

      this.activePorts.set(projectId, newActivePorts);
      
      // Update monitor info
      const monitor = this.portMonitors.get(projectId);
      if (monitor) {
        monitor.lastCheck = new Date();
      }

    } catch (error) {
      console.error(`❌ Error checking ports for project ${projectId}:`, error);
    }
  }

  async isPortActive(containerId, port) {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Try multiple commands to check if port is listening
      const commands = [
        ['netstat', '-tlnp'],
        ['ss', '-tlnp'],
        ['lsof', '-i', `:${port}`]
      ];
      
      for (const cmd of commands) {
        try {
          const exec = await container.exec({
            Cmd: cmd,
            AttachStdout: true,
            AttachStderr: true
          });

          const stream = await exec.start({ hijack: true });
          
          const result = await new Promise((resolve) => {
            let output = '';
            
            stream.on('data', (data) => {
              output += data.toString();
            });
            
            stream.on('end', () => {
              // Check if port is in the output
              const portPattern = new RegExp(`:${port}\\s+.*LISTEN`);
              resolve(portPattern.test(output));
            });
            
            stream.on('error', () => {
              resolve(false);
            });
            
            // Timeout after 2 seconds
            setTimeout(() => resolve(false), 2000);
          });
          
          if (result) {
            console.log(`✅ Port ${port} detected using command: ${cmd.join(' ')}`);
            return true;
          }
        } catch (error) {
          // Try next command
          continue;
        }
      }
      
      return false;
    } catch (error) {
      console.error(`Error checking port ${port}:`, error);
      return false;
    }
  }

  async getHostPortMapping(containerId, containerPort) {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      
      const portKey = `${containerPort}/tcp`;
      const portBindings = info.NetworkSettings.Ports[portKey];
      
      if (portBindings && portBindings.length > 0) {
        return portBindings[0].HostPort;
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting host port mapping:`, error);
      return null;
    }
  }

  async getActivePortsForProject(projectId) {
    const activePorts = this.activePorts.get(projectId) || new Set();
    const portInfo = [];
    
    for (const port of activePorts) {
      const containerInfo = this.containers.get(projectId);
      if (containerInfo) {
        const hostPort = await this.getHostPortMapping(containerInfo.id, port);
        portInfo.push({
          containerPort: port,
          hostPort,
          url: `http://localhost:${hostPort}`,
          status: 'active'
        });
      }
    }
    
    return portInfo;
  }

  // File system watching methods
  async startFileWatching(projectId) {
    if (this.fileWatchers && this.fileWatchers.has(projectId)) {
      return; // Already watching
    }

    const containerInfo = this.containers.get(projectId);
    if (!containerInfo) return;

    console.log(`👁️  Starting file system watching for project: ${projectId}`);
    
    if (!this.fileWatchers) {
      this.fileWatchers = new Map();
    }
    
    // Get initial file state
    const initialState = await this.getContainerFileState(projectId);
    
    const watcher = setInterval(async () => {
      await this.checkFileChanges(projectId, initialState);
    }, 1000); // Check every second

    this.fileWatchers.set(projectId, {
      interval: watcher,
      lastState: initialState,
      startTime: new Date()
    });
  }

  async stopFileWatching(projectId) {
    if (!this.fileWatchers) return;
    
    const watcher = this.fileWatchers.get(projectId);
    if (watcher) {
      clearInterval(watcher.interval);
      this.fileWatchers.delete(projectId);
      console.log(`🛑 Stopped file watching for project: ${projectId}`);
    }
  }

  async getContainerFileState(projectId) {
    try {
      const containerInfo = this.containers.get(projectId);
      if (!containerInfo) return new Map();

      const container = this.docker.getContainer(containerInfo.id);
      
      // Use find command to get both files AND directories with their modification times
      const exec = await container.exec({
        Cmd: ['find', '/workspace', '(', '-type', 'f', '-o', '-type', 'd', ')', '-exec', 'stat', '-c', '%n|%Y|%s|%F', '{}', ';'],
        AttachStdout: true,
        AttachStderr: true,
        User: 'developer'
      });

      const stream = await exec.start({ hijack: true });
      
      return new Promise((resolve) => {
        let output = '';
        
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.on('end', () => {
          const fileState = new Map();
          const lines = output.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            const [filePath, mtime, size, fileType] = line.split('|');
            if (filePath && filePath.startsWith('/workspace/')) {
              const relativePath = filePath.replace('/workspace/', '');
              
              // Skip the root workspace directory
              if (relativePath === '') continue;
              
              fileState.set(relativePath, {
                mtime: parseInt(mtime),
                size: parseInt(size),
                path: relativePath,
                type: fileType === 'directory' ? 'folder' : 'file'
              });
            }
          }
          
          resolve(fileState);
        });
        
        stream.on('error', () => {
          resolve(new Map());
        });
        
        setTimeout(() => resolve(new Map()), 5000);
      });
    } catch (error) {
      console.error(`Error getting container file state:`, error);
      return new Map();
    }
  }

  async checkFileChanges(projectId, previousState) {
    try {
      const currentState = await this.getContainerFileState(projectId);
      const watcher = this.fileWatchers.get(projectId);
      
      if (!watcher) return;

      const changes = {
        added: [],
        modified: [],
        deleted: []
      };

      // Check for new and modified files/directories
      for (const [filePath, fileInfo] of currentState) {
        const previous = previousState.get(filePath);
        
        if (!previous) {
          // New file or directory
          changes.added.push({
            path: filePath,
            type: fileInfo.type
          });
          console.log(`📄 New ${fileInfo.type} detected: ${filePath}`);
          
          if (fileInfo.type === 'file') {
            // Read file content and sync to MinIO
            await this.syncContainerFileToMinIO(projectId, filePath);
          } else if (fileInfo.type === 'folder') {
            // Create folder in MinIO
            try {
              await this.fileSystemService.createFolder(projectId, filePath);
              console.log(`📁 Created folder in MinIO: ${filePath}`);
            } catch (error) {
              console.error(`Error creating folder in MinIO: ${filePath}`, error);
            }
          }
          
        } else if (previous.mtime !== fileInfo.mtime || previous.size !== fileInfo.size) {
          // Modified file (directories don't get "modified" in the same way)
          if (fileInfo.type === 'file') {
            changes.modified.push({
              path: filePath,
              type: fileInfo.type
            });
            console.log(`📝 File modified: ${filePath}`);
            
            // Read file content and sync to MinIO
            await this.syncContainerFileToMinIO(projectId, filePath);
          }
        }
      }

      // Check for deleted files/directories
      for (const [filePath, fileInfo] of previousState) {
        if (!currentState.has(filePath)) {
          changes.deleted.push({
            path: filePath,
            type: fileInfo.type
          });
          console.log(`🗑️  ${fileInfo.type} deleted: ${filePath}`);
          
          // Delete from MinIO
          try {
            await this.fileSystemService.deleteItem(projectId, filePath);
            console.log(`🗑️  Deleted from MinIO: ${filePath}`);
          } catch (error) {
            console.error(`Error deleting from MinIO: ${filePath}`, error);
          }
        }
      }

      // Emit changes if any
      if (changes.added.length > 0 || changes.modified.length > 0 || changes.deleted.length > 0) {
        console.log(`🔄 File changes detected for ${projectId}:`, {
          added: changes.added.length,
          modified: changes.modified.length,
          deleted: changes.deleted.length
        });
        
        this.emit('files:changed', {
          projectId,
          changes,
          timestamp: new Date()
        });
      }

      // Update the stored state
      watcher.lastState = currentState;

    } catch (error) {
      console.error(`❌ Error checking file changes for project ${projectId}:`, error);
    }
  }

  async syncContainerFileToMinIO(projectId, filePath) {
    try {
      const containerInfo = this.containers.get(projectId);
      if (!containerInfo) return;

      const container = this.docker.getContainer(containerInfo.id);
      
      // Read file content from container
      const exec = await container.exec({
        Cmd: ['cat', `/workspace/${filePath}`],
        AttachStdout: true,
        AttachStderr: true,
        User: 'developer'
      });

      const stream = await exec.start({ hijack: true });
      
      let content = '';
      stream.on('data', (data) => {
        content += data.toString();
      });
      
      stream.on('end', async () => {
        try {
          // Update file in MinIO
          await this.fileSystemService.updateFile(projectId, filePath, content);
          console.log(`💾 Synced container file to MinIO: ${filePath} (${content.length} bytes)`);
        } catch (error) {
          console.error(`Error syncing file to MinIO: ${filePath}`, error);
        }
      });

    } catch (error) {
      console.error(`Error reading file from container: ${filePath}`, error);
    }
  }

  // Process management methods
  async getRunningProcesses(projectId) {
    try {
      const containerInfo = this.containers.get(projectId);
      if (!containerInfo) return [];

      const container = this.docker.getContainer(containerInfo.id);
      
      // Use ps command to get running processes
      const exec = await container.exec({
        Cmd: ['ps', 'aux'],
        AttachStdout: true,
        AttachStderr: true,
        User: 'developer'
      });

      const stream = await exec.start({ hijack: true });
      
      return new Promise((resolve) => {
        let output = '';
        
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.on('end', () => {
          const processes = this.parseProcessList(output);
          resolve(processes);
        });
        
        stream.on('error', () => {
          resolve([]);
        });
        
        setTimeout(() => resolve([]), 5000);
      });
    } catch (error) {
      console.error(`Error getting running processes:`, error);
      return [];
    }
  }

  parseProcessList(output) {
    const lines = output.split('\n').filter(line => line.trim());
    const processes = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(/\s+/);
      if (parts.length >= 11) {
        const process = {
          pid: parts[1],
          user: parts[0],
          cpu: parts[2],
          memory: parts[3],
          command: parts.slice(10).join(' '),
          status: 'running'
        };
        
        // Filter out system processes and focus on user processes
        if (process.user === 'developer' && !process.command.includes('ps aux')) {
          processes.push(process);
        }
      }
    }
    
    return processes;
  }

  async killProcess(projectId, pid) {
    try {
      const containerInfo = this.containers.get(projectId);
      if (!containerInfo) throw new Error('Container not found');

      const container = this.docker.getContainer(containerInfo.id);
      
      // Use kill command to terminate process
      const exec = await container.exec({
        Cmd: ['kill', '-TERM', pid],
        AttachStdout: true,
        AttachStderr: true,
        User: 'developer'
      });

      await exec.start({ hijack: true });
      
      console.log(`🔪 Killed process ${pid} in project: ${projectId}`);
      
      // Emit event
      this.emit('process:killed', {
        projectId,
        pid,
        timestamp: new Date()
      });
      
    } catch (error) {
      console.error(`Error killing process ${pid}:`, error);
      throw error;
    }
  }

  async executeCommand(projectId, command, options = {}) {
    try {
      const containerInfo = this.containers.get(projectId);
      if (!containerInfo) throw new Error('Container not found');

      const container = this.docker.getContainer(containerInfo.id);
      
      const execOptions = {
        Cmd: command.split(' '),
        AttachStdout: true,
        AttachStderr: true,
        User: 'developer',
        WorkingDir: '/workspace',
        ...options
      };

      const exec = await container.exec(execOptions);
      const stream = await exec.start({ hijack: true });
      
      const processId = `cmd-${Date.now()}`;
      
      // Handle output
      stream.on('data', (data) => {
        const output = data.toString();
        if (this.outputManager) {
          this.outputManager.addProcessOutput(projectId, processId, output);
        }
      });
      
      stream.on('end', () => {
        console.log(`✅ Command completed: ${command}`);
        this.emit('command:completed', {
          projectId,
          command,
          processId,
          timestamp: new Date()
        });
      });
      
      return {
        processId,
        command,
        stream
      };
      
    } catch (error) {
      console.error(`Error executing command: ${command}`, error);
      throw error;
    }
  }

  async stopContainer(projectId) {
    const containerInfo = this.containers.get(projectId);
    if (!containerInfo) return;

    try {
      // Stop port monitoring and file watching
      await this.stopPortMonitoring(projectId);
      await this.stopFileWatching(projectId);
      
      // Kill all sessions
      for (const [sessionId] of containerInfo.sessions) {
        this.cleanupSession(sessionId);
      }

      // Stop and remove container
      const container = this.docker.getContainer(containerInfo.id);
      
      try {
        await container.stop({ t: 10 });
      } catch (error) {
        // Container might already be stopped
        console.log(`Container ${containerInfo.id} already stopped`);
      }
      
      try {
        await container.remove({ force: true });
      } catch (error) {
        console.error('Error removing container:', error);
      }

      // Cleanup workspace
      if (containerInfo.workspacePath) {
        await fs.remove(containerInfo.workspacePath);
      }

      // Remove from map
      this.containers.delete(projectId);
      
      this.emit('container:stopped', { projectId });
      console.log(`🛑 Container stopped for project: ${projectId}`);
      
    } catch (error) {
      console.error(`❌ Error stopping container for project ${projectId}:`, error);
      throw error;
    }
  }

  async listContainers() {
    const containers = [];
    
    for (const [projectId, info] of this.containers) {
      try {
        const container = this.docker.getContainer(info.id);
        const inspect = await container.inspect();
        
        containers.push({
          projectId,
          id: info.id,
          name: info.name,
          state: inspect.State.Status,
          created: info.createdAt,
          lastActivity: info.lastActivity,
          sessions: info.sessions.size,
          uptime: Date.now() - info.createdAt.getTime(),
          sshPort: info.sshPort
        });
      } catch (error) {
        // Container doesn't exist anymore
        this.containers.delete(projectId);
      }
    }
    
    return containers;
  }

  startCleanupTimer() {
    setInterval(async () => {
      try {
        await this.cleanupInactiveContainers();
        await this.cleanupOrphanedSessions();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }, this.config.cleanupInterval);
  }

  async cleanupInactiveContainers(maxIdleMinutes = 30) {
    const now = new Date();
    const inactiveContainers = [];
    
    for (const [projectId, info] of this.containers) {
      if (info.sessions.size === 0) {
        const idleTime = (now - info.lastActivity) / 1000 / 60;
        if (idleTime > maxIdleMinutes) {
          inactiveContainers.push(projectId);
        }
      }
    }

    for (const projectId of inactiveContainers) {
      console.log(`🧹 Cleaning up inactive container: ${projectId}`);
      await this.stopContainer(projectId);
    }

    return inactiveContainers.length;
  }

  async cleanupOrphanedSessions() {
    const now = new Date();
    const orphanedSessions = [];

    for (const [sessionId, sessionInfo] of this.sessions) {
      const idleTime = (now - sessionInfo.lastActivity) / 1000 / 60;
      if (idleTime > 60) { // 1 hour timeout for sessions
        orphanedSessions.push(sessionId);
      }
    }

    for (const sessionId of orphanedSessions) {
      console.log(`🧹 Cleaning up orphaned session: ${sessionId}`);
      this.cleanupSession(sessionId);
    }

    return orphanedSessions.length;
  }

  async getContainerStats(projectId) {
    const containerInfo = this.containers.get(projectId);
    if (!containerInfo) return null;

    try {
      const container = this.docker.getContainer(containerInfo.id);
      const stats = await container.stats({ stream: false });
      
      return {
        cpu: this.calculateCpuPercent(stats),
        memory: this.calculateMemoryUsage(stats),
        network: stats.networks,
        sessions: containerInfo.sessions.size
      };
    } catch (error) {
      console.error('Error getting container stats:', error);
      return null;
    }
  }

  calculateCpuPercent(stats) {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
    return Math.round(cpuPercent * 100) / 100;
  }

  calculateMemoryUsage(stats) {
    const usage = stats.memory_stats.usage;
    const limit = stats.memory_stats.limit;
    return {
      usage: Math.round(usage / 1024 / 1024), // MB
      limit: Math.round(limit / 1024 / 1024), // MB
      percent: Math.round((usage / limit) * 100)
    };
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Shutting down container service...');
    
    // Stop all containers
    const containerPromises = Array.from(this.containers.keys()).map(projectId => 
      this.stopContainer(projectId).catch(err => 
        console.error(`Error stopping container ${projectId}:`, err)
      )
    );
    
    await Promise.all(containerPromises);
    console.log('✅ Container service shutdown complete');
  }
}

module.exports = ContainerService;