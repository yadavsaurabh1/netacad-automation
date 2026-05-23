<!--
    netacad-automation
    Copyright (C) 2026 Saurabh Kumar Yadav

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

# netacad-automation

NetAcad course helper: answer databases, scrapers for ITExamAnswers.net, and the in-browser AutoRunner.

## Layout

```
netacad_automation/
├── data/                 # Compiled answer DBs (paste into console or bundle in extension)
│   ├── variables.js      # RAW_DB, QUIZ_DB, CHECKPOINT_DB, PRACTICE_EXAM_DB
│   └── variables_ccna3.js
├── runner/
│   ├── auto-runner.js    # Built bundle (paste into console)
│   └── src/              # AutoRunner source modules
├── scraper/              # Puppeteer scrapers → JSON in scraper/logs/
├── tools/
│   └── browser-probe.js  # NetAcad page fingerprint / script timeline probe
├── logs/                 # Output from browser-probe
└── extension/            # Chrome extension (see extension/README.md)
```

## Scrape answer data

Uses Brave/Chrome via `puppeteer-core` (set `EXECUTABLE_PATH` or `--executable`).

```bash
npm install
npm run scrape:cyu
npm run scrape:exam
npm run scrape:quiz
npm run scrape:practice
```

Scrape sessions are written under `scraper/logs/`. Merge into `data/variables.js` manually or with your own extract workflow.

## Run AutoRunner in the browser

1. Open a NetAcad course on **www.netacad.com** (top frame, not inside the iframe).
2. DevTools → Console.
3. Paste the contents of `data/variables.js` (or `data/variables_ccna3.js`).
4. Paste the contents of `runner/auto-runner.js` (run `npm run build:runner` after editing `runner/src/`).

## Chrome extension

```bash
npm run build:extension
```

Load the `extension/` folder as an unpacked extension in Chrome. See [extension/README.md](extension/README.md).


## Browser probe

```bash
npm run probe
```

Writes `logs/netacad-*.jsonl`, `logs/netacad-fingerprint-*.json`, etc.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
