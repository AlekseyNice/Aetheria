const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(path.join(__dirname, '../../data/servers.db'), (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('Connected to SQLite database');
        this.createTables().then(resolve).catch(reject);
      });
    });
  }

  async createTables() {
    const createServersTable = `
      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ip TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        private_key_path TEXT,
        password TEXT,
        port INTEGER DEFAULT 22,
        group_name TEXT DEFAULT 'default',
        status TEXT DEFAULT 'unknown',
        last_check DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createTasksTable = `
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        server_ids TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        results TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `;

    const createLogsTable = `
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER,
        task_id INTEGER,
        command TEXT,
        output TEXT,
        error TEXT,
        execution_time INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers (id),
        FOREIGN KEY (task_id) REFERENCES tasks (id)
      )
    `;

    return Promise.all([
      this.run(createServersTable),
      this.run(createTasksTable),
      this.run(createLogsTable)
    ]);
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Server methods
  async addServer(serverData) {
    const { name, ip, username, privateKeyPath, password, port, groupName } = serverData;
    const sql = `
      INSERT INTO servers (name, ip, username, private_key_path, password, port, group_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    return this.run(sql, [name, ip, username, privateKeyPath, password, port || 22, groupName || 'default']);
  }

  async getServers() {
    return this.all('SELECT * FROM servers ORDER BY group_name, name');
  }

  async getServerById(id) {
    return this.get('SELECT * FROM servers WHERE id = ?', [id]);
  }

  async updateServerStatus(id, status) {
    return this.run(
      'UPDATE servers SET status = ?, last_check = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
  }

  async deleteServer(id) {
    return this.run('DELETE FROM servers WHERE id = ?', [id]);
  }

  // Task methods
  async createTask(taskData) {
    const { name, command, serverIds } = taskData;
    const sql = `
      INSERT INTO tasks (name, command, server_ids)
      VALUES (?, ?, ?)
    `;
    return this.run(sql, [name, command, JSON.stringify(serverIds)]);
  }

  async getTasks() {
    return this.all('SELECT * FROM tasks ORDER BY created_at DESC');
  }

  async updateTaskStatus(id, status, results = null) {
    const sql = `
      UPDATE tasks 
      SET status = ?, results = ?, completed_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    return this.run(sql, [status, results ? JSON.stringify(results) : null, id]);
  }

  // Log methods
  async addLog(logData) {
    const { serverId, taskId, command, output, error, executionTime } = logData;
    const sql = `
      INSERT INTO logs (server_id, task_id, command, output, error, execution_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    return this.run(sql, [serverId, taskId, command, output, error, executionTime]);
  }

  async getLogs(limit = 100) {
    const sql = `
      SELECT l.*, s.name as server_name, t.name as task_name
      FROM logs l
      LEFT JOIN servers s ON l.server_id = s.id
      LEFT JOIN tasks t ON l.task_id = t.id
      ORDER BY l.created_at DESC
      LIMIT ?
    `;
    return this.all(sql, [limit]);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = Database;