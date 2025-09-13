const { NodeSSH } = require('node-ssh');
const fs = require('fs');

class SSHManager {
  constructor() {
    this.connections = new Map(); // Cache connections
  }

  async createConnection(server) {
    const ssh = new NodeSSH();
    
    const connectionConfig = {
      host: server.ip,
      username: server.username,
      port: server.port || 22,
      readyTimeout: 10000, // 10 seconds timeout
      tryKeyboard: true,
    };

    // Use private key or password
    if (server.private_key_path && fs.existsSync(server.private_key_path)) {
      connectionConfig.privateKey = fs.readFileSync(server.private_key_path, 'utf8');
    } else if (server.password) {
      connectionConfig.password = server.password;
    } else {
      throw new Error(`No authentication method available for server ${server.name}`);
    }

    await ssh.connect(connectionConfig);
    return ssh;
  }

  async executeCommand(server, command, options = {}) {
    const startTime = Date.now();
    let ssh = null;

    try {
      ssh = await this.createConnection(server);
      
      const result = await ssh.execCommand(command, {
        cwd: options.cwd || '/home/' + server.username,
        ...options
      });

      const executionTime = Date.now() - startTime;

      return {
        success: result.code === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        executionTime,
        server: {
          id: server.id,
          name: server.name,
          ip: server.ip
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        stdout: '',
        stderr: error.message,
        code: -1,
        executionTime,
        server: {
          id: server.id,
          name: server.name,
          ip: server.ip
        },
        error: error.message
      };
    } finally {
      if (ssh) {
        ssh.dispose();
      }
    }
  }

  async executeBulkCommand(servers, command, options = {}) {
    const maxConcurrent = options.maxConcurrent || 5;
    const results = [];
    
    // Process servers in batches to avoid overwhelming the network
    for (let i = 0; i < servers.length; i += maxConcurrent) {
      const batch = servers.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(server => 
        this.executeCommand(server, command, options)
          .catch(error => ({
            success: false,
            error: error.message,
            server: {
              id: server.id,
              name: server.name,
              ip: server.ip
            }
          }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + maxConcurrent < servers.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  async testConnection(server) {
    try {
      const result = await this.executeCommand(server, 'echo "Connection test"');
      return {
        success: result.success,
        message: result.success ? 'Connection successful' : 'Connection failed',
        error: result.error || result.stderr
      };
    } catch (error) {
      return {
        success: false,
        message: 'Connection failed',
        error: error.message
      };
    }
  }

  async getSystemInfo(server) {
    const commands = {
      hostname: 'hostname',
      uptime: 'uptime -p',
      disk_usage: 'df -h /',
      memory: 'free -h',
      os_info: 'cat /etc/os-release | head -n 2',
      load_average: 'cat /proc/loadavg'
    };

    const results = {};
    
    for (const [key, command] of Object.entries(commands)) {
      const result = await this.executeCommand(server, command);
      results[key] = result.success ? result.stdout.trim() : 'Error: ' + result.stderr;
    }

    return results;
  }

  // Utility methods for common tasks
  async changeUserPassword(server, username, newPassword) {
    const command = `echo '${username}:${newPassword}' | sudo chpasswd`;
    return this.executeCommand(server, command);
  }

  async updateSystem(server) {
    const command = 'sudo apt update && sudo apt upgrade -y';
    return this.executeCommand(server, command, { timeout: 300000 }); // 5 minutes timeout
  }

  async restartService(server, serviceName) {
    const command = `sudo systemctl restart ${serviceName}`;
    return this.executeCommand(server, command);
  }

  async getServiceStatus(server, serviceName) {
    const command = `sudo systemctl is-active ${serviceName}`;
    return this.executeCommand(server, command);
  }

  async uploadFile(server, localPath, remotePath) {
    let ssh = null;
    try {
      ssh = await this.createConnection(server);
      await ssh.putFile(localPath, remotePath);
      return { success: true, message: 'File uploaded successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (ssh) {
        ssh.dispose();
      }
    }
  }

  async downloadFile(server, remotePath, localPath) {
    let ssh = null;
    try {
      ssh = await this.createConnection(server);
      await ssh.getFile(localPath, remotePath);
      return { success: true, message: 'File downloaded successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (ssh) {
        ssh.dispose();
      }
    }
  }
}

module.exports = SSHManager;