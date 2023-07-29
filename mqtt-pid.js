/***

mqtt-pid,js Copyright 2023, Harshad Joshi and Bufferstack.IO Analytics Technology LLP. Pune

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

const PIDController = require('simple-pid-controller');
const mqtt = require('mqtt');

const client  = mqtt.connect('mqtt://localhost'); // Add your MQTT broker URL

let sv, pv;

client.on('connect', () => {
    client.subscribe('sv'); // Replace with your topic name
    client.subscribe('pv'); // Replace with your topic name
});

// Create a PID controller
const controller = new PIDController(1.2, 1, 0.01);

// Define a tolerance
const tolerance = 0.05;

let intervalId;

const startControlLoop = () => {
    if (typeof sv !== 'number' || typeof pv !== 'number') {
    //    console.log('Waiting for valid SV and PV values...');
        return;
    }

    // If the interval is already running, clear it
    if (intervalId) {
        clearInterval(intervalId);
    }

    intervalId = setInterval(() => {
        // If PV is within tolerance of SV, stop the control loop
        if (Math.abs(pv - sv) <= tolerance) {
      //      console.log('Process variable is within tolerance of set value. Stopping...');
            clearInterval(intervalId);
            intervalId = null;
        } else {
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
        }
    }, 1000);
};

client.on('message', (topic, message) => {
    switch (topic) {
        case 'sv':
            sv = parseFloat(message.toString());
            if (!isNaN(sv)) {
                controller.setTarget(sv);
                startControlLoop(); // Start the control loop whenever SV changes
            }
            break;
        case 'pv':
            pv = parseFloat(message.toString());
            if (!isNaN(pv)) {
                startControlLoop(); // Start the control loop whenever PV changes
            }
            break;
        default:
            console.log('No handler for topic %s', topic);
            return;
    }
});

