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
  ContainerDirector,
  ContainerBuilder
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

    test('should add volume bind with default mode (rw)', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addVolumeBind('/host/path', '/container/path') // mode defaults to 'rw'
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

    test('should add individual environment variable', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addEnvironmentVariable('NODE_ENV', 'production')
        .addEnvironmentVariable('PORT', '3000')
        .build();
      
      expect(config.Env).toContain('NODE_ENV=production');
      expect(config.Env).toContain('PORT=3000');
    });

    test('should handle addVolumeBind when Binds is undefined', () => {
      const testBuilder = new SandboxContainerBuilder();
      // Manually clear Binds to test the undefined case
      testBuilder.config.HostConfig.Binds = undefined;
      const config = testBuilder
        .setImage('test-image')
        .setName('test-container')
        .addVolumeBind('/host/path', '/container/path', 'rw')
        .build();
      
      expect(config.HostConfig.Binds).toContain('/host/path:/container/path:rw');
    });

    test('should handle addPortBinding when PortBindings is undefined', () => {
      const testBuilder = new SandboxContainerBuilder();
      // Manually clear PortBindings to test the undefined case
      testBuilder.config.HostConfig.PortBindings = undefined;
      const config = testBuilder
        .setImage('test-image')
        .setName('test-container')
        .addPortBinding(3000, 3000, 'tcp')
        .build();
      
      expect(config.HostConfig.PortBindings['3000/tcp']).toBeDefined();
    });

    test('should add port bindings with object format', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addPortBindings([
          3000,
          { containerPort: 8080, hostPort: 8080, protocol: 'tcp' },
          { containerPort: 9000, hostPort: 9000, protocol: 'udp' }
        ])
        .build();
      
      expect(config.HostConfig.PortBindings['3000/tcp']).toBeDefined();
      expect(config.HostConfig.PortBindings['8080/tcp']).toBeDefined();
      expect(config.HostConfig.PortBindings['9000/udp']).toBeDefined();
    });

    test('should handle addPortBindings with mixed types including invalid', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addPortBindings([
          3000,
          { containerPort: 8080, hostPort: 8080, protocol: 'tcp' },
          'invalid' // This will be skipped (not number or object)
        ])
        .build();
      
      expect(config.HostConfig.PortBindings['3000/tcp']).toBeDefined();
      expect(config.HostConfig.PortBindings['8080/tcp']).toBeDefined();
      // Invalid entry should be ignored
    });

    test('should handle addTmpfsMount when Tmpfs is undefined', () => {
      const testBuilder = new SandboxContainerBuilder();
      // Manually clear Tmpfs to test the undefined case
      testBuilder.config.HostConfig.Tmpfs = undefined;
      const config = testBuilder
        .setImage('test-image')
        .setName('test-container')
        .addTmpfsMount('/tmp', 'rw,size=100m')
        .build();
      
      expect(config.HostConfig.Tmpfs['/tmp']).toBe('rw,size=100m');
    });

    test('should handle addUlimit when Ulimits is undefined', () => {
      const testBuilder = new SandboxContainerBuilder();
      // Manually clear Ulimits to test the undefined case
      testBuilder.config.HostConfig.Ulimits = undefined;
      const config = testBuilder
        .setImage('test-image')
        .setName('test-container')
        .addUlimit('nofile', 1024, 2048)
        .build();
      
      expect(config.HostConfig.Ulimits).toHaveLength(1);
      expect(config.HostConfig.Ulimits[0]).toEqual({ Name: 'nofile', Soft: 1024, Hard: 2048 });
    });

    test('should handle addUlimit when Ulimits is null', () => {
      const testBuilder = new SandboxContainerBuilder();
      // Manually set Ulimits to null to test the null case
      testBuilder.config.HostConfig.Ulimits = null;
      const config = testBuilder
        .setImage('test-image')
        .setName('test-container')
        .addUlimit('nofile', 1024, 2048)
        .build();
      
      expect(config.HostConfig.Ulimits).toHaveLength(1);
      expect(config.HostConfig.Ulimits[0]).toEqual({ Name: 'nofile', Soft: 1024, Hard: 2048 });
    });

    test('should configure TTY settings with custom values', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setTtySettings(false, false, false, false, false, true)
        .build();
      
      expect(config.AttachStdin).toBe(false);
      expect(config.AttachStdout).toBe(false);
      expect(config.AttachStderr).toBe(false);
      expect(config.Tty).toBe(false);
      expect(config.OpenStdin).toBe(false);
      expect(config.StdinOnce).toBe(true);
    });

    test('should configure TTY settings with default values', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setTtySettings() // All defaults
        .build();
      
      expect(config.AttachStdin).toBe(true);
      expect(config.AttachStdout).toBe(true);
      expect(config.AttachStderr).toBe(true);
      expect(config.Tty).toBe(true);
      expect(config.OpenStdin).toBe(true);
      expect(config.StdinOnce).toBe(false);
    });

    test('should set security settings with custom values', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setSecuritySettings(
          true, // readonlyRootfs
          ['NET_RAW'], // capDrop
          ['NET_BIND_SERVICE'], // capAdd
          ['apparmor:profile'], // securityOpt
          false // noNewPrivileges
        )
        .build();
      
      expect(config.HostConfig.ReadonlyRootfs).toBe(true);
      expect(config.HostConfig.CapDrop).toEqual(['NET_RAW']);
      expect(config.HostConfig.CapAdd).toEqual(['NET_BIND_SERVICE']);
      expect(config.HostConfig.SecurityOpt).toEqual(['apparmor:profile']);
      expect(config.HostConfig.NoNewPrivileges).toBe(false);
    });

    test('should set security settings with default values', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setSecuritySettings() // All defaults
        .build();
      
      expect(config.HostConfig.ReadonlyRootfs).toBe(false);
      expect(config.HostConfig.CapDrop).toEqual(['ALL']);
      expect(config.HostConfig.CapAdd).toEqual(['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE']);
      expect(config.HostConfig.SecurityOpt).toEqual(['no-new-privileges']);
      expect(config.HostConfig.NoNewPrivileges).toBe(true);
    });

    test('should set network settings with custom values', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setNetworkSettings('host', ['example.com'], ['1.1.1.1'])
        .build();
      
      expect(config.HostConfig.NetworkMode).toBe('host');
      expect(config.HostConfig.DnsSearch).toEqual(['example.com']);
      expect(config.HostConfig.Dns).toEqual(['1.1.1.1']);
    });

    test('should set network settings with default values', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setNetworkSettings() // All defaults
        .build();
      
      expect(config.HostConfig.NetworkMode).toBe('bridge');
      expect(config.HostConfig.DnsSearch).toEqual([]);
      expect(config.HostConfig.Dns).toEqual(['8.8.8.8', '8.8.4.4']);
    });

    test('should set memory limits with custom memorySwap', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setMemoryLimits(1024 * 1024 * 1024, 2048 * 1024 * 1024)
        .build();
      
      expect(config.HostConfig.Memory).toBe(1024 * 1024 * 1024);
      expect(config.HostConfig.MemorySwap).toBe(2048 * 1024 * 1024);
    });

    test('should set memory limits with default memorySwap (same as memory)', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setMemoryLimits(1024 * 1024 * 1024) // memorySwap defaults to memory
        .build();
      
      expect(config.HostConfig.Memory).toBe(1024 * 1024 * 1024);
      expect(config.HostConfig.MemorySwap).toBe(1024 * 1024 * 1024);
    });

    test('should add port binding with UDP protocol', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addPortBinding(53, 53, 'udp')
        .build();
      
      expect(config.HostConfig.PortBindings['53/udp']).toBeDefined();
      expect(config.ExposedPorts['53/udp']).toBeDefined();
    });

    test('should set multiple labels at once', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setLabels({
          'label1': 'value1',
          'label2': 'value2',
          'label3': 'value3'
        })
        .build();
      
      expect(config.Labels.label1).toBe('value1');
      expect(config.Labels.label2).toBe('value2');
      expect(config.Labels.label3).toBe('value3');
    });

    test('should merge labels when setting multiple', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .addLabel('existing', 'old')
        .setLabels({
          'new': 'value',
          'existing': 'new'
        })
        .build();
      
      expect(config.Labels.existing).toBe('new'); // Should be overwritten
      expect(config.Labels.new).toBe('value');
    });

    test('should set multiple ulimits at once', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setUlimits([
          { Name: 'nofile', Soft: 1024, Hard: 2048 },
          { Name: 'nproc', Soft: 256, Hard: 512 },
          { Name: 'fsize', Soft: 100000000, Hard: 100000000 }
        ])
        .build();
      
      expect(config.HostConfig.Ulimits).toHaveLength(3);
      expect(config.HostConfig.Ulimits[0].Name).toBe('nofile');
      expect(config.HostConfig.Ulimits[1].Name).toBe('nproc');
      expect(config.HostConfig.Ulimits[2].Name).toBe('fsize');
    });

    test('should set working directory and user', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setWorkingDirectory('/app')
        .setUser('appuser')
        .build();
      
      expect(config.WorkingDir).toBe('/app');
      expect(config.User).toBe('appuser');
    });

    test('should set auto remove flag', () => {
      const config = builder
        .setImage('test-image')
        .setName('test-container')
        .setAutoRemove(true)
        .build();
      
      expect(config.HostConfig.AutoRemove).toBe(true);
    });
  });

  describe('ContainerBuilderBase - Abstract Builder', () => {
    test('should prevent direct instantiation of abstract class', () => {
      expect(() => new ContainerBuilderBase()).toThrow('ContainerBuilderBase is abstract and cannot be instantiated');
    });
  });

  describe('ContainerBuilder - Backward Compatibility', () => {
    test('should create sandbox configuration using backward compatibility method', () => {
      const backwardBuilder = new ContainerBuilder();
      const config = backwardBuilder
        .createSandboxConfiguration(
          'project-123',
          'sandbox-project-123',
          '/workspace/path',
          {
            IMAGE_NAME: 'project-sandbox:latest',
            containerMemory: 1024 * 1024 * 1024,
            containerCpu: 1.0
          }
        )
        .build();
      
      expect(config.Image).toBe('project-sandbox:latest');
      expect(config.name).toBe('sandbox-project-123');
      expect(config.Hostname).toBe('sandbox');
      expect(config.Labels['project.id']).toBe('project-123');
      expect(config.WorkingDir).toBe('/workspace');
    });

    test('should clone builder configuration', () => {
      const originalBuilder = new ContainerBuilder();
      originalBuilder
        .setImage('test-image')
        .setName('test-container')
        .setHostname('sandbox')
        .addLabel('test', 'value');
      
      const clonedBuilder = originalBuilder.clone();
      
      // Check that cloned builder has the same config values
      // Note: After cloning, config is a plain object (not ContainerConfig instance)
      // but the values should be preserved
      expect(clonedBuilder.config.Image).toBe('test-image');
      expect(clonedBuilder.config.name).toBe('test-container');
      expect(clonedBuilder.config.Hostname).toBe('sandbox');
      expect(clonedBuilder.config.Labels.test).toBe('value');
      
      // Modify cloned builder - original should be unaffected
      clonedBuilder.setImage('modified-image');
      expect(originalBuilder.config.Image).toBe('test-image');
      expect(clonedBuilder.config.Image).toBe('modified-image');
      
      // Verify we can continue using builder methods on cloned builder
      clonedBuilder.setName('cloned-container');
      expect(clonedBuilder.config.name).toBe('cloned-container');
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

