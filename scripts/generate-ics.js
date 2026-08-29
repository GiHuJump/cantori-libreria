#!/usr/bin/env node
'use strict';

// Genera calendario.ics combinando il calendario liturgico calcolato (i
// prossimi 5 anni) con gli appuntamenti del coro in appuntamenti.json.
//
// Porta in JavaScript di lib/liturgical_calendar.dart del repo CantoriApp
// (l'algoritmo di Gauss/Meeus per la Pasqua e le feste mobili che ne
// derivano) — duplicata qui perché questa action gira in questo repo,
// senza dipendere dal pacchetto Dart dell'app. Se l'algoritmo cambia in
// CantoriApp, va aggiornato anche qui.

const fs = require('fs');
const path = require('path');

const YEARS_AHEAD = 5;

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/// La domenica della settimana di `date` (torna indietro fino a domenica
/// inclusa), come sundayOnOrAfter in liturgical_calendar.dart.
function sundayOnOrAfter(date) {
  const dow = date.getUTCDay(); // 0 = domenica
  return addDays(date, (7 - dow) % 7);
}

function firstSundayOfAdvent(civilYear) {
  const christmas = new Date(Date.UTC(civilYear, 11, 25));
  const dow = christmas.getUTCDay();
  const sundayOfChristmasWeek = addDays(christmas, -dow);
  return addDays(sundayOfChristmasWeek, -21);
}

