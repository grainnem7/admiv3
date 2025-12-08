/**
 * Mapping DSL Parser
 *
 * Parses a simple, readable domain-specific language for defining
 * movement-to-music mappings. The DSL is inspired by music programming
 * languages and aims to be accessible to non-programmers.
 *
 * Example DSL:
 *
 *   melody.pitch <- rightHand.height.quantized(scale="minor")
 *   ornament.intensity <- rightHand.curvature
 *   timbre.brightness <- body.lean.forward
 *
 *   when torso.twist > 0.3 for 200ms:
 *     harmony.mode = "Lydian"
 *
 *   if gaze.target == "rightHand":
 *     activeController = rightHand
 */

import type {
  MappingDef,
  ContinuousMappingDef,
  MappingCondition,
  MappingCurveType,
  QuantizationConfig,
  DSLParseResult,
} from './types';

// ============================================
// Tokenizer
// ============================================

interface Token {
  type:
    | 'identifier'
    | 'number'
    | 'string'
    | 'operator'
    | 'keyword'
    | 'punctuation'
    | 'arrow'
    | 'newline'
    | 'indent'
    | 'dedent'
    | 'eof';
  value: string;
  line: number;
  column: number;
}

const KEYWORDS = new Set([
  'when',
  'if',
  'else',
  'for',
  'to',
  'from',
  'with',
  'and',
  'or',
  'not',
  'true',
  'false',
  'null',
  'state',
  'transition',
  'on',
  'enter',
  'exit',
  'route',
  'field',
  'quantized',
  'curve',
  'smooth',
  'invert',
  'deadzone',
  'range',
  'scale',
  'mode',
]);

// Operators recognized by the tokenizer (exported for testing/documentation)
export const DSL_OPERATORS = ['<-', '->', '=>', '==', '!=', '>=', '<=', '>', '<', '+', '-', '*', '/', '='] as const;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split('\n');
  let indentStack = [0];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineNumber = lineNum + 1;

    // Skip empty lines and comments
    const trimmed = line.replace(/#.*$/, '').trimEnd();
    if (trimmed.length === 0) continue;

    // Handle indentation
    const indent = line.match(/^[ \t]*/)?.[0].length ?? 0;
    const currentIndent = indentStack[indentStack.length - 1];

    if (indent > currentIndent) {
      indentStack.push(indent);
      tokens.push({ type: 'indent', value: '', line: lineNumber, column: 0 });
    } else if (indent < currentIndent) {
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
        indentStack.pop();
        tokens.push({ type: 'dedent', value: '', line: lineNumber, column: 0 });
      }
    }

    // Tokenize the line
    let column = indent;
    while (column < line.length) {
      const remaining = line.slice(column);

      // Skip whitespace (but not newlines)
      const wsMatch = remaining.match(/^[ \t]+/);
      if (wsMatch) {
        column += wsMatch[0].length;
        continue;
      }

      // Comments
      if (remaining.startsWith('#')) break;

      // Arrow operators
      if (remaining.startsWith('<-')) {
        tokens.push({ type: 'arrow', value: '<-', line: lineNumber, column });
        column += 2;
        continue;
      }
      if (remaining.startsWith('->')) {
        tokens.push({ type: 'arrow', value: '->', line: lineNumber, column });
        column += 2;
        continue;
      }
      if (remaining.startsWith('=>')) {
        tokens.push({ type: 'arrow', value: '=>', line: lineNumber, column });
        column += 2;
        continue;
      }

      // Comparison operators
      for (const op of ['==', '!=', '>=', '<=']) {
        if (remaining.startsWith(op)) {
          tokens.push({ type: 'operator', value: op, line: lineNumber, column });
          column += op.length;
          continue;
        }
      }

      // Single-char operators
      if ('><+-*/='.includes(remaining[0])) {
        tokens.push({ type: 'operator', value: remaining[0], line: lineNumber, column });
        column += 1;
        continue;
      }

      // Punctuation
      if ('()[]{}:,.'.includes(remaining[0])) {
        tokens.push({ type: 'punctuation', value: remaining[0], line: lineNumber, column });
        column += 1;
        continue;
      }

      // Numbers
      const numMatch = remaining.match(/^-?\d+(\.\d+)?/);
      if (numMatch) {
        tokens.push({ type: 'number', value: numMatch[0], line: lineNumber, column });
        column += numMatch[0].length;
        continue;
      }

      // Strings
      if (remaining[0] === '"' || remaining[0] === "'") {
        const quote = remaining[0];
        const endIndex = remaining.indexOf(quote, 1);
        if (endIndex > 0) {
          const str = remaining.slice(1, endIndex);
          tokens.push({ type: 'string', value: str, line: lineNumber, column });
          column += endIndex + 1;
          continue;
        }
      }

      // Identifiers and keywords
      const idMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (idMatch) {
        const value = idMatch[0];
        const type = KEYWORDS.has(value.toLowerCase()) ? 'keyword' : 'identifier';
        tokens.push({ type, value, line: lineNumber, column });
        column += value.length;
        continue;
      }

      // Unknown character - skip it
      column += 1;
    }

    // Add newline at end of each line
    tokens.push({ type: 'newline', value: '\n', line: lineNumber, column: line.length });
  }

  // Close remaining indents
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ type: 'dedent', value: '', line: lines.length, column: 0 });
  }

  tokens.push({ type: 'eof', value: '', line: lines.length, column: 0 });
  return tokens;
}

