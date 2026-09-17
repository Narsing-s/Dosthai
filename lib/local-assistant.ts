export const LOCAL_MODEL_ID = 'dosthai-local';
export const LOCAL_MODEL_NAME = 'Dosthai Local';

function calculate(expression: string): string | null {
  const cleaned = expression.replace(/[^0-9+\-*/().%\s]/g, '').trim();
  if (!cleaned || cleaned.length > 120 || !/[+\-*/%]/.test(cleaned)) return null;
  const tokens = cleaned.match(/(?:\d+(?:\.\d+)?|[()+\-*/%])/g);
  if (!tokens || tokens.join('') !== cleaned.replace(/\s+/g, '')) return null;
  const values: number[] = [];
  const ops: string[] = [];
  const precedence = (op: string) => (op === '+' || op === '-') ? 1 : 2;
  const apply = () => {
    const op = ops.pop();
    const b = values.pop();
    const a = values.pop();
    if (!op || a === undefined || b === undefined) throw new Error('invalid');
    if (op === '+') values.push(a + b);
    else if (op === '-') values.push(a - b);
    else if (op === '*') values.push(a * b);
    else if (op === '/') { if (b === 0) throw new Error('division'); values.push(a / b); }
    else if (op === '%') values.push(a % b);
  };
  try {
    for (const token of tokens) {
      if (/^\d/.test(token)) values.push(Number(token));
      else if (token === '(') ops.push(token);
      else if (token === ')') {
        while (ops.length && ops.at(-1) !== '(') apply();
        if (ops.pop() !== '(') return null;
      } else {
        while (ops.length && ops.at(-1) !== '(' && precedence(ops.at(-1)!) >= precedence(token)) apply();
        ops.push(token);
      }
    }
    while (ops.length) { if (ops.at(-1) === '(') return null; apply(); }
    if (values.length !== 1 || !Number.isFinite(values[0])) return null;
    return String(Number(values[0].toFixed(12)));
  } catch { return null; }
}

export function localAssistantResponse(message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
  const input = message.trim();
  const lower = input.toLowerCase();
  const expression = lower.replace(/^\s*(calculate|calc|what is|what's)\s+/i, '').trim();
  const result = calculate(expression);
  if (result !== null) return `The result is **${result}**.`;

  if (/^(hi|hello|hey|namaste|good morning|good afternoon|good evening)[!. ]*$/i.test(input)) {
    return 'Hi! I’m Dosthai. I’m ready to help with questions, writing, coding, planning, calculations, and your projects.\n\n**Local mode is active**, so this conversation does not require an API key.';
  }
  if (/who are you|what are you|what is dosthai/i.test(lower)) {
    return '**Dosthai** is your AI workspace. It provides the ChatGPT-style conversation experience, local history, projects, files, tools, streaming UI, and an adapter architecture for adding a model provider later.\n\nRight now it is running in **Dosthai Local** mode, which requires no OpenAI credentials.';
  }
  if (/^(help|what can you do|features?)[?!. ]*$/i.test(input)) {
    return '**Dosthai can already provide:**\n- Chat-style conversations and local history\n- Search, rename, pin, archive, import and export conversations\n- Project context and file context\n- Calculator and structured-data tools\n- Agent-mode architecture\n- Image and voice interfaces when their providers are available\n- Installable/offline app shell\n\nFor full open-ended AI generation, a model inference service still has to be connected; the product does not pretend that a local rules engine is a large language model.';
  }
  if (/what time|current time|date today|today's date/i.test(lower)) {
    return `The server date and time is **${new Date().toLocaleString()}**.`;
  }
  if (/^(thanks|thank you|thx)[!. ]*$/i.test(input)) return 'You’re welcome!';

  const prior = history.filter(item => item.role === 'user').at(-1)?.content;
  if (prior && prior !== input) {
    return `I’m running without a connected model right now, so I won’t pretend to generate an LLM-quality answer.\n\nYour latest request is:\n> ${input.slice(0, 1200)}\n\nConnect a model provider later when you want full generative AI. Your Dosthai conversations and product features can continue working without that configuration.`;
  }
  return `I received your request:\n\n> ${input.slice(0, 2000)}\n\nDosthai is currently in **Local mode**. This mode is intentionally transparent: it does not fabricate an AI answer or secretly call a provider. Connect a model inference service when you want full ChatGPT-class generation.`;
}
