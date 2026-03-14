/**
 * Voice Processor - AI-powered voice message handling
 * Uses AI to transcribe, understand intent, and generate contextual responses
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
const aiClient = require('./ai-client');
const FormData = require('form-data');

const TMP_DIR = process.env.TMP_DIR || path.join(__dirname, '..', '..', 'tmp');

// Ensure tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

class VoiceProcessor {
  constructor() {
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.moonshotKey = process.env.MOONSHOT_API_KEY;
  }

  /**
   * Download voice file from Telegram
   */
  async downloadVoiceFile(bot, fileId) {
    try {
      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      
      const outputFile = path.join(TMP_DIR, `voice_${Date.now()}_${fileId}.ogg`);
      
      const response = await axios.get(fileUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(outputFile);
      
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(outputFile));
        writer.on('error', reject);
      });
    } catch (error) {
      logger.error('[VoiceProcessor] Download failed:', error);
      throw error;
    }
  }

  /**
   * Transcribe voice using AI (OpenAI Whisper or Moonshot)
   */
  async transcribe(audioFilePath, language = null) {
    try {
      logger.info('[VoiceProcessor] Transcribing:', audioFilePath);

      // Try OpenAI Whisper first
      if (this.openaiKey) {
        return await this.transcribeWithOpenAI(audioFilePath, language);
      }
      
      // Fallback to Moonshot
      if (this.moonshotKey) {
        return await this.transcribeWithMoonshot(audioFilePath, language);
      }

      throw new Error('No transcription service available. Please set OPENAI_API_KEY or MOONSHOT_API_KEY.');
    } catch (error) {
      logger.error('[VoiceProcessor] Transcription failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async transcribeWithOpenAI(audioFilePath, language) {
    const form = new FormData();
    form.append('file', fs.createReadStream(audioFilePath));
    form.append('model', 'whisper-1');
    if (language) form.append('language', language);

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${this.openaiKey}`,
      },
    });

    // Detect language from response or text
    const detectedLang = this.detectLanguage(response.data.text);

    return {
      success: true,
      text: response.data.text,
      language: language || detectedLang,
      confidence: 'high',
    };
  }

  async transcribeWithMoonshot(audioFilePath, language) {
    const form = new FormData();
    form.append('file', fs.createReadStream(audioFilePath));
    form.append('model', 'moonshot-v1-audio');

    const response = await axios.post('https://api.moonshot.ai/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${this.moonshotKey}`,
      },
    });

    const detectedLang = this.detectLanguage(response.data.text);

    return {
      success: true,
      text: response.data.text,
      language: language || detectedLang,
      confidence: 'high',
    };
  }

  /**
   * Generate AI response based on transcription and context
   */
  async generateResponse(transcription, chatHistory = [], userSettings = {}) {
    try {
      const { text, language } = transcription;
      
      // Build context from chat history
      const contextPrompt = this.buildContextPrompt(chatHistory);
      
      const prompt = `${contextPrompt}

User just sent a voice message saying: "${text}"

This was transcribed from voice. The user is talking to an AI development team bot called Nigents.

Analyze what the user wants and respond naturally. If they're asking for a plan, acknowledge it. If it's a greeting, greet back. If it's unclear, ask for clarification.

Respond in ${language === 'ar' ? 'Arabic' : 'English'}.

Keep your response brief and conversational (1-2 sentences max).`;

      const result = await aiClient.call(prompt, {
        provider: aiClient.getCheapestProvider(),
        maxTokens: 150,
        temperature: 0.7,
      });

      return {
        success: true,
        response: result.content.trim(),
        language,
      };
    } catch (error) {
      logger.error('[VoiceProcessor] Generate response failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  buildContextPrompt(chatHistory) {
    if (chatHistory.length === 0) return '';
    
    const recent = chatHistory.slice(-5);
    let prompt = 'Recent conversation context:\n';
    
    recent.forEach(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      prompt += `${role}: ${msg.content}\n`;
    });
    
    return prompt;
  }

  /**
   * Detect language from text
   */
  detectLanguage(text) {
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'ar' : 'en';
  }

  /**
   * Convert text to speech
   */
  async textToSpeech(text, language = 'en') {
    try {
      const { gTTS } = require('gtts');
      
      const langMap = {
        'en': 'en',
        'english': 'en',
        'ar': 'ar',
        'arabic': 'ar',
        'auto': 'en',
      };

      const lang = langMap[language.toLowerCase()] || 'en';
      const limitedText = text.substring(0, 500);
      const outputFile = path.join(TMP_DIR, `response_${Date.now()}.mp3`);
      
      const gtts = new gTTS(limitedText, lang);
      
      return new Promise((resolve, reject) => {
        gtts.save(outputFile, (err) => {
          if (err) {
            logger.error('[VoiceProcessor] gTTS failed:', err);
            reject(err);
          } else {
            resolve(outputFile);
          }
        });
      });
    } catch (error) {
      logger.error('[VoiceProcessor] Text to speech failed:', error);
      throw error;
    }
  }

  /**
   * Clean up temp files
   */
  cleanup(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('[VoiceProcessor] Cleaned up:', filePath);
      }
    } catch (error) {
      logger.warn('[VoiceProcessor] Cleanup failed:', error);
    }
  }
}

// Singleton instance
const voiceProcessor = new VoiceProcessor();

module.exports = voiceProcessor;
