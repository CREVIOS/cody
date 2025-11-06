// containerBuilder.js - Authentic Builder Pattern for Docker Container Configuration
// Following the authentic Builder pattern with Product, Abstract Builder, Concrete Builders, and Director

/**
 * Product: The complex object being constructed
 */
class ContainerConfig {
  constructor() {
    this.Image = null;
    this.name = null;
    this.Hostname = null;
    this.AttachStdin = true;
    this.AttachStdout = true;
    this.AttachStderr = true;
    this.Tty = true;
    this.OpenStdin = true;
    this.StdinOnce = false;
    this.Env = [];
    this.WorkingDir = null;
    this.User = null;
    this.HostConfig = {
      ReadonlyRootfs: false,
      CapDrop: [],
      CapAdd: [],
      SecurityOpt: [],
      NoNewPrivileges: true,
      Memory: null,
      MemorySwap: null,
      CpuShares: null,
      PidsLimit: null,
      NetworkMode: 'bridge',
      DnsSearch: [],
      Dns: [],
      Binds: [],
      PortBindings: {},
      Tmpfs: {},
      Ulimits: [],
      AutoRemove: false
    };
    this.ExposedPorts = {};
    this.Labels = {};
  }

  /**
   * Validate the configuration
   */
  validate() {
    if (!this.Image) {
      throw new Error('Container image is required');
    }
    if (!this.name) {
      throw new Error('Container name is required');
    }
    return true;
  }

  /**
   * Get the final configuration object
   */
  getConfig() {
    this.validate();
    // Create a deep copy to prevent external modifications
    return JSON.parse(JSON.stringify(this));
  }
}

/**
 * Abstract Builder Interface
 * Defines the construction steps for building a container configuration
 */
class ContainerBuilderBase {
  constructor() {
    if (this.constructor === ContainerBuilderBase) {
      throw new Error('ContainerBuilderBase is abstract and cannot be instantiated');
    }
    this.config = new ContainerConfig();
  }

  /**
   * Reset the builder to start fresh
   */
  reset() {
    this.config = new ContainerConfig();
    return this;
  }

  /**
   * Set the Docker image
   */
  setImage(image) {
    this.config.Image = image;
    return this;
  }

  /**
   * Set the container name
   */
  setName(name) {
    this.config.name = name;
    return this;
  }

  /**
   * Set the hostname
   */
  setHostname(hostname) {
    this.config.Hostname = hostname;
    return this;
  }

  /**
   * Configure TTY and stdin settings
   */
  setTtySettings(attachStdin = true, attachStdout = true, attachStderr = true, tty = true, openStdin = true, stdinOnce = false) {
    this.config.AttachStdin = attachStdin;
    this.config.AttachStdout = attachStdout;
    this.config.AttachStderr = attachStderr;
    this.config.Tty = tty;
    this.config.OpenStdin = openStdin;
    this.config.StdinOnce = stdinOnce;
    return this;
  }

  /**
   * Add environment variable
   */
  addEnvironmentVariable(key, value) {
    this.config.Env.push(`${key}=${value}`);
    return this;
  }

  /**
   * Set multiple environment variables at once
   */
  setEnvironmentVariables(envVars) {
    this.config.Env = [...envVars];
    return this;
  }

  /**
   * Set working directory
   */
  setWorkingDirectory(workDir) {
    this.config.WorkingDir = workDir;
    return this;
  }

  /**
   * Set user
   */
  setUser(user) {
    this.config.User = user;
    return this;
  }

  /**
   * Configure security settings
   */
  setSecuritySettings(readonlyRootfs = false, capDrop = ['ALL'], capAdd = ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE'], securityOpt = ['no-new-privileges'], noNewPrivileges = true) {
    this.config.HostConfig.ReadonlyRootfs = readonlyRootfs;
    this.config.HostConfig.CapDrop = capDrop;
    this.config.HostConfig.CapAdd = capAdd;
    this.config.HostConfig.SecurityOpt = securityOpt;
    this.config.HostConfig.NoNewPrivileges = noNewPrivileges;
    return this;
  }

  /**
   * Set memory limits
   */
  setMemoryLimits(memory, memorySwap = null) {
    this.config.HostConfig.Memory = memory;
    this.config.HostConfig.MemorySwap = memorySwap || memory;
    return this;
  }

