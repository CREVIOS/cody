/**
 * Tests for State Pattern - Container States
 * 
 * This test file validates the State pattern implementation
 * for Docker container lifecycle management.
 */

const {
  ContainerState,
  CreatingState,
  StoppedState,
  RunningState,
  PausedState,
  RemovedState,
  ErrorState,
  ContainerWrapper
} = require('../services/containerStates');
const EventEmitter = require('events');

describe('Container State Pattern', () => {
  let mockContainer;
  let wrapper;

  beforeEach(() => {
    mockContainer = {
      id: 'container-123',
      start: jest.fn().mockResolvedValue(),
      stop: jest.fn().mockResolvedValue(),
      restart: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue(),
      unpause: jest.fn().mockResolvedValue(),
      pause: jest.fn().mockResolvedValue(),
      inspect: jest.fn().mockResolvedValue({
        State: { Status: 'stopped' }
      })
    };
    wrapper = new ContainerWrapper(mockContainer, 'test-project');
  });

  describe('StoppedState', () => {
    test('should transition from stopped to running', async () => {
      await wrapper.setState(new StoppedState(wrapper));
      expect(wrapper.getStateName()).toBe('stopped');
      expect(wrapper.canStart()).toBe(true);
      
      await wrapper.start();
      expect(mockContainer.start).toHaveBeenCalled();
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should allow restart from stopped state', async () => {
      await wrapper.setState(new StoppedState(wrapper));
      expect(wrapper.canRestart()).toBe(true);
      
      await wrapper.restart();
      expect(mockContainer.start).toHaveBeenCalled();
    });

    test('should allow removal from stopped state', async () => {
      await wrapper.setState(new StoppedState(wrapper));
      expect(wrapper.canRemove()).toBe(true);
      
      await wrapper.remove();
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(wrapper.getStateName()).toBe('removed');
    });

    test('should handle start errors and transition to error state', async () => {
      mockContainer.start.mockRejectedValueOnce(new Error('Start failed'));
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'exited', ExitCode: 1 }
      });
      
      await wrapper.setState(new StoppedState(wrapper));
      await expect(wrapper.start()).rejects.toThrow('Start failed');
      
      // State should transition to error state
      expect(wrapper.getStateName()).toBe('error');
    });
  });

  describe('RunningState', () => {
    test('should not allow start from running state', async () => {
      await wrapper.setState(new RunningState(wrapper));
      expect(wrapper.canStart()).toBe(false);
      
      await expect(wrapper.start()).rejects.toThrow('Cannot start container from running state');
    });

    test('should stop from running state', async () => {
      await wrapper.setState(new RunningState(wrapper));
      expect(wrapper.canStop()).toBe(true);
      
      await wrapper.stop();
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
      expect(wrapper.getStateName()).toBe('stopped');
    });

    test('should restart from running state', async () => {
      await wrapper.setState(new RunningState(wrapper));
      expect(wrapper.canRestart()).toBe(true);
      
      await wrapper.restart();
      expect(mockContainer.restart).toHaveBeenCalledWith({ t: 10 });
      // Should remain in running state after restart
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should allow force removal from running state', async () => {
      await wrapper.setState(new RunningState(wrapper));
      expect(wrapper.canRemove()).toBe(true);
      
      await wrapper.remove();
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(wrapper.getStateName()).toBe('removed');
    });
  });

  describe('PausedState', () => {
    test('should unpause (start) from paused state', async () => {
      await wrapper.setState(new PausedState(wrapper));
      expect(wrapper.canStart()).toBe(true);
      
      await wrapper.start();
      expect(mockContainer.unpause).toHaveBeenCalled();
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should stop from paused state (unpause then stop)', async () => {
      await wrapper.setState(new PausedState(wrapper));
      expect(wrapper.canStop()).toBe(true);
      
      await wrapper.stop();
      expect(mockContainer.unpause).toHaveBeenCalled();
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
      expect(wrapper.getStateName()).toBe('stopped');
    });
  });

  describe('RemovedState', () => {
    test('should not allow any operations from removed state', async () => {
      await wrapper.setState(new RemovedState(wrapper));
      
      await expect(wrapper.start()).rejects.toThrow('Cannot start a removed container');
      await expect(wrapper.inspect()).rejects.toThrow('Cannot inspect a removed container');
      
      // Stop and remove should be no-ops
      await wrapper.stop(); // Should not throw
      await wrapper.remove(); // Should not throw
    });
  });

  describe('ErrorState', () => {
    test('should allow recovery from error state', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'exited' }
      });
      mockContainer.start.mockResolvedValueOnce();
      
      await wrapper.start();
      expect(mockContainer.start).toHaveBeenCalled();
    });

    test('should allow removal from error state', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      expect(wrapper.canRemove()).toBe(true);
      await wrapper.remove();
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(wrapper.getStateName()).toBe('removed');
    });

    test('should store error information', () => {
      const error = new Error('Test error');
      const errorState = new ErrorState(wrapper, error);
      
      expect(errorState.getError()).toBe(error);
    });
  });

  describe('State Transitions', () => {
    test('should handle complete lifecycle transitions', async () => {
      // Start: stopped -> running
      await wrapper.setState(new StoppedState(wrapper));
      await wrapper.start();
      expect(wrapper.getStateName()).toBe('running');
      
      // Stop: running -> stopped
      await wrapper.stop();
      expect(wrapper.getStateName()).toBe('stopped');
      
      // Remove: stopped -> removed
      await wrapper.remove();
      expect(wrapper.getStateName()).toBe('removed');
    });

    test('should validate state capabilities correctly', async () => {
      await wrapper.setState(new StoppedState(wrapper));
      expect(wrapper.canStart()).toBe(true);
      expect(wrapper.canStop()).toBe(false);
      expect(wrapper.canRestart()).toBe(true);
      expect(wrapper.canRemove()).toBe(true);
      
      await wrapper.setState(new RunningState(wrapper));
      expect(wrapper.canStart()).toBe(false);
      expect(wrapper.canStop()).toBe(true);
      expect(wrapper.canRestart()).toBe(true);
      expect(wrapper.canRemove()).toBe(true);
    });
  });

  describe('Event Emission', () => {
    test('should emit state change events', (done) => {
      wrapper.on('state:changed', (data) => {
        expect(data.currentState).toBe('running');
        expect(data.previousState).toBe('stopped');
        expect(data.projectId).toBe('test-project');
        expect(data.timestamp).toBeDefined();
        done();
      });
      
      wrapper.setState(new StoppedState(wrapper))
        .then(() => wrapper.setState(new RunningState(wrapper)));
    });

    test('should track previous state', async () => {
      await wrapper.setState(new StoppedState(wrapper));
      await wrapper.setState(new RunningState(wrapper));
      
      // Previous state should be tracked
      expect(wrapper.previousState).toBe('stopped');
    });
  });

  describe('ContainerWrapper Integration', () => {
    test('should initialize to stopped state', async () => {
      await wrapper.initialize('/workspace/path', 2222);
      expect(wrapper.getStateName()).toBe('stopped');
      expect(wrapper.workspacePath).toBe('/workspace/path');
      expect(wrapper.sshPort).toBe(2222);
    });

    test('should provide container info', async () => {
      await wrapper.setState(new RunningState(wrapper));
      const info = wrapper.getInfo();
      
      expect(info.id).toBe('container-123');
      expect(info.projectId).toBe('test-project');
      expect(info.state).toBe('running');
      expect(info.capabilities.canStart).toBe(false);
      expect(info.capabilities.canStop).toBe(true);
    });

    test('should update activity timestamp', async () => {
      const initialActivity = wrapper.lastActivity;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      wrapper.updateActivity();
      
      expect(wrapper.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });
  });

  describe('State Pattern Benefits', () => {
    test('should eliminate conditional logic', async () => {
      // No if/else chains needed - state handles behavior
      await wrapper.setState(new StoppedState(wrapper));
      await wrapper.start(); // State knows how to start
      
      await wrapper.setState(new RunningState(wrapper));
      await wrapper.stop(); // State knows how to stop
    });

    test('should prevent invalid operations', async () => {
      await wrapper.setState(new RunningState(wrapper));
      
      // Cannot start from running state
      await expect(wrapper.start()).rejects.toThrow();
      
      // But can stop
      await expect(wrapper.stop()).resolves.not.toThrow();
    });

    test('should allow easy extension with new states', () => {
      // New state can be added without modifying existing states
      class CustomState extends ContainerState {
        getStateName() {
          return 'custom';
        }
      }
      
      const customState = new CustomState(wrapper);
      expect(customState.getStateName()).toBe('custom');
    });
  });
});

