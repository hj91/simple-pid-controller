/***

mqtt-pid.js Copyright 2023, Harshad Joshi and Bufferstack.IO Analytics Technology LLP. Pune

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

***/

"use strict";

const PIDController = require('./index');
const mqtt          = require('mqtt');

// ── MQTT broker connection ─────────────────────────────────────────────────────
// Replace 'mqtt://localhost' with your broker URL (e.g. mqtt://192.168.1.100:1883)
const client = mqtt.connect('mqtt://localhost');

// ── Controller setup ───────────────────────────────────────────────────────────
// Anti-windup: integral clamped to ±100
// Output clamped to ±10 to protect actuators from runaway commands
// Deadband: 0.02 — suppresses output when error is negligible (reduces actuator wear)
// settledTolerance: 0.05 — triggers the 'settled' event when PV is close enough to SV
const controller = new PIDController(1.2, 1, 0.01, 1.0, {
  outputMin:        -10,
  outputMax:         10,
  integralMin:      -100,
  integralMax:       100,
  deadband:          0.02,
  settledTolerance:  0.05,
});

// ── Process state ──────────────────────────────────────────────────────────────
let sv;          // Setpoint value — received via MQTT topic 'sv'
let pv;          // Process variable — received via MQTT topic 'pv'
let intervalId;  // Reference to the active control loop interval

// ── MQTT subscriptions ─────────────────────────────────────────────────────────
client.on('connect', () => {
  client.subscribe('sv');     // Setpoint topic
  client.subscribe('pv');     // Process variable topic
  client.subscribe('gains');  // Optional: runtime gain tuning { k_p, k_i, k_d }
  client.subscribe('mode');   // Optional: switch between 'auto' and 'manual'
  client.subscribe('manual_output'); // Optional: manual output value
  console.log('Connected to MQTT broker and subscribed to topics.');
});

// ── Event: 'update' ────────────────────────────────────────────────────────────
// Fires every cycle. Publishes the full PID status snapshot to 'pid/status'.
// Downstream consumers (InfluxDB writer, SCADA dashboard, Node-RED) can subscribe.
controller.on('update', (status) => {
  const payload = JSON.stringify({
    sv:     status.sv,
    pv:     parseFloat(status.pv.toFixed(2)),
    error:  parseFloat(status.error.toFixed(4)),
    p:      parseFloat(status.p.toFixed(4)),
    i:      parseFloat(status.i.toFixed(4)),
    d:      parseFloat(status.d.toFixed(4)),
    output: parseFloat(status.output.toFixed(4)),
    mode:   status.mode,
  });
  client.publish('pid/status', payload);
  console.log(payload);
});

// ── Event: 'settled' ────────────────────────────────────────────────────────────
// Fires once when |error| <= settledTolerance.
// Stops the control loop and publishes a settled notification.
controller.on('settled', (status) => {
  console.log('Process settled:', JSON.stringify(status));
  client.publish('pid/settled', JSON.stringify(status));

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
});

// ── Control loop ───────────────────────────────────────────────────────────────
// Starts (or restarts) the 1-second PID update cycle.
// Called whenever a new valid SV or PV is received via MQTT.
const startControlLoop = () => {
  // Wait until both SV and PV have been received at least once
  if (typeof sv !== 'number' || typeof pv !== 'number') {
    return;
  }

  // Clear any existing interval before starting a fresh one
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  intervalId = setInterval(() => {
    // update() internally computes dynamic dt, applies deadband, anti-windup,
    // output clamping, and fires 'update' / 'settled' events automatically.
    const output = controller.update(pv);

    // Apply clamped effort to the simulated process variable.
    // Replace this line with your actual actuator command in production.
    const maxEffectPerSecond = 0.1;
    pv += Math.max(-maxEffectPerSecond, Math.min(maxEffectPerSecond, output));
  }, 1000);
};

// ── MQTT message handler ───────────────────────────────────────────────────────
client.on('message', (topic, message) => {
  const raw = message.toString();

  switch (topic) {

    // Setpoint update — resets controller state and restarts the loop
    case 'sv':
      sv = parseFloat(raw);
      if (!isNaN(sv)) {
        controller.setTarget(sv); // Also resets integral & derivative state
        startControlLoop();
      }
      break;

    // Process variable update — restarts loop with latest PV
    case 'pv':
      pv = parseFloat(raw);
      if (!isNaN(pv)) {
        startControlLoop();
      }
      break;

    // Runtime gain update — expects JSON: { "k_p": 1.2, "k_i": 0.8, "k_d": 0.05 }
    // Does NOT reset integral state. Call reset via a separate mechanism if needed.
    case 'gains':
      try {
        const gains = JSON.parse(raw);
        if (
          typeof gains.k_p === 'number' &&
          typeof gains.k_i === 'number' &&
          typeof gains.k_d === 'number'
        ) {
          controller.updateGains(gains.k_p, gains.k_i, gains.k_d);
          console.log(`Gains updated: kp=${gains.k_p}, ki=${gains.k_i}, kd=${gains.k_d}`);
        }
      } catch (e) {
        console.error('Invalid gains payload:', raw);
      }
      break;

    // Mode switch — expects string payload: 'auto' or 'manual'
    // Switching manual → auto performs bumpless transfer automatically.
    case 'mode':
      try {
        controller.setMode(raw.trim());
        console.log(`Controller mode set to: ${raw.trim()}`);
      } catch (e) {
        console.error('Invalid mode:', raw);
      }
      break;

    // Manual output — expects a numeric string, e.g. '5.0'
    // Only effective when mode is 'manual'.
    case 'manual_output':
      const manualVal = parseFloat(raw);
      if (!isNaN(manualVal)) {
        controller.setManualOutput(manualVal);
        console.log(`Manual output set to: ${manualVal}`);
      }
      break;

    default:
      console.log('No handler for topic: %s', topic);
  }
});

// ── Cleanup on process exit ────────────────────────────────────────────────────
process.on('exit', () => {
  if (intervalId) clearInterval(intervalId);
  controller.reset();
  client.end();
});
