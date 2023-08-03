/***

simple-pid-controller/sample-application-template.js  Copyright 2023, Harshad Joshi and Bufferstack.IO Analytics Technology LLP. Pune

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


const PIDController = require('./simple-pid-controller');

// PID Controller Configuration
const k_p = 1.0; // Proportional gain
const k_i = 0.0; // Integral gain
const k_d = 0.0; // Derivative gain
const dt = 1.0;  // Time interval between updates (in seconds)

// Create a PID controller instance
const controller = new PIDController(k_p, k_i, k_d, dt);

// Set the initial target value (Setpoint)
controller.setTarget(100); // Example target value

// Control Loop Function
const controlLoop = () => {
  // Read the current process variable (PV) from your actual process (e.g., sensor reading)
  const currentValue = readCurrentProcessValue();

  // Update the PID controller with the current value and get the control output
  const controlOutput = controller.update(currentValue);

  // Send the control output to the actuator controlling your process
  sendControlSignalToActuator(controlOutput);

  // Optionally log or display data for debugging, tuning, or user interface purposes
  console.log(`Current Value: ${currentValue}, Control Output: ${controlOutput}`);
};

// Start the Control Loop
// Adjust the interval as needed for your process's specific requirements
const intervalId = setInterval(controlLoop, dt * 1000);

// Define functions to read the process value and send control signals
function readCurrentProcessValue() {
  // Replace with the code to read the current process variable (PV) from your process
  // Example: return sensor.readValue();
}

function sendControlSignalToActuator(controlOutput) {
  // Replace with the code to send the control signal to the appropriate actuator in your process
  // Example: motor.setSpeed(controlOutput);
}

// Optional Cleanup on Exit
// Include any necessary cleanup for your process when the application exits
process.on('exit', () => {
  clearInterval(intervalId);
  // Additional cleanup code, such as turning off actuators, closing connections, etc.
});

