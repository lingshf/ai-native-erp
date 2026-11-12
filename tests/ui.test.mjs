import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Book } from '../src/book.mjs';
import { createApp } from '../src/server.mjs';
import { formatMinor } from '../public/money.js';
import { createLabels, dictionaries } from '../public/labels.js';

const proposal = { date: '2026-01-15', memo: 'AI新候选', kind: 'normal', rationale: '虚构服务',
  lines: [{ account: '1000', debit: '10.00', credit: '0' }, { account: '4000', debit: '0', credit: '10.00' }] };
async function until(check) {
  for (let i = 0; i < 80; i++) { if (check()) return; await new Promise(r => setTimeout(r, 10)); }
  assert.ok(check(), 'Expected rendered application state');
}
async function fixture(t, { preference, theme, language, ai, oldDraft = false, storageFailure = false, dimensions = false, twoPeriods = false, events = false, metadata = false } = {}) {
  const book = new Book(':memory:', { today: '2026-01-15' });
  if (dimensions) { book.createDimension({ code: 'DEPT', name: '部门' }); book.createDimensionValue('DEPT', { code: 'OPS', name: '运营' }); }
  if (oldDraft) book.save({ ...proposal, memo: '保留旧草稿' });
  if (metadata) {
    const account=book.createAccount({code:'1500',name:'保留备抵名称',category:'ASSET'});
    book.setAccountProperties('1500',{normalSide:'CREDIT',purpose:'contra',relatedAccount:'1000',revision:0});
    book.updateAccount('1500',{name:account.name,active:false,manualAllowed:false,revision:account.revision});
  }
  if (events) {
    book.createService({ code: 'CONSULT', name: '保留服务名称', group: 'GENERAL' });
    book.createPostingRule({ scope: 'all', match: '*', revenueAccount: '4000' });
  }
  if (twoPeriods) { book.closePeriod('2026-01'); book.nextPeriod(); }
  const server = createApp({ book, ai: {} });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    { url: base, runScripts: 'outside-only' });
  const w = dom.window, calls = [];
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.confirm = () => true;
  if (preference) w.localStorage.setItem('ai-native-erp.teaching-mode', preference);
  if (theme) w.localStorage.setItem('ai-native-erp.theme', theme);
  if (language) w.localStorage.setItem('ai-native-erp.language', language);
  if (storageFailure) {
    w.Storage.prototype.getItem = () => { throw new Error('Storage disabled'); };
    w.Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
  }
  w.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('/api/ai/') && ai) return new Response(JSON.stringify(await ai(url, options)), { headers: { 'content-type': 'application/json' } });
    return fetch(new URL(url, base), options);
  };
  w.formatMinor = formatMinor;
  w.createLabels = createLabels;
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  w.eval(source.replace("import { formatMinor } from './money.js';", 'const formatMinor = window.formatMinor;')
    .replace("import { createLabels } from './labels.js';", 'const createLabels = window.createLabels;'));
  t.after(async () => { dom.window.close(); await new Promise(r => { server.closeAllConnections(); server.close(r); }); book.close(); });
  await until(() => w.document.querySelectorAll('#navigation button').length > 0 && w.document.querySelector('#period').options.length > 0);
  assert.ok(w.document.querySelector('#workspace').children.length, 'App rendered before absence checks');
  const d = w.document;
  const click = text => {
    const b = [...d.querySelectorAll('button')].find(n => n.textContent === text);
    assert.ok(b, `Missing button ${text}`); b.click(); return b;
  };
  return { w, d, calls, click, state: async () => (await fetch(base + '/api/state')).json() };
}
test('ERP grouping, settings separation and teaching preference preserve unsaved input', async t => {
  const { w, d, calls, click } = await fixture(t);
  assert.equal(d.querySelector('#page-name').textContent, '业务概览');
  assert.equal(d.querySelector('#teaching-mode').checked, false);
  assert.deepEqual([...d.querySelectorAll('.nav-group-label')].map(n => n.textContent), ['日常操作', '查询报表', '设置', 'AI']);
  click('日记账');
  d.querySelector('#entry-memo').value = '尚未保存';
  const node = d.querySelector('#entry-memo');
  d.querySelector('#teaching-mode').click();
  assert.equal(w.localStorage.getItem('ai-native-erp.teaching-mode'), 'on');
  d.querySelector('#teaching-mode').click();
  assert.equal(d.querySelector('#entry-memo'), node);
  assert.equal(node.value, '尚未保存');
  click('业务事件');
  assert.equal(d.querySelector('#service-code'), null);
  const reference = d.querySelector('#event-reference'); reference.value = 'UNSAVED';
  d.querySelector('#teaching-mode').click();
  assert.equal(d.querySelector('#event-reference'), reference);
  assert.equal(reference.value, 'UNSAVED');
  click('服务与规则');
  assert.ok(d.querySelector('#service-code'));
  const serviceName = d.querySelector('#service-name'); serviceName.value = '未保存配置';
  d.querySelector('#teaching-mode').click();
  assert.equal(d.querySelector('#service-name'), serviceName);
  assert.equal(serviceName.value, '未保存配置');
  assert.equal(calls.filter(c => c.options?.method && c.options.method !== 'GET').length, 0);
});
function preferenceChange(w, d, id, value) {
  const field = d.querySelector(id); field.value = value; field.dispatchEvent(new w.Event('change'));
}
function assertEnglish(d) {
  const walker = d.createTreeWalker(d.body, d.defaultView.NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    if (!node.parentElement.closest('[data-ui-data]')) assert.doesNotMatch(node.textContent, /[\u3400-\u9fff]/, `Untranslated interface: ${node.textContent}`);
  }
  for (const node of d.querySelectorAll('[placeholder],[aria-label],[title]')) {
    for (const name of ['placeholder','aria-label','title']) assert.doesNotMatch(node.getAttribute(name) || '', /[\u3400-\u9fff]/);
  }
}
test('default red/Chinese preferences switch and persist without changing the book or form nodes', async t => {
  const { w, d, click, calls, state } = await fixture(t, { dimensions: true, oldDraft: true });
  assert.equal(d.documentElement.dataset.theme, 'red');
  assert.equal(d.title,'AI Native ERP');
  assert.equal(d.documentElement.lang, 'zh-CN');
  const before = await state();
  click('日记账');
  const memo = d.querySelector('#entry-memo'); memo.value = '保留用户输入';
  const debit = d.querySelector('.line-debit'); debit.value = '10'; debit.dispatchEvent(new w.Event('input'));
  preferenceChange(w, d, '#ui-theme', 'green');
  preferenceChange(w, d, '#ui-language', 'en');
  assert.equal(w.localStorage.getItem('ai-native-erp.theme'), 'green');
  assert.equal(w.localStorage.getItem('ai-native-erp.language'), 'en');
  assert.equal(d.documentElement.lang, 'en');
  assert.equal(d.querySelector('#entry-memo'), memo); assert.equal(memo.value, '保留用户输入');
  assert.equal(d.querySelector('.line-debit'), debit); assert.equal(debit.value, '10');
  assert.match(d.querySelector('#entry-total').textContent, /10.00/); assertEnglish(d);
  for (const id of ['overview','accounts','dimensions','settings','events','ledger','reports','close','ai']) {
    d.querySelector(`[data-view="${id}"]`).click();
    await until(() => d.querySelector('#workspace h2'));
    assertEnglish(d);
  }
  d.querySelector('#teaching-mode').click(); d.querySelector('[data-view="overview"]').click(); assertEnglish(d);
  assert.deepEqual(await state(), before);
  assert.equal(calls.filter(c => c.options?.method !== 'GET').length, 0);
  const restored = await fixture(t, { theme:'green', language:'en' });
  assert.equal(restored.d.documentElement.dataset.theme, 'green'); assert.equal(restored.d.documentElement.lang, 'en');
  assertEnglish(restored.d);
});
test('all malformed/unavailable preference failures remain visible together, failed writes retain defaults', async t => {
  for (const options of [{ storageFailure:true }, { theme:'bad', language:'bad', preference:'bad' }]) {
    const { w,d } = await fixture(t, options);
    const text = d.querySelector('#notice').textContent;
    for (const label of ['语言 → 中文','主题 → 红色','教学 → 关闭']) assert.ok(text.includes(label));
    if (options.storageFailure) {
      preferenceChange(w,d,'#ui-language','en'); assert.equal(d.documentElement.lang,'zh-CN');
      preferenceChange(w,d,'#ui-theme','green'); assert.equal(d.documentElement.dataset.theme,'red');
      assert.match(d.querySelector('#notice').textContent,/保存/);
    }
  }
  const availableEnglish=await fixture(t,{theme:'bad',language:'en',preference:'bad'});
  const englishNotice=availableEnglish.d.querySelector('#notice').textContent;
  assert.ok(englishNotice.includes('Theme → Red')); assert.ok(englishNotice.includes('Teaching → Off'));
  assert.ok(!englishNotice.includes('Language → Chinese')); assertEnglish(availableEnglish.d);
});
test('English updates account metadata, disabled suffixes, client errors and server prefixes without translating diagnostics', async t => {
  const { w,d,click } = await fixture(t, { dimensions:true, metadata:true });
  click('科目配置'); preferenceChange(w,d,'#ui-language','en'); assertEnglish(d);
  assert.match(d.querySelector('#workspace').textContent,/Contra/);
  preferenceChange(w,d,'#ui-language','zh');
  click('日记账'); click('删除此行');
  assert.match(d.querySelector('#notice').textContent,/至少/);
  preferenceChange(w,d,'#ui-language','en'); assertEnglish(d);
  const disabled=d.querySelector('.line-account option[value="1500"]');
  assert.equal(disabled.disabled,true); assert.ok(disabled.textContent.includes(dictionaries.en.ui299));
  d.querySelector('.ai-prompt').value='触发已知服务诊断';
  click('AI draft'); await until(() => d.querySelector('#notice [data-ui-data]'));
  const diagnostic = [...d.querySelectorAll('#notice [data-ui-data]')].map(n=>n.textContent).join('');
  assert.match(diagnostic,/未配置/);
  assert.match(d.querySelector('#notice').textContent,/Service diagnostic/); assertEnglish(d);
  preferenceChange(w,d,'#ui-language','zh');
  assert.equal([...d.querySelectorAll('#notice [data-ui-data]')].map(n=>n.textContent).join(''),diagnostic);
});
test('in-flight AI result, candidate adoption, and business preview survive language/theme switches without writes', async t => {
  let release;
  const held = new Promise(r=> {release=r;});
  const { w,d,click,calls,state } = await fixture(t, { events:true, ai:()=>held });
  const before = await state();
  click('日记账'); d.querySelector('.ai-prompt').value='中文请求';
  click('AI 起草'); await until(()=>calls.some(c=>c.url==='/api/ai/draft'));
  const panel = d.querySelector('.ai-composer');
  preferenceChange(w,d,'#ui-language','en'); preferenceChange(w,d,'#ui-theme','green');
  release({proposal}); await until(()=>d.querySelector('.ai-label'));
  assert.equal(d.querySelector('.ai-composer'),panel); assert.match(d.querySelector('.ai-label').textContent,/AI/); assertEnglish(d);
  assert.ok(d.querySelector('#workspace').textContent.includes(proposal.rationale));
  click(dictionaries.en.ui406); assert.equal(d.querySelector('#entry-memo').value,proposal.memo);
  assert.deepEqual(await state(),before);
  d.querySelector('[data-view="events"]').click();
  d.querySelector('#event-reference').value='LOCALE-1'; d.querySelector('#event-amount').value='10';
  const previewButton=[...d.querySelectorAll('button')].find(n=>n.textContent===dictionaries.en.ui207);
  assert.ok(previewButton); previewButton.click();
  await until(()=>[...d.querySelectorAll('button')].some(n=>n.textContent===dictionaries.en.ui208&&!n.disabled));
  const confirm=[...d.querySelectorAll('button')].find(n=>n.textContent===dictionaries.en.ui208&&!n.disabled);
  preferenceChange(w,d,'#ui-language','zh');
  assert.ok(confirm.isConnected); assert.equal(confirm.disabled,false);
  preferenceChange(w,d,'#ui-language','en'); assertEnglish(d);
  assert.equal(calls.filter(c=>c.url==='/api/ai/draft').length,1);
  assert.equal(calls.filter(c=>c.url==='/api/events/preview').length,1);
  assert.equal(calls.filter(c=>/journals|events\/post/.test(c.url)&&c.options?.method!=='GET').length,0);
  assert.deepEqual(await state(),before);
});
test('teaching persisted on restores learning and storage failures are explicit', async t => {
  const a = await fixture(t, { preference: 'on' });
  assert.equal(a.d.querySelector('#teaching-mode').checked, true);
  assert.match(a.d.querySelector('#workspace').textContent, /本期学习路径/);
  a.d.querySelector('#teaching-mode').click();
  assert.doesNotMatch(a.d.querySelector('#workspace').textContent, /本期学习路径/);
  const b = await fixture(t, { storageFailure: true });
  assert.match(b.d.querySelector('#notice').textContent, /偏好/);
  b.d.querySelector('#teaching-mode').click();
  assert.match(b.d.querySelector('#notice').textContent, /保存/);
});
test('blank journal input and exact directional imbalance with visible dimension entry', async t => {
  const { d, click } = await fixture(t);
  click('日记账');
  assert.ok([...d.querySelectorAll('.line-account')].every(n => n.value === ''));
  assert.ok([...d.querySelectorAll('.line-debit,.line-credit')].every(n => n.value === '' && n.placeholder));
  const put = (sel, value) => { const n = d.querySelector(sel); n.value = value; n.dispatchEvent(new d.defaultView.Event('input')); };
  put('.line-debit', '10'); put('.line-credit', '3');
  assert.match(d.querySelector('#entry-total').textContent, /7.00.*借方/);
  assert.ok(d.querySelector('#entry-total').classList.contains('unbalanced'));
  put('.line-debit', '3'); put('.line-credit', '10');
  assert.match(d.querySelector('#entry-total').textContent, /7.00.*贷方/);
  put('.line-debit', '1.234');
  assert.match(d.querySelector('#entry-total').textContent, /有效的两位小数/);
  assert.match(d.querySelector('#entry-lines').textContent, /维度/);
  click('新建 / 清空');
  assert.equal(d.querySelector('.line-account').value, '');
  const configured = await fixture(t, { dimensions: true });
  configured.click('日记账');
  assert.equal(configured.d.querySelectorAll('#entry-lines [data-dimension="DEPT"]').length, 2);
});
test('essential warnings stay present in ERP mode and AI errors retain input', async t => {
  const { d, click } = await fixture(t);
  click('日记账');
  assert.match(d.querySelector('#editor .essential').textContent, /过账后不可修改/);
  d.querySelector('.ai-prompt').value = '保留请求';
  click('AI 起草');
  await until(() => d.querySelector('#notice').className === 'error');
  assert.match(d.querySelector('#notice').textContent, /未配置/);
  assert.equal(d.querySelector('.ai-prompt').value, '保留请求');
  click('科目配置');
  assert.ok([...d.querySelectorAll('.essential')].some(n => /编号和类型创建后不可变/.test(n.textContent)));
  click('AI 助手');
  assert.ok([...d.querySelectorAll('.essential')].some(n => /真实财务.*个人信息.*密钥/.test(n.textContent)));
});
test('embedded AI adopts a NEW draft and report explanation only prefills before send', async t => {
  const { d, calls, click, state } = await fixture(t, { oldDraft: true, ai: async () => ({ proposal }) });
  const before = await state(), old = before.journals.find(j => j.memo === '保留旧草稿');
  click('日记账'); click('编辑草稿');
  d.querySelector('.ai-prompt').value = '虚构收入10';
  click('AI 起草'); await until(() => [...d.querySelectorAll('button')].some(n => n.textContent === '采纳为新草稿（仅填入）'));
  assert.deepEqual((await state()).journals, before.journals);
  click('采纳为新草稿（仅填入）');
  assert.equal(d.querySelector('#entry-memo').value, proposal.memo);
  d.querySelector('#journal-form').dispatchEvent(new d.defaultView.Event('submit', { cancelable: true }));
  await until(() => d.querySelector('#notice').textContent.includes('已保存'));
  const after = await state();
  assert.equal(after.journals.length, before.journals.length + 1);
  assert.deepEqual(after.journals.find(j => j.id === old.id), old);
  click('试算与报表');
  const count = calls.filter(c => c.url.startsWith('/api/ai/')).length;
  d.querySelector('.explain-number').click();
  assert.match(d.querySelector('.ai-prompt').value, /2026-01/);
  assert.equal(calls.filter(c => c.url.startsWith('/api/ai/')).length, count);
  assert.ok([...d.querySelectorAll('.essential')].some(n => /真实财务.*密钥/.test(n.textContent)));
});
test('late AI response after leaving journal cannot fill a new editor', async t => {
  let release, started = false;
  const response = new Promise(r => { release = r; });
  const { d, click } = await fixture(t, { ai: async () => { started = true; return response; } });
  click('日记账'); d.querySelector('.ai-prompt').value = '虚构收入';
  click('AI 起草'); await until(() => started);
  click('总账'); release({ proposal });
  await until(() => d.querySelector('#notice').textContent.includes('丢弃'));
  click('日记账');
  assert.equal(d.querySelector('#entry-memo').value, '');
});
test('ERP retains operational dimension and AI disclosure and uses displayed trial basis', async t => {
  const { d, click } = await fixture(t, { dimensions: true });
  click('维度配置');
  assert.match(d.querySelector('.dimension-status')?.textContent || '', /启用.*版本 1/);
  assert.ok([...d.querySelectorAll('.essential')].some(n => /编号.*不可修改.*不可删除/.test(n.textContent)));
  click('期末关账');
  assert.ok([...d.querySelectorAll('.essential')].some(n => /锁定.*不支持反关账/.test(n.textContent)));
  click('AI 助手');
  assert.ok([...d.querySelectorAll('.essential')].some(n => /发送范围.*科目.*期间.*报表/.test(n.textContent)));
  click('试算与报表');
  const variant = d.querySelector('#workspace select'); variant.value = 'postClosing';
  variant.dispatchEvent(new d.defaultView.Event('change'));
  d.querySelector('.explain-number').click();
  assert.match(d.querySelector('.ai-prompt').value, /当前账面/);
  assert.doesNotMatch(d.querySelector('.ai-prompt').value, /postClosing/);
});
test('late AI response after a real period refresh does not populate that period', async t => {
  let release, started = false;
  const response = new Promise(r => { release = r; });
  const { d, click } = await fixture(t, { twoPeriods: true, ai: async () => { started = true; return response; } });
  click('日记账'); d.querySelector('.ai-prompt').value = '虚构二月业务';
  click('AI 起草'); await until(() => started);
  const period = d.querySelector('#period'); period.value = '2026-01';
  period.dispatchEvent(new d.defaultView.Event('change'));
  await until(() => d.querySelector('#period-status').textContent === '已关账');
  release({ proposal: { ...proposal, date: '2026-02-15' } });
  await until(() => d.querySelector('#notice').textContent.includes('丢弃'));
  assert.equal(d.querySelector('#entry-memo').value, '');
});
