// Standalone ERP workspace. All document access belongs to the supplied root.
const OPERATIONS = ['journal', 'cash_service', 'statistics', 'clearing.match', 'reverse', 'replace', 'reclassify', 'cash_service.cancel'];
const KINDS = ['account', 'dimension', 'dimensionValue', 'defaults', 'derivation', 'structure', 'balance', 'service', 'party', 'rule'];
const GROUPS = ['cash', 'receivables', 'inventory', 'prepayments', 'fixedAssets', 'otherAssets', 'payables', 'taxLiabilities', 'otherLiabilities', 'capital', 'retainedEarnings', 'otherEquity', 'sales', 'otherRevenue', 'costOfSales', 'operatingExpense', 'otherExpense'];
const MODULES = ['journal', 'cash_service', 'statistics', 'clearing', 'correction'];
const dated = [['from', 'date', '1900-01-01'], ['to', 'date', '9998-12-31']];
const FIELDS = {
  account: [['name'], ['category', ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']], ['reportGroup', GROUPS], ['normalSide', ['DEBIT', 'CREDIT']], ['purpose', ['general', 'control', 'clearing', 'suspense']], ['controlModule', ['', 'AP', 'AR', 'INVENTORY', 'ASSET', 'BANK', 'TAX', 'LEASE', 'IC']], ['contraOf'], ['manualAllowed', 'checkbox', true]],
  dimension: [['name'], ...dated],
  dimensionValue: [['dimension'], ['value'], ['name'], ...dated],
  defaults: [['account'], ['values', 'json', {}], ...dated],
  derivation: [['when', 'json', {}], ['values', 'json', {}], ['mode', ['fill', 'replace']], ...dated],
  structure: [['account'], ['required', 'json', []], ['allowed', 'json', []], ['conditionals', 'json', []], ['fixed', 'json', {}], ...dated],
  balance: [['dimension'], ['account']],
  service: [['name'], ['group'], ['defaultDimensions', 'json', {}]],
  party: [['name'], ['group'], ['defaultDimensions', 'json', {}]],
  rule: [['event', ['cash_service']], ['meaning', ['cash', 'revenue', 'forecast']], ['objectScope', ['exact', 'group', 'all']], ['objectCode'], ['partyScope', ['exact', 'group', 'all']], ['partyCode'], ['account'], ['dimensions', 'json', {}], ...dated]
};

export function createEnterpriseWorkspace({ root, labels, api, notify = () => {}, onError = () => {}, period, periodStatus, isActive = () => true }) {
  const doc = root.ownerDocument;
  const t = (key, params) => labels.t(`erp.${key}`, params);
  let generation = 0, previewGeneration = 0, indexGeneration = 0, stateGeneration = 0, auditGeneration = 0;
  let currentCompany = '', month = '', snapshot = null, preview = null;
  let active = false, mounted = false, teaching = false, latestCompanies = [];
  let shell, content, errorBox, companySelect, configForm, operationForm, operationFields, rowsEditor, confirmPost, postButton, previewBox;
  let configKind, configCode, configActive, configFields, configRevision, configConfirm, operation, periodForm;
  let journalList, sourceList, reportBox, queueBox, obligationBox, statisticsBox, auditBox, detailBox, ledgerBox, ledgerForm;
  const configInputs = new Map(), commandInputs = new Map();
  const dimensionBindings = new Set();
  const listGenerations = new Map();
  let refreshPeriodForm = () => {};
  const node = (tag, text, className) => {
    const element = doc.createElement(tag);
    if (text !== undefined) labels.append(element, text);
    if (className) element.className = className;
    return element;
  };
  const text = (element, value) => labels.setText(element, value);
  function button(key, action, parent, attrs = {}) {
    const element = node('button', t(key));
    element.type = 'button'; element.dataset.erpAction = key; Object.assign(element, attrs);
    if (action) element.addEventListener('click', action);
    parent?.append(element); return element;
  }
  function panel(key, parent = content) {
    const section = node('section', undefined, 'panel erp-section');
    section.append(node('h2', t(key))); parent.append(section); return section;
  }
  function input(parent, name, key = name, type = 'text', value = '') {
    const wrapper = node('label');
    wrapper.append(node('span', t(`field.${key}`)));
    const control = node(type === 'textarea' || type === 'json' ? 'textarea' : 'input');
    control.name = name;
    labels.attribute(control, 'aria-label', t(`field.${key}`));
    if (control.tagName === 'INPUT') control.type = type === 'json' ? 'text' : type;
    if (type === 'checkbox') control.checked = Boolean(value);
    else control.value = type === 'json' ? JSON.stringify(value, null, 2) : value;
    if (type === 'json') {
      control.dataset.json = '';
      wrapper.append(node('small', t('jsonHelp')));
    }
    wrapper.append(control); parent.append(wrapper); return control;
  }
  function select(parent, name, key, values, raw = false) {
    const wrapper = node('label', t(`field.${key}`)), control = node('select');
    control.name = name; labels.attribute(control, 'aria-label', t(`field.${key}`));
    for (const entry of values) {
      const value = typeof entry === 'object' ? entry.value : entry;
      const option = node('option', typeof entry === 'object' ? entry.label : raw ? value : t(`value.${value || 'none'}`));
      option.value = value; control.append(option);
    }
    wrapper.append(control); parent.append(wrapper); return control;
  }
  const data = (parent, value) => parent.append(node('pre', typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'erp-data'));
  function table(parent, columns, items, render) {
    if (!items?.length) { parent.append(node('p', t('empty'))); return; }
    const scroll = node('div', undefined, 'scroll'), grid = node('table'), head = node('tr');
    columns.forEach(key => head.append(node('th', t(`field.${key}`))));
    const thead = node('thead'); thead.append(head); grid.append(thead);
    const tbody = node('tbody');
    items.forEach(item => {
      const row = node('tr');
      render(item).forEach(value => { const cell = node('td'); if (value?.nodeType) cell.append(value); else if (value !== undefined && value !== null) labels.append(cell, value); row.append(cell); });
      tbody.append(row);
    });
    grid.append(tbody); scroll.append(grid); parent.append(scroll);
  }
  const money = (value, scale = snapshot?.company?.scale ?? 2) => {
    if (value === null || value === undefined) return t('unavailable');
    if (!Number.isSafeInteger(value)) return t('invalidAmount');
    const raw = BigInt(value), digits = (raw < 0n ? -raw : raw).toString().padStart(scale + 1, '0');
    return `${raw < 0n ? '-' : ''}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
  };
  function context() { return { generation, company: currentCompany, month }; }
  function valid(c) {
    return active && isActive() && root.contains(shell) && c.generation === generation && c.company === currentCompany && c.month === month;
  }
  function failure(error, c) {
    if (c && !valid(c)) return;
    text(errorBox, t('error', { diagnostic: error.uiLabel || error.message || String(error) }));
    errorBox.hidden = false; errorBox.setAttribute('role', 'alert');
    notify(t('failed'), error); onError(error);
  }
  const uiError = (key, params) => Object.assign(new Error(labels.resolve(t(key, params))), { uiLabel: t(key, params) });
  function clearError() { errorBox.hidden = true; errorBox.replaceChildren(); }
  async function run(control, action) {
    if (control.disabled || !valid(context()) || !shell.contains(control)) return;
    control.disabled = true;
    const c = context(); clearError();
    try { await action(c); } catch (error) { failure(error, c); }
    finally {
      // Busy state belongs to this control, not the obsolete request context.
      // Release detached controls too: the same shell can be reattached later.
      if (control === postButton) syncPost();
      else control.disabled = false;
    }
  }
  function parseJSON(control, fallback) {
    if (!control.value.trim()) throw uiError('jsonError', { field: t(`field.${control.dataset.field || control.name}`) });
    try {
      const result = JSON.parse(control.value);
      if (Array.isArray(fallback) ? !Array.isArray(result) : result === null || typeof result !== 'object' || Array.isArray(result)) throw Error();
      return result;
    } catch { throw uiError('jsonError', { field: t(`field.${control.dataset.field || control.name}`) }); }
  }
  function invalidate() {
    previewGeneration++; preview = null;
    if (postButton) postButton.disabled = true;
    if (confirmPost) { confirmPost.checked = false; confirmPost.disabled = true; }
    if (previewBox?.childNodes.length) {
      previewBox.dataset.stale = 'true';
      let note = previewBox.querySelector('[data-erp="stale"]');
      if (!note) { note = node('p', t('stale'), 'warning essential'); note.dataset.erp = 'stale'; previewBox.prepend(note); }
    }
  }
  function neutralPeriod() {
    if (!active || !isActive() || !root.contains(shell)) return;
    if (period) { period.replaceChildren(); period.disabled = true; }
    if (periodStatus) text(periodStatus, t('periodNeutral'));
  }
  function mount() {
    mounted = true; operationForm = null;
    shell = node('div', undefined, 'enterprise-workspace'); shell.dataset.erp = 'workspace';
    shell.append(node('h1', t('title')), node('p', t('description')));
    const essential = node('p', t('boundaries'), 'warning essential'); essential.dataset.erp = 'essential'; shell.append(essential);
    const help = node('p', t('teaching'), 'teaching-content'); help.hidden = !teaching; shell.append(help);
    errorBox = node('div', undefined, 'warning essential'); errorBox.hidden = true; shell.append(errorBox);
    const companyPanel = panel('companies', shell);
    companySelect = select(companyPanel, 'company', 'company', [{ value: '', label: t('selectCompany') }]);
    companySelect.addEventListener('change', () => {
      generation++; invalidate(); currentCompany = companySelect.value; snapshot = null;
      content.hidden = true;
      neutralPeriod();
      if (currentCompany) {
        const company = latestCompanies.find(item => item.code === currentCompany);
        month = `${company?.year || new Date().getFullYear()}-01`;
        loadCompany(true);
      }
    });
    const create = node('form', undefined, 'form-grid'); create.dataset.erp = 'create-company'; companyPanel.append(create);
    const createInputs = {};
    for (const [name, type, value] of [['code', 'text', ''], ['name', 'text', ''], ['year', 'number', new Date().getFullYear()], ['currency', 'text', ''], ['scale', 'number', 2], ['reportCurrency', 'text', ''], ['reportScale', 'number', 2]]) createInputs[name] = input(create, `create.${name}`, name, type, value);
    createInputs.scale.min = createInputs.reportScale.min = '0'; createInputs.scale.max = createInputs.reportScale.max = '4';
    createInputs.chartTemplate = select(create, 'create.chartTemplate', 'chartTemplate', []);
    const confirm = input(create, 'create.confirm', 'confirmCreate', 'checkbox');
    const createButton = button('create', () => run(createButton, async c => {
      if (!confirm.checked) throw uiError('confirmationRequired');
      const payload = Object.fromEntries(Object.entries(createInputs).map(([name, control]) => [name, ['year', 'scale', 'reportScale'].includes(name) ? Number(control.value) : control.value.trim()]));
      if (['code', 'name', 'currency', 'reportCurrency', 'chartTemplate'].some(key => !payload[key])) throw uiError('required');
      await api('/api/erp/companies', 'POST', payload);
      if (!valid(c)) return;
      confirm.checked = false;
      await loadIndex(); if (valid(c)) notify(t('created'));
    }), create);
    create.addEventListener('submit', event => { event.preventDefault(); createButton.click(); });
    shell._template = createInputs.chartTemplate;
    content = node('div'); content.hidden = true; shell.append(content); root.replaceChildren(shell);
    neutralPeriod();
    for (const event of ['input', 'change']) shell.addEventListener(event, e => {
      if (e.target !== confirmPost) invalidate();
    });
  }
  function fillOptions(control, values, blank) {
    const old = control.value; control.replaceChildren();
    if (blank) { const opt = node('option', t(blank)); opt.value = ''; control.append(opt); }
    values.forEach(item => { const opt = node('option', item.label ?? item.code); opt.value = item.value ?? item.code; control.append(opt); });
    if (old && ![...control.options].some(option => option.value === old)) {
      const missing = node('option', t('unavailableCode', { code: old })); missing.value = old; control.append(missing);
    }
    if ([...control.options].some(option => option.value === old)) control.value = old;
  }
  async function loadIndex() {
    const c = context(), sequence = ++indexGeneration;
    try {
      const result = await api('/api/erp/state');
      if (!valid(c) || sequence !== indexGeneration) return;
      latestCompanies = result.companies || [];
      fillOptions(companySelect, latestCompanies.map(item => ({ value: item.code, label: `${item.code} — ${item.name}` })), 'selectCompany');
      fillOptions(shell._template, result.chartTemplates || []);
    } catch (error) { if (sequence === indexGeneration) failure(error, c); }
  }
  function statePath(cursor) {
    const params = new URLSearchParams({ company: currentCompany, month });
    if (cursor) params.set('cursor', cursor);
    return `/api/erp/state?${params}`;
  }
  async function loadCompany(rebuild = false) {
    const c = context(), sequence = ++stateGeneration;
    try {
      const result = await api(statePath());
      if (!valid(c) || sequence !== stateGeneration) return false;
      snapshot = result;
      if (period) {
        period.replaceChildren();
        (result.periods || []).forEach(item => { const opt = node('option', item.month); opt.value = item.month; period.append(opt); });
        period.value = month; period.disabled = false;
      }
      const current = result.periods?.find(item => item.month === month);
      if (periodStatus) text(periodStatus, t('periodStatus', { month, status: t(`value.${current?.status || 'unknown'}`) }));
      if (rebuild || !operationForm) buildWorkspace();
      else { refreshConfiguredControls(); refreshPeriodForm(current); }
      renderState(); content.hidden = false; return true;
    } catch (error) { if (sequence === stateGeneration) failure(error, c); return false; }
  }
  function buildWorkspace() {
    content.replaceChildren(); configInputs.clear(); commandInputs.clear(); dimensionBindings.clear();
    const links = node('nav', undefined, 'toolbar');
    const areas = ['setup', 'entry', 'journals', 'sources', 'queue', 'ledger', 'reports', 'obligations', 'statistics', 'period', 'audit'];
    areas.forEach(key => button(key, () => content.querySelector(`[data-section="${key}"]`)?.scrollIntoView?.({ block: 'start' }), links));
    const refresh = button('refresh', () => run(refresh, async () => {
      invalidate(); await Promise.all([loadIndex(), loadCompany()]);
    }), links);
    content.append(links);
    const section = key => { const result = panel(key); result.dataset.section = key; return result; };
    buildConfig(section('setup')); buildEntry(section('entry'));
    journalList = section('journals'); sourceList = section('sources'); queueBox = section('queue');
    const ledgerSection = section('ledger'); buildLedger(ledgerSection);
    reportBox = section('reports'); obligationBox = section('obligations'); statisticsBox = section('statistics');
    buildPeriod(section('period')); auditBox = section('audit');
    detailBox = panel('detail'); detailBox.dataset.erp = 'detail';
  }
  function resetPanel(section, key) { section.replaceChildren(node('h2', t(key))); }
  function buildConfig(section) {
    configForm = node('form', undefined, 'form-grid'); section.append(configForm);
    let edits = 0;
    for (const event of ['input', 'change']) configForm.addEventListener(event, () => { edits++; });
    configKind = select(configForm, 'config.kind', 'configKind', KINDS);
    const existing = select(configForm, 'config.existing', 'existing', []);
    configCode = input(configForm, 'config.code', 'code');
    configRevision = node('output'); configRevision.name = 'config.revision'; configRevision.dataset.uiData = '';
    configForm.append(node('span', t('field.revision')), configRevision);
    configActive = input(configForm, 'config.active', 'active', 'checkbox', true);
    configFields = node('div', undefined, 'form-grid'); configForm.append(configFields);
    configConfirm = input(configForm, 'config.confirm', 'confirmConfig', 'checkbox');
    function render(record) {
      configInputs.clear(); configFields.replaceChildren();
      configCode.value = record?.code || ''; configCode.readOnly = Boolean(record);
      configRevision.value = String(record?.revision || 0); configRevision.dataset.revision = String(record?.revision || 0);
      configActive.checked = record?.active ?? true; configConfirm.checked = false;
      FIELDS[configKind.value].forEach(([name, type = 'text', initial = '']) => {
        const value = record?.data?.[name] ?? initial;
        const control = Array.isArray(type) ? select(configFields, `config.${name}`, name, type) : input(configFields, `config.${name}`, name, type, value);
        control.dataset.field = name;
        if (Array.isArray(type)) control.value = value || type[0];
        configInputs.set(name, { control, type, initial });
      });
    }
    function choices() {
      fillOptions(existing, (snapshot.configs || []).filter(item => item.kind === configKind.value).map(item => ({ value: item.code, label: `${item.code} · ${item.revision}` })), 'newConfig');
      existing.value = ''; render();
    }
    configKind.addEventListener('change', choices);
    existing.addEventListener('change', () => render(snapshot.configs.find(item => item.kind === configKind.value && item.code === existing.value)));
    const save = button('saveConfig', () => run(save, async c => {
      if (!configConfirm.checked) throw uiError('confirmationRequired');
      if (!configCode.value.trim()) throw uiError('required');
      const values = {};
      configInputs.forEach(({ control, type, initial }, name) => {
        values[name] = type === 'json' ? parseJSON(control, initial) : type === 'checkbox' ? control.checked : control.value.trim();
        if (['controlModule', 'contraOf'].includes(name) || (configKind.value === 'defaults' && name === 'account')) values[name] ||= null;
      });
      const payload = { company: currentCompany, kind: configKind.value, code: configCode.value.trim(), expectedRevision: Number(configRevision.dataset.revision), active: configActive.checked, data: values };
      const submittedEdit = edits;
      invalidate(); await api('/api/erp/config', 'POST', payload);
      if (!valid(c)) return;
      invalidate(); await loadCompany(); if (!valid(c)) return;
      const saved = snapshot.configs.find(item => item.kind === payload.kind && item.code === payload.code);
      if (edits === submittedEdit) { choices(); if (saved) { existing.value = saved.code; render(saved); } }
      notify(t('saved'));
    }), configForm);
    configForm.addEventListener('submit', event => { event.preventDefault(); save.click(); });
    choices();
  }
  function accountChoices() {
    return (snapshot.accounts || []).map(item => ({ value: item.code, label: `${item.code} — ${item.name ?? item.data?.name ?? ''}` }));
  }
  function dimensionEditor(parent, name) {
    const section = node('fieldset'); section.append(node('legend', t('field.dimensions')));
    const controls = [];
    const empty = node('p', t('noDimensions')); section.append(empty);
    const refresh = () => {
      (snapshot.configs || []).filter(item => item.kind === 'dimension' && item.active).forEach(dimension => {
        let entry = controls.find(item => item.code === dimension.code);
        if (!entry) {
          const wrapper = node('label', `${dimension.code} — ${dimension.data.name}`), control = node('select');
          control.name = `${name}.${dimension.code}`;
          labels.attribute(control, 'aria-label', t('dimensionFor', { code: dimension.code }));
          wrapper.append(control); section.append(wrapper); entry = { code: dimension.code, control }; controls.push(entry);
        }
        const wasEmpty = entry.control.options.length === 0;
        fillOptions(entry.control, [
          { value: '__missing', label: t('dimensionInherit') },
          { value: '__null', label: t('dimensionClear') },
          ...(snapshot.configs || []).filter(item => item.kind === 'dimensionValue' && item.active && item.data.dimension === dimension.code).map(item => ({ value: item.data.value, label: `${item.data.value} — ${item.data.name}` }))
        ]);
        if (wasEmpty) entry.control.value = '__missing';
      });
      empty.hidden = controls.length > 0;
    };
    refresh(); dimensionBindings.add({ section, refresh });
    parent.append(section);
    return () => Object.fromEntries(controls.filter(item => item.control.value !== '__missing').map(item => [item.code, item.control.value === '__null' ? null : item.control.value]));
  }
  function refreshConfiguredControls() {
    for (const binding of dimensionBindings) {
      if (content.contains(binding.section)) binding.refresh();
      else dimensionBindings.delete(binding);
    }
    content.querySelectorAll('select[name="line.account"], select[name="ledger.account"], select[name="entry.account"]').forEach(control => {
      fillOptions(control, accountChoices(), 'selectAccount');
    });
    for (const kind of ['service', 'party']) {
      const control = content.querySelector(`select[name="entry.${kind}"]`);
      if (control) fillOptions(control, snapshot.configs.filter(item => item.kind === kind && item.active).map(item => ({ value: item.code, label: `${item.code} — ${item.data.name}` })), kind === 'service' ? 'selectService' : 'value.none');
    }
  }
  function journalEditor(parent) {
    const wrapper = node('div', undefined, 'erp-line-editor');
    const lineRows = node('div'); lineRows.dataset.erp = 'rows'; wrapper.append(lineRows);
    const difference = node('p', undefined, 'warning essential'); difference.dataset.erp = 'imbalance'; wrapper.append(difference);
    const entries = [];
    function units(value) {
      if (!value) return 0n;
      const scale = snapshot.company.scale;
      if (!new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(scale, 1)}})?$`).test(value) || (scale === 0 && value.includes('.'))) throw uiError('precision', { scale });
      const [whole, fraction = ''] = value.split('.');
      const result = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
      if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw uiError('invalidAmount');
      return result;
    }
    function update() {
      try {
        const balance = entries.reduce((sum, item) => sum + units(item.debit.value) - units(item.credit.value), 0n);
        if (balance > BigInt(Number.MAX_SAFE_INTEGER) || balance < BigInt(Number.MIN_SAFE_INTEGER)) throw uiError('invalidAmount');
        text(difference, t('imbalance', { amount: money(Number(balance)), currency: snapshot.company.currency }));
        difference.dataset.balanced = String(balance === 0n);
      } catch (error) { text(difference, error.uiLabel || t('invalidAmount')); difference.dataset.balanced = 'false'; }
    }
    function add() {
      const row = node('fieldset'); row.dataset.erp = 'line'; row.append(node('legend', t('line')));
      const account = select(row, 'line.account', 'account', [{ value: '', label: t('selectAccount') }, ...accountChoices()]);
      const debit = input(row, 'line.debit', 'debit'), credit = input(row, 'line.credit', 'credit');
      debit.inputMode = credit.inputMode = 'decimal';
      const dimensions = dimensionEditor(row, 'line.dimensions');
      const owner = input(row, 'line.owner', 'owner'), reason = input(row, 'line.reason', 'reason'), reviewDate = input(row, 'line.reviewDate', 'reviewDate', 'date');
      const item = { row, account, debit, credit, dimensions, owner, reason, reviewDate }; entries.push(item);
      button('removeLine', () => { entries.splice(entries.indexOf(item), 1); row.remove(); invalidate(); update(); }, row);
      row.addEventListener('input', update); row.addEventListener('change', update);
      lineRows.append(row); update(); invalidate();
    }
    button('addLine', add, wrapper); parent.append(wrapper); add(); add();
    return {
      read() {
        if (entries.length < 2) throw uiError('twoLines');
        return entries.map(item => {
          if (!item.account.value || (!item.debit.value && !item.credit.value)) throw uiError('required');
          const debit = units(item.debit.value), credit = units(item.credit.value);
          if ((debit > 0n) === (credit > 0n)) throw uiError('oneSide');
          const result = { account: item.account.value, debit: item.debit.value || '0', credit: item.credit.value || '0', dimensions: item.dimensions() };
          if (item.owner.value || item.reason.value || item.reviewDate.value) result.metadata = { owner: item.owner.value, reason: item.reason.value, reviewDate: item.reviewDate.value };
          return result;
        });
      }
    };
  }
  function buildEntry(section) {
    operationForm = node('form', undefined, 'form-grid'); operationForm.dataset.erp = 'command'; section.append(operationForm);
    operation = select(operationForm, 'operation', 'operation', OPERATIONS.map(value => ({ value, label: t(value === 'replace' ? 'operation.replace' : `value.${value}`) })));
    for (const name of ['reference', 'accountingDate', 'documentDate', 'taxDate']) commandInputs.set(name, input(operationForm, name, name, name.endsWith('Date') ? 'date' : 'text', name.endsWith('Date') ? `${month}-01` : ''));
    operationFields = node('div', undefined, 'form-grid'); operationForm.append(operationFields);
    previewBox = node('div'); previewBox.dataset.erp = 'preview'; section.append(previewBox);
    const previewButton = button('preview', () => run(previewButton, async c => {
      invalidate(); const revision = previewGeneration, command = readCommand();
      let result;
      try { result = await api('/api/erp/preview', 'POST', command); }
      catch (error) { if (valid(c) && revision === previewGeneration) throw error; return; }
      if (!valid(c) || revision !== previewGeneration) return;
      preview = result; renderPreview(result);
      confirmPost.disabled = false; syncPost();
    }), operationForm);
    confirmPost = input(operationForm, 'confirmPost', 'confirmPost', 'checkbox'); confirmPost.disabled = true;
    postButton = button('post', () => {
      if (!preview || !confirmPost.checked) return;
      const accepted = preview;
      run(postButton, async c => {
        const result = await api('/api/erp/post', 'POST', { command: accepted.command, token: accepted.token, confirmation: 'POST' });
        if (!valid(c)) return;
        invalidate(); previewBox.replaceChildren(node('h3', t('receipt')));
        data(previewBox, result);
        await loadCompany(); if (valid(c)) notify(t('accepted'));
      });
    }, operationForm, { disabled: true });
    confirmPost.addEventListener('change', syncPost);
    operation.addEventListener('change', () => { invalidate(); renderOperation(); });
    operationForm.addEventListener('input', event => { if (event.target !== confirmPost) invalidate(); });
    operationForm.addEventListener('change', event => { if (event.target !== confirmPost) invalidate(); });
    operationForm.addEventListener('submit', event => { event.preventDefault(); previewButton.click(); });
    renderOperation();
  }
  function syncPost() { postButton.disabled = !preview || !confirmPost.checked; }
  let operationReaders = {};
  function renderOperation() {
    operationFields.replaceChildren(); rowsEditor = null; operationReaders = {};
    const field = (name, type = 'text', value = '') => {
      const control = input(operationFields, `entry.${name}`, name, type, value); operationReaders[name] = () => control.value.trim(); return control;
    };
    const choice = (name, values, raw = false) => {
      const control = select(operationFields, `entry.${name}`, name, values, raw); operationReaders[name] = () => control.value; return control;
    };
    const dimensions = () => { operationReaders.dimensions = dimensionEditor(operationFields, 'entry.dimensions'); };
    const original = () => {
      operationFields.append(node('p', t('fullCorrection'), 'essential'));
      const control = field('originalJournalId', 'number'); control.min = '1';
      operationReaders.originalJournalId = () => Number(control.value);
      const picker = select(operationFields, 'entry.journalPicker', 'journalPicker', [{ value: '', label: t('selectOriginal') }, ...(snapshot.journals?.items || []).map(item => ({ value: String(item.id), label: `${item.id} — ${item.reference}` }))]);
      picker.addEventListener('change', () => { control.value = picker.value; });
      operationFields.append(node('p', t('originalScope', { company: currentCompany, month })));
    };
    switch (operation.value) {
      case 'journal':
        choice('kind', ['normal', 'adjusting']); field('memo');
        field('currency', 'text', snapshot.company.currency).readOnly = true;
        choice('transferMode', ['sync', 'queued']);
        operationReaders.headerDimensions = dimensionEditor(operationFields, 'entry.headerDimensions');
        rowsEditor = journalEditor(operationFields); break;
      case 'cash_service':
        operationFields.append(node('p', t('ruleHelp'), 'essential'));
        choice('service', [{ value: '', label: t('selectService') }, ...snapshot.configs.filter(item => item.kind === 'service' && item.active).map(item => ({ value: item.code, label: `${item.code} — ${item.data.name}` }))]);
        choice('party', [{ value: '', label: t('value.none') }, ...snapshot.configs.filter(item => item.kind === 'party' && item.active).map(item => ({ value: item.code, label: `${item.code} — ${item.data.name}` }))]);
        field('amount'); field('currency', 'text', snapshot.company.currency).readOnly = true; field('memo'); dimensions(); break;
      case 'statistics':
        operationFields.append(node('p', t('statisticsBoundary'), 'essential'));
        field('code'); field('quantity'); field('unit'); dimensions(); break;
      case 'clearing.match': {
        choice('account', [{ value: '', label: t('selectAccount') }, ...accountChoices()]);
        const ids = field('lineIds'); operationFields.append(node('p', t('lineIdsHelp')));
        operationReaders.lineIds = () => {
          const values = ids.value.split(',').map(value => Number(value.trim()));
          if (values.length < 2 || values.some(value => !Number.isSafeInteger(value) || value <= 0)) throw uiError('lineIdsError');
          return values;
        };
        field('reason'); break;
      }
      case 'reverse': original(); field('memo'); break;
      case 'replace':
      case 'reclassify':
        original(); field('memo'); operationReaders.headerDimensions = dimensionEditor(operationFields, 'entry.headerDimensions');
        rowsEditor = journalEditor(operationFields); break;
      case 'cash_service.cancel':
        operationFields.append(node('p', t('cancelBoundary'), 'essential')); field('originalReference'); field('memo'); break;
    }
  }
  function readCommand() {
    const command = { company: currentCompany, operation: operation.value, sourceRevision: 0 };
    commandInputs.forEach((control, key) => { command[key] = control.value.trim(); });
    if (['reference', 'accountingDate', 'documentDate', 'taxDate'].some(key => !command[key])) throw uiError('required');
    command.data = Object.fromEntries(Object.entries(operationReaders).map(([key, read]) => [key, read()]));
    if (rowsEditor) command.data.lines = rowsEditor.read();
    if (operation.value === 'cash_service' && !command.data.party) command.data.party = null;
    return command;
  }
  function linesTable(parent, lines) {
    table(parent, ['account', 'debit', 'credit', 'currency', 'transactionCurrency', 'transactionDebit', 'transactionCredit', 'reportCurrency', 'reportingDebit', 'reportingCredit', 'rateRefs', 'dimensions', 'provenance', 'metadata'], lines, item => [
      item.account, money(item.debit), money(item.credit), item.accountingCurrency || item.currency || snapshot.company.currency,
      item.currency || snapshot.company.currency, money(item.transactionDebit ?? item.debit), money(item.transactionCredit ?? item.credit),
      item.reportingCurrency || snapshot.company.reportCurrency || '',
      item.reportingDebit == null ? t('notTranslatedAmount') : money(item.reportingDebit, snapshot.company.reportScale),
      item.reportingCredit == null ? t('notTranslatedAmount') : money(item.reportingCredit, snapshot.company.reportScale),
      node('pre', JSON.stringify(item.rateRefs ?? {}, null, 2)),
      node('pre', JSON.stringify(item.dimensions || {}, null, 2)),
      node('pre', JSON.stringify(item.dimensionOrigins || {}, null, 2)),
      node('pre', JSON.stringify(item.metadata || {}, null, 2))
    ]);
  }
  function renderPreview(result) {
    previewBox.replaceChildren(node('h3', t('finalPlan'))); delete previewBox.dataset.stale;
    previewBox.append(node('p', t('previewBoundary'), 'essential'));
    const normalized = node('details'); normalized.append(node('summary', t('field.normalizedCommand')));
    data(normalized, result.command); previewBox.append(normalized);
    linesTable(previewBox, result.plan.lines || []);
    for (const journal of result.plan.journals || []) {
      if (!journal.lines?.length) continue;
      previewBox.append(node('h4', journal.kind ?? journal.operation ?? ''));
      linesTable(previewBox, journal.lines);
    }
    for (const key of ['journals', 'explanations', 'checks', 'objectEffects', 'facts', 'policySnapshots', 'expectedRevisions']) {
      const details = node('details'); details.open = ['explanations', 'checks', 'objectEffects'].includes(key);
      details.append(node('summary', t(`field.${key}`))); data(details, result.plan[key] ?? []); previewBox.append(details);
    }
  }
  function buildLedger(section) {
    ledgerForm = node('form', undefined, 'form-grid'); section.append(ledgerForm);
    const account = select(ledgerForm, 'ledger.account', 'account', [{ value: '', label: t('selectAccount') }, ...accountChoices()]);
    const dimension = input(ledgerForm, 'ledger.dimension', 'dimension'), value = input(ledgerForm, 'ledger.value', 'value');
    ledgerBox = node('div'); ledgerBox.dataset.erp = 'ledger'; section.append(ledgerBox);
    const load = button('loadLedger', () => run(load, c => loadLedger(account.value, dimension.value, value.value, null, c)), ledgerForm);
    ledgerForm.addEventListener('submit', event => { event.preventDefault(); load.click(); });
  }
  let ledgerGeneration = 0;
  async function loadLedger(account, dimension = '', value = '', cursor, c = context()) {
    if (!account) throw uiError('required');
    const sequence = ++ledgerGeneration, params = new URLSearchParams({ company: currentCompany, month, account });
    if (dimension) params.set('dimension', dimension);
    if (value) params.set('value', value);
    if (cursor) params.set('cursor', cursor);
    let result;
    try { result = await api(`/api/erp/ledger?${params}`); }
    catch (error) { if (valid(c) && sequence === ledgerGeneration) throw error; return; }
    if (!valid(c) || sequence !== ledgerGeneration) return;
    ledgerForm.querySelector('[name="ledger.account"]').value = account;
    ledgerBox.replaceChildren(node('p', t('ledgerScope', { company: currentCompany, month, account })));
    table(ledgerBox, ['opening', 'debit', 'credit', 'closing', 'currency'], [result], row => [money(row.opening, result.scale), money(row.debit, result.scale), money(row.credit, result.scale), money(row.closing, result.scale), result.currency]);
    table(ledgerBox, ['id', 'accountingDate', 'reference', 'debit', 'credit', 'dimensions'], result.lines, row => [row.journalId ?? row.id, row.accountingDate, row.reference, money(row.debit, result.scale), money(row.credit, result.scale), node('pre', JSON.stringify(row.dimensions || {}))]);
    paging(ledgerBox, result, cursor => loadLedger(account, dimension, value, cursor));
  }
  function paging(parent, result, next) {
    parent.append(node('p', t('pageCount', { count: result.items?.length ?? result.lines?.length ?? 0, total: result.total ?? 0 })));
    if (result.nextCursor !== null && result.nextCursor !== undefined) {
      const more = button('nextPage', () => run(more, () => next(result.nextCursor)), parent);
    }
  }
  function renderLists(target, key, page) {
    const revision = (listGenerations.get(key) || 0) + 1; listGenerations.set(key, revision);
    resetPanel(target, key);
    if (key === 'journals') table(target, ['id', 'reference', 'accountingDate', 'detail'], page.items, item => [item.id, item.reference, item.accountingDate, button('viewJournal', () => openDetail('journals', item.id))]);
    else table(target, ['reference', 'operation', 'status', 'detail'], page.items, item => [item.reference, OPERATIONS.includes(item.operation) ? t(item.operation === 'replace' ? 'operation.replace' : `value.${item.operation}`) : item.operation, statusText(item.status), button('viewSource', () => openDetail('sources', item.reference))]);
    paging(target, page, async cursor => {
      const c = context();
      let result;
      try { result = await api(statePath(cursor)); }
      catch (error) { if (valid(c) && listGenerations.get(key) === revision) throw error; return; }
      if (!valid(c) || listGenerations.get(key) !== revision) return;
      renderLists(target, key, result[key]);
    });
    if (key === 'sources') {
      const ref = input(target, 'source.lookup', 'originalReference');
      const find = button('viewSource', () => run(find, () => openDetail('sources', ref.value)), target);
    } else {
      const id = input(target, 'journal.lookup', 'originalJournalId', 'number');
      const find = button('viewJournal', () => run(find, () => openDetail('journals', id.value)), target);
    }
  }
  function statusText(value) {
    return ['pending', 'failed', 'posted', 'recorded', 'transferred', 'withdrawn', 'open', 'hold', 'permanent'].includes(value) ? t(`value.${value}`) : value;
  }
  let detailGeneration = 0;
  async function openDetail(kind, id) {
    const c = context(), sequence = ++detailGeneration;
    try {
      if (!id) throw uiError('required');
      const result = await api(`/api/erp/${kind}/${encodeURIComponent(id)}?${new URLSearchParams({ company: currentCompany })}`);
      if (!valid(c) || sequence !== detailGeneration) return;
      resetPanel(detailBox, 'detail');
      detailBox.append(node('p', t(kind === 'sources' ? 'receiptBoundary' : 'immutableBoundary'), 'essential'));
      if (result.lines) linesTable(detailBox, result.lines);
      if (kind === 'journals' && result.reference) button('viewSource', () => openDetail('sources', result.reference), detailBox);
      if (kind === 'sources') for (const journalId of result.journalIds || result.receipt?.journalIds || []) {
        const link = button('viewJournal', () => openDetail('journals', journalId), detailBox);
        labels.append(link, journalId);
      }
      data(detailBox, result); detailBox.scrollIntoView?.({ block: 'start' });
    } catch (error) { if (sequence === detailGeneration) failure(error, c); }
  }
  function renderQueue() {
    const reasons = new Map([...queueBox.querySelectorAll('input[name^="queue.reason."]')].map(control => [control.name, control.value]));
    resetPanel(queueBox, 'queue'); queueBox.append(node('p', t('queueBoundary'), 'warning essential'));
    table(queueBox, ['reference', 'status', 'reason', 'actions'], snapshot.transfers, item => {
      const actions = node('div', undefined, 'toolbar'), pending = ['pending', 'failed'].includes(item.status);
      const confirm = input(actions, `queue.confirm.${item.reference}`, 'confirmQueue', 'checkbox');
      const reason = input(actions, `queue.reason.${item.reference}`, 'reason');
      if (reasons.has(reason.name)) reason.value = reasons.get(reason.name);
      const transfer = button('transfer', () => act('transfer'), actions, { disabled: true });
      const withdraw = button('withdraw', () => act('withdraw'), actions, { disabled: true });
      confirm.disabled = reason.disabled = !pending;
      let busy = false;
      const sync = () => { transfer.disabled = busy || !pending || !confirm.checked; withdraw.disabled = busy || !pending || !confirm.checked || !reason.value.trim(); };
      confirm.addEventListener('change', sync); reason.addEventListener('input', sync);
      async function act(kind) {
        if (busy || !valid(context()) || !shell.contains(actions) || !pending || !confirm.checked || (kind === 'withdraw' && !reason.value.trim())) return;
        busy = true; transfer.disabled = withdraw.disabled = true;
        const c = context();
        try {
          const payload = { company: currentCompany, reference: item.reference };
          if (kind === 'withdraw') payload.reason = reason.value.trim();
          invalidate(); const result = await api(`/api/erp/${kind}`, 'POST', payload);
          if (!valid(c)) return;
          invalidate(); resetPanel(detailBox, 'detail');
          detailBox.append(node('p', t('receiptBoundary'), 'essential')); data(detailBox, result);
          await loadCompany();
        } catch (error) { failure(error, c); }
        finally { busy = false; sync(); }
      }
      return [item.reference, statusText(item.status), item.reason || item.error || '', actions];
    });
  }
  function renderReports() {
    resetPanel(reportBox, 'reports');
    const r = snapshot.reports;
    if (!r) { reportBox.append(node('p', t('empty'))); return; }
    reportBox.append(node('p', t('reportScope', { company: currentCompany, month, currency: r.currency, scale: r.scale }), 'essential'));
    reportBox.append(node('p', r.reporting?.translated === false ? t('notTranslated', { currency: r.reportingCurrency }) : t('reportingAvailable', { currency: r.reportingCurrency }), 'essential'));
    if (r.reporting?.translated && r.reporting.totals) data(reportBox, r.reporting.totals);
    reportBox.append(node('h3', t('trial')));
    table(reportBox, ['account', 'opening', 'debit', 'credit', 'closing'], r.trial?.rows, item => [
      buttonData(item.account, () => {
        const c = context(); loadLedger(item.account, '', '', null, c).catch(error => failure(error, c));
        ledgerBox.scrollIntoView?.({ block: 'start' });
      }), money(item.opening, r.scale), money(item.debit, r.scale), money(item.credit, r.scale), money(item.closing, r.scale)
    ]);
    table(reportBox, ['debit', 'credit'], r.trial ? [r.trial] : [], item => [money(item.debit, r.scale), money(item.credit, r.scale)]);
    reportBox.append(node('h3', t('income')));
    table(reportBox, ['basis', 'revenue', 'expense', 'profit'], ['month', 'ytd'].map(basis => ({ basis, ...r.income?.[basis] })), item => [t(`field.${item.basis}`), money(item.revenue, r.scale), money(item.expense, r.scale), money(item.profit, r.scale)]);
    reportBox.append(node('h3', t('balanceSheet')), node('p', t('earningsBoundary'), 'essential'));
    const balanceFields = ['assets', 'liabilities', 'equity', 'capitalAndRetained', 'currentEarnings'];
    table(reportBox, balanceFields, r.balanceSheet ? [r.balanceSheet] : [], item => balanceFields.map(key => money(item[key], r.scale)));
    reportBox.append(node('h3', t('accountAnalysis')));
    table(reportBox, ['account', 'normalSide', 'closing', 'opposite'], r.accountAnalysis?.rows, item => [item.account, item.normalSide ? t(`value.${item.normalSide}`) : '', money(item.closing, r.scale), item.abnormal ? t('yes') : t('no')]);
    table(reportBox, ['account', 'gross', 'contra', 'net'], r.accountAnalysis?.contraGroups, item => [item.account ?? item.contraOf, money(item.gross, r.scale), money(item.contra, r.scale), money(item.net, r.scale)]);
  }
  function buttonData(value, action) { const control = node('button', value); control.type = 'button'; control.addEventListener('click', action); return control; }
  function buildPeriod(section) {
    let expectedRevision;
    periodForm = node('form', undefined, 'form-grid'); section.append(periodForm);
    section.append(node('p', t('periodBoundary'), 'warning essential'));
    const status = select(periodForm, 'period.status', 'status', ['open', 'hold', 'permanent']);
    const enabled = new Map();
    MODULES.forEach(module => enabled.set(module, input(periodForm, `period.module.${module}`, `module.${module}`, 'checkbox', true)));
    const reason = input(periodForm, 'period.reason', 'reason');
    const permanent = input(periodForm, 'period.permanentConfirmation', 'permanentConfirmation', 'checkbox');
    const confirm = input(periodForm, 'period.confirm', 'confirmPeriod', 'checkbox');
    const save = button('savePeriod', () => run(save, async c => {
      if (!confirm.checked) throw uiError('confirmationRequired');
      if (!reason.value.trim()) throw uiError('required');
      const payload = { company: currentCompany, month, expectedRevision, status: status.value, modules: [...enabled].filter(([, control]) => control.checked).map(([key]) => key), reason: reason.value.trim(), permanentConfirmation: permanent.checked };
      invalidate(); await api('/api/erp/period', 'POST', payload);
      if (!valid(c)) return;
      invalidate(); await loadCompany();
      if (valid(c)) {
        confirm.checked = false; notify(t('saved'));
      }
    }), periodForm);
    periodForm.addEventListener('submit', event => { event.preventDefault(); save.click(); });
    refreshPeriodForm = record => {
      if (!record || record.revision === expectedRevision) return;
      // Adopt the revision and its permissions together, never stale approval.
      status.value = record.status;
      enabled.forEach((control, key) => { control.checked = record.modules.includes(key); });
      reason.value = ''; permanent.checked = false; confirm.checked = false;
      expectedRevision = record.revision;
    };
    refreshPeriodForm(snapshot.periods.find(item => item.month === month));
  }
  async function loadAudit(cursor) {
    const c = context(), sequence = ++auditGeneration, params = new URLSearchParams({ company: currentCompany });
    if (cursor) params.set('cursor', cursor);
    let result;
    try { result = await api(`/api/erp/audit?${params}`); }
    catch (error) { if (valid(c) && sequence === auditGeneration) throw error; return; }
    if (!valid(c) || sequence !== auditGeneration) return;
    resetPanel(auditBox, 'audit'); auditBox.append(node('p', t('auditBoundary'), 'essential'));
    table(auditBox, ['detail'], result.items, item => [node('pre', JSON.stringify(item, null, 2))]);
    paging(auditBox, result, loadAudit);
    const reload = button('loadAudit', () => run(reload, () => loadAudit()), auditBox);
  }
  function renderState() {
    ledgerGeneration++; auditGeneration++;
    ledgerBox.replaceChildren();
    renderLists(journalList, 'journals', snapshot.journals || { items: [], total: 0 });
    renderLists(sourceList, 'sources', snapshot.sources || { items: [], total: 0 });
    renderQueue(); renderReports();
    resetPanel(obligationBox, 'obligations');
    for (const kind of ['clearing', 'suspense']) {
      obligationBox.append(node('h3', t(`value.${kind}`)));
      table(obligationBox, ['id', 'account', 'reference', 'balance', 'owner', 'reason', 'reviewDate', 'overdue'], snapshot[kind], item => [item.lineId ?? item.id, item.account, item.reference, money(item.balance ?? item.amount ?? (item.debit - item.credit)), item.owner ?? item.metadata?.owner, item.reason ?? item.metadata?.reason, item.reviewDate ?? item.metadata?.reviewDate, item.overdue ? t('yes') : t('no')]);
    }
    resetPanel(statisticsBox, 'statistics'); statisticsBox.append(node('p', t('statisticsBoundary'), 'essential'));
    table(statisticsBox, ['code', 'quantity', 'unit', 'dimensions'], snapshot.statistics, item => [item.code, item.quantity, item.unit, node('pre', JSON.stringify(item.dimensions || {}))]);
    resetPanel(auditBox, 'audit'); auditBox.append(node('p', t('auditBoundary'), 'essential'));
    const load = button('loadAudit', () => run(load, () => loadAudit()), auditBox);
  }
  return {
    async show() {
      if (!isActive()) return;
      active = true;
      if (!mounted) mount();
      else if (!root.contains(shell)) { generation++; root.replaceChildren(shell); }
      neutralPeriod();
      if (currentCompany) { await Promise.all([loadIndex(), loadCompany()]); return; }
      await loadIndex();
    },
    async selectMonth(next) {
      if (!active || !isActive() || !currentCompany) return;
      const previousMonth = snapshot?.month, previousSnapshot = snapshot;
      generation++; invalidate(); month = next;
      const c = context(); content.hidden = true;
      const loaded = await loadCompany(true);
      if (!loaded && valid(c) && previousMonth && previousSnapshot.company.code === currentCompany) {
        generation++; month = previousMonth; snapshot = previousSnapshot; content.hidden = false;
        if (period) period.value = previousMonth;
        const record = snapshot.periods.find(item => item.month === previousMonth);
        if (periodStatus) text(periodStatus, t('periodStatus', { month: previousMonth, status: t(`value.${record?.status || 'unknown'}`) }));
      }
    },
    deactivate() { active = false; generation++; invalidate(); },
    setTeaching(value) {
      teaching = Boolean(value);
      if (shell) shell.querySelectorAll('.teaching-content').forEach(element => { element.hidden = !teaching; });
    }
  };
}
