/***

tolerance,js Copyright 2023, Harshad Joshi and Bufferstack.IO Analytics Technology LLP. Pune

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

const PIDController = require('./index');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Enter set value (SV): ', (sv) => {
    rl.question('Enter process variable (PV): ', (pv) => {
        // Parse input to numbers
        sv = parseFloat(sv);
        pv = parseFloat(pv);

        if (isNaN(sv) || isNaN(pv)) {
            console.error('Invalid input. Please enter numbers only.');
            process.exit(1);
        }

        // Create a PID controller
        const controller = new PIDController(1.2, 1, 0.01);

        // Set target to SV
        controller.setTarget(sv);

        // Define a tolerance
        const tolerance = 0.05;

        // Simulate a system which updates every second
        const intervalId = setInterval(() => {
            let effort = controller.update(pv);

            // Limit the power value so it doesn't blow up the system
            let maxEffectPerSecond = 0.1; 
            pv += Math.max(-maxEffectPerSecond, Math.min(maxEffectPerSecond, effort));

            // Output SV, PV, and PID values in JSON format
            console.log(JSON.stringify({
                sv: sv,
                pv: pv.toFixed(2),
                p: controller.p.toFixed(2),
                i: controller.i.toFixed(2),
                d: controller.d.toFixed(2)
            }));

            // If PV is within tolerance of SV, stop the control loop
            if (Math.abs(pv - sv) <= tolerance) {
                console.log('Process variable is within tolerance of set value. Stopping...');
                clearInterval(intervalId);
            }
        }, 1000);

        rl.close();
    });
});