// ============================================
// Parser
// ============================================

class Parser {
  private tokens: Token[] = [];
  private current = 0;
  private mappings: MappingDef[] = [];
  private errors: Array<{ line: number; message: string; source: string }> = [];
  private warnings: Array<{ line: number; message: string }> = [];
  private mappingCounter = 0;

  parse(source: string): DSLParseResult {
    this.tokens = tokenize(source);
    this.current = 0;
    this.mappings = [];
    this.errors = [];
    this.warnings = [];
    this.mappingCounter = 0;

    try {
      this.parseProgram();
    } catch (e) {
      if (e instanceof Error) {
        const token = this.peek();
        this.errors.push({
          line: token.line,
          message: e.message,
          source: this.getLineSource(token.line),
        });
      }
    }

    return {
      success: this.errors.length === 0,
      mappings: this.mappings,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private parseProgram(): void {
    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      try {
        this.parseStatement();
      } catch (e) {
        // Recover by skipping to next line
        while (!this.isAtEnd() && !this.check('newline')) {
          this.advance();
        }
        this.skipNewlines();
      }
    }
  }

  private parseStatement(): void {
    const token = this.peek();

    // when condition:
    if (this.matchKeyword('when')) {
      this.parseWhenBlock();
      return;
    }

    // if condition:
    if (this.matchKeyword('if')) {
      this.parseIfBlock();
      return;
    }

    // state StateName:
    if (this.matchKeyword('state')) {
      this.parseStateBlock();
      return;
    }

    // route GazeName:
    if (this.matchKeyword('route')) {
      this.parseRouteBlock();
      return;
    }

    // field FieldName:
    if (this.matchKeyword('field')) {
      this.parseFieldBlock();
      return;
    }

    // Assignment: target <- source
    // or: target = value
    if (this.check('identifier')) {
      this.parseAssignment();
      return;
    }

    throw new Error(`Unexpected token: ${token.value}`);
  }

  private parseAssignment(): void {
    const targetParts = this.parsePropertyPath();
    const target = targetParts.join('.');

    if (this.match('arrow') && this.previous().value === '<-') {
      // Continuous mapping: target <- source
      const mapping = this.parseContinuousMapping(target);
      this.mappings.push(mapping);
    } else if (this.match('operator') && this.previous().value === '=') {
      // State assignment or parameter setting
      const value = this.parseExpression();
      // This would be used for state machine actions or runtime assignments
      this.warnings.push({
        line: this.previous().line,
        message: `Assignment '${target} = ${value}' will be used in state actions`,
      });
    } else {
      throw new Error('Expected <- or = after target');
    }

    this.expectNewline();
  }

  private parseContinuousMapping(target: string): ContinuousMappingDef {
    const sourceParts = this.parsePropertyPath();
    let source = sourceParts.join('.');

    // Parse modifiers
    let curve: MappingCurveType = 'linear';
    let quantization: QuantizationConfig | undefined;
    let inverted = false;
    let smoothing = 0.3;
    let deadZone = 0;
    let inputRange = { min: 0, max: 1 };
    let outputRange = { min: 0, max: 1 };

    // Check for function calls on source
    while (this.check('punctuation') && this.peek().value === '.') {
      this.advance(); // consume '.'
      const modifier = this.consume('identifier', 'Expected modifier name').value;

      if (modifier === 'quantized') {
        quantization = this.parseQuantizationParams();
      } else if (modifier === 'curve') {
        curve = this.parseCurveParam();
      } else if (modifier === 'smooth') {
        smoothing = this.parseNumberParam();
      } else if (modifier === 'invert' || modifier === 'inverted') {
        inverted = true;
      } else if (modifier === 'deadzone') {
        deadZone = this.parseNumberParam();
      } else if (modifier === 'range') {
        outputRange = this.parseRangeParam();
      } else {
        // Unknown modifier - add to source path
        source += '.' + modifier;
      }
    }

    this.mappingCounter++;

    return {
      type: 'continuous',
      id: `mapping_${this.mappingCounter}`,
      name: `${target} <- ${source}`,
      source,
      target,
      inputRange,
      outputRange,
      curve,
      inverted,
      smoothing,
      deadZone,
      quantization,
      priority: 0,
      enabled: true,
    };
  }

  private parseQuantizationParams(): QuantizationConfig {
    const config: QuantizationConfig = {
      scale: 'major',
      root: 'C',
      octaveRange: { min: 3, max: 6 },
      enabled: true,
    };

    if (this.check('punctuation') && this.peek().value === '(') {
      this.advance(); // consume '('

      while (!this.check('punctuation') || this.peek().value !== ')') {
        const param = this.consume('identifier', 'Expected parameter name').value;
        this.consume('operator', 'Expected =');
        const value = this.parseExpression();

        if (param === 'scale') config.scale = String(value);
        else if (param === 'root') config.root = String(value);
        else if (param === 'minOctave') config.octaveRange.min = Number(value);
        else if (param === 'maxOctave') config.octaveRange.max = Number(value);

        if (this.check('punctuation') && this.peek().value === ',') {
          this.advance();
        }
      }

      this.consume('punctuation', "Expected ')'");
    }

    return config;
  }

  private parseCurveParam(): MappingCurveType {
    if (this.check('punctuation') && this.peek().value === '(') {
      this.advance();
      const curve = this.consume('string', 'Expected curve type').value as MappingCurveType;
      this.consume('punctuation', "Expected ')'");
      return curve;
    }
    return 'linear';
  }

  private parseNumberParam(): number {
    if (this.check('punctuation') && this.peek().value === '(') {
      this.advance();
      const num = parseFloat(this.consume('number', 'Expected number').value);
      this.consume('punctuation', "Expected ')'");
      return num;
    }
    return 0;
  }

  private parseRangeParam(): { min: number; max: number } {
    this.consume('punctuation', "Expected '('");
    const min = parseFloat(this.consume('number', 'Expected min value').value);
    this.consume('punctuation', "Expected ','");
    const max = parseFloat(this.consume('number', 'Expected max value').value);
    this.consume('punctuation', "Expected ')'");
    return { min, max };
  }

  private parseWhenBlock(): void {
    // when condition for duration:
    const condition = this.parseCondition();
    this.consume('punctuation', "Expected ':'");
    this.expectNewline();

    // Parse indented block
    this.consume('indent', 'Expected indented block');
    const actions = this.parseActionBlock();
    this.consume('dedent', 'Expected dedent');

    // Create a conditional mapping or state machine trigger
    // For now, add as a continuous mapping with the condition
    for (const action of actions) {
      if (action.mapping) {
        action.mapping.conditions = [condition];
        this.mappings.push(action.mapping);
      }
    }
  }

  private parseIfBlock(): void {
    // Similar to when but without duration
    const condition = this.parseCondition();
    this.consume('punctuation', "Expected ':'");
    this.expectNewline();

    this.consume('indent', 'Expected indented block');
    const actions = this.parseActionBlock();
    this.consume('dedent', 'Expected dedent');

    for (const action of actions) {
      if (action.mapping) {
        action.mapping.conditions = [condition];
        this.mappings.push(action.mapping);
      }
    }
  }

  private parseCondition(): MappingCondition {
    const sourceParts = this.parsePropertyPath();
    const source = sourceParts.join('.');

    const opToken = this.consume('operator', 'Expected comparison operator');
    const operator = opToken.value as MappingCondition['operator'];

    const value = this.parseExpression();

    let durationMs: number | undefined;
    if (this.matchKeyword('for')) {
      const duration = parseFloat(this.consume('number', 'Expected duration').value);
      if (this.matchKeyword('ms')) {
        durationMs = duration;
      } else if (this.matchKeyword('s')) {
        durationMs = duration * 1000;
      } else {
        durationMs = duration; // Assume ms
      }
    }

    return {
      source,
      operator,
      value: typeof value === 'number' ? value : String(value),
      durationMs,
    };
  }

  private parseActionBlock(): Array<{ mapping?: ContinuousMappingDef; action?: string }> {
    const actions: Array<{ mapping?: ContinuousMappingDef; action?: string }> = [];

    while (!this.check('dedent') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('dedent')) break;

      if (this.check('identifier')) {
        const targetParts = this.parsePropertyPath();
        const target = targetParts.join('.');

        if (this.match('arrow') && this.previous().value === '<-') {
          const mapping = this.parseContinuousMapping(target);
          actions.push({ mapping });
        } else if (this.match('operator') && this.previous().value === '=') {
          const value = this.parseExpression();
          actions.push({ action: `${target} = ${value}` });
        }
      }

      this.skipNewlines();
    }

    return actions;
  }

