/**
 * Task Queue - MySQL Implementation
 * Persistent task queue for the orchestrator
 */

const db = require('./connection');
const logger = require('../utils/logger');

class TaskQueueMySQL {
  constructor() {
    this.initialized = false;
    this.initPromise = this.initialize();
  }

  async initialize() {
    try {
      await db.initializePool();
      this.initialized = true;
      logger.info('[TaskQueueMySQL] Initialized');
    } catch (error) {
      logger.error('[TaskQueueMySQL] Initialization failed:', error.message);
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initPromise;
    }
  }

  // =====================================================
  // Task Methods
  // =====================================================

  async createTask(taskData) {
    await this.ensureInitialized();
    
    try {
      const {
        id,
        userId,
        type,
        title,
        description,
        status = 'pending',
        priority = 0,
        plan,
      } = taskData;
      
      await db.query(
        `INSERT INTO tasks 
         (id, user_id, type, title, description, status, priority, plan_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [id, userId.toString(), type, title, description, status, priority, 
         JSON.stringify(plan)]
      );
      
      logger.info(`[TaskQueueMySQL] Task created: ${id}`);
      return { id, ...taskData };
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to create task:', error);
      throw error;
    }
  }

  async getTask(taskId) {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT id, user_id, type, title, description, status, priority, 
                plan_data, result_data, progress, 
                created_at, approved_at, started_at, completed_at
         FROM tasks
         WHERE id = ?`,
        [taskId]
      );
      
      if (rows.length === 0) {
        return null;
      }
      
      const row = rows[0];
      return this._formatTask(row);
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to get task:', error);
      return null;
    }
  }

  async getTasksByStatus(status) {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT id, user_id, type, title, description, status, priority, 
                plan_data, result_data, progress, 
                created_at, approved_at, started_at, completed_at
         FROM tasks
         WHERE status = ?
         ORDER BY priority DESC, created_at ASC`,
        [status]
      );
      
      return rows.map(row => this._formatTask(row));
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to get tasks by status:', error);
      return [];
    }
  }

  async getTasksByUser(userId) {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT id, user_id, type, title, description, status, priority, 
                plan_data, result_data, progress, 
                created_at, approved_at, started_at, completed_at
         FROM tasks
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [userId.toString()]
      );
      
      return rows.map(row => this._formatTask(row));
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to get tasks by user:', error);
      return [];
    }
  }

  async updateTaskStatus(taskId, status, additionalData = {}) {
    await this.ensureInitialized();
    
    try {
      const updates = ['status = ?'];
      const params = [status];
      
      if (status === 'approved') {
        updates.push('approved_at = NOW()');
      } else if (status === 'running') {
        updates.push('started_at = NOW()');
      } else if (['completed', 'failed', 'cancelled'].includes(status)) {
        updates.push('completed_at = NOW()');
      }
      
      if (additionalData.progress !== undefined) {
        updates.push('progress = ?');
        params.push(additionalData.progress);
      }
      
      if (additionalData.result) {
        updates.push('result_data = ?');
        params.push(JSON.stringify(additionalData.result));
      }
      
      params.push(taskId);
      
      await db.query(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
      
      logger.info(`[TaskQueueMySQL] Task ${taskId} status updated to ${status}`);
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to update task status:', error);
      return false;
    }
  }

  async updateTaskProgress(taskId, progress, message) {
    await this.ensureInitialized();
    
    try {
      await db.query(
        `UPDATE tasks SET progress = ? WHERE id = ?`,
        [progress, taskId]
      );
      
      // Add activity
      await this.addActivity({
        type: 'task-progress',
        taskId,
        message: message || `Progress: ${progress}%`,
      });
      
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to update task progress:', error);
      return false;
    }
  }

  async deleteTask(taskId) {
    await this.ensureInitialized();
    
    try {
      await db.query(`DELETE FROM tasks WHERE id = ?`, [taskId]);
      logger.info(`[TaskQueueMySQL] Task deleted: ${taskId}`);
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to delete task:', error);
      return false;
    }
  }

  async getAllTasks(limit = 100) {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT id, user_id, type, title, description, status, priority, 
                plan_data, result_data, progress, 
                created_at, approved_at, started_at, completed_at
         FROM tasks
         ORDER BY created_at DESC
         LIMIT ?`,
        [parseInt(limit)]
      );
      
