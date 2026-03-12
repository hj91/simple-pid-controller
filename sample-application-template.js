/***

simple-pid-controller/sample-application-template.js Copyright 2023, Harshad Joshi and Bufferstack.IO Analytics Technology LLP. Pune

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

// ── PID Controller Configuration ───────────────────────────────────────────────
// Tune k_p, k_i, k_d to suit your specific process.
// Use the options object to configure safety limits and operational behaviour.
const k_p = 1.0;   // Proportional gain — controls how aggressively to react to error
const k_i = 0.0;   // Integral gain     — eliminates steady-state error over time
const k_d = 0.0;   // Derivative gain   — dampens overshoot by reacting to rate of change
const dt   = 1.0;  // Fallback time interval (seconds) — overridden by dynamic timestamps

// ── Instantiate the controller ─────────────────────────────────────────────────
// options lets you configure clamping, deadband, and event behaviour at creation time.
const controller = new PIDController(k_p, k_i, k_d, dt, {
  outputMin:        -100,   // Minimum output sent to the actuator (e.g. -100% speed)
  outputMax:         100,   // Maximum output sent to the actuator (e.g. +100% speed)
  integralMin:      -500,   // Anti-windup: clamp integral accumulator lower bound
  integralMax:       500,   // Anti-windup: clamp integral accumulator upper bound
  deadband:          0.0,   // Set > 0 to suppress output when error is negligible
  settledTolerance:  0.0,   // Set > 0 to receive a 'settled' event when PV ≈ SV
});

// ── Set the initial target (Setpoint) ─────────────────────────────────────────
controller.setTarget(100); // Replace with your desired process setpoint

// ── Subscribe to controller events ────────────────────────────────────────────

// 'update' fires every cycle — use getStatus() for structured telemetry
controller.on('update', (status) => {
  // Replace with your telemetry sink: MQTT publish, InfluxDB write, dashboard emit, etc.
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

// 'settled' fires once when |error| <= settledTolerance (if configured above)
controller.on('settled', (status) => {
  console.log('Process settled at setpoint:', JSON.stringify(status));
  // Replace with your on-settled action: stop actuator, trigger next recipe step, etc.
});

// ── Control loop ───────────────────────────────────────────────────────────────
// Runs at the interval you configure. update() automatically computes the true
// elapsed dt using timestamps, so timing jitter does not affect accuracy.
const loopIntervalMs = dt * 1000; // Adjust for your process (e.g. 100ms for fast loops)

const intervalId = setInterval(() => {

  // ── Step 1: Read current process variable (PV) ──────────────────────────────
  // Replace with your actual sensor/PLC read.
  // Examples:
  //   const currentValue = await plcClient.readRegister('D100');
  //   const currentValue = sensor.read();
  const currentValue = readCurrentProcessValue();

  // ── Step 2: Run the PID update ───────────────────────────────────────────────
  // Returns the clamped controller output. Also fires 'update' and 'settled' events.
  const controlOutput = controller.update(currentValue);

  // ── Step 3: Send output to actuator ──────────────────────────────────────────
  // Replace with your actual actuator command.
  // Examples:
  //   motor.setSpeed(controlOutput);
  //   plcClient.writeRegister('D200', controlOutput);
  sendControlSignalToActuator(controlOutput);

}, loopIntervalMs);

// ── Runtime mode switching (optional) ─────────────────────────────────────────
// Uncomment to switch to manual mode and set a fixed output:
//   controller.setManualOutput(50);
//   controller.setMode('manual');
// Switch back to auto with bumpless transfer:
//   controller.setMode('auto');

// ── Runtime gain tuning (optional) ────────────────────────────────────────────
// Gains can be updated live without restarting the controller:
//   controller.updateGains(2.0, 0.5, 0.05);

// ── Manual reset (optional) ───────────────────────────────────────────────────
// Clears integral, derivative state, and timestamps. Use after fault recovery:
//   controller.reset();

// ── Replace these stubs with your actual I/O implementations ──────────────────

/**
 * Read the current process variable from your sensor or PLC.
 * @returns {number} Current PV reading.
 */
function readCurrentProcessValue() {
  // Example: return sensor.readValue();
  // Example: return plcClient.readD(100);
  return 0; // Replace with real implementation
}

/**
 * Send the computed control output to your actuator.
 * @param {number} controlOutput - Clamped PID output value.
 */
function sendControlSignalToActuator(controlOutput) {
  // Example: motor.setSpeed(controlOutput);
  // Example: plcClient.writeD(200, controlOutput);
}

// ── Cleanup on exit ────────────────────────────────────────────────────────────
process.on('exit', () => {
  clearInterval(intervalId);
  controller.reset();
  // Add any additional cleanup: close PLC connections, stop actuators, etc.
});
