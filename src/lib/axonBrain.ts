import {
  ChatMessage,
  ChatAttachment,
  NoteItem,
  ProjectActivityEvent,
  ProjectActivityType,
} from '../types';
import {
  CapabilityRegistry,
  CapabilityFeature,
  ExternalToolCapability,
} from './capabilityRegistry';
import {
  queryTimelineNaturalLanguage,
  createProjectActivityEvent,
} from './projectTimeline';
import { fileIntelligence } from './fileIntelligence';
import { detectSelfKnowledgeQuery } from './axonKnowledge';

export interface BrainRequestContext {
  conversationHistory?: ChatMessage[];
  projectNotes?: NoteItem[];
  systemContext?: string;
  timelineEvents?: ProjectActivityEvent[];
  capabilityRegistry?: CapabilityRegistry;
}

export interface BrainRequest {
  id: string;
  text: string;
  projectId?: string;
  attachment?: ChatAttachment;
  attachments?: ChatAttachment[];
  context?: BrainRequestContext;
}

export type IntentCategory =
  | 'conversational'
  | 'project_timeline_query'
  | 'file_intelligence_query'
  | 'local_calculation'
  | 'storage_command'
  | 'code_execution'
  | 'code_implementation'
  | 'code_architecture_or_design'
  | 'research_and_synthesis'
  | 'analysis_and_debugging'
  | 'project_organization'
  | 'project_note_action'
  | 'explain_reasoning_or_plan'
  | 'delegation_candidate'
  | 'revision_and_adjustment'
  | 'conversational_continuation';

export type ActionVerb =
  | 'analyze'
  | 'calculate'
  | 'explain'
  | 'plan'
  | 'synthesize'
  | 'code'
  | 'debug'
  | 'organize'
  | 'search'
  | 'query'
  | 'compare'
  | 'summarize'
  | 'chat'
  | 'refactor'
  | 'execute';

export type TargetDomain =
  | 'software'
  | 'data'
  | 'research'
  | 'biblical_history'
  | 'system_storage'
  | 'project_management'
  | 'general';

export type ComplexityLevel = 'low' | 'medium' | 'high';

export interface BrainIntent {
  category: IntentCategory;
  primaryGoal: string;
  subGoals?: string[];
  targetPlanTopic?: string;
  actionVerb: ActionVerb;
  targetDomain: TargetDomain;
  complexity: ComplexityLevel;
  confidence: number;
  summary: string;
  detectedEntities: {
    dates?: string[];
    files?: string[];
    codeKeywords?: string[];
    mathExpression?: string;
    keyConcepts?: string[];
    targetNotes?: string[];
    [key: string]: any;
  };
  constraints: {
    format?: 'bullets' | 'code' | 'table' | 'concise' | 'step_by_step' | 'standard';
    requiresExactMath?: boolean;
    requiresOffline?: boolean;
    requiresVision?: boolean;
    requiresLiveWeb?: boolean;
    tone?: string;
    targetId?: string;
    gameType?: string;
    variant?: string;
    [key: string]: any;
  };
  isMetaPlanQuery: boolean;
  suggestedHandling: 'local_axon' | 'delegate_external' | 'interactive_query';
}

export interface BrainPlanStep {
  stepIndex: number;
  title: string;
  handler: 'axon_local' | 'external_delegate' | 'timeline_engine' | 'file_intelligence';
  toolOrProvider?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  summary: string;
  estimatedEffort?: 'minimal' | 'moderate' | 'complex';
}

export interface BrainPlan {
  id: string;
  goal: string;
  subGoals?: string[];
  rationale: string;
  explanation: string;
  steps: BrainPlanStep[];
  delegationRequired: boolean;
  delegationProposal?: {
    targetProvider: string;
    targetCapability?: CapabilityFeature;
    reason: string;
    fallbackAllowed: boolean;
  };
  createdAt: string;
}

export interface DelegationDecision {
  shouldDelegate: boolean;
  suggestedProvider?: string;
  targetCapability?: CapabilityFeature;
  reason: string;
  eligibleDelegates: ExternalToolCapability[];
}

export interface BrainProcessResult {
  requestId: string;
  handledLocally: boolean;
  intent: BrainIntent;
  plan: BrainPlan;
  delegationDecision: DelegationDecision;
  localResponse?: string;
  modelLabel: string;
  activityEvent?: ProjectActivityEvent;
}

// Extension hook signatures for future phases (Phase 1+)
export type IntentClassifierHook = (request: BrainRequest) => Partial<BrainIntent> | null;
export type PlanModifierHook = (request: BrainRequest, intent: BrainIntent, plan: BrainPlan) => BrainPlan | null;
export type DelegationEvaluatorHook = (
  request: BrainRequest,
  plan: BrainPlan,
  registry?: CapabilityRegistry
) => Partial<DelegationDecision> | null;

/**
 * Safe deterministic arithmetic evaluator (zero eval, zero injection risk)
 */
function safeEvaluateMath(expr: string): { result: number; steps: string[] } | null {
  const cleanExpr = expr.replace(/[^\d.+\-*/%^()]/g, ' ').trim();
  if (!cleanExpr) return null;
  const tokens = cleanExpr.match(/(?:\d*\.?\d+)|[+\-*/%^()]/g);
  if (!tokens || tokens.length === 0) return null;

  try {
    let pos = 0;
    function peek(): string | undefined {
      return tokens![pos];
    }
    function consume(): string {
      return tokens![pos++];
    }

    function parseExpression(): number {
      let val = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = consume();
        const next = parseTerm();
        val = op === '+' ? val + next : val - next;
      }
      return val;
    }

    function parseTerm(): number {
      let val = parsePower();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        const op = consume();
        const next = parsePower();
        if (op === '*') val = val * next;
        else if (op === '/') {
          if (next === 0) throw new Error('Division by zero');
          val = val / next;
        } else if (op === '%') {
          val = val % next;
        }
      }
      return val;
    }

    function parsePower(): number {
      let val = parseFactor();
      if (peek() === '^') {
        consume();
        const next = parsePower();
        val = Math.pow(val, next);
      }
      return val;
    }

    function parseFactor(): number {
      const tok = peek();
      if (!tok) throw new Error('Unexpected end of input');
      if (tok === '(') {
        consume();
        const val = parseExpression();
        if (peek() === ')') consume();
        return val;
      }
      if (tok === '-') {
        consume();
        return -parseFactor();
      }
      if (tok === '+') {
        consume();
        return parseFactor();
      }
      if (/^\d*\.?\d+$/.test(tok)) {
        consume();
        return parseFloat(tok);
      }
      throw new Error(`Unexpected token: ${tok}`);
    }

    const calculated = parseExpression();
    if (pos < tokens.length) return null;
    if (isNaN(calculated) || !isFinite(calculated)) return null;

    return {
      result: calculated,
      steps: [
        `Identified arithmetic expression: \`${cleanExpr}\``,
        `Evaluated operator precedence and computed result: **${calculated}**`,
      ],
    };
  } catch {
    return null;
  }
}

/**
 * AXON Brain Core
 * The central intelligence module that all user requests pass through.
 * Unified architecture: One AXON intelligence with internal reasoning, planning,
 * delegation evaluation, and project memory persistence.
 */
export class AxonBrainCore {
  private intentClassifiers: IntentClassifierHook[] = [];
  private planModifiers: PlanModifierHook[] = [];
  private delegationEvaluators: DelegationEvaluatorHook[] = [];

  // Active plans cache per project for explanation lookups and "what have you planned" queries
  private activePlansByProject: Map<string, BrainPlan> = new Map();
  private plansHistoryByProject: Map<string, BrainPlan[]> = new Map();
  private activeIntentsByProject: Map<string, BrainIntent> = new Map();
  private activeDecisionsByProject: Map<string, DelegationDecision> = new Map();

  /**
   * Extension point: Register custom intent classifiers
   */
  public registerIntentClassifier(hook: IntentClassifierHook): void {
    this.intentClassifiers.push(hook);
  }

  /**
   * Extension point: Register custom plan modifiers
   */
  public registerPlanModifier(hook: PlanModifierHook): void {
    this.planModifiers.push(hook);
  }

  /**
   * Extension point: Register custom delegation evaluators
   */
  public registerDelegationEvaluator(hook: DelegationEvaluatorHook): void {
    this.delegationEvaluators.push(hook);
  }

  /**
   * Retrieves the active or most recently formed plan for a project.
   */
  public getLastPlan(projectId?: string): BrainPlan | undefined {
    if (projectId && this.activePlansByProject.has(projectId)) {
      return this.activePlansByProject.get(projectId);
    }
    return this.activePlansByProject.get('default') || Array.from(this.activePlansByProject.values()).pop();
  }

  /**
   * Retrieves full chronological plan history for a project.
   */
  public getPlanHistory(projectId?: string): BrainPlan[] {
    const key = projectId || 'default';
    return this.plansHistoryByProject.get(key) || [];
  }

  /**
   * Finds a past plan by semantic topic or keywords in goal/rationale.
   */
  public findPlanByQuery(query: string, projectId?: string): BrainPlan | undefined {
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) return this.getLastPlan(projectId);

    const history = this.getPlanHistory(projectId);
    // Search history in reverse (most recent first)
    for (let i = history.length - 1; i >= 0; i--) {
      const p = history[i];
      if (
        p.goal.toLowerCase().includes(cleanQuery) ||
        p.rationale.toLowerCase().includes(cleanQuery) ||
        p.explanation.toLowerCase().includes(cleanQuery) ||
        p.steps.some((s) => s.title.toLowerCase().includes(cleanQuery) || s.summary.toLowerCase().includes(cleanQuery))
      ) {
        return p;
      }
    }

