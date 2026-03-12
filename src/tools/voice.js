/**
 * 🦉 NightOwl - Voice Tool
 * Whisper for voice input, gTTS for voice output
 */

const { OpenAI } = require('openai');
const { gTTS } = require('gtts');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class VoiceTool {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Transcribe voice message to text (Whisper)
   */
  async speechToText(audioFilePath, options = {}) {
    try {
      logger.info('[Voice] Transcribing audio:', audioFilePath);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: options.model || 'whisper-1',
        language: options.language, // 'ar' for Arabic, 'en' for English
        response_format: 'text',
      });

      logger.info('[Voice] Transcription complete');
      
      return {
        success: true,
        text: transcription,
        language: options.language || 'auto',
      };
    } catch (error) {
      logger.error('[Voice] Transcription failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Convert text to speech (gTTS)
   */
  async textToSpeech(text, language = 'en') {
    return new Promise((resolve, reject) => {
      try {
        // Map language codes
        const langMap = {
          'en': 'en',
          'english': 'en',
          'ar': 'ar',
          'arabic': 'ar',
          'auto': 'en', // Default to English
        };

        const lang = langMap[language.toLowerCase()] || 'en';
        
        // Limit text length (gTTS has limits)
        const limitedText = text.substring(0, 500);
        
        const outputFile = path.join(this.tempDir, `voice_${Date.now()}.mp3`);
        
        const gtts = new gTTS(limitedText, lang);
        
        gtts.save(outputFile, (err) => {
          if (err) {
            logger.error('[Voice] gTTS failed:', err);
            reject(err);
          } else {
            logger.info('[Voice] Generated:', outputFile);
            resolve(outputFile);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Detect language from text
   */
  async detectLanguage(text) {
    // Simple heuristic: check for Arabic Unicode range
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'ar' : 'en';
  }

  /**
   * Download voice file from Telegram
   */
  async downloadVoiceFile(bot, fileId) {
    try {
      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      
      const outputFile = path.join(this.tempDir, `voice_${Date.now()}.ogg`);
      
      // Download file
      const response = await fetch(fileUrl);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(outputFile, Buffer.from(buffer));
      
      return outputFile;
    } catch (error) {
      logger.error('[Voice] Download failed:', error);
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
        logger.info('[Voice] Cleaned up:', filePath);
      }
    } catch (error) {
      logger.warn('[Voice] Cleanup failed:', error);
    }
  }
}

// Export singleton
module.exports = new VoiceTool();
