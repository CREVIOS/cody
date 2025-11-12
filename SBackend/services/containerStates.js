// containerStates.js - State Pattern for Container Lifecycle Management
const EventEmitter = require('events');

/**
 * Abstract base class for container states
 */
class ContainerState {
  constructor(containerWrapper) {
    this.containerWrapper = containerWrapper;
  }

  /**
   * Get the name of this state
   */
  getStateName() {
    return this.constructor.name.replace('State', '').toLowerCase();
  }

  /**
   * Start the container - default implementation throws error
   */
  async start() {
    throw new Error(`Cannot start container from ${this.getStateName()} state`);
  }

  /**
   * Stop the container - default implementation throws error
   */
  async stop() {
    throw new Error(`Cannot stop container from ${this.getStateName()} state`);
  }

  /**
   * Restart the container - default implementation throws error
   */
  async restart() {
    throw new Error(`Cannot restart container from ${this.getStateName()} state`);
  }

  /**
   * Remove the container - default implementation throws error
   */
  async remove() {
    throw new Error(`Cannot remove container from ${this.getStateName()} state`);
  }

  /**
   * Inspect the container - available in all states
   */
  async inspect() {
    try {
      return await this.containerWrapper.dockerContainer.inspect();
    } catch (error) {
      console.error(`Error inspecting container in ${this.getStateName()} state:`, error);
      throw error;
    }
  }

  /**
   * Check if the container can be started
   */
  canStart() {
    return false;
  }

  /**
   * Check if the container can be stopped
   */
  canStop() {
    return false;
  }

  /**
   * Check if the container can be restarted
   */
  canRestart() {
    return false;
  }

  /**
   * Check if the container can be removed
   */
  canRemove() {
    return false;
  }

  /**
   * Handle state entry - called when transitioning to this state
   */
  async onEnter() {
    console.log(`Container ${this.containerWrapper.projectId} entered ${this.getStateName()} state`);
    this.containerWrapper.emit('state:changed', {
      projectId: this.containerWrapper.projectId,
      previousState: this.containerWrapper.previousState,
      currentState: this.getStateName(),
      timestamp: new Date()
    });
  }

  /**
   * Handle state exit - called when transitioning from this state
   */
  async onExit() {
    console.log(`Container ${this.containerWrapper.projectId} exiting ${this.getStateName()} state`);
  }
}

/**
 * State when container is being created
 */
class CreatingState extends ContainerState {
  async start() {
    // Container is being created, cannot start yet
    throw new Error('Container is still being created');
  }

  canRemove() {
    return true; // Can cancel creation
  }

  async remove() {
    // Cancel creation if possible
    this.containerWrapper.setState(new RemovedState(this.containerWrapper));
  }
}

/**
 * State when container is stopped/created but not running
 */
class StoppedState extends ContainerState {
  async start() {
    try {
      console.log(`Starting container ${this.containerWrapper.projectId}`);
      await this.containerWrapper.dockerContainer.start();
      this.containerWrapper.setState(new RunningState(this.containerWrapper));
      console.log(`Container ${this.containerWrapper.projectId} started successfully`);
    } catch (error) {
      console.error(`Failed to start container ${this.containerWrapper.projectId}:`, error);
      // Check if container was removed or is in error state
      try {
        const info = await this.inspect();
        if (info.State.Status === 'exited' && info.State.ExitCode !== 0) {
          this.containerWrapper.setState(new ErrorState(this.containerWrapper, error));
        }
      } catch (inspectError) {
        // Container might have been removed
        this.containerWrapper.setState(new RemovedState(this.containerWrapper));
      }
      throw error;
    }
  }

  async restart() {
    // From stopped state, restart is just start
    await this.start();
  }

  canStart() {
    return true;
  }

  canRestart() {
    return true;
  }

  canRemove() {
    return true;
  }

  async remove() {
    try {
      console.log(`Removing stopped container ${this.containerWrapper.projectId}`);
      await this.containerWrapper.dockerContainer.remove({ force: true });
      this.containerWrapper.setState(new RemovedState(this.containerWrapper));
      console.log(`Container ${this.containerWrapper.projectId} removed successfully`);
    } catch (error) {
      console.error(`Failed to remove container ${this.containerWrapper.projectId}:`, error);
      this.containerWrapper.setState(new ErrorState(this.containerWrapper, error));
      throw error;
    }
  }
}

/**
 * State when container is running
 */