  /**
   * Set CPU limits
   */
  setCpuLimits(cpuShares) {
    this.config.HostConfig.CpuShares = cpuShares;
    return this;
  }

  /**
   * Set process limits
   */
  setPidsLimit(pidsLimit) {
    this.config.HostConfig.PidsLimit = pidsLimit;
    return this;
  }

  /**
   * Configure network settings
   */
  setNetworkSettings(networkMode = 'bridge', dnsSearch = [], dns = ['8.8.8.8', '8.8.4.4']) {
    this.config.HostConfig.NetworkMode = networkMode;
    this.config.HostConfig.DnsSearch = dnsSearch;
    this.config.HostConfig.Dns = dns;
    return this;
  }

  /**
   * Add volume bind
   */
  addVolumeBind(hostPath, containerPath, mode = 'rw') {
    if (!this.config.HostConfig.Binds) {
      this.config.HostConfig.Binds = [];
    }
    this.config.HostConfig.Binds.push(`${hostPath}:${containerPath}:${mode}`);
    return this;
  }

  /**
   * Add port binding
   */
  addPortBinding(containerPort, hostPort = '0', protocol = 'tcp') {
    const portKey = `${containerPort}/${protocol}`;
    
    // Add to HostConfig.PortBindings
    if (!this.config.HostConfig.PortBindings) {
      this.config.HostConfig.PortBindings = {};
    }
    this.config.HostConfig.PortBindings[portKey] = [{ HostPort: hostPort }];
    
    // Add to ExposedPorts
    this.config.ExposedPorts[portKey] = {};
    
    return this;
  }

  /**
   * Add multiple port bindings at once
   */
  addPortBindings(ports) {
    ports.forEach(port => {
      if (typeof port === 'number') {
        this.addPortBinding(port);
      } else if (typeof port === 'object') {
        this.addPortBinding(port.containerPort, port.hostPort, port.protocol);
      }
    });
    return this;
  }

  /**
   * Add tmpfs mount
   */
  addTmpfsMount(path, options) {
    if (!this.config.HostConfig.Tmpfs) {
      this.config.HostConfig.Tmpfs = {};
    }
    this.config.HostConfig.Tmpfs[path] = options;
    return this;
  }

  /**
   * Add ulimit
   */
  addUlimit(name, soft, hard) {
    if (!this.config.HostConfig.Ulimits) {
      this.config.HostConfig.Ulimits = [];
    }
    this.config.HostConfig.Ulimits.push({ Name: name, Soft: soft, Hard: hard });
    return this;
  }

  /**
   * Set multiple ulimits at once
   */
  setUlimits(ulimits) {
    this.config.HostConfig.Ulimits = [...ulimits];
    return this;
  }

  /**
   * Set auto remove on stop
   */
  setAutoRemove(autoRemove) {
    this.config.HostConfig.AutoRemove = autoRemove;
    return this;
  }

  /**
   * Add label
   */
  addLabel(key, value) {
    this.config.Labels[key] = value;
    return this;
  }

  /**
   * Set multiple labels at once
   */
  setLabels(labels) {
    this.config.Labels = { ...this.config.Labels, ...labels };
    return this;
  }

  /**
   * Build and return the final configuration
   * This is the abstract method that concrete builders must implement
   */
  build() {
    return this.config.getConfig();
  }
}

/**
 * Concrete Builder: Sandbox Container Builder
 * For development sandbox environments with moderate security
 */
class SandboxContainerBuilder extends ContainerBuilderBase {
  constructor() {
    super();
  }

  /**
   * Build a sandbox container configuration
   */
  build() {
    // Add container type label
    this.config.Labels['container.type'] = 'sandbox';
    return super.build();
  }
}


/**
 * Director: Orchestrates the construction process
 * Knows the sequence of steps to build different container types
 */
class ContainerDirector {
  constructor(builder) {
    this.builder = builder;
  }

  /**
   * Set the builder to use
   */
  setBuilder(builder) {
    if (!(builder instanceof ContainerBuilderBase)) {
      throw new Error('Builder must be an instance of ContainerBuilderBase');
    }
    this.builder = builder;
    return this;
  }

