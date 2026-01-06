/**
 * ContainerBuilder Test Suite
 * Tests the Builder Pattern implementation for Docker container configuration
 */

const {
  ContainerConfig,
  ContainerBuilderBase,
  SandboxContainerBuilder,
  ContainerDirector,
  ContainerBuilder
} = require('../services/containerBuilder');

describe('ContainerBuilder - Builder Pattern', () => {
  describe('ContainerConfig (Product)', () => {
    it('should create a new ContainerConfig with default values', () => {
      const config = new ContainerConfig();
      
      expect(config.Image).toBeNull();
      expect(config.name).toBeNull();
      expect(config.AttachStdin).toBe(true);
      expect(config.AttachStdout).toBe(true);
      expect(config.Tty).toBe(true);
      expect(config.Env).toEqual([]);
      expect(config.HostConfig).toBeDefined();
      expect(config.HostConfig.NetworkMode).toBe('bridge');
    });

    it('should validate configuration and throw error if image is missing', () => {
      const config = new ContainerConfig();
      config.name = 'test-container';
      
      expect(() => config.validate()).toThrow('Container image is required');
    });

    it('should validate configuration and throw error if name is missing', () => {
      const config = new ContainerConfig();
      config.Image = 'test-image';
      
      expect(() => config.validate()).toThrow('Container name is required');
    });

    it('should validate successfully when both image and name are set', () => {
      const config = new ContainerConfig();
      config.Image = 'test-image';
      config.name = 'test-container';
      
      expect(config.validate()).toBe(true);
    });

    it('should return a deep copy of config when calling getConfig', () => {
      const config = new ContainerConfig();
      config.Image = 'test-image';
      config.name = 'test-container';
      config.Env.push('TEST=value');
      
      const configCopy = config.getConfig();
      
      expect(configCopy).not.toBe(config);
      expect(configCopy.Image).toBe('test-image');
      expect(configCopy.name).toBe('test-container');
      
      // Modify copy should not affect original
      configCopy.Env.push('ANOTHER=value');
      expect(config.Env.length).toBe(1);
    });
  });

  describe('ContainerBuilderBase (Abstract Builder)', () => {
    it('should throw error when trying to instantiate abstract class', () => {
      expect(() => new ContainerBuilderBase()).toThrow('ContainerBuilderBase is abstract');
    });

    it('should allow concrete builders to be instantiated', () => {
      const builder = new SandboxContainerBuilder();
      expect(builder).toBeInstanceOf(ContainerBuilderBase);
      expect(builder.config).toBeInstanceOf(ContainerConfig);
    });

    it('should reset builder configuration', () => {
      const builder = new SandboxContainerBuilder();
      builder.setImage('test-image');
      builder.setName('test-name');
      
      const result = builder.reset();
      
      expect(result).toBe(builder); // Should return this for chaining
      expect(builder.config.Image).toBeNull();
      expect(builder.config.name).toBeNull();
    });

    it('should set image and return builder for chaining', () => {
      const builder = new SandboxContainerBuilder();
      const result = builder.setImage('test-image');
      
      expect(result).toBe(builder);
      expect(builder.config.Image).toBe('test-image');
    });

    it('should set name and return builder for chaining', () => {
      const builder = new SandboxContainerBuilder();
      const result = builder.setName('test-container');
      
      expect(result).toBe(builder);
      expect(builder.config.name).toBe('test-container');
    });

    it('should set hostname', () => {
      const builder = new SandboxContainerBuilder();
      builder.setHostname('my-hostname');
      
      expect(builder.config.Hostname).toBe('my-hostname');
    });

    it('should configure TTY settings', () => {
      const builder = new SandboxContainerBuilder();
      builder.setTtySettings(false, false, false, false, false, true);
      
      expect(builder.config.AttachStdin).toBe(false);
      expect(builder.config.AttachStdout).toBe(false);
      expect(builder.config.AttachStderr).toBe(false);
      expect(builder.config.Tty).toBe(false);
      expect(builder.config.OpenStdin).toBe(false);
      expect(builder.config.StdinOnce).toBe(true);
    });

    it('should add environment variable', () => {
      const builder = new SandboxContainerBuilder();
      builder.addEnvironmentVariable('KEY', 'value');
      
      expect(builder.config.Env).toContain('KEY=value');
    });

    it('should set multiple environment variables', () => {
      const builder = new SandboxContainerBuilder();
      builder.setEnvironmentVariables(['KEY1=value1', 'KEY2=value2']);
      
      expect(builder.config.Env).toEqual(['KEY1=value1', 'KEY2=value2']);
    });

    it('should set working directory', () => {
      const builder = new SandboxContainerBuilder();
      builder.setWorkingDirectory('/workspace');
      
      expect(builder.config.WorkingDir).toBe('/workspace');
    });

    it('should set user', () => {
      const builder = new SandboxContainerBuilder();
      builder.setUser('developer');
      
      expect(builder.config.User).toBe('developer');
    });

    it('should configure security settings', () => {
      const builder = new SandboxContainerBuilder();
      builder.setSecuritySettings(true, ['ALL'], ['CHOWN'], ['no-new-privileges'], false);
      
      expect(builder.config.HostConfig.ReadonlyRootfs).toBe(true);
      expect(builder.config.HostConfig.CapDrop).toEqual(['ALL']);
      expect(builder.config.HostConfig.CapAdd).toEqual(['CHOWN']);
      expect(builder.config.HostConfig.SecurityOpt).toEqual(['no-new-privileges']);
      expect(builder.config.HostConfig.NoNewPrivileges).toBe(false);
    });

    it('should set memory limits', () => {
      const builder = new SandboxContainerBuilder();
      builder.setMemoryLimits(1024 * 1024 * 1024, 2048 * 1024 * 1024);
      
      expect(builder.config.HostConfig.Memory).toBe(1024 * 1024 * 1024);
      expect(builder.config.HostConfig.MemorySwap).toBe(2048 * 1024 * 1024);
    });

    it('should set memory limits with default swap', () => {
      const builder = new SandboxContainerBuilder();
      builder.setMemoryLimits(1024 * 1024 * 1024);
      
      expect(builder.config.HostConfig.Memory).toBe(1024 * 1024 * 1024);
      expect(builder.config.HostConfig.MemorySwap).toBe(1024 * 1024 * 1024);
    });

    it('should set CPU limits', () => {
      const builder = new SandboxContainerBuilder();
      builder.setCpuLimits(1024);
      
      expect(builder.config.HostConfig.CpuShares).toBe(1024);
    });

    it('should set PIDs limit', () => {
      const builder = new SandboxContainerBuilder();
      builder.setPidsLimit(512);
      
      expect(builder.config.HostConfig.PidsLimit).toBe(512);
    });

    it('should configure network settings', () => {
      const builder = new SandboxContainerBuilder();
      builder.setNetworkSettings('host', ['example.com'], ['1.1.1.1']);
      
      expect(builder.config.HostConfig.NetworkMode).toBe('host');
      expect(builder.config.HostConfig.DnsSearch).toEqual(['example.com']);
      expect(builder.config.HostConfig.Dns).toEqual(['1.1.1.1']);
    });

    it('should add volume bind', () => {
      const builder = new SandboxContainerBuilder();
      builder.addVolumeBind('/host/path', '/container/path', 'ro');
      
      expect(builder.config.HostConfig.Binds).toContain('/host/path:/container/path:ro');
    });

    it('should add port binding', () => {
      const builder = new SandboxContainerBuilder();
      builder.addPortBinding(3000, 3000, 'tcp');
      
      expect(builder.config.HostConfig.PortBindings['3000/tcp']).toBeDefined();
      expect(builder.config.HostConfig.PortBindings['3000/tcp'][0].HostPort).toBe('3000');
      expect(builder.config.ExposedPorts['3000/tcp']).toBeDefined();
    });

    it('should add multiple port bindings', () => {
      const builder = new SandboxContainerBuilder();
      builder.addPortBindings([3000, { containerPort: 8080, hostPort: 8080, protocol: 'tcp' }]);
      
      expect(builder.config.HostConfig.PortBindings['3000/tcp']).toBeDefined();
      expect(builder.config.HostConfig.PortBindings['8080/tcp']).toBeDefined();
    });

    it('should add tmpfs mount', () => {
      const builder = new SandboxContainerBuilder();
      builder.addTmpfsMount('/tmp', 'rw,size=100m');
      
      expect(builder.config.HostConfig.Tmpfs['/tmp']).toBe('rw,size=100m');
    });

    it('should add ulimit', () => {
      const builder = new SandboxContainerBuilder();
      builder.addUlimit('nofile', 1024, 2048);
      
      expect(builder.config.HostConfig.Ulimits).toContainEqual({
        Name: 'nofile',
        Soft: 1024,
        Hard: 2048
      });
    });

    it('should set multiple ulimits', () => {
      const builder = new SandboxContainerBuilder();
      const ulimits = [
        { Name: 'nofile', Soft: 1024, Hard: 2048 },
        { Name: 'nproc', Soft: 256, Hard: 512 }
      ];
      builder.setUlimits(ulimits);
      
      expect(builder.config.HostConfig.Ulimits).toEqual(ulimits);
    });

    it('should set auto remove', () => {
      const builder = new SandboxContainerBuilder();
      builder.setAutoRemove(true);
      
      expect(builder.config.HostConfig.AutoRemove).toBe(true);
    });

    it('should add label', () => {
      const builder = new SandboxContainerBuilder();
      builder.addLabel('key', 'value');
      
      expect(builder.config.Labels.key).toBe('value');
    });

    it('should set multiple labels', () => {
      const builder = new SandboxContainerBuilder();
      builder.setLabels({ key1: 'value1', key2: 'value2' });
      
      expect(builder.config.Labels.key1).toBe('value1');
      expect(builder.config.Labels.key2).toBe('value2');
    });

    it('should build and return validated config', () => {
      const builder = new SandboxContainerBuilder();
      builder.setImage('test-image');
      builder.setName('test-container');
      
      const config = builder.build();
      
      expect(config.Image).toBe('test-image');
      expect(config.name).toBe('test-container');
      expect(config).not.toBe(builder.config); // Should be a copy
    });
  });

  describe('SandboxContainerBuilder', () => {
    it('should add container type label when building', () => {
      const builder = new SandboxContainerBuilder();
      builder.setImage('test-image');
      builder.setName('test-container');
      
      const config = builder.build();
      
      expect(config.Labels['container.type']).toBe('sandbox');
    });
  });

  describe('ContainerDirector', () => {
    let director;
    let builder;

    beforeEach(() => {
      builder = new SandboxContainerBuilder();
      director = new ContainerDirector(builder);
    });

    it('should set builder', () => {
      const newBuilder = new SandboxContainerBuilder();
      const result = director.setBuilder(newBuilder);
      
      expect(result).toBe(director);
      expect(director.builder).toBe(newBuilder);
    });

    it('should throw error when setting invalid builder', () => {
      expect(() => director.setBuilder({})).toThrow('Builder must be an instance of ContainerBuilderBase');
    });

    it('should build sandbox container with all configurations', () => {
      const projectId = 'test-project';
      const containerName = 'test-container';
      const workspacePath = '/workspace';
      const imageName = 'test-image';
      const config = {
        containerMemory: 1024 * 1024 * 1024,
        containerCpu: 1.0
      };
      
      const containerConfig = director.buildSandboxContainer(
        projectId,
        containerName,
        workspacePath,
        imageName,
        config
      );
      
      expect(containerConfig.Image).toBe(imageName);
      expect(containerConfig.name).toBe(containerName);
      expect(containerConfig.Hostname).toBe('sandbox');
      expect(containerConfig.WorkingDir).toBe('/workspace');
      expect(containerConfig.User).toBe('root');
      expect(containerConfig.HostConfig.Memory).toBe(config.containerMemory);
      expect(containerConfig.Labels['project.id']).toBe(projectId);
      expect(containerConfig.Labels['container.type']).toBe('sandbox');
    });

    it('should reset builder before building', () => {
      const builder = new SandboxContainerBuilder();
      builder.setImage('old-image');
      builder.setName('old-name');
      
      const director = new ContainerDirector(builder);
      const config = {
        containerMemory: 1024 * 1024 * 1024,
        containerCpu: 1.0
      };
      
      director.buildSandboxContainer('project', 'container', '/workspace', 'new-image', config);
      
      expect(builder.config.Image).toBe('new-image');
      expect(builder.config.name).toBe('container');
    });
  });

  describe('ContainerBuilder (Backward Compatibility)', () => {
    it('should create sandbox configuration', () => {
      const builder = new ContainerBuilder();
      const projectId = 'test-project';
      const containerName = 'test-container';
      const workspacePath = '/workspace';
      const config = {
        IMAGE_NAME: 'test-image',
        containerMemory: 1024 * 1024 * 1024,
        containerCpu: 1.0
      };
      
      builder.createSandboxConfiguration(projectId, containerName, workspacePath, config);
      const containerConfig = builder.build();
      
      expect(containerConfig.Image).toBe(config.IMAGE_NAME);
      expect(containerConfig.name).toBe(containerName);
      expect(containerConfig.Labels['project.id']).toBe(projectId);
    });

    it('should clone builder configuration', () => {
      const builder = new ContainerBuilder();
      builder.setImage('test-image');
      builder.setName('test-container');
      builder.addLabel('key', 'value');
      
      const cloned = builder.clone();
      
      expect(cloned).toBeInstanceOf(ContainerBuilder);
      expect(cloned.config.Image).toBe('test-image');
      expect(cloned.config.name).toBe('test-container');
      expect(cloned.config.Labels.key).toBe('value');
      expect(cloned.config).not.toBe(builder.config); // Should be a copy
      
      // Modify clone should not affect original
      cloned.setImage('new-image');
      expect(builder.config.Image).toBe('test-image');
    });
  });
});