  private parseStateBlock(): void {
    const stateName = this.consume('identifier', 'Expected state name').value;
    this.consume('punctuation', "Expected ':'");
    this.expectNewline();

    // Parse state body
    this.consume('indent', 'Expected indented block');

    // TODO: Parse state definition including transitions, onEnter, onExit
    // For now, skip the block
    while (!this.check('dedent') && !this.isAtEnd()) {
      this.advance();
    }

    if (this.check('dedent')) {
      this.advance();
    }

    this.warnings.push({
      line: this.previous().line,
      message: `State '${stateName}' parsed - full state machine support coming soon`,
    });
  }

  private parseRouteBlock(): void {
    const routeName = this.consume('identifier', 'Expected route name').value;
    this.consume('punctuation', "Expected ':'");
    this.expectNewline();

    this.consume('indent', 'Expected indented block');

    while (!this.check('dedent') && !this.isAtEnd()) {
      this.advance();
    }

    if (this.check('dedent')) {
      this.advance();
    }

    this.warnings.push({
      line: this.previous().line,
      message: `Route '${routeName}' parsed - full gaze routing support coming soon`,
    });
  }

  private parseFieldBlock(): void {
    const fieldName = this.consume('identifier', 'Expected field name').value;
    this.consume('punctuation', "Expected ':'");
    this.expectNewline();

    this.consume('indent', 'Expected indented block');

    while (!this.check('dedent') && !this.isAtEnd()) {
      this.advance();
    }

    if (this.check('dedent')) {
      this.advance();
    }

    this.warnings.push({
      line: this.previous().line,
      message: `Field '${fieldName}' parsed - full musical field support coming soon`,
    });
  }

