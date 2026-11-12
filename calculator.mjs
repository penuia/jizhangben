// Calculate a positive money amount without evaluating arbitrary JavaScript.
export function calculateAmountCents(input) {
  const source = String(input ?? '')
    .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/．/g, '.').replace(/[＋﹢]/g, '+').replace(/[－−﹣]/g, '-')
    .replace(/[×xX＊]/g, '*').replace(/[÷／]/g, '/')
    .replace(/，/g, '').replace(/\s+/g, '');
  if (!source || source.length > 120 || !/^[\d.+\-*/()]+$/.test(source)) return null;

  const tokens = source.match(/(?:\d{1,8}(?:\.\d{1,2})?|[()+\-*/])/g);
  if (!tokens || tokens.join('') !== source || tokens.length > 80) return null;
  let index = 0;
  function primary() {
    const token = tokens[index++];
    if (token === '+') return primary();
    if (token === '-') return -primary();
    if (token === '(') {
      const value = expression();
      if (tokens[index++] !== ')') throw new Error('missing bracket');
      return value;
    }
    if (!token || !/^\d/.test(token)) throw new Error('invalid number');
    return Number(token);
  }
  function term() {
    let value = primary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const next = primary();
      if (operator === '/' && next === 0) throw new Error('division by zero');
      value = operator === '*' ? value * next : value / next;
    }
    return value;
  }
  function expression() {
    let value = term();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const next = term();
      value = operator === '+' ? value + next : value - next;
    }
    return value;
  }
  try {
    const result = expression();
    if (index !== tokens.length || !Number.isFinite(result) || result <= 0 || result > 99999999.99) return null;
    const cents = Math.round(result * 100 + 1e-8);
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  } catch { return null; }
}
