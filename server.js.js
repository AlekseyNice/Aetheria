require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const Database = require('./src/database/Database');
const SSHManager = require('./src/ssh/SSHManager');
const TaskManager = require('./src/tasks/TaskManager');
const serverRoutes = require('./src/routes/servers');
const taskRoutes = require('./src/routes/tasks');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize components
const db = new Database();
const sshManager = new SSHManager();
const taskManager = new TaskManager(db, sshManager, io);

// Routes
app.use('/api/servers', serverRoutes(db));
app.use('/api/tasks', taskRoutes(taskManager));

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database
db.init().then(() => {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Web interface: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});