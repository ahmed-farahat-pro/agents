/**
 * Chat History Manager - Saves all Telegram chats to JSON files
 * Organized by user, date, and session
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const CHATS_DIR = process.env.CHATS_DIR || path.join(process.cwd(), 'data', 'chats');
const SESSIONS_FILE = path.join(process.cwd(), 'data', 'chat-sessions.json');

// Ensure directories exist
function ensureDirs() {
  try {
    if (!fs.existsSync(CHATS_DIR)) {
      fs.mkdirSync(CHATS_DIR, { recursive: true });
      logger.info(`[ChatHistory] Created chats directory: ${CHATS_DIR}`);
    }
  } catch (error) {
    logger.error(`[ChatHistory] Failed to create directory:`, error);
    throw error;
  }
}

ensureDirs();

class ChatHistoryManager {
  constructor() {
    this.sessions = this.loadSessions();
    this.currentSession = null;
    logger.info(`[ChatHistory] Initialized with ${Object.keys(this.sessions).length} sessions`);
  }

  loadSessions() {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('[ChatHistory] Failed to load sessions:', error);
    }
    return {};
  }

  saveSessions() {
    try {
      const sessionsFile = path.join(process.cwd(), 'data', 'chat-sessions.json');
      const tempFile = `${sessionsFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.sessions, null, 2));
      fs.renameSync(tempFile, sessionsFile);
    } catch (error) {
      logger.error('[ChatHistory] Failed to save sessions:', error);
    }
  }

  // Generate session ID for today
  getSessionId(userId) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `${userId}_${date}`;
  }

  // Get chat file path for a session
  getChatFilePath(sessionId) {
    return path.join(CHATS_DIR, `${sessionId}.json`);
  }

  // Start a new chat session
  startSession(userId, userInfo = {}) {
    const sessionId = this.getSessionId(userId);
    const now = new Date().toISOString();
    
    if (!this.sessions[sessionId]) {
      this.sessions[sessionId] = {
        sessionId,
        userId: userId.toString(),
        username: userInfo.username || null,
        firstName: userInfo.firstName || null,
        lastName: userInfo.lastName || null,
        startedAt: now,
        lastActivity: now,
        messageCount: 0,
        filePath: this.getChatFilePath(sessionId),
      };
      
      // Create empty chat file
      this.saveChatFile(sessionId, {
        sessionId,
        userId: userId.toString(),
        userInfo,
        startedAt: now,
        messages: [],
      });
      
      logger.info(`[ChatHistory] Started new session: ${sessionId}`);
    }
    
    this.currentSession = sessionId;
    this.saveSessions();
    return sessionId;
  }

  // Add message to chat history
  addMessage(userId, messageData) {
    try {
      const sessionId = this.getSessionId(userId);
      const chatFile = this.getChatFilePath(sessionId);
      
      // Load existing chat
      let chatData;
      if (fs.existsSync(chatFile)) {
        chatData = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
      } else {
        // Create new session if doesn't exist
        chatData = {
          sessionId,
          userId: userId.toString(),
          startedAt: new Date().toISOString(),
          messages: [],
        };
      }
      
      // Add message with metadata
      const message = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        unixTime: Date.now(),
        ...messageData,
      };
      
      chatData.messages.push(message);
      chatData.lastActivity = new Date().toISOString();
      
      // Save immediately
      this.saveChatFile(sessionId, chatData);
      
      // Update session stats
      if (this.sessions[sessionId]) {
        this.sessions[sessionId].lastActivity = message.timestamp;
        this.sessions[sessionId].messageCount = chatData.messages.length;
        this.saveSessions();
      }
      
      logger.info(`[ChatHistory] Added message to ${sessionId}, total: ${chatData.messages.length}`);
      return message.id;
    } catch (error) {
      logger.error('[ChatHistory] Failed to add message:', error);
      return null;
    }
  }

  // Save chat file atomically
  saveChatFile(sessionId, data) {
    try {
      const filePath = this.getChatFilePath(sessionId);
      const tempFile = `${filePath}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
      fs.renameSync(tempFile, filePath);
      return true;
    } catch (error) {
      logger.error('[ChatHistory] Failed to save chat file:', error);
      return false;
    }
  }

  // Get chat by session ID
  getChat(sessionId) {
    try {
      const filePath = this.getChatFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (error) {
      logger.error('[ChatHistory] Failed to load chat:', error);
    }
    return null;
  }

  // Get all sessions for a user
  getUserSessions(userId) {
    const userIdStr = userId.toString();
    return Object.values(this.sessions)
      .filter(s => s.userId === userIdStr)
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  }

  // Get all sessions (paginated)
  getAllSessions(page = 1, limit = 20) {
    const all = Object.values(this.sessions)
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    
    const start = (page - 1) * limit;
    const end = start + limit;
    
    return {
      sessions: all.slice(start, end),
      total: all.length,
      page,
      pages: Math.ceil(all.length / limit),
    };
  }

  // Search in chats
  searchChats(query, userId = null) {
    const results = [];
    const sessionsToSearch = userId 
      ? this.getUserSessions(userId).map(s => s.sessionId)
      : Object.keys(this.sessions);
    
    for (const sessionId of sessionsToSearch) {
      const chat = this.getChat(sessionId);
      if (chat && chat.messages) {
        const matching = chat.messages.filter(m => 
          m.text && m.text.toLowerCase().includes(query.toLowerCase())
        );
        
        if (matching.length > 0) {
          results.push({
            sessionId,
            userId: chat.userId,
            matches: matching,
          });
        }
      }
    }
    
    return results;
  }

  // Export chat as JSON
  exportChat(sessionId) {
    const chat = this.getChat(sessionId);
    if (chat) {
      return {
        success: true,
        data: chat,
        exportDate: new Date().toISOString(),
      };
    }
    return { success: false, error: 'Chat not found' };
  }

  // Get stats
  getStats() {
    const totalMessages = Object.values(this.sessions).reduce(
      (sum, s) => sum + (s.messageCount || 0), 
      0
    );
    
    return {
      totalSessions: Object.keys(this.sessions).length,
      totalMessages,
      chatsDir: CHATS_DIR,
      sessionsFile: SESSIONS_FILE,
    };
  }

  // List all chat files
  listChatFiles() {
    try {
      const files = fs.readdirSync(CHATS_DIR)
        .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
        .map(f => ({
          filename: f,
          sessionId: f.replace('.json', ''),
          path: path.join(CHATS_DIR, f),
        }));
      return files;
    } catch (error) {
      logger.error('[ChatHistory] Failed to list files:', error);
      return [];
    }
  }
}

// Singleton
const chatHistory = new ChatHistoryManager();

module.exports = chatHistory;
