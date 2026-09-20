const INJECTED_HELP = `<div id="injected" style=" align-items: center; margin:20px; padding: 20px; font-family: &quot;Source Sans Pro&quot;, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; display: flex; gap: 10px; color: #fff; font-size: 1rem; line-height: 1.35; border-style: none; outline: none; padding: 0.8em 1em; border: 0.25em solid transparent; background-image: linear-gradient(#0b1725, #0b1725), linear-gradient(120deg, #f09 0%, rgb(0, 98, 190) 50%, #f09 100%); background-origin: border-box; background-clip: padding-box, border-box; background-size: 200% 100%; background-position: 100% 0; transition: background-position 0.8s ease-in-out; ">
<img src="https://github.com/strathclyde-coding-society/StrathHelper/blob/main/src/assets/logo.png?raw=true" style="height: 30px;width: 30px;/* display: inline; *//* vertical-align: middle; */"><span> Help: Click and drag to select modules to export. Blue modules will be included in the calendar file. Then select the extension and select "Export ICS".
</span>

</div>`;

function exportICS() {
const randomUUID = () => {
return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
);
};

// Format a Date as an ICS local date/time.
// No "Z" is added because timetable times are local UK times.
const formatDateTime = (date) => {
    const pad = n => String(n).padStart(2, "0");

    return (
        date.getFullYear() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        "T" +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds())
    );
};

let events = document.querySelectorAll('.selected-cell');

events = Array.from(events).map(event => {
    let tds = event.querySelectorAll('td');

    let weeksText = tds[4].innerText;
    let parts = weeksText.split(',');
    let weeks = [];

    for (let part of parts) {
        part = part.trim();

        if (part.includes('-')) {
            let range = part.split('-');
            let start = parseInt(range[0]);
            let end = parseInt(range[1]);

            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    weeks.push(i);
                }
            }
        } else {
            let week = parseInt(part);

            if (!isNaN(week)) {
                weeks.push(week);
            }
        }
    }

    // Remove duplicate weeks and sort them.
    weeks = [...new Set(weeks)].sort((a, b) => a - b);

    let day = event.parentElement.children[0].innerText;
    let prevRow = event.parentElement.previousElementSibling;

    while (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(day)) {
        if (!prevRow) {
            break;
        }

        day = prevRow.querySelector('.row-label-one');

        if (day != null) {
            day = day.innerText;
        }

        prevRow = prevRow.previousElementSibling;
    }

    // Sum the colspans of the cells before the selected cell
    // to determine the timetable column.
    let siblings = [...event.parentNode.children].filter(
        it =>
            it.classList.contains("cell-border") ||
            it.classList.contains("object-cell-border")
    );

    let index = siblings.indexOf(event);
    let siblingsBefore = siblings.slice(0, index);

    let colStart = 0;

    for (let sibling of siblingsBefore) {
        colStart += sibling.getAttribute("colspan")
            ? parseInt(sibling.getAttribute("colspan"))
            : 1;
    }

    return {
        day: day,
        start: colStart / 2,
        end: (colStart + parseInt(event.getAttribute("colspan"))) / 2,
        module: tds[0].innerText,
        type: tds[1].innerText,
        location: tds[2].innerText,
        weeks: weeks
    };
});

const GRID_START_HOUR = 9; // verify against the first time label on the grid

const escapeText = s => String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// RFC 5545 folding: 75 chars on the first line, 74 + leading space after.
// (Counts characters, not octets, which is fine for ASCII timetable data.)
const fold = line => {
    const chunks = [line.slice(0, 75)];
    for (let i = 75; i < line.length; i += 74) {
        chunks.push(line.slice(i, i + 74));
    }
    return chunks.join("\r\n ") + "\r\n";
};

const dtstamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

// Week 8 of 2026/27 starts on Monday 21 September 2026.
const SEMESTER_WEEK_8_START = new Date(2026, 8, 21, 0, 0, 0, 0);
const dayOffsets = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };

const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SCS//NONSGML StrathHelper v1.0//EN",
    "CALSCALE:GREGORIAN"
];

