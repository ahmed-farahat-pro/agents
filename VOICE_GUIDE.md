# 🎙️ Voice & Natural Language Guide

> Just talk to the bot - it understands what you want!

---

## 🗣️ How It Works

When you send a **voice note** or **text message**, the bot:

1. **Transcribes** (if voice) your message
2. **Uses cheapest AI model** (Zhipu GLM-4-Flash or DeepSeek) to understand intent
3. **Routes to correct action** automatically
4. **Executes** what you asked for

---

## 💬 Examples - Just Talk!

### Create a Task (Planning)

**Voice/Text:**
> "I need to add user authentication with JWT tokens to the backend"

**Bot understands:**
- Intent: PLAN
- Task: "add user authentication with JWT tokens"
- Action: Creates implementation plan

---

### Switch Project

**Voice/Text:**
> "Switch to the mobile app project"
or in Arabic:
> "بدل على مشروع الموبايل"

**Bot understands:**
- Intent: PROJECT_SWITCH
- Project: "mobile"
- Action: Switches active project

---

### Change AI Model

**Voice/Text:**
> "Use Moonshot AI for this task"
or:
> "Use Claude instead"

**Bot understands:**
- Intent: MODEL_SWITCH
- Model: "moonshot" or "anthropic"
- Action: Switches AI provider

---

### Check Status

**Voice/Text:**
> "What's the status of my tasks?"
or in Arabic:
> "ايش صار على المهام؟"

**Bot understands:**
- Intent: STATUS
- Action: Shows current task status

---

### Ask Questions

**Voice/Text:**
> "How does the authentication system work?"

**Bot understands:**
- Intent: ASK
- Question: "How does authentication system work"
- Action: Answers your question

---

### Chat with Agent

**Voice/Text:**
> "I want to talk to the backend developer"
or:
> "Connect me with the planner"

**Bot understands:**
- Intent: CHAT
- Agent: "backend" or "planner"
- Action: Starts direct chat with agent

---

### Approve Plan

**Voice/Text:**
> "Yes, go ahead with the implementation"
or:
> "Approve this plan"
or in Arabic:
> "وافق على الخطة"

**Bot understands:**
- Intent: APPROVE
- Action: Approves pending plan

---

## 🌐 Languages Supported

- **English** - Full support
- **Arabic** - Full support (العربية)
- **Mixed** - Can handle mixing both

---

## 🧠 What The Bot Understands

| What You Say | Bot Does |
|--------------|----------|
| "Add login feature" | Creates plan for login feature |
| "Show my projects" | Lists all projects |
| "Use Claude" | Switches to Anthropic Claude |
| "What's the status?" | Shows current task status |
| "Talk to backend dev" | Opens chat with Backend Dev agent |
| "Yes, approve it" | Approves pending plan |
| "How does auth work?" | Answers your question |
| "Cancel this task" | Cancels active task |
| "Help me" | Shows help message |

---

## ⚡ Cost-Effective

The bot uses the **cheapest available AI model** to understand your intent:

1. **Intent Detection**: Zhipu GLM-4-Flash or DeepSeek (~$0.001 per request)
2. **Task Execution**: Your chosen model (Claude, Moonshot, etc.)

This keeps costs low while still being smart!

---

## 🔄 Full Voice Example

**You (voice):**
> "I want to add a payment integration with Stripe to my backend API"

**Bot:**
1. Transcribes your voice
2. Detects intent: PLAN
3. Extracts task: "add payment integration with Stripe"
4. Creates implementation plan
5. Shows you the plan
6. Waits for your approval

**You (voice):**
> "Yes, go ahead"

**Bot:**
1. Approves the plan
2. Starts implementation tonight
3. Sends completion report next morning

---

## 🎯 Tips for Best Results

1. **Be Clear**
   - ❌ "Do that thing"
   - ✅ "Add JWT authentication to the backend"

2. **Mention Context**
   - "For the backend project, add..."
   - "Switch to mobile app then add..."

3. **Use Natural Language**
   - "I need to..."
   - "Can you..."
   - "Please help me..."

4. **In Arabic Too!**
   - "أضف تسجيل دخول"
   - "اعرض المشاريع"
   - "استخدم Moonshot"

---

## 🆘 If Bot Doesn't Understand

The bot will ask for clarification:
> "Sorry, I didn't fully understand. Could you clarify what you'd like to do?"

Then try:
- Being more specific
- Using command format: `/plan <task>`
- Or say "help" for command list

---

## 📊 Behind The Scenes

```
Voice/Text Input
      ↓
Transcribe (if voice)
      ↓
Intent Detection (Cheap AI)
      ↓
Extract: task, project, model, etc.
      ↓
Route to Handler
      ↓
Execute Action
      ↓
Respond to User
```

---

**🎙️ Just talk naturally - the bot understands!**
