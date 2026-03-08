const fs = require("fs");

// ============================================================
// HELPER: Convert a time string like "08:30:00 am" to total seconds
// This makes it easy to do math with times
// ============================================================
function timeToSeconds(timeStr) {
    // timeStr looks like "08:30:00 am" or "01:15:00 pm"
    let parts = timeStr.trim().split(" ");       // ["08:30:00", "am"]
    let period = parts[1].toLowerCase();         // "am" or "pm"
    let timeParts = parts[0].split(":");         // ["08", "30", "00"]

    let hours = parseInt(timeParts[0]);
    let minutes = parseInt(timeParts[1]);
    let seconds = parseInt(timeParts[2]);

    // Convert 12-hour format to 24-hour format
    if (period === "am" && hours === 12) {
        hours = 0;   // 12:xx am is midnight (0 hours)
    }
    if (period === "pm" && hours !== 12) {
        hours = hours + 12;  // e.g. 1 pm = 13, 5 pm = 17
    }

    // Now convert everything to seconds
    return (hours * 3600) + (minutes * 60) + seconds;
}

// ============================================================
// HELPER: Convert total seconds into a formatted string like "h:mm:ss"
// ============================================================
function secondsToTime(totalSeconds) {
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    // Make sure minutes and seconds always show 2 digits (e.g. "05" not "5")
    let mm = String(minutes).padStart(2, "0");
    let ss = String(seconds).padStart(2, "0");

    return `${hours}:${mm}:${ss}`;
}

// ============================================================
// HELPER: Convert a time string like "h:mm:ss" or "hhh:mm:ss" to total seconds
// This is used when we already have a duration (not an am/pm time)
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
// Each line in the file looks like:
// driverID|driverName|date|startTime|endTime|idleTime|bonus
// ============================================================
function readShiftsFile(textFile) {
    // If the file does not exist yet, return an empty array
    if (!fs.existsSync(textFile)) {
        return [];
    }

    let fileContent = fs.readFileSync(textFile, "utf8").trim();

    // If the file is empty, return an empty array
    if (fileContent === "") {
        return [];
    }

    let lines = fileContent.split("\n");
    let records = [];

    for (let line of lines) {
        let fields = line.split("|");
        records.push({
            driverID:   fields[0],
            driverName: fields[1],
            date:       fields[2],
            startTime:  fields[3],
            endTime:    fields[4],
            idleTime:   fields[5],
            bonus:      fields[6].trim() === "true"  // convert string to boolean
        });
    }

    return records;
}

// ============================================================
// HELPER: Write all records back to the shifts text file
// Each record becomes one line separated by "|"
// ============================================================
function writeShiftsFile(textFile, records) {
    let lines = records.map(r => {
        return `${r.driverID}|${r.driverName}|${r.date}|${r.startTime}|${r.endTime}|${r.idleTime}|${r.bonus}`;
    });
    fs.writeFileSync(textFile, lines.join("\n"), "utf8");
}

// ============================================================
// HELPER: Read the driver rates file
// Each line looks like: driverID|driverName|hourlyRate|requiredHoursPerDay
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
        let fields = line.split("|");
        rates.push({
            driverID:         fields[0],
            driverName:       fields[1],
            hourlyRate:       parseFloat(fields[2]),   // e.g. 50 (dollars per hour)
            requiredHoursPerDay: parseFloat(fields[3]) // e.g. 8 (hours per workday)
        });
    }

    return rates;
}


// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// Simply calculates how long a shift is from start to end
// Example: start = "08:00:00 am", end = "04:00:00 pm" → "8:00:00"
// ============================================================
function getShiftDuration(startTime, endTime) {
    let startSeconds = timeToSeconds(startTime);
    let endSeconds   = timeToSeconds(endTime);

    // The shift must end after it starts
    let durationSeconds = endSeconds - startSeconds;

    return secondsToTime(durationSeconds);
}


// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// Calculates the idle (break/rest) time within the shift
// The idle time is always less than or equal to the shift duration
// ============================================================
function getIdleTime(startTime, endTime) {
    // Idle time = 10% of the shift duration (a common rule)
    let shiftDuration = getShiftDuration(startTime, endTime);
    let shiftSeconds  = durationToSeconds(shiftDuration);

    let idleSeconds = Math.floor(shiftSeconds * 0.10);

    return secondsToTime(idleSeconds);
}


// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// Active time = how long the driver was actually working
// = total shift duration minus the idle (break) time
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shiftSeconds = durationToSeconds(shiftDuration);
    let idleSeconds  = durationToSeconds(idleTime);

    let activeSeconds = shiftSeconds - idleSeconds;

    return secondsToTime(activeSeconds);
}


// ============================================================
// Function 4: metQuota(date, activeTime)
// Checks if the driver worked enough hours on a given day
// Returns true if active time >= required daily quota (6 hours)
// Weekdays quota = 6 hours, Fridays quota = 3 hours
// ============================================================
function metQuota(date, activeTime) {
    // Find out what day of the week this date is
    // date is formatted as "yyyy-mm-dd"
    let dateObj     = new Date(date);
    let dayOfWeek   = dateObj.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday

    // Set the required quota based on the day
    let requiredSeconds;
    if (dayOfWeek === 5) {
        // Friday has a shorter quota: 3 hours
        requiredSeconds = 3 * 3600;
    } else {
        // All other days: 6 hours quota
        requiredSeconds = 6 * 3600;
    }

    let activeSeconds = durationToSeconds(activeTime);

    return activeSeconds >= requiredSeconds;
}


// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// Adds a new shift record to the file, calculates all fields,
// and returns the complete record as an object with 10 properties
// Returns empty {} if the shift already exists for that driver+date
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    // shiftObj has: driverID, driverName, date, startTime, endTime
    let { driverID, driverName, date, startTime, endTime } = shiftObj;

    // Read existing records from the file
    let records = readShiftsFile(textFile);

    // Check if this driver already has a record on this date
    for (let record of records) {
        if (record.driverID === driverID && record.date === date) {
            // Duplicate found — return empty object
            return {};
        }
    }

    // Calculate shift details
    let shiftDuration = getShiftDuration(startTime, endTime);
    let idleTime      = getIdleTime(startTime, endTime);
    let activeTime    = getActiveTime(shiftDuration, idleTime);
    let quotaMet      = metQuota(date, activeTime);

    // Build the new record object (10 properties)
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
        bonus:         false          // bonus starts as false, set later
    };

    // Save to file (we store only the core fields)
    records.push({
        driverID:   driverID,
        driverName: driverName,
        date:       date,
        startTime:  startTime,
        endTime:    endTime,
        idleTime:   idleTime,
        bonus:      false
    });

    writeShiftsFile(textFile, records);

    return newRecord;
}


// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// Updates the bonus field for a specific driver on a specific date
// newValue is a boolean (true or false)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let records = readShiftsFile(textFile);

    // Find the matching record and update its bonus
    for (let record of records) {
        if (record.driverID === driverID && record.date === date) {
            record.bonus = newValue;
        }
    }

    // Write the updated records back to the file
    writeShiftsFile(textFile, records);
}


// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// Counts how many bonus days a driver earned in a given month
// month is a string like "1", "01", "12" etc.
// Returns -1 if the driverID is not found at all in the file
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let records = readShiftsFile(textFile);

    // Check if this driver exists at all in the file
    let driverExists = false;
    for (let record of records) {
        if (record.driverID === driverID) {
            driverExists = true;
            break;
        }
    }

    if (!driverExists) {
        return -1;  // driver not found
    }

    // Count bonuses for this driver in this month
    // month might be "1" or "01" — we convert both to a number for comparison
    let targetMonth = parseInt(month);
    let bonusCount  = 0;

    for (let record of records) {
        if (record.driverID === driverID) {
            // date is "yyyy-mm-dd", so split and get the month part
            let recordMonth = parseInt(record.date.split("-")[1]);

            if (recordMonth === targetMonth && record.bonus === true) {
                bonusCount++;
            }
        }
    }

    return bonusCount;
}


// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// Adds up all the active working hours for a driver in a given month
// month is a number (e.g. 1 for January, 12 for December)
// Returns a string formatted as "hhh:mm:ss"
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let records = readShiftsFile(textFile);

    let totalSeconds = 0;

    for (let record of records) {
        if (record.driverID === driverID) {
            let recordMonth = parseInt(record.date.split("-")[1]);

            if (recordMonth === month) {
                // Recalculate active time from stored start/end/idle times
                let shiftDuration = getShiftDuration(record.startTime, record.endTime);
                let activeTime    = getActiveTime(shiftDuration, record.idleTime);
                totalSeconds     += durationToSeconds(activeTime);
            }
        }
    }

    // Format as "hhh:mm:ss" — hours can be 3 digits
    let hours   = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    let hhh = String(hours).padStart(3, "0");
    let mm  = String(minutes).padStart(2, "0");
    let ss  = String(seconds).padStart(2, "0");

    return `${hhh}:${mm}:${ss}`;
}


// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// Calculates how many hours a driver is required to work in a month
// Each bonus day reduces the required hours by the daily required hours
// month is a number
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let records = readShiftsFile(textFile);
    let rates   = readRatesFile(rateFile);

    // Find the driver's rate info (required hours per day)
    let driverRate = null;
    for (let rate of rates) {
        if (rate.driverID === driverID) {
            driverRate = rate;
            break;
        }
    }

    if (!driverRate) {
        return "000:00:00";  // driver not found in rates file
    }

    // Count how many shifts this driver has in this month
    let shiftCount = 0;
    for (let record of records) {
        if (record.driverID === driverID) {
            let recordMonth = parseInt(record.date.split("-")[1]);
            if (recordMonth === month) {
                shiftCount++;
            }
        }
    }

    // Required hours = (number of shifts - bonus days) * required hours per day
    let workDays       = shiftCount - bonusCount;
    let requiredHours  = workDays * driverRate.requiredHoursPerDay;
    let totalSeconds   = Math.round(requiredHours * 3600);

    // Format as "hhh:mm:ss"
    let hours   = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    let hhh = String(hours).padStart(3, "0");
    let mm  = String(minutes).padStart(2, "0");
    let ss  = String(seconds).padStart(2, "0");

    return `${hhh}:${mm}:${ss}`;
}


// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// Calculates the driver's net pay for the month
// If actual hours >= required hours: pay = actual hours * hourly rate
// If actual hours < required hours:  pay = actual hours * hourly rate
//                                         - (missing hours * hourly rate)
// Returns an integer (rounded net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rates = readRatesFile(rateFile);

    // Find the driver's hourly rate
    let driverRate = null;
    for (let rate of rates) {
        if (rate.driverID === driverID) {
            driverRate = rate;
            break;
        }
    }

    if (!driverRate) {
        return 0;  // driver not found
    }

    let actualSeconds   = durationToSeconds(actualHours);
    let requiredSeconds = durationToSeconds(requiredHours);

    // Convert seconds to hours (as a decimal number)
    let actualHoursNum   = actualSeconds   / 3600;
    let requiredHoursNum = requiredSeconds / 3600;

    let hourlyRate = driverRate.hourlyRate;

    let pay;

    if (actualHoursNum >= requiredHoursNum) {
        // Driver worked enough — pay for all actual hours
        pay = actualHoursNum * hourlyRate;
    } else {
        // Driver worked less than required
        // Pay for actual hours BUT deduct for missing hours too
        let missingHours = requiredHoursNum - actualHoursNum;
        pay = (actualHoursNum * hourlyRate) - (missingHours * hourlyRate);
    }

    return Math.round(pay);
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