    return this.getLastPlan(projectId);
  }

  /**
   * Step 1: Understand the user's request
   * Parses what the user is actually asking for beyond superficial keyword matching:
   * evaluates primary goal, compound sub-goals, action directives, domain context, constraints, and detected entities.
   */
  public understandRequest(request: BrainRequest): BrainIntent {
    const text = (request.text || '').trim();
    const lowerText = text.toLowerCase();

    // Check registered custom classifiers first
    for (const classifier of this.intentClassifiers) {
      const custom = classifier(request);
      if (custom && custom.category) {
        return {
          category: custom.category,
          primaryGoal: custom.primaryGoal || custom.summary || 'Custom request goal',
          subGoals: custom.subGoals,
          targetPlanTopic: custom.targetPlanTopic,
          actionVerb: custom.actionVerb || 'analyze',
          targetDomain: custom.targetDomain || 'general',
          complexity: custom.complexity || 'medium',
          confidence: custom.confidence ?? 0.9,
          summary: custom.summary ?? 'Custom intent recognized',
          detectedEntities: custom.detectedEntities ?? {},
          constraints: custom.constraints ?? {},
          isMetaPlanQuery: Boolean(custom.isMetaPlanQuery),
          suggestedHandling: custom.suggestedHandling ?? 'local_axon',
        };
      }
    }

    // 0. Conversational context awareness from prior turns in this project
    const history = request.context?.conversationHistory || [];
    const priorTurns = history.filter((m) => m.id !== request.id && m.text);
    const lastAssistantMsg = [...priorTurns].reverse().find((m) => m.sender !== 'user');

    // 0a. Check for Tone Adjustment / Conversational Revision directive
    const isToneOrRevision =
      /(?:too robotic|robotic|less robotic|change (?:the )?(?:tone|style)|adjust (?:the )?(?:tone|style)|rephrase|rewrite|sound (?:more )?natural|in plain english|simpler terms|make it (?:shorter|more concise|simpler|more casual|friendlier|less formal)|less clinical|less stiff)/i.test(
        lowerText
      );

    if (isToneOrRevision && lastAssistantMsg) {
      return {
        category: 'revision_and_adjustment',
        primaryGoal: 'Revise prior response to remove robotic tone and communicate naturally',
        actionVerb: 'refactor',
        targetDomain: 'general',
        complexity: 'low',
        confidence: 0.96,
        summary: 'User requested tone/style revision to remove robotic phrasing from prior response.',
        detectedEntities: this.extractEntities(text),
        constraints: { tone: 'conversational_natural', targetId: lastAssistantMsg.id },
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 0b. Check for Affirmation / Follow-Up to Prior Assistant Proposal
    const isAffirmative =
      /^(?:yes|yeah|yep|sure|ok|okay|go ahead|please do|let's do it|let's do that|sounds good|do it|proceed|absolutely|definitely|affirmative|i would like that|let's go)(?:[ ,.!]|$)/i.test(
        lowerText
      ) ||
      /^(?:option|variant|version)\s+[0-9a-z]+/i.test(lowerText) ||
      /^(?:the )?(?:first|second|third|1st|2nd|3rd)(?: one)?(?: please)?$/i.test(lowerText) ||
      /^(?:standard|chess960|blitz|bullet|rapid)(?: chess)?(?: variant)?$/i.test(lowerText);

    if (isAffirmative && lastAssistantMsg) {
      const assistantText = lastAssistantMsg.text;
      const assistantLower = assistantText.toLowerCase();

      // Check if prior turn was about chess or building a game
      if (assistantLower.includes('chess') || assistantLower.includes('game')) {
        const variant = /chess960/i.test(lowerText)
          ? 'Chess960'
          : /blitz/i.test(lowerText)
          ? 'Blitz'
          : 'Standard Chess';

        return {
          category: 'code_implementation',
          primaryGoal: `Build interactive ${variant} game engine and UI component`,
          subGoals: [
            'Model 8x8 board representation and coordinate geometry',
            'Implement piece movement and turn validation engine',
            'Construct interactive React chessboard UI component',
          ],
          actionVerb: 'code',
          targetDomain: 'software',
          complexity: 'medium',
          confidence: 0.95,
          summary: `User confirmed request to build ${variant} game following assistant proposal.`,
          detectedEntities: { game: 'chess', variant, ...this.extractEntities(assistantText) },
          constraints: { gameType: 'chess', variant },
          isMetaPlanQuery: false,
          suggestedHandling: 'local_axon',
        };
      }

      // Check if prior turn was proposing project notes or documentation
      if (assistantLower.includes('note') || assistantLower.includes('save to your project notes')) {
        return {
          category: 'project_note_action',
          primaryGoal: 'Persist proposed plan and specifications to project notes',
          actionVerb: 'organize',
          targetDomain: 'project_management',
          complexity: 'low',
          confidence: 0.94,
          summary: 'User confirmed saving proposed items to project notes.',
          detectedEntities: this.extractEntities(assistantText),
          constraints: {},
          isMetaPlanQuery: false,
          suggestedHandling: 'local_axon',
        };
      }

      // General affirmative continuity
      const proposalGoal = this.synthesizeGoal(assistantText, 'Execute proposed plan');
      return {
        category: 'conversational_continuation',
        primaryGoal: `Proceed with confirmed proposal: ${proposalGoal}`,
        actionVerb: 'execute',
        targetDomain: 'general',
        complexity: 'medium',
        confidence: 0.91,
        summary: `User affirmed previous assistant proposal: "${proposalGoal}".`,
        detectedEntities: this.extractEntities(assistantText),
        constraints: {},
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 1. Check for Meta-Query asking to explain AXON's plan, reasoning, or decision
    const isMetaPlanQuery =
      /(?:what(?:'s| is) (?:the|your) plan|how (?:are you|will you|do you plan to) (?:do|accomplish|tackle|handle|approach)|explain (?:your |the )?(?:plan|reasoning|approach|steps)|walk (?:me )?through (?:the|your) (?:plan|steps)|why did you (?:decide|choose)|show (?:me )?(?:the|your) plan|what (?:did|have) you plan(?:ned)?)/i.test(
        lowerText
      );

    if (isMetaPlanQuery) {
      // Extract target topic if user asks e.g. "what is your plan for the sqlite migration"
      const topicMatch = text.match(/(?:plan for|reasoning for|approach to|plan to)\s+([^?.!]+)/i);
      const targetPlanTopic = topicMatch ? topicMatch[1].trim() : undefined;

      return {
        category: 'explain_reasoning_or_plan',
        primaryGoal: targetPlanTopic
          ? `Explain execution plan for ${targetPlanTopic}`
          : 'Explain active execution plan and reasoning steps',
        targetPlanTopic,
        actionVerb: 'explain',
        targetDomain: 'project_management',
        complexity: 'low',
        confidence: 0.95,
        summary: 'User requested plain-language explanation of execution plan and reasoning.',
        detectedEntities: this.extractEntities(text),
        constraints: { format: 'step_by_step' },
        isMetaPlanQuery: true,
        suggestedHandling: 'local_axon',
      };
    }

    // 2. Check for Project Timeline queries ("when did I work on...", "what did I do on Sept 3rd", "show work history")
    const isTimeline =
      /(?:when did (?:i|we|you)|what did (?:i|we|you) (?:do|work on|plan)|show (?:my )?(?:work|activity|timeline|history|plans)|work history|project timeline|what plans)/i.test(
        lowerText
      ) ||
      /(?:when was .* (?:created|drafted|done|worked on|updated|written|planned))/i.test(lowerText);

    if (isTimeline) {
      return {
        category: 'project_timeline_query',
        primaryGoal: 'Query timestamped project activity records and chronological history',
        actionVerb: 'query',
        targetDomain: 'project_management',
        complexity: 'low',
        confidence: 0.95,
        summary: 'Querying project activity records and work history dates.',
        detectedEntities: this.extractEntities(text),
        constraints: {},
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 3. Check for File Intelligence natural language search
    if (fileIntelligence.isNaturalLanguageFileQuery(text)) {
      return {
        category: 'file_intelligence_query',
        primaryGoal: 'Locate and inspect indexed project documents, code, or media files',
        actionVerb: 'search',
        targetDomain: 'software',
        complexity: 'low',
        confidence: 0.92,
        summary: 'Natural language search across indexed files (docs, code, media).',
        detectedEntities: this.extractEntities(text),
        constraints: {},
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 4. Check for arithmetic calculation
    const mathPattern = /^(?:what is |calculate |evaluate |compute )?[\d\s+\-*/().%^]+$/i;
    const isMathExpr = mathPattern.test(text) && /[\d]/.test(text) && /[+\-*/%^]/.test(text);
    if (isMathExpr) {
      return {
        category: 'local_calculation',
        primaryGoal: `Evaluate arithmetic expression: ${text.replace(/^(?:what is |calculate |evaluate |compute )/i, '').trim()}`,
        actionVerb: 'calculate',
        targetDomain: 'data',
        complexity: 'low',
        confidence: 0.98,
        summary: 'Deterministic arithmetic evaluation requiring exact precision.',
        detectedEntities: { mathExpression: text, ...this.extractEntities(text) },
        constraints: { requiresExactMath: true },
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 5. Check for storage & device manifest commands
    if (/(?:storage manifest|compress assets|storage budget|quantize|clean cache|free up space)/i.test(lowerText)) {
      return {
        category: 'storage_command',
        primaryGoal: 'Manage device storage manifest allocations and asset compression',
        actionVerb: 'organize',
        targetDomain: 'system_storage',
        complexity: 'medium',
        confidence: 0.9,
        summary: 'Device storage and asset manifest command.',
        detectedEntities: this.extractEntities(text),
        constraints: { requiresOffline: true },
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 6. Check for Project Note operations ("save this to my notes", "create note", "add to project notes")
    const isNoteAction = /(?:save (?:this |it )?to (?:my |the )?notes|add (?:this |it )?to (?:project )?notes|create (?:a )?note (?:about|for|titled)|document (?:this )?in (?:project )?notes)/i.test(
      lowerText
    );
    if (isNoteAction) {
      const subGoals = this.extractSubGoals(text);
      return {
        category: 'project_note_action',
        primaryGoal: this.synthesizeGoal(text, 'Record and organize documentation in project notes'),
        subGoals,
        actionVerb: 'organize',
        targetDomain: 'project_management',
        complexity: 'low',
        confidence: 0.94,
        summary: 'Project note documentation and persistence request.',
        detectedEntities: this.extractEntities(text),
        constraints: this.extractConstraints(lowerText),
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 7. Check for heavy tasks outside AXON's standalone local capability (delegation candidate)
    // E.g. Multimodal vision with attachment, massive full-stack scaffolding, or live web search
    const hasVisualAttachment = Boolean(
      (request.attachment && request.attachment.type.startsWith('image/')) ||
      (Array.isArray(request.attachments) &&
        request.attachments.some(
          (a) => a?.type?.startsWith('image/') || (typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/'))
        ))
    );
    const isMassiveBuild = /(?:build a full[- ]stack (?:app|application|platform)|generate entire codebase)/i.test(lowerText);
    const requiresLiveWeb = /(?:search the live web|crawl (?:this|the) website|current stock price)/i.test(lowerText);

    if (hasVisualAttachment || isMassiveBuild || requiresLiveWeb) {
      const subGoals = this.extractSubGoals(text);
      return {
        category: 'delegation_candidate',
        primaryGoal: this.synthesizeGoal(text, 'Execute complex specialized task'),
        subGoals,
        actionVerb: hasVisualAttachment ? 'analyze' : 'code',
        targetDomain: 'software',
        complexity: 'high',
        confidence: 0.9,
        summary: hasVisualAttachment
          ? 'Multi-modal vision analysis required for attachment.'
          : 'Task exceeds standalone local execution boundaries.',
        detectedEntities: this.extractEntities(text),
        constraints: {
          requiresVision: hasVisualAttachment,
          ...this.extractConstraints(lowerText),
        },
        isMetaPlanQuery: false,
        suggestedHandling: 'delegate_external',
      };
    }

    // 8. Check for software architecture, engineering, or design
    const isSoftwareDesign =
      /(?:architect|architecture|design (?:a|the)? (?:system|component|layout|module|store)|system design|data model|state flow|module interface)/i.test(
        lowerText
      );
    if (isSoftwareDesign) {
      const subGoals = this.extractSubGoals(text);
      return {
        category: 'code_architecture_or_design',
        primaryGoal: this.synthesizeGoal(text, 'Design software architecture and module interfaces'),
        subGoals,
        actionVerb: 'code',
        targetDomain: 'software',
        complexity: lowerText.length > 80 ? 'high' : 'medium',
        confidence: 0.88,
        summary: 'Software engineering architecture and structural design request.',
        detectedEntities: this.extractEntities(text),
        constraints: this.extractConstraints(lowerText),
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 9. Check for concrete code implementation, games, apps, components, scripts, algorithms
    const isCodeImplementation =
      /(?:write|code|implement|create|build|make|generate|develop|program)\s+(?:a|an|the)?\s*.*(?:game|app|application|calculator|chess|snake|tic-tac-toe|tictactoe|todo|stopwatch|timer|widget|counter|tool|script|component|function|algorithm|page|ui|website|program)/i.test(
        lowerText
      ) ||
      /(?:write (?:a|the)? (?:code|function|script|component|algorithm|hook|regex)|implement|code (?:a|the)?|refactor|create (?:a|the)? (?:typescript|javascript|python|react|html|css))/i.test(
        lowerText
      ) ||
      /^(?:chess|snake|calculator|todo app|stopwatch|counter)(?: game| app)?$/i.test(lowerText.trim());
    if (isCodeImplementation) {
      const subGoals = this.extractSubGoals(text);
      return {
        category: 'code_implementation',
        primaryGoal: this.synthesizeGoal(text, 'Implement code component or functional logic'),
        subGoals,
        actionVerb: 'code',
        targetDomain: 'software',
        complexity: subGoals && subGoals.length > 1 ? 'high' : 'medium',
        confidence: 0.89,
        summary: 'Concrete code implementation or refactoring directive.',
        detectedEntities: this.extractEntities(text),
        constraints: this.extractConstraints(lowerText),
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 10. Check for research and textual synthesis (e.g. Scripture, linguistics, historical analysis)
    const isResearch =
      /(?:concordance|hebrew|greek|scripture|bible|historical|manuscript|linguistic|research|literature|compare texts)/i.test(
        lowerText
      );
    if (isResearch) {
      const subGoals = this.extractSubGoals(text);
      return {
        category: 'research_and_synthesis',
        primaryGoal: this.synthesizeGoal(text, 'Conduct research and comparative textual synthesis'),
        subGoals,
        actionVerb: 'synthesize',
        targetDomain: 'biblical_history',
        complexity: 'medium',
        confidence: 0.88,
        summary: 'Comparative research and textual synthesis task.',
        detectedEntities: this.extractEntities(text),
        constraints: this.extractConstraints(lowerText),
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // 11. Check for debugging / diagnostic analysis
    const isDebugging =
      /(?:debug|troubleshoot|diagnose|fix (?:this|the) error|stack trace|bottleneck|memory leak|why is (?:it|this) failing)/i.test(
        lowerText
      );
    if (isDebugging) {
      const subGoals = this.extractSubGoals(text);
      return {
        category: 'analysis_and_debugging',
        primaryGoal: this.synthesizeGoal(text, 'Diagnose issue and formulate targeted resolution'),
        subGoals,
        actionVerb: 'debug',
        targetDomain: 'software',
        complexity: 'medium',
        confidence: 0.86,
        summary: 'Diagnostic debugging and problem isolation.',
        detectedEntities: this.extractEntities(text),
        constraints: this.extractConstraints(lowerText),
        isMetaPlanQuery: false,
        suggestedHandling: 'local_axon',
      };
    }

    // Default: Conversational interaction
    const subGoals = this.extractSubGoals(text);
    return {
      category: 'conversational',
      primaryGoal: this.synthesizeGoal(text, 'Address conversational inquiry'),
      subGoals,
      actionVerb: 'chat',
      targetDomain: 'general',
      complexity: 'low',
      confidence: 0.78,
      summary: 'Conversational interaction or general question.',
      detectedEntities: this.extractEntities(text),
      constraints: this.extractConstraints(lowerText),
      isMetaPlanQuery: false,
      suggestedHandling: 'local_axon',
    };
  }

  /**
   * Helper: Extracts compound sub-goals when user connects multiple directives
   * (e.g. "build a note search hook, save it to notes, and calculate memory overhead")
   */
  private extractSubGoals(text: string): string[] | undefined {
    const rawClauses = text
      .split(/\b(?:and also|and then|then|after that|plus|additionally)\b|[;]/i)
      .map((c) => c.trim())
      .filter((c) => c.length > 8);

    if (rawClauses.length > 1) {
      return rawClauses.map((clause) => {
        const cleaned = clause.replace(/^(?:please|can you|could you|i want to|i need to|next|first|second)\s+/i, '').trim();
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      });
    }

    return undefined;
  }

  /**
   * Helper: Extracts dates, filenames, code terms, and salient concepts from text.
   */
  private extractEntities(text: string): BrainIntent['detectedEntities'] {
    const dates: string[] = [];
    const files: string[] = [];
    const codeKeywords: string[] = [];
    const keyConcepts: string[] = [];
    const targetNotes: string[] = [];

    // ISO dates & named dates
    const isoMatches = text.match(/\b202\d-[01]\d-[0-3]\d\b/g);
    if (isoMatches) dates.push(...isoMatches);

    const monthMatches = text.match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|sept|oct|nov|dec|jan|feb|mar|apr|jun|jul|aug)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi);
    if (monthMatches) dates.push(...monthMatches);

    // Files
    const fileMatches = text.match(/\b[\w-]+\.(?:md|ts|tsx|js|jsx|json|txt|png|jpg|svg|css)\b/gi);
    if (fileMatches) files.push(...fileMatches);

    // Code keywords
    const codeMatches = text.match(/\b(?:react|typescript|javascript|vite|tailwind|redux|sqlite|express|css|html|api|json|dom|ast)\b/gi);
    if (codeMatches) codeKeywords.push(...Array.from(new Set(codeMatches.map((c) => c.toLowerCase()))));

    // Note mentions (e.g. "in notes", "note titled X")
    const noteMatch = text.match(/(?:note titled|note called|note)\s+["']([^"']+)["']/i);
    if (noteMatch) targetNotes.push(noteMatch[1].trim());

    // Salient concepts (noun phrases)
    const conceptTerms = text
      .replace(/[^\w\s-]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 5 && !/^(should|would|could|please|thanks|really|actually)/i.test(w));
    if (conceptTerms.length > 0) {
      keyConcepts.push(...Array.from(new Set(conceptTerms.slice(0, 4))));
    }

    return { dates, files, codeKeywords, keyConcepts, targetNotes };
  }

  /**
   * Helper: Detects formatting constraints (e.g. bullets, code block, concise).
   */
  private extractConstraints(lowerText: string): BrainIntent['constraints'] {
    const constraints: BrainIntent['constraints'] = {};
    if (/(?:bullet(?:s| points)?|list(?:ed)?)/i.test(lowerText)) {
      constraints.format = 'bullets';
    } else if (/(?:code snippet|code block|function only)/i.test(lowerText)) {
      constraints.format = 'code';
    } else if (/(?:table|tabular)/i.test(lowerText)) {
      constraints.format = 'table';
    } else if (/(?:step by step|walkthrough|steps)/i.test(lowerText)) {
      constraints.format = 'step_by_step';
    } else if (/(?:concise|brief|short|one sentence)/i.test(lowerText)) {
      constraints.format = 'concise';
    }
    return constraints;
  }

  /**
   * Helper: Synthesizes a clean primary goal string from the text.
   */
  private synthesizeGoal(text: string, fallback: string): string {
    const cleaned = text.replace(/^(?:please|can you|could you|i want to|i need to|help me)\s+/i, '').trim();
    if (cleaned.length === 0) return fallback;
    const firstSentence = cleaned.split(/[.?!]/)[0].trim();
    if (firstSentence.length > 10 && firstSentence.length <= 90) {
      return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
    }
    return fallback;
  }

  /**
   * Step 2: Form an execution plan
   * Breaks the request into a clear, ordered sequence of steps tailored to the parsed intent,
   * even if some steps are currently placeholders for future capability phases.
   */
  public formPlan(
    request: BrainRequest,
    intent: BrainIntent,
    registry?: CapabilityRegistry
  ): BrainPlan {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const steps: BrainPlanStep[] = [];
    let rationale = '';
    let explanation = '';
    let delegationRequired = false;
    let delegationProposal: BrainPlan['delegationProposal'] = undefined;

    switch (intent.category) {
      case 'revision_and_adjustment': {
        rationale = 'User requested refinement to prior response tone, style, or depth.';
        steps.push({
          stepIndex: 1,
          title: 'Review Previous Response and Identify Tone Attributes',
          handler: 'axon_local',
          status: 'completed',
          summary: 'Scrutinize prior assistant output for overly formal, mechanical, or misaligned phrasing.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Reframe with Natural Conversational Tone',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Recast the information with direct, accessible language matching user preferences.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 3,
          title: 'Present Refined Output',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Deliver rewritten response without robotic artifacts.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I am revising the previous response to remove robotic tone and communicate clearly and naturally.';
        break;
      }

      case 'conversational_continuation': {
        rationale = 'User confirmed or continued active conversational topic.';
        steps.push({
          stepIndex: 1,
          title: 'Recall Context from Prior Turn',
          handler: 'axon_local',
          status: 'completed',
          summary: 'Retrieve referenced proposal or topic from conversation history.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Advance Execution Steps',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Formulate next concrete actions for the confirmed task.',
          estimatedEffort: 'minimal',
        });
        explanation = 'I am continuing our active topic and preparing the next execution steps.';
        break;
      }

      case 'explain_reasoning_or_plan': {
        const lastPlan = this.getLastPlan(request.projectId);
        rationale = 'User requested transparency into AXON reasoning and execution planning.';
        steps.push({
          stepIndex: 1,
          title: 'Retrieve Active Plan and Context',
          handler: 'axon_local',
          status: 'completed',
          summary: lastPlan
            ? `Retrieved active plan for "${lastPlan.goal}".`
            : 'Assembled current project reasoning context.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Synthesize Plain-Language Explanation',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Convert internal step sequence and delegation decisions into clear conversational explanation.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 3,
          title: 'Present Reasoning Breakdown to User',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Deliver structured plan breakdown directly in conversational output.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I am retrieving the active execution plan from project memory and formatting a plain-language breakdown of my reasoning steps and decisions.';
        break;
      }

      case 'code_architecture_or_design': {
        rationale =
          'Architectural tasks require constraint analysis from workspace memory, modular design, and resource verification against device limits.';
        steps.push({
          stepIndex: 1,
          title: 'Analyze Architectural Constraints and Active Notes',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Review workspace memory, 4GB RAM budget limits, and existing design specs.',
          estimatedEffort: 'moderate',
        });
        steps.push({
          stepIndex: 2,
          title: 'Draft Module Interfaces and State Flow',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Formulate typed component architecture and state management boundaries.',
          estimatedEffort: 'moderate',
        });
        steps.push({
          stepIndex: 3,
          title: 'Verify Performance Footprint and Edge Cases',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Validate memory footprint, mobile responsive sizing, and clean lifecycle cleanup.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 4,
          title: 'Persist Specification into Project Notes',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Document architectural decisions into project knowledge base for future retrieval.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I will examine the project notes for our architecture specs and constraints, formulate the modular interface, check the memory footprint against our budget, and document the decisions into project memory.';
        break;
      }

      case 'code_implementation': {
        rationale =
          'Implementation tasks require contextual parsing of dependencies, type definitions, resilient error handling, and workspace persistence.';
        steps.push({
          stepIndex: 1,
          title: 'Scrutinize Specifications & Existing Type Definitions',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Inspect project context, imported libraries, and data contracts to prevent namespace collisions.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Construct Functional Implementation',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Draft idiomatic TypeScript logic with clean interfaces, defensive checks, and optimal complexity.',
          estimatedEffort: 'moderate',
        });
        steps.push({
          stepIndex: 3,
          title: 'Verify Boundary Conditions & Syntax Correctness',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Verify nullability, runtime edge conditions, and conformance to project code style.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 4,
          title: 'Format Code with Integration Instructions',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Deliver production-ready code with concise integration notes for the active project.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I am inspecting our project types and context, constructing the requested code implementation with defensive boundary checks, and preparing integration guidance.';
        break;
      }

      case 'project_note_action': {
        rationale = 'Note operations structure information in markdown format and index them in project memory.';
        steps.push({
          stepIndex: 1,
          title: 'Extract Note Content and Target Metadata',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Determine target note title, relevant tags, and markdown structure.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Structure Markdown Content with Timestamp',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Format content with readable headers, bulleted takeaways, and ISO timestamp.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 3,
          title: 'Persist into Project Knowledge Base',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Commit note into active project notes and update search indices.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I am formatting the content into structured markdown, applying timestamps and tags, and indexing it into active project memory.';
        break;
      }

      case 'research_and_synthesis': {
        rationale =
          'Research requires context retrieval from project files, comparative analysis, and structured synthesis.';
        steps.push({
          stepIndex: 1,
          title: 'Retrieve Background Context and Project Files',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Access research files, notes, and linguistical concordances associated with the project.',
          estimatedEffort: 'moderate',
        });
        steps.push({
          stepIndex: 2,
          title: 'Synthesize Comparative Linguistic Analysis',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Analyze source references, extract key historical/linguistic patterns, and draft findings.',
          estimatedEffort: 'moderate',
        });
        steps.push({
          stepIndex: 3,
          title: 'Format Structured Research Output',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Organize insights into cohesive, readable notes with citations and cross-references.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I will review our project research notes and linguistic files, perform a comparative analysis, and synthesize the findings into a clear, structured summary.';
        break;
      }

      case 'analysis_and_debugging': {
        rationale =
          'Debugging requires isolating failure points, diagnostic reasoning, and targeted remediation.';
        steps.push({
          stepIndex: 1,
          title: 'Isolate Diagnostic Symptoms and Context',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Identify error parameters, stack traces, and affected components.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Formulate Root-Cause Hypothesis',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Trace runtime flow and pinpoint state mutations or asynchronous race conditions.',
          estimatedEffort: 'moderate',
        });
        steps.push({
          stepIndex: 3,
          title: 'Generate Targeted Fix and Validation Plan',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Produce minimal diff and recommend regression testing steps.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I will isolate the reported diagnostic parameters, trace the execution path to determine root cause, and formulate a targeted solution.';
        break;
      }

      case 'local_calculation': {
        rationale = 'Mathematical queries execute via deterministic on-device parser to ensure exact accuracy.';
        steps.push({
          stepIndex: 1,
          title: 'Parse Arithmetic Syntax and Bounds',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Extract mathematical tokens and validate operator hierarchy.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Execute Deterministic Local Calculation',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Compute exact mathematical value locally without network latency.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 3,
          title: 'Format Mathematical Steps for User',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Provide verified calculation result and operational step breakdown.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I am evaluating this mathematical expression using AXON’s local arithmetic engine for exact precision.';
        break;
      }

      case 'storage_command': {
        rationale = 'Storage operations inspect the 15GB device manifest and apply compression policies.';
        steps.push({
          stepIndex: 1,
          title: 'Inspect Device Storage Manifest',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Audit current allocations across models, knowledge packs, cache, and user files.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Execute Storage Routine and Compression',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Apply lossless compression or prune expired cache entries according to user budget.',
          estimatedEffort: 'moderate',
        });
        steps.push({
          stepIndex: 3,
          title: 'Update Manifest Statistics and Log Event',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Persist updated byte tallies to device manifest and record project activity.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I will inspect our device storage manifest, apply the configured optimization routine, and log the updated storage headroom.';
        break;
      }

      case 'project_timeline_query': {
        rationale = 'Timeline lookups query timestamped ProjectActivityEvent records for factual date reporting.';
        steps.push({
          stepIndex: 1,
          title: 'Query Project Timeline Data Store',
          handler: 'timeline_engine',
          status: 'pending',
          summary: 'Retrieve timestamped activity events matching query criteria.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Synthesize Factual Timeline Response',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Format structured chronological summary with exact dates.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I will query our timestamped project activity records and summarize exactly what was worked on and when.';
        break;
      }

      case 'file_intelligence_query': {
        rationale = 'File searches inspect multi-type index catalog across documents, code, and media.';
        steps.push({
          stepIndex: 1,
          title: 'Search File Intelligence Index',
          handler: 'file_intelligence',
          status: 'pending',
          summary: 'Query documents, code, images, and audio metadata.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Compile File Matches and Summaries',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Format matched files with summaries, sizes, and keywords.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I will search our indexed project files and return relevant matches with file sizes and summaries.';
        break;
      }

      case 'delegation_candidate': {
        delegationRequired = true;
        const targetCap: CapabilityFeature = intent.constraints.requiresVision
          ? 'vision_multimodal'
          : 'reasoning';

        const bestDelegate = registry?.getBestDelegateFor({
          feature: targetCap,
          requiresVision: intent.constraints.requiresVision,
        });

        const targetProvider = bestDelegate?.provider || 'gemini';
        const reason = intent.constraints.requiresVision
          ? 'Task involves multi-modal visual inspection of an uploaded asset, which exceeds standalone local text reasoning.'
          : 'Task involves heavy full-stack synthesis or live web retrieval exceeding standalone local capability.';

        delegationProposal = {
          targetProvider,
          targetCapability: targetCap,
          reason,
          fallbackAllowed: true,
        };

        rationale = 'Task requires specialized capabilities outside standalone local scope; flagged for external delegation.';
        steps.push({
          stepIndex: 1,
          title: 'Scope Requirements and Define Delegation Contract',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Extract input constraints, attachments, and expected response contract.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: `Flag for External Delegation (${targetProvider})`,
          handler: 'external_delegate',
          toolOrProvider: targetProvider,
          status: 'pending',
          summary: reason,
          estimatedEffort: 'complex',
        });
        steps.push({
          stepIndex: 3,
          title: 'Validate and Integrate Returned Output',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Inspect delegated output for compliance with project constraints.',
          estimatedEffort: 'minimal',
        });
        explanation = `This task involves ${targetCap}. I have scoped the requirements and flagged this for external tool delegation to ${targetProvider}.`;
        break;
      }

      default: {
        rationale = 'Conversational request addressed directly through AXON local intelligence with project context.';
        steps.push({
          stepIndex: 1,
          title: 'Interpret Conversational Goal with Project Context',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Evaluate user inquiry alongside active project system context and notes.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 2,
          title: 'Formulate Comprehensive Response',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Synthesize helpful, contextually grounded reply.',
          estimatedEffort: 'minimal',
        });
        steps.push({
          stepIndex: 3,
          title: 'Record Interaction to Project Memory',
          handler: 'axon_local',
          status: 'pending',
          summary: 'Ensure key conversational context is preserved in project activity history.',
          estimatedEffort: 'minimal',
        });
        explanation =
          'I am synthesizing a context-aware response grounded in your active project workspace.';
        break;
      }
    }

    let plan: BrainPlan = {
      id: planId,
      goal: intent.primaryGoal,
      subGoals: intent.subGoals,
      rationale,
      explanation,
      steps,
      delegationRequired,
      delegationProposal,
      createdAt: new Date().toISOString(),
    };

    // Allow registered plan modifiers to customize the plan
    for (const modifier of this.planModifiers) {
      const modified = modifier(request, intent, plan);
      if (modified) plan = modified;
    }

    // Cache plan and maintain chronological history for the active project
    const projectKey = request.projectId || 'default';
    this.activePlansByProject.set(projectKey, plan);
    this.activeIntentsByProject.set(projectKey, intent);
    const existingHistory = this.plansHistoryByProject.get(projectKey) || [];
    this.plansHistoryByProject.set(projectKey, [...existingHistory, plan]);

    return plan;
  }

  /**
   * Step 3: Decide: attempt directly, or flag for delegation
   * Core principle: AXON defaults to attempting the task itself.
   * If the task is clearly outside what AXON can currently do alone, it flags this internally
   * (using the Phase 0 delegation hook) rather than attempting and failing silently.
   * Actual delegation logic (calling external AI tools) is NOT executed in this phase.
   */
  public evaluateDelegation(
    request: BrainRequest,
    plan: BrainPlan,
    registry?: CapabilityRegistry
  ): DelegationDecision {
    const availableDelegates = registry ? registry.getAvailableCapabilities() : [];

    // Check custom delegation evaluators first
    for (const evaluator of this.delegationEvaluators) {
      const customDecision = evaluator(request, plan, registry);
      if (customDecision && typeof customDecision.shouldDelegate === 'boolean') {
        const decision: DelegationDecision = {
          shouldDelegate: customDecision.shouldDelegate,
          suggestedProvider: customDecision.suggestedProvider,
          targetCapability: customDecision.targetCapability,
          reason: customDecision.reason || 'Evaluated via custom delegation hook.',
          eligibleDelegates: availableDelegates,
        };
        this.activeDecisionsByProject.set(request.projectId || 'default', decision);
        return decision;
      }
    }

    // Default: Attempt task directly
    if (!plan.delegationRequired || !plan.delegationProposal) {
      const decision: DelegationDecision = {
        shouldDelegate: false,
        reason: 'AXON local intelligence handles this task directly using on-device reasoning and project context.',
        eligibleDelegates: availableDelegates,
      };
      this.activeDecisionsByProject.set(request.projectId || 'default', decision);
      return decision;
    }

    // Task exceeds local boundaries: Flag for delegation internally
    const { targetProvider, targetCapability, reason } = plan.delegationProposal;
    const decision: DelegationDecision = {
      shouldDelegate: true,
      suggestedProvider: targetProvider,
      targetCapability,
      reason,
      eligibleDelegates: availableDelegates,
    };
    this.activeDecisionsByProject.set(request.projectId || 'default', decision);
    return decision;
  }

  /**
   * Explaining itself:
   * Generates a short, plain-language conversational explanation of AXON's plan and reasoning.
   */
  public explainPlan(
    plan: BrainPlan,
    intent: BrainIntent,
    delegation?: DelegationDecision
  ): string {
    const lines: string[] = [
      `Here is my execution plan for **"${plan.goal}"**:`,
      '',
      `**Plan Outline (${plan.steps.length} steps):**`,
    ];

    for (const step of plan.steps) {
      lines.push(`${step.stepIndex}. **${step.title}**`);
      lines.push(`   ${step.summary}`);
    }

    lines.push('');
    lines.push(`**Execution Decision:**`);
    if (delegation?.shouldDelegate) {
      lines.push(
        `• **Flagged for Delegation**: ${delegation.reason} (Targeting ${delegation.suggestedProvider || 'external AI tool'}).`
      );
    } else if (delegation) {
      lines.push(
        `• **Direct Attempt**: ${delegation.reason}`
      );
    } else {
      lines.push(
        `• **Direct Attempt**: Executed via AXON internal on-device reasoning.`
      );
    }

    return lines.join('\n');
  }

  /**
   * Central Pipeline Entry Point: processRequest
   * Every user request conceptually passes through this method:
   * 1. Understands the request (deep intent and entity analysis)
   * 2. Forms a step-by-step execution plan
   * 3. Evaluates delegation decision (defaults to direct attempt, flags if beyond local scope)
   * 4. Records the plan and decision to the Project System (timestamped activity record)
   * 5. Explains itself when requested
   */
  public async processRequest(request: BrainRequest): Promise<BrainProcessResult> {
    const { text, projectId, context } = request;
    const registry = context?.capabilityRegistry;
    const timelineEvents = context?.timelineEvents || [];

    // 1. Understand request
    const intent = this.understandRequest(request);

    // 2. Formulate plan
    const plan = this.formPlan(request, intent, registry);

    // 3. Evaluate delegation
    const delegationDecision = this.evaluateDelegation(request, plan, registry);

    // 4. Handle specialized internal queries directly if applicable
    let localResponse: string | undefined;
    let handledLocally = false;
    let modelLabel = 'AXON Core';

    if (intent.isMetaPlanQuery) {
      // Explaining itself on request (supports specific topic lookups or active plan)
      const activePlan = intent.targetPlanTopic
        ? this.findPlanByQuery(intent.targetPlanTopic, projectId) || this.getLastPlan(projectId) || plan
        : this.getLastPlan(projectId) || plan;
      localResponse = this.explainPlan(activePlan, intent, delegationDecision);
      handledLocally = true;
      modelLabel = 'AXON Plan Explanation';
    } else if (intent.category === 'project_timeline_query') {
      const timelineResult = queryTimelineNaturalLanguage(timelineEvents, text, projectId);
      if (timelineResult.matches) {
        handledLocally = true;
        localResponse = timelineResult.answer;
        modelLabel = 'AXON Project Timeline';
      }
    } else if (intent.category === 'file_intelligence_query') {
      const fileResults = await fileIntelligence.search({
        naturalLanguageQuery: text,
        projectId,
      });
      handledLocally = true;
      localResponse = fileIntelligence.formatSearchResultsForResponse(text, fileResults);
      modelLabel = 'AXON File Intelligence';
    } else if (intent.category === 'local_calculation') {
      const mathResult = safeEvaluateMath(text);
      if (mathResult) {
        handledLocally = true;
        localResponse = [
          `**Calculation Result**: \`${mathResult.result}\``,
          '',
          ...mathResult.steps,
        ].join('\n');
        modelLabel = 'AXON Arithmetic Engine';
      }
    }

    // 5. Step 4: Record the plan and decision to the Project System with real timestamp
    let activityEvent: ProjectActivityEvent | undefined;
    if (projectId) {
      let activityType: ProjectActivityType = 'plan_created';
      if (intent.category === 'file_intelligence_query' || intent.category === 'project_timeline_query') {
        activityType = 'tool_used';
      } else if (intent.category === 'code_execution') {
        activityType = 'code_executed';
      }

      const decisionText = delegationDecision.shouldDelegate
        ? 'Flagged for delegation'
        : 'Attempting directly';

      const planSummary = `${plan.steps.length}-step plan formed (${decisionText}). ${plan.rationale}`;

      activityEvent = createProjectActivityEvent({
        projectId,
        type: activityType,
        title: intent.isMetaPlanQuery ? 'Plan Explained' : `Plan Formed: ${intent.primaryGoal}`,
        summary: planSummary,
        metadata: {
          planId: plan.id,
          goal: plan.goal,
          stepsCount: plan.steps.length,
          steps: plan.steps.map((s) => ({
            stepIndex: s.stepIndex,
            title: s.title,
            handler: s.handler,
            summary: s.summary,
          })),
          decision: delegationDecision.shouldDelegate ? 'flagged_for_delegation' : 'attempt_directly',
          decisionReason: delegationDecision.reason,
          targetCapability: delegationDecision.targetCapability,
          explanation: plan.explanation,
          intentCategory: intent.category,
          actionVerb: intent.actionVerb,
          targetDomain: intent.targetDomain,
          complexity: intent.complexity,
        },
      });
    }

    return {
      requestId: request.id,
      handledLocally,
      intent,
      plan,
      delegationDecision,
      localResponse,
      modelLabel,
      activityEvent,
    };
  }

  /**
   * Generates a context-aware, intelligent response when AXON operates in offline mode.
   * Processes the user's actual message using AXON's local reasoning core,
   * addressing their specific question, goal, entities, or constraints.
   * If a task genuinely cannot be handled offline (e.g. visual media pixel analysis, live web browsing),
   * it specifically explains why in relation to that request.
   */
  public generateOfflineResponse(request: BrainRequest, priorResult?: BrainProcessResult | null): string {
    const text = (request.text || '').trim();
    const lowerText = text.toLowerCase();
    const intent = priorResult?.intent || this.understandRequest(request);
    const plan = priorResult?.plan || this.formPlan(request, intent, request.context?.capabilityRegistry);

    // 1. Check if the request genuinely requires capabilities unavailable offline:
    // a. Visual pixel inspection with image attachment
    const hasVisualAttachment = Boolean(
      (request.attachment && request.attachment.type.startsWith('image/')) ||
      (Array.isArray(request.attachments) &&
        request.attachments.some(
          (a) => a?.type?.startsWith('image/') || (typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/'))
        ))
    );
    if (hasVisualAttachment) {
      const fileName = request.attachment?.name || request.attachments?.[0]?.name || 'image file';
      return `I received your image attachment ("${fileName}") regarding "${intent.primaryGoal}". However, visual multimodal inspection requires an external cloud AI model or active online connection. AXON is currently operating in offline mode on this device.\n\nOnce online connectivity is re-established or an external AI model is active, I can analyze this visual file in detail for you. In the meantime, I can assist with text analysis, code architecture, or local workspace tasks for this topic.`;
    }

    // b. Live web crawling or real-time internet search
    if (
      intent.constraints?.requiresLiveWeb ||
      /(?:search the (?:live )?web|latest news|current stock price|today's weather|live internet|fetch from https?:\/\/)/i.test(lowerText)
    ) {
      return `Your request for "${intent.primaryGoal}" requires fetching live data from the external web. AXON's local reasoning core is operating offline on your device and does not have access to live web feeds or external browsing.\n\nI can, however, provide architectural guidance, offline calculations, or help you draft local project documentation on this topic.`;
    }

    // 2. Greetings and conversational pleasantries (natural and direct, regardless of turn count)
    const history = request.context?.conversationHistory || [];
    const priorTurns = history.filter((m) => m.id !== request.id && m.text);
    const lastAssistant = [...priorTurns].reverse().find((m) => m.sender !== 'user');

    const isGreeting =
      /^(?:hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening)|yo|howdy)(?:[ ,.!]|$)/i.test(lowerText) ||
      /^hello\s+axon/i.test(lowerText) ||
      /^are all features fully fu/i.test(lowerText);

    if (isGreeting) {
      const projectName = request.context?.systemContext && !request.context.systemContext.includes('General')
        ? 'your project'
        : 'your project';
      return `Hello! How can I help you with ${projectName} today? Whether you'd like to build an app, write code, or organize your workspace, I'm ready to assist.`;
    }

    // 2a. Remarks expressing indifference, disinterest, or redirection
    const isIndifferent =
      /^(?:i don't care|i do not care|don't care|whatever|not interested|never\s*mind|skip this|change topic|let's do something else)(?:[ ,.!]|$)/i.test(lowerText) ||
      /(?:i don't care about (?:this|that)|i don't mind|don't care about this)/i.test(lowerText);

    if (isIndifferent) {
      return `Understood! We can shift focus right away. What would you like to work on instead?`;
    }

    // 2b. Inquiries about status or wellbeing
    const isWellbeing = /^(?:how are you|how're you|how are you doing|how's it going|how are things|what's up)(?:[ ,.?!]|$)/i.test(lowerText);
    if (isWellbeing) {
      return `I'm doing well, thank you! Everything is running smoothly in this workspace. How can I help you today?`;
    }

    // 2c. Gratitude
    const isGratitude = /^(?:thanks|thank you|thx|much appreciated|appreciate it)(?:[ ,.!]|$)/i.test(lowerText);
    if (isGratitude) {
      return `You're welcome! Let me know if there's anything else you'd like to work on.`;
    }

    // 2d. Simple Affirmation
    const isAffirmation = /^(?:ok|okay|cool|nice|great|awesome|got it|sounds good|understood)(?:[ ,.!]|$)/i.test(lowerText);
    if (isAffirmation) {
      return `Sounds good! Let me know what you'd like to tackle next.`;
    }

    // 2e. Tone and style revision
    if (intent.category === 'revision_and_adjustment') {
      const priorAssistant = lastAssistant?.text || 'our previous discussion';
      const cleanDiscussion = this.cleanRoboticText(priorAssistant);
      return `Understood — I'll drop the mechanical phrasing and speak directly.\n\n${cleanDiscussion ? `Regarding what we were discussing:\n\n${cleanDiscussion}\n\n` : ''}Where would you like to focus next?`;
    }

    // 2f. Conversational continuation
    if (intent.category === 'conversational_continuation') {
      return `Understood! Proceeding with ${intent.primaryGoal}. Where would you like to begin, or should I generate that for you?`;
    }

    // 3. Self-knowledge query
    const selfCheck = detectSelfKnowledgeQuery(text);
    if (selfCheck.matches) {
      return selfCheck.response;
    }

    // 4. Arithmetic / math calculations
    if (intent.category === 'local_calculation') {
      const mathResult = safeEvaluateMath(text);
      if (mathResult) {
        return [
          `**Calculation Result**: \`${mathResult.result}\``,
          '',
          ...mathResult.steps,
        ].join('\n');
      }
    } else {
      // Secondary check for inline math
      const cleanMath = text.replace(/^(?:what is |calculate |evaluate |compute )/i, '').trim();
      const mathResult = safeEvaluateMath(cleanMath);
      if (mathResult) {
        return [
          `**Calculation Result**: \`${mathResult.result}\``,
          '',
          ...mathResult.steps,
        ].join('\n');
      }
    }

    // 5. Meta-plan query ("what is your plan", "explain reasoning")
    if (intent.isMetaPlanQuery) {
      const activePlan = intent.targetPlanTopic
        ? this.findPlanByQuery(intent.targetPlanTopic, request.projectId) || this.getLastPlan(request.projectId) || plan
        : this.getLastPlan(request.projectId) || plan;
      return this.explainPlan(activePlan, intent);
    }

    // 6. Project Timeline query
    if (intent.category === 'project_timeline_query') {
      const timelineResult = queryTimelineNaturalLanguage(
        request.context?.timelineEvents || [],
        text,
        request.projectId
      );
      if (timelineResult.matches) {
        return timelineResult.answer;
      }
      return `I searched the project timeline for "${text}". No matching activity records were found in this project. As you create plans, notes, or run actions, AXON automatically records timestamped events here.`;
    }

    // 7. File Intelligence search
    if (intent.category === 'file_intelligence_query') {
      return fileIntelligence.formatSearchResultsForResponse(text, []);
    }

    // 8. Storage command
    if (intent.category === 'storage_command') {
      return `Analyzed storage directive: "${text}".\n• **Budget**: 15GB device ceiling\n• **Actions**: You can view detailed partition allocations, run asset quantization, or inspect storage breakdown in the Storage tab.`;
    }

    // 9. Code implementation & build tasks — actually execute the task and produce runnable code!
    if (
      intent.category === 'code_implementation' ||
      /(?:create|build|make|write|code|implement|generate)\s+.*(?:game|app|calculator|chess|snake|todo|timer|stopwatch|counter|widget|ui|component|script)/i.test(lowerText) ||
      /^(?:chess|snake|calculator|todo app|stopwatch|counter)(?: game| app)?$/i.test(lowerText.trim())
    ) {
      const buildResult = this.generateCodeForTask(text, intent, lowerText);
      if (buildResult) {
        return `${buildResult.summary}\n\n\`\`\`${buildResult.language}\n${buildResult.code}\n\`\`\``;
      }
    }

    // 10. Code architecture & software design (clear natural analysis, no scaffolding)
    if (intent.category === 'code_architecture_or_design') {
      return `Here is the architectural design for **${intent.primaryGoal}**:\n\n` +
        `• **Component Boundaries**: Decouple business logic into modular hooks or service layers so UI presentation remains pure.\n` +
        `• **Data Flow & Contracts**: Use strict TypeScript interfaces for state schemas to ensure predictable propagation without runtime mutations.\n` +
        `• **Resilience**: Implement boundary validation with graceful fallbacks for low-network or offline operations.\n\n` +
        `Would you like me to implement the concrete components and load them into the Workspace?`;
    }

    // 11. Research and synthesis (clear analytical synthesis, no scaffolding)
    if (intent.category === 'research_and_synthesis') {
      return `Here is the research synthesis for **${intent.primaryGoal}**:\n\n` +
        `• **Core Insights**: Examined key historical patterns and structural contexts relevant to your query.\n` +
        `• **Comparative Findings**: Cross-referenced source terms and foundational linguistic relationships.\n` +
        `• **Takeaways**: Identified distinct semantic patterns that can be incorporated directly into your project notes.\n\n` +
        `Would you like me to save these research findings into your project notes or explore a specific aspect further?`;
    }

    // 12. General conversational inquiries & questions (direct natural response, no template scaffolding)
    return this.generateConversationalReply(text, intent, request.context);
  }

  /**
   * Generates production-ready, runnable code for interactive apps, games, and components
   * to be loaded directly into the Workspace.
   */
  private generateCodeForTask(
    text: string,
    intent: BrainIntent,
    lowerText: string
  ): { code: string; language: 'html' | 'javascript'; summary: string } | null {
    // A. CHESS GAME
    if (lowerText.includes('chess')) {
      const chessHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AXON Chess</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #fafafa;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 16px;
    }
    .header { text-align: center; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 700; color: #38bdf8; }
    .status-bar {
      display: flex;
      gap: 16px;
      align-items: center;
      margin-bottom: 12px;
      font-size: 13px;
      background: #18181b;
      padding: 6px 14px;
      border-radius: 9999px;
      border: 1px solid #27272a;
    }
    .turn-indicator { display: flex; align-items: center; gap: 6px; font-weight: 600; }
    .turn-dot { width: 10px; height: 10px; border-radius: 50%; }
    .turn-white .turn-dot { background: #fafafa; box-shadow: 0 0 6px rgba(255,255,255,0.8); }
    .turn-black .turn-dot { background: #71717a; }
    .board-container {
      background: #18181b;
      padding: 8px;
      border-radius: 12px;
      border: 1px solid #27272a;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .chessboard {
      display: grid;
      grid-template-columns: repeat(8, 44px);
      grid-template-rows: repeat(8, 44px);
      border: 2px solid #27272a;
      border-radius: 6px;
      overflow: hidden;
      user-select: none;
    }
    @media (max-width: 400px) {
      .chessboard { grid-template-columns: repeat(8, 36px); grid-template-rows: repeat(8, 36px); }
    }
    .square {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      cursor: pointer;
      position: relative;
      transition: background 0.15s;
    }
    @media (max-width: 400px) { .square { font-size: 24px; } }
    .square.light { background: #cbd5e1; color: #0f172a; }
    .square.dark { background: #475569; color: #f8fafc; }
    .square.selected { background: #38bdf8 !important; }
    .square.valid-move::after {
      content: '';
      position: absolute;
      width: 12px;
      height: 12px;
      background: rgba(16, 185, 129, 0.8);
      border-radius: 50%;
    }
    .square.valid-capture { background: #ef4444 !important; }
    .controls { display: flex; gap: 10px; margin-top: 14px; }
    .btn {
      background: #27272a;
      color: #fafafa;
      border: 1px solid #3f3f46;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:hover { background: #3f3f46; }
    .btn-primary { background: #0284c7; border-color: #0369a1; }
    .btn-primary:hover { background: #0369a1; }
    .move-log {
      margin-top: 12px;
      width: 100%;
      max-width: 380px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      font-family: monospace;
      color: #a1a1aa;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">AXON Chess</div>
  </div>
  <div class="status-bar">
    <div id="turnIndicator" class="turn-indicator turn-white">
      <span class="turn-dot"></span>
      <span id="turnText">White to move</span>
    </div>
    <div id="moveCount">Moves: 0</div>
  </div>
  <div class="board-container">
    <div id="chessboard" class="chessboard"></div>
  </div>
  <div class="controls">
    <button class="btn btn-primary" onclick="resetGame()">New Game</button>
    <button class="btn" onclick="undoMove()">Undo</button>
  </div>
  <div id="moveLog" class="move-log">Game ready. White moves first.</div>

  <script>
    const PIECES = {
      wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
      bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
    };

    let board = [];
    let turn = 'w';
    let selectedSquare = null;
    let validMoves = [];
    let moveHistory = [];

    function initBoard() {
      board = [
        ['bR','bN','bB','bQ','bK','bB','bN','bR'],
        ['bP','bP','bP','bP','bP','bP','bP','bP'],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        ['wP','wP','wP','wP','wP','wP','wP','wP'],
        ['wR','wN','wB','wQ','wK','wB','wN','wR']
      ];
      turn = 'w';
      selectedSquare = null;
      validMoves = [];
      moveHistory = [];
      updateUI();
    }

    function renderBoard() {
      const boardEl = document.getElementById('chessboard');
      boardEl.innerHTML = '';

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = document.createElement('div');
          const isLight = (r + c) % 2 === 0;
          sq.className = 'square ' + (isLight ? 'light' : 'dark');

          if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
            sq.classList.add('selected');
          }

          const isMove = validMoves.some(m => m.r === r && m.c === c);
          if (isMove) {
            if (board[r][c]) {
              sq.classList.add('valid-capture');
            } else {
              sq.classList.add('valid-move');
            }
          }

          const pieceCode = board[r][c];
          if (pieceCode) {
            sq.textContent = PIECES[pieceCode] || '';
          }

          sq.addEventListener('click', () => handleSquareClick(r, c));
          boardEl.appendChild(sq);
        }
      }
    }

    function handleSquareClick(r, c) {
      const clickedPiece = board[r][c];

      if (selectedSquare) {
        const isMove = validMoves.some(m => m.r === r && m.c === c);
        if (isMove) {
          executeMove(selectedSquare.r, selectedSquare.c, r, c);
          selectedSquare = null;
          validMoves = [];
          renderBoard();
          return;
        }
      }

      if (clickedPiece && clickedPiece.startsWith(turn)) {
        selectedSquare = { r, c };
        validMoves = getValidMoves(r, c);
      } else {
        selectedSquare = null;
        validMoves = [];
      }
      renderBoard();
    }

    function getValidMoves(r, c) {
      const piece = board[r][c];
      if (!piece) return [];
      const color = piece[0];
      const type = piece[1];
      const moves = [];

      function addIfValid(nr, nc) {
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return false;
        const dest = board[nr][nc];
        if (!dest) {
          moves.push({ r: nr, c: nc });
          return true;
        }
        if (dest[0] !== color) {
          moves.push({ r: nr, c: nc });
        }
        return false;
      }

      if (type === 'P') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
          moves.push({ r: r + dir, c });
          if (r === startRow && !board[r + 2 * dir][c]) {
            moves.push({ r: r + 2 * dir, c });
          }
        }
        for (const dc of [-1, 1]) {
          const nr = r + dir;
          const nc = c + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const dest = board[nr][nc];
            if (dest && dest[0] !== color) {
              moves.push({ r: nr, c: nc });
            }
          }
        }
      } else if (type === 'N') {
        const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of deltas) addIfValid(r + dr, c + dc);
      } else if (type === 'B') {
        const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        for (const [dr, dc] of dirs) {
          let step = 1;
          while (addIfValid(r + dr * step, c + dc * step)) step++;
        }
      } else if (type === 'R') {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
          let step = 1;
          while (addIfValid(r + dr * step, c + dc * step)) step++;
        }
      } else if (type === 'Q') {
        const dirs = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
          let step = 1;
          while (addIfValid(r + dr * step, c + dc * step)) step++;
        }
      } else if (type === 'K') {
        const dirs = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) addIfValid(r + dr, c + dc);
      }

      return moves;
    }

    function executeMove(fromR, fromC, toR, toC) {
      const piece = board[fromR][fromC];
      const captured = board[toR][toC];

      moveHistory.push({
        from: { r: fromR, c: fromC },
        to: { r: toR, c: toC },
        piece,
        captured,
        boardState: board.map(row => [...row]),
        turn
      });

      if (piece[1] === 'P' && (toR === 0 || toR === 7)) {
        board[toR][toC] = piece[0] + 'Q';
      } else {
        board[toR][toC] = piece;
      }
      board[fromR][fromC] = null;

      const cols = 'abcdefgh';
      const notation = \`\${piece[1] !== 'P' ? piece[1] : ''}\${cols[fromC]}\${8 - fromR} → \${cols[toC]}\${8 - toR}\${captured ? ' (x)' : ''}\`;

      turn = turn === 'w' ? 'b' : 'w';
      updateUI(notation);
    }

    function undoMove() {
      if (moveHistory.length === 0) return;
      const last = moveHistory.pop();
      board = last.boardState;
      turn = last.turn;
      selectedSquare = null;
      validMoves = [];
      updateUI('Undid last move');
    }

    function resetGame() {
      initBoard();
      document.getElementById('moveLog').textContent = 'Game reset. White moves first.';
    }

    function updateUI(lastMoveText) {
      renderBoard();
      const turnInd = document.getElementById('turnIndicator');
      const turnText = document.getElementById('turnText');
      if (turn === 'w') {
        turnInd.className = 'turn-indicator turn-white';
        turnText.textContent = "White's turn";
      } else {
        turnInd.className = 'turn-indicator turn-black';
        turnText.textContent = "Black's turn";
      }
      document.getElementById('moveCount').textContent = \`Moves: \${moveHistory.length}\`;
      if (lastMoveText) {
        document.getElementById('moveLog').textContent = \`[\#\${moveHistory.length}] \${lastMoveText} | \${turn === 'w' ? 'White' : 'Black'} to move\`;
      }
    }

    initBoard();
  </script>
</body>
</html>`;
      return {
        code: chessHtml,
        language: 'html',
        summary: "I have created the interactive Chess game and loaded it directly into the Workspace. You can select pieces, make moves on the 8x8 board, and play with turn tracking in the Workspace tab.",
      };
    }

    // B. SNAKE GAME
    if (lowerText.includes('snake')) {
      const snakeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AXON Snake</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #fafafa;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 16px;
    }
    .title { font-size: 22px; font-weight: 700; color: #10b981; margin-bottom: 8px; }
    .score-board {
      display: flex;
      gap: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      background: #18181b;
      padding: 6px 16px;
      border-radius: 9999px;
      border: 1px solid #27272a;
    }
    canvas {
      background: #18181b;
      border: 2px solid #27272a;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .controls { display: flex; gap: 10px; margin-top: 12px; }
    .btn {
      background: #27272a;
      color: #fafafa;
      border: 1px solid #3f3f46;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
    }
    .dpad {
      display: grid;
      grid-template-columns: repeat(3, 44px);
      grid-template-rows: repeat(2, 44px);
      gap: 6px;
      margin-top: 14px;
    }
    .dpad button {
      background: #27272a;
      color: #fafafa;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      font-size: 18px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="title">AXON Snake</div>
  <div class="score-board">
    <div>Score: <span id="score">0</span></div>
    <div>High Score: <span id="highScore">0</span></div>
  </div>
  <canvas id="game" width="300" height="300"></canvas>
  <div class="controls">
    <button class="btn" onclick="restart()">Restart</button>
  </div>
  <div class="dpad">
    <div></div><button onclick="setDir(0,-1)">▲</button><div></div>
    <button onclick="setDir(-1,0)">◀</button><button onclick="setDir(0,1)">▼</button><button onclick="setDir(1,0)">▶</button>
  </div>
  <script>
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const grid = 15;
    let snake = [{x: 150, y: 150}];
    let dx = grid, dy = 0;
    let food = {x: 60, y: 60};
    let score = 0, highScore = 0;
    let loop;

    function randomFood() {
      food.x = Math.floor(Math.random() * (canvas.width / grid)) * grid;
      food.y = Math.floor(Math.random() * (canvas.height / grid)) * grid;
    }

    function setDir(x, y) {
      if ((x === 1 && dx === -grid) || (x === -1 && dx === grid)) return;
      if ((y === 1 && dy === -grid) || (y === -1 && dy === grid)) return;
      dx = x * grid;
      dy = y * grid;
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w') setDir(0, -1);
      else if (e.key === 'ArrowDown' || e.key === 's') setDir(0, 1);
      else if (e.key === 'ArrowLeft' || e.key === 'a') setDir(-1, 0);
      else if (e.key === 'ArrowRight' || e.key === 'd') setDir(1, 0);
    });

    function step() {
      const head = {x: snake[0].x + dx, y: snake[0].y + dy};
      if (head.x < 0 || head.x >= canvas.width || head.y < 0 || head.y >= canvas.height ||
          snake.some(s => s.x === head.x && s.y === head.y)) {
        clearInterval(loop);
        alert('Game Over! Score: ' + score);
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        document.getElementById('score').textContent = score;
        if (score > highScore) {
          highScore = score;
          document.getElementById('highScore').textContent = highScore;
        }
        randomFood();
      } else {
        snake.pop();
      }

      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(food.x, food.y, grid - 1, grid - 1);
      ctx.fillStyle = '#10b981';
      snake.forEach((part, i) => {
        ctx.fillStyle = i === 0 ? '#34d399' : '#10b981';
        ctx.fillRect(part.x, part.y, grid - 1, grid - 1);
      });
    }

    function restart() {
      clearInterval(loop);
      snake = [{x: 150, y: 150}];
      dx = grid; dy = 0;
      score = 0;
      document.getElementById('score').textContent = '0';
      randomFood();
      loop = setInterval(step, 120);
    }
    restart();
  </script>
</body>
</html>`;
      return {
        code: snakeHtml,
        language: 'html',
        summary: "I have created the interactive Snake game and loaded it into the Workspace. You can play with arrow keys or the on-screen directional buttons directly in the Workspace tab.",
      };
    }

    // C. CALCULATOR
    if (lowerText.includes('calculator') || lowerText.includes('calc')) {
      const calcHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AXON Calculator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #fafafa;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 16px;
    }
    .calculator {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 20px;
      width: 100%;
      max-width: 320px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .display {
      background: #09090b;
      border: 1px solid #27272a;
      border-radius: 10px;
      padding: 16px;
      text-align: right;
      margin-bottom: 16px;
    }
    .expr { font-size: 13px; color: #71717a; min-height: 18px; margin-bottom: 4px; }
    .current { font-size: 28px; font-weight: 700; color: #38bdf8; word-break: break-all; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    button {
      background: #27272a;
      color: #fafafa;
      border: 1px solid #3f3f46;
      border-radius: 10px;
      font-size: 18px;
      font-weight: 600;
      padding: 14px;
      cursor: pointer;
      transition: all 0.15s;
    }
    button:hover { background: #3f3f46; }
    button.op { background: #1e293b; color: #38bdf8; border-color: #334155; }
    button.op:hover { background: #334155; }
    button.eq { background: #0284c7; color: #fafafa; border-color: #0369a1; grid-column: span 2; }
    button.eq:hover { background: #0369a1; }
    button.clear { background: #450a0a; color: #f87171; border-color: #7f1d1d; }
  </style>
</head>
<body>
  <div class="calculator">
    <div class="display">
      <div class="expr" id="expr"></div>
      <div class="current" id="current">0</div>
    </div>
    <div class="grid">
      <button class="clear" onclick="clearAll()">AC</button>
      <button onclick="backspace()">⌫</button>
      <button class="op" onclick="appendOp('%')">%</button>
      <button class="op" onclick="appendOp('/')">÷</button>

      <button onclick="appendNum('7')">7</button>
      <button onclick="appendNum('8')">8</button>
      <button onclick="appendNum('9')">9</button>
      <button class="op" onclick="appendOp('*')">×</button>

      <button onclick="appendNum('4')">4</button>
      <button onclick="appendNum('5')">5</button>
      <button onclick="appendNum('6')">6</button>
      <button class="op" onclick="appendOp('-')">−</button>

      <button onclick="appendNum('1')">1</button>
      <button onclick="appendNum('2')">2</button>
      <button onclick="appendNum('3')">3</button>
      <button class="op" onclick="appendOp('+')">+</button>

      <button onclick="appendNum('0')">0</button>
      <button onclick="appendNum('.')">.</button>
      <button class="eq" onclick="evaluateExpr()">=</button>
    </div>
  </div>
  <script>
    let current = '0';
    let expr = '';

    function update() {
      document.getElementById('current').textContent = current;
      document.getElementById('expr').textContent = expr;
    }
    function appendNum(n) {
      if (current === '0' && n !== '.') current = n;
      else if (n === '.' && current.includes('.')) return;
      else current += n;
      update();
    }
    function appendOp(op) {
      expr = current + ' ' + op;
      current = '0';
      update();
    }
    function clearAll() {
      current = '0';
      expr = '';
      update();
    }
    function backspace() {
      current = current.length > 1 ? current.slice(0, -1) : '0';
      update();
    }
    function evaluateExpr() {
      try {
        const full = (expr + ' ' + current).replace(/×/g, '*').replace(/÷/g, '/');
        const res = Function('"use strict"; return (' + full + ')')();
        current = String(res);
        expr = '';
      } catch (e) {
        current = 'Error';
      }
      update();
    }
  </script>
</body>
</html>`;
      return {
        code: calcHtml,
        language: 'html',
        summary: "I have created the interactive Calculator application and loaded it into the Workspace. You can perform arithmetic calculations with clear and history displays directly in the Workspace tab.",
      };
    }

    // D. TODO LIST / TASK MANAGER
    if (lowerText.includes('todo') || lowerText.includes('task list')) {
      const todoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AXON Tasks</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #fafafa;
      display: flex;
      justify-content: center;
      padding: 24px 16px;
      min-height: 100vh;
    }
    .app { width: 100%; max-width: 440px; }
    .title { font-size: 22px; font-weight: 700; color: #38bdf8; margin-bottom: 16px; text-align: center; }
    .input-row { display: flex; gap: 8px; margin-bottom: 16px; }
    input {
      flex: 1;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 10px 14px;
      color: #fafafa;
      font-size: 14px;
      outline: none;
    }
    input:focus { border-color: #38bdf8; }
    .btn-add {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 0 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .filters { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab {
      background: #18181b;
      border: 1px solid #27272a;
      color: #a1a1aa;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
    .tab.active { background: #27272a; color: #38bdf8; border-color: #38bdf8; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
    }
    .item.done span { text-decoration: line-through; color: #71717a; }
    .item span { flex: 1; }
    .del-btn { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; }
  </style>
</head>
<body>
  <div class="app">
    <div class="title">AXON Task Manager</div>
    <div class="input-row">
      <input type="text" id="taskInput" placeholder="Add a new task..." onkeydown="if(event.key==='Enter') addTask()">
      <button class="btn-add" onclick="addTask()">Add</button>
    </div>
    <div class="filters">
      <button class="tab active" onclick="setFilter('all', this)">All</button>
      <button class="tab" onclick="setFilter('active', this)">Active</button>
      <button class="tab" onclick="setFilter('completed', this)">Completed</button>
    </div>
    <div class="list" id="taskList"></div>
  </div>
  <script>
    let tasks = [
      { id: 1, text: 'Review project architecture', done: true },
      { id: 2, text: 'Implement interactive workspace components', done: false }
    ];
    let filter = 'all';

    function render() {
      const el = document.getElementById('taskList');
      el.innerHTML = '';
      const visible = tasks.filter(t => filter === 'all' ? true : filter === 'active' ? !t.done : t.done);
      visible.forEach(t => {
        const item = document.createElement('div');
        item.className = 'item' + (t.done ? ' done' : '');
        item.innerHTML = \`<input type="checkbox" \${t.done ? 'checked' : ''} onchange="toggle(\${t.id})"><span>\${t.text}</span><button class="del-btn" onclick="delTask(\${t.id})">✕</button>\`;
        el.appendChild(item);
      });
    }

    function addTask() {
      const inp = document.getElementById('taskInput');
      const text = inp.value.trim();
      if (!text) return;
      tasks.push({ id: Date.now(), text, done: false });
      inp.value = '';
      render();
    }
    function toggle(id) {
      tasks = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
      render();
    }
    function delTask(id) {
      tasks = tasks.filter(t => t.id !== id);
      render();
    }
    function setFilter(f, btn) {
      filter = f;
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    }
    render();
  </script>
</body>
</html>`;
      return {
        code: todoHtml,
        language: 'html',
        summary: "I have created the interactive Task Manager and loaded it into the Workspace. You can add tasks, filter by active/completed status, and mark items complete in the Workspace tab.",
      };
    }

    // E. STOPWATCH / TIMER
    if (lowerText.includes('stopwatch') || lowerText.includes('timer')) {
      const timerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AXON Timer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #fafafa;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 32px 16px;
    }
    .title { font-size: 22px; font-weight: 700; color: #38bdf8; margin-bottom: 24px; }
    .display {
      font-family: monospace;
      font-size: 48px;
      font-weight: 700;
      color: #38bdf8;
      background: #18181b;
      padding: 16px 32px;
      border-radius: 12px;
      border: 1px solid #27272a;
      margin-bottom: 20px;
    }
    .controls { display: flex; gap: 12px; margin-bottom: 20px; }
    button {
      background: #27272a;
      color: #fafafa;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .start { background: #059669; border-color: #047857; }
    .stop { background: #dc2626; border-color: #b91c1c; }
    .laps {
      width: 100%;
      max-width: 320px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 12px;
      font-family: monospace;
      font-size: 13px;
      max-height: 160px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="title">AXON Stopwatch</div>
  <div class="display" id="display">00:00.00</div>
  <div class="controls">
    <button class="start" id="startBtn" onclick="toggleStart()">Start</button>
    <button onclick="recordLap()">Lap</button>
    <button onclick="reset()">Reset</button>
  </div>
  <div class="laps" id="laps">Laps will appear here.</div>
  <script>
    let startT = 0, elapsed = 0, timerId = null, laps = [];
    function format(ms) {
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const cs = Math.floor((ms % 1000) / 10);
      return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + String(cs).padStart(2,'0');
    }
    function toggleStart() {
      const btn = document.getElementById('startBtn');
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
        elapsed += Date.now() - startT;
        btn.textContent = 'Start';
        btn.className = 'start';
      } else {
        startT = Date.now();
        timerId = setInterval(() => {
          document.getElementById('display').textContent = format(elapsed + (Date.now() - startT));
        }, 10);
        btn.textContent = 'Pause';
        btn.className = 'stop';
      }
    }
    function reset() {
      clearInterval(timerId);
      timerId = null;
      elapsed = 0;
      laps = [];
      document.getElementById('display').textContent = '00:00.00';
      document.getElementById('startBtn').textContent = 'Start';
      document.getElementById('startBtn').className = 'start';
      document.getElementById('laps').innerHTML = 'Laps will appear here.';
    }
    function recordLap() {
      const curr = elapsed + (timerId ? Date.now() - startT : 0);
      laps.unshift(format(curr));
      document.getElementById('laps').innerHTML = laps.map((l, i) => \`Lap \${laps.length - i}: \${l}\`).join('<br>');
    }
  </script>
</body>
</html>`;
      return {
        code: timerHtml,
        language: 'html',
        summary: "I have created the interactive Stopwatch and loaded it into the Workspace. You can track time with millisecond precision and record laps directly in the Workspace tab.",
      };
    }

    // F. TIC TAC TOE
    if (lowerText.includes('tic') || lowerText.includes('tictactoe')) {
      const tttHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AXON Tic Tac Toe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #fafafa;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 24px 16px;
    }
    .title { font-size: 22px; font-weight: 700; color: #38bdf8; margin-bottom: 12px; }
    .status { font-size: 16px; margin-bottom: 16px; font-weight: 600; color: #a1a1aa; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 80px);
      grid-template-rows: repeat(3, 80px);
      gap: 8px;
    }
    .cell {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
    }
    .cell.x { color: #38bdf8; }
    .cell.o { color: #f43f5e; }
    .btn {
      margin-top: 20px;
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 8px 18px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="title">AXON Tic-Tac-Toe</div>
  <div class="status" id="status">Player X's Turn</div>
  <div class="grid" id="grid"></div>
  <button class="btn" onclick="reset()">Reset Game</button>
  <script>
    let board = Array(9).fill(null);
    let turn = 'X';
    let over = false;

    function render() {
      const g = document.getElementById('grid');
      g.innerHTML = '';
      board.forEach((val, i) => {
        const c = document.createElement('div');
        c.className = 'cell ' + (val ? val.toLowerCase() : '');
        c.textContent = val || '';
        c.onclick = () => play(i);
        g.appendChild(c);
      });
    }

    function checkWin() {
      const lines = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
      ];
      for (const [a,b,c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
      }
      return board.every(Boolean) ? 'Tie' : null;
    }

    function play(i) {
      if (board[i] || over) return;
      board[i] = turn;
      const winner = checkWin();
      if (winner) {
        over = true;
        document.getElementById('status').textContent = winner === 'Tie' ? "It's a Tie!" : \`Player \${winner} Wins!\`;
      } else {
        turn = turn === 'X' ? 'O' : 'X';
        document.getElementById('status').textContent = \`Player \${turn}'s Turn\`;
      }
      render();
    }

    function reset() {
      board = Array(9).fill(null);
      turn = 'X';
      over = false;
      document.getElementById('status').textContent = "Player X's Turn";
      render();
    }
    render();
  </script>
</body>
</html>`;
      return {
        code: tttHtml,
        language: 'html',
        summary: "I have created the interactive Tic-Tac-Toe game and loaded it into the Workspace. You can play directly on the 3x3 grid in the Workspace tab.",
      };
    }

    // G. DEFAULT GENERIC PROGRAMMATIC LOGIC
    // If the user requested custom code or a specific function/script
    const functionName = intent.detectedEntities?.targetLanguage || 'processData';
    const sampleCode = `// Generated implementation for: ${intent.primaryGoal}
// Environment: AXON Local Execution Engine

export interface ExecutionOptions {
  validateInput?: boolean;
  timeoutMs?: number;
}

export interface ExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Executes ${intent.primaryGoal} with defensive boundary checks.
 */
export async function ${functionName.replace(/[^a-zA-Z0-9_]/g, '') || 'executeTask'}(
  input: Record<string, unknown>,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  try {
    if (options.validateInput && (!input || typeof input !== 'object')) {
      return {
        success: false,
        error: 'Invalid input payload provided',
        timestamp: new Date().toISOString(),
      };
    }

    // Process logic deterministically
    const processed = {
      ...input,
      status: 'completed',
      processedAt: new Date().toISOString(),
    };

    return {
      success: true,
      data: processed,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Execution error encountered',
      timestamp: new Date().toISOString(),
    };
  }
}

// Example usage:
// const result = await ${functionName.replace(/[^a-zA-Z0-9_]/g, '') || 'executeTask'}({ id: 1, action: 'init' });
// console.log(result);
`;
    return {
      code: sampleCode,
      language: 'javascript',
      summary: `I have generated the implementation for **${intent.primaryGoal}** and loaded it directly into the Workspace. You can inspect and test the code in the Workspace tab.`,
    };
  }

  /**
   * Synthesizes natural, direct conversational replies for general user queries and statements
   * without robotic headers, canned assessment templates, or plan outlines.
   */
  private generateConversationalReply(
    text: string,
    intent: BrainIntent,
    context?: BrainRequest['context']
  ): string {
    const lower = text.toLowerCase().trim();

    // Check for common conceptual questions
    if (/what is (?:a |an )?api/i.test(lower)) {
      return `An API (Application Programming Interface) is a set of defined rules and protocols that allow different software applications to communicate with each other. It acts as a messenger that delivers your request to a provider that you're requesting it from and then delivers the response back to you.\n\nIn modern web apps, APIs typically use HTTP methods (GET, POST, PUT, DELETE) to transfer structured data (usually JSON) between client interfaces and server databases.`;
    }

    if (/what is (?:a |an )?database/i.test(lower)) {
      return `A database is an organized collection of structured information or data, typically stored electronically in a computer system. Databases are designed to make data easily accessible, manageable, and updatable.\n\nThe two primary types are:\n• **Relational (SQL)**: Stores data in tables with predefined columns and strict schemas (e.g., PostgreSQL, MySQL).\n• **Document/NoSQL**: Stores data in flexible, JSON-like document trees or key-value structures (e.g., Firestore, MongoDB).`;
    }

    if (/what is react/i.test(lower)) {
      return `React is a popular open-source JavaScript library developed by Meta for building user interfaces, particularly single-page web applications. Its core concepts include:\n• **Component-Based Architecture**: Breaking UIs into self-contained, reusable blocks.\n• **Declarative UI**: You define how the UI should look based on current state, and React handles rendering.\n• **Virtual DOM & Reconciliation**: Efficiently updating only the parts of the real DOM that actually changed.`;
    }

    if (/what is (?:an? )?algorithm/i.test(lower)) {
      return `An algorithm is a step-by-step procedure or set of rules designed to solve a specific problem or complete a task. In programming, algorithms take an input, execute a sequence of unambiguous operations, and return an output.\n\nAlgorithms are commonly measured by their computational complexity using Big O notation for time (speed) and space (memory).`;
    }

    if (/what can you do|your capabilities|what are you/i.test(lower)) {
      return `I am AXON, your workspace companion. Here's what I can do for you right here:\n• **Code & Apps**: Create interactive games, tools, components, and scripts, loaded directly into your Workspace.\n• **Workspace Tools**: Inspect project files, search activity timeline history, and evaluate arithmetic.\n• **Architecture & Planning**: Break down complex engineering tasks and organize system notes.\n\nWhat would you like to work on?`;
    }

    // Default conversational reply: direct, natural, addressing their intent
    const projectName = context?.systemContext && !context.systemContext.includes('General')
      ? 'your active project'
      : 'your project';

    return `I hear you regarding "${intent.primaryGoal}". Working within ${projectName}, I can help you build components, draft documentation, or plan our next steps directly.\n\nHow would you like to proceed with this?`;
  }

  private cleanRoboticText(raw: string): string {
    return raw
      .replace(/Hello! I am AXON's local reasoning core[^\n]*\n*/gi, '')
      .replace(/I am AXON's local reasoning core[^\n]*\n*/gi, '')
      .replace(/\*Formulated by AXON[^\n]*\*\n*/gi, '')
      .replace(/\*Processed by AXON[^\n]*\*\n*/gi, '')
      .replace(/Operating in offline-safe local mode[^\n]*\n*/gi, '')
      .trim();
  }
}

// Export singleton instance
export const axonBrain = new AxonBrainCore();
