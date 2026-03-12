# simple-pid-controller

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm](https://img.shields.io/npm/v/simple-pid-controller)](https://www.npmjs.com/package/simple-pid-controller)

A feature-complete, industrial-grade PID controller for Node.js.  
Built for IIoT gateway applications, SCADA dashboards, and process automation — with MQTT, InfluxDB, and OPC UA integration in mind.

**Author:** Harshad Joshi  
**Organisation:** Bufferstack.IO Analytics Technology LLP, Pune  
**License:** Apache 2.0

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [Constructor](#constructor)
  - [Methods](#methods)
  - [Properties (Getters)](#properties-getters)
  - [Events](#events)
- [Options Reference](#options-reference)
- [Examples](#examples)
  - [Basic Usage](#basic-usage)
  - [With Anti-windup and Output Clamping](#with-anti-windup-and-output-clamping)
  - [Manual / Auto Mode with Bumpless Transfer](#manual--auto-mode-with-bumpless-transfer)
  - [Runtime Gain Tuning](#runtime-gain-tuning)
  - [MQTT Integration](#mqtt-integration)
- [Included Applications](#included-applications)
- [Changelog](#changelog)
- [License](#license)

---

## Features

| Feature | v1.x (Original) | v2.x (Current) |
|---|---|---|
| Proportional / Integral / Derivative control | ✅ | ✅ |
| Configurable gains (k_p, k_i, k_d) | ✅ | ✅ |
| Individual P, I, D getters | ✅ | ✅ |
| Input validation (type checks) | ✅ | ✅ |
| Fixed `dt` at construction | ✅ | ✅ (fallback only) |
| Dynamic `dt` via real timestamps | ❌ | ✅ |
| Anti-windup (integral clamping) | ❌ | ✅ |
| Output clamping (min/max) | ❌ | ✅ |
| Deadband support | ❌ | ✅ |
| Derivative on measurement (no kick) | ❌ | ✅ |
| `setTarget()` resets integral state | ❌ | ✅ |
| `reset()` method | ❌ | ✅ |
| `updateGains()` runtime tuning | ❌ | ✅ |
| Manual / Auto mode | ❌ | ✅ |
| Bumpless manual → auto transfer | ❌ | ✅ |
| `getStatus()` telemetry snapshot | ❌ | ✅ |
| EventEmitter (`update`, `settled`) | ❌ | ✅ |

---

## Installation

```bash
npm install simple-pid-controller
```

---

## Quick Start

```js
const PIDController = require('simple-pid-controller');

const controller = new PIDController(1.2, 1.0, 0.01, 1.0, {
  outputMin: -10,
  outputMax:  10,
  integralMin: -50,
  integralMax:  50,
  deadband: 0.02,
  settledTolerance: 0.05,
});

controller.setTarget(100);

controller.on('update', (status) => console.log(status));
controller.on('settled', (status) => console.log('Settled!', status));

setInterval(() => {
  const pv = readSensor(); // replace with your actual sensor read
  controller.update(pv);
}, 1000);
```

---

## API Reference

### Constructor

```js
new PIDController(k_p, k_i, k_d, dt, options)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `k_p` | number | `1.0` | Proportional gain |
| `k_i` | number | `0.0` | Integral gain |
| `k_d` | number | `0.0` | Derivative gain |
| `dt` | number | `1.0` | Fallback time interval in seconds (overridden by dynamic timestamps) |
| `options` | object | `{}` | Configuration object — see [Options Reference](#options-reference) |

---

### Methods

#### `setTarget(target)`
Sets the controller setpoint (SV). Also resets the integral accumulator, derivative memory, and settled flag to prevent carryover from the previous setpoint.

```js
controller.setTarget(100);
```

---

#### `update(currentValue)`
Runs one PID cycle with the given process variable (PV). Computes the true elapsed `dt` from the last call using `Date.now()`, applies deadband, anti-windup, output clamping, and fires `update` / `settled` events.

Returns the clamped controller output as a `number`.

```js
const output = controller.update(pv);
```

In `manual` mode, returns the manually set output without any computation.

---

#### `updateGains(k_p, k_i, k_d)`
Updates PID gains at runtime without recreating the controller instance. Integral and derivative state are preserved — call `reset()` first if a clean start is needed.

```js
controller.updateGains(2.0, 0.5, 0.05);
```

---

#### `setMode(mode)`
Switches between `'auto'` (PID active) and `'manual'` (fixed output) modes.

When switching `manual → auto`, a **bumpless transfer** is performed: the integral term is pre-loaded so the first auto output matches the last manual output, preventing sudden actuator jumps.

```js
controller.setMode('manual');
controller.setMode('auto');  // bumpless transfer applied automatically
```

---

#### `setManualOutput(value)`
Sets the fixed output value used in `'manual'` mode. Also seeds the bumpless transfer when switching back to `'auto'`.

```js
controller.setManualOutput(5.0);
```

---

#### `reset()`
Clears all internal state: integral accumulator, derivative memory, PV history, and timestamp. Call after fault recovery, process restarts, or when switching modes.

```js
controller.reset();
```

---

#### `getStatus()`
Returns a plain object snapshot of the current controller state. Suitable for direct publishing to MQTT, InfluxDB, or a SCADA dashboard.

```js
const status = controller.getStatus();
// {
//   sv: 100,
//   pv: 97.4,
//   error: 2.6,
//   p: 3.12,
//   i: 0.44,
//   d: -0.02,
//   output: 3.54,
//   mode: 'auto'
// }
```

---

### Properties (Getters)

These read-only getters reflect values from the most recent `update()` cycle.

| Property | Description |
|---|---|
| `controller.p` | Current proportional term: `k_p × error` |
| `controller.i` | Current integral term: `k_i × sumError` |
| `controller.d` | Current derivative term: `k_d × (-dPV/dt)` (derivative on measurement) |

> **Note on Derivative:** The D term uses *derivative on measurement* (`-dPV/dt`) rather than `d(error)/dt`. This prevents a derivative spike (kick) when the setpoint changes suddenly.

---

### Events

The controller extends Node.js `EventEmitter`.

#### `'update'`
Fired every `update()` cycle (in `auto` mode). Passes the `getStatus()` snapshot as the argument.

```js
controller.on('update', (status) => {
  mqttClient.publish('pid/status', JSON.stringify(status));
});
```

#### `'settled'`
Fired **once** when `|error| <= settledTolerance`. Re-arms automatically if the process drifts outside tolerance again. Only active when `settledTolerance > 0`.

```js
controller.on('settled', (status) => {
  console.log('Process reached setpoint.', status);
});
```

---

## Options Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `outputMin` | number | `-Infinity` | Minimum clamped controller output |
| `outputMax` | number | `Infinity` | Maximum clamped controller output |
| `integralMin` | number | `-Infinity` | Anti-windup: lower bound on integral accumulator |
| `integralMax` | number | `Infinity` | Anti-windup: upper bound on integral accumulator |
| `deadband` | number | `0` | If `|error| <= deadband`, output is forced to `0` (disabled when `0`) |
| `settledTolerance` | number | `0` | Threshold for `'settled'` event emission (disabled when `0`) |

---

## Examples

### Basic Usage

```js
const PIDController = require('simple-pid-controller');

const controller = new PIDController(1.0, 0.0, 0.0);
controller.setTarget(50);

setInterval(() => {
  const pv = readSensor();
  const output = controller.update(pv);
  applyOutput(output);
}, 1000);
```

---

### With Anti-windup and Output Clamping

```js
const PIDController = require('simple-pid-controller');

const controller = new PIDController(1.2, 1.0, 0.01, 1.0, {
  outputMin:   -100,
  outputMax:    100,
  integralMin: -500,
  integralMax:  500,
  deadband:     0.5,
});

controller.setTarget(75);

controller.on('update', (status) => {
  console.log(JSON.stringify(status));
});

setInterval(() => controller.update(readSensor()), 1000);
```

---

### Manual / Auto Mode with Bumpless Transfer

```js
const PIDController = require('simple-pid-controller');

const controller = new PIDController(1.2, 1.0, 0.01);
controller.setTarget(100);

// Place controller in manual mode with a fixed output
controller.setManualOutput(30);
controller.setMode('manual');

// Later, transfer to auto — integral is pre-loaded to match output of 30
// so the actuator does not jump
setTimeout(() => {
  controller.setMode('auto');
}, 5000);

setInterval(() => controller.update(readSensor()), 1000);
```

---

### Runtime Gain Tuning

```js
const PIDController = require('simple-pid-controller');

const controller = new PIDController(1.0, 0.5, 0.01);
controller.setTarget(80);

// Tune gains live without stopping the control loop
setTimeout(() => {
  controller.updateGains(1.5, 0.8, 0.02);
  console.log('Gains updated');
}, 10000);

setInterval(() => controller.update(readSensor()), 1000);
```

---

### MQTT Integration

See [`mqtt-pid.js`](./mqtt-pid.js) for a full working example.

```js
const PIDController = require('simple-pid-controller');
const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost');
const controller = new PIDController(1.2, 1.0, 0.01, 1.0, {
  outputMin: -10, outputMax: 10,
  integralMin: -100, integralMax: 100,
  deadband: 0.02, settledTolerance: 0.05,
});

// Publish full telemetry on every cycle
controller.on('update', (status) => {
  client.publish('pid/status', JSON.stringify(status));
});

// Publish settled notification and stop loop
controller.on('settled', (status) => {
  client.publish('pid/settled', JSON.stringify(status));
});

// Remote gain tuning via MQTT
client.on('message', (topic, message) => {
  if (topic === 'gains') {
    const g = JSON.parse(message.toString());
    controller.updateGains(g.k_p, g.k_i, g.k_d);
  }
  if (topic === 'sv') {
    controller.setTarget(parseFloat(message.toString()));
  }
});
```

---

## Included Applications

| File | Description |
|---|---|
| [`tolerance.js`](./tolerance.js) | Interactive CLI demo — enter SV and PV, watch the controller converge |
| [`mqtt-pid.js`](./mqtt-pid.js) | Full MQTT integration — subscribe to SV/PV topics, publish telemetry, support remote gain tuning and mode switching |
| [`sample-application-template.js`](./sample-application-template.js) | Minimal boilerplate for building your own application on top of this library |

---

## Changelog

### v2.0.0 — 2026-03-12

#### Core Library (`index.js`)

**Bug Fixes**
- **Fixed derivative term calculation** — Original formula `k_d * (target - lastError) / dt` was incorrect. Now uses *derivative on measurement*: `k_d * (-dPV/dt)`, which correctly measures rate of change and eliminates derivative kick on setpoint steps.
- **`setTarget()` now resets controller state** — Previously, the integral accumulator (`sumError`) and `lastError` persisted across setpoint changes, causing integral carryover and derivative spikes. Both are now cleared on every `setTarget()` call.
- **Dynamic `dt` via timestamps** — `dt` is no longer assumed to be the fixed constructor value. Each `update()` call computes actual elapsed time using `Date.now()`, making the controller accurate under irregular loop timing.

**New Features**
- **Anti-windup** — `integralMin` / `integralMax` options clamp the integral accumulator to prevent runaway windup during actuator saturation.
- **Output clamping** — `outputMin` / `outputMax` options clamp the final controller output, replacing the ad-hoc clamping that was done externally in `tolerance.js` and `mqtt-pid.js`.
- **Deadband** — `deadband` option forces output to `0` when `|error| <= deadband`, reducing unnecessary actuator activity near the setpoint.
- **`reset()` method** — Clears integral, derivative state, PV history, timestamp, and settled flag. Use after fault recovery or process restarts.
- **`updateGains(k_p, k_i, k_d)`** — Update PID gains at runtime without recreating the controller instance.
- **Manual / Auto mode (`setMode()`)** — Switch between PID-controlled and fixed-output modes.
- **`setManualOutput(value)`** — Set the fixed output value for manual mode.
- **Bumpless transfer** — When switching `manual → auto`, the integral term is pre-loaded to match the last manual output, preventing sudden actuator jumps.
- **`getStatus()`** — Returns a plain `{ sv, pv, error, p, i, d, output, mode }` object for telemetry publishing.
- **EventEmitter** — Class now extends `EventEmitter` and emits:
  - `'update'` — on every `update()` cycle with the full status snapshot
  - `'settled'` — once when `|error| <= settledTolerance`; re-arms if process drifts back out

#### Applications

**`tolerance.js`**
- Removed manual `if (Math.abs(pv - sv) <= tolerance)` check; replaced with `controller.on('settled', ...)` event listener
- Added `controller.on('update', ...)` for structured JSON telemetry output including `error`, `output`, and `mode` fields
- Constructor updated to use `options` object (`outputMin/Max`, `integralMin/Max`, `deadband`, `settledTolerance`)
- Output from `update()` used directly — no external clamping needed

**`mqtt-pid.js`**
- Constructor updated to use `options` object
- Replaced inline `console.log` in interval with `controller.on('update', ...)` publishing to `pid/status` MQTT topic
- `'settled'` event stops the interval and publishes to `pid/settled` MQTT topic
- Added `gains` topic handler — accepts `{ k_p, k_i, k_d }` JSON for remote gain tuning via `updateGains()`
- Added `mode` topic handler — accepts `'auto'` or `'manual'` string via `setMode()`
- Added `manual_output` topic handler — accepts numeric string via `setManualOutput()`
- `setTarget(sv)` on SV message resets integral and derivative state
- `process.on('exit')` calls `controller.reset()` and `client.end()` for clean shutdown

**`sample-application-template.js`**
- Updated to use full `options` object in constructor
- Added `controller.on('update', ...)` and `controller.on('settled', ...)` with inline comments showing MQTT/InfluxDB/OPC UA integration points
- Telemetry logging moved from inside the loop body to the `update` event listener
- Stub functions `readCurrentProcessValue()` and `sendControlSignalToActuator()` documented with PLC/sensor code examples
- Commented-out blocks for `setMode()`, `updateGains()`, and `reset()` show full API surface without cluttering the active loop
- `process.on('exit')` calls both `clearInterval` and `controller.reset()`

---

### v1.0.0 — 2023

- Initial release
- Basic PID controller with configurable `k_p`, `k_i`, `k_d`, and `dt`
- `setTarget(target)` to set the desired setpoint
- `update(currentValue)` to compute and return the controller output
- Read-only getters for individual `p`, `i`, `d` components
- Type validation in constructor, `setTarget()`, and `update()`
- `tolerance.js` — interactive CLI demo with manual tolerance check
- `mqtt-pid.js` — MQTT integration subscribing to `sv` and `pv` topics
- `sample-application-template.js` — minimal boilerplate for custom applications

---

## License

Copyright 2023–2026, Harshad Joshi and Bufferstack.IO Analytics Technology LLP, Pune.

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) for full terms.
