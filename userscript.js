// ==UserScript==
// @name         GeoFS Sky Dolly
// @namespace    https://github.com/tylerbmusic/GeoFS-Sky-Dolly
// @version      0.2
// @description  Adds the functionality of the Sky Dolly MSFS addon. Specifically, the formation mode and logbook. Also adds a camera animator for getting cinematic shots.
// @author       GGamerGGuy
// @match        https://www.geo-fs.com/geofs.php?v=*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// @downloadURL  https://github.com/tylerbmusic/GeoFS-Sky-Dolly/raw/refs/heads/main/userscript.js
// @updateURL    https://github.com/tylerbmusic/GeoFS-Sky-Dolly/raw/refs/heads/main/userscript.js
// ==/UserScript==
(function() {
    //Addon menu code
    if (!window.gmenu || !window.GMenu) {
        fetch(
            "https://raw.githubusercontent.com/tylerbmusic/GeoFS-Addon-Menu/refs/heads/main/addonMenu.js"
        )
            .then((response) => response.text())
            .then((script) => {
            eval(script);
        })
            .then(() => {
            setTimeout(afterGMenu, 101);
        });
    }
    //Code to be executed once the addon menu code is loaded
    async function afterGMenu() {
        window.sd = {};
        const g = new window.GMenu("Sky Dolly", "sd");
        g.addItem("Auto-save: ", "AutoSave", "checkbox", 0, "false");
        g.addItem("Auto-save interval (minutes): ", "STime", "number", 0, "1");

        //UTILITY FUNCTIONS//
        window.sd.msToTime = function(ms) {
            let sec = Math.floor((ms / 1000) % 60);
            if (sec.toString().length < 2) {
                sec = "0" + sec;
            }
            let min = Math.floor((ms / 60000)) % 60;
            let hours = Math.floor((ms / 3600000));
            let ret;
            if (hours == 0) {
                ret = `${min}:${sec}`;
            } else {
                ret = `${hours}:${min}:${sec}`;
            }
            return ret;
        }
        window.sd.getDistance = function(coord1, coord2) {
            const [lat1, lon1] = coord1;
            const [lat2, lon2] = coord2;

            // Convert degrees to radians
            const toRad = deg => deg * (Math.PI / 180);

            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);

            const radLat1 = toRad(lat1);
            const radLat2 = toRad(lat2);

            // Haversine formula to compute angular distance in radians
            const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(radLat1) * Math.cos(radLat2) *
                  Math.sin(dLon / 2) ** 2;

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            // Convert angular distance from radians to degrees
            const distanceInDegrees = c * (180 / Math.PI);
            return distanceInDegrees;
        }
        window.sd.hexToRgb = function(hex) {
            var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        }

        //DATABASE FUNCTIONS//
        window.sd.loadFromDB = function(callback) {
            let request = indexedDB.open("SkyDollyDB", 1);

            request.onupgradeneeded = function(event) {
                let db = event.target.result;
                if (!db.objectStoreNames.contains("sdData")) {
                    db.createObjectStore("sdData", { keyPath: "id" }); // Define keyPath here as well, though autoIncrement might not be needed for reading
                }
            };

            request.onsuccess = function(event) {
                let db = event.target.result;
                // Check if the object store exists before attempting a transaction
                if (db.objectStoreNames.contains("sdData")) {
                    let transaction = db.transaction("sdData", "readonly");
                    let store = transaction.objectStore("sdData");
                    let getRequest = store.get("data");

                    getRequest.onsuccess = function() {
                        callback(getRequest.result ? getRequest.result.value : []);
                    };

                    getRequest.onerror = function(event) {
                        console.error("Error getting data from database:", event.target.error);
                        callback([]); // Call the callback even on error to avoid blocking
                    };

                    transaction.onerror = function(event) {
                        console.error("Transaction error (reading):", event.target.error);
                        callback([]); // Call the callback even on error
                    };
                } else {
                    console.warn("Object store 'sdData' not found. Returning empty data.");
                    callback([]); // Call the callback with empty data if the store doesn't exist
                }
            };

            request.onerror = function(event) {
                console.error("Error opening database:", event.target.error);
                callback([]); // Call the callback even if opening the database fails
            };
        };
        window.sd.saveToDB = function(data) {
            return new Promise((resolve, reject) => {
                let request = indexedDB.open("SkyDollyDB", 1);

                request.onupgradeneeded = function(event) {
                    let db = event.target.result;
                    if (!db.objectStoreNames.contains("sdData")) {
                        db.createObjectStore("sdData", { keyPath: "id", autoIncrement: true });
                    }
                };

                request.onsuccess = function(event) {
                    let db = event.target.result;
                    let transaction = db.transaction("sdData", "readwrite");
                    let store = transaction.objectStore("sdData");
                    const putRequest = store.put({ id: "data", value: data });

                    putRequest.onsuccess = function() {
                        window.sd.saved = true;
                        window.sd.saving = false;
                        resolve(); // Resolve the promise when the operation is successful
                    };

                    putRequest.onerror = function(event) {
                        reject(event.target.error); // Reject the promise on error
                    };
                };

                request.onerror = function(event) {
                    reject(event.target.error); // Reject the promise if opening the database fails
                };
            });
        }
        window.sd.sendToLS = async function() {
            window.sd.saved = true;
            window.sd.saving = true;
            console.log("Sending to database...");
            let dataToStore = window.sd.data.map(item => {
                let newItem = { ...item };
                delete newItem.model;
                delete newItem.map;
                delete newItem.smoke;
                return newItem;
            });

            try {
                await window.sd.saveToDB(dataToStore);
                console.log("Data saved to database.");
            } catch (error) {
                console.error("Error saving to database:", error);
            }
        }
        //g.addButton("Save", window.sd.sendToLS, "onclick='window.sd.sendToLS()'");

        //INIT FUNCTIONS//
        window.sd.init = async function() {
            console.log("Sky Dolly Initializing...");
            window.sd.loadFromDB((data) => { window.sd.data = data; });
            window.sd.uTime = 100;
            window.sd.prevTick = 0;
            window.sd.tickNum = 0;
            window.sd.maxTick = window.sd.maxTick || 0;
            window.sd.currTime = Date.now();
            window.sd.nextTime = Date.now() + window.sd.uTime;
            window.sd.fac = 0;
            window.sd.paused = true;
            window.sd.isRec = false;
            window.sd.isPlayback = false;
            window.sd.saved = true;
            window.sd.lastSaved = Date.now();
            window.sd.saving = false;
            window.sd.viz = [];
            window.sd.isSmoke = false;
            window.sd.cam = {
                modified: false,
                data: null,
                last: NaN,
                lastJump: NaN,
                next: NaN,
                fac: 0,
                tick: function() { //Cubic interpolation generated by AI, based on my linear interpolation implementation
                    if (window.sd.cam.data) {
                        let keys = Object.keys(window.sd.cam.data).map(Number).sort((a, b) => a - b);
                        let n = keys.length;
                        let interpolate = function(p0, p1, p2, p3, t) { //Cubic interpolation
                            return 0.5 * (
                                (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t +
                                (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                                (-p0 + p2) * t +
                                2 * p1
                            );
                        };

                        let currentIndex = keys.findIndex(key => key >= window.sd.tickNum);
                        let p0Index, p1Index, p2Index, p3Index;
                        let last = -1;
                        let next = Infinity;
                        for (let k in window.sd.cam.data) {
                            let i = Number(k);
                            if (i < window.sd.tickNum && i > last) {
                                last = i;
                            }
                            if (i > window.sd.tickNum && i < next) {
                                next = i;
                            }
                        }
                        let a = document.getElementById("sdKeyframes");
                        if (a) {
                            for (let i = 0; i < a.children.length; i++) {
                                let tn = Number(a.children[i].getAttribute("ticknum"));
                                a.children[i].style.left = `${(tn/window.sd.maxTick)*99.5-1}%`;
                            }
                        }
                        window.sd.cam.lastJump = (last == -1) ? NaN : last;
                        window.sd.cam.next = (next == Infinity) ? NaN : next;
                        if (n < 2 || currentIndex === -1) { //Not enough points for interpolation || no currentIndex
                            return;
                        }

                        if (currentIndex === 0) {
                            p0Index = 0; // Extrapolate backward
                            p1Index = 0;
                            p2Index = 1;
                            p3Index = Math.min(2, n - 1); // Extrapolate forward or use last
                        } else {
                            p1Index = currentIndex - 1;
                            p2Index = currentIndex;
                            p0Index = Math.max(0, currentIndex - 2);
                            p3Index = Math.min(n - 1, currentIndex + 1);
                        }

                        let t0 = keys[p0Index];
                        let t1 = keys[p1Index];
                        let t2 = keys[p2Index];
                        let t3 = keys[p3Index];

                        let v0 = window.sd.cam.data[t0];
                        let v1 = window.sd.cam.data[t1];
                        let v2 = window.sd.cam.data[t2];
                        let v3 = window.sd.cam.data[t3];

                        let t = (window.sd.tickNum+window.sd.fac - t1) / (t2 - t1);

                        if (!window.sd.cam.modified) {
                            let posX = interpolate(v0.pos.x, v1.pos.x, v2.pos.x, v3.pos.x, t);
                            let posY = interpolate(v0.pos.y, v1.pos.y, v2.pos.y, v3.pos.y, t);
                            let posZ = interpolate(v0.pos.z, v1.pos.z, v2.pos.z, v3.pos.z, t);
                            let pos = new window.Cesium.Cartesian3(posX, posY, posZ);

                            let hdgC = interpolate(Math.cos(v0.hdg), Math.cos(v1.hdg), Math.cos(v2.hdg), Math.cos(v3.hdg), t); //Heading Cosine
                            let hdgS = interpolate(Math.sin(v0.hdg), Math.sin(v1.hdg), Math.sin(v2.hdg), Math.sin(v3.hdg), t); //Heading Sine
                            let hdg = Math.atan2(hdgS, hdgC); //Avoid the 0/2Pi boundary
                            let pitchC = interpolate(Math.cos(v0.pitch), Math.cos(v1.pitch), Math.cos(v2.pitch), Math.cos(v3.pitch), t);
                            let pitchS = interpolate(Math.sin(v0.pitch), Math.sin(v1.pitch), Math.sin(v2.pitch), Math.sin(v3.pitch), t);
                            let pitch = Math.atan2(pitchS, pitchC);
                            let rollC = interpolate(Math.cos(v0.roll), Math.cos(v1.roll), Math.cos(v2.roll), Math.cos(v3.roll), t);
                            let rollS = interpolate(Math.sin(v0.roll), Math.sin(v1.roll), Math.sin(v2.roll), Math.sin(v3.roll), t);
                            let roll = Math.atan2(rollS, rollC);
                            let dir = [hdg, pitch, roll];

                            let fov = interpolate(v0.fov, v1.fov, v2.fov, v3.fov, t);

                            window.geofs.camera.cam.flyTo({
                                destination: pos,
                                orientation: {
                                    heading: dir[0],
                                    pitch: dir[1],
                                    roll: dir[2]
                                },
                                duration: 0
                            });
                            window.geofs.camera.setFOV(fov);
                        }
                    }
                }
            }
            if (window.sd.data) {
                for (let i in window.sd.data) {
                    window.sd.maxTick = Math.max(window.sd.data[i].lastTick, window.sd.maxTick);
                }
            } else {
                window.sd.data = [];
            }
        }
        window.sd.recInit = function(cT) {
            let date = new Date();
            var animations = {};
            var animationParts = [];
            for (let i in window.geofs.aircraft.instance.definition.parts) {
                let p = window.geofs.aircraft.instance.definition.parts[i].animations;
                let newAnim = [];
                for (let j in p) {
                    if (p && p[j]) {
                        let newAnimB = {};
                        for (let k in p[j]) {
                            if (k !== 'rotationMethod' || typeof k.rotationMethod === 'string') {
                                newAnimB[k] = p[j][k];
                            }
                        }
                        newAnim.push(newAnimB);
                    }
                }//end let j in p
                animationParts.push([newAnim, window.geofs.aircraft.instance.definition.parts[i].name]);
            }
            window.sd.data.push({
                enabled: true, //New in v0.2
                model: null,
                smoke: null,
                map: null,
                name: window.geofs.aircraft.instance.aircraftRecord.name,
                modelPath: window.geofs.aircraft.instance.object3d.model._model._resource.url,
                firstTick: (window.sd.tickNum),
                date: (date.getUTCDate().toString() + "." + date.getUTCMonth().toString() + "." + date.getUTCFullYear()),
                time: (date.getUTCHours() + ":" + date.getUTCMinutes()),
                lastTick: -1,
                animations: animations,
                animationParts: animationParts,
            });
            window.sd.isRec = true;
            window.sd.paused = false;
            window.sd.recTick(window.sd.tickNum);
            console.log("recInit");
            console.log(window.sd.isRec);
        };
        window.sd.camRecInit = function() {
            if (!window.sd.cam.data && !document.getElementById("sdScrn")) {
                window.sd.cam.data = {};
                window.geofs.camera.set(4);
                window.geofs.camera.minFOV = 0.1;
                //Time & keyframe slider
                let html0 = `<div style="background: black;width: 80%;height: 8%;position: fixed;left: 10%;padding-left: 1%;padding-right: 1%;border: 1px solid darkgray;border-radius: 25px;" id="sdTContainer">
                        <div style="width: 98.5%;position: absolute;top: 25%;height: 20%;background: gray;border-radius: 20px;left: 1%;margin: auto;"></div>
                        <input type="range" style="-webkit-appearance: none;appearance: none;background: transparent;width: 99.5%;position: absolute;top: 24%;height: 15%;left: 2px;" id="sdTime" min="0" max="${window.sd.maxTick}" step="1">
                        <div style="width: 98.5%;position: absolute;top: 50%;height: 20%;background: rgba(255,255,255,0.2);border-radius: 20px;left: 1%;margin: auto;" id="sdKeyframes"></div>
                    </div>`;
                //Button menu
                let html1 = `<div id="sdScrn" style="position: fixed;left: 33%;top: 8%;width: 33%;height: 10%;z-index: 100;">
                <button id="sdRec">Record Keyframe</button><button id="sdNext">Next Keyframe</button><button id="sdPrev">Previous Keyframe</button><br>
                <button id="sdPlay">Play</button><button id="sdClear">Clear All Keyframes</button><button id="sdMod">Toggle Modify</button>`;
                //FOV slider
                //let html2 = `<div id="sdFOVContainer"><input id="sdSlider" type="range" min="0.1" step="0.05" max="2.5" style="position: fixed;left: 1%;writing-mode: vertical-lr;direction: ltr;height: 80%;top: 10%;z-index: 100;">
                //<label for="sdSlider" style="position: fixed;left: 0.5%;top: 7%;backdrop-filter: brightness(0.8);color: white;padding: 3px;">FOV</label></div>`;
                //Add the HTML to the screen
                let a = document.createElement('div');
                //let b = document.createElement('div');
                let c = document.createElement('div');
                document.body.appendChild(a);
                //document.body.appendChild(b);
                document.body.appendChild(c);
                a.innerHTML = html1;
                //b.innerHTML = html2;
                c.innerHTML = html0;
                setTimeout(() => {
                    document.getElementById("sdRec").addEventListener('click', () => {
                        window.sd.cam.data[window.sd.tickNum] = {
                            pos: window.clone(window.geofs.camera.cam.position),
                            hdg: window.geofs.camera.cam.heading,
                            pitch: window.geofs.camera.cam.pitch,
                            roll: window.geofs.camera.cam.roll,
                            fov: window.geofs.camera.currentFOV
                        };
                        document.getElementById("sdKeyframes").innerHTML += `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="gold" style="position: absolute;left: ${(window.sd.tickNum/window.sd.maxTick)*99.5-1}%;top: -50%;" ticknum="${window.sd.tickNum}"><path d="M480-80 240-480l240-400 240 400L480-80Z"></path></svg>`;
                    });
                    document.getElementById("sdNext").addEventListener('click', () => {
                        if (!isNaN(window.sd.cam.next)) {
                            window.sd.modified = false;
                            window.sd.tickNum = window.sd.cam.next;
                            window.sd.currTime = Date.now();
                            window.sd.nextTime = Date.now() + window.sd.uTime;
                        } else {
                            console.warn("There are no keyframes to jump to in this direction.");
                        }
                    });
                    document.getElementById("sdPrev").addEventListener('click', () => {
                        if (!isNaN(window.sd.cam.lastJump)) {
                            window.sd.modified = false;
                            window.sd.tickNum = window.sd.cam.lastJump;
                            window.sd.currTime = Date.now();
                            window.sd.nextTime = Date.now() + window.sd.uTime;
                        } else {
                            console.warn("There are no keyframes to jump to in this direction.");
                        }
                    });
                    document.getElementById("sdPlay").addEventListener('click', () => {
                        window.sd.paused = !window.sd.paused;
                        window.sd.cam.modified = false;
                    });
                    document.getElementById("sdClear").addEventListener('click', () => {
                        window.sd.cam.last = NaN;
                        window.sd.cam.lastJump = NaN;
                        window.sd.cam.next = NaN;
                        window.sd.cam.data = {};
                        window.sd.cam.fac = 0;
                        document.getElementById("sdKeyframes").innerHTML = ``;
                    });
                    document.getElementById("sdMod").addEventListener('click', () => {
                        window.sd.paused = true;
                        window.sd.cam.modified = !window.sd.cam.modified;
                    });
                    /*document.getElementById("sdSlider").addEventListener('input', (e) => {
                        window.sd.cam.modified = true;
                        window.geofs.camera.setFOV(Number(e.target.value));
                    });*/
                    document.getElementById("sdTime").addEventListener('input', (e) => {
                        if (window.sd.paused) {
                            window.sd.cam.modified = false;
                        }
                        window.sd.tickNum = Number(e.target.value);
                        window.sd.nextTime = Date.now() + window.sd.uTime;
                    });
                    document.getElementById("geofs-ui-3dview").addEventListener('mousedown', () => {
                        window.sd.cam.modified = true;
                    });
                }, 400);
            }
        }
        window.sd.playbackInit = function(cT) { //Initialize playback
            for (let i in window.sd.data) {
                let d = window.sd.data[i];
                if (d.enabled && !d.model) {
                    d.model = new window.geofs.api.Model(null, {
                        url: d.modelPath,
                        location: d[d.firstTick].lla,
                        rotation: d[d.firstTick].htr
                    });
                    d.model.setVisibility((cT || window.sd.tickNum) >= d.firstTick);
                }
                if ((localStorage.getItem("utilsEnabled") == "true") && d.enabled && !d.smoke && d[d.firstTick].smokeOn !== null) {
                    window.sd.isSmoke = true;
                }
                if (d.enabled && !d.map && window.geofs.map.mapActive) {
                    let mS = d.modelPath.split("/");
                    let aircraft = (d.name || mS[mS.length - 1].split(".")[0]);
                    d.map = window.geofs.map.addPlayerMarker((Math.random()*Date.now()).toString(), "blue", `${aircraft} Flight ${i}<br/>${d[d.firstTick].htr[0]}dg<br/>${d[d.firstTick].lla[2]*window.METERS_TO_FEET}ft`);
                    d.map.update(d[d.firstTick].lla[0], d[d.firstTick].lla[1], d[d.firstTick].htr[0]);
                }
            }
            window.sd.isPlayback = true;
        }

        //TICK FUNCTIONS//
        window.sd.tick = function() {
            if (window.sd.saved && window.sd.window && window.sd.window.document.getElementById("save")) {
                window.sd.window.document.getElementById("save").className = "saved";
                window.sd.window.document.getElementById("save").innerHTML = (window.sd.saving) ? `Saving` : `Saved`;
            } else if (window.sd.window && !window.isRec) {
                if (window.sd.window.document.getElementById("save")) {
                    window.sd.window.document.getElementById("save").className = "unsaved";
                    window.sd.window.document.getElementById("save").innerHTML = `Save`;
                }
                if (window.sd.isRec && (localStorage.getItem("sdAutoSave") == "true") && (Date.now() >= (window.sd.lastSaved + 60000*Number(localStorage.getItem("sdSTime"))))) {
                    window.sendToLS();
                    window.sd.lastSaved = Date.now() + 60000*Number(localStorage.getItem("sdSTime"));
                }
            }
            if (window.sd.window && window.sd.window.document.getElementById("pause")) {
                window.sd.window.document.getElementById("pause").innerHTML = (window.sd.paused) ? "Play" : "Pause";
            }
            if (document.getElementById("sdPlay")) {
                document.getElementById("sdPlay").innerHTML = (window.sd.paused) ? "Play" : "Pause";
            }
            if (document.getElementById("sdScrn")) {
                document.getElementById("sdScrn").style.display = (window.instruments.visible) ? "block" : "none";
            }
            if (document.getElementById("sdTContainer")) {
                document.getElementById("sdTContainer").style.display = (window.instruments.visible) ? "block" : "none";
            }
            //window.sd.uTime = 100 / window.geofs.preferences.simulationSpeed;
            if (window.sd.data) {
                for (let i in window.sd.data) {
                    window.sd.maxTick = Math.max(window.sd.data[i].lastTick, window.sd.maxTick);
                }
            }
            window.sd.currTime = Date.now();
            window.sd.fac = 1 - (window.sd.nextTime - window.sd.currTime)/window.sd.uTime;
            window.sd.playbackTick(window.sd.tickNum, ((window.sd.paused || window.geofs.pause) ? 0 : window.sd.fac));
            window.sd.cam.tick();
            if (window.sd.paused || window.geofs.pause) {
                window.sd.nextTime = Date.now() + window.sd.uTime;
            } else {
                if (window.sd.fac >= 1) {
                    window.sd.tickNum++;
                    window.sd.nextTime += window.sd.uTime;
                    window.sd.recTick(window.sd.tickNum);
                    if (window.sd.tickNum > window.sd.maxTick) {
                        window.sd.maxTick = window.sd.tickNum;
                    }
                    window.sd.fac = 1 - (window.sd.nextTime - window.sd.currTime)/window.sd.uTime;

                }
            }
            if (window.sd.window) {
                let t = window.sd.window.document.getElementById("timeSlider");
                if (t) {
                    t.max = window.sd.maxTick;
                    t.value = window.sd.tickNum;
                }
                let currTime = window.sd.msToTime(window.sd.tickNum*window.sd.uTime);
                let maxTime = window.sd.msToTime(window.sd.maxTick*window.sd.uTime);
                if (window.sd.window.document.getElementById("time")) {
                    window.sd.window.document.getElementById("time").innerHTML = `${currTime} / ${maxTime}`;
                }
            }
            let u = document.getElementById("sdTime");
            if (u) {
                u.max = window.sd.maxTick;
                u.value = window.sd.tickNum;
            }
            requestAnimationFrame(window.sd.tick);
        };
        window.sd.recTick = function(cT) {
            if (window.sd.isRec) {
                let id = window.sd.data.length - 1;
                let d = window.sd.data[id][(cT || window.sd.tickNum)];
                let anims = {};
                for (let i in window.sd.data[id].animationParts) {
                    if (window.geofs.aircraft.instance.object3d.model._model.getNode(window.sd.data[id].animationParts[i][1])) {
                        anims[window.sd.data[id].animationParts[i][1]] = window.geofs.aircraft.instance.object3d.model._model.getNode(window.sd.data[id].animationParts[i][1]).matrix.clone();
                    } else if (window.geofs.aircraft.instance.object3d.model._model.getNode(window.sd.data[id].animationParts[i][1].toLowerCase())) {
                        anims[window.sd.data[id].animationParts[i][1]] = window.geofs.aircraft.instance.object3d.model._model.getNode(window.sd.data[id].animationParts[i][1].toLowerCase()).matrix.clone();
                    }
                }
                let smokeOn = null;
                if ((localStorage.getItem("utilsEnabled") == 'true')) {
                    smokeOn = window.isSmokeOn;
                }
                window.sd.data[id][(cT || window.sd.tickNum)] = {
                    lla: window.geofs.aircraft.instance.llaLocation,
                    htr: window.geofs.aircraft.instance.htr,
                    anims: anims,
                    smokeOn: smokeOn
                };
                window.sd.data[id].lastTick = (cT || window.sd.tickNum);
            }
        };

        window.sd.playbackTick = function(cT, factor) {
            try {
                if (window.sd.isPlayback) {
                    for (let i in window.sd.data) {
                        let d = window.sd.data[i];
                        window.sd.fac = 1 - (window.sd.nextTime - window.sd.currTime)/window.sd.uTime;
                        let t1 = d[window.sd.tickNum];
                        let t2 = d[window.sd.tickNum+1];
                        if (d.enabled == true && t1 && t1.lla && d.model) {
                            if (window.sd.getDistance(window.geofs.aircraft.instance.llaLocation, t1.lla) <= 1) {
                                if (t2 && t2.lla) {
                                    let lla = [
                                        t1.lla[0] + (t2.lla[0] - t1.lla[0]) * factor,
                                        t1.lla[1] + (t2.lla[1] - t1.lla[1]) * factor,
                                        t1.lla[2] + (t2.lla[2] - t1.lla[2]) * factor,
                                    ];
                                    let htr = [
                                        t1.htr[0] + (t2.htr[0] - t1.htr[0]) * factor,
                                        t1.htr[1] + (t2.htr[1] - t1.htr[1]) * factor,
                                        t1.htr[2] + (t2.htr[2] - t1.htr[2]) * factor,
                                    ];
                                    d.model.setPositionOrientationAndScale(lla, htr, null);
                                    let mS = window.sd.data[i].modelPath.split("/");
                                    let aircraft = (d.name || mS[mS.length - 1].split(".")[0]);
                                    if (d.map) {
                                        d.map.update(lla[0], lla[1], htr[0], `${aircraft} Flight ${i}<br/>${Math.round(htr[0])}dg<br/>${Math.round(lla[2]*window.METERS_TO_FEET)}ft`);
                                    } else if (window.geofs.map.mapActive) {
                                        d.map = window.geofs.map.addPlayerMarker((Math.random()*Date.now()).toString(), "blue", `${aircraft} Flight ${i}<br/>${Math.round(htr[0])}dg<br/>${Math.round(lla[2]*window.METERS_TO_FEET)}ft`);
                                        d.map.update(lla[0], lla[1], htr[0]);
                                    }
                                } else {
                                    d.model.setPositionOrientationAndScale(t1.lla, t1.htr, null);
                                    let mS = window.sd.data[i].modelPath.split("/");
                                    let aircraft = (d.name || mS[mS.length - 1].split(".")[0]);
                                    if (d.map) {
                                        d.map.update(t1.lla[0], t1.lla[1], t1.htr[0], `${aircraft} Flight ${i}<br/>${Math.round(t1.htr[0])}dg<br/>${Math.round(t1.lla[2]*window.METERS_TO_FEET)}ft`);
                                    } else if (window.geofs.map.mapActive) {
                                        d.map = window.geofs.map.addPlayerMarker((Math.random()*Date.now()).toString(), "blue", `${aircraft} Flight ${i}<br/>${Math.round(t1.htr[0])}dg<br/>${Math.round(t1.lla[2]*window.METERS_TO_FEET)}ft`);
                                        d.map.update(t1.lla[0], t1.lla[1], t1.htr[0]);
                                    }
                                }
                                if (window.sd.isSmoke) {
                                    if (!d.smoke && t1.smokeOn) { //Smoke turn on
                                        d.smoke = new window.geofs.fx.ParticleEmitter({
                                            off: 0,
                                            location: t1.lla,
                                            duration: 1E10,
                                            rate: .03,
                                            life: Number(localStorage.getItem("utilsSLife"))*1E3, //60 seconds by default
                                            easing: "easeOutQuart",
                                            startScale: Number(localStorage.getItem("utilsSmokeStart")),
                                            endScale: Number(localStorage.getItem("utilsSmokeEnd")),
                                            randomizeStartScale: 0.005,
                                            randomizeEndScale: 0.05,
                                            startOpacity: 1,
                                            endOpacity: .4,
                                            startRotation: "random",
                                            texture: "whitesmoke"
                                        });
                                        d.smoke._options.location = t1.lla;
                                        d.smoke._options._location = t1.lla;
                                        let c = window.sd.hexToRgb(localStorage.getItem("utilsColor")); //c for Color
                                        window.geofs.fx.setParticlesColor(new window.Cesium.Color(c.r/255, c.g/255, c.b/255, 1));
                                    } else if (d.smoke && t1.smokeOn) { //Smoke location update
                                        d.smoke._options.location = t1.lla;
                                        d.smoke._options._location = t1.lla;
                                        let c = window.sd.hexToRgb(localStorage.getItem("utilsColor")); //c for Color
                                        window.geofs.fx.setParticlesColor(new window.Cesium.Color(c.r/255, c.g/255, c.b/255, 1));
                                    } else if (d.smoke && !t1.smokeOn) {
                                        d.smoke.destroy();
                                        d.smoke = null;
                                    }
                                }
                                d.model.setVisibility(true);
                            }
                        } else if (d.model && d.map) {
                            d.model.setVisibility(false);
                            d.map.update(0,0,0);
                            if (d.smoke) {
                                d.smoke._on = false;
                            }
                        }
                        if (d.model && d.model._model && d.animations && d.animationParts && t1 && t1.anims) {
                            try {
                                for (let i in t1.anims) {
                                    let m = d.model._model && d.model._model.ready && (d.model._model.getNode(i) || d.model._model.getNode(i.toLowerCase()));
                                    m.matrix = t1.anims[i];
                                }
                            } catch (e) {
                                console.warn(e);
                            }
                        } else if (d.model) {
                            d.model.setVisibility(false);
                        }
                    }
                }
            } catch (e) {
                console.error(e);
            }
        };
        window.sd.stopPlayback = function() {
            if (window.sd.isPlayback) {
                for (let i in window.sd.data) {
                    let d = window.sd.data[i];
                    if (d.model) {
                        d.model.removeFromWorld();
                        d.model = null;
                    }
                    if (d.map) {
                        d.map.destroy();
                        d.map = null;
                    }
                }
                window.sd.isPlayback = false;
            }
        };

        //HTML FUNCTIONS//
        window.sd.addListeners = function() {
            if (window.sd.window && window.sd.window.document) {
                window.sd.window.document.body.innerHTML = window.sd.html;
                setTimeout(() => {
                    window.sd.window.document.body.innerHTML = window.sd.html;
                    window.sd.window.document.getElementById("rec").addEventListener('click', () => {
                        if (window.sd.isRec) {
                            window.sd.isRec = false;
                            window.sd.window.document.getElementById("rec").innerHTML = `Start New Recording`;
                            setTimeout(() => {
                                window.sd.saved = false;
                                window.sd.updateHTML();
                            },250);
                        } else {
                            window.sd.recInit(window.sd.tickNum);
                            window.sd.window.document.getElementById("rec").innerHTML = `Stop Recording`;
                        }
                    });
                    window.sd.window.document.getElementById("pause").addEventListener('click', () => {
                        window.sd.cam.modified = false;
                        if (window.sd.paused) {
                            window.sd.paused = false;
                            window.sd.window.document.getElementById("pause").innerHTML = `Pause`;
                        } else {
                            window.sd.paused = true;
                            window.sd.window.document.getElementById("pause").innerHTML = `Play`;
                        }
                    });
                    window.sd.window.document.getElementById("playback").addEventListener('click', () => {
                        if (window.sd.isPlayback) {
                            window.sd.stopPlayback();
                            window.sd.window.document.getElementById("playback").innerHTML = `Start Playback`;
                        } else {
                            window.sd.playbackInit();
                            window.sd.window.document.getElementById("playback").innerHTML = `Stop Playback`;
                        }
                    });
                    window.sd.window.document.getElementById("save").addEventListener('click', () => {
                        if (!window.sd.isRec) {
                            window.sd.sendToLS();
                        }
                    });
                    window.sd.window.document.getElementById("timeSlider").addEventListener('input', (e) => {
                        if (window.sd.paused) {
                            window.sd.cam.modified = false;
                        }
                        window.sd.tickNum = Number(e.target.value);
                        window.sd.nextTime = Date.now() + window.sd.uTime;
                    });
                    window.sd.window.document.getElementById("viz").addEventListener('click', () => {
                        if (window.sd.viz.length) {
                            console.warn("Visualization already created.");
                        } else {
                            const rainbow = [window.Cesium.Color.RED, window.Cesium.Color.ORANGE, window.Cesium.Color.YELLOW, window.Cesium.Color.GREEN, window.Cesium.Color.BLUE, window.Cesium.Color.INDIGO, window.Cesium.Color.VIOLET];
                            for (let z in window.sd.data) {
                                let i = window.sd.data[z];
                                if (i.enabled && window.sd.getDistance(window.geofs.aircraft.instance.llaLocation, i[i.firstTick].lla) <= 0.5) {
                                    let arr = [];
                                    for (let j = i.firstTick; j <= Math.min(window.sd.tickNum, i.lastTick); j++) {
                                        arr.push(i[j].lla[1], i[j].lla[0], i[j].lla[2]);
                                    }
                                    window.sd.viz[z.toString()] = window.geofs.api.viewer.entities.add({
                                        name: `aircraftPath_${z}+${Math.random()*1E16}`,
                                        polyline: {
                                            positions: window.Cesium.Cartesian3.fromDegreesArrayHeights(arr),
                                            width: 5,
                                            material: new window.Cesium.PolylineOutlineMaterialProperty({
                                                outlineWidth: 2,
                                                outlineColor: window.Cesium.Color.BLACK,
                                                color: rainbow[z % rainbow.length], //Cycle through rainbow colors
                                            }),
                                        },
                                    });
                                }
                            }
                            window.sd.vizI = setInterval(() => {
                                if (window.sd.viz.length && window.sd.prevTick != window.sd.tickNum) {
                                    for (let v in window.sd.viz) {
                                        let i = window.sd.data[v];
                                        if (window.sd.getDistance(window.geofs.aircraft.instance.llaLocation, i[i.firstTick].lla) <= 0.5) {
                                            let arr = [];
                                            for (let j = i.firstTick; j <= Math.min(window.sd.tickNum, i.lastTick); j++) {
                                                arr.push(i[j].lla[1], i[j].lla[0], i[j].lla[2]);
                                            }
                                            window.sd.viz[v].polyline.positions.setValue(window.Cesium.Cartesian3.fromDegreesArrayHeights(arr));
                                        }
                                    }
                                    window.sd.prevTick = window.sd.tickNum;
                                }
                            }, 3000);
                        }
                    });
                    window.sd.window.document.getElementById("deviz").addEventListener('click', () => {
                        if (!window.sd.viz.length) {
                            console.warn("Visualization already removed.");
                        } else {
                            for (let i of window.sd.viz) {
                                window.geofs.api.viewer.entities.remove(i);
                            }
                            window.sd.viz = [];
                            if (window.sd.vizI) {
                                clearInterval(window.sd.vizI);
                            }
                        }

                    });
                    window.sd.window.document.addEventListener('close', () => {
                        window.sd.window = null;
                        window.sd.html = null;
                        window.sd.sendToLS();
                    });
                    window.sd.window.document.getElementById("camera").addEventListener('click', window.sd.camRecInit);
                    console.log("Running for loop");
                    for (let i in window.sd.data) {
                        let d = window.sd.data[i];
                        let el = window.sd.window.document.getElementById("cb" + i);
                        let del = window.sd.window.document.getElementById("del" + i);
                        if (el) {
                            el.checked = d.enabled;
                            el.addEventListener('click', () => {
                                window.sd.data[i].enabled = el.checked;
                                window.sd.saved = false;
                            });
                        }
                        if (del) {
                            del.addEventListener('click', () => {
                                window.sd.saved = false;
                                window.sd.data.splice(i, 1);
                                window.sd.updateHTML();
                            });
                        }
                    }
                    console.log("Done");
                }, 500);
                console.log("Added listeners");
            } else {
                setTimeout(window.sd.addListeners, 500);
            }
        };
        window.sd.updateHTML = function() {
            let tr = ``;
            for (let i in window.sd.data) {
                let d = window.sd.data[i];
                tr += `<tr>
            <td>${parseInt(i) + 1}</td>
            <td class="model-path">${d.modelPath}</td>
            <td>${d.date}</td>
            <td>${d.time}</td>
            <td>${window.sd.msToTime(d.firstTick * window.sd.uTime)}</td>
            <td>${window.sd.msToTime((d.lastTick - d.firstTick) * window.sd.uTime)}</td>
            <td class="checkbox-cell"><input type="checkbox" id="cb${i}" ${d.enabled ? "checked" : ""}></td>
            <td class="delete-cell"><button class="delete-button" id="del${i}">Delete</button></td>
        </tr>`;
            }
            window.sd.html = `
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 0.9rem;
            color: #333;
            margin: 0;
            padding: 15px;
            background-color: #f7f7f7;
        }

        h1 {
            font-size: 1.5rem;
            color: #2c3e50;
            margin-top: 0;
            margin-bottom: 15px;
        }

        .controls-container {
            border: 1px solid #ddd;
            padding: 15px;
            margin-bottom: 15px;
            background-color: #fff;
            border-radius: 5px;
        }

        .controls-container p {
            margin-top: 0;
            font-weight: bold;
            color: #555;
            margin-bottom: 10px;
        }

        #timeSlider {
            width: 100%;
            margin-bottom: 10px;
        }

        #time {
            display: block;
            margin-bottom: 15px;
            color: #777;
            font-size: 0.85rem;
        }

        .controls-container button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 15px;
            margin-right: 10px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background-color 0.3s ease;
        }

        .controls-container button:hover {
            background-color: #0056b3;
        }

        #dataTable {
            width: 100%;
            border-collapse: collapse;
            background-color: #fff;
            border-radius: 5px;
            overflow: hidden; /* To contain the border-radius of header and footer if added */
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }

        #dataTable th, #dataTable td {
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }

        #dataTable th {
            background-color: #f0f0f0;
            font-weight: bold;
            color: #555;
        }

        #dataTable tr:last-child td {
            border-bottom: none;
        }

        #dataTable tr:nth-child(even) {
            background-color: #f9f9f9;
        }

        .checkbox-cell {
            text-align: center;
        }

        .delete-cell {
            text-align: center;
        }

        .delete-button {
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 6px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: background-color 0.3s ease;
        }

        .delete-button:hover {
            background-color: #c82333;
        }

        .model-path {
            font-family: monospace;
            font-size: 0.8rem;
            color: #666;
        }
        .controls-container .unsaved {
            background-color: #cea11a;
        }
        .controls-container .saved {
            background-color: #add5ff;
            cursor: default;
        }
    </style>
    <h1>Sky Dolly</h1>
    <div class="controls-container">
        <p>Record &amp; Replay</p>
        <input id="timeSlider" type="range" min="0" max="${window.sd.maxTick}" step="1">
        <span id="time"></span>
        <br>
        <button id="rec">${(window.sd.isRec ? "Stop Recording" : "Start New Recording")}</button>
        <button id="pause">${(window.sd.paused) ? "Play" : "Pause"}</button>
        <button id="playback">${(window.sd.isPlayback) ? "Stop Playback" : "Start Playback"}</button>
        <button id="camera">Initialize Camera</button>
        <button id="viz">Visualize Flight Path(s)</button>
        <button id="deviz">Remove Flight Path Visualization</button>
        <button id="save" class="saved">Saved</button>
    </div>
    <table id="dataTable">
        <thead>
            <tr>
                <th>#</th>
                <th>Aircraft Model Path</th>
                <th>Date</th>
                <th>IRL Start time (UTC)</th>
                <th>Start time (in-game)</th>
                <th>Duration</th>
                <th>Show aircraft in playback</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            ${tr}
        </tbody>
    </table>
    `;
            window.sd.addListeners();
        }
        window.sd.windowInit = function() {
            window.sd.updateHTML();
            window.sd.window = window.open("about:blank", "_blank", "width=1160,height=400");
            window.sd.window.document.title = 'Sky Dolly';
            const head = window.sd.window.document.head;
            let closeScript = window.sd.window.document.createElement('script');
            closeScript.innerHTML = `
                // Start checking periodically
                const interval = setInterval(() => {
                    // Check if the opener is gone or closed
                    if (!window.opener || window.opener.closed) {
                        clearInterval(interval); // Stop the checks
                        window.close(); // Close this window
                    }
                }, 1000); // Check every 1 second
                `;
            head.appendChild(closeScript);
        }
        g.addButton("Open GUI", window.sd.windowInit, "onclick='window.sd.windowInit()'");
        window.sd.init();
        waitForEntities();
    }
})();
function waitForEntities() {
    try {
        if (window.geofs.cautiousWithTerrain == false && window.geofs.api && window.geofs.api.addFrameCallback) {
            // Entities are already defined, no need to wait
            window.DEGREES_TO_RAD = window.DEGREES_TO_RAD || 0.017453292519943295769236907684886127134428718885417254560971914401710091146034494436822415696345094822123044925073790592483854692275281012398474218934047117319168245015010769561697553581238605305168789;
            window.RAD_TO_DEGREES = window.RAD_TO_DEGREES || 57.295779513082320876798154814105170332405472466564321549160243861202847148321552632440968995851110944186223381632864893281448264601248315036068267863411942122526388097467267926307988702893110767938261;
            window.METERS_TO_FEET = window.METERS_TO_FEET || 3.280839895;
            requestAnimationFrame(window.sd.tick);
            return;
        }
    } catch (error) {
        // Handle any errors (e.g., log them)
        console.log('Error in waitForEntities:', error);
    }
    // Retry after 1000 milliseconds
    setTimeout(() => {waitForEntities();}, 1000);
}
waitForEntities();
