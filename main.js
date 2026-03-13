const fs = require("fs");

// ============================================================
// HELPER: Convert a time string like "08:30:00 am" to total seconds
// ============================================================
function timeToSeconds(timeStr) {
    let parts = timeStr.trim().split(" ");
    let period = parts[1].toLowerCase();
    let timeParts = parts[0].split(":");

    let hours = parseInt(timeParts[0]);
    let minutes = parseInt(timeParts[1]);
    let seconds = parseInt(timeParts[2]);

    if (period === "am" && hours === 12) {
        hours = 0;
    }
    if (period === "pm" && hours !== 12) {
        hours = hours + 12;
    }

    return (hours * 3600) + (minutes * 60) + seconds;
}

// ============================================================
// HELPER: Convert total seconds into a formatted string like "h:mm:ss"
// ============================================================
function secondsToTime(totalSeconds) {
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    let mm = String(minutes).padStart(2, "0");
    let ss = String(seconds).padStart(2, "0");

    return `${hours}:${mm}:${ss}`;
}

// ============================================================
// HELPER: Convert a time string like "h:mm:ss" or "hhh:mm:ss" to total seconds
// ============================================================
function durationToSeconds(durationStr) {
    let parts = durationStr.trim().split(":");
    let hours = parseInt(parts[0]);
    let minutes = parseInt(parts[1]);
    let seconds = parseInt(parts[2]);
    return (hours * 3600) + (minutes * 60) + seconds;
}

// ============================================================
// HELPER: Read the shifts text file and return all records as an array of objects
// Supports both 7-field format and 10-field format
// Also supports both | and , as separators
// ============================================================
function readShiftsFile(textFile) {
    if (!fs.existsSync(textFile)) {
        return [];
    }

    let fileContent = fs.readFileSync(textFile, "utf8").trim();

    if (fileContent === "") {
        return [];
    }

    let lines = fileContent.split("\n");
    let records = [];

    for (let line of lines) {
        if (line.trim() === "") continue;

        let fields = line.split("|");
        if (fields.length === 1) fields = line.split(",");

        if (fields.length >= 10) {
            records.push({
                driverID:      fields[0].trim(),
                driverName:    fields[1].trim(),
                date:          fields[2].trim(),
                startTime:     fields[3].trim(),
                endTime:       fields[4].trim(),
                shiftDuration: fields[5].trim(),
                idleTime:      fields[6].trim(),
                activeTime:    fields[7].trim(),
                metQuota:      fields[8].trim() === "true",
                hasBonus:      fields[9].trim() === "true"
            });
        } else {
            let driverID   = fields[0].trim();
            let driverName = fields[1].trim();
            let date       = fields[2].trim();
            let startTime  = fields[3].trim();
            let endTime    = fields[4].trim();
            let idleTime   = fields[5].trim();
            let hasBonus   = fields[6] ? fields[6].trim() === "true" : false;

            let shiftDuration = getShiftDuration(startTime, endTime);
            let activeTime    = getActiveTime(shiftDuration, idleTime);
            let quotaMet      = metQuota(date, activeTime);

            records.push({
                driverID:      driverID,
                driverName:    driverName,
                date:          date,
                startTime:     startTime,
                endTime:       endTime,
                shiftDuration: shiftDuration,
                idleTime:      idleTime,
                activeTime:    activeTime,
                metQuota:      quotaMet,
                hasBonus:      hasBonus
            });
        }
    }

    return records;
}

// ============================================================
// HELPER: Write all records back to the shifts text file (always 10-field format)
// ============================================================
function writeShiftsFile(textFile, records) {
    let lines = records.map(r => {
        return `${r.driverID}|${r.driverName}|${r.date}|${r.startTime}|${r.endTime}|${r.shiftDuration}|${r.idleTime}|${r.activeTime}|${r.metQuota}|${r.hasBonus}`;
    });
    fs.writeFileSync(textFile, lines.join("\n"), "utf8");
}