class RunningState extends ContainerState {
  async stop() {
    try {
      console.log(`Stopping container ${this.containerWrapper.projectId}`);
      await this.containerWrapper.dockerContainer.stop({ t: 10 });
      this.containerWrapper.setState(new StoppedState(this.containerWrapper));
      console.log(`Container ${this.containerWrapper.projectId} stopped successfully`);
    } catch (error) {
      console.error(`Failed to stop container ${this.containerWrapper.projectId}:`, error);
      // Check if container is already stopped or in error state
      try {
        const info = await this.inspect();
        if (info.State.Status === 'exited') {
          this.containerWrapper.setState(new StoppedState(this.containerWrapper));
        } else {
          this.containerWrapper.setState(new ErrorState(this.containerWrapper, error));
        }
      } catch (inspectError) {
        // Container might have been removed
        this.containerWrapper.setState(new RemovedState(this.containerWrapper));
      }
      throw error;
    }
  }

  async restart() {
    try {
      console.log(`Restarting container ${this.containerWrapper.projectId}`);
      await this.containerWrapper.dockerContainer.restart({ t: 10 });
      // Container should still be in running state after restart
      console.log(`Container ${this.containerWrapper.projectId} restarted successfully`);
    } catch (error) {
      console.error(`Failed to restart container ${this.containerWrapper.projectId}:`, error);
      // Check current state after failed restart
      try {
        const info = await this.inspect();
        if (info.State.Status === 'running') {
          // Still running, stay in current state
        } else if (info.State.Status === 'exited') {
          this.containerWrapper.setState(new StoppedState(this.containerWrapper));
        } else {
          this.containerWrapper.setState(new ErrorState(this.containerWrapper, error));
        }
      } catch (inspectError) {
        this.containerWrapper.setState(new RemovedState(this.containerWrapper));
      }
      throw error;
    }
  }

  canStop() {
    return true;
  }

  canRestart() {
    return true;
  }

  canRemove() {
    return true;
  }

  async remove() {
    try {
      console.log(`Force removing running container ${this.containerWrapper.projectId}`);
      await this.containerWrapper.dockerContainer.remove({ force: true });
      this.containerWrapper.setState(new RemovedState(this.containerWrapper));
      console.log(`Container ${this.containerWrapper.projectId} force removed successfully`);
    } catch (error) {
      console.error(`Failed to remove running container ${this.containerWrapper.projectId}:`, error);
      this.containerWrapper.setState(new ErrorState(this.containerWrapper, error));
      throw error;
    }
  }
}

/**
 * State when container is paused
 */
class PausedState extends ContainerState {
  async start() {
    // Unpause the container
    try {
      console.log(`Unpausing container ${this.containerWrapper.projectId}`);
      await this.containerWrapper.dockerContainer.unpause();
      this.containerWrapper.setState(new RunningState(this.containerWrapper));
      console.log(`Container ${this.containerWrapper.projectId} unpaused successfully`);
    } catch (error) {
      console.error(`Failed to unpause container ${this.containerWrapper.projectId}:`, error);
      this.containerWrapper.setState(new ErrorState(this.containerWrapper, error));
      throw error;
    }
  }

  async stop() {
    try {
      console.log(`Stopping paused container ${this.containerWrapper.projectId}`);
      // First unpause, then stop
      await this.containerWrapper.dockerContainer.unpause();
      await this.containerWrapper.dockerContainer.stop({ t: 10 });
      this.containerWrapper.setState(new StoppedState(this.containerWrapper));
      console.log(`Paused container ${this.containerWrapper.projectId} stopped successfully`);
    } catch (error) {
      console.error(`Failed to stop paused container ${this.containerWrapper.projectId}:`, error);
      this.containerWrapper.setState(new ErrorState(this.containerWrapper, error));
      throw error;
    }
  }

  canStart() {
    return true; // Unpause
  }

  canStop() {
    return true;
  }

  canRemove() {
    return true;
  }

  async remove() {
    try {
      console.log(`Force removing paused container ${this.containerWrapper.projectId}`);
      await this.containerWrapper.dockerContainer.remove({ force: true });
      this.containerWrapper.setState(new RemovedState(this.containerWrapper));
      console.log(`Paused container ${this.containerWrapper.projectId} removed successfully`);
    } catch (error) {
      console.error(`Failed to remove paused container ${this.containerWrapper.projectId}:`, error);
      this.containerWrapper.setState(new ErrorState(this.containerWrapper, error));
      throw error;
    }
  }
}

/**
 * State when container has been removed
 */
class RemovedState extends ContainerState {
  async start() {
    throw new Error('Cannot start a removed container. Create a new container instead.');
  }

  async stop() {
    // Already removed, nothing to stop
    console.log(`Container ${this.containerWrapper.projectId} is already removed`);
  }