for (const event of events) {
    if (!event.weeks || event.weeks.length === 0) {
        console.warn("Skipping event with no weeks:", event);
        continue;
    }
    if (!(event.day in dayOffsets)) {
        console.warn("Skipping event with invalid day:", event.day);
        continue;
    }

    const durationMinutes = Math.round((event.end - event.start) * 60);

    for (const week of event.weeks) {
        const start = new Date(SEMESTER_WEEK_8_START);
        start.setDate(
            start.getDate() + (week - 8) * 7 + dayOffsets[event.day]
        );
        // Grid offset + time of day (setHours handles minute overflow)
        start.setHours(
            0,
            Math.round((GRID_START_HOUR + event.start) * 60),
            0,
            0
        );

        const end = new Date(start);
        end.setMinutes(end.getMinutes() + durationMinutes);

        lines.push(
            "BEGIN:VEVENT",
            "UID:" + randomUUID(),
            "DTSTAMP:" + dtstamp,
            "SUMMARY:" + escapeText(event.module + ": " + event.type),
            "LOCATION:" + escapeText(event.location),
            "DTSTART:" + formatDateTime(start),
            "DTEND:" + formatDateTime(end),
            "STATUS:CONFIRMED",
            "END:VEVENT"
        );
    }
}

lines.push("END:VCALENDAR");
const calendar = lines.map(fold).join("");

console.log(calendar);

function downloadURI(uri, name) {
    const link = document.createElement("a");

    link.download = name;
    link.href = uri;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

let regexs = [
    /[a-z A-Z]*[\/] Year [\d] /
];

let filename = "";

regexs.forEach(regex => {
    let program =
        document.getElementsByClassName(
            "header-3-0-5"
        );

    if (program.length > 0) {
        if (
            program[0].innerHTML.match(regex) != null
        ) {
            filename +=
                program[0].innerHTML.match(regex)[0];
        } else {
            filename =
                program[0].innerText;
        }
    } else {
        filename = "timetable";
    }
});

console.log("downloading");

downloadURI(
    "data:text/calendar;charset=utf8," +
    encodeURIComponent(calendar),
    filename + ".ics"
);

}

function injectSelector() {
document
.querySelector(".header-border-args")
.insertAdjacentHTML(
'afterend',
INJECTED_HELP
);

let grid =
    document.querySelector('.grid-border-args');

let mouseOver = false;
let highlightState = false;

document
    .querySelectorAll('.object-cell-border')
    .forEach(cell => {
        if (
            cell.children[0]
                .children[1]
                .children[0]
                .children[1]
                .innerText == "Lecture"
        ) {
            cell.classList.add(
                'selected-cell'
            );
        } else {
            cell.classList.add(
                'unselected-cell'
            );
        }

        const toggle = () => {
            cell.classList.toggle(
                'selected-cell'
            );

            cell.classList.toggle(
                'unselected-cell'
            );
        };

        cell.addEventListener(
            'mousedown',
            () => {
                toggle();

                mouseOver = true;

                highlightState =
                    cell.classList.contains(
                        'selected-cell'
                    );

                grid.style.userSelect = 'none';
            }
        );

        cell.addEventListener(
            'mouseover',
            () => {
                if (
                    mouseOver &&
                    highlightState !==
                    cell.classList.contains(
                        'selected-cell'
                    )
                ) {
                    toggle();
                }
            }
        );
    });

grid.addEventListener(
    'mouseup',
    () => {
        mouseOver = false;
        grid.style.userSelect = 'auto';
    }
);

}

console.log("export-ics.js loaded");

(async () => {
let timetable =
await browser.storage.local.get(
"timetable"
);

if (timetable.timetable) {
    document.documentElement.innerHTML =
        timetable.timetable;

    await browser.storage.local.remove(
        "timetable"
    );
}

injectSelector();

browser.runtime.onMessage.addListener(
    (message) => {
        if (message.command === "exportICS") {
            console.log("Exporting...");
            exportICS();
        } else {
            console.error(
                "Unknown command: " +
                message.command
            );
        }
    }
);

})();