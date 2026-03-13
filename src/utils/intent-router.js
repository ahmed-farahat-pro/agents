/**
 * 🦉 Nigents - Intent Router
 * Uses cheapest AI model to understand user intent from voice/text
 */

const aiClient = require('./ai-client');
const logger = require('./logger');

class IntentRouter {
  constructor() {
    // Use cheapest available provider for intent detection
    this.intentProvider = this.getCheapestProvider();
    logger.info(`[IntentRouter] Using ${this.intentProvider} for intent detection`);
  }

  /**
   * Get the cheapest available provider for intent detection
   */
  getCheapestProvider() {
    const providers = aiClient.getAvailableProviders();
    
    // Priority order for cheap providers
    const cheapProviders = ['zhipu', 'deepseek', 'moonshot', 'anthropic'];
    
    for (const provider of cheapProviders) {
      if (providers[provider]?.enabled) {
        return provider;
      }
    }
    
    // Fallback to default
    return aiClient.defaultProvider;
  }

  /**
   * Detect user intent from message
   */
  async detectIntent(message, context = {}) {
    const startTime = Date.now();
    
    const prompt = `
You are an intent detection system for a Telegram bot called Nigents (AI development team).

Analyze this user message and determine what they want to do:
"""${message}"""

Available intents:
1. PLAN - User wants to create an implementation plan for a task (e.g., "add login feature", "fix bug in payment")
2. PROJECT_SWITCH - User wants to switch to a different project (e.g., "switch to frontend project", "work on mobile app")
3. PROJECT_LIST - User wants to see available projects (e.g., "what projects do I have", "show my repos")
4. MODEL_SWITCH - User wants to change AI model/provider (e.g., "use Claude", "switch to Moonshot")
5. MODEL_LIST - User wants to see available AI models (e.g., "what models available", "show AI providers")
6. STATUS - User wants to check current status (e.g., "what's the status", "how is my task")
7. APPROVE - User wants to approve a pending plan (e.g., "approve", "yes go ahead")
8. ASK - User is asking a question about code (e.g., "how does auth work", "explain this function")
9. CHAT - User wants to chat with a specific agent (e.g., "talk to backend dev", "ask planner")
10. CANCEL - User wants to cancel a task (e.g., "cancel this", "stop the task")
11. HELP - User wants help or command list (e.g., "help", "what can you do")
12. GREETING - User is just greeting (e.g., "hello", "hi", "good morning")
13. UNKNOWN - Cannot determine intent

Extract:
- intent: The primary intent from the list above
- confidence: high/medium/low
- extracted_task: If PLAN, extract the task description
- extracted_project: If PROJECT_SWITCH, extract project name/ID
- extracted_model: If MODEL_SWITCH, extract model/provider name
- extracted_agent: If CHAT, extract agent name (planner, backend, frontend, qa, reviewer)
- extracted_question: If ASK, extract the question
- language: Detected language (en/ar/other)

Respond with JSON only:
{
  "intent": "PLAN|PROJECT_SWITCH|PROJECT_LIST|MODEL_SWITCH|MODEL_LIST|STATUS|APPROVE|ASK|CHAT|CANCEL|HELP|GREETING|UNKNOWN",
  "confidence": "high|medium|low",
  "extracted_task": "the task if PLAN",
  "extracted_project": "project name if PROJECT_SWITCH",
  "extracted_model": "model name if MODEL_SWITCH",
  "extracted_agent": "agent name if CHAT",
  "extracted_question": "question if ASK",
  "language": "en|ar|other",
  "response_message": "suggested response to user"
}`;

    try {
      const result = await aiClient.call(prompt, {
        provider: this.intentProvider,
        model: this.getCheapModel(),
        temperature: 0.3,
        maxTokens: 500,
      });

      const duration = Date.now() - startTime;
      
      // Parse JSON response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const intent = JSON.parse(jsonMatch[0]);
      
      logger.info(`[IntentRouter] Detected intent: ${intent.intent}`, {
        confidence: intent.confidence,
        duration,
        provider: result.provider,
      });

      return {
        success: true,
        ...intent,
        provider: result.provider,
        duration,
      };
    } catch (error) {
      logger.error('[IntentRouter] Failed to detect intent:', error);
      return {
        success: false,
        intent: 'UNKNOWN',
        confidence: 'low',
        error: error.message,
      };
    }
  }

