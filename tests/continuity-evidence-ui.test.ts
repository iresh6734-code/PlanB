import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,Fragment} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ContinuityEvidence} from '../src/ContinuityEvidence.js';

// Genuine React server render: no browser, hooks interactions, CSS, geometry or focus claims.
test('104 initial view teaches an explicit read and contains no result or fabricated metrics',()=>{const html=renderToStaticMarkup(createElement(ContinuityEvidence));assert.match(html,/Evidencia de tu copia/);assert.match(html,/Consultar evidencia/);assert.match(html,/Solo se consulta al pulsar el botón/);assert.doesNotMatch(html,/data-testid="evidence-result"/);assert.doesNotMatch(html,/<input|<textarea/);assert.match(html,/aria-expanded="true"/);assert.match(html,/Caída del CRM/);assert.match(html,/Pérdida del equipo/);assert.doesNotMatch(html,/Preparado según esta evidencia/);});
test('104 inactive view is empty and independently mounted controls have unique accessible label IDs',()=>{assert.equal(renderToStaticMarkup(createElement(ContinuityEvidence,{active:false})),'');const html=renderToStaticMarkup(createElement(Fragment,null,createElement(ContinuityEvidence),createElement(ContinuityEvidence))),ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);for(const label of html.matchAll(/\sfor="([^"]+)"/g))assert.ok(ids.includes(label[1]));});