  async remove() {
    // Already removed, nothing to remove
    console.log(`Container ${this.containerWrapper.projectId} is already removed`);
  }

  async inspect() {
    throw new Error('Cannot inspect a removed container');
  }
}

/**
 * State when container is in an error state
 */
class ErrorState extends ContainerState {
  constructor(containerWrapper, error) {
    super(containerWrapper);
    this.error = error;
  }

  async start() {
    // Try to recover by checking current state
    try {
      const info = await this.inspect();
      if (info.State.Status === 'running') {
        this.containerWrapper.setState(new RunningState(this.containerWrapper));
      } else if (info.State.Status === 'exited' || info.State.Status === 'stopped') {
        // Both 'exited' and 'stopped' mean the container is not running
        // Transition to stopped state and try to start
        await this.containerWrapper.setState(new StoppedState(this.containerWrapper));
        // Now try to start
        await this.containerWrapper.start();
      } else {
        throw new Error(`Container is in unexpected state: ${info.State.Status}`);
      }
    } catch (error) {
      console.error(`Cannot start container from error state:`, error);
      throw error;
    }
  }

  canRemove() {
    return true;
  }

  async remove() {
    try {
      console.log(`Removing container in error state ${this.containerWrapper.projectId}`);
      await this.containerWrapper.dockerContainer.remove({ force: true });
      this.containerWrapper.setState(new RemovedState(this.containerWrapper));
      console.log(`Error state container ${this.containerWrapper.projectId} removed successfully`);
    } catch (error) {
      console.error(`Failed to remove error state container ${this.containerWrapper.projectId}:`, error);
      // Stay in error state
      throw error;
    }
  }

  getError() {
    return this.error;
  }
}

/**
 * Container wrapper that manages state transitions
 */
class ContainerWrapper extends EventEmitter {
  constructor(dockerContainer, projectId) {
    super();
    this.dockerContainer = dockerContainer;
    this.projectId = projectId;
    this.state = new CreatingState(this);
    this.previousState = null;
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.sessions = new Map();
    this.workspacePath = null;
    this.sshPort = null;
  }

  /**
   * Set the current state
   */
  async setState(newState) {
    if (this.state) {
      this.previousState = this.state.getStateName();
      await this.state.onExit();
    }
    
    this.state = newState;
    this.lastActivity = new Date();
    
    if (this.state) {
      await this.state.onEnter();
    }
  }

  /**
   * Get current state name
   */
  getStateName() {
    return this.state ? this.state.getStateName() : 'unknown';
  }

  /**
   * Start the container
   */
  async start() {
    return this.state.start();
  }

  /**
   * Stop the container
   */
  async stop() {
    return this.state.stop();
  }

  /**
   * Restart the container
   */
  async restart() {
    return this.state.restart();
  }

  /**
   * Remove the container
   */
  async remove() {
    return this.state.remove();
  }

  /**
   * Inspect the container
   */
  async inspect() {
    return this.state.inspect();
  }

  /**
   * Check capabilities
   */
  canStart() {
    return this.state.canStart();
  }

  canStop() {
    return this.state.canStop();
  }

  canRestart() {
    return this.state.canRestart();
  }

  canRemove() {
    return this.state.canRemove();
  }

  /**
   * Get container information for API responses
   */
  getInfo() {
    return {
      id: this.dockerContainer.id,
      projectId: this.projectId,
      state: this.getStateName(),
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      sessions: this.sessions.size,
      uptime: Date.now() - this.createdAt.getTime(),
      sshPort: this.sshPort,
      workspacePath: this.workspacePath,
      capabilities: {
        canStart: this.canStart(),
        canStop: this.canStop(),
        canRestart: this.canRestart(),
        canRemove: this.canRemove()
      }
    };
  }

  /**
   * Initialize the container wrapper after creation
   */
  async initialize(workspacePath, sshPort) {
    this.workspacePath = workspacePath;
    this.sshPort = sshPort;
    
    // Transition to stopped state (ready to start)
    await this.setState(new StoppedState(this));
  }

  /**
   * Mark container as running after successful start
   */
  async markAsRunning() {
    if (this.state instanceof StoppedState || this.state instanceof CreatingState) {
      await this.setState(new RunningState(this));
    }
  }

  /**
   * Update last activity timestamp
   */
  updateActivity() {
    this.lastActivity = new Date();
  }
}

module.exports = {
  ContainerState,
  CreatingState,
  StoppedState,
  RunningState,
  PausedState,
  RemovedState,
  ErrorState,
  ContainerWrapper
};
