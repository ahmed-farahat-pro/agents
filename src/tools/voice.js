/**
 * 🦉 Nigents - Voice Tool
 * Whisper for voice input (OpenAI), OpenAI TTS for voice output
 */

const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class VoiceTool {
  constructor() {
    // Initialize OpenAI client (for both Whisper and TTS)
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    
    // Check if OpenAI is configured
    this.enabled = !!process.env.OPENAI_API_KEY;
    if (!this.enabled) {
      logger.warn('[Voice] OPENAI_API_KEY not set - voice features disabled');
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
   * Convert text to speech (OpenAI TTS)
   */
  async textToSpeech(text, language = 'en') {
    try {
      if (!this.enabled) {
        throw new Error('Voice not enabled - OPENAI_API_KEY not configured');
      }
      
      // Map language codes to OpenAI voices
      const voiceMap = {
        'en': 'alloy',
        'english': 'alloy',
        'ar': 'echo',
        'arabic': 'echo',
        'auto': 'alloy',
      };
      
      const voice = voiceMap[language.toLowerCase()] || 'alloy';
      
      // Limit text length (OpenAI TTS has limits)
      const limitedText = text.substring(0, 4000);
      
      const outputFile = path.join(this.tempDir, `voice_${Date.now()}.mp3`);
      
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: limitedText,
      });
      
      const buffer = Buffer.from(await mp3.arrayBuffer());
      fs.writeFileSync(outputFile, buffer);
      
      logger.info('[Voice] Generated with OpenAI TTS:', outputFile);
      return outputFile;
    } catch (error) {
      logger.error('[Voice] TTS failed:', error.message);
      throw error;
    }
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
