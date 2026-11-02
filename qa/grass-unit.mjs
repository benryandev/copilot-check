// Grass tufts and the ridge: a tuft inside the ridge's corridor is re-seated on the ground when a new series lands.
import test from 'node:test'; import assert from 'node:assert/strict';
import { createGrass } from '../ecosystem/js/effects.js';
import { roads, RIDGE_ROAD, setRidgeSeries, onRidge, terrainHeight } from '../ecosystem/js/terrain.js';
import * as THREE from '../ecosystem/vendor/three.module.min.js';

const LIN = Array.from({ length: 24 }, (_, i) => 78000 + (i * 2000) / 23);
const pal = { grassBase: 0x4f7d3b, grassTip: 0xaed383 };
const tufts = (mesh) => { const m = new THREE.Matrix4(), p = new THREE.Vector3(); const out = []; for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); out.push({ i, x: p.x, y: p.y, z: p.z }); } return out; };

test('grass inside the ridge corridor follows the ground when the series changes', () => {
  setRidgeSeries(LIN);
  const mesh = createGrass(6000, pal, false); // enough tufts that some land in the corridor
  const inside = tufts(mesh).filter((t) => onRidge(t.x, t.z));
  assert.ok(inside.length > 5, `only ${inside.length} tufts in the corridor`);
  setRidgeSeries(null);
  assert.equal(typeof mesh.userData.reseat, 'function');
  mesh.userData.reseat();
  for (const t of tufts(mesh).filter((t) => onRidge(t.x, t.z))) assert.ok(Math.abs(t.y - (terrainHeight(t.x, t.z) - 0.02)) < 1e-6, `tuft at ${t.x.toFixed(1)},${t.z.toFixed(1)} is ${t.y.toFixed(2)}, ground ${terrainHeight(t.x, t.z).toFixed(2)}`);
  setRidgeSeries(LIN);
  mesh.userData.reseat();
  for (const t of tufts(mesh).filter((t) => onRidge(t.x, t.z))) assert.ok(Math.abs(t.y - (terrainHeight(t.x, t.z) - 0.02)) < 1e-6, 'after lifting again');
  setRidgeSeries(null);
});