// ============================================================
// HELPER: Read the driver rates file
// Each line: driverID|dayOff|basePay|tier
// ============================================================
function readRatesFile(rateFile) {
    if (!fs.existsSync(rateFile)) {
        return [];
    }

    let fileContent = fs.readFileSync(rateFile, "utf8").trim();

    if (fileContent === "") {
        return [];
    }

    let lines = fileContent.split("\n");
    let rates = [];

    for (let line of lines) {
        if (line.trim() === "") continue;

        let fields = line.split("|");
        if (fields.length === 1) fields = line.split(",");

        rates.push({
            driverID: fields[0].trim(),
            dayOff:   fields[1].trim(),
            basePay:  parseInt(fields[2]),
            tier:     parseInt(fields[3])
        });
    }

    return rates;
}


// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// ============================================================
function getShiftDuration(startTime, endTime) {
    let startSeconds = timeToSeconds(startTime);
    let endSeconds   = timeToSeconds(endTime);

    let durationSeconds = endSeconds - startSeconds;

    return secondsToTime(durationSeconds);
}


// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// ============================================================
function getIdleTime(startTime, endTime) {
    let startSeconds = timeToSeconds(startTime);
    let endSeconds   = timeToSeconds(endTime);

    let deliveryStart = 8  * 3600;
    let deliveryEnd   = 22 * 3600;

    let idleSeconds = 0;

    if (startSeconds < deliveryStart) {
        let earlyEnd = Math.min(endSeconds, deliveryStart);
        idleSeconds += earlyEnd - startSeconds;
    }

    if (endSeconds > deliveryEnd) {
        let lateStart = Math.max(startSeconds, deliveryEnd);
        idleSeconds += endSeconds - lateStart;
    }

    return secondsToTime(idleSeconds);
}


// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shiftSeconds = durationToSeconds(shiftDuration);
    let idleSeconds  = durationToSeconds(idleTime);

    let activeSeconds = shiftSeconds - idleSeconds;

    return secondsToTime(activeSeconds);
}


// ============================================================
// Function 4: metQuota(date, activeTime)
// ============================================================
function metQuota(date, activeTime) {
    let dateObj  = new Date(date);
    let eidStart = new Date("2025-04-10");
    let eidEnd   = new Date("2025-04-30");

    let requiredSeconds;
    if (dateObj >= eidStart && dateObj <= eidEnd) {
        requiredSeconds = 6 * 3600;
    } else {
        requiredSeconds = (8 * 3600) + (24 * 60);
    }

    let activeSeconds = durationToSeconds(activeTime);

    return activeSeconds >= requiredSeconds;
}


// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let { driverID, driverName, date, startTime, endTime } = shiftObj;

    let records = readShiftsFile(textFile);

    for (let record of records) {
        if (record.driverID === driverID && record.date === date) {
            return {};
        }
    }

    let shiftDuration = getShiftDuration(startTime, endTime);
    let idleTime      = getIdleTime(startTime, endTime);
    let activeTime    = getActiveTime(shiftDuration, idleTime);
    let quotaMet      = metQuota(date, activeTime);

    let newRecord = {
        driverID:      driverID,
        driverName:    driverName,
        date:          date,
        startTime:     startTime,
        endTime:       endTime,
        shiftDuration: shiftDuration,
        idleTime:      idleTime,
        activeTime:    activeTime,
        metQuota:      quotaMet,
        hasBonus:      false
    };

    let lastIndex = -1;
    for (let i = 0; i < records.length; i++) {
        if (records[i].driverID === driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex === -1) {
        records.push(newRecord);
    } else {
        records.splice(lastIndex + 1, 0, newRecord);
    }

    writeShiftsFile(textFile, records);

    return newRecord;
}


// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let records = readShiftsFile(textFile);

    for (let record of records) {
        if (record.driverID === driverID && record.date === date) {
            record.hasBonus = newValue;
        }
    }

    writeShiftsFile(textFile, records);
}


// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let records = readShiftsFile(textFile);

    let driverExists = false;
    for (let record of records) {
        if (record.driverID === driverID) {
            driverExists = true;
            break;
        }
    }

    if (!driverExists) {
        return -1;
    }

    let targetMonth = parseInt(month);
    let bonusCount  = 0;

    for (let record of records) {
        if (record.driverID === driverID) {
            let recordMonth = parseInt(record.date.split("-")[1]);

            if (recordMonth === targetMonth && record.hasBonus === true) {
                bonusCount++;
            }
        }
    }

    return bonusCount;
}


// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let records = readShiftsFile(textFile);

    let totalSeconds = 0;

    for (let record of records) {
        if (record.driverID === driverID) {
            let recordMonth = parseInt(record.date.split("-")[1]);

            if (recordMonth === month) {
                totalSeconds += durationToSeconds(record.activeTime);
            }
        }
    }

    let hours   = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    let hhh = String(hours);   // FIX: no padStart, use natural number of digits
    let mm  = String(minutes).padStart(2, "0");
    let ss  = String(seconds).padStart(2, "0");

    return `${hhh}:${mm}:${ss}`;
}


// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let records = readShiftsFile(textFile);
    let rates   = readRatesFile(rateFile);

    let driverRate = null;
    for (let rate of rates) {
        if (rate.driverID === driverID) {
            driverRate = rate;
            break;
        }
    }

    if (!driverRate) {
        return "000:00:00";
    }

    let dayOffMap = {
        "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
        "Thursday": 4, "Friday": 5, "Saturday": 6
    };
    let dayOffIndex = dayOffMap[driverRate.dayOff];

    let eidStart = new Date("2025-04-10");
    let eidEnd   = new Date("2025-04-30");

    let totalSeconds = 0;

    for (let record of records) {
        if (record.driverID === driverID) {
            let recordMonth = parseInt(record.date.split("-")[1]);

            if (recordMonth === month) {
                let dateObj = new Date(record.date);

                if (dateObj.getDay() === dayOffIndex) {
                    continue;
                }

                if (dateObj >= eidStart && dateObj <= eidEnd) {
                    totalSeconds += 6 * 3600;
                } else {
                    totalSeconds += (8 * 3600) + (24 * 60);
                }
            }
        }
    }

    totalSeconds = Math.max(0, totalSeconds - (bonusCount * 2 * 3600));

    let hours   = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    let hhh = String(hours);   // FIX: no padStart, use natural number of digits
    let mm  = String(minutes).padStart(2, "0");
    let ss  = String(seconds).padStart(2, "0");

    return `${hhh}:${mm}:${ss}`;
}


// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rates = readRatesFile(rateFile);

    let driverRate = null;
    for (let rate of rates) {
        if (rate.driverID === driverID) {
            driverRate = rate;
            break;
        }
    }

    if (!driverRate) {
        return 0;
    }

    let actualSeconds   = durationToSeconds(actualHours);
    let requiredSeconds = durationToSeconds(requiredHours);

    if (actualSeconds >= requiredSeconds) {
        return driverRate.basePay;
    }

    let tierAllowance = { 1: 50, 2: 20, 3: 10, 4: 3 };
    let allowedMissingSeconds = (tierAllowance[driverRate.tier] || 0) * 3600;

    let missingSeconds = requiredSeconds - actualSeconds;

    let billableMissingSeconds = Math.max(0, missingSeconds - allowedMissingSeconds);

    let billableMissingHours = Math.floor(billableMissingSeconds / 3600);

    let deductionRatePerHour = Math.floor(driverRate.basePay / 185);
    let salaryDeduction      = billableMissingHours * deductionRatePerHour;
    let netPay               = driverRate.basePay - salaryDeduction;

    return Math.round(netPay);
}


module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};