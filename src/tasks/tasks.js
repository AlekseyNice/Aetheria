const express = require('express');
const Joi = require('joi');

module.exports = (taskManager) => {
  const router = express.Router();

  // Validation schemas
  const executeTaskSchema = Joi.object({
    name: Joi.string().required().min(1).max(255),
    command: Joi.string().required().min(1),
    serverIds: Joi.array().items(Joi.number().integer()).min(1).required(),
    options: Joi.object({
      timeout: Joi.number().integer().min(1000).max(3600000), // 1sec to 1hour
      maxConcurrent: Joi.number().integer().min(1).max(20).default(5),
      cwd: Joi.string()
    }).optional()
  });

  const predefinedTaskSchema = Joi.object({
    serverIds: Joi.array().items(Joi.number().integer()).min(1).required()
  });

  // Execute custom task
  router.post('/execute', async (req, res) => {
    try {
      const { error, value } = executeTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const result = await taskManager.executeTask(value);

      res.status(202).json({
        success: true,
        message: 'Task execution started',
        data: {
          taskId: result.taskId,
          status: 'running'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get all tasks
  router.get('/', async (req, res) => {
    try {
      const tasks = await taskManager.getAllTasks();
      
      res.json({
        success: true,
        data: tasks
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get task by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const task = await taskManager.getTaskStatus(id);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get running tasks
  router.get('/status/running', async (req, res) => {
    try {
      const runningTasks = taskManager.getRunningTasks();
      
      res.json({
        success: true,
        data: runningTasks
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Predefined task: Change passwords
  router.post('/predefined/change-password', async (req, res) => {
    try {
      const { error, value } = predefinedTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters long'
        });
      }

      const result = await taskManager.changePasswordsTask(value.serverIds, newPassword);

      res.status(202).json({
        success: true,
        message: 'Password change task started',
        data: {
          taskId: result.taskId
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Predefined task: System update
  router.post('/predefined/update-system', async (req, res) => {
    try {
      const { error, value } = predefinedTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const result = await taskManager.updateSystemTask(value.serverIds);

      res.status(202).json({
        success: true,
        message: 'System update task started',
        data: {
          taskId: result.taskId
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Predefined task: Restart service
  router.post('/predefined/restart-service', async (req, res) => {
    try {
      const { error, value } = predefinedTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const { serviceName } = req.body;
      if (!serviceName) {
        return res.status(400).json({
          success: false,
          error: 'Service name is required'
        });
      }

      const result = await taskManager.restartServiceTask(value.serverIds, serviceName);

      res.status(202).json({
        success: true,
        message: `Service ${serviceName} restart task started`,
        data: {
          taskId: result.taskId
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Predefined task: Check disk space
  router.post('/predefined/check-disk-space', async (req, res) => {
    try {
      const { error, value } = predefinedTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const result = await taskManager.checkDiskSpaceTask(value.serverIds);

      res.status(202).json({
        success: true,
        message: 'Disk space check task started',
        data: {
          taskId: result.taskId
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Predefined task: System status check
  router.post('/predefined/system-status', async (req, res) => {
    try {
      const { error, value } = predefinedTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const result = await taskManager.checkSystemStatusTask(value.serverIds);

      res.status(202).json({
        success: true,
        message: 'System status check task started',
        data: {
          taskId: result.taskId
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Predefined task: Install package
  router.post('/predefined/install-package', async (req, res) => {
    try {
      const { error, value } = predefinedTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const { packageName } = req.body;
      if (!packageName) {
        return res.status(400).json({
          success: false,
          error: 'Package name is required'
        });
      }

      const result = await taskManager.installPackageTask(value.serverIds, packageName);

      res.status(202).json({
        success: true,
        message: `Package ${packageName} installation task started`,
        data: {
          taskId: result.taskId
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Predefined task: Create user
  router.post('/predefined/create-user', async (req, res) => {
    try {
      const { error, value } = predefinedTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters long'
        });
      }

      const result = await taskManager.createUserTask(value.serverIds, username, password);

      res.status(202).json({
        success: true,
        message: `User ${username} creation task started`,
        data: {
          taskId: result.taskId
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Predefined task: Cleanup logs
  router.post('/predefined/cleanup-logs', async (req, res) => {
    try {
      const { error, value } = predefinedTaskSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const { days } = req.body;
      const cleanupDays = days && days > 0 ? days : 7;

      const result = await taskManager.cleanupLogsTask(value.serverIds, cleanupDays);

      res.status(202).json({
        success: true,
        message: `Log cleanup task started (${cleanupDays} days)`,
        data: {
          taskId: result.taskId
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get task logs
  router.get('/:id/logs', async (req, res) => {
    try {
      const { id } = req.params;
      
      const logs = await taskManager.db.all(`
        SELECT l.*, s.name as server_name, s.ip as server_ip
        FROM logs l
        LEFT JOIN servers s ON l.server_id = s.id
        WHERE l.task_id = ?
        ORDER BY l.created_at DESC
      `, [id]);

      res.json({
        success: true,
        data: logs
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