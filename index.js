/***

simple-pid-controller/index.js Copyright 2023, Harshad Joshi and Bufferstack.IO Analytics Technology LLP. Pune

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

const EventEmitter = require('events');

/**
 * PIDController — A feature-complete industrial-grade PID controller.
 *
 * Features:
 *  - Proportional, Integral, and Derivative control terms
 *  - Derivative on measurement (eliminates derivative kick on setpoint change)
 *  - Anti-windup via integral clamping
 *  - Output clamping (min/max)
 *  - Deadband support (suppresses output for negligible errors)
 *  - Dynamic dt using real timestamps
 *  - Manual / Auto mode with bumpless transfer
 *  - Runtime gain update via updateGains()
 *  - setTarget() resets integral and derivative state
 *  - getStatus() for telemetry / MQTT / InfluxDB publishing
 *  - EventEmitter: emits 'update' on every cycle, 'settled' when within tolerance
 *
 * Extends: EventEmitter
 */
class PIDController extends EventEmitter {

  /**
   * Construct a PID Controller.
   *
   * @param {number} [k_p=1.0]         - Proportional gain.
   * @param {number} [k_i=0.0]         - Integral gain.
   * @param {number} [k_d=0.0]         - Derivative gain.
   * @param {number} [dt=1.0]          - Default time interval (seconds). Overridden dynamically if timestamps are used.
   * @param {Object} [options={}]      - Optional configuration object.
   * @param {number} [options.outputMin=-Infinity]    - Minimum clamp for controller output.
   * @param {number} [options.outputMax=Infinity]     - Maximum clamp for controller output.
   * @param {number} [options.integralMin=-Infinity]  - Minimum clamp for integral accumulator (anti-windup).
   * @param {number} [options.integralMax=Infinity]   - Maximum clamp for integral accumulator (anti-windup).
   * @param {number} [options.deadband=0]             - Error deadband; output is zero if |error| <= deadband.
   * @param {number} [options.settledTolerance=0]     - Tolerance within which the 'settled' event is emitted (0 = disabled).
   */
  constructor(k_p = 1.0, k_i = 0.0, k_d = 0.0, dt = 1.0, options = {}) {
    super(); // Initialise EventEmitter

    if (
      typeof k_p !== 'number' ||
      typeof k_i !== 'number' ||
      typeof k_d !== 'number' ||
      typeof dt  !== 'number'
    ) {
      throw new Error('PID Controller constructor parameters (k_p, k_i, k_d, dt) must all be numbers');
    }

    // ── Gains ─────────────────────────────────────────────────────────────────
    this.k_p = k_p;
    this.k_i = k_i;
    this.k_d = k_d;
    this.dt  = dt;   // Used as fallback when dynamic timestamps are unavailable

    // ── Setpoint and process variable ─────────────────────────────────────────
    this.target       = 0;
    this.currentValue = 0;

    // ── Internal state ────────────────────────────────────────────────────────
    this.sumError     = 0;   // Accumulated integral error
    this.lastError    = 0;   // Previous cycle error (kept for compatibility)
    this._lastPV      = 0;   // Previous PV used for derivative-on-measurement
    this._currentError = 0;  // Current error, stored so getters can read it

    // ── Output and integral clamping ──────────────────────────────────────────
    this.outputMin    = options.outputMin    !== undefined ? options.outputMin    : -Infinity;
    this.outputMax    = options.outputMax    !== undefined ? options.outputMax    :  Infinity;
    this.integralMin  = options.integralMin  !== undefined ? options.integralMin  : -Infinity;
    this.integralMax  = options.integralMax  !== undefined ? options.integralMax  :  Infinity;

    // ── Deadband ──────────────────────────────────────────────────────────────
    // If |error| <= deadband the output is forced to zero to prevent
    // unnecessary actuator chatter (useful for valves, nutrunners, motors).
    this.deadband = options.deadband !== undefined ? options.deadband : 0;

    // ── Settled tolerance ─────────────────────────────────────────────────────
    // When set > 0, the controller emits a 'settled' event once |error| falls
    // within this tolerance. Set to 0 to disable.
    this.settledTolerance = options.settledTolerance !== undefined ? options.settledTolerance : 0;
    this._settled = false; // Internal flag to emit 'settled' only once per approach

    // ── Manual / Auto mode ────────────────────────────────────────────────────
    // In 'manual' mode, update() returns the manually set output value unchanged.
    // Switching back to 'auto' performs a bumpless transfer by pre-loading the
    // integral term so the first auto output matches the last manual output.
    this.mode         = 'auto';   // 'auto' | 'manual'
    this._manualOutput = 0;       // Holds output value during manual mode

    // ── Dynamic timestamp tracking ────────────────────────────────────────────
    // Stores Date.now() from the last update() call.
    // Allows accurate dt calculation even with irregular loop intervals.
    this._lastTimestamp = null;

    // Register computed getters for p, i, d
    this._defineGetters();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Private: Getters for individual PID components
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Define read-only getters for the P, I, and D terms.
   * These reflect the values computed during the most recent update() call.
   *
   * Note on Derivative:
   *   We use "derivative on measurement" — d/dt(-PV) instead of d/dt(error).
   *   This prevents a sudden spike (derivative kick) when the setpoint changes.
   * @private
   */
  _defineGetters() {
    // Proportional term: proportional to current error
    Object.defineProperty(this, 'p', {
      get: function () {
        return this.k_p * this._currentError;
      },
      configurable: true,
    });

    // Integral term: proportional to accumulated error over time (anti-windup clamped)
    Object.defineProperty(this, 'i', {
      get: function () {
        return this.k_i * this.sumError;
      },
      configurable: true,
    });

    // Derivative term: based on rate of change of the *process variable* (not error)
    // Using -d(PV)/dt avoids derivative kick when setpoint steps change.
    Object.defineProperty(this, 'd', {
      get: function () {
        return this.k_d * this._dPV;
      },
      configurable: true,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Public API
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Set a new target (setpoint) for the controller.
   *
   * Also resets the integral accumulator and derivative state to prevent
   * windup carry-over and derivative kick when the setpoint changes.
   *
   * @param {number} target - The desired setpoint value.
   */
  setTarget(target) {
    if (typeof target !== 'number') {
      throw new Error('Target must be a number');
    }
    this.target = target;

    // Reset integral and derivative state on setpoint change
    this.sumError      = 0;
    this.lastError     = 0;
    this._currentError = 0;
    this._dPV          = 0;
    this._settled      = false; // Allow 'settled' event to fire again for new setpoint
  }

  /**
   * Update the controller with the latest process variable reading.
   *
   * Behaviour:
   *  - In 'manual' mode: returns the manual output without any PID computation.
   *  - In 'auto' mode: computes P + I + D, applies deadband, clamps output,
   *    emits 'update' event with full status, and emits 'settled' if within tolerance.
   *
   * @param {number} currentValue - The current process variable (PV) reading.
   * @returns {number} The controller output (clamped to [outputMin, outputMax]).
   */
  update(currentValue) {
    if (typeof currentValue !== 'number') {
      throw new Error('Current value must be a number');
    }

    // ── Manual mode: bypass PID, return manual output directly ────────────────
    if (this.mode === 'manual') {
      return this._manualOutput;
    }

    // ── Compute dynamic dt using real elapsed time ─────────────────────────────
    const now = Date.now();
    let dt = this.dt; // fallback to constructor dt
    if (this._lastTimestamp !== null) {
      const elapsed = (now - this._lastTimestamp) / 1000; // convert ms → seconds
      if (elapsed > 0) dt = elapsed;
    }
    this._lastTimestamp = now;

    this.currentValue = currentValue;

    // ── Compute error ──────────────────────────────────────────────────────────
    const error = this.target - this.currentValue;
    this._currentError = error;

    // ── Deadband check ─────────────────────────────────────────────────────────
    // Suppress all output if error is within the deadband threshold.
    // Prevents unnecessary actuator activity for negligible deviations.
    if (this.deadband > 0 && Math.abs(error) <= this.deadband) {
      this._dPV = 0;
      const status = this.getStatus();
      this.emit('update', status);
      return 0;
    }

    // ── Integral term with anti-windup clamping ────────────────────────────────
    // Accumulate error * dt; clamp between integralMin and integralMax to
    // prevent runaway windup when the actuator is saturated.
    this.sumError += error * dt;
    this.sumError  = Math.max(this.integralMin, Math.min(this.integralMax, this.sumError));

    // ── Derivative on measurement ──────────────────────────────────────────────
    // Compute -(dPV/dt) rather than d(error)/dt.
    // This eliminates the derivative kick that occurs on step setpoint changes.
    this._dPV = -(this.currentValue - this._lastPV) / dt;
    this._lastPV = this.currentValue;

    // Store lastError for backward compatibility (e.g. external callers reading it)
    this.lastError = error;

    // ── Compute PID output ─────────────────────────────────────────────────────
    const rawOutput = this.p + this.i + this.d;

    // ── Clamp output to configured limits ─────────────────────────────────────
    const output = Math.max(this.outputMin, Math.min(this.outputMax, rawOutput));

    // ── Emit 'update' event with full telemetry snapshot ──────────────────────
    const status = this.getStatus();
    this.emit('update', status);

    // ── Emit 'settled' event when PV is within tolerance of SV ────────────────
    if (this.settledTolerance > 0 && !this._settled && Math.abs(error) <= this.settledTolerance) {
      this._settled = true;
      this.emit('settled', status);
    } else if (Math.abs(error) > this.settledTolerance) {
      this._settled = false; // Reset flag if process drifts out of tolerance again
    }

    return output;
  }

  /**
   * Update PID gains at runtime without recreating the controller instance.
   *
   * Useful for adaptive control, remote tuning via MQTT, or commissioning.
   * Does NOT reset integral or derivative state — use reset() if needed.
   *
   * @param {number} k_p - New proportional gain.
   * @param {number} k_i - New integral gain.
   * @param {number} k_d - New derivative gain.
   */
  updateGains(k_p, k_i, k_d) {
    if (typeof k_p !== 'number' || typeof k_i !== 'number' || typeof k_d !== 'number') {
      throw new Error('updateGains: k_p, k_i, and k_d must all be numbers');
    }
    this.k_p = k_p;
    this.k_i = k_i;
    this.k_d = k_d;
  }

  /**
   * Reset the controller's internal state.
   *
   * Clears the integral accumulator, derivative memory, and timestamp.
   * Call this after mode switches, fault recovery, or process restarts.
   */
  reset() {
    this.sumError       = 0;
    this.lastError      = 0;
    this._currentError  = 0;
    this._dPV           = 0;
    this._lastPV        = 0;
    this._lastTimestamp = null;
    this._settled       = false;
  }

  /**
   * Switch the controller between 'auto' and 'manual' modes.
   *
   * Bumpless transfer to auto:
   *   When switching from manual → auto, the integral term is pre-loaded
   *   so that the first auto output equals the last manual output, avoiding
   *   sudden actuator steps. This is standard practice in DCS/SCADA systems.
   *
   * @param {string} mode - 'auto' or 'manual'
   */
  setMode(mode) {
    if (mode !== 'auto' && mode !== 'manual') {
      throw new Error("setMode: mode must be 'auto' or 'manual'");
    }

    if (mode === 'auto' && this.mode === 'manual') {
      // Bumpless transfer: initialise integral so P+I+D = last manual output
      // Assuming P and D are ~0 at the moment of transfer, set sumError accordingly.
      if (this.k_i !== 0) {
        this.sumError = this._manualOutput / this.k_i;
      }
      this._lastTimestamp = null; // Reset timestamp to avoid a large first dt
    }

    this.mode = mode;
  }

  /**
   * Set the manual output value.
   *
   * Only takes effect when the controller is in 'manual' mode.
   * This value is also used as the bumpless transfer seed when switching to 'auto'.
   *
   * @param {number} value - The desired manual output value.
   */
  setManualOutput(value) {
    if (typeof value !== 'number') {
      throw new Error('setManualOutput: value must be a number');
    }
    this._manualOutput = value;
  }

  /**
   * Return a plain status snapshot of the controller.
   *
   * Suitable for direct publishing to MQTT, InfluxDB, or a SCADA dashboard.
   *
   * @returns {Object} Status object with sv, pv, error, p, i, d, output, mode.
   */
  getStatus() {
    const rawOutput = this.mode === 'manual'
      ? this._manualOutput
      : this.p + this.i + this.d;

    const output = Math.max(this.outputMin, Math.min(this.outputMax, rawOutput));

    return {
      sv:     this.target,
      pv:     this.currentValue,
      error:  this._currentError,
      p:      this.p,
      i:      this.i,
      d:      this.d,
      output: output,
      mode:   this.mode,
    };
  }
}

module.exports = PIDController;
