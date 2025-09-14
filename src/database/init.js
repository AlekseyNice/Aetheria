const path = require('path');
const fs = require('fs');
const Database = require('./Database');

class DatabaseInitializer {
  constructor() {
    this.database = null;
  }

  async init() {
    console.log('Инициализация базы данных Aetheria...');
    
    try {
      // Создаём необходимые директории
      await this.createDirectories();
      
      // Инициализируем базу данных
      this.database = new Database();
      await this.database.init();
      console.log('✓ База данных инициализирована');

      // Проверяем целостность данных
      await this.checkDataIntegrity();

      // Создаём индексы для производительности
      await this.createIndexes();

      console.log('✓ Инициализация завершена успешно');
      
      this.showSuccessMessage();
      
      return true;
      
    } catch (error) {
      console.error('❌ Ошибка инициализации:', error.message);
      throw error;
    } finally {
      if (this.database) {
        this.database.close();
      }
    }
  }

  async createDirectories() {
    const directories = [
      path.join(__dirname, '../../data'),
      path.join(__dirname, '../../logs')
    ];

    for (const dir of directories) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`✓ Создана директория: ${path.relative(process.cwd(), dir)}`);
        } else {
          console.log(`✓ Директория уже существует: ${path.relative(process.cwd(), dir)}`);
        }
      } catch (error) {
        console.error(`❌ Не удалось создать директорию ${dir}:`, error.message);
        throw error;
      }
    }
  }

  async checkDataIntegrity() {
    console.log('Проверка целостности данных...');
    
    try {
      // Проверяем существование таблиц
      const tables = await this.database.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        ORDER BY name
      `);
      
      const expectedTables = ['servers', 'tasks', 'logs'];
      const existingTables = tables.map(t => t.name);
      
      for (const table of expectedTables) {
        if (existingTables.includes(table)) {
          console.log(`✓ Таблица '${table}' существует`);
        } else {
          console.log(`❌ Таблица '${table}' не найдена`);
        }
      }

      // Проверяем количество записей
      const serversCount = await this.database.get('SELECT COUNT(*) as count FROM servers');
      const tasksCount = await this.database.get('SELECT COUNT(*) as count FROM tasks');
      const logsCount = await this.database.get('SELECT COUNT(*) as count FROM logs');
      
      console.log(`✓ Серверов: ${serversCount.count}`);
      console.log(`✓ Задач: ${tasksCount.count}`);
      console.log(`✓ Логов: ${logsCount.count}`);
      
    } catch (error) {
      console.warn('Предупреждение при проверке целостности данных:', error.message);
    }
  }

  async createIndexes() {
    console.log('Создание индексов для производительности...');
    
    const indexes = [
      // Индексы для таблицы серверов
      'CREATE INDEX IF NOT EXISTS idx_servers_ip ON servers(ip)',
      'CREATE INDEX IF NOT EXISTS idx_servers_group ON servers(group_name)',
      'CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status)',
      
      // Индексы для таблицы задач
      'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)',
      
      // Индексы для таблицы логов
      'CREATE INDEX IF NOT EXISTS idx_logs_server_id ON logs(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id)',
      'CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)'
    ];

    try {
      for (const indexSql of indexes) {
        await this.database.run(indexSql);
      }
      console.log('✓ Индексы созданы');
    } catch (error) {
      console.warn('Предупреждение при создании индексов:', error.message);
    }
  }

  showSuccessMessage() {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                  AETHERIA DATABASE                     ║
║               Успешно инициализирована                 ║
╠════════════════════════════════════════════════════════╣
║ Создано:                                               ║
║  • База данных SQLite                                  ║
║  • Таблицы серверов, задач и логов                     ║
║  • Индексы для производительности                      ║
║  • Директории для данных и логов                       ║
║                                                        ║
║ Для запуска сервера используйте:                       ║
║  node server.js                                        ║
╚════════════════════════════════════════════════════════╝
    `);
  }

  // Статический метод для быстрой инициализации
  static async initialize() {
    const initializer = new DatabaseInitializer();
    return await initializer.init();
  }
}

// Экспорт для использования как модуль
module.exports = DatabaseInitializer;

// Запуск напрямую если вызван как скрипт
if (require.main === module) {
  DatabaseInitializer.initialize().catch(error => {
    console.error('Критическая ошибка инициализации:', error);
    process.exit(1);
  });
}