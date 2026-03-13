/**
 * 🦉 Nigents - Frontend Developer Agent
 * Writes React/React Native code with RTL support
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');
const openhands = require('../tools/openhands');

class FrontendDevAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json')['frontend-dev'];
    super(config);
  }

  /**
   * Implement frontend components
   */
  async implement(plan) {
    this.setStatus('working', { task: 'implementing_frontend', plan: plan.title });
    this.currentTask = plan;

    try {
      const frontendSteps = plan.steps.filter(step => 
        step.files.some(f => 
          f.match(/\.(jsx?|tsx?|css|scss|vue|html)$/i) ||
          f.includes('components/') ||
          f.includes('pages/')
        )
      );

      const results = [];
      for (const step of frontendSteps) {
        const result = await this.implementFrontendStep(step);
        results.push(result);
        
        this.emit('progress', {
          stage: 'frontend_coding',
          step: step.order,
          message: `Created ${step.files.join(', ')}`,
        });
      }

      this.setStatus('done', { task: 'implementing_frontend' });

      return {
        success: true,
        componentsCreated: results.length,
        message: `Frontend implementation complete. ${results.length} components created/modified.`,
      };
    } catch (error) {
      this.setStatus('error', { task: 'implementing_frontend', error: error.message });
      return {
        success: false,
        message: `Frontend implementation failed: ${error.message}`,
      };
    }
  }

  /**
   * Implement a single frontend step
   */
  async implementFrontendStep(step) {
    const isReactNative = step.files.some(f => f.includes('.native.') || f.includes('mobile'));
    const isRTL = true; // Always assume RTL for Arabic support

    const prompt = `
Create/modify the following frontend files:
${step.files.join('\n')}

Description: ${step.description}

${isReactNative ? 'PLATFORM: React Native' : 'PLATFORM: React Web'}
${isRTL ? 'RTL SUPPORT: Required (Arabic interface)' : ''}

Requirements:
${isReactNative ? `
- React Native best practices
- Use functional components with hooks
- Style with StyleSheet
- Support both iOS and Android
- Handle keyboard avoiding
` : `
- React functional components with hooks
- Responsive design
- Modern CSS (Flexbox/Grid)
`}

${isRTL ? `
RTL REQUIREMENTS:
- Use logical CSS properties (margin-inline-start instead of margin-left)
- Support text direction changes
- Mirror layouts for RTL
- Use appropriate Arabic fonts
- Test text rendering for Arabic
` : ''}

DARK MODE:
- Support dark/light theme switching
- Use CSS variables or theme context
- Ensure contrast ratios meet accessibility standards

Include PropTypes or TypeScript interfaces.
Add JSDoc comments for component documentation.
`;

    const result = await this.callClaude(prompt, { maxTokens: 4096 });
    
    return {
      step: step.order,
      files: step.files,
      code: result.content,
      success: result.success,
    };
  }

  /**
   * Create a React component with full RTL support
   */
  async createReactComponent({ name, props, rtl = true, darkMode = true }) {
    const prompt = `
Create a React component named "${name}".

Props: ${JSON.stringify(props)}
RTL Support: ${rtl}
Dark Mode: ${darkMode}

Generate the complete component file with:
1. Imports
2. PropTypes/TypeScript interfaces
3. Component implementation
4. Styling (CSS-in-JS or CSS modules)
5. Export

${rtl ? `
RTL Implementation:
- Use dir="auto" for text content
- Use CSS logical properties
- Consider RTL in layout calculations
` : ''}

${darkMode ? `
Dark Mode Implementation:
- Use CSS custom properties for colors
- Or use a theme context
- Support system preference detection
` : ''}
`;

    return this.callClaude(prompt);
  }

  /**
   * Create a React Native screen/component
   */
  async createReactNativeScreen({ name, navigation, rtl = true }) {
    const prompt = `
Create a React Native screen component named "${name}".

Navigation: ${navigation}
RTL Support: ${rtl}

Requirements:
- Use React Navigation
- SafeAreaView for notched devices
- ScrollView for scrollable content
- KeyboardAvoidingView for inputs
- Loading and error states
- Pull-to-refresh support

${rtl ? `
RTL Requirements:
- Support Arabic text direction
- Mirror icons that indicate direction (arrows)
- Use I18nManager for layout direction
- Test with Arabic text
` : ''}

Include proper styling with StyleSheet.
Add PropTypes validation.
`;

    return this.callClaude(prompt);
  }

  /**
   * Convert existing component to RTL
   */
  async convertToRTL(componentCode) {
    const prompt = `
Convert this component to fully support RTL (Right-to-Left) for Arabic:

${componentCode}

Changes needed:
1. Replace physical properties with logical ones:
   - margin-left/right → margin-inline-start/end
   - padding-left/right → padding-inline-start/end
   - border-left/right → border-inline-start/end
   - text-align: left → text-align: start
   
2. Add dir="auto" to text elements
3. Handle icon direction (arrows should flip)
4. Use flexbox with flex-start/flex-end instead of left/right

Return the complete updated code.
`;

    return this.callClaude(prompt);
  }
}

module.exports = FrontendDevAgent;