  /**
   * Get the cheapest model for the selected provider
   */
  getCheapModel() {
    const providers = aiClient.getAvailableProviders();
    const provider = providers[this.intentProvider];
    
    if (!provider) return null;
    
    // Return cheapest model (usually the last one or one with 'flash' in name)
    const cheapModels = provider.models.filter(m => 
      m.includes('flash') || m.includes('8k') || m.includes('mini')
    );
    
    return cheapModels[0] || provider.models[provider.models.length - 1] || provider.defaultModel;
  }

  /**
   * Generate appropriate response based on intent
   */
  async generateResponse(intent, context = {}) {
    const { 
      confidence, 
      extracted_task, 
      extracted_project, 
      extracted_model,
      extracted_agent,
      extracted_question,
      language 
    } = intent;

    // If confidence is low, ask for clarification
    if (confidence === 'low') {
      return {
        type: 'CLARIFY',
        message: language === 'ar' 
          ? 'عذراً، لم أفهم طلبك تماماً. هل يمكنك التوضيح أكثر؟'
          : 'Sorry, I didn\'t fully understand. Could you clarify what you\'d like to do?',
      };
    }

    // Route based on intent
    switch (intent.intent) {
      case 'PLAN':
        return {
          type: 'PLAN',
          task: extracted_task,
          message: language === 'ar'
            ? `سأقوم بإنشاء خطة لتنفيذ: ${extracted_task}`
            : `I'll create a plan for: ${extracted_task}`,
        };

      case 'PROJECT_SWITCH':
        return {
          type: 'PROJECT_SWITCH',
          project: extracted_project,
          message: language === 'ar'
            ? `سأقوم بالتبديل إلى المشروع: ${extracted_project}`
            : `I'll switch to project: ${extracted_project}`,
        };

      case 'PROJECT_LIST':
        return {
          type: 'PROJECT_LIST',
          message: 'Here are your available projects:',
        };

      case 'MODEL_SWITCH':
        return {
          type: 'MODEL_SWITCH',
          model: extracted_model,
          message: language === 'ar'
            ? `سأقوم بالتبديل إلى نموذج: ${extracted_model}`
            : `I'll switch to AI model: ${extracted_model}`,
        };

      case 'MODEL_LIST':
        return {
          type: 'MODEL_LIST',
          message: 'Here are the available AI models:',
        };

      case 'STATUS':
        return {
          type: 'STATUS',
          message: 'Let me check the current status for you.',
        };

      case 'APPROVE':
        return {
          type: 'APPROVE',
          message: language === 'ar'
            ? 'جاري الموافقة على الخطة...'
            : 'Approving the plan...',
        };

      case 'ASK':
        return {
          type: 'ASK',
          question: extracted_question,
          message: language === 'ar'
            ? `سأبحث عن إجابة لـ: ${extracted_question}`
            : `I'll find an answer for: ${extracted_question}`,
        };

      case 'CHAT':
        return {
          type: 'CHAT',
          agent: extracted_agent,
          message: language === 'ar'
            ? `سأقوم بتوصيلك مع: ${extracted_agent}`
            : `I'll connect you with: ${extracted_agent}`,
        };

      case 'CANCEL':
        return {
          type: 'CANCEL',
          message: 'Which task would you like to cancel?',
        };

      case 'HELP':
        return {
          type: 'HELP',
          message: 'Here are the available commands:',
        };

      case 'GREETING':
        return {
          type: 'GREETING',
          message: language === 'ar'
            ? 'أهلاً! كيف يمكنني مساعدتك اليوم؟ يمكنك إرسال مهمة صوتية أو كتابية.'
            : 'Hello! How can I help you today? You can send a voice or text task.',
        };

      default:
        return {
          type: 'UNKNOWN',
          message: language === 'ar'
            ? 'لم أفهم طلبك. جرب قول "ساعدني" لرؤية الأوامر المتاحة.'
            : 'I didn\'t understand. Try saying "help" to see available commands.',
        };
    }
  }
}

// Singleton instance
const intentRouter = new IntentRouter();

module.exports = intentRouter;
