import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { JSDOM } from 'jsdom';
import { createLabels, dictionaries } from '../public/labels.js';

test('label resources have matching parameters, reject missing keys/parameters and implicit coercion', () => {
  const labels=createLabels(), value=labels.t('ui084',{p0:labels.t('ui046'),p1:labels.t('ui048'),p2:''});
  assert.match(labels.resolve(value),/借方/);
  assert.throws(()=>String(value),/Implicit/);
  assert.throws(()=>labels.t('missing'),/Unknown/);
  assert.throws(()=>labels.t('ui084'),/parameters/);
  labels.setLanguage('en'); assert.match(labels.resolve(value),/Debit/);
  const dom=new JSDOM('<!doctype html><title></title>');
  const title=dom.window.document.querySelector('title');
  labels.setText(title,labels.t('language.label'));
  assert.equal(dom.window.document.title,'Language');
  labels.setLanguage('zh'); assert.equal(dom.window.document.title,'语言');
  assert.equal(title.children.length,0); dom.window.close();
  assert.ok(Object.keys(dictionaries.en).length>400);
  for(const text of Object.values(dictionaries.en)) assert.doesNotMatch(text,/[\u3400-\u9fff]/);
});
test('app and HTML use resources for static text, not inline language strings', async () => {
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/[\u3400-\u9fff]/);
  const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const walk=node=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='CallExpression' && node.callee.type==='Identifier' && ['el','button','label','notify','panel'].includes(node.callee.name)){
      const arg=node.arguments[node.callee.name==='el'?1:0];
      if(arg?.type==='Literal'&& typeof arg.value==='string')assert.equal(arg.value,'',`Inline UI text: ${arg.value}`);
    }
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  };walk(tree);
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/>[^<]*[\u3400-\u9fffA-Za-z][^<]*</);
});