  /**
   * Build a sandbox container
   */
  buildSandboxContainer(projectId, containerName, workspacePath, imageName, config) {
    this.builder.reset();
    
    this.builder
      .setImage(imageName)
      .setName(containerName)
      .setHostname('sandbox')
      .setTtySettings(true, true, true, true, true, false)
      .setEnvironmentVariables([
        'TERM=xterm-256color',
        'NODE_ENV=development',
        `PROJECT_ID=${projectId}`,
        'SHELL=/bin/bash',
        'HOME=/home/developer',
        'USER=developer',
        'LANG=C.UTF-8',
        'LC_ALL=C.UTF-8'
      ])
      .setWorkingDirectory('/workspace')
      .setUser('root')
      .setSecuritySettings(
        false, // readonlyRootfs
        ['ALL'], // capDrop
        ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE'], // capAdd
        ['no-new-privileges'], // securityOpt
        true // noNewPrivileges
      )
      .setMemoryLimits(config.containerMemory, config.containerMemory)
      .setCpuLimits(Math.floor(config.containerCpu * 1024))
      .setPidsLimit(512)
      .setNetworkSettings('bridge', [], ['8.8.8.8', '8.8.4.4'])
      .addVolumeBind(workspacePath, '/workspace', 'rw')
      .addPortBindings([22, 3000, 3001, 4000, 5000, 8000, 8080, 8888, 9000])
      .addTmpfsMount('/tmp', 'rw,size=100m')
      .addTmpfsMount('/var/tmp', 'rw,size=100m')
      .setUlimits([
        { Name: 'nofile', Soft: 1024, Hard: 2048 },
        { Name: 'nproc', Soft: 256, Hard: 512 },
        { Name: 'fsize', Soft: 100000000, Hard: 100000000 } // 100MB
      ])
      .setAutoRemove(false)
      .setLabels({
        'project.id': projectId,
        'service': 'sandbox',
        'created.by': 'container-service'
      });

    return this.builder.build();
  }
}

/**
 * Backward compatibility: Convenience wrapper that uses SandboxContainerBuilder
 * This maintains compatibility with existing code
 */
class ContainerBuilder extends SandboxContainerBuilder {
  constructor() {
    super();
  }

  /**
   * Create a default sandbox configuration (for backward compatibility)
   */
  createSandboxConfiguration(projectId, containerName, workspacePath, config) {
    return this
      .setImage(config.IMAGE_NAME)
      .setName(containerName)
      .setHostname('sandbox')
      .setTtySettings(true, true, true, true, true, false)
      .setEnvironmentVariables([
        'TERM=xterm-256color',
        'NODE_ENV=development',
        `PROJECT_ID=${projectId}`,
        'SHELL=/bin/bash',
        'HOME=/home/developer',
        'USER=developer',
        'LANG=C.UTF-8',
        'LC_ALL=C.UTF-8'
      ])
      .setWorkingDirectory('/workspace')
      .setUser('root')
      .setSecuritySettings(
        false,
        ['ALL'],
        ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE'],
        ['no-new-privileges'],
        true
      )
      .setMemoryLimits(config.containerMemory, config.containerMemory)
      .setCpuLimits(Math.floor(config.containerCpu * 1024))
      .setPidsLimit(512)
      .setNetworkSettings('bridge', [], ['8.8.8.8', '8.8.4.4'])
      .addVolumeBind(workspacePath, '/workspace', 'rw')
      .addPortBindings([22, 3000, 3001, 4000, 5000, 8000, 8080, 8888, 9000])
      .addTmpfsMount('/tmp', 'rw,size=100m')
      .addTmpfsMount('/var/tmp', 'rw,size=100m')
      .setUlimits([
        { Name: 'nofile', Soft: 1024, Hard: 2048 },
        { Name: 'nproc', Soft: 256, Hard: 512 },
        { Name: 'fsize', Soft: 100000000, Hard: 100000000 }
      ])
      .setAutoRemove(false)
      .setLabels({
        'project.id': projectId,
        'service': 'sandbox',
        'created.by': 'container-service'
      });
  }

  /**
   * Clone the current configuration to a new builder
   */
  clone() {
    const newBuilder = new ContainerBuilder();
    newBuilder.config = JSON.parse(JSON.stringify(this.config));
    return newBuilder;
  }
}

module.exports = {
  // Product
  ContainerConfig,
  
  // Abstract Builder
  ContainerBuilderBase,
  
  // Concrete Builder (only one used in codebase)
  SandboxContainerBuilder,
  
  // Director
  ContainerDirector,
  
  // Backward compatibility
  ContainerBuilder
};
