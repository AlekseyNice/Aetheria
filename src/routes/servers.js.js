const express = require('express');
const Joi = require('joi');

module.exports = (database) => {
  const router = express.Router();

  // Validation schema
  const serverSchema = Joi.object({
    name: Joi.string().required().min(1).max(255),
    ip: Joi.string().ip().required(),
    username: Joi.string().required().min(1).max(50),
    privateKeyPath: Joi.string().optional().allow(''),
    password: Joi.string().optional().allow(''),
    port: Joi.number().integer().min(1).max(65535).default(22),
    groupName: Joi.string().max(100).default('default')
  }).or('privateKeyPath', 'password'); // At least one authentication method required

  // Get all servers
  router.get('/', async (req, res) => {
    try {
      const servers = await database.getServers();
      
      // Group servers by group_name
      const groupedServers = servers.reduce((groups, server) => {
        const group = server.group_name || 'default';
        if (!groups[group]) {
          groups[group] = [];
        }
        // Remove sensitive data
        const { password, private_key_path, ...safeServer } = server;
        groups[group].push(safeServer);
        return groups;
      }, {});

      res.json({
        success: true,
        data: {
          servers: servers.map(({ password, private_key_path, ...server }) => server),
          grouped: groupedServers,
          total: servers.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get server by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const server = await database.getServerById(id);
      
      if (!server) {
        return res.status(404).json({
          success: false,
          error: 'Server not found'
        });
      }

      // Remove sensitive data
      const { password, private_key_path, ...safeServer } = server;
      
      res.json({
        success: true,
        data: safeServer
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Add new server
  router.post('/', async (req, res) => {
    try {
      const { error, value } = serverSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const result = await database.addServer({
        name: value.name,
        ip: value.ip,
        username: value.username,
        privateKeyPath: value.privateKeyPath || null,
        password: value.password || null,
        port: value.port,
        groupName: value.groupName
      });

      res.status(201).json({
        success: true,
        message: 'Server added successfully',
        data: {
          id: result.id,
          name: value.name,
          ip: value.ip
        }
      });
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        res.status(409).json({
          success: false,
          error: 'Server with this IP already exists'
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  });

  // Update server
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { error, value } = serverSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const existingServer = await database.getServerById(id);
      if (!existingServer) {
        return res.status(404).json({
          success: false,
          error: 'Server not found'
        });
      }

      const sql = `
        UPDATE servers 
        SET name = ?, ip = ?, username = ?, private_key_path = ?, 
            password = ?, port = ?, group_name = ?
        WHERE id = ?
      `;
      
      await database.run(sql, [
        value.name,
        value.ip,
        value.username,
        value.privateKeyPath || null,
        value.password || null,
        value.port,
        value.groupName,
        id
      ]);

      res.json({
        success: true,
        message: 'Server updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Delete server
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const existingServer = await database.getServerById(id);
      if (!existingServer) {
        return res.status(404).json({
          success: false,
          error: 'Server not found'
        });
      }

      await database.deleteServer(id);

      res.json({
        success: true,
        message: 'Server deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Test server connection
  router.post('/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const server = await database.getServerById(id);
      
      if (!server) {
        return res.status(404).json({
          success: false,
          error: 'Server not found'
        });
      }

      const SSHManager = require('../ssh/SSHManager');
      const sshManager = new SSHManager();
      
      const testResult = await sshManager.testConnection(server);
      
      // Update server status based on test result
      await database.updateServerStatus(id, testResult.success ? 'online' : 'offline');

      res.json({
        success: true,
        data: testResult
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get server system info
  router.get('/:id/info', async (req, res) => {
    try {
      const { id } = req.params;
      const server = await database.getServerById(id);
      
      if (!server) {
        return res.status(404).json({
          success: false,
          error: 'Server not found'
        });
      }

      const SSHManager = require('../ssh/SSHManager');
      const sshManager = new SSHManager();
      
      const systemInfo = await sshManager.getSystemInfo(server);
      
      res.json({
        success: true,
        data: systemInfo
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get servers by group
  router.get('/group/:groupName', async (req, res) => {
    try {
      const { groupName } = req.params;
      const servers = await database.all(
        'SELECT * FROM servers WHERE group_name = ? ORDER BY name',
        [groupName]
      );

      res.json({
        success: true,
        data: servers.map(({ password, private_key_path, ...server }) => server)
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get all groups
  router.get('/groups/list', async (req, res) => {
    try {
      const groups = await database.all(`
        SELECT group_name, COUNT(*) as server_count 
        FROM servers 
        GROUP BY group_name 
        ORDER BY group_name
      `);

      res.json({
        success: true,
        data: groups
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};