function liturgicalCalendar(year) {
  const easter = easterSunday(year);
  const events = [
    { date: new Date(Date.UTC(year, 0, 1)), name: 'Maria Santissima Madre di Dio' },
    { date: new Date(Date.UTC(year, 0, 6)), name: 'Epifania del Signore' },
    {
      date: sundayOnOrAfter(new Date(Date.UTC(year, 0, 7))),
      name: 'Battesimo del Signore — fine del Tempo di Natale',
    },

    { date: addDays(easter, -46), name: 'Le Ceneri — inizio della Quaresima' },
    { date: addDays(easter, -7), name: 'Le Palme — inizio della Settimana Santa' },
    { date: addDays(easter, -3), name: 'Giovedì Santo' },
    { date: addDays(easter, -2), name: 'Venerdì Santo' },
    { date: addDays(easter, -1), name: 'Sabato Santo — Veglia Pasquale' },

    { date: easter, name: 'Pasqua di Resurrezione' },
    { date: sundayOnOrAfter(addDays(easter, 39)), name: 'Ascensione del Signore' },
    { date: addDays(easter, 49), name: 'Pentecoste — fine del Tempo di Pasqua' },

    { date: addDays(easter, 56), name: 'Santissima Trinità' },
    { date: sundayOnOrAfter(addDays(easter, 60)), name: 'Corpus Domini' },

    { date: new Date(Date.UTC(year, 2, 19)), name: 'San Giuseppe' },
    { date: new Date(Date.UTC(year, 2, 25)), name: 'Annunciazione del Signore' },
    { date: new Date(Date.UTC(year, 5, 24)), name: 'Natività di San Giovanni Battista' },
    { date: new Date(Date.UTC(year, 5, 29)), name: 'Santi Pietro e Paolo' },
    { date: new Date(Date.UTC(year, 7, 15)), name: 'Assunzione di Maria' },
    { date: new Date(Date.UTC(year, 10, 1)), name: 'Tutti i Santi' },
    { date: new Date(Date.UTC(year, 10, 2)), name: 'Commemorazione dei defunti' },
    { date: new Date(Date.UTC(year, 11, 8)), name: 'Immacolata Concezione' },
    { date: new Date(Date.UTC(year, 11, 25)), name: 'Natale del Signore' },

    {
      date: addDays(firstSundayOfAdvent(year), -7),
      name: 'Cristo Re — fine del Tempo Ordinario',
    },
    { date: firstSundayOfAdvent(year), name: 'I Domenica di Avvento' },
  ];
  events.sort((x, y) => x.date - y.date);
  return events;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function icsDate(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/// Timestamp UTC reale (con Z) — solo per DTSTAMP, che indica quando il
/// file è stato generato, non l'orario di un evento.
function icsUtcDateTime(date) {
  return `${icsDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/// Orario "locale fluttuante" (senza Z né TZID) per gli appuntamenti: ogni
/// calendario lo interpreta nel proprio fuso — corretto qui perché tutti
/// gli iscritti sono in Italia. I valori year/month/day/hour/minute in
/// `date` sono presi as-is (letti con i getter UTC di un Date costruito
/// con Date.UTC), senza nessuna reale conversione di fuso.
function icsFloatingDateTime(date) {
  return `${icsDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

function escapeText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

/// RFC 5545: le righe non dovrebbero superare i 75 ottetti; questa
/// funzione le spezza con un a-capo seguito da uno spazio (line folding).
function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out = [];
  let rest = line;
  let first = true;
  while (Buffer.byteLength(rest, 'utf8') > (first ? 75 : 74)) {
    let cut = first ? 75 : 74;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > (first ? 75 : 74)) cut--;
    out.push((first ? '' : ' ') + rest.slice(0, cut));
    rest = rest.slice(cut);
    first = false;
  }
  out.push(' ' + rest);
  return out.join('\r\n');
}

function vevent({ uid, dtstamp, dtstart, dtstartIsDate, summary, location }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsUtcDateTime(dtstamp)}`,
    dtstartIsDate
      ? `DTSTART;VALUE=DATE:${icsDate(dtstart)}`
      : `DTSTART:${icsFloatingDateTime(dtstart)}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push('END:VEVENT');
  return lines.map(foldLine).join('\r\n');
}

function main() {
  const now = new Date();
  const startYear = now.getUTCFullYear();
  const events = [];

  for (let y = startYear; y < startYear + YEARS_AHEAD; y++) {
    for (const e of liturgicalCalendar(y)) {
      events.push(
        vevent({
          uid: `liturgico-${icsDate(e.date)}-${e.name}@cantori-libreria`,
          dtstamp: now,
          dtstart: e.date,
          dtstartIsDate: true,
          summary: e.name,
        }),
      );
    }
  }

  const appuntamentiPath = path.join(__dirname, '..', 'appuntamenti.json');
  const appuntamenti = JSON.parse(fs.readFileSync(appuntamentiPath, 'utf8'));
  for (const a of appuntamenti) {
    const [year, month, day] = a.date.split('-').map(Number);
    let dtstart;
    let dtstartIsDate = false;
    if (a.time) {
      const [hour, minute] = a.time.split(':').map(Number);
      dtstart = new Date(Date.UTC(year, month - 1, day, hour, minute));
    } else {
      dtstart = new Date(Date.UTC(year, month - 1, day));
      dtstartIsDate = true;
    }
    events.push(
      vevent({
        uid: `appuntamento-${a.date}-${a.time || 'allday'}-${a.title}@cantori-libreria`,
        dtstamp: now,
        dtstart,
        dtstartIsDate,
        summary: a.title,
        location: a.location,
      }),
    );
  }

  // `events` contiene già blocchi multi-riga (ognuno "foldato" internamente
  // da vevent()): non vanno ripassati per foldLine, altrimenti l'intero
  // blocco verrebbe trattato come un'unica riga lunghissima e tagliato a
  // metà parola. Solo le righe singole di intestazione/chiusura del
  // VCALENDAR passano da foldLine (qui non ce n'è comunque bisogno, sono
  // sempre corte, ma resta corretto per coerenza).
  const header = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cantori Fornaciari//Calendario//IT', 'CALSCALE:GREGORIAN']
    .map(foldLine)
    .join('\r\n');
  const footer = foldLine('END:VCALENDAR');
  const ics = [header, ...events, footer].join('\r\n') + '\r\n';

  fs.writeFileSync(path.join(__dirname, '..', 'calendario.ics'), ics);
  console.log(`Generato calendario.ics con ${events.length} eventi.`);
}

main();
