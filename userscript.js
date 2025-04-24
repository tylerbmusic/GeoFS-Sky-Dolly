// ==UserScript==
// @name         GeoFS Sky Dolly
// @namespace    https://github.com/tylerbmusic/GeoFS-Sky-Dolly
// @version      0.1
// @description  Adds the functionality of the Sky Dolly MSFS addon. Specifically, the formation mode and logbook.
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
                enabled: false,
                model: null,
                map: null,
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
        window.sd.playbackInit = function(cT) {
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
                if (d.enabled && !d.map && window.geofs.map.mapActive) {
                    let mS = d.modelPath.split("/");
                    let aircraft = mS[mS.length - 1].split(".")[0];
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
            if (window.sd.data) {
                for (let i in window.sd.data) {
                    window.sd.maxTick = Math.max(window.sd.data[i].lastTick, window.sd.maxTick);
                }
            }
            window.sd.currTime = Date.now();
            window.sd.fac = 1 - (window.sd.nextTime - window.sd.currTime)/window.sd.uTime;
            window.sd.playbackTick(window.sd.tickNum, ((window.sd.paused || window.geofs.pause) ? 0 : window.sd.fac));
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
                window.sd.data[id][(cT || window.sd.tickNum)] = {
                    lla: window.geofs.aircraft.instance.llaLocation,
                    htr: window.geofs.aircraft.instance.htr,
                    anims: anims
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
                                    let aircraft = mS[mS.length - 1].split(".")[0];
                                    if (d.map) {
                                        d.map.update(lla[0], lla[1], htr[0], `${aircraft} Flight ${i}<br/>${Math.round(htr[0])}dg<br/>${Math.round(lla[2]*window.METERS_TO_FEET)}ft`);
                                    } else if (window.geofs.map.mapActive) {
                                        d.map = window.geofs.map.addPlayerMarker((Math.random()*Date.now()).toString(), "blue", `${aircraft} Flight ${i}<br/>${Math.round(htr[0])}dg<br/>${Math.round(lla[2]*window.METERS_TO_FEET)}ft`);
                                        d.map.update(lla[0], lla[1], htr[0]);
                                    }
                                } else {
                                    d.model.setPositionOrientationAndScale(t1.lla, t1.htr, null);
                                    let mS = window.sd.data[i].modelPath.split("/");
                                    let aircraft = mS[mS.length - 1].split(".")[0];
                                    if (d.map) {
                                        d.map.update(t1.lla[0], t1.lla[1], t1.htr[0], `${aircraft} Flight ${i}<br/>${Math.round(t1.htr[0])}dg<br/>${Math.round(t1.lla[2]*window.METERS_TO_FEET)}ft`);
                                    } else if (window.geofs.map.mapActive) {
                                        d.map = window.geofs.map.addPlayerMarker((Math.random()*Date.now()).toString(), "blue", `${aircraft} Flight ${i}<br/>${Math.round(t1.htr[0])}dg<br/>${Math.round(t1.lla[2]*window.METERS_TO_FEET)}ft`);
                                        d.map.update(t1.lla[0], t1.lla[1], t1.htr[0]);
                                    }
                                }
                                d.model.setVisibility(true);
                            }
                        } else if (d.model && d.map) {
                            d.model.setVisibility(false);
                            d.map.update(0,0,0);
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
                    window.sd.window.document.getElementById("rec").addEventListener('click', (e) => {
                        if (window.sd.isRec) {
                            window.sd.isRec = false;
                            window.sd.window.document.getElementById("rec").innerHTML = `Start New Recording`;
                            window.sd.saved = false;
                        } else {
                            window.sd.recInit(window.sd.tickNum);
                            window.sd.window.document.getElementById("rec").innerHTML = `Stop Recording`;
                        }
                    });
                    window.sd.window.document.getElementById("pause").addEventListener('click', (e) => {
                        if (window.sd.paused) {
                            window.sd.paused = false;
                            window.sd.window.document.getElementById("pause").innerHTML = `Pause`;
                        } else {
                            window.sd.paused = true;
                            window.sd.window.document.getElementById("pause").innerHTML = `Play`;
                        }
                    });
                    window.sd.window.document.getElementById("playback").addEventListener('click', (e) => {
                        if (window.sd.isPlayback) {
                            window.sd.stopPlayback();
                            window.sd.window.document.getElementById("playback").innerHTML = `Start Playback`;
                        } else {
                            window.sd.playbackInit();
                            window.sd.window.document.getElementById("playback").innerHTML = `Stop Playback`;
                        }
                    });
                    window.sd.window.document.getElementById("save").addEventListener('click', (e) => {
                        if (!window.sd.isRec) {
                            window.sd.sendToLS();
                        }
                    });
                    window.sd.window.document.getElementById("update").addEventListener('click', window.sd.updateHTML);
                    window.sd.window.document.getElementById("timeSlider").addEventListener('input', (e) => {
                        window.sd.tickNum = Number(e.target.value);
                        window.sd.nextTime = Date.now() + window.sd.uTime;
                    });
                    window.sd.window.document.addEventListener('close', () => {
                        window.sd.window = null;
                        window.sd.html = null;
                        window.sd.sendToLS();
                    });
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
        <button id="update">Update Window</button>
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
            window.sd.window = window.open("about:blank", "_blank", "width=850,height=400");
            window.sd.window.document.title = 'Sky Dolly';
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
