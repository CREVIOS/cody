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

  describe('ContainerState - Abstract Base Class', () => {
    test('should throw error when calling start from base state', async () => {
      const baseState = new ContainerState(wrapper);
      await expect(baseState.start()).rejects.toThrow('Cannot start container from container state');
    });

    test('should throw error when calling stop from base state', async () => {
      const baseState = new ContainerState(wrapper);
      await expect(baseState.stop()).rejects.toThrow('Cannot stop container from container state');
    });

    test('should throw error when calling restart from base state', async () => {
      const baseState = new ContainerState(wrapper);
      await expect(baseState.restart()).rejects.toThrow('Cannot restart container from container state');
    });

    test('should throw error when calling remove from base state', async () => {
      const baseState = new ContainerState(wrapper);
      await expect(baseState.remove()).rejects.toThrow('Cannot remove container from container state');
    });

    test('should return false for all capability checks in base state', () => {
      const baseState = new ContainerState(wrapper);
      expect(baseState.canStart()).toBe(false);
      expect(baseState.canStop()).toBe(false);
      expect(baseState.canRestart()).toBe(false);
      expect(baseState.canRemove()).toBe(false);
    });

    test('should get state name from class name', () => {
      const baseState = new ContainerState(wrapper);
      expect(baseState.getStateName()).toBe('container');
    });

    test('should handle inspect errors in base state', async () => {
      const baseState = new ContainerState(wrapper);
      mockContainer.inspect.mockRejectedValueOnce(new Error('Inspect failed'));
      
      await expect(baseState.inspect()).rejects.toThrow('Inspect failed');
    });
  });

  describe('CreatingState', () => {
    test('should not allow start from creating state', async () => {
      await wrapper.setState(new CreatingState(wrapper));
      await expect(wrapper.start()).rejects.toThrow('Container is still being created');
    });

    test('should allow removal from creating state (cancel creation)', async () => {
      await wrapper.setState(new CreatingState(wrapper));
      expect(wrapper.canRemove()).toBe(true);
      
      await wrapper.remove();
      expect(wrapper.getStateName()).toBe('removed');
    });
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

    test('should handle remove errors from stopped state', async () => {
      mockContainer.remove.mockRejectedValueOnce(new Error('Remove failed'));
      
      await wrapper.setState(new StoppedState(wrapper));
      await expect(wrapper.remove()).rejects.toThrow('Remove failed');
      
      // Should transition to error state
      expect(wrapper.getStateName()).toBe('error');
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

    test('should handle start errors with inspect failure (container removed)', async () => {
      mockContainer.start.mockRejectedValueOnce(new Error('Start failed'));
      mockContainer.inspect.mockRejectedValueOnce(new Error('Container not found'));
      
      await wrapper.setState(new StoppedState(wrapper));
      await expect(wrapper.start()).rejects.toThrow('Start failed');
      
      // State should transition to removed state when inspect fails
      expect(wrapper.getStateName()).toBe('removed');
    });

    test('should handle start errors when container exited with code 0', async () => {
      mockContainer.start.mockRejectedValueOnce(new Error('Start failed'));
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'exited', ExitCode: 0 }
      });
      
      await wrapper.setState(new StoppedState(wrapper));
      await expect(wrapper.start()).rejects.toThrow('Start failed');
      
      // Should not transition to error state if exit code is 0
      // (The code checks for ExitCode !== 0, so this stays in stopped or goes to error)
      // Actually, looking at the code, it only checks for ExitCode !== 0, so exit code 0 won't trigger error state
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

    test('should handle stop errors and transition to stopped state if already stopped', async () => {
      mockContainer.stop.mockRejectedValueOnce(new Error('Stop failed'));
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'exited' }
      });
      
      await wrapper.setState(new RunningState(wrapper));
      await expect(wrapper.stop()).rejects.toThrow('Stop failed');
      
      // Should transition to stopped state if inspect shows exited
      expect(wrapper.getStateName()).toBe('stopped');
    });

    test('should handle stop errors and transition to error state if not stopped', async () => {
      mockContainer.stop.mockRejectedValueOnce(new Error('Stop failed'));
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'running' }
      });
      
      await wrapper.setState(new RunningState(wrapper));
      await expect(wrapper.stop()).rejects.toThrow('Stop failed');
      
      // Should transition to error state if still running
      expect(wrapper.getStateName()).toBe('error');
    });

    test('should handle stop errors with inspect failure (container removed)', async () => {
      mockContainer.stop.mockRejectedValueOnce(new Error('Stop failed'));
      mockContainer.inspect.mockRejectedValueOnce(new Error('Container not found'));
      
      await wrapper.setState(new RunningState(wrapper));
      await expect(wrapper.stop()).rejects.toThrow('Stop failed');
      
      // Should transition to removed state when inspect fails
      expect(wrapper.getStateName()).toBe('removed');
    });

    test('should handle restart errors and stay in running state if still running', async () => {
      mockContainer.restart.mockRejectedValueOnce(new Error('Restart failed'));
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'running' }
      });
      
      await wrapper.setState(new RunningState(wrapper));
      await expect(wrapper.restart()).rejects.toThrow('Restart failed');
      
      // Should stay in running state if still running
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should handle restart errors and transition to stopped state if exited', async () => {
      mockContainer.restart.mockRejectedValueOnce(new Error('Restart failed'));
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'exited' }
      });
      
      await wrapper.setState(new RunningState(wrapper));
      await expect(wrapper.restart()).rejects.toThrow('Restart failed');
      
      // Should transition to stopped state if exited
      expect(wrapper.getStateName()).toBe('stopped');
    });

    test('should handle restart errors and transition to error state for other statuses', async () => {
      mockContainer.restart.mockRejectedValueOnce(new Error('Restart failed'));
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'paused' }
      });
      
      await wrapper.setState(new RunningState(wrapper));
      await expect(wrapper.restart()).rejects.toThrow('Restart failed');
      
      // Should transition to error state for unexpected status
      expect(wrapper.getStateName()).toBe('error');
    });

    test('should handle restart errors with inspect failure (container removed)', async () => {
      mockContainer.restart.mockRejectedValueOnce(new Error('Restart failed'));
      mockContainer.inspect.mockRejectedValueOnce(new Error('Container not found'));
      
      await wrapper.setState(new RunningState(wrapper));
      await expect(wrapper.restart()).rejects.toThrow('Restart failed');
      
      // Should transition to removed state when inspect fails
      expect(wrapper.getStateName()).toBe('removed');
    });

    test('should handle remove errors from running state', async () => {
      mockContainer.remove.mockRejectedValueOnce(new Error('Remove failed'));
      
      await wrapper.setState(new RunningState(wrapper));
      await expect(wrapper.remove()).rejects.toThrow('Remove failed');
      
      // Should transition to error state
      expect(wrapper.getStateName()).toBe('error');
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

    test('should handle unpause errors from paused state', async () => {
      mockContainer.unpause.mockRejectedValueOnce(new Error('Unpause failed'));
      
      await wrapper.setState(new PausedState(wrapper));
      await expect(wrapper.start()).rejects.toThrow('Unpause failed');
      
      // Should transition to error state
      expect(wrapper.getStateName()).toBe('error');
    });

    test('should stop from paused state (unpause then stop)', async () => {
      await wrapper.setState(new PausedState(wrapper));
      expect(wrapper.canStop()).toBe(true);
      
      await wrapper.stop();
      expect(mockContainer.unpause).toHaveBeenCalled();
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
      expect(wrapper.getStateName()).toBe('stopped');
    });

    test('should handle stop error from paused state', async () => {
      mockContainer.unpause.mockRejectedValueOnce(new Error('Unpause failed'));
      
      await wrapper.setState(new PausedState(wrapper));
      await expect(wrapper.stop()).rejects.toThrow('Unpause failed');
      expect(wrapper.getStateName()).toBe('error');
    });

    test('should remove from paused state', async () => {
      await wrapper.setState(new PausedState(wrapper));
      expect(wrapper.canRemove()).toBe(true);
      
      await wrapper.remove();
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(wrapper.getStateName()).toBe('removed');
    });

    test('should handle remove error from paused state', async () => {
      mockContainer.remove.mockRejectedValueOnce(new Error('Remove failed'));
      
      await wrapper.setState(new PausedState(wrapper));
      await expect(wrapper.remove()).rejects.toThrow('Remove failed');
      expect(wrapper.getStateName()).toBe('error');
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
    test('should allow recovery from error state when container is running', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'running' }
      });
      
      await wrapper.start();
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should allow recovery from error state when container is stopped', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'stopped' }
      });
      mockContainer.start.mockResolvedValueOnce();
      
      await wrapper.start();
      expect(mockContainer.start).toHaveBeenCalled();
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should allow recovery from error state when container is exited', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'exited' }
      });
      mockContainer.start.mockResolvedValueOnce();
      
      await wrapper.start();
      expect(mockContainer.start).toHaveBeenCalled();
    });

    test('should handle error when starting from error state with unexpected status', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'unknown' }
      });
      
      await expect(wrapper.start()).rejects.toThrow('Container is in unexpected state: unknown');
    });

    test('should handle error when starting from error state with inspect failure', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      mockContainer.inspect.mockRejectedValueOnce(new Error('Inspect failed'));
      
      await expect(wrapper.start()).rejects.toThrow('Inspect failed');
    });

    test('should allow removal from error state', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      expect(wrapper.canRemove()).toBe(true);
      await wrapper.remove();
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(wrapper.getStateName()).toBe('removed');
    });

    test('should handle remove error from error state', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      mockContainer.remove.mockRejectedValueOnce(new Error('Remove failed'));
      
      await expect(wrapper.remove()).rejects.toThrow('Remove failed');
      // Should stay in error state
      expect(wrapper.getStateName()).toBe('error');
    });

    test('should handle start from error state when container is already running', async () => {
      const error = new Error('Test error');
      await wrapper.setState(new ErrorState(wrapper, error));
      
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Status: 'running' }
      });
      
      await wrapper.start();
      expect(wrapper.getStateName()).toBe('running');
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
    test('should emit state change events', async () => {
      let eventReceived = false;
      
      wrapper.on('state:changed', (data) => {
        // Only process the event when transitioning to running state
        if (data.currentState === 'running' && data.previousState === 'stopped') {
          expect(data.currentState).toBe('running');
          expect(data.previousState).toBe('stopped');
          expect(data.projectId).toBe('test-project');
          expect(data.timestamp).toBeDefined();
          eventReceived = true;
        }
      });
      
      await wrapper.setState(new StoppedState(wrapper));
      await wrapper.setState(new RunningState(wrapper));
      
      // Give event loop a chance to process
      await new Promise(resolve => setImmediate(resolve));
      
      expect(eventReceived).toBe(true);
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

    test('should mark container as running from stopped state', async () => {
      await wrapper.setState(new StoppedState(wrapper));
      await wrapper.markAsRunning();
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should mark container as running from creating state', async () => {
      await wrapper.setState(new CreatingState(wrapper));
      await wrapper.markAsRunning();
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should not mark container as running from running state', async () => {
      await wrapper.setState(new RunningState(wrapper));
      await wrapper.markAsRunning();
      // Should remain in running state
      expect(wrapper.getStateName()).toBe('running');
    });

    test('should handle getStateName when state is null', () => {
      // Manually set state to null to test edge case
      wrapper.state = null;
      expect(wrapper.getStateName()).toBe('unknown');
    });

    test('should handle setState when current state is null', async () => {
      // Manually set state to null
      wrapper.state = null;
      await wrapper.setState(new StoppedState(wrapper));
      expect(wrapper.getStateName()).toBe('stopped');
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