      return rows.map(row => this._formatTask(row));
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to get all tasks:', error);
      return [];
    }
  }

  // =====================================================
  // Task Steps Methods
  // =====================================================

  async addTaskStep(taskId, stepData) {
    await this.ensureInitialized();
    
    try {
      await db.query(
        `INSERT INTO task_steps 
         (task_id, step_order, description, status, files, type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [taskId, stepData.order, stepData.description, 
         stepData.status || 'pending',
         JSON.stringify(stepData.files || []),
         stepData.type]
      );
      
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to add task step:', error);
      return false;
    }
  }

  async updateTaskStep(taskId, stepOrder, updates) {
    await this.ensureInitialized();
    
    try {
      const setFields = [];
      const params = [];
      
      if (updates.status) {
        setFields.push('status = ?');
        params.push(updates.status);
        
        if (updates.status === 'in_progress') {
          setFields.push('started_at = NOW()');
        } else if (['completed', 'failed'].includes(updates.status)) {
          setFields.push('completed_at = NOW()');
        }
      }
      
      if (updates.result !== undefined) {
        setFields.push('result = ?');
        params.push(updates.result);
      }
      
      params.push(taskId, stepOrder);
      
      await db.query(
        `UPDATE task_steps SET ${setFields.join(', ')} 
         WHERE task_id = ? AND step_order = ?`,
        params
      );
      
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to update task step:', error);
      return false;
    }
  }

  async getTaskSteps(taskId) {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT step_order, description, status, files, type, result,
                started_at, completed_at
         FROM task_steps
         WHERE task_id = ?
         ORDER BY step_order`,
        [taskId]
      );
      
      return rows.map(row => ({
        order: row.step_order,
        description: row.description,
        status: row.status,
        files: JSON.parse(row.files || '[]'),
        type: row.type,
        result: row.result,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      }));
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to get task steps:', error);
      return [];
    }
  }

  // =====================================================
  // Agent Methods
  // =====================================================

  async registerAgent(agentData) {
    await this.ensureInitialized();
    
    try {
      await db.query(
        `INSERT INTO agents 
         (id, name, display_name, role, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         role = VALUES(role),
         status = VALUES(status),
         metadata = VALUES(metadata),
         last_update = NOW()`,
        [agentData.id || agentData.name, agentData.name, 
         agentData.displayName, agentData.role, 
         agentData.status || 'idle', JSON.stringify(agentData.metadata || {})]
      );
      
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to register agent:', error);
      return false;
    }
  }

  async updateAgentStatus(agentId, status, activity, taskId) {
    await this.ensureInitialized();
    
    try {
      await db.query(
        `UPDATE agents 
         SET status = ?, activity = ?, current_task_id = ?, last_update = NOW()
         WHERE id = ?`,
        [status, activity, taskId, agentId]
      );
      
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to update agent status:', error);
      return false;
    }
  }

  async getAgents() {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT id, name, display_name, role, status, current_task_id, 
                activity, last_update, metadata
         FROM agents
         ORDER BY name`
      );
      
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        role: row.role,
        status: row.status,
        currentTaskId: row.current_task_id,
        activity: row.activity,
        lastUpdate: row.last_update,
        metadata: JSON.parse(row.metadata || '{}'),
      }));
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to get agents:', error);
      return [];
    }
  }

  // =====================================================
  // Activity Methods
  // =====================================================

  async addActivity(activityData) {
    await this.ensureInitialized();
    
    try {
      await db.query(
        `INSERT INTO activities 
         (type, agent_name, task_id, message, metadata)
         VALUES (?, ?, ?, ?, ?)`,
        [activityData.type, activityData.agent, activityData.taskId,
         activityData.message, JSON.stringify(activityData.metadata || {})]
      );
      
      // Keep only last 1000 activities
      await db.query(
        `DELETE FROM activities 
         WHERE id NOT IN (
           SELECT id FROM (
             SELECT id FROM activities 
             ORDER BY created_at DESC 
             LIMIT 1000
           ) AS recent
         )`
      );
      
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to add activity:', error);
      return false;
    }
  }

  async getActivities(limit = 100, type = null) {
    await this.ensureInitialized();
    
    try {
      let sql = `SELECT type, agent_name, task_id, message, metadata, created_at
                 FROM activities`;
      const params = [];
      
      if (type) {
        sql += ` WHERE type = ?`;
        params.push(type);
      }
      
      sql += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(parseInt(limit));
      
      const rows = await db.query(sql, params);
      
      return rows.map(row => ({
        type: row.type,
        agent: row.agent_name,
        taskId: row.task_id,
        message: row.message,
        metadata: JSON.parse(row.metadata || '{}'),
        timestamp: row.created_at,
      }));
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to get activities:', error);
      return [];
    }
  }

  // =====================================================
  // Code Edits Methods
  // =====================================================

  async addCodeEdit(editData) {
    await this.ensureInitialized();
    
    try {
      await db.query(
        `INSERT INTO code_edits 
         (agent_name, file_path, action, code, line_numbers, task_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [editData.agent, editData.file, editData.action, 
         editData.code, editData.lineNumbers, editData.taskId]
      );
      
      return true;
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to add code edit:', error);
      return false;
    }
  }

  async getCodeEdits(limit = 50) {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT agent_name, file_path, action, code, line_numbers, task_id, created_at
         FROM code_edits
         ORDER BY created_at DESC
         LIMIT ?`,
        [parseInt(limit)]
      );
      
      return rows.map(row => ({
        agent: row.agent_name,
        file: row.file_path,
        action: row.action,
        code: row.code,
        lineNumbers: row.line_numbers,
        taskId: row.task_id,
        timestamp: row.created_at,
      }));
    } catch (error) {
      logger.error('[TaskQueueMySQL] Failed to get code edits:', error);
      return [];
    }
  }

  // =====================================================
  // Helper Methods
  // =====================================================

  _parseJson(value, fallback = null) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
      return typeof value === 'string' ? JSON.parse(value) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  _formatTask(row) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      plan: this._parseJson(row.plan_data, {}),
      result: this._parseJson(row.result_data),
      progress: row.progress,
      createdAt: row.created_at,
      approvedAt: row.approved_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }
}

// Singleton instance
const taskQueueMySQL = new TaskQueueMySQL();

module.exports = taskQueueMySQL;
