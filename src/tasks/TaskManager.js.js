class TaskManager {
  constructor(database, sshManager, socketIO) {
    this.db = database;
    this.ssh = sshManager;
    this.io = socketIO;
    this.runningTasks = new Map();
  }

  async executeTask(taskData) {
    const { name, command, serverIds, options = {} } = taskData;
    
    // Create task record
    const taskResult = await this.db.createTask({
      name,
      command,
      serverIds
    });

    const taskId = taskResult.id;
    this.runningTasks.set(taskId, { status: 'running', startTime: Date.now() });

    // Emit task started event
    this.io.emit('taskStarted', { taskId, name, command, serverCount: serverIds.length });

    try {
      // Get servers data
      const servers = await Promise.all(
        serverIds.map(id => this.db.getServerById(id))
      );

      const validServers = servers.filter(server => server !== undefined);

      if (validServers.length === 0) {
        throw new Error('No valid servers found');
      }

      // Update task status
      await this.db.updateTaskStatus(taskId, 'running');
      
      // Execute command on all servers
      const results = await this.ssh.executeBulkCommand(validServers, command, options);

      // Log results for each server
      for (const result of results) {
        await this.db.addLog({
          serverId: result.server.id,
          taskId: taskId,
          command: command,
          output: result.stdout,
          error: result.stderr,
          executionTime: result.executionTime
        });

        // Update server status based on result
        const serverStatus = result.success ? 'online' : 'error';
        await this.db.updateServerStatus(result.server.id, serverStatus);

        // Emit progress update
        this.io.emit('taskProgress', {
          taskId,
          serverId: result.server.id,
          serverName: result.server.name,
          success: result.success,
          output: result.stdout,
          error: result.stderr
        });
      }

      // Calculate success rate
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      const successRate = (successCount / totalCount) * 100;

      const finalStatus = successRate === 100 ? 'completed' : 'partial';

      // Update task with results
      await this.db.updateTaskStatus(taskId, finalStatus, {
        results: results,
        successRate: successRate,
        successCount: successCount,
        totalCount: totalCount
      });

      this.runningTasks.delete(taskId);

      // Emit task completed event
      this.io.emit('taskCompleted', {
        taskId,
        status: finalStatus,
        successRate,
        successCount,
        totalCount,
        results: results.map(r => ({
          serverId: r.server.id,
          serverName: r.server.name,
          success: r.success,
          executionTime: r.executionTime
        }))
      });

      return {
        success: true,
        taskId,
        status: finalStatus,
        results,
        successRate
      };

    } catch (error) {
      console.error('Task execution error:', error);
      
      await this.db.updateTaskStatus(taskId, 'failed', { error: error.message });
      this.runningTasks.delete(taskId);

      this.io.emit('taskFailed', { taskId, error: error.message });

      return {
        success: false,
        taskId,
        error: error.message
      };
    }
  }

  async getTaskStatus(taskId) {
    const task = await this.db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return null;
    }

    const isRunning = this.runningTasks.has(taskId);
    
    return {
      ...task,
      isRunning,
      results: task.results ? JSON.parse(task.results) : null,
      serverIds: JSON.parse(task.server_ids)
    };
  }

  async getAllTasks() {
    const tasks = await this.db.getTasks();
    
    return tasks.map(task => ({
      ...task,
      isRunning: this.runningTasks.has(task.id),
      results: task.results ? JSON.parse(task.results) : null,
      serverIds: JSON.parse(task.server_ids)
    }));
  }

  getRunningTasks() {
    return Array.from(this.runningTasks.entries()).map(([taskId, info]) => ({
      taskId,
      ...info
    }));
  }

  // Predefined common tasks
  async changePasswordsTask(serverIds, newPassword) {
    return this.executeTask({
      name: 'Change Admin Password',
      command: `echo 'root:${newPassword}' | sudo chpasswd && echo 'Password changed successfully'`,
      serverIds
    });
  }

  async updateSystemTask(serverIds) {
    return this.executeTask({
      name: 'System Update',
      command: 'sudo apt update && sudo apt upgrade -y',
      serverIds,
      options: { timeout: 600000 } // 10 minutes timeout
    });
  }

  async restartServiceTask(serverIds, serviceName) {
    return this.executeTask({
      name: `Restart ${serviceName} Service`,
      command: `sudo systemctl restart ${serviceName} && sudo systemctl status ${serviceName}`,
      serverIds
    });
  }

  async checkDiskSpaceTask(serverIds) {
    return this.executeTask({
      name: 'Check Disk Space',
      command: 'df -h && echo "--- Memory Usage ---" && free -h',
      serverIds
    });
  }

  async checkSystemStatusTask(serverIds) {
    return this.executeTask({
      name: 'System Status Check',
      command: 'uptime && echo "--- Load Average ---" && cat /proc/loadavg && echo "--- Disk Usage ---" && df -h / && echo "--- Memory ---" && free -h',
      serverIds
    });
  }

  async installPackageTask(serverIds, packageName) {
    return this.executeTask({
      name: `Install ${packageName}`,
      command: `sudo apt update && sudo apt install -y ${packageName}`,
      serverIds,
      options: { timeout: 300000 } // 5 minutes timeout
    });
  }

  async createUserTask(serverIds, username, password) {
    return this.executeTask({
      name: `Create User ${username}`,
      command: `sudo useradd -m -s /bin/bash ${username} && echo '${username}:${password}' | sudo chpasswd && echo 'User ${username} created successfully'`,
      serverIds
    });
  }

  async cleanupLogsTask(serverIds, days = 7) {
    return this.executeTask({
      name: `Cleanup Logs (${days} days)`,
      command: `sudo find /var/log -name "*.log" -mtime +${days} -delete && echo "Logs older than ${days} days cleaned"`,
      serverIds
    });
  }
}

module.exports = TaskManager;