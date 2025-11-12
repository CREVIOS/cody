/**
 * Tests for Builder Pattern - Container Builder
 * 
 * This test file validates the Builder pattern implementation
 * for Docker container configuration.
 */

const {
  ContainerConfig,
  ContainerBuilderBase,
  SandboxContainerBuilder,
  ContainerDirector
} = require('../services/containerBuilder');

describe('Container Builder Pattern', () => {
  let builder;
  let director;

  beforeEach(() => {
    builder = new SandboxContainerBuilder();
    director = new ContainerDirector(builder);
  });

  describe('ContainerConfig - Product', () => {
    test('should create empty configuration', () => {
      const config = new ContainerConfig();
      expect(config.Image).toBeNull();
      expect(config.name).toBeNull();
      expect(config.HostConfig).toBeDefined();
    });

    test('should validate required fields', () => {
      const config = new ContainerConfig();
      expect(() => config.validate()).toThrow('Container image is required');
      
      config.Image = 'test-image';
      expect(() => config.validate()).toThrow('Container name is required');
      
      config.name = 'test-container';
      expect(() => config.validate()).not.toThrow();
    });

    test('should return deep copy of configuration', () => {
      const config = new ContainerConfig();
      config.Image = 'test-image';
      config.name = 'test-container';
      
      const configCopy = config.getConfig();
      configCopy.Image = 'modified';
      
      expect(config.Image).toBe('test-image'); // Original unchanged
      expect(configCopy.Image).toBe('modified');
    });
  });

  describe('SandboxContainerBuilder - Concrete Builder', () => {
    test('should build configuration with method chaining', () => {
      const config = builder
        .setImage('test-image:latest')
        .setName('test-container')
        .setHostname('sandbox')
        .setMemoryLimits(1024 * 1024 * 1024)
        .addPortBinding(3000)
        .build();
      
      expect(config.Image).toBe('test-image:latest');
      expect(config.name).toBe('test-container');
      expect(config.Hostname).toBe('sandbox');
      expect(config.HostConfig.Memory).toBe(1024 * 1024 * 1024);
      expect(config.HostConfig.PortBindings['3000/tcp']).toBeDefined();
    });

    test('should validate required fields before building', () => {
      builder.setName('test-container');
      // Missing Image - should throw error
      expect(() => builder.build()).toThrow('Container image is required');
      
      builder.setImage('test-image');
      expect(() => builder.build()).not.toThrow();
    });

    test('should support reset for building multiple configurations', () => {
      builder.setImage('image1').setName('container1').build();
      builder.reset();
      const config2 = builder.setImage('image2').setName('container2').build();
      
      expect(config2.Image).toBe('image2');
      expect(config2.name).toBe('container2');
    });

    test('should set environment variables', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setEnvironmentVariables([
          'NODE_ENV=production',
          'PORT=3000'
        ])
        .build();
      
      expect(config.Env).toContain('NODE_ENV=production');
      expect(config.Env).toContain('PORT=3000');
    });

    test('should add multiple port bindings', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addPortBindings([3000, 3001, 8080])
        .build();
      
      expect(config.HostConfig.PortBindings['3000/tcp']).toBeDefined();
      expect(config.HostConfig.PortBindings['3001/tcp']).toBeDefined();
      expect(config.HostConfig.PortBindings['8080/tcp']).toBeDefined();
    });

    test('should configure security settings', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setSecuritySettings(
          false, // readonlyRootfs
          ['ALL'], // capDrop
          ['CHOWN', 'SETUID'], // capAdd
          ['no-new-privileges'], // securityOpt
          true // noNewPrivileges
        )
        .build();
      
      expect(config.HostConfig.CapDrop).toContain('ALL');
      expect(config.HostConfig.CapAdd).toContain('CHOWN');
      expect(config.HostConfig.SecurityOpt).toContain('no-new-privileges');
    });

    test('should add volume binds', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addVolumeBind('/host/path', '/container/path', 'rw')
        .build();
      
      expect(config.HostConfig.Binds).toContain('/host/path:/container/path:rw');
    });

    test('should add labels', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addLabel('project.id', 'project-123')
        .addLabel('service', 'sandbox')
        .build();
      
      expect(config.Labels['project.id']).toBe('project-123');
      expect(config.Labels['service']).toBe('sandbox');
    });
  });

  describe('ContainerDirector - Director', () => {
    test('director should build complete sandbox configuration', () => {
      const config = director.buildSandboxContainer(
        'project-123',
        'sandbox-project-123',
        '/workspace/path',
        'project-sandbox:latest',
        { containerMemory: 1024 * 1024 * 1024, containerCpu: 1.0 }
      );
      
      expect(config.Image).toBe('project-sandbox:latest');
      expect(config.name).toBe('sandbox-project-123');
      expect(config.Hostname).toBe('sandbox');
      expect(config.Labels['project.id']).toBe('project-123');
      expect(config.Labels['service']).toBe('sandbox');
      expect(config.HostConfig.Memory).toBe(1024 * 1024 * 1024);
      expect(config.WorkingDir).toBe('/workspace');
    });

    test('director should set builder correctly', () => {
      const newBuilder = new SandboxContainerBuilder();
      director.setBuilder(newBuilder);
      
      expect(director.builder).toBe(newBuilder);
    });

    test('director should throw error for invalid builder', () => {
      expect(() => director.setBuilder({})).toThrow('Builder must be an instance of ContainerBuilderBase');
    });

    test('director should configure all required settings', () => {
      const config = director.buildSandboxContainer(
        'project-123',
        'sandbox-project-123',
        '/workspace/path',
        'project-sandbox:latest',
        { containerMemory: 512 * 1024 * 1024, containerCpu: 0.5 }
      );
      
      // Check environment variables
      expect(config.Env).toContain('PROJECT_ID=project-123');
      expect(config.Env).toContain('NODE_ENV=development');
      
      // Check volume bind
      expect(config.HostConfig.Binds).toContain('/workspace/path:/workspace:rw');
      
      // Check port bindings
      expect(config.HostConfig.PortBindings['22/tcp']).toBeDefined();
      expect(config.HostConfig.PortBindings['3000/tcp']).toBeDefined();
      
      // Check tmpfs mounts
      expect(config.HostConfig.Tmpfs['/tmp']).toBeDefined();
    });
  });

  describe('Builder Pattern Benefits', () => {
    test('should support fluent interface (method chaining)', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setHostname('sandbox')
        .setMemoryLimits(1024 * 1024 * 1024)
        .setCpuLimits(1024)
        .addPortBinding(3000)
        .addLabel('test', 'value')
        .build();
      
      expect(config.Image).toBe('test-image');
      expect(config.name).toBe('test-container');
    });

    test('should allow step-by-step construction', () => {
      builder.setImage('test-image');
      builder.setName('test-container');
      builder.setHostname('sandbox');
      
      const config = builder.build();
      expect(config.Image).toBe('test-image');
      expect(config.name).toBe('test-container');
      expect(config.Hostname).toBe('sandbox');
    });

    test('should validate before building', () => {
      builder.setName('test-container');
      // Missing Image
      expect(() => builder.build()).toThrow();
      
      builder.setImage('test-image');
      expect(() => builder.build()).not.toThrow();
    });
  });
});

