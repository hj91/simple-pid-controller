/***

simple-pid-controller/index.js  Copyright 2023, Harshad Joshi and Bufferstack.IO Analytics Technology LLP. Pune

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

/**
 * PID Controller.
 */
class PIDController {
  /**
   * Construct a PID Controller.
   *
   * @param {number} [k_p=1.0] - Proportional gain.
   * @param {number} [k_i=0.0] - Integral gain.
   * @param {number} [k_d=0.0] - Derivative gain.
   * @param {number} [dt=1.0] - Time interval between updates.
   */
  constructor(k_p = 1.0, k_i = 0.0, k_d = 0.0, dt = 1.0) {
    if (typeof k_p !== 'number' || typeof k_i !== 'number' || typeof k_d !== 'number' || typeof dt !== 'number') {
      throw new Error('PID Controller constructor parameters must all be numbers');
    }

    this.k_p = k_p;
    this.k_i = k_i;
    this.k_d = k_d;
    this.dt = dt;

    this.target = 0;
    this.currentValue = 0;
    this.sumError = 0;
    this.lastError = 0;

    // Define getters for P, I, and D values
    this.defineGetters();
  }

  /**
   * Define getters for P, I, and D components.
   */
  defineGetters() {
    Object.defineProperty(this, 'p', {
      get: function() {
        return this.k_p * (this.target - this.currentValue);
      }
    });

    Object.defineProperty(this, 'i', {
      get: function() {
        return this.k_i * this.sumError;
      }
    });

    Object.defineProperty(this, 'd', {
      get: function() {
        return this.k_d * (this.target - this.lastError) / this.dt;
      }
    });
  }

  /**
   * Set a new target for the controller.
   *
   * @param {number} target - New target value.
   */
  setTarget(target) {
    if (typeof target !== 'number') {
      throw new Error('Target must be a number');
    }

    this.target = target;
  }

  /**
   * Update the controller with the current value and calculate control output.
   *
   * @param {number} currentValue - Current process variable value.
   * @return {number} Controller output.
   */
  update(currentValue) {
    if (typeof currentValue !== 'number') {
      throw new Error('Current value must be a number');
    }

    this.currentValue = currentValue;
    const error = this.target - this.currentValue;
    this.sumError += error * this.dt;

    const p = this.p;
    const i = this.i;
    const d = this.d;

    this.lastError = error;

    return p + i + d;
  }
}

module.exports = PIDController;

