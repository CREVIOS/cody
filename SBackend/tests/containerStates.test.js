/**
 * ContainerStates Test Suite
 * Tests the State Pattern implementation for container lifecycle management
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

describe('ContainerStates - State Pattern', () => {
  let mockDockerContainer;
  let containerWrapper;

  beforeEach(() => {
    mockDockerContainer = {
      id: 'container-123',
      inspect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      restart: jest.fn(),
      remove: jest.fn(),
      unpause: jest.fn()
    };
    
    containerWrapper = new ContainerWrapper(mockDockerContainer, 'test-project');
  });

  describe('ContainerState (Abstract Base)', () => {
    it('should get state name from class name', () => {
      const state = new StoppedState(containerWrapper);
      expect(state.getStateName()).toBe('stopped');
    });

    it('should throw error when calling start from base state', async () => {
      const state = new ContainerState(containerWrapper);
      await expect(state.start()).rejects.toThrow('Cannot start container from container state');
    });

    it('should throw error when calling stop from base state', async () => {
      const state = new ContainerState(containerWrapper);
      await expect(state.stop()).rejects.toThrow('Cannot stop container from container state');
    });

    it('should throw error when calling restart from base state', async () => {
      const state = new ContainerState(containerWrapper);
      await expect(state.restart()).rejects.toThrow('Cannot restart container from container state');
    });

    it('should throw error when calling remove from base state', async () => {
      const state = new ContainerState(containerWrapper);
      await expect(state.remove()).rejects.toThrow('Cannot remove container from container state');
    });

    it('should inspect container', async () => {
      const state = new StoppedState(containerWrapper);
      mockDockerContainer.inspect.mockResolvedValue({ State: { Status: 'exited' } });
      
      const result = await state.inspect();
      
      expect(result.State.Status).toBe('exited');
      expect(mockDockerContainer.inspect).toHaveBeenCalled();
    });

    it('should return false for canStart by default', () => {
      const state = new ContainerState(containerWrapper);
      expect(state.canStart()).toBe(false);
    });

    it('should return false for canStop by default', () => {
      const state = new ContainerState(containerWrapper);
      expect(state.canStop()).toBe(false);
    });

    it('should return false for canRestart by default', () => {
      const state = new ContainerState(containerWrapper);
      expect(state.canRestart()).toBe(false);
    });

    it('should return false for canRemove by default', () => {
      const state = new ContainerState(containerWrapper);
      expect(state.canRemove()).toBe(false);
    });

    it('should emit state changed event on enter', async () => {
      const state = new StoppedState(containerWrapper);
      const listener = jest.fn();
      containerWrapper.on('state:changed', listener);
      
      await state.onEnter();
      
      expect(listener).toHaveBeenCalled();
      const eventData = listener.mock.calls[0][0];
      expect(eventData.projectId).toBe('test-project');
      expect(eventData.currentState).toBe('stopped');
    });
  });

  describe('CreatingState', () => {
    it('should throw error when trying to start from creating state', async () => {
      const state = new CreatingState(containerWrapper);
      await expect(state.start()).rejects.toThrow('Container is still being created');
    });

    it('should allow removal from creating state', () => {
      const state = new CreatingState(containerWrapper);
      expect(state.canRemove()).toBe(true);
    });

    it('should transition to removed state when removed', async () => {
      const state = new CreatingState(containerWrapper);
      await state.remove();
      
      expect(containerWrapper.state).toBeInstanceOf(RemovedState);
    });
  });

  describe('StoppedState', () => {
    it('should start container and transition to running state', async () => {
      const state = new StoppedState(containerWrapper);
      mockDockerContainer.start.mockResolvedValue(undefined);
      
      await state.start();
      
      expect(mockDockerContainer.start).toHaveBeenCalled();
      expect(containerWrapper.state).toBeInstanceOf(RunningState);
    });

    it('should handle start errors and transition to error state', async () => {
      const state = new StoppedState(containerWrapper);
      const error = new Error('Start failed');
      mockDockerContainer.start.mockRejectedValue(error);
      mockDockerContainer.inspect.mockResolvedValue({ State: { Status: 'exited', ExitCode: 1 } });
      
      await expect(state.start()).rejects.toThrow('Start failed');
      expect(containerWrapper.state).toBeInstanceOf(ErrorState);
    });

    it('should handle start errors when container is removed', async () => {
      const state = new StoppedState(containerWrapper);
      const error = new Error('Container not found');
      mockDockerContainer.start.mockRejectedValue(error);
      mockDockerContainer.inspect.mockRejectedValue(new Error('Not found'));
      
      await expect(state.start()).rejects.toThrow('Container not found');
      expect(containerWrapper.state).toBeInstanceOf(RemovedState);
    });

    it('should restart container (which is just start from stopped)', async () => {
      const state = new StoppedState(containerWrapper);
      mockDockerContainer.start.mockResolvedValue(undefined);
      
      await state.restart();
      
      expect(mockDockerContainer.start).toHaveBeenCalled();
      expect(containerWrapper.state).toBeInstanceOf(RunningState);
    });

    it('should allow start, restart, and remove', () => {
      const state = new StoppedState(containerWrapper);
      expect(state.canStart()).toBe(true);
      expect(state.canRestart()).toBe(true);
      expect(state.canRemove()).toBe(true);
    });

    it('should remove container and transition to removed state', async () => {
      const state = new StoppedState(containerWrapper);
      mockDockerContainer.remove.mockResolvedValue(undefined);
      
      await state.remove();
      
      expect(mockDockerContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(containerWrapper.state).toBeInstanceOf(RemovedState);
    });

    it('should handle remove errors and transition to error state', async () => {
      const state = new StoppedState(containerWrapper);
      const error = new Error('Remove failed');
      mockDockerContainer.remove.mockRejectedValue(error);
      
      await expect(state.remove()).rejects.toThrow('Remove failed');
      expect(containerWrapper.state).toBeInstanceOf(ErrorState);
    });
  });

  describe('RunningState', () => {
    beforeEach(() => {
      containerWrapper.setState(new RunningState(containerWrapper));
    });

    it('should stop container and transition to stopped state', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.stop.mockResolvedValue(undefined);
      
      await state.stop();
      
      expect(mockDockerContainer.stop).toHaveBeenCalledWith({ t: 10 });
      expect(containerWrapper.state).toBeInstanceOf(StoppedState);
    });

    it('should handle stop errors when container is already stopped', async () => {
      const state = containerWrapper.state;
      const error = new Error('Stop failed');
      mockDockerContainer.stop.mockRejectedValue(error);
      mockDockerContainer.inspect.mockResolvedValue({ State: { Status: 'exited' } });
      
      await expect(state.stop()).rejects.toThrow('Stop failed');
      expect(containerWrapper.state).toBeInstanceOf(StoppedState);
    });

    it('should handle stop errors when container is removed', async () => {
      const state = containerWrapper.state;
      const error = new Error('Stop failed');
      mockDockerContainer.stop.mockRejectedValue(error);
      mockDockerContainer.inspect.mockRejectedValue(new Error('Not found'));
      
      await expect(state.stop()).rejects.toThrow('Stop failed');
      expect(containerWrapper.state).toBeInstanceOf(RemovedState);
    });

    it('should restart container', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.restart.mockResolvedValue(undefined);
      
      await state.restart();
      
      expect(mockDockerContainer.restart).toHaveBeenCalledWith({ t: 10 });
      expect(containerWrapper.state).toBeInstanceOf(RunningState);
    });

    it('should handle restart errors and transition to stopped state', async () => {
      const state = containerWrapper.state;
      const error = new Error('Restart failed');
      mockDockerContainer.restart.mockRejectedValue(error);
      mockDockerContainer.inspect.mockResolvedValue({ State: { Status: 'exited' } });
      
      await expect(state.restart()).rejects.toThrow('Restart failed');
      expect(containerWrapper.state).toBeInstanceOf(StoppedState);
    });

    it('should allow stop, restart, and remove', () => {
      const state = containerWrapper.state;
      expect(state.canStop()).toBe(true);
      expect(state.canRestart()).toBe(true);
      expect(state.canRemove()).toBe(true);
    });

    it('should force remove running container', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.remove.mockResolvedValue(undefined);
      
      await state.remove();
      
      expect(mockDockerContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(containerWrapper.state).toBeInstanceOf(RemovedState);
    });
  });

  describe('PausedState', () => {
    beforeEach(() => {
      containerWrapper.setState(new PausedState(containerWrapper));
    });

    it('should unpause container and transition to running state', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.unpause.mockResolvedValue(undefined);
      
      await state.start();
      
      expect(mockDockerContainer.unpause).toHaveBeenCalled();
      expect(containerWrapper.state).toBeInstanceOf(RunningState);
    });

    it('should stop paused container by unpausing then stopping', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.unpause.mockResolvedValue(undefined);
      mockDockerContainer.stop.mockResolvedValue(undefined);
      
      await state.stop();
      
      expect(mockDockerContainer.unpause).toHaveBeenCalled();
      expect(mockDockerContainer.stop).toHaveBeenCalledWith({ t: 10 });
      expect(containerWrapper.state).toBeInstanceOf(StoppedState);
    });

    it('should allow start, stop, and remove', () => {
      const state = containerWrapper.state;
      expect(state.canStart()).toBe(true);
      expect(state.canStop()).toBe(true);
      expect(state.canRemove()).toBe(true);
    });

    it('should force remove paused container', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.remove.mockResolvedValue(undefined);
      
      await state.remove();
      
      expect(mockDockerContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(containerWrapper.state).toBeInstanceOf(RemovedState);
    });
  });

  describe('RemovedState', () => {
    beforeEach(() => {
      containerWrapper.setState(new RemovedState(containerWrapper));
    });

    it('should throw error when trying to start removed container', async () => {
      const state = containerWrapper.state;
      await expect(state.start()).rejects.toThrow('Cannot start a removed container');
    });

    it('should do nothing when trying to stop removed container', async () => {
      const state = containerWrapper.state;
      await state.stop(); // Should not throw
    });

    it('should do nothing when trying to remove removed container', async () => {
      const state = containerWrapper.state;
      await state.remove(); // Should not throw
    });

    it('should throw error when trying to inspect removed container', async () => {
      const state = containerWrapper.state;
      await expect(state.inspect()).rejects.toThrow('Cannot inspect a removed container');
    });
  });

  describe('ErrorState', () => {
    beforeEach(() => {
      const error = new Error('Test error');
      containerWrapper.setState(new ErrorState(containerWrapper, error));
    });

    it('should store error', () => {
      const state = containerWrapper.state;
      expect(state.getError()).toBeInstanceOf(Error);
      expect(state.getError().message).toBe('Test error');
    });

    it('should recover from error state when container is running', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.inspect.mockResolvedValue({ State: { Status: 'running' } });
      
      await state.start();
      
      expect(containerWrapper.state).toBeInstanceOf(RunningState);
    });

    it('should recover from error state when container is stopped', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.inspect.mockResolvedValue({ State: { Status: 'exited' } });
      mockDockerContainer.start.mockResolvedValue(undefined);
      
      await state.start();
      
      expect(containerWrapper.state).toBeInstanceOf(RunningState);
    });

    it('should allow removal from error state', () => {
      const state = containerWrapper.state;
      expect(state.canRemove()).toBe(true);
    });

    it('should remove container from error state', async () => {
      const state = containerWrapper.state;
      mockDockerContainer.remove.mockResolvedValue(undefined);
      
      await state.remove();
      
      expect(containerWrapper.state).toBeInstanceOf(RemovedState);
    });
  });

  describe('ContainerWrapper', () => {
    it('should initialize with creating state', () => {
      expect(containerWrapper.state).toBeInstanceOf(CreatingState);
      expect(containerWrapper.projectId).toBe('test-project');
      expect(containerWrapper.dockerContainer).toBe(mockDockerContainer);
    });

    it('should get state name', () => {
      expect(containerWrapper.getStateName()).toBe('creating');
    });

    it('should set state and trigger transitions', async () => {
      const newState = new StoppedState(containerWrapper);
      const listener = jest.fn();
      containerWrapper.on('state:changed', listener);
      
      await containerWrapper.setState(newState);
      
      expect(containerWrapper.state).toBe(newState);
      expect(listener).toHaveBeenCalled();
    });

    it('should delegate start to current state', async () => {
      containerWrapper.setState(new StoppedState(containerWrapper));
      mockDockerContainer.start.mockResolvedValue(undefined);
      
      await containerWrapper.start();
      
      expect(mockDockerContainer.start).toHaveBeenCalled();
    });

    it('should delegate stop to current state', async () => {
      containerWrapper.setState(new RunningState(containerWrapper));
      mockDockerContainer.stop.mockResolvedValue(undefined);
      
      await containerWrapper.stop();
      
      expect(mockDockerContainer.stop).toHaveBeenCalled();
    });

    it('should delegate restart to current state', async () => {
      containerWrapper.setState(new RunningState(containerWrapper));
      mockDockerContainer.restart.mockResolvedValue(undefined);
      
      await containerWrapper.restart();
      
      expect(mockDockerContainer.restart).toHaveBeenCalled();
    });

    it('should delegate remove to current state', async () => {
      containerWrapper.setState(new StoppedState(containerWrapper));
      mockDockerContainer.remove.mockResolvedValue(undefined);
      
      await containerWrapper.remove();
      
      expect(mockDockerContainer.remove).toHaveBeenCalled();
    });

    it('should delegate inspect to current state', async () => {
      mockDockerContainer.inspect.mockResolvedValue({ State: { Status: 'exited' } });
      
      const result = await containerWrapper.inspect();
      
      expect(result.State.Status).toBe('exited');
    });

    it('should delegate capability checks to current state', () => {
      containerWrapper.setState(new StoppedState(containerWrapper));
      
      expect(containerWrapper.canStart()).toBe(true);
      expect(containerWrapper.canStop()).toBe(false);
      expect(containerWrapper.canRestart()).toBe(true);
      expect(containerWrapper.canRemove()).toBe(true);
    });

    it('should get container info', () => {
      containerWrapper.workspacePath = '/workspace';
      containerWrapper.sshPort = 2222;
      
      const info = containerWrapper.getInfo();
      
      expect(info.id).toBe('container-123');
      expect(info.projectId).toBe('test-project');
      expect(info.state).toBe('creating');
      expect(info.workspacePath).toBe('/workspace');
      expect(info.sshPort).toBe(2222);
      expect(info.capabilities).toBeDefined();
    });

    it('should initialize container wrapper', async () => {
      await containerWrapper.initialize('/workspace', 2222);
      
      expect(containerWrapper.workspacePath).toBe('/workspace');
      expect(containerWrapper.sshPort).toBe(2222);
      expect(containerWrapper.state).toBeInstanceOf(StoppedState);
    });

    it('should mark container as running', async () => {
      containerWrapper.setState(new StoppedState(containerWrapper));
      await containerWrapper.markAsRunning();
      
      expect(containerWrapper.state).toBeInstanceOf(RunningState);
    });

    it('should update activity timestamp', () => {
      const oldActivity = containerWrapper.lastActivity;
      
      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        containerWrapper.updateActivity();
        expect(containerWrapper.lastActivity.getTime()).toBeGreaterThan(oldActivity.getTime());
      }, 10);
    });
  });
});
