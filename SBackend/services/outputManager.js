// outputManager.js - Manages console output and process information
const EventEmitter = require('events');

class OutputManager extends EventEmitter {
  constructor() {
    super();
    this.consoleOutputs = new Map(); // projectId -> output buffer
    this.processOutputs = new Map(); // projectId -> process outputs
    this.maxOutputLines = 1000; // Maximum lines to keep in memory
  }

  // Console output management
  addConsoleOutput(projectId, output, type = 'stdout') {
    if (!this.consoleOutputs.has(projectId)) {
      this.consoleOutputs.set(projectId, []);
    }

    const buffer = this.consoleOutputs.get(projectId);
    const timestamp = new Date().toISOString();
    
    buffer.push({
      timestamp,
      type,
      content: output,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });

    // Keep only the last N lines
    if (buffer.length > this.maxOutputLines) {
      buffer.splice(0, buffer.length - this.maxOutputLines);
    }

    // Emit event for real-time updates
    this.emit('console:output', {
      projectId,
      timestamp,
      type,
      content: output
    });
  }

  getConsoleOutput(projectId, lines = 100) {
    const buffer = this.consoleOutputs.get(projectId) || [];
    return buffer.slice(-lines);
  }

  clearConsoleOutput(projectId) {
    this.consoleOutputs.set(projectId, []);
    this.emit('console:cleared', { projectId });
  }

  // Process output management
  addProcessOutput(projectId, processId, output, type = 'stdout') {
    const key = `${projectId}:${processId}`;
    
    if (!this.processOutputs.has(key)) {
      this.processOutputs.set(key, []);
    }

    const buffer = this.processOutputs.get(key);
    const timestamp = new Date().toISOString();
    
    buffer.push({
      timestamp,
      type,
      content: output,
      processId
    });

    // Keep only the last N lines per process
    if (buffer.length > this.maxOutputLines) {
      buffer.splice(0, buffer.length - this.maxOutputLines);
    }

    // Also add to console output
    this.addConsoleOutput(projectId, `[${processId}] ${output}`, type);

    // Emit event for real-time updates
    this.emit('process:output', {
      projectId,
      processId,
      timestamp,
      type,
      content: output
    });
  }

  getProcessOutput(projectId, processId, lines = 100) {
    const key = `${projectId}:${processId}`;
    const buffer = this.processOutputs.get(key) || [];
    return buffer.slice(-lines);
  }

  clearProcessOutput(projectId, processId) {
    const key = `${projectId}:${processId}`;
    this.processOutputs.set(key, []);
    this.emit('process:cleared', { projectId, processId });
  }

  // Get all outputs for a project
  getAllOutputs(projectId) {
    const consoleOutput = this.getConsoleOutput(projectId);
    const processKeys = Array.from(this.processOutputs.keys())
      .filter(key => key.startsWith(`${projectId}:`));
    
    const processOutputs = {};
    for (const key of processKeys) {
      const processId = key.split(':')[1];
      processOutputs[processId] = this.getProcessOutput(projectId, processId);
    }

    return {
      console: consoleOutput,
      processes: processOutputs
    };
  }

  // Cleanup old outputs
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoff = Date.now() - maxAge;
    
    for (const [projectId, buffer] of this.consoleOutputs) {
      const filtered = buffer.filter(entry => 
        new Date(entry.timestamp).getTime() > cutoff
      );
      this.consoleOutputs.set(projectId, filtered);
    }

    for (const [key, buffer] of this.processOutputs) {
      const filtered = buffer.filter(entry => 
        new Date(entry.timestamp).getTime() > cutoff
      );
      this.processOutputs.set(key, filtered);
    }
  }

  // Get statistics
  getStats() {
    const stats = {
      totalProjects: this.consoleOutputs.size,
      totalProcesses: this.processOutputs.size,
      totalOutputLines: 0,
      memoryUsage: 0
    };

    for (const buffer of this.consoleOutputs.values()) {
      stats.totalOutputLines += buffer.length;
      stats.memoryUsage += JSON.stringify(buffer).length;
    }

    for (const buffer of this.processOutputs.values()) {
      stats.totalOutputLines += buffer.length;
      stats.memoryUsage += JSON.stringify(buffer).length;
    }

    return stats;
  }
}

module.exports = OutputManager; 