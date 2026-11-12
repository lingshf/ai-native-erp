import zh from './labels/zh.js';
import en from './labels/en.js';

const dictionaries = Object.freeze({ zh, en });
const fields = value => [...value.matchAll(/\{([A-Za-z]\w*)\}/g)].map(m => m[1]).sort();
export function createLabels(language = 'zh') {
  const keys = Object.keys(zh).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(en).sort())) throw Error('Label resource keys do not match');
  for (const key of keys) {
    if (JSON.stringify(fields(zh[key])) !== JSON.stringify(fields(en[key]))) throw Error(`Label parameters do not match: ${key}`);
  }
  const values = new WeakMap(), bindings = new WeakMap(), documents = new Set();
  function binding(node) {
    let value = bindings.get(node);
    if (!value) {
      value = { text: undefined, attributes: new Map() }; bindings.set(node, value);
      documents.add(node.ownerDocument); node.dataset.labelBound = '';
    }
    return value;
  }
  const isLabel = value => typeof value === 'object' && value !== null && values.has(value);
  const raw = value => {
    if (isLabel(value)) return values.get(value)();
    if (value === undefined || value === null) throw Error('Undefined label parameter');
    return String(value);
  };
  const object = fn => {
    const value = Object.freeze({ [Symbol.toPrimitive]() { throw Error('Implicit label coercion is not allowed'); } });
    values.set(value, fn); return value;
  };
  const textParts = value => {
    if (!isLabel(value)) return [{ text: raw(value), data: true }];
    return raw(value);
  };
  const resolve = value => isLabel(value) ? values.get(value)().map(p => p.text).join('') : raw(value);
  function t(key, params = {}) {
    if (!Object.hasOwn(zh, key)) throw Error(`Unknown label key: ${key}`);
    const expected = [...new Set(fields(zh[key]))];
    if (JSON.stringify(expected.sort()) !== JSON.stringify(Object.keys(params).sort())) throw Error(`Invalid label parameters: ${key}`);
    Object.values(params).forEach(v => { if (v === undefined || v === null) throw Error(`Undefined label parameter: ${key}`); });
    return object(() => {
      const parts = [], template = dictionaries[language][key];
      let end = 0;
      for (const m of template.matchAll(/\{([A-Za-z]\w*)\}/g)) {
        parts.push({ text: template.slice(end, m.index), data: false }, ...textParts(params[m[1]]));
        end = m.index + m[0].length;
      }
      parts.push({ text: template.slice(end), data: false }); return parts;
    });
  }
  function join(list, separator = ' / ') {
    return object(() => list.flatMap((v, i) => [...(i ? [{ text: separator, data: false }] : []), ...textParts(v)]));
  }
  function paint(node, value) {
    node.replaceChildren();
    for (const part of textParts(value)) {
      if (part.data) {
        const span = node.ownerDocument.createElement('span'); span.dataset.uiData = '';
        span.textContent = part.text; node.append(span);
      } else node.append(node.ownerDocument.createTextNode(part.text));
    }
  }
  function append(node, value) {
    if (value === undefined || value === null) return;
    const span = node.ownerDocument.createElement('span');
    if (isLabel(value)) {
      paint(span, value); binding(span).text = value;
    } else { span.dataset.uiData = ''; span.textContent = raw(value); }
    node.append(span);
  }
  function setText(node, value) {
    if (node.tagName === 'TITLE') {
      node.textContent = resolve(value);
      if (isLabel(value)) binding(node).text = value;
    } else { node.replaceChildren(); append(node, value); }
  }
  function attribute(node, name, value) {
    node.setAttribute(name, resolve(value));
    if (isLabel(value)) binding(node).attributes.set(name, value);
  }
  function setLanguage(next) {
    if (!Object.hasOwn(dictionaries, next)) throw Error('Unsupported language');
    language = next;
    for (const doc of documents) for (const node of doc.querySelectorAll('[data-label-bound]')) {
      const current = bindings.get(node);
      if (!current) continue;
      if (current.text) {
        if (node.tagName === 'TITLE') node.textContent = resolve(current.text);
        else paint(node, current.text);
      }
      for (const [name, value] of current.attributes) node.setAttribute(name, resolve(value));
    }
  }
  function apply(root) {
    for (const node of root.querySelectorAll('[data-label]')) setText(node, t(node.dataset.label));
    for (const node of root.querySelectorAll('[data-label-placeholder]')) attribute(node, 'placeholder', t(node.dataset.labelPlaceholder));
    for (const node of root.querySelectorAll('[data-label-aria]')) attribute(node, 'aria-label', t(node.dataset.labelAria));
    for (const node of root.querySelectorAll('[data-label-content]')) attribute(node, 'content', t(node.dataset.labelContent));
  }
  setLanguage(language);
  return { t, resolve, append, setText, attribute, join, setLanguage, apply, get language() { return language; } };
}
export { dictionaries };
