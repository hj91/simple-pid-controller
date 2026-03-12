/***

tolerance.js Copyright 2023, Harshad Joshi and Bufferstack.IO Analytics Technology LLP. Pune

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
const readline      = require('readline');

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

rl.question('Enter set value (SV): ', (svInput) => {
  rl.question('Enter process variable (PV): ', (pvInput) => {

    // Parse user inputs
    const sv = parseFloat(svInput);
    let   pv = parseFloat(pvInput);

    if (isNaN(sv) || isNaN(pv)) {
      console.error('Invalid input. Please enter numbers only.');
      process.exit(1);
    }

    // ── Controller setup ──────────────────────────────────────────────────────
    // Anti-windup: integral clamped to ±50
    // Output clamped to ±10 so the simulated effort stays bounded
    // Deadband of 0.02 suppresses actuator chatter near the setpoint
    // settledTolerance matches the manual tolerance check below (0.05)
    const controller = new PIDController(1.2, 1, 0.01, 1.0, {
      outputMin:        -10,
      outputMax:         10,
      integralMin:      -50,
      integralMax:       50,
      deadband:          0.02,
      settledTolerance:  0.05,
    });

    // Set the target setpoint
    controller.setTarget(sv);

    // ── Event: 'settled' ──────────────────────────────────────────────────────
    // Fired automatically by the controller when |error| <= settledTolerance.
    // Clears the interval and exits cleanly.
    controller.on('settled', (status) => {
      console.log('\nProcess settled within tolerance:', JSON.stringify(status, null, 2));
      clearInterval(intervalId);
      rl.close();
    });

    // ── Event: 'update' ───────────────────────────────────────────────────────
    // Fired every cycle; use getStatus() snapshot for structured telemetry output.
    controller.on('update', (status) => {
      console.log(JSON.stringify({
        sv:     status.sv,
        pv:     parseFloat(status.pv.toFixed(2)),
        error:  parseFloat(status.error.toFixed(4)),
        p:      parseFloat(status.p.toFixed(4)),
        i:      parseFloat(status.i.toFixed(4)),
        d:      parseFloat(status.d.toFixed(4)),
        output: parseFloat(status.output.toFixed(4)),
        mode:   status.mode,
      }));
    });

    // ── Control loop ──────────────────────────────────────────────────────────
    // Simulates a process that updates every second.
    // The maxEffectPerSecond cap prevents the simulated PV from jumping
    // unrealistically — mirrors physical actuator slew-rate limits.
    const maxEffectPerSecond = 0.1;

    const intervalId = setInterval(() => {
      const output = controller.update(pv);

      // Apply clamped effort to simulated process variable
      pv += Math.max(-maxEffectPerSecond, Math.min(maxEffectPerSecond, output));
    }, 1000);

    rl.close();
  });
});

// ── Cleanup on exit ───────────────────────────────────────────────────────────
process.on('exit', () => {
  controller && controller.reset();
});