  private parsePropertyPath(): string[] {
    const parts: string[] = [];
    parts.push(this.consume('identifier', 'Expected property name').value);

    while (this.check('punctuation') && this.peek().value === '.') {
      const nextToken = this.tokens[this.current + 1];
      if (nextToken && nextToken.type === 'identifier') {
        this.advance(); // consume '.'
        parts.push(this.advance().value);
      } else {
        break;
      }
    }

    return parts;
  }

  private parseExpression(): number | string | boolean {
    const token = this.peek();

    if (token.type === 'number') {
      this.advance();
      return parseFloat(token.value);
    }

    if (token.type === 'string') {
      this.advance();
      return token.value;
    }

    if (token.type === 'keyword') {
      if (token.value === 'true') {
        this.advance();
        return true;
      }
      if (token.value === 'false') {
        this.advance();
        return false;
      }
    }

    if (token.type === 'identifier') {
      const parts = this.parsePropertyPath();
      return parts.join('.');
    }

    throw new Error(`Unexpected expression token: ${token.value}`);
  }

  // Token helpers
  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'eof';
  }

  private check(type: Token['type']): boolean {
    return !this.isAtEnd() && this.peek().type === type;
  }

  private match(...types: Token['type'][]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private matchKeyword(keyword: string): boolean {
    if (this.check('keyword') && this.peek().value.toLowerCase() === keyword.toLowerCase()) {
      this.advance();
      return true;
    }
    return false;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  private consume(type: Token['type'], message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw new Error(`${message}, got ${this.peek().type}: ${this.peek().value}`);
  }

  private expectNewline(): void {
    if (!this.isAtEnd() && !this.check('newline')) {
      this.warnings.push({
        line: this.peek().line,
        message: 'Expected newline at end of statement',
      });
    }
    this.skipNewlines();
  }

  private skipNewlines(): void {
    while (this.check('newline')) {
      this.advance();
    }
  }

  private getLineSource(lineNum: number): string {
    const token = this.tokens.find((t) => t.line === lineNum);
    return token?.value ?? '';
  }
}

// ============================================
// Public API
// ============================================

/**
 * Parse DSL source code into mapping definitions
 */
export function parseMappingDSL(source: string): DSLParseResult {
  const parser = new Parser();
  return parser.parse(source);
}

/**
 * Validate DSL source without full parsing
 */
export function validateMappingDSL(source: string): {
  valid: boolean;
  errors: string[];
} {
  const result = parseMappingDSL(source);
  return {
    valid: result.success,
    errors: result.errors.map((e) => `Line ${e.line}: ${e.message}`),
  };
}

/**
 * Format mapping definitions as DSL
 */
export function formatAsDSL(mappings: MappingDef[]): string {
  const lines: string[] = [];

  for (const mapping of mappings) {
    if (mapping.type === 'continuous') {
      const m = mapping as ContinuousMappingDef;
      let line = `${m.target} <- ${m.source}`;

      if (m.quantization?.enabled) {
        line += `.quantized(scale="${m.quantization.scale}", root="${m.quantization.root}")`;
      }
      if (m.curve !== 'linear') {
        line += `.curve("${m.curve}")`;
      }
      if (m.inverted) {
        line += '.invert()';
      }
      if (m.smoothing > 0) {
        line += `.smooth(${m.smoothing})`;
      }
      if (m.deadZone > 0) {
        line += `.deadzone(${m.deadZone})`;
      }

      if (m.conditions && m.conditions.length > 0) {
        const cond = m.conditions[0];
        let condStr = `${cond.source} ${cond.operator} ${cond.value}`;
        if (cond.durationMs) {
          condStr += ` for ${cond.durationMs}ms`;
        }
        lines.push(`when ${condStr}:`);
        lines.push(`    ${line}`);
      } else {
        lines.push(line);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Example DSL presets for reference
 */
export const DSL_EXAMPLES = {
  timbreSphere: `
# Timbre Sphere - body lean controls timbral qualities
timbre.harmonicity <- bodyConfig.torsoLean.pitch.curve("sigmoid").range(0.1, 2.0)
timbre.spectralCentroid <- bodyConfig.torsoLean.roll.curve("exponential").range(200, 8000)
timbre.fmDepth <- bodyConfig.torsoLean.yaw.curve("linear").range(0, 100)
`,

  melodyRibbon: `
# Melody Ribbon - right hand controls melody
melody.pitch <- joints.rightHand_indexTip.position.y.quantized(scale="minor", root="A")
ornament.intensity <- joints.rightHand_wrist.curvature.smooth(0.5)
ornament.speed <- joints.rightHand_wrist.velocity.magnitude.range(0, 10)
`,

  harmonyAxis: `
# Harmony Axis - torso twist controls harmonic content
when bodyConfig.spinalTwist > 0.3 for 200ms:
    harmony.mode <- "Lydian"

when bodyConfig.spinalTwist < -0.3 for 200ms:
    harmony.mode <- "Phrygian"

chord.quality <- bodyConfig.torsoLean.roll.quantized(scale="chromatic")
`,

  emotionModulator: `
# Emotion Modulator - facial expressions modulate sound
timbre.warmth <- face.smileIntensity.curve("easeOut")
timbre.dissonance <- face.browFurrow.curve("exponential")
amplitude.level <- face.mouthOpenness.range(0.1, 1.0)
expression.vibrato <- face.browRaise.smooth(0.7).range(0, 6)
`,

  gazeRouting: `
# Gaze Routing - look at a body part to control it
route rightHandMelody:
    gaze.target == "rightHand" for 500ms
    melody.pitch <- joints.rightHand_indexTip.position.y

route leftHandBass:
    gaze.target == "leftHand" for 500ms
    bass.pitch <- joints.leftHand_indexTip.position.y
`,
};
