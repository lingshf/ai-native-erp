import { formatMinor } from './money.js';
import { createLabels } from './labels.js';

const labels = createLabels();
const { t, resolve: resolveLabel, setText, append: appendText, attribute: setAttributeLabel, join: joinLabels } = labels;
labels.apply(document);
const confirmLabel = message => confirm(resolveLabel(message));
function clientError(message) { const error = new Error(); error.label = message; return error; }
function diagnosticLabel(error) {
  return joinLabels([t(error.serverDiagnostic ? 'error.service' : 'error.unexpected'), error.label || error.message], ' ');
}
function showError(error) {
  notify(diagnosticLabel(error), true);
}

const $ = (selector) => document.querySelector(selector);
const workspace = $('#workspace'), notice = $('#notice');
const views = [
  ['overview', '01', t('ui001'), t('ui002'), t('ui003')],
  ['journals', '02', t('ui004'), t('ui005'), t('ui006')],
  ['ledger', '03', t('ui007'), t('ui008'), t('ui009')],
  ['reports', '04', t('ui010'), t('ui011'), t('ui012')],
  ['close', '05', t('ui013'), t('ui014'), t('ui015')],
  ['accounts', '06', t('ui016'), t('ui017'), t('ui018')],
  ['dimensions', '07', t('ui019'), t('ui020'), t('ui021')],
  ['events', '08', t('ui022'), t('ui023'), t('ui024')],
  ['ai', 'AI', t('ui025'), t('ui026'), t('ui027')],
  ['settings', '', t('ui028'), t('ui028'), t('ui029')],
];
let state, month = '', view = 'overview', editingId, accountEditing, ruleEditing, eventDraft, structureEditing, ledgerTarget;
let refreshRevision = 0;
const preferenceKey = 'ai-native-erp.teaching-mode', themeKey = 'ai-native-erp.theme', languageKey = 'ai-native-erp.language';
const preferenceFailures = [];
function readPreference(key, allowed, fallback, failureKey) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    if (allowed.includes(value)) return value;
  } catch { /* Report every unavailable preference together after reading all three. */ }
  preferenceFailures.push(t(failureKey)); return fallback;
}
let teaching = readPreference(preferenceKey, ['on', 'off'], 'off', 'preferences.defaultTeaching') === 'on', aiQuestion = '';
let theme = readPreference(themeKey, ['red', 'green'], 'red', 'preferences.defaultTheme');
const language = readPreference(languageKey, ['zh', 'en'], 'zh', 'preferences.defaultLanguage');
labels.setLanguage(language);
document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
document.documentElement.dataset.theme = theme;
$('#ui-theme').value = theme; $('#ui-language').value = language;
const navGroups = [
  [t('ui031'), ['journals', 'events']], [t('ui032'), ['ledger', 'reports', 'close']],
  [t('ui033'), ['accounts', 'dimensions', 'settings']], [t('nav.ai'), ['ai']],
];
const names = { overview: t('ui034'), events: t('ui035'), ai: t('ui036') };
const kinds = { normal: t('ui037'), adjusting: t('ui038'), reversal: t('ui039'), closing: t('ui040') };
const categories = { ASSET: t('ui041'), LIABILITY: t('ui042'), EQUITY: t('ui043'), REVENUE: t('ui044'), EXPENSE: t('ui045') };
const normalSides = { DEBIT: t('ui046'), CREDIT: t('ui047') };
const purposes = { general: t('ui048'), contra: t('ui049') };
const fmt = formatMinor;
const decimal = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) setText(node, text);
  if (className) node.className = className;
  return node;
}
function button(text, fn, className, disabled = false) {
  const b = el('button', text, className);
  b.type = 'button'; b.disabled = disabled;
  b.addEventListener('click', () => run(b, fn));
  return b;
}
async function run(control, fn) {
  control.disabled = true;
  try { await fn(); } catch (error) { showError(error); }
  finally { if (control.isConnected) control.disabled = false; }
}
function notify(message, error = false) {
  setText(notice, message); notice.hidden = false; notice.className = error ? 'error' : '';
  if (error) notice.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function api(path, method = 'GET', data) {
  const response = await fetch(path, { method, ...(method !== 'GET' ? {
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}),
  } : {}) });
  const value = await response.json();
  if (!response.ok) {
    if (!value.error) throw clientError(t('ui050', {p0: response.status}));
    const error = new Error(value.error); error.serverDiagnostic = true; throw error;
  }
  return value;
}
function panel(title, subtitle) {
  const node = el('section', undefined, 'panel');
  node.append(el('h2', title));
  if (subtitle) {
    const help = el('details', undefined, 'teaching-content help');
    help.append(el('summary', t('ui051')), el('p', subtitle, 'subtext')); node.append(help);
  }
  return node;
}
function table(headers, rows, { numeric = [], footer } = {}) {
  const wrap = el('div', undefined, 'scroll'), t = el('table'), head = el('thead'), tr = el('tr');
  headers.forEach((value, i) => tr.append(el('th', value, numeric.includes(i) ? 'number' : '')));
  head.append(tr); t.append(head);
  const body = el('tbody');
  for (const row of rows) {
    const r = el('tr');
    row.forEach((value, i) => {
      const cell = el('td', undefined, numeric.includes(i) ? 'number' : '');
      if (value instanceof Node) cell.append(value); else setText(cell, value);
      r.append(cell);
    });
    body.append(r);
  }
  t.append(body);
  if (footer) {
    const foot = el('tfoot'), r = el('tr');
    footer.forEach((v, i) => r.append(el('td', v, numeric.includes(i) ? 'number' : '')));
    foot.append(r); t.append(foot);
  }
  wrap.append(t); return wrap;
}
function label(text, control) {
  const node = el('label', text); node.append(control); return node;
}
function input(type, value = '') {
  const node = el('input'); node.type = type; node.value = resolveLabel(value); return node;
}
function select(options, value) {
  const node = el('select');
  for (const [v, text] of options) { const opt = el('option', text); opt.value = v; node.append(opt); }
  node.value = value; return node;
}
function go(next, target) { ledgerTarget = next === 'ledger' ? target : undefined; view = next; notice.hidden = true; render(); }
async function refresh(nextMonth = month) {
  const revision = ++refreshRevision;
  const previous = $('#reconciliation-result');
  if (previous) previous.replaceChildren(el('p', t('reconciliation.loading', { month: nextMonth }), 'reconciliation-loading'));
  let nextState;
  try {
    nextState = await api('/api/state' + (nextMonth ? `?month=${encodeURIComponent(nextMonth)}` : ''));
  } catch (error) {
    if (revision !== refreshRevision) return;
    if (previous?.isConnected) previous.replaceChildren(el('p', diagnosticLabel(error), 'warning reconciliation-error'));
    throw error;
  }
  if (revision !== refreshRevision) return;
  state = nextState;
  month = state.reports.month;
  const p = $('#period'); p.replaceChildren();
  for (const period of state.periods) { const opt = el('option', period.month); opt.value = period.month; p.append(opt); }
  p.value = month;
  const status = state.periods.find((p) => p.month === month).status;
  setText($('#period-status'), status === 'open' ? t('ui052') : t('ui053'));
  $('#period-status').className = 'badge' + (status === 'closed' ? ' closed' : '');
  render();
}
function isOpen() { return state.periods.find((p) => p.month === month).status === 'open'; }
function lastDate(period) {
  const day = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate();
  return `${period}-${day}`;
}
function accountName(code) { return state.accounts.find((a) => a.code === code)?.name || code; }
function dimensionText(line) {
  return Object.entries(line.dimensions || {}).map(([code, value]) => `${code}=${value}`).join(' · ') || t('ui054');
}
function linesTable(lines) {
  const attributed = lines.some((l) => Object.keys(l.dimensions || {}).length);
  return table([t('ui055'), t('ui056'), t('ui057'), ...(attributed ? [t('ui058')] : [])],
    lines.map((l) => [`${l.account} ${accountName(l.account)}`, fmt(l.debit), fmt(l.credit),
      ...(attributed ? [dimensionText(l)] : [])]), { numeric: [1, 2] });
}
function metrics() {
  const r = state.reports, node = el('div', undefined, 'metrics');
  for (const [name, value, hint] of [
    [t('ui059'), r.assets, t('ui060')], [t('ui061'), r.liabilities, t('ui062')],
    [t('ui063'), r.equity, t('ui064')], [t('ui065'), r.profit, t('ui066')],
  ]) {
    const card = el('div', undefined, 'metric');
    card.append(el('div', name, 'metric-label'), el('div', fmt(value), 'metric-value'), el('small', hint, 'teaching-content')); node.append(card);
  }
  return node;
}
function chrome() {
  document.body.classList.toggle('teaching-on', teaching);
  $('#teaching-mode').checked = teaching;
  const nav = $('#navigation'); nav.replaceChildren();
  const navButton = (id) => {
    const original = views.find(v => v[0] === id)[2];
    const name = names[id] || original;
    const b = button('', () => go(id), view === id ? 'active' : '');
    setAttributeLabel(b, 'aria-current', view === id ? 'page' : 'false');
    b.dataset.view = id; b.append(el('span', name)); nav.append(b);
  };
  navButton('overview');
  for (const [name, ids] of navGroups) {
    nav.append(el('p', name, 'nav-group-label')); ids.forEach(navButton);
  }
  const [, , name, title, description] = views.find((v) => v[0] === view);
  setText($('#page-name'), names[view] || name);
  setText($('#page-title'), teaching ? title : names[view] || name);
  setText($('#page-description'), t(`page.${view}.description`));
}
function render() {
  chrome();
  workspace.replaceChildren();
  ({ overview, journals, ledger, reports, closeView, aiView, accountsView, dimensionsView, eventsView, settingsView }[
    { close: 'closeView', ai: 'aiView', accounts: 'accountsView', dimensions: 'dimensionsView', events: 'eventsView', settings: 'settingsView' }[view] || view
  ])();
}
function accountsView() {
  const list = panel(t('ui071'), t('ui072'));
  list.append(button(t('ui073'), () => { accountEditing = undefined; render(); }),
    button(t('ui074'), async () => {
      if (confirmLabel(t('ui075'))) { accountEditing = undefined; await refresh(); }
    }));
  list.append(table([t('ui076'), t('ui077'), t('ui078'), t('ui079'), t('ui080'), t('ui081'), t('ui082'), t('ui083')],
    state.accounts.map((a) => [a.code, a.name, categories[a.category],
      t('ui084', {p0: normalSides[a.normalSide], p1: purposes[a.purpose], p2: a.relatedAccount ? ` → ${a.relatedAccount}` : ''}), a.builtin ? t('ui085') : t('ui086'),
      a.active ? t('ui087') : t('ui088'), a.manualAllowed ? t('ui089') : t('ui090'),
      a.builtin ? t('ui091') : button(t('ui092'), () => { accountEditing = a.code; render(); })])));
  const current = state.accounts.find((a) => a.code === accountEditing);
  const editor = panel(current ? t('ui093', {p0: current.code}) : t('ui094'),
    t('ui095'));
  editor.append(el('p', t('ui096'), 'essential'));
  const form = el('form'), grid = el('div', undefined, 'form-grid');
  const code = input('text', current?.code || ''); code.id = 'account-code'; code.required = true;
  code.pattern = '[1-9][0-9]{3}'; code.maxLength = 4; code.disabled = Boolean(current);
  const name = input('text', current?.name || ''); name.id = 'account-name'; name.required = true; name.maxLength = 80;
  const category = select(Object.entries(categories), current?.category || 'EXPENSE');
  category.id = 'account-category'; category.disabled = Boolean(current);
  grid.append(label(t('ui097'), code), label(t('ui098'), name), label(t('ui099'), category));
  const active = select([['true', t('ui087')], ['false', t('ui088')]], String(current?.active ?? true));
  const manual = select([['true', t('ui100')], ['false', t('ui101')]], String(current?.manualAllowed ?? true));
  active.id = 'account-active'; manual.id = 'account-manual';
  if (current) grid.append(label(t('ui102'), active), label(t('ui103'), manual));
  const save = el('button', current ? t('ui104') : t('ui105'), 'primary'); save.type = 'submit';
  form.append(grid, save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(save, async () => {
      if (current && !confirmLabel(t('ui106'))) return;
      const saved = await api('/api/accounts' + (current ? `/${current.code}` : ''), current ? 'PUT' : 'POST',
        current ? { name: name.value, active: active.value === 'true', manualAllowed: manual.value === 'true', revision: current.revision }
          : { code: code.value, name: name.value, category: category.value });
      accountEditing = saved.code; await refresh(); notify(t('ui107', {p0: saved.code}));
    });
  });
  editor.append(form, el('p', t('ui108'), 'subtext'));
  workspace.append(list, editor);
  if (current) {
    const p = panel(t('ui109', {p0: current.code, p1: current.propertyRevision}),
      t('ui110'));
    const propertyForm = el('form'), fields = el('div', undefined, 'form-grid');
    const side = select(Object.entries(normalSides), current.normalSide); side.id = 'property-normal';
    const purpose = select(Object.entries(purposes), current.purpose); purpose.id = 'property-purpose';
    const related = select([['', t('ui111')], ...state.accounts.filter((a) => a.code !== current.code
      && a.category === current.category && a.purpose === 'general').map((a) => [a.code, `${a.code} ${a.name}`])],
    current.relatedAccount || '');
    related.id = 'property-related'; related.disabled = purpose.value !== 'contra';
    purpose.addEventListener('change', () => { related.disabled = purpose.value !== 'contra'; });
    fields.append(label(t('ui112'), side), label(t('ui113'), purpose), label(t('ui114'), related));
    const submit = el('button', t('ui115'), 'primary'); submit.type = 'submit';
    propertyForm.append(fields, submit);
    propertyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      run(submit, async () => {
        if (!confirmLabel(t('ui116'))) return;
        await api(`/api/accounts/${current.code}/properties`, 'PUT', { normalSide: side.value, purpose: purpose.value,
          relatedAccount: purpose.value === 'contra' ? related.value : null, revision: current.propertyRevision });
        await refresh(); notify(t('ui117'));
      });
    });
    p.append(propertyForm, el('p', t('ui118'), 'subtext'));
    workspace.append(p);
  }
}
function dimensionsView() {
  const p = panel(t('ui119'), t('ui120'));
  p.append(el('p', t('ui121'), 'essential'));
  p.append(button(t('ui122'), async () => {
    if (confirmLabel(t('ui123'))) await refresh();
  }));
  const toggle = (d, value) => button(t('ui124', {p0: (value || d).active ? t('ui088') : t('ui087'), p1: d.code, p2: value ? '=' + value.code : ''}), async () => {
    if (!confirmLabel(t('ui125'))) return;
    await api(`/api/dimensions/${d.code}${value ? '/values/' + value.code : ''}`, 'PUT',
      { active: !(value || d).active, revision: (value || d).revision });
    await refresh(); notify(t('ui126'));
  });
  for (const d of state.dimensions) {
    const section = panel(`${d.code} · ${d.name}`);
    section.append(el('p', t('ui127', {p0: d.active ? t('ui087') : t('ui088'), p1: d.revision}), 'dimension-status badge'));
    section.append(toggle(d), table([t('ui128'), t('ui077'), t('ui081'), t('ui083')],
      d.values.map((v) => [v.code, v.name, v.active ? t('ui087') : t('ui088'), toggle(d, v)])));
    p.append(section);
  }
  for (const isValue of [false, true]) {
    const form = el('form'), grid = el('div', undefined, 'form-grid');
    const parent = select(state.dimensions.map((d) => [d.code, `${d.code} ${d.name}`]), state.dimensions[0]?.code || '');
    const code = input('text'), name = input('text');
    code.id = isValue ? 'dimension-value-code' : 'dimension-code';
    name.id = isValue ? 'dimension-value-name' : 'dimension-name';
    parent.id = 'dimension-parent'; code.required = name.required = true;
    code.maxLength = 20; name.maxLength = 80;
    code.pattern = isValue ? '[A-Z0-9][A-Z0-9_\\-]{0,19}' : '[A-Z][A-Z0-9_]{0,19}';
    if (isValue) grid.append(label(t('ui129'), parent));
    grid.append(label(isValue ? t('ui128') : t('ui130'), code), label(t('ui077'), name));
    const save = el('button', isValue ? t('ui131') : t('ui132'), 'primary'); save.type = 'submit';
    save.disabled = isValue && !state.dimensions.length;
    form.append(grid, save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      run(save, async () => {
        await api('/api/dimensions' + (isValue ? `/${parent.value}/values` : ''), 'POST',
          { code: code.value, name: name.value });
        await refresh(); notify(t('ui133'));
      });
    });
    p.append(form);
  }
  workspace.append(p);
  dimensionStructureView();
}
function dimensionStructureView() {
  const p = panel(t('ui134'), t('ui135'));
  p.append(structureSnapshot(state.dimensionStructures));
  const accountCode = structureEditing || state.accounts[0].code;
  const current = state.dimensionStructures.find((s) => s.account === accountCode);
  const form = el('form'), grid = el('div', undefined, 'form-grid');
  const account = select(state.accounts.map((a) => [a.code, `${a.code} ${a.name}`]), accountCode);
  const active = select([['false', t('ui136')], ['true', t('ui137')]], String(current?.active ?? false));
  account.id = 'structure-account'; active.id = 'structure-active';
  account.addEventListener('change', () => { structureEditing = account.value; render(); });
  grid.append(label(t('ui138'), account), label(t('ui139'), active), el('p', t('ui140', {p0: current?.revision || 0})));
  const segmentFields = state.dimensions.map((d) => {
    const old = current?.segments.find((s) => s.code === d.code);
    const field = select([['none', t('ui141')], ['optional', t('ui142')], ['required', t('ui143')]],
      old ? old.required ? 'required' : 'optional' : 'none');
    field.dataset.structureSegment = d.code;
    grid.append(label(t('ui124', {p0: d.code, p1: d.name, p2: d.active ? '' : t('ui144')}), field));
    return { code: d.code, field };
  });
  const allowed = el('textarea'); allowed.id = 'structure-allowed'; allowed.rows = 6; allowed.maxLength = 30000;
  allowed.value = JSON.stringify(current?.allowed || [], null, 2);
  const save = el('button', t('ui145'), 'primary'); save.type = 'submit'; save.disabled = !state.dimensions.length;
  form.append(grid, label(t('ui146'), allowed),
    el('p', t('ui147'), 'subtext'), save);
  form.addEventListener('submit', (event) => {
    event.preventDefault(); run(save, async () => {
      let tuples;
      try { tuples = JSON.parse(allowed.value); }
      catch (error) {
        if (error instanceof SyntaxError) throw clientError(t('ui148'));
        throw error;
      }
      if (!confirmLabel(t('ui149'))) return;
      await api(`/api/accounts/${accountCode}/dimension-structure`, 'PUT', {
        active: active.value === 'true', revision: current?.revision || 0,
        segments: segmentFields.filter(({ field }) => field.value !== 'none').map(({ code, field }) => ({ code, required: field.value === 'required' })),
        allowed: tuples,
      });
      structureEditing = accountCode; await refresh(); notify(t('ui150'));
    });
  });
  p.append(form, el('p', t('ui151'), 'warning'));
  workspace.append(p);
}
function structureSnapshot(structures = []) {
  return structures.length ? table([t('ui055'), t('ui087'), t('ui152'), t('ui153'), t('ui154')],
    structures.map((s) => [s.account, s.active ? t('ui155') : t('ui156'), s.revision,
      joinLabels(s.segments.map((x) => t('ui159', {p0: x.code, p1: x.required ? t('ui157') : t('ui158')})), ' / '), JSON.stringify(s.allowed)]))
    : el('p', t('ui160'), 'subtext');
}
function dimensionEditor(map = {}) {
  const node = el('div', undefined, 'line-dimensions');
  for (const d of state.dimensions) {
    const field = select([['', t('ui054')], ...d.values.map((v) =>
      [v.code, t('ui124', {p0: v.code, p1: v.name, p2: !d.active || !v.active ? t('ui144') : ''})])], map[d.code] || '');
    field.dataset.dimension = d.code;
    for (const option of field.options) {
      if (option.value && (!d.active || !d.values.find((v) => v.code === option.value).active)) option.disabled = true;
    }
    node.append(label(t('ui161', {p0: d.code, p1: d.name}), field));
  }
  return node;
}
function selectedDimensions(node) {
  return Object.fromEntries([...node.querySelectorAll('[data-dimension]')]
    .filter((f) => f.value).map((f) => [f.dataset.dimension, f.value]));
}
function settingsView() {
  const setup = panel(t('ui162'), t('ui163'));
  setup.append(el('p', t('ui164'), 'essential'));
  setup.append(button(t('ui165'), async () => { await refresh(); notify(t('ui166')); }));
  setup.append(table([t('ui167'), t('ui077'), t('ui168'), t('ui081'), t('ui169'), t('ui083')], state.services.map((s) => {
    const group = input('text', s.group), active = select([['true', t('ui087')], ['false', t('ui088')]], String(s.active));
    setAttributeLabel(group, 'aria-label', t('ui170', {p0: s.code}));
    setAttributeLabel(active, 'aria-label', t('ui171', {p0: s.code}));
    return [s.code, s.name, group, active, s.revision, button(t('ui172', {p0: s.code}), async () => {
      if (!confirmLabel(t('ui173'))) return;
      await api(`/api/services/${s.code}`, 'PUT', { group: group.value, active: active.value === 'true', revision: s.revision });
      await refresh(); notify(t('ui174'));
    })];
  })));
  if (!state.services.length) setup.append(el('p', t('ui175'), 'empty'));
  const serviceForm = el('form'), serviceGrid = el('div', undefined, 'form-grid');
  const code = input('text'), name = input('text'), group = input('text', 'GENERAL');
  code.id = 'service-code'; name.id = 'service-name'; group.id = 'service-group';
  code.required = name.required = group.required = true; code.maxLength = group.maxLength = 20; name.maxLength = 80;
  code.pattern = group.pattern = '[A-Z][A-Z0-9_]{0,19}';
  serviceGrid.append(label(t('ui176'), code), label(t('ui177'), name), label(t('ui178'), group));
  const createService = el('button', t('ui179')); createService.type = 'submit';
  serviceForm.append(serviceGrid, createService);
  serviceForm.addEventListener('submit', (event) => {
    event.preventDefault(); run(createService, async () => {
      await api('/api/services', 'POST', { code: code.value, name: name.value, group: group.value });
      await refresh(); notify(t('ui180'));
    });
  });
  setup.append(serviceForm, table([t('ui181'), t('ui182'), t('ui183'), t('ui184'), t('ui081'), t('ui169'), t('ui083')],
    state.postingRules.map((r) => [r.id, t(`scope.${r.scope}`), r.match, r.revenueAccount, r.active ? t('ui087') : t('ui088'),
      r.revision, button(t('ui185', {p0: r.id}), () => { ruleEditing = r.id; render(); })])));
  if (!state.postingRules.length) setup.append(el('p', t('ui186'), 'empty'));
  const current = state.postingRules.find((r) => r.id === ruleEditing);
  setup.append(button(t('ui187'), () => { ruleEditing = undefined; render(); }));
  const ruleForm = el('form'), ruleGrid = el('div', undefined, 'form-grid');
  const scope = select([['all', t('ui188')], ['group', t('ui168')], ['service', t('ui189')]], current?.scope || 'all');
  const match = input('text', current?.match || '*');
  const account = select(state.accounts.filter((a) => a.category === 'REVENUE')
    .map((a) => [a.code, t('ui124', {p0: a.code, p1: a.name, p2: !a.active || !a.manualAllowed ? t('ui190') : ''})]), current?.revenueAccount || '4000');
  const active = select([['true', t('ui087')], ['false', t('ui088')]], String(current?.active ?? true));
  scope.id = 'rule-scope'; match.id = 'rule-match'; account.id = 'rule-account'; active.id = 'rule-active';
  match.required = true; match.maxLength = 20;
  ruleGrid.append(label(t('ui191'), scope), label(t('ui192'), match), label(t('ui193'), account));
  if (current) ruleGrid.append(label(t('ui194'), active));
  const saveRule = el('button', current ? t('ui195', {p0: current.id}) : t('ui196')); saveRule.type = 'submit';
  ruleForm.append(ruleGrid, saveRule);
  ruleForm.addEventListener('submit', (event) => {
    event.preventDefault(); run(saveRule, async () => {
      if (current && !confirmLabel(t('ui197'))) return;
      const saved = await api('/api/posting-rules' + (current ? '/' + current.id : ''), current ? 'PUT' : 'POST',
        { scope: scope.value, match: match.value, revenueAccount: account.value,
          ...(current ? { active: active.value === 'true', revision: current.revision } : {}) });
      ruleEditing = saved.id; await refresh(); notify(t('ui198'));
    });
  });
  setup.append(ruleForm); workspace.append(setup);
}
function eventsView() {
  if (!state.services.some(s => s.active) || !state.postingRules.some(r => r.active)) {
    const empty = panel(t('ui199'));
    empty.append(el('p', t('ui200'), 'empty'),
      button(t('ui201'), () => go('settings'))); workspace.append(empty);
  }
  const p = panel(t('ui202'), t('ui203'));
  const draft = eventDraft || { reference: '', date: month + '-15', service: state.services[0]?.code || '', amount: '' };
  const form = el('form'), grid = el('div', undefined, 'form-grid');
  const reference = input('text', draft.reference), date = input('date', draft.date), amount = input('text', draft.amount);
  const service = select(state.services.map((s) => [s.code, t('ui124', {p0: s.code, p1: s.name, p2: s.active ? '' : t('ui144')})]), draft.service);
  reference.id = 'event-reference'; date.id = 'event-date'; amount.id = 'event-amount'; service.id = 'event-service';
  reference.required = date.required = amount.required = service.required = true;
  reference.maxLength = 40; reference.pattern = '[A-Z0-9][A-Z0-9_\\-]{0,39}';
  date.min = month + '-01'; date.max = lastDate(month); amount.inputMode = 'decimal';
  grid.append(label(t('ui204'), reference), label(t('ui205'), date), label(t('ui167'), service), label(t('ui206'), amount));
  grid.append(dimensionEditor(draft.dimensions));
  const value = () => {
    const dimensions = selectedDimensions(form);
    return { type: 'cash_service', reference: reference.value, date: date.value, service: service.value, amount: amount.value,
      ...(Object.keys(dimensions).length ? { dimensions } : {}) };
  };
  form.addEventListener('input', () => { eventDraft = value(); });
  form.addEventListener('change', () => { eventDraft = value(); });
  const preview = el('button', t('ui207'), 'primary'); preview.type = 'submit';
  preview.disabled = !isOpen() || !state.services.length;
  const result = el('div'); let plan;
  const commit = button(t('ui208'), async () => {
    if (!confirmLabel(t('ui209'))) return;
    eventDraft = value();
    const receipt = await api('/api/events/post', 'POST', { event: eventDraft, token: plan.token });
    await refresh(); notify(t('ui212', {p0: receipt.reference, p1: receipt.journalId, p2: receipt.replayed ? t('ui210') : t('ui211')}));
  }, 'primary', true);
  form.append(grid, preview);
  form.addEventListener('submit', (event) => {
    event.preventDefault(); run(preview, async () => {
      plan = undefined; commit.disabled = true; result.replaceChildren();
      eventDraft = value(); plan = await api('/api/events/preview', 'POST', eventDraft);
      result.replaceChildren(el('p', plan.reason), el('p', plan.lineMeanings.join(' / ')),
        linesTable(plan.journal.lines), structureSnapshot(plan.dimensionStructures), table([t('ui213'), t('ui182'), t('ui214'), t('ui215'), t('ui169'), t('ui216')],
          plan.candidates.map((r) => [r.id, t(`scope.${r.scope}`), r.match, r.priority, r.revision, r.id === plan.rule.id ? t('ui217') : t('ui218')])));
      commit.disabled = false; notify(t('ui219'));
    });
  });
  p.append(form, result, commit, button(t('ui220'), () => {
    if (confirmLabel(t('ui221'))) { eventDraft = undefined; render(); }
  }), el('p', t('ui222'), 'warning'));
  workspace.append(p);
  const history = panel(t('ui223'), t('ui224'));
  if (!state.eventReceipts.length) history.append(el('p', t('ui225'), 'empty'));
  for (const receipt of state.eventReceipts) {
    const detail = el('details'), summary = el('summary', t('ui226', {p0: receipt.reference, p1: receipt.journalId}));
    detail.append(summary, el('p', `${receipt.event.date} · ${receipt.event.service} · ${receipt.event.amount}`),
      el('p', receipt.plan.reason), linesTable(receipt.plan.journal.lines), structureSnapshot(receipt.plan.dimensionStructures));
    history.append(detail);
  }
  workspace.append(history);
}
const examples = [
  [t('ui227'), t('ui228'), 'normal', '1200', '1000', '3000'],
  [t('ui229'), t('ui230'), 'adjusting', '5000', '1200', '300'],
  [t('ui231'), t('ui232'), 'adjusting', '5100', '2000', '500'],
];
function exampleDraft(example) {
  const [memo, , kind, debit, credit, amount] = example;
  return { date: month + '-15', memo: resolveLabel(memo), kind, lines: [
    { account: debit, debit: amount, credit: '0' }, { account: credit, debit: '0', credit: amount },
  ] };
}
function overview() {
  workspace.append(metrics());
  const tasks = panel(t('ui233'));
  const drafts = state.journals.filter(j => j.date.startsWith(month) && j.status === 'draft').length;
  tasks.append(el('p', t('ui234', {p0: month, p1: isOpen() ? t('ui052') : t('ui053'), p2: drafts}), 'overview-status'),
    button(t('ui235'), () => go('journals'), 'primary'), button(t('ui236'), () => go('events')),
    button(t('ui237'), () => go('reports')));
  workspace.append(tasks);
  if (!teaching) return;
  const hero = el('section', undefined, 'hero');
  hero.append(el('p', t('shell.learningTag'), 'eyebrow'), el('h2', t('ui238')),
    el('p', t('ui239')),
    button(t('ui240'), () => { editingId = undefined; go('journals'); }, 'primary'));
  const flow = el('div', undefined, 'flow');
  for (const text of [t('ui241'), t('ui242'), t('ui243'), t('ui244'), t('ui245'), t('ui246')]) flow.append(el('span', text));
  hero.append(flow); workspace.append(hero);
  const split = el('div', undefined, 'split'), path = panel(t('ui247'), t('ui248'));
  const steps = el('div', undefined, 'steps');
  examples.forEach((example, i) => {
    const step = el('div', undefined, 'step'), body = el('div');
    body.append(el('h3', example[0]), el('p', example[1]));
    step.append(el('span', String(i + 1).padStart(2, '0'), 'step-number'), body,
      button(t('ui249'), () => { editingId = undefined; view = 'journals'; render(); fillEditor(exampleDraft(example)); }, '', !isOpen()));
    steps.append(step);
  });
  for (const [i, title, text, target] of [
    [4, t('ui250'), t('ui251'), 'reports'],
    [5, t('ui252'), t('ui253'), 'journals'],
    [6, t('ui254'), t('ui255'), 'close'],
  ]) {
    const step = el('div', undefined, 'step'), body = el('div'); body.append(el('h3', title), el('p', text));
    step.append(el('span', String(i).padStart(2, '0'), 'step-number'), body, button(t('ui256'), () => go(target)));
    steps.append(step);
  }
  path.append(steps);
  const side = el('div'), insight = panel(t('ui257')); insight.classList.add('insight');
  insight.prepend(el('p', t('shell.learningTag'), 'eyebrow'));
  insight.append(el('p', t('ui258')),
    button(t('ui259'), () => go('ai')));
  const terms = panel(t('ui260'));
  for (const [term, text] of [[t('ui261'), t('ui262')], [t('ui263'), t('ui264')], [t('ui265'), t('ui266')]]) {
    const item = el('div', undefined, 'definition'); item.append(el('strong', term), el('p', text)); terms.append(item);
  }
  side.append(insight, terms); split.append(path, side); workspace.append(split);
}
function journals() {
  const editor = panel(t('ui267'), t('ui268'));
  editor.id = 'editor';
  editor.append(el('p', t('ui269'), 'essential'));
  const form = el('form'); form.id = 'journal-form';
  const grid = el('div', undefined, 'form-grid');
  const date = input('date', month + '-15'); date.id = 'entry-date'; date.required = true;
  date.min = month + '-01'; date.max = lastDate(month);
  const kind = select([['normal', t('ui270')], ['adjusting', t('ui271')]], 'normal'); kind.id = 'entry-kind';
  const memo = input('text'); memo.id = 'entry-memo'; memo.maxLength = 200; memo.required = true;
  grid.append(label(t('ui272'), date), label(t('ui078'), kind), label(t('ui273'), memo)); form.append(grid);
  const labels = el('div', undefined, 'entry-row entry-labels');
  for (const text of [t('ui274'), t('ui056'), t('ui057'), '']) labels.append(el('span', text));
  const lines = el('div'); lines.id = 'entry-lines';
  form.append(labels, lines);
  const total = el('div', '', 'editor-total'); total.id = 'entry-total'; form.append(total);
  const controls = el('div', undefined, 'toolbar');
  controls.append(el('p', t('ui275')),
    button(t('ui276'), () => addEntryLine()), button(t('ui277'), () => { editingId = undefined; fillEditor(); }));
  const save = el('button', t('ui278'), 'primary'); save.type = 'submit'; controls.append(save); form.append(controls);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(save, async () => {
      const data = editorValue();
      const saved = await api('/api/journals' + (editingId ? `/${editingId}` : ''), editingId ? 'PUT' : 'POST', data);
      editingId = undefined; await refresh(); notify(t('ui279', {p0: saved.id}));
    });
  });
  editor.append(form);
  if (!isOpen()) { form.querySelectorAll('input,select,button').forEach((n) => { n.disabled = true; }); editor.append(el('p', t('ui280'), 'warning')); }
  workspace.append(editor);
  addEntryLine(); addEntryLine();
  const edited = state.journals.find((j) => j.id === editingId);
  if (edited) fillEditor({ ...edited, lines: edited.lines.map((l) => ({ ...l, debit: decimal(l.debit), credit: decimal(l.credit) })) });
  workspace.append(aiPanel(true));
  const list = panel(t('ui281'), t('ui282'));
  const visible = state.journals.filter((j) => j.date.startsWith(month));
  if (!visible.length) list.append(el('p', t('ui283'), 'empty'));
  for (const j of visible) {
    const detail = el('details', undefined, 'journal'), summary = el('summary');
    summary.append(el('span', `#${j.id}`, 'id'), el('span', j.date, 'date'), el('span', j.memo, 'memo'),
      el('span', kinds[j.kind], 'badge closed'), el('span', j.status === 'posted' ? t('ui284') : t('ui285'), 'badge' + (j.status === 'draft' ? ' closed' : '')));
    detail.append(summary, linesTable(j.lines));
    const source = state.eventReceipts?.find((r) => r.journalId === j.id);
    if (source) detail.append(el('p', t('ui286', {p0: source.reference, p1: source.plan.rule.id, p2: source.plan.rule.revision})));
    const toolbar = el('div', undefined, 'toolbar');
    if (j.status === 'draft' && isOpen()) {
      if (j.kind !== 'reversal') toolbar.append(button(t('ui287'), () => { editingId = j.id; render(); $('#entry-memo').focus(); }));
      toolbar.append(button(t('ui288'), async () => {
        if (!confirmLabel(t('ui289', {p0: j.id}))) return;
        await api(`/api/journals/${j.id}`, 'DELETE', {}); if (editingId === j.id) editingId = undefined;
        await refresh(); notify(t('ui290'));
      }, 'danger'), button(t('ui291'), async () => {
        if (!confirmLabel(t('ui292', {p0: j.id}))) return;
        await api(`/api/journals/${j.id}/post`, 'POST', {}); if (editingId === j.id) editingId = undefined;
        await refresh(); notify(t('ui293', {p0: j.id}));
      }, 'primary'));
    }
    const open = state.periods.find((p) => p.status === 'open');
    if (j.status === 'posted' && ['normal', 'adjusting'].includes(j.kind) && open) {
      const existing = state.journals.find((r) => r.reversal_of === j.id);
      if (existing) toolbar.append(el('p', t('ui294', {p0: existing.id})));
      else {
        const reversalDate = input('date', open.month + '-01'); reversalDate.min = open.month + '-01'; reversalDate.max = lastDate(open.month);
        toolbar.append(label(t('ui295'), reversalDate), button(t('ui296'), async () => {
          const created = await api(`/api/journals/${j.id}/reverse`, 'POST', { date: reversalDate.value });
          await refresh(open.month); notify(t('ui297', {p0: created.id}));
        }));
      }
    }
    detail.append(toolbar); list.append(detail);
  }
  workspace.append(list);
}
function addEntryLine(value = { account: '', debit: '', credit: '' }) {
  const row = el('div', undefined, 'entry-row');
  const account = select([['', t('ui298')], ...state.accounts.map((a) => [a.code, `${a.code} ${a.name}`])], value.account);
  account.className = 'line-account'; account.required = true; setAttributeLabel(account, 'aria-label', t('ui274'));
  for (const option of account.options) {
    const a = state.accounts.find((item) => item.code === option.value);
    if (!a) continue;
    if (!a.active || !a.manualAllowed) { option.disabled = true; appendText(option, t('ui299')); }
  }
  const debit = input('text', value.debit), credit = input('text', value.credit);
  for (const [n, side, title] of [[debit, 'debit', t('ui300')], [credit, 'credit', t('ui301')]]) {
    n.className = `line-${side}`; n.inputMode = 'decimal'; setAttributeLabel(n, 'placeholder', t('amount.placeholder')); setAttributeLabel(n, 'aria-label', title); n.addEventListener('input', updateTotals);
  }
  const remove = button(t('action.remove'), () => {
    if ($('#entry-lines').children.length <= 2) throw clientError(t('ui302'));
    row.remove(); updateTotals();
  }, 'remove-line');
  row.append(account, debit, credit, remove);
  if (state.dimensions.length) row.append(dimensionEditor(value.dimensions));
  else { const dimensions = el('div', undefined, 'line-dimensions');
    dimensions.append(el('span', t('ui303')), button(t('ui304'), () => go('dimensions'))); row.append(dimensions); }
  if (!isOpen()) row.querySelectorAll('input,select,button').forEach((n) => { n.disabled = true; });
  $('#entry-lines').append(row); updateTotals();
}
function editorValue() {
  return { date: $('#entry-date').value, kind: $('#entry-kind').value, memo: $('#entry-memo').value,
    lines: [...$('#entry-lines').children].map((r) => {
      const dimensions = selectedDimensions(r);
      return { account: r.querySelector('.line-account').value,
        debit: r.querySelector('.line-debit').value || '0', credit: r.querySelector('.line-credit').value || '0',
        ...(Object.keys(dimensions).length ? { dimensions } : {}) };
    }) };
}
function updateTotals() {
  const lines = [...$('#entry-lines').children];
  const sum = (side) => lines.reduce((s, row) => {
    const raw = row.querySelector(`.line-${side}`).value || '0';
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw)) return NaN;
    const [whole, fraction = ''] = raw.split('.'); return s + Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }, 0);
  const debit = sum('debit'), credit = sum('credit');
  $('#entry-total').classList.toggle('unbalanced', !Number.isFinite(debit + credit) || debit !== credit);
  $('#entry-total').setAttribute('role', 'status');
  setAttributeLabel($('#entry-total'), 'aria-live', 'polite');
  setText($('#entry-total'), Number.isFinite(debit + credit)
    ? t('ui308', {p0: fmt(debit), p1: fmt(credit), p2: debit !== credit ? t('ui305', {p0: fmt(Math.abs(debit - credit)), p1: debit > credit ? t('ui046') : t('ui047')}) : debit > 0 ? t('ui306') : t('ui307')})
    : t('ui309'));
}
function fillEditor(data = { date: month + '-15', memo: '', kind: 'normal', lines: [
  { account: '', debit: '', credit: '' }, { account: '', debit: '', credit: '' },
] }) {
  $('#entry-date').value = data.date; $('#entry-kind').value = data.kind; $('#entry-memo').value = resolveLabel(data.memo);
  $('#entry-lines').replaceChildren(); data.lines.forEach(addEntryLine); updateTotals();
  $('#editor').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function ledger() {
  const p = panel(t('ui310'), t('ui311'));
  const target = ledgerTarget?.month === month ? ledgerTarget : undefined;
  const account = select(state.accounts.map((a) => [a.code, `${a.code} ${a.name}`]), target?.account || '1000');
  account.id = 'ledger-account';
  if (target) {
    p.append(el('p', joinLabels([t('trial.ledgerContext', { month, account: target.account, stage: target.stage }),
      t('trial.ledgerBasis')], ' '), 'essential trial-ledger-context'));
  }
  p.append(label(t('ui312'), account));
  const dimension = select([['', t('ui313')], ...state.dimensions.map((d) =>
    [d.code, t('ui124', {p0: d.code, p1: d.name, p2: d.active ? '' : t('ui144')})])], '');
  const value = select([['', t('ui314')]], '');
  dimension.id = 'ledger-dimension'; value.id = 'ledger-dimension-value';
  p.append(label(t('ui315'), dimension), label(t('ui316'), value),
    el('p', t('ui317'), 'warning'));
  const result = el('div'); p.append(result); workspace.append(p);
  const load = async () => {
    const requested = account.value, period = month, dimensionCode = dimension.value, dimensionValue = value.value;
    if (dimensionCode && !dimensionValue) { result.replaceChildren(el('p', t('ui318'))); return; }
    const data = await api(`/api/ledger?month=${encodeURIComponent(period)}&account=${requested}`
      + (dimensionCode ? `&dimension=${dimensionCode}&value=${dimensionValue}` : ''));
    if (view !== 'ledger' || month !== period || account.value !== requested
      || dimension.value !== dimensionCode || value.value !== dimensionValue) return;
    result.replaceChildren(el('p', t('ui319', {p0: fmt(data.opening), p1: fmt(data.closing)}), 'table-note'),
      table([t('ui272'), t('ui320'), t('ui273'), t('ui046'), t('ui047'), t('ui321')],
        data.entries.map((l) => [l.date, `#${l.id}`, l.memo, fmt(l.debit), fmt(l.credit), fmt(l.balance)]), { numeric: [3, 4, 5] }));
  };
  const clearTarget = () => { ledgerTarget = undefined; p.querySelector('.trial-ledger-context')?.remove(); };
  account.addEventListener('change', () => { clearTarget(); load().catch(showError); });
  dimension.addEventListener('change', () => {
    clearTarget();
    value.replaceChildren();
    const d = state.dimensions.find((item) => item.code === dimension.value);
    for (const [code, text] of [['', t('ui314')], ...(d?.values || [])
      .map((v) => [v.code, t('ui124', {p0: v.code, p1: v.name, p2: d.active && v.active ? '' : t('ui144')})])]) {
      const option = el('option', text); option.value = code; value.append(option);
    }
    load().catch(showError);
  });
  value.addEventListener('change', () => { load().catch(showError); });
  load().catch(showError);
}
function reports() {
  workspace.append(metrics());
  reconciliationPanel();
  const trial = panel(t('ui322'), t('ui323'));
  trial.append(el('p', t('ui324'), 'essential'), el('p', t('trial.ledgerBasis'), 'essential'));
  const variant = select([['unadjusted', t('ui325')], ['adjusted', t('ui326')],
    ['postClosing', isOpen() ? t('ui327') : t('ui328')]], 'adjusted');
  const result = el('div');
  const draw = () => {
    const tb = state.reports.trialBalances[variant.value];
    const stage = variant.value === 'unadjusted' ? t('ui325') : variant.value === 'adjusted' ? t('ui326') : isOpen() ? t('ui327') : t('ui328');
    result.replaceChildren(table([t('ui055'), t('ui329'), t('ui330')],
      tb.rows.map((a) => [reportLabel(`${a.code} ${a.name}`, a.debit - a.credit, t('ui331', {p0: stage}), a.code, stage), fmt(a.debit), fmt(a.credit)]),
      { numeric: [1, 2], footer: [t('ui332'), fmt(tb.debit), fmt(tb.credit)] }));
  };
  variant.addEventListener('change', draw); trial.append(label(t('ui333'), variant), result); draw(); workspace.append(trial);
  const split = el('div', undefined, 'split');
  const r = state.reports;
  const income = panel(t('ui334'), t('ui335', {p0: month}));
  income.append(el('p', t('ui336', {p0: month}), 'essential'));
  const incomeRows = r.accounts.filter((a) => ['REVENUE', 'EXPENSE'].includes(a.category))
    .map((a) => { const amount = a.category === 'REVENUE' ? -a.activity : a.activity;
      return [reportLabel(a.name, amount, t('ui337'), a.code), fmt(amount)]; });
  income.append(table([t('ui338'), t('ui339')], incomeRows, { numeric: [1], footer: [t('ui340'), fmt(r.profit)] }));
  const equity = panel(t('ui341'), t('ui342'));
  equity.append(table([t('ui338'), t('ui343')], [[t('ui344'), fmt(r.equitySummary.opening)], [t('ui345'), fmt(r.equitySummary.movements)],
    [t('ui340'), fmt(r.profit)]], { numeric: [1], footer: [t('ui346'), fmt(r.equitySummary.closing)] }));
  split.append(income, equity); workspace.append(split);
  const balance = panel(t('ui347'), t('ui348', {p0: month}));
  balance.append(table([t('ui338'), t('ui349')], [
    ...r.accounts.filter((a) => a.category === 'ASSET').map((a) => [reportLabel(a.name, a.balance, t('ui350'), a.code), fmt(a.balance)]),
    [t('ui351'), fmt(r.assets)],
    ...r.accounts.filter((a) => ['LIABILITY', 'EQUITY'].includes(a.category)).map((a) => [reportLabel(a.name, -a.balance, t('ui352'), a.code), fmt(-a.balance)]),
    [t('ui353'), fmt(r.unclosedProfit)],
  ], { numeric: [1], footer: [t('ui354'), fmt(r.liabilities + r.equity)] }));
  workspace.append(balance);
  const analysis = panel(t('ui355'), t('ui356'));
  analysis.append(el('p', t('ui357'), 'essential'));
  analysis.append(table([t('ui055'), t('ui079'), t('ui358'), t('ui359'), t('ui360')],
    r.accountAnalysis.rows.map((a) => [`${a.code} ${accountName(a.code)}`,
      t('ui361', {p0: normalSides[a.normalSide], p1: purposes[a.purpose]}), fmt(a.balance), fmt(a.normalAmount),
      a.oppositeBalance ? t('ui362') : a.balance === 0 ? t('ui363') : t('ui364')]),
    { numeric: [2, 3] }));
  const contra = panel(t('ui365'), t('ui366'));
  contra.append(el('p', t('ui367'), 'essential'));
  contra.append(table([t('ui368'), t('ui369'), t('ui370'), t('ui371'), t('ui372'), t('ui373')],
    r.accountAnalysis.contraGroups.map((g) => [`${g.account} ${accountName(g.account)}`,
      g.measure === 'activity' ? t('ui374') : t('ui375'), g.accounts.join(' / '),
      fmt(g.gross), fmt(g.contra), fmt(g.net)]), { numeric: [3, 4, 5] }));
  workspace.append(analysis, contra);
}
function reconciliationPanel() {
  const requestedMonth = month;
  const p = panel(t('reconciliation.title', { month: requestedMonth }));
  p.id = 'reconciliation';
  p.append(el('p', t('reconciliation.scope'), 'essential'));
  const result = el('div');
  result.id = 'reconciliation-result';
  result.setAttribute('aria-live', 'polite');
  let requestId = 0;
  const ids = ['tb.unadjusted', 'tb.adjusted', 'tb.postClosing', 'balanceSheet', 'equitySummary', 'profit'];
  const load = async () => {
    const id = ++requestId, revision = refreshRevision;
    const current = () => id === requestId && revision === refreshRevision && result.isConnected
      && view === 'reports' && month === requestedMonth && $('#period').value === requestedMonth;
    if (!current()) return;
    result.replaceChildren(el('p', t('reconciliation.loading', { month: requestedMonth }), 'reconciliation-loading'));
    try {
      const data = await api(`/api/reconciliation?month=${encodeURIComponent(requestedMonth)}`);
      if (!current()) return;
      if (data.month !== requestedMonth || !Array.isArray(data.checks) || data.checks.length !== ids.length
        || typeof data.allPass !== 'boolean'
        || !data.checks.every((check, index) => check?.id === ids[index]
          && [check.left, check.right, check.difference].every(Number.isSafeInteger)
          && check.difference === check.left - check.right && check.pass === (check.difference === 0))
        || data.allPass !== data.checks.every(check => check.pass)) {
        throw clientError(t('reconciliation.invalid'));
      }
      const status = el('p', t(data.allPass ? 'reconciliation.allPass' : 'reconciliation.hasDifferences'),
        'reconciliation-status' + (data.allPass ? '' : ' warning'));
      status.dataset.pass = String(data.allPass);
      const checks = table([t('reconciliation.check'), t('reconciliation.left'), t('reconciliation.right'),
        t('reconciliation.difference'), t('reconciliation.status')],
      data.checks.map(check => [t(`reconciliation.${check.id}`), fmt(check.left), fmt(check.right), fmt(check.difference),
        t(check.pass ? 'reconciliation.pass' : 'reconciliation.failed')]), { numeric: [1, 2, 3] });
      checks.querySelectorAll('tbody tr').forEach((row, index) => {
        row.dataset.checkId = data.checks[index].id;
        if (!data.checks[index].pass) row.className = 'reconciliation-failed';
      });
      result.replaceChildren(status, checks);
    } catch (error) {
      if (current()) result.replaceChildren(el('p', diagnosticLabel(error), 'warning reconciliation-error'));
    }
  };
  p.append(button(t('reconciliation.retry'), load), result);
  workspace.append(p);
  load();
}
function closeView() {
  workspace.append(metrics());
  const p = panel(t('ui376'), t('ui377'));
  p.append(el('p', t('ui378'), 'essential'));
  p.append(el('p', t('ui379'), 'warning'));
  const controls = el('div', undefined, 'toolbar'), preview = el('div');
  controls.append(button(t('ui380'), () => go('reports')),
    button(t('ui381'), async () => {
      const data = await api('/api/close/preview', 'POST', { month });
      preview.replaceChildren(); preview.className = 'close-preview';
      preview.append(el('h3', t('ui382', {p0: fmt(data.profit), p1: data.drafts})), linesTable(data.lines));
      if (!data.lines.length) preview.append(el('p', t('ui383'), 'table-note'));
      if (data.drafts) preview.append(el('p', t('ui384'), 'warning'));
      preview.append(button(t('ui385'), async () => {
        if (!confirmLabel(t('ui386', {p0: month}))) return;
        await api('/api/close', 'POST', { month }); await refresh(); notify(t('ui387', {p0: month}));
      }, 'primary', data.drafts > 0));
    }, 'primary', !isOpen()),
    button(t('ui388'), async () => {
      const next = await api('/api/periods/next', 'POST', {}); editingId = undefined;
      await refresh(next.month); notify(t('ui389', {p0: next.month}));
    }, '', state.periods.at(-1).status !== 'closed'));
  p.append(controls, preview); workspace.append(p);
}
function reportLabel(name, amount, basis, account, trialStage) {
  const cell = el('div', undefined, 'report-label');
  const accountLabel = trialStage ? button(name, () => go('ledger', { month, account, stage: trialStage }), 'trial-ledger') : el('span', name);
  if (trialStage) {
    accountLabel.dataset.account = account;
    setAttributeLabel(accountLabel, 'aria-label', t('trial.openLedger', { month, account }));
  }
  cell.append(accountLabel, button(t('ui390'), () => {
    aiQuestion = resolveLabel(t('ui392', {p0: month, p1: basis, p2: name, p3: account ? t('ui391', {p0: account}) : '', p4: fmt(amount)}));
    go('ai');
  }, 'explain-number'));
  return cell;
}
function aiView() { workspace.append(aiPanel()); }
function aiPanel(inline = false) {
  const p = panel(inline ? t('ui393') : t('ui036'),
    t('ui394'));
  p.classList.add('ai-composer');
  p.append(el('p', t('ui395'), 'essential'));
  p.append(el('p', t('ui396'), 'essential'));
  p.append(el('p', state.aiConfigured
    ? t('ui397', {p0: state.aiProvider, p1: state.aiModel})
    : t('ui398'), 'warning'));
  const mode = select(inline ? [['draft', t('ui399')]] : [['draft', t('ui399')], ['teach', t('ui400')]], aiQuestion && !inline ? 'teach' : 'draft');
  const prompt = el('textarea'); prompt.className = 'ai-prompt'; prompt.maxLength = 4000;
  setAttributeLabel(prompt, 'placeholder', t('ui401'));
  if (!inline) { prompt.value = aiQuestion; aiQuestion = ''; }
  const result = el('div');
  const send = button(inline ? t('ui402') : t('ui403'), async () => {
    const selectedMode = mode.value, requestedMonth = month;
    const data = await api('/api/ai/' + selectedMode, 'POST', { prompt: prompt.value, month: requestedMonth });
    if (month !== requestedMonth || !p.isConnected) { notify(t('ui404'), true); return; }
    result.replaceChildren();
    result.append(el('p', t('ui405'), 'ai-label'));
    if (selectedMode === 'teach') result.append(el('div', data.text, 'explanation'));
    else {
      const proposal = data.proposal;
      result.append(el('h3', `${proposal.date} · ${proposal.memo}`),
        linesTable(proposal.lines.map((l) => ({ ...l, debit: parseMinor(l.debit), credit: parseMinor(l.credit) }))),
        el('div', proposal.rationale, 'explanation'),
        button(t('ui406'), () => {
          if (month !== requestedMonth || !isOpen()) throw clientError(t('ui407'));
          if ($('#entry-memo') && !confirmLabel(t('ui408'))) return;
          editingId = undefined; view = 'journals'; render(); fillEditor(proposal);
          notify(t('ui409'));
        }, 'primary'));
    }
  }, 'primary');
  p.append(label(t('ui410'), mode), label(t('ui411'), prompt), el('div', undefined, 'toolbar'), send, result);
  return p;
}
function parseMinor(raw) { const [whole, fraction = ''] = raw.split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2, '0')); }
$('#period').addEventListener('change', (event) => {
  const selected = event.target.value; editingId = undefined; eventDraft = undefined;
  refresh(selected).catch((error) => { event.target.value = month; showError(error); });
});
$('#teaching-mode').addEventListener('change', () => {
  const next = $('#teaching-mode').checked;
  try { localStorage.setItem(preferenceKey, next ? 'on' : 'off'); }
  catch { $('#teaching-mode').checked = teaching; notify(t('preferences.writeError', {preference: t('shell.teaching')}), true); return; }
  teaching = next;
  if (state) { if (view === 'overview') render(); else chrome(); }
});
$('#ui-theme').addEventListener('change', () => {
  const next = $('#ui-theme').value;
  try { localStorage.setItem(themeKey, next); }
  catch { $('#ui-theme').value = theme; notify(t('preferences.writeError', {preference: t('theme.label')}), true); return; }
  theme = next; document.documentElement.dataset.theme = theme;
});
$('#ui-language').addEventListener('change', () => {
  const next = $('#ui-language').value;
  try { localStorage.setItem(languageKey, next); }
  catch { $('#ui-language').value = labels.language; notify(t('preferences.writeError', {preference: t('language.label')}), true); return; }
  labels.setLanguage(next); document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  if (state) chrome();
});
if (preferenceFailures.length) notify(t('preferences.startup', {details: joinLabels(preferenceFailures, '; ')}), true);
refresh().catch((error) => { workspace.replaceChildren(el('p', t('ui413'), 'empty')); showError(error); });
