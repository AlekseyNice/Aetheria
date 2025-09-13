const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import our classes
const Database = require('./src/database/Database');
const SSHManager = require('./src/ssh/SSHManager');
const TaskManager = require('./src/tasks/TaskManager');

// Import routes
const serversRoute = require('./src/routes/servers');
const tasksRoute = require('./src/routes/tasks');

class AetheriaServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server);
    this.port = process.env.PORT || 3000;
    
    // Core components
    this.database = new Database();
    this.sshManager = new SSHManager();
    this.taskManager = null; // Will be initialized after database
    
    this.setupMiddleware();
    this.setupSocketIO();
  }

  setupMiddleware() {
    // Body parser middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Static files
    this.app.use(express.static('public'));
    
    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupSocketIO() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
      
      // Send initial data when client connects
      socket.emit('connected', { 
        message: 'Connected to Aetheria Server',
        timestamp: new Date().toISOString()
      });
    });
  }

  async setupRoutes() {
    // API Routes
    this.app.use('/api/servers', serversRoute(this.database));
    this.app.use('/api/tasks', tasksRoute(this.taskManager));
    
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        message: 'Aetheria Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    });
    
    // Logs endpoint
    this.app.get('/api/logs', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await this.database.getLogs(limit);
        
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
    
    // Serve main page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
    
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });
    
    // Error handler
    this.app.use((error, req, res, next) => {
      console.error('Server Error:', error);
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
      });
    });
  }

  async createDataDirectory() {
    const dataDir = path.join(__dirname, 'data');
    
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('Created data directory:', dataDir);
      }
    } catch (error) {
      console.error('Failed to create data directory:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      console.log('Initializing Aetheria Server...');
      
      // Create data directory if it doesn't exist
      await this.createDataDirectory();
      
      // Initialize database
      console.log('Connecting to database...');
      await this.database.init();
      console.log('Database connected successfully');
      
      // Initialize TaskManager with database and SSH manager
      this.taskManager = new TaskManager(this.database, this.sshManager, this.io);
      console.log('Task Manager initialized');
      
      // Setup routes
      await this.setupRoutes();
      console.log('Routes configured');
      
      console.log('Aetheria Server initialized successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to initialize server:', error);
      throw error;
    }
  }

  async start() {
    try {
      await this.initialize();
      
      this.server.listen(this.port, () => {
        console.log(`
╔═══════════════════════════════════════╗
║            AETHERIA SERVER            ║
║   Удалённое администрирование         ║
╠═══════════════════════════════════════╣
║ Status: Running                       ║
║ Port: ${this.port.toString().padEnd(29)} ║
║ URL: http://localhost:${this.port.toString().padEnd(17)} ║
║ WebSocket: Connected                  ║
║ Database: SQLite                      ║
╚═══════════════════════════════════════╝
        `);
      });
      
      // Graceful shutdown handlers
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));
      process.on('SIGINT', () => this.shutdown('SIGINT'));
      
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    
    try {
      // Close database connection
      if (this.database) {
        this.database.close();
        console.log('Database connection closed');
      }
      
      // Close server
      this.server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      
      // Force exit if graceful shutdown takes too long
      setTimeout(() => {
        console.log('Force closing...');
        process.exit(1);
      }, 10000);
      
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new AetheriaServer();
server.start().catch(error => {
  console.error('Failed to start Aetheria Server:', error);
  process.exit(1);
